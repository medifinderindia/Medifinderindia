// ================= SUPABASE CLIENT INITIALIZATION =================
// URL & key loaded from supabase-constants.js
const supabaseClient = (typeof supabase !== 'undefined' && typeof SUPABASE_URL !== 'undefined')
    ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;

// গ্লোবাল স্টেট হোল্ডার
let serviceZones = [];
let riderPayouts = [];
let riderKYC = [];
let riderBankRequests = []; // ✅ NEW: Bank & Payment verification requests

// ✅ small escaping helper used across the unified KYC/bank rows and notification history
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// ================= SHARED: GPS ↔ PIN/DISTRICT ZONE MATCHING =================
// Used by both the Fleet Map (rider "zone suspended" check) and the Network &
// Service Area Registry live counts (riders currently in a zone via GPS).
// Riders only store current_lat/current_lon, so we reverse-geocode via Nominatim
// (same service already used elsewhere in this codebase for merchants) and then
// match the returned postcode/district against the service_zones table (pin/dist).
async function resolveZoneForCoords(lat, lon) {
    if (!lat || !lon) return null;
    const cacheKey = `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
    if (geoZoneCache[cacheKey] !== undefined) return geoZoneCache[cacheKey];

    try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14`);
        const data = await resp.json();
        const addr = data && data.address ? data.address : {};
        const postcode = addr.postcode || '';
        const district = addr.county || addr.state_district || addr.city_district || '';

        let matchedZone = null;
        if (postcode) matchedZone = serviceZones.find(z => String(z.pin) === String(postcode));
        if (!matchedZone && district) {
            matchedZone = serviceZones.find(z => (z.dist || '').toLowerCase().includes(district.toLowerCase()) || district.toLowerCase().includes((z.dist || '').toLowerCase()));
        }

        const result = matchedZone
            ? { pin: matchedZone.pin, dist: matchedZone.dist, status: matchedZone.status }
            : (postcode || district ? { pin: postcode, dist: district, status: null } : null);

        geoZoneCache[cacheKey] = result;
        return result;
    } catch (e) {
        geoZoneCache[cacheKey] = null;
        return null;
    }
}

let currentRiderKycFilter = 'all';
let payoutLedger = [];
let activeRiders = [];
let liveMap = null;
let riderMarkers = {};
let mapTilesReady = false;

// ✅ NEW: notification broadcast history (Feature: Broadcast Alerts history + delete + date filter)
let notificationHistory = [];

// ✅ NEW: simple in-memory cache so we don't hammer the reverse-geocoding API
// for riders whose GPS position hasn't moved much since the last check.
const geoZoneCache = {};

// Real-time Analytics State
let analyticsData = {
    activeRiders: 0,
    activeMerchants: 0,
    totalOrders: 0,
    totalEarnings: 0,
    lastHourOrders: 0,
    lastHourEarnings: 0,
    avgDeliveryTime: 0,
    activeZones: 0,
    totalZones: 0
};
let prevAnalyticsData = null;

// App Initialization Setup
document.addEventListener("DOMContentLoaded", async () => {
    if (!supabaseClient) {
        return;
    }
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        showToast("Session expired. Please login again.", "error");
        localStorage.removeItem('merchantSessionActive');
        window.location.href = "index.html";
        return;
    }
    fetchInitialData();
    setupRealtimeSubscriptions();
    initializeLiveMap();
    startAnalyticsRefresh();
    loadPayoutLedger();
    updateOutageZoneSelector();
    loadNotificationHistory();
    handleHashChange();
});

// ================= TAB SWITCHING FUNCTIONALITY =================
function handleHashChange() {
    const hash = window.location.hash.substring(1);
    if (hash) {
        const targetTab = document.getElementById(`${hash}-tab`);
        if (targetTab) {
            switchToTab(hash);
        }
    }
}
window.addEventListener('hashchange', handleHashChange);

function switchToTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Show selected tab
    const targetTab = document.getElementById(`${tabName}-tab`);
    if (targetTab) {
        targetTab.classList.add('active');
        
        // Special handling for map tab
        if (tabName === 'fleet-tracking' && liveMap) {
            setTimeout(() => liveMap.invalidateSize(), 100);
        }
    }

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('onclick') && item.getAttribute('onclick').includes("'" + tabName + "'")) {
            item.classList.add('active');
        }
    });
}

// ================= INITIAL DATA FETCHING =================
async function fetchInitialData() {
    if (!supabaseClient) return;
    try {
        // ১. সার্ভিস জোন লোড
        let { data: zones } = await supabaseClient.from('service_zones').select('*').order('id', { ascending: false });
        if(zones) { serviceZones = zones; renderNetworkZones(); }

        // ২. পে-আউট ডাটা লোড
        let { data: payouts } = await supabaseClient.from('rider_payouts').select('*');
        if(payouts) { riderPayouts = payouts; renderPayouts(); }

        // ३. কেওয়াইসি ডাটা লোড (license, vehicle, PAN — rider_kyc টেবিলের সব কলাম)
        let { data: kyc } = await supabaseClient.from('rider_kyc').select('*');
        if(kyc) { riderKYC = kyc; }

        // ४. সক্রিয় রাইডার লোড
        let { data: riders } = await supabaseClient.from('riders').select('*').eq('duty_status', 'online');
        if(riders) { activeRiders = riders; updateFleetMap(); }

        // ৫. Bank & Payment ডাটা লোড (যাদের bank details সাবমিট করা আছে) — এখন KYC কার্ডের
        // সাথেই একই রো-তে merge হয়ে দেখানো হয় (renderKYC দেখুন)।
        let { data: bankRows } = await supabaseClient
            .from('riders')
            .select('id, email, full_name, bank_account, ifsc_code, upi_id, bank_verified, bank_rejection_reason');
        if (bankRows) { riderBankRequests = bankRows; }

        // ✅ একসাথে render — যাতে merge করা row-এ দুটো ডাটাসেটই available থাকে
        renderKYC();
    } catch (err) {
        showToast("Data Load Error: " + err.message, "error");
    }
}

// ================= REALTIME SUBSCRIPTIONS =================
function setupRealtimeSubscriptions() {
    if (!supabaseClient) return;
    supabaseClient.channel('custom-all-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'service_zones' }, () => {
        fetchInitialData();
        updateOutageZoneSelector();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_payouts' }, () => {
        fetchInitialData();
        loadPayoutLedger();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_kyc' }, () => {
        fetchInitialData();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'riders' }, () => {
        fetchInitialData(); // covers activeRiders + riderBankRequests refresh
        updateFleetMap();
    })
    // ✅ NEW: keep the Financial Settlement Ledger truly real-time (rider + merchant payouts)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payout_history' }, () => {
        loadPayoutLedger();
    })
    // ✅ NEW: keep orders live so the fleet map status colors (with-order / on-route) stay accurate
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        updateFleetMap();
    })
    // ✅ NEW: keep the Broadcast Alerts history list live
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_notifications' }, () => {
        loadNotificationHistory();
    })
    .subscribe();
}

// ================= FEATURE 1: LIVE FLEET GEOLOCATION HUB =================
// Legend colors kept in one place so the map markers always match the legend on screen.
const RIDER_STATUS_COLORS = {
    activeWithOrder: '#10b981', // Active Rider (With Order)
    idle: '#3b82f6',            // Idle Rider (No Active Order)
    onRoute: '#f97316',         // Rider on Route (picked up, en route to customer)
    zoneSuspended: '#ef4444'    // Zone Suspended
};

function initializeLiveMap() {
    const mapEl = document.getElementById('live-fleet-map');
    if (!mapEl) return;
    // Siliguri, West Bengal centered map
    liveMap = L.map('live-fleet-map', {
        center: [26.5200, 88.4250],
        zoom: 12,
        zoomControl: true,
        attributionControl: false,
        preferCanvas: true // faster rendering for many markers
    });

    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: 'OpenStreetMap',
        maxZoom: 19,
        updateWhenZooming: false, // smoother/faster panning-zooming on slower connections
        keepBuffer: 4
    });

    tileLayer.on('load', () => hideMapLoadingOverlay());
    tileLayer.addTo(liveMap);

    // Safety net: hide the loading overlay even if the tile 'load' event is slow to fire
    setTimeout(hideMapLoadingOverlay, 4000);

    updateFleetMap();
}

function hideMapLoadingOverlay() {
    if (mapTilesReady) return;
    mapTilesReady = true;
    const overlay = document.getElementById('mapLoadingOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.style.display = 'none'; }, 300);
    }
}

// Works out a rider's live marker color + label by cross-checking their current
// order (Active / On Route) and whether the zone they're currently sitting in
// (matched via reverse-geocoded PIN/district) is suspended.
async function resolveRiderMapStatus(rider, ordersByRider) {
    // 1) Zone suspended check — wins over everything else, same as the legend implies.
    const zoneInfo = await resolveZoneForCoords(rider.current_lat, rider.current_lon);
    if (zoneInfo && zoneInfo.status === 'suspended') {
        return { color: RIDER_STATUS_COLORS.zoneSuspended, label: 'Zone Suspended', zone: zoneInfo };
    }

    // 2) Order status check
    const order = ordersByRider[String(rider.id)];
    if (order) {
        if (order.status === 'picked_up' || order.status === 'out_for_delivery') {
            return { color: RIDER_STATUS_COLORS.onRoute, label: 'On Route', zone: zoneInfo };
        }
        return { color: RIDER_STATUS_COLORS.activeWithOrder, label: 'Active (With Order)', zone: zoneInfo };
    }

    // 3) Nothing going on — idle but online
    return { color: RIDER_STATUS_COLORS.idle, label: 'Idle (No Active Order)', zone: zoneInfo };
}

async function updateFleetMap() {
    if (!liveMap || !supabaseClient) return;
    try {
        // Fetch active riders with their current locations
        let { data: riders } = await supabaseClient
            .from('riders')
            .select('*')
            .eq('duty_status', 'online');

        if (!riders) riders = [];

        // Pull in-progress orders once, then map by rider_id so we don't do a query per rider.
        let ordersByRider = {};
        try {
            const { data: liveOrders } = await supabaseClient
                .from('orders')
                .select('rider_id, status')
                .not('rider_id', 'is', null)
                .not('status', 'in', '("delivered","cancelled")');
            (liveOrders || []).forEach(o => { if (o.rider_id) ordersByRider[String(o.rider_id)] = o; });
        } catch (e) { /* orders table might not support this filter shape everywhere — fail soft */ }

        const zoneFilterEl = document.getElementById('filter-zone-select');
        const zoneFilter = zoneFilterEl ? zoneFilterEl.value : '';

        // Resolve statuses in parallel, then draw — keeps the map feeling snappy.
        const ridersWithLocation = riders.filter(r => r.current_lat && r.current_lon);
        const resolved = await Promise.all(ridersWithLocation.map(async r => ({
            rider: r,
            status: await resolveRiderMapStatus(r, ordersByRider)
        })));

        // Clear existing markers only after we have the new data ready — avoids a blank flash.
        Object.values(riderMarkers).forEach(marker => marker.remove());
        riderMarkers = {};

        resolved.forEach(({ rider, status }) => {
            if (zoneFilter === 'approved' && status.zone && status.zone.status !== 'approved') return;
            if (zoneFilter === 'suspended' && (!status.zone || status.zone.status !== 'suspended')) return;

            const markerHTML = `
                <div style="
                    width: 30px;
                    height: 30px;
                    background: ${status.color};
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-weight: bold;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
                    border: 3px solid white;
                ">
                    <i class="fa-solid fa-motorcycle" style="font-size: 14px;"></i>
                </div>
            `;

            const marker = L.marker([rider.current_lat, rider.current_lon], {
                icon: L.divIcon({
                    html: markerHTML,
                    iconSize: [30, 30],
                    className: 'rider-marker'
                })
            }).addTo(liveMap);

            marker.bindPopup(`
                <div style="min-width: 200px; font-size: 12px;">
                    <strong>${rider.name || rider.email || 'N/A'}</strong><br>
                    ID: ${rider.id}<br>
                    Status: <span style="color:${status.color}; font-weight:700;">${status.label}</span><br>
                    ${status.zone ? `Zone: ${status.zone.pin || ''} ${status.zone.dist ? '(' + status.zone.dist + ')' : ''}<br>` : ''}
                    Contact: ${rider.phone || rider.email || 'N/A'}<br>
                </div>
            `);

            riderMarkers[rider.id] = marker;
        });

        hideMapLoadingOverlay();

        const mapUpdatedEl = document.getElementById('map-last-updated');
        if (mapUpdatedEl) mapUpdatedEl.textContent = new Date().toLocaleTimeString();
    } catch (e) {
        hideMapLoadingOverlay();
        showToast("Fleet map update error: " + (e.message || e), "error");
    }
}

function refreshFleetMap() {
    updateFleetMap();
    showToast('Fleet map refreshed with latest positions!', "info");
}

function filterFleetByZone() {
    // Re-draw with the newly selected zone filter applied
    updateFleetMap();
}

// ================= FEATURE 2: REAL-TIME ANALYTICS METRICS =================
function startAnalyticsRefresh() {
    if (!supabaseClient) return;
    // Update analytics every 60 seconds
    setInterval(updateLiveAnalytics, 60000);
    updateLiveAnalytics(); // Initial load
}

async function updateLiveAnalytics() {
    if (!supabaseClient) return;
    try {
        // Save previous snapshot for delta calculation
        prevAnalyticsData = { ...analyticsData };

        // Active Riders
        let { data: riders } = await supabaseClient.from('riders').select('id').eq('duty_status', 'online');
        analyticsData.activeRiders = riders ? riders.length : 0;

        // Active Merchants
        let { data: merchants } = await supabaseClient.from('merchants').select('id').eq('status', 'active');
        analyticsData.activeMerchants = merchants ? merchants.length : 0;

        // Total orders today
        let { data: orders } = await supabaseClient.from('orders').select('id')
            .gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString());
        analyticsData.totalOrders = orders ? orders.length : 0;

        // Delivered orders count
        let { data: deliveredData } = await supabaseClient.from('orders').select('id')
            .eq('status', 'delivered')
            .gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString());
        analyticsData.deliveredOrders = deliveredData ? deliveredData.length : 0;

        // Total earnings
        let { data: earnings } = await supabaseClient.from('rider_payouts').select('amount');
        analyticsData.totalEarnings = earnings ? earnings.reduce((sum, e) => sum + (e.amount || 0), 0) : 0;

        // Last hour metrics
        let lastHourTime = new Date(Date.now() - 3600000).toISOString();
        let { data: lastHourOrders } = await supabaseClient.from('orders').select('id')
            .gte('created_at', lastHourTime);
        analyticsData.lastHourOrders = lastHourOrders ? lastHourOrders.length : 0;

        // Active zones count
        let activeZoneCount = serviceZones.filter(z => z.status === 'approved').length;
        let totalZoneCount = serviceZones.length;
        analyticsData.activeZones = activeZoneCount;
        analyticsData.totalZones = totalZoneCount;

        // Avg delivery time from today's completed orders
        let { data: completedOrders } = await supabaseClient.from('orders')
            .select('created_at, updated_at')
            .not('updated_at', 'is', null)
            .gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString());
        if (completedOrders && completedOrders.length > 0) {
            let totalMinutes = completedOrders.reduce((sum, o) => {
                let diff = (new Date(o.updated_at) - new Date(o.created_at)) / 60000;
                return sum + (isNaN(diff) ? 0 : diff);
            }, 0);
            analyticsData.avgDeliveryTime = Math.round(totalMinutes / completedOrders.length);
        } else {
            analyticsData.avgDeliveryTime = 0;
        }

        // Render analytics
        renderAnalyticsCards();
    } catch (err) {
        showToast("Analytics update error: " + (err.message || err), "error");
    }
}

function renderAnalyticsCards() {
    const activeRidersCountEl = document.getElementById('active-riders-count');
    const activeRidersChangeEl = document.getElementById('active-riders-change');
    const activeMerchantsCountEl = document.getElementById('active-merchants-count');
    const activeMerchantsChangeEl = document.getElementById('active-merchants-change');
    const totalOrdersCountEl = document.getElementById('total-orders-count');
    const totalOrdersChangeEl = document.getElementById('total-orders-change');
    const totalEarningsCountEl = document.getElementById('total-earnings-count');
    const totalEarningsChangeEl = document.getElementById('total-earnings-change');

    // Active Riders
    if (activeRidersCountEl) activeRidersCountEl.textContent = analyticsData.activeRiders;
    if (activeRidersChangeEl) {
        if (prevAnalyticsData) {
            let riderDelta = analyticsData.activeRiders - prevAnalyticsData.activeRiders;
            activeRidersChangeEl.textContent = 
                (riderDelta >= 0 ? '↑' : '↓') + ` ${Math.abs(riderDelta)} from last refresh`;
        } else {
            activeRidersChangeEl.textContent = '—';
        }
    }

    // Active Merchants
    if (activeMerchantsCountEl) activeMerchantsCountEl.textContent = analyticsData.activeMerchants;
    if (activeMerchantsChangeEl) {
        if (prevAnalyticsData) {
            let merchantDelta = analyticsData.activeMerchants - prevAnalyticsData.activeMerchants;
            activeMerchantsChangeEl.textContent = 
                (merchantDelta >= 0 ? '↑' : '↓') + ` ${Math.abs(merchantDelta)} from last refresh`;
        } else {
            activeMerchantsChangeEl.textContent = '—';
        }
    }

    // Total Orders
    if (totalOrdersCountEl) totalOrdersCountEl.textContent = analyticsData.totalOrders;
    if (totalOrdersChangeEl) {
        if (prevAnalyticsData) {
            let orderDelta = analyticsData.totalOrders - prevAnalyticsData.totalOrders;
            totalOrdersChangeEl.textContent = 
                orderDelta > 0 ? `↑ +${orderDelta} since last refresh` : '— No new orders';
        } else {
            totalOrdersChangeEl.textContent = 
                `↑ +${analyticsData.lastHourOrders} in last hour`;
        }
    }

    // Total Earnings
    if (totalEarningsCountEl) totalEarningsCountEl.textContent = 
        '₹' + analyticsData.totalEarnings.toLocaleString('en-IN');
    if (totalEarningsChangeEl) {
        if (prevAnalyticsData) {
            let earningsDelta = analyticsData.totalEarnings - prevAnalyticsData.totalEarnings;
            totalEarningsChangeEl.textContent = 
                earningsDelta > 0 ? `↑ ₹${earningsDelta.toLocaleString('en-IN')} since last refresh` : '— No change';
        } else {
            let hourlyEarnings = Math.floor(analyticsData.totalEarnings / 24);
            totalEarningsChangeEl.textContent = 
                `↑ ₹${hourlyEarnings} est. this hour`;
        }
    }

    // Completion Rate
    let completionEl = document.getElementById('completion-rate');
    let completionSubEl = document.getElementById('completion-rate-sub');
        if (completionEl && analyticsData.totalOrders > 0) {
        let deliveredCount = analyticsData.deliveredOrders || analyticsData.totalOrders;
        let rate = Math.min(100, (deliveredCount / Math.max(analyticsData.totalOrders, 1)) * 100).toFixed(1);
        completionEl.textContent = rate + '%';
        if (completionSubEl) {
            if (prevAnalyticsData) {
                let rateDelta = (deliveredCount - (prevAnalyticsData.deliveredOrders || prevAnalyticsData.totalOrders || 0));
                completionSubEl.textContent = rateDelta > 0 ? `↑ +${rateDelta} delivered since last refresh` : '— No change';
            } else {
                completionSubEl.textContent = '— Delivery rate';
            }
        }
    }

    // Service Performance (Live)
    let avgTimeEl = document.getElementById('avg-delivery-time');
    let avgTimeSubEl = document.getElementById('avg-delivery-time-sub');
    if (avgTimeEl) {
        avgTimeEl.textContent = analyticsData.avgDeliveryTime > 0 ? `${analyticsData.avgDeliveryTime} min` : '— min';
        if (avgTimeSubEl) avgTimeSubEl.textContent = 'Based on today\'s deliveries';
    }

    let activeZonesEl = document.getElementById('active-zones');
    let activeZonesSubEl = document.getElementById('active-zones-sub');
    if (activeZonesEl) {
        let total = analyticsData.totalZones || 0;
        let active = analyticsData.activeZones || 0;
        activeZonesEl.textContent = total > 0 ? `${active} / ${total}` : '— / —';
        if (activeZonesSubEl) activeZonesSubEl.textContent = total - active > 0 ? `${total - active} zones under maintenance` : 'All zones active';
    }
}

// ================= FEATURE 3: FINANCIAL SETTLEMENT LEDGER & AUDIT TRAIL =================
async function loadPayoutLedger() {
    if (!supabaseClient) return;
    try {
        // ✅ FIXED: was filtered to type='Rider' only — now shows BOTH rider and
        // merchant payouts, matching the section's own subtitle ("...to riders and merchants").
        let { data: ledger } = await supabaseClient.from('payout_history')
            .select('*')
            .order('created_at', { ascending: false });

        if (ledger) {
            payoutLedger = ledger;
            renderPayoutLedger();
            updateLedgerStats();
        }
    } catch (err) {
        showToast("Payout ledger load error: " + (err.message || err), "error");
    }
}

function renderPayoutLedger() {
    const tbody = document.getElementById('ledger-table-body');
    if (!tbody) return;

    if (payoutLedger.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 30px;">No payout history available yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    payoutLedger.forEach((entry) => {
        const date = new Date(entry.created_at);
        const statusColor = entry.status === 'Completed' ? '#10b981' : '#f97316';
        
        tbody.innerHTML += `
            <tr>
                <td><strong>${entry.transaction_id || 'TXN-' + entry.id}</strong></td>
                <td>${entry.recipient_name || 'N/A'}</td>
                <td style="color: #0f172a; font-weight: 700;">₹${entry.amount}</td>
                <td><span style="font-size: 11px; background: #f1f5f9; padding: 3px 8px; border-radius: 3px;">${entry.type || 'Rider'}</span></td>
                <td>${entry.payment_method || 'Bank Transfer'}</td>
                <td><span style="color: ${statusColor}; font-weight: 600; font-size: 12px;">● ${entry.status}</span></td>
                <td><small>${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})}</small></td>
                <td><small style="font-family: monospace;">${entry.reference || 'N/A'}</small></td>
            </tr>
        `;
    });
}

function updateLedgerStats() {
    let totalPayouts = payoutLedger.length;
    let totalAmount = payoutLedger.reduce((sum, item) => sum + (item.amount || 0), 0);
    let avgPayout = totalPayouts > 0 ? Math.floor(totalAmount / totalPayouts) : 0;
    let pending = payoutLedger.filter(p => p.status !== 'Completed').length;

    const el1 = document.getElementById('ledger-total-payouts');
    const el2 = document.getElementById('ledger-total-amount');
    const el3 = document.getElementById('ledger-avg-payout');
    const el4 = document.getElementById('ledger-pending');
    if (el1) el1.textContent = totalPayouts;
    if (el2) el2.textContent = '₹' + totalAmount.toLocaleString('en-IN');
    if (el3) el3.textContent = '₹' + avgPayout.toLocaleString('en-IN');
    if (el4) el4.textContent = pending;
}

function filterLedgerByDate() {
    const dateEl = document.getElementById('ledger-date-filter');
    const date = dateEl ? dateEl.value : '';
    if (!date) {
        loadPayoutLedger();
        return;
    }
    
    const filtered = payoutLedger.filter(entry => {
        const entryDate = new Date(entry.created_at).toISOString().split('T')[0];
        return entryDate === date;
    });

    const tbody = document.getElementById('ledger-table-body');
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 30px;">No records for selected date.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach((entry) => {
        const dateObj = new Date(entry.created_at);
        const statusColor = entry.status === 'Completed' ? '#10b981' : '#f97316';
        
        tbody.innerHTML += `
            <tr>
                <td><strong>${entry.transaction_id || 'TXN-' + entry.id}</strong></td>
                <td>${entry.recipient_name || 'N/A'}</td>
                <td style="color: #0f172a; font-weight: 700;">₹${entry.amount}</td>
                <td><span style="font-size: 11px; background: #f1f5f9; padding: 3px 8px; border-radius: 3px;">${entry.type || 'Rider'}</span></td>
                <td>${entry.payment_method || 'Bank Transfer'}</td>
                <td><span style="color: ${statusColor}; font-weight: 600; font-size: 12px;">● ${entry.status}</span></td>
                <td><small>${dateObj.toLocaleDateString('en-GB')} ${dateObj.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})}</small></td>
                <td><small style="font-family: monospace;">${entry.reference || 'N/A'}</small></td>
            </tr>
        `;
    });
}

function exportLedgerCSV() {
    if (payoutLedger.length === 0) {
        showToast('No data to export', "info");
        return;
    }

    let csv = 'Transaction ID,Recipient,Amount,Type,Payment Method,Status,Date,Reference\n';
    
    payoutLedger.forEach(entry => {
        const date = new Date(entry.created_at).toLocaleDateString('en-GB');
        csv += `"${entry.transaction_id || 'TXN-' + entry.id}","${entry.recipient_name || 'N/A'}",${entry.amount},"${entry.type || 'Rider'}","${entry.payment_method || 'Bank Transfer'}","${entry.status}","${date}","${entry.reference || 'N/A'}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}

// ================= FEATURE 4: GLOBAL ZONE OUTAGE TRIGGER ENGINE =================
function updateOutageZoneSelector() {
    const select = document.getElementById('outage-pin-select');
    if (!select) return;

    select.innerHTML = '<option value="">-- Choose a PIN Code --</option>';
    serviceZones.forEach(zone => {
        select.innerHTML += `<option value="${zone.pin}">${zone.pin} - ${zone.dist}</option>`;
    });
}

async function triggerZoneOutage() {
    if (!supabaseClient) return;
    const pinEl = document.getElementById('outage-pin-select');
    const msgEl = document.getElementById('outage-message-input');
    const pin = pinEl ? pinEl.value : '';
    const message = msgEl ? msgEl.value.trim() : '';

    if (!pin) {
        showToast('Please select a PIN code to suspend', "error");
        return;
    }

    if (!message) {
        showToast('Please enter an outage message', "error");
        return;
    }

    showConfirmationModal(`Suspend service for PIN ${pin}?\n\nMessage: "${message}"\n\nThis will appear immediately in user app.`, async () => {
        try {
            // Update zone status
            await supabaseClient.from('service_zones')
                .update({ 
                    status: 'suspended',
                    outage_message: message,
                    outage_start: new Date().toISOString()
                })
                .eq('pin', pin);

            // Show outage banner
            showOutageAlert(message);

            // Clear form
            const outagePinEl = document.getElementById('outage-pin-select');
            const outageMsgEl = document.getElementById('outage-message-input');
            if (outagePinEl) outagePinEl.value = '';
            if (outageMsgEl) outageMsgEl.value = '';

            showToast(`Zone ${pin} suspended successfully! Users will see: "${message}"`, "success");
        } catch (err) {
            showToast('Error suspending zone: ' + err.message, "error");
        }
    });
}

async function resumeZoneService() {
    if (!supabaseClient) return;
    const pinEl = document.getElementById('outage-pin-select');
    const pin = pinEl ? pinEl.value : '';

    if (!pin) {
        showToast('Please select a PIN code to resume', "error");
        return;
    }

    showConfirmationModal(`Resume service for PIN ${pin}?`, async () => {
        try {
            await supabaseClient.from('service_zones')
                .update({ 
                    status: 'approved',
                    outage_message: null,
                    outage_start: null
                })
                .eq('pin', pin);

            clearOutageAlert();
            showToast(`Zone ${pin} service resumed!`, "success");
            const outagePinEl2 = document.getElementById('outage-pin-select');
            if (outagePinEl2) outagePinEl2.value = '';
        } catch (err) {
            showToast('Error resuming service: ' + err.message, "error");
        }
    });
}

function showOutageAlert(message) {
    const banner = document.getElementById('global-outage-banner');
    const messageDisplay = document.getElementById('outage-message-display');
    
    if (banner && messageDisplay) {
        messageDisplay.textContent = message;
        banner.classList.add('active');
    }
}

function clearOutageAlert() {
    const banner = document.getElementById('global-outage-banner');
    if (banner) {
        banner.classList.remove('active');
    }
}

// ================= NETWORK & SERVICE AREA REGISTRY =================
// ✅ FIXED: Riders / Merchants / Users columns were showing 0 because they read a
// static counter column instead of the real data. Now computed live:
//   • Users    → counted by the PIN code saved on their address (or GPS-checked pincode)
//   • Merchants→ counted by the PIN code saved on their shop location
//   • Riders   → counted by their live GPS position, reverse-geocoded to a PIN/district
async function computeZoneLiveCounts() {
    const counts = {}; // pin -> { riders: Set, merchants: 0, users: 0 }
    serviceZones.forEach(z => { counts[z.pin] = { riders: new Set(), merchants: 0, users: 0 }; });
    if (!supabaseClient) return counts;

    try {
        // Users — wherever their saved address pincode matches a launched zone
        const { data: addresses } = await supabaseClient.from('user_addresses').select('user_id, pincode');
        (addresses || []).forEach(a => {
            if (a.pincode && counts[a.pincode]) counts[a.pincode].users += 1;
        });
    } catch (e) { /* fail soft — table may not be reachable in some envs */ }

    try {
        // Merchants — wherever their saved shop location pincode is
        const { data: merchants } = await supabaseClient.from('merchants').select('id, pincode');
        (merchants || []).forEach(m => {
            if (m.pincode && counts[m.pincode]) counts[m.pincode].merchants += 1;
        });
    } catch (e) { /* fail soft */ }

    try {
        // Riders — wherever their live GPS currently places them (reverse-geocoded)
        const onlineWithGps = activeRiders.filter(r => r.current_lat && r.current_lon);
        await Promise.all(onlineWithGps.map(async r => {
            const zoneInfo = await resolveZoneForCoords(r.current_lat, r.current_lon);
            if (zoneInfo && zoneInfo.pin && counts[zoneInfo.pin]) counts[zoneInfo.pin].riders.add(r.id);
        }));
    } catch (e) { /* fail soft */ }

    return counts;
}

async function renderNetworkZones() {
    const tbody = document.getElementById('network-table-body');
    if(!tbody) return;

    if(serviceZones.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#94a3b8;">No Active Network Zones Found Live.</td></tr>`;
        return;
    }

    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#94a3b8; padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Calculating live rider / merchant / user counts...</td></tr>`;

    const liveCounts = await computeZoneLiveCounts();

    tbody.innerHTML = "";
    serviceZones.forEach((zone) => {
        let isAppr = zone.status === 'approved';
        let launchDate = zone.created_at ? new Date(zone.created_at).toLocaleDateString('en-GB') : 'Live';
        const zc = liveCounts[zone.pin] || { riders: new Set(), merchants: 0, users: 0 };
        const riderCount = zc.riders instanceof Set ? zc.riders.size : (zc.riders || 0);
        tbody.innerHTML += `
            <tr>
                <td><strong>${zone.pin}</strong><br><small style="color:#64748b;">${zone.state}</small></td>
                <td><small>${zone.dist} • ${zone.ps}<br>Corp: ${zone.muni}</small></td>
                <td>${launchDate}</td>
                <td><i class="fa-solid fa-person-biking" style="color:var(--medi-brand);"></i> <strong>${riderCount}</strong> Riders</td>
                <td><i class="fa-solid fa-store" style="color:var(--warning-orange);"></i> <strong>${zc.merchants}</strong> Shops</td>
                <td><i class="fa-solid fa-users" style="color:#e02020;"></i> <strong>${zc.users}</strong> Users</td>
                <td><span class="badge ${isAppr ? 'active' : 'suspended'}">${isAppr ? 'Live & Active' : 'Service Stopped'}</span></td>
                <td>
                    <button class="btn btn-small ${isAppr ? 'btn-danger' : 'btn-success'}" onclick="toggleZoneStatus('${zone.pin}', '${zone.status}')">
                        ${isAppr ? 'Stop Service' : 'Approve & Enable'}
                    </button>
                </td>
            </tr>
        `;
    });
}

async function addNewZone() {
    if (!supabaseClient) return;
    const pinEl = document.getElementById('net-pin');
    const distEl = document.getElementById('net-dist');
    const psEl = document.getElementById('net-ps');
    const muniEl = document.getElementById('net-muni');
    const stateEl = document.getElementById('net-state');
    let pin = pinEl ? pinEl.value.trim() : '';
    let dist = distEl ? distEl.value.trim() : '';
    let ps = psEl ? psEl.value.trim() : '';
    let muni = muniEl ? muniEl.value.trim() : '';
    let state = stateEl ? stateEl.value : '';

    if(!pin || !dist || !ps || !muni) { showToast("Please complete all geographic parameters!", "error"); return; }

    const { error } = await supabaseClient.from('service_zones').insert([
        { pin: pin, dist: dist, ps: ps, muni: muni, state: state, riders: 0, merchants: 0, users: 0, status: "approved" }
    ]);

    if(!error) {
        if (pinEl) pinEl.value = "";
        if (distEl) distEl.value = "";
        if (psEl) psEl.value = "";
        if (muniEl) muniEl.value = "";
        if (stateEl) stateEl.value = "";
        showToast(`Success! Area ${pin} added Live to Database.`, "success");
        fetchInitialData();
    } else {
        showToast("Error adding zone: " + error.message, "error");
    }
}

async function toggleZoneStatus(pin, currentStatus) {
    if (!supabaseClient) return;
    let nextStatus = currentStatus === 'approved' ? 'suspended' : 'approved';
    const { error } = await supabaseClient.from('service_zones').update({ status: nextStatus }).eq('pin', pin);
    if (!error) {
        showToast(`Zone ${pin} ${nextStatus === 'suspended' ? 'suspended' : 'reactivated'} successfully.`, "success");
        fetchInitialData();
    } else {
        showToast("Status update failed: " + error.message, "error");
    }
}

function simulateUserOrder() {
    const simPinEl = document.getElementById('sim-pin');
    let inputPin = simPinEl ? simPinEl.value.trim() : '';
    let output = document.getElementById('simulation-output');
    if(!output) return;
    output.style.display = "block";

    let matchedZone = serviceZones.find(z => z.pin === inputPin);

    if (matchedZone && matchedZone.status === 'approved') {
        output.className = "sim-result-holder sim-success";
        output.innerHTML = `<i class="fa-solid fa-circle-check"></i> Service Available in ${matchedZone.dist}!`;
    } else {
        output.className = "sim-result-holder sim-error";
        output.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Currently Unavailable on your location. Please choose other location.`;
    }
}

// ================= EXISTING PAYOUT SYSTEM (UNCHANGED) =================
function renderPayouts() {
    const tbody = document.getElementById('payout-table-body');
    if(!tbody) return;
    tbody.innerHTML = "";

    if(riderPayouts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No pending or complete payouts available.</td></tr>`;
        return;
    }

    riderPayouts.forEach((rider) => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${rider.name}</strong><br><small>ID: ${rider.id} | Ph: ${rider.contact}</small></td>
                <td><span class="badge active"><i class="fa-regular fa-clock"></i> ${rider.hours}</span></td>
                <td><span style="font-size:16px; font-weight:700; color:var(--success-green);">₹${rider.amount}</span></td>
                <td><small style="font-family:monospace; font-weight:bold; background:#f1f5f9; padding:4px 8px; border-radius:4px;">${rider.destination}</small></td>
                <td>
                    <button id="pay-rider-${rider.id}" class="btn btn-success btn-small" ${rider.paid ? 'disabled' : ''} onclick="processRiderPay('${rider.id}')">
                        ${rider.paid ? '<i class="fa-solid fa-circle-check"></i> Disbursed' : '<i class="fa-solid fa-wallet"></i> Pay Now'}
                    </button>
                </td>
            </tr>
        `;
    });
}

async function processRiderPay(riderId) {
    if (!supabaseClient) return;
    let rider = riderPayouts.find(r => String(r.id) === String(riderId));
    if(!rider) return;

    showConfirmationModal(`Confirm automated settlement of ₹${rider.amount} to ${rider.name}?`, async () => {
        let btn = document.getElementById(`pay-rider-${riderId}`);
        if(btn){
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;
            btn.disabled = true;
        }

        try {
            // Update payout status
            const { error } = await supabaseClient.from('rider_payouts').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', riderId);

            // Log to ledger
            if (!error) {
                await supabaseClient.from('payout_history').insert({
                    transaction_id: 'TXN-' + Date.now(),
                    recipient_name: rider.name,
                    amount: rider.amount,
                    type: 'Rider',
                    payment_method: rider.destination,
                    status: 'Completed',
                    reference: riderId
                });

                if (rider.rider_id) {
                    await supabaseClient.from('riders_wallet').insert({
                        rider_id: rider.rider_id,
                        order_id: 'PAYOUT-' + Date.now(),
                        amount_earned: rider.amount,
                        status: 'payout_processed',
                        created_at: new Date().toISOString()
                    });
                }

                if(btn) {
                    btn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Disbursed`;
                    btn.style.backgroundColor = "#64748b";
                }
                
                loadPayoutLedger();
                showToast(`₹${rider.amount} transferred to ${rider.name}`, "success");
            } else {
                showToast("Payout Update Error: " + error.message, "error");
                fetchInitialData();
            }
        } catch(err) {
            showToast("Error: " + err.message, "error");
            if(btn) {
                btn.innerHTML = `<i class="fa-solid fa-wallet"></i> Pay Now`;
                btn.disabled = false;
            }
        }
    });
}

// ================= EXISTING KYC SYSTEM (UNCHANGED) =================
function filterRiderKyc(filterVal) {
    currentRiderKycFilter = filterVal;
    
    const filterIds = ['all', 'pending', 'verified', 'rejected'];
    filterIds.forEach(id => {
        const btn = document.getElementById(`filter-kyc-${id}`);
        if (btn) {
            if (id === filterVal) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
    
    renderKYC();
}

// ================= UNIFIED RIDER VERIFICATION ROW (License + Vehicle + PAN + Bank) =================
// ✅ MERGED: previously the license/vehicle KYC and the Bank verification were two separate
// sections. Now each rider gets exactly ONE row: name + UID + approve/reject up top, then a
// strip of document boxes (License, Vehicle Plate, PAN, Bank) each showing an image (where
// applicable) with its number/value underneath.
function renderKYC() {
    const container = document.getElementById('kyc-container');
    if(!container) return;

    const placeholderImg = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

    const filteredKyc = riderKYC.filter(k => {
        const isVerified = k.verified;
        const isRejected = k.rejection_reason && !k.verified;
        const isPending = !isVerified && !isRejected;

        if (currentRiderKycFilter === 'pending') return isPending;
        if (currentRiderKycFilter === 'verified') return isVerified;
        if (currentRiderKycFilter === 'rejected') return isRejected;
        return true;
    });

    if(filteredKyc.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:#94a3b8; width:100%; padding:20px;">No Rider KYC applications found for category "${currentRiderKycFilter}".</p>`;
        return;
    }

    container.innerHTML = filteredKyc.map((kyc) => {
        const bank = riderBankRequests.find(b => String(b.id) === String(kyc.rider_id)) || {};

        const licenseImgSrc = kyc.license_img || placeholderImg;
        const plateImgSrc = kyc.plate_img || placeholderImg;
        const panImgSrc = kyc.pan_img || placeholderImg;

        const isVerified = kyc.verified;
        const isRejected = kyc.rejection_reason && !kyc.verified;

        let docStatusBadge = '';
        let docActionButtons = '';
        if (isVerified) {
            docStatusBadge = `<span class="badge active"><i class="fa-solid fa-shield-halved"></i> Verified Partner</span>`;
            docActionButtons = `<button class="btn btn-outline btn-small" style="background:#ef4444; color:#fff; border:none;" onclick="rejectRiderKYC('${kyc.id}')">Reject / Revoke</button>`;
        } else if (isRejected) {
            docStatusBadge = `<span class="badge suspended" title="${escapeHtml(kyc.rejection_reason)}"><i class="fa-solid fa-circle-xmark"></i> Rejected</span>`;
            docActionButtons = `<button class="btn btn-primary btn-small" onclick="approveRiderKYC('${kyc.id}')">Re-Approve</button>`;
        } else {
            docStatusBadge = `<span class="badge pending"><i class="fa-solid fa-hourglass-start"></i> Pending</span>`;
            docActionButtons = `
                <button class="btn btn-outline btn-small" style="background:#ef4444; color:#fff; border:none;" onclick="rejectRiderKYC('${kyc.id}')">Reject</button>
                <button class="btn btn-primary btn-small" onclick="approveRiderKYC('${kyc.id}')">Approve</button>
            `;
        }

        const bankVerified = bank.bank_verified === true;
        const bankRejected = bank.bank_verified === false && bank.bank_rejection_reason;
        let bankStatusBadge = '';
        let bankActionButtons = '';
        if (!bank.bank_account) {
            bankStatusBadge = `<span class="badge" style="background:#f1f5f9; color:#94a3b8;"><i class="fa-solid fa-ban"></i> Not Submitted</span>`;
        } else if (bankVerified) {
            bankStatusBadge = `<span class="badge active"><i class="fa-solid fa-shield-halved"></i> Bank Verified</span>`;
            bankActionButtons = `<button class="btn btn-outline btn-small" style="background:#ef4444; color:#fff; border:none;" onclick="rejectRiderBank('${bank.id}')">Revoke</button>`;
        } else if (bankRejected) {
            bankStatusBadge = `<span class="badge suspended" title="${escapeHtml(bank.bank_rejection_reason)}"><i class="fa-solid fa-circle-xmark"></i> Bank Rejected</span>`;
            bankActionButtons = `<button class="btn btn-primary btn-small" onclick="approveRiderBank('${bank.id}')">Re-Approve</button>`;
        } else {
            bankStatusBadge = `<span class="badge pending"><i class="fa-solid fa-hourglass-start"></i> Bank Pending</span>`;
            bankActionButtons = `
                <button class="btn btn-outline btn-small" style="background:#ef4444; color:#fff; border:none;" onclick="rejectRiderBank('${bank.id}')">Reject</button>
                <button class="btn btn-primary btn-small" onclick="approveRiderBank('${bank.id}')">Approve</button>
            `;
        }

        return `
        <div class="kyc-row">
            <div class="kyc-row-top">
                <div class="kyc-row-identity">
                    <h4>${escapeHtml(kyc.name || bank.full_name || 'Rider')}</h4>
                    <span class="kyc-uid">UID: ${kyc.rider_id || kyc.id}</span>
                </div>
                <div class="kyc-row-actions">
                    ${docStatusBadge}
                    ${docActionButtons}
                </div>
            </div>

            <div class="kyc-docs-strip">
                <div class="doc-box">
                    <div class="doc-label">Driving License</div>
                    <a href="${licenseImgSrc}" target="_blank"><img src="${licenseImgSrc}" alt="License"></a>
                    <div class="doc-value">${escapeHtml(kyc.license_no || '-')}</div>
                </div>
                <div class="doc-box">
                    <div class="doc-label">Vehicle Plate</div>
                    <a href="${plateImgSrc}" target="_blank"><img src="${plateImgSrc}" alt="Plate"></a>
                    <div class="doc-value">${escapeHtml(kyc.plate_no || '-')}</div>
                </div>
                <div class="doc-box">
                    <div class="doc-label">PAN Card</div>
                    <a href="${panImgSrc}" target="_blank"><img src="${panImgSrc}" alt="PAN"></a>
                    <div class="doc-value">${escapeHtml(kyc.pan_no || '-')}</div>
                </div>
                <div class="doc-box bank-box">
                    <div class="doc-label">Bank &amp; Payment</div>
                    <div class="doc-value small">A/C: ${escapeHtml(bank.bank_account || '-')}</div>
                    <div class="doc-value small">IFSC: ${escapeHtml(bank.ifsc_code || '-')}</div>
                    <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px; align-items:center;">
                        ${bankStatusBadge}
                        <div style="display:flex; gap:6px;">${bankActionButtons}</div>
                    </div>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

async function approveRiderKYC(riderId) {
    if (!supabaseClient) return;
    let kycTarget = riderKYC.find(k => k.id === riderId);
    if(!kycTarget) return;

    showConfirmationModal("Are the vehicle plates and driver identification valid?", async () => {
        const { error } = await supabaseClient.from('rider_kyc').update({ verified: true, rejection_reason: '' }).eq('id', riderId);
        
        if(!error) {
            if (kycTarget.rider_id) {
                await supabaseClient.from('riders').update({ is_verified: true }).eq('id', kycTarget.rider_id);
                await supabaseClient.from('rider_notifications').insert({
                    rider_id: kycTarget.rider_id,
                    title: 'KYC Approved',
                    message: 'Your KYC has been approved. You are now a verified rider.',
                    type: 'success',
                    is_read: false
                });
            }
            showToast(`KYC Approved for ${kycTarget.name}`, "success");
            fetchInitialData();
        } else {
            showToast("KYC Approval Failed: " + error.message, "error");
        }
    });
}

async function rejectRiderKYC(riderId) {
    if (!supabaseClient) return;
    let kycTarget = riderKYC.find(k => k.id === riderId);
    if(!kycTarget) return;

    const reason = await new Promise(resolve => {
        const m = document.createElement('div');
        m.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
        m.innerHTML = `<div style="background:#fff;border-radius:16px;padding:24px;width:90%;max-width:360px;text-align:center;">
            <h3 style="margin:0 0 12px;font-size:1rem;color:#2f3542;">Rider KYC Rejection Reason</h3>
            <input type="text" id="_pi" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:0.9rem;margin-bottom:14px;outline:none;" placeholder="Enter rejection reason (visible to rider)">
            <div style="display:flex;gap:10px;">
                <button onclick="this.closest('div[style]').remove()" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-weight:600;">Cancel</button>
                <button id="_po" style="flex:1;padding:10px;border:none;border-radius:8px;background:#e02020;color:#fff;cursor:pointer;font-weight:600;">OK</button>
            </div>
        </div>`;
        document.body.appendChild(m);
        m.querySelector('#_pi').focus();
        m.querySelector('#_po').onclick = () => { const v = m.querySelector('#_pi').value.trim(); m.remove(); resolve(v || null); };
        m.onclick = (e) => { if (e.target === m) { m.remove(); resolve(null); } };
    });
    if (!reason) return;

    const { error } = await supabaseClient.from('rider_kyc').update({ verified: false, rejection_reason: reason }).eq('id', riderId);
    
    if(!error) {
        if (kycTarget.rider_id) {
            await supabaseClient.from('riders').update({ is_verified: false }).eq('id', kycTarget.rider_id);
            await supabaseClient.from('rider_notifications').insert({
                rider_id: kycTarget.rider_id,
                title: 'KYC Rejected',
                message: 'Your KYC has been rejected. Reason: ' + reason,
                type: 'error',
                is_read: false
            });
        }
        showToast(`KYC Rejected for ${kycTarget.name}`, "info");
        fetchInitialData();
    } else {
        showToast("KYC Rejection Failed: " + error.message, "error");
    }
}

// ==========================================
// ✅ NEW BLOCK: Bank & Payment verification (mirrors the Vehicle/License KYC flow above).
// Wire these to buttons in your rider-detail view, e.g.:
//   onclick="approveRiderBank(${rider.id})"  /  onclick="rejectRiderBank(${rider.id})"
// ==========================================
async function approveRiderBank(riderId) {
    if (!supabaseClient) return;
    showConfirmationModal("Are the bank/UPI details valid for payout?", async () => {
        const { error } = await supabaseClient.from('riders').update({ bank_verified: true, bank_rejection_reason: '' }).eq('id', riderId);
        if (!error) {
            await supabaseClient.from('rider_notifications').insert({
                rider_id: riderId,
                title: 'Bank Details Approved',
                message: 'Your bank & payment details have been verified successfully.',
                type: 'success',
                is_read: false
            });
            showToast("Bank details approved", "success");
            fetchInitialData();
        } else {
            showToast("Bank approval failed: " + error.message, "error");
        }
    });
}

async function rejectRiderBank(riderId) {
    if (!supabaseClient) return;
    const reason = await new Promise(resolve => {
        const m = document.createElement('div');
        m.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
        m.innerHTML = `<div style="background:#fff;border-radius:16px;padding:24px;width:90%;max-width:360px;text-align:center;">
            <h3 style="margin:0 0 12px;font-size:1rem;color:#2f3542;">Bank Details Rejection Reason</h3>
            <input type="text" id="_bi" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:0.9rem;margin-bottom:14px;outline:none;" placeholder="Enter rejection reason (visible to rider)">
            <div style="display:flex;gap:10px;">
                <button onclick="this.closest('div[style]').remove()" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-weight:600;">Cancel</button>
                <button id="_bo" style="flex:1;padding:10px;border:none;border-radius:8px;background:#e02020;color:#fff;cursor:pointer;font-weight:600;">OK</button>
            </div>
        </div>`;
        document.body.appendChild(m);
        m.querySelector('#_bi').focus();
        m.querySelector('#_bo').onclick = () => { const v = m.querySelector('#_bi').value.trim(); m.remove(); resolve(v || null); };
        m.onclick = (e) => { if (e.target === m) { m.remove(); resolve(null); } };
    });
    if (!reason) return;

    const { error } = await supabaseClient.from('riders').update({ bank_verified: false, bank_rejection_reason: reason }).eq('id', riderId);
    if (!error) {
        await supabaseClient.from('rider_notifications').insert({
            rider_id: riderId,
            title: 'Bank Details Rejected',
            message: 'Your bank & payment details were rejected. Reason: ' + reason,
            type: 'error',
            is_read: false
        });
        showToast("Bank details rejected", "info");
        fetchInitialData();
    } else {
        showToast("Bank rejection failed: " + error.message, "error");
    }
}

// ================= EXISTING NOTIFICATIONS (UNCHANGED) =================
function toggleRiderInput() {
    const targetEl = document.getElementById('rider-target');
    const target = targetEl ? targetEl.value : '';
    const idGroup = document.getElementById('rider-id-group');
    if(idGroup) {
        idGroup.style.display = target === 'individual' ? 'block' : 'none';
    }
}

async function sendRiderNotification() {
    if (!supabaseClient) return;
    const targetEl = document.getElementById('rider-target');
    const riderIdEl = document.getElementById('rider-target-id');
    const titleEl = document.getElementById('rider-title');
    const msgEl = document.getElementById('rider-message');

    const target = targetEl ? targetEl.value : '';
    const riderId = riderIdEl ? riderIdEl.value : '';
    const title = titleEl ? titleEl.value.trim() : '';
    const msg = msgEl ? msgEl.value.trim() : '';

    if(!title || !msg) { showToast("Notification Subject and Message are required!", "error"); return; }
    if(target === 'individual' && !riderId) { showToast("Please specify the Rider Staff ID.", "error"); return; }

    try {
        const notifPayload = {
            title: title,
            message: msg,
            type: target === 'individual' ? 'individual' : 'broadcast',
            broadcast_to: target === 'individual' ? 'individual' : 'all',
            is_read: false,
            created_at: new Date().toISOString()
        };
        if (target === 'individual') {
            notifPayload.rider_id = riderId;
        }
        await supabaseClient.from('rider_notifications').insert([notifPayload]);
        loadNotificationHistory(); // ✅ refresh the history list right away
    } catch(e) {
        showToast("Notification send failed: " + (e.message || e), "error");
        return;
    }

    const statusBody = document.getElementById('status-popup-body');
    const statusTitle = document.getElementById('status-popup-title');
    if(statusTitle) statusTitle.innerText = "Push Notification Broadcasted!";
    
    if(statusBody) {
        statusBody.innerHTML = `
            <strong>Target Segment:</strong> ${target === 'all' ? 'All Active Drivers (Global Fleet)' : 'Individual Rider ID: ' + riderId}<br>
            <strong>Alert Title:</strong> ${title}<br>
            <strong>Live Message Payload:</strong> ${msg}<br><br>
            <span style="color: var(--medi-brand); font-weight: bold;">[Network Registry State]:</span> Dispatching complete via secure websocket stream.
        `;
    }
    
    showStatusPopup();
    
    const riderTitleEl = document.getElementById('rider-title');
    const riderMsgEl = document.getElementById('rider-message');
    const riderTargetIdEl = document.getElementById('rider-target-id');
    if (riderTitleEl) riderTitleEl.value = "";
    if (riderMsgEl) riderMsgEl.value = "";
    if (riderTargetIdEl) riderTargetIdEl.value = "";
}

// ================= FEATURE: BROADCAST ALERTS HISTORY (list + date filter + delete) =================
async function loadNotificationHistory() {
    if (!supabaseClient) return;
    try {
        const { data } = await supabaseClient
            .from('rider_notifications')
            .select('*')
            .in('type', ['broadcast', 'individual'])
            .order('created_at', { ascending: false })
            .limit(200);
        notificationHistory = data || [];
        renderNotificationHistory(notificationHistory);
    } catch (err) {
        showToast("Could not load alert history: " + (err.message || err), "error");
    }
}

function renderNotificationHistory(list) {
    const container = document.getElementById('noti-history-list');
    if (!container) return;

    if (!list || list.length === 0) {
        container.innerHTML = `<p style="text-align:center;color:#94a3b8;padding:20px;">No alerts sent yet.</p>`;
        return;
    }

    container.innerHTML = list.map(n => {
        const date = new Date(n.created_at);
        const targetLabel = n.rider_id ? `Rider ID: ${n.rider_id}` : 'All Active Riders';
        return `
            <div class="noti-history-item">
                <div style="flex:1; min-width:0;">
                    <div class="nh-title">${escapeHtml(n.title || 'Untitled Alert')}</div>
                    <div class="nh-msg">${escapeHtml(n.message || '')}</div>
                    <div class="nh-meta">${targetLabel} • ${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'})}</div>
                </div>
                <button class="nh-delete" title="Delete this alert" onclick="deleteNotificationHistoryItem('${n.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
    }).join('');
}

function filterNotificationHistory() {
    const dateEl = document.getElementById('noti-history-date-filter');
    const date = dateEl ? dateEl.value : '';
    if (!date) { renderNotificationHistory(notificationHistory); return; }

    const filtered = notificationHistory.filter(n => {
        const entryDate = new Date(n.created_at).toISOString().split('T')[0];
        return entryDate === date;
    });

    if (filtered.length === 0) {
        const container = document.getElementById('noti-history-list');
        if (container) container.innerHTML = `<p style="text-align:center;color:#94a3b8;padding:20px;">No alerts found for the selected date.</p>`;
        return;
    }
    renderNotificationHistory(filtered);
}

function clearNotificationHistoryFilter() {
    const dateEl = document.getElementById('noti-history-date-filter');
    if (dateEl) dateEl.value = '';
    renderNotificationHistory(notificationHistory);
}

async function deleteNotificationHistoryItem(id) {
    if (!supabaseClient) return;
    showConfirmationModal("Delete this alert from history? This cannot be undone.", async () => {
        const { error } = await supabaseClient.from('rider_notifications').delete().eq('id', id);
        if (!error) {
            notificationHistory = notificationHistory.filter(n => String(n.id) !== String(id));
            filterNotificationHistory();
            showToast("Alert deleted from history", "info");
        } else {
            showToast("Delete failed: " + error.message, "error");
        }
    });
}

// ================= STATUS POPUP HELPERS =================
function showStatusPopup() {
    const popup = document.getElementById('status-popup');
    if (popup) popup.style.display = 'flex';
}

function closeStatusPopup() {
    const popup = document.getElementById('status-popup');
    if (popup) popup.style.display = 'none';
}

// Default tab on load
window.addEventListener('load', () => {
    switchToTab('analytics');
});