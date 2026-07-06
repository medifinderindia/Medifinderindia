// ================= SUPABASE CLIENT INITIALIZATION =================
// URL & key loaded from supabase-constants.js
const supabaseClient = (typeof supabase !== 'undefined' && typeof SUPABASE_URL !== 'undefined')
    ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;

// গ্লোবাল স্টেট হোল্ডার
let serviceZones = [];
let riderPayouts = [];
let riderKYC = [];
let payoutLedger = [];
let activeRiders = [];
let liveMap = null;
let riderMarkers = {};

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
});

// ================= TAB SWITCHING FUNCTIONALITY =================
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

        // ३. কেওয়াইসি ডাটা লোড
        let { data: kyc } = await supabaseClient.from('rider_kyc').select('*');
        if(kyc) { riderKYC = kyc; renderKYC(); }

        // ४. সক্রিয় রাইডার লোড
        let { data: riders } = await supabaseClient.from('riders').select('*').eq('duty_status', 'online');
        if(riders) { activeRiders = riders; updateFleetMap(); }
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
        fetchInitialData();
    })
    .subscribe();
}

// ================= FEATURE 1: LIVE FLEET GEOLOCATION HUB =================
function initializeLiveMap() {
    const mapEl = document.getElementById('live-fleet-map');
    if (!mapEl) return;
    // Siliguri, West Bengal centered map
    liveMap = L.map('live-fleet-map', {
        center: [26.5200, 88.4250],
        zoom: 12,
        zoomControl: true,
        attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: 'OpenStreetMap',
        maxZoom: 19
    }).addTo(liveMap);

    updateFleetMap();
}

async function updateFleetMap() {
    if (!liveMap || !supabaseClient) return;
    try {
        // Clear existing markers
        Object.values(riderMarkers).forEach(marker => marker.remove());
        riderMarkers = {};

        // Fetch active riders with their current locations
        let { data: riders } = await supabaseClient
            .from('riders')
            .select('*')
            .eq('duty_status', 'online');

        if (!riders) return;

        riders.forEach(rider => {
            if (rider.current_lat && rider.current_lon) {
                let markerColor = '#3b82f6';
                const markerHTML = `
                    <div style="
                        width: 30px;
                        height: 30px;
                        background: ${markerColor};
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: bold;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
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
                        Status: ${rider.duty_status || 'Active'}<br>
                        Contact: ${rider.phone || rider.email || 'N/A'}<br>
                    </div>
                `);

                riderMarkers[rider.id] = marker;
            }
        });

        const mapUpdatedEl = document.getElementById('map-last-updated');
        if (mapUpdatedEl) mapUpdatedEl.textContent = new Date().toLocaleTimeString();
    } catch (e) {
        showToast("Fleet map update error: " + (e.message || e), "error");
    }
}

function refreshFleetMap() {
    updateFleetMap();
    showToast('Fleet map refreshed with latest positions!', "info");
}

function filterFleetByZone() {
    const filterEl = document.getElementById('filter-zone-select');
    const filterValue = filterEl ? filterEl.value : '';
    // Implementation would filter markers based on zone status
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
        let { data: ledger } = await supabaseClient.from('payout_history')
            .select('*')
            .eq('type', 'Rider')
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

// ================= EXISTING NETWORK ZONE CONTROL (UNCHANGED) =================
function renderNetworkZones() {
    const tbody = document.getElementById('network-table-body');
    if(!tbody) return;
    tbody.innerHTML = "";

    if(serviceZones.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#94a3b8;">No Active Network Zones Found Live.</td></tr>`;
        return;
    }

    serviceZones.forEach((zone) => {
        let isAppr = zone.status === 'approved';
        let launchDate = 'Live';
        tbody.innerHTML += `
            <tr>
                <td><strong>${zone.pin}</strong><br><small style="color:#64748b;">${zone.state}</small></td>
                <td><small>${zone.dist} • ${zone.ps}<br>Corp: ${zone.muni}</small></td>
                <td>${launchDate}</td>
                <td><i class="fa-solid fa-person-biking" style="color:var(--medi-brand);"></i> <strong>${zone.riders}</strong> Riders</td>
                <td><i class="fa-solid fa-store" style="color:var(--warning-orange);"></i> <strong>${zone.merchants}</strong> Shops</td>
                <td><i class="fa-solid fa-users" style="color:#e02020;"></i> <strong>${zone.users}</strong> Users</td>
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
function renderKYC() {
    const container = document.getElementById('kyc-container');
    if(!container) return;
    container.innerHTML = "";

    if(riderKYC.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:#94a3b8; width:100%;">No Rider KYC applications available live.</p>`;
        return;
    }

    riderKYC.forEach((kyc) => {
        let licenseImgSrc = kyc.license_img ? kyc.license_img : 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        let plateImgSrc = kyc.plate_img ? kyc.plate_img : 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

        container.innerHTML += `
            <div class="kyc-card">
                <div>
                    <h4 style="color:var(--dark-bg); font-size:18px; margin-bottom:8px;">${kyc.name}</h4>
                    <p style="font-size:13px; margin-bottom:4px;"><strong>Staff ID:</strong> ${kyc.id}</p>
                    <p style="font-size:13px; margin-bottom:4px;"><strong>License No:</strong> ${kyc.license_no}</p>
                    <p style="font-size:13px; margin-bottom:12px;"><strong>Number Plate:</strong> ${kyc.plate_no}</p>
                    <div>
                        ${kyc.verified ? 
                            `<span class="badge active" style="font-size:12px; padding:6px 12px;"><i class="fa-solid fa-shield-halved"></i> VERIFIED PARTNER</span>` : 
                            `<span class="badge pending" style="font-size:12px; padding:6px 12px; margin-right:10px;"><i class="fa-solid fa-hourglass-start"></i> STATUS: PENDING Approval</span>
                             <button class="btn btn-primary btn-small" style="margin-top:10px;" onclick="approveRiderKYC('${kyc.id}')">Approve Documents</button>`
                        }
                    </div>
                </div>
                <div class="doc-box">
                    <p style="font-size:11px; font-weight:600; color:#475569;">Driving License Image</p>
                    <img src="${licenseImgSrc}" alt="License Doc" style="max-width: 100%; border-radius: 4px;">
                </div>
                <div class="doc-box">
                    <p style="font-size:11px; font-weight:600; color:#475569;">Vehicle Plate Image</p>
                    <img src="${plateImgSrc}" alt="Plate Doc" style="max-width: 100%; border-radius: 4px;">
                </div>
            </div>
        `;
    });
}

async function approveRiderKYC(riderId) {
    if (!supabaseClient) return;
    let kycTarget = riderKYC.find(k => k.id === riderId);
    if(!kycTarget) return;

    showConfirmationModal("Are the vehicle plates and driver identification valid?", async () => {
        const { error } = await supabaseClient.from('rider_kyc').update({ verified: true }).eq('id', riderId);
        
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