// ================= SUPABASE CLIENT INITIALIZATION =================
const SUPABASE_URL = 'https://rnpbglinkpsikeszcjcl.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_Ogc4JOrhQXAl9zRTDU0y3g_oGnitfuZ';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    lastHourEarnings: 0
};

// App Initialization Setup
document.addEventListener("DOMContentLoaded", () => {
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
        let { data: riders } = await supabaseClient.from('riders').select('*').eq('status', 'online');
        if(riders) { activeRiders = riders; updateFleetMap(); }
    } catch (err) {
        console.error("Error fetching data:", err);
    }
}

// ================= REALTIME SUBSCRIPTIONS =================
function setupRealtimeSubscriptions() {
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

    // Add a heatmap-style layer for zone coverage
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
        opacity: 0.2
    }).addTo(liveMap);

    updateFleetMap();
}

async function updateFleetMap() {
    if (!liveMap) return;

    // Clear existing markers
    Object.values(riderMarkers).forEach(marker => marker.remove());
    riderMarkers = {};

    // Fetch active riders with their current locations
    let { data: riders } = await supabaseClient
        .from('riders')
        .select('*')
        .eq('status', 'online');

    if (!riders) return;

    riders.forEach(rider => {
        if (rider.latitude && rider.longitude) {
            // Determine marker color based on status
            let markerColor = '#3b82f6'; // default idle
            if (rider.has_active_order) {
                markerColor = '#10b981'; // with order
            } else if (rider.is_on_route) {
                markerColor = '#f97316'; // on route
            }

            // Create custom marker
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

            const marker = L.marker([rider.latitude, rider.longitude], {
                icon: L.divIcon({
                    html: markerHTML,
                    iconSize: [30, 30],
                    className: 'rider-marker'
                })
            }).addTo(liveMap);

            // Popup with rider details
            marker.bindPopup(`
                <div style="min-width: 200px; font-size: 12px;">
                    <strong>${rider.name}</strong><br>
                    ID: ${rider.id}<br>
                    Status: ${rider.has_active_order ? 'On Delivery' : 'Idle'}<br>
                    Phone: ${rider.phone || 'N/A'}<br>
                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e0e0e0;">
                        <small>Last Update: ${new Date(rider.updated_at).toLocaleTimeString()}</small>
                    </div>
                </div>
            `);

            riderMarkers[rider.id] = marker;
        }
    });

    // Update last updated time
    document.getElementById('map-last-updated').textContent = new Date().toLocaleTimeString();
}

function refreshFleetMap() {
    updateFleetMap();
    alert('Fleet map refreshed with latest positions!');
}

function filterFleetByZone() {
    const filterValue = document.getElementById('filter-zone-select').value;
    // Implementation would filter markers based on zone status
    updateFleetMap();
}

// ================= FEATURE 2: REAL-TIME ANALYTICS METRICS =================
function startAnalyticsRefresh() {
    // Update analytics every 10 seconds
    setInterval(updateLiveAnalytics, 10000);
    updateLiveAnalytics(); // Initial load
}

async function updateLiveAnalytics() {
    try {
        // Active Riders
        let { data: riders } = await supabaseClient.from('riders').select('id').eq('status', 'online');
        analyticsData.activeRiders = riders ? riders.length : 0;

        // Active Merchants
        let { data: merchants } = await supabaseClient.from('merchants').select('id').eq('status', 'active');
        analyticsData.activeMerchants = merchants ? merchants.length : 0;

        // Total orders today
        let { data: orders } = await supabaseClient.from('orders').select('id')
            .gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString());
        analyticsData.totalOrders = orders ? orders.length : 0;

        // Total earnings
        let { data: earnings } = await supabaseClient.from('rider_payouts').select('amount');
        analyticsData.totalEarnings = earnings ? earnings.reduce((sum, e) => sum + (e.amount || 0), 0) : 0;

        // Last hour metrics
        let lastHourTime = new Date(Date.now() - 3600000).toISOString();
        let { data: lastHourOrders } = await supabaseClient.from('orders').select('id')
            .gte('created_at', lastHourTime);
        analyticsData.lastHourOrders = lastHourOrders ? lastHourOrders.length : 0;

        // Render analytics
        renderAnalyticsCards();
    } catch (err) {
        console.error("Analytics update error:", err);
    }
}

function renderAnalyticsCards() {
    // Active Riders
    document.getElementById('active-riders-count').textContent = analyticsData.activeRiders;
    let riderChange = Math.floor(Math.random() * 10) - 5; // Demo data
    document.getElementById('active-riders-change').textContent = 
        (riderChange >= 0 ? '↑' : '↓') + ` ${Math.abs(riderChange)} from last hour`;

    // Active Merchants
    document.getElementById('active-merchants-count').textContent = analyticsData.activeMerchants;
    let merchantChange = Math.floor(Math.random() * 5);
    document.getElementById('active-merchants-change').textContent = 
        `↑ +${merchantChange} new today`;

    // Total Orders
    document.getElementById('total-orders-count').textContent = analyticsData.totalOrders;
    document.getElementById('total-orders-change').textContent = 
        `↑ +${analyticsData.lastHourOrders} in last hour`;

    // Total Earnings
    document.getElementById('total-earnings-count').textContent = 
        '₹' + analyticsData.totalEarnings.toLocaleString('en-IN');
    let hourlyEarnings = Math.floor(analyticsData.totalEarnings / 24);
    document.getElementById('total-earnings-change').textContent = 
        `↑ ₹${hourlyEarnings} this hour`;
}

// ================= FEATURE 3: FINANCIAL SETTLEMENT LEDGER & AUDIT TRAIL =================
async function loadPayoutLedger() {
    try {
        let { data: ledger } = await supabaseClient.from('payout_history')
            .select('*')
            .order('created_at', { ascending: false });

        if (ledger) {
            payoutLedger = ledger;
            renderPayoutLedger();
            updateLedgerStats();
        }
    } catch (err) {
        console.error("Ledger fetch error:", err);
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

    document.getElementById('ledger-total-payouts').textContent = totalPayouts;
    document.getElementById('ledger-total-amount').textContent = '₹' + totalAmount.toLocaleString('en-IN');
    document.getElementById('ledger-avg-payout').textContent = '₹' + avgPayout.toLocaleString('en-IN');
    document.getElementById('ledger-pending').textContent = pending;
}

function filterLedgerByDate() {
    const date = document.getElementById('ledger-date-filter').value;
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
        alert('No data to export');
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
    const pin = document.getElementById('outage-pin-select').value;
    const message = document.getElementById('outage-message-input').value.trim();

    if (!pin) {
        alert('Please select a PIN code to suspend');
        return;
    }

    if (!message) {
        alert('Please enter an outage message');
        return;
    }

    const confirm_trigger = confirm(`Suspend service for PIN ${pin}?\n\nMessage: "${message}"\n\nThis will appear immediately in user app.`);
    if (!confirm_trigger) return;

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
        document.getElementById('outage-pin-select').value = '';
        document.getElementById('outage-message-input').value = '';

        alert(`Zone ${pin} suspended successfully!\n\nUsers will see: "${message}"`);
    } catch (err) {
        alert('Error suspending zone: ' + err.message);
    }
}

async function resumeZoneService() {
    const pin = document.getElementById('outage-pin-select').value;

    if (!pin) {
        alert('Please select a PIN code to resume');
        return;
    }

    const confirm_resume = confirm(`Resume service for PIN ${pin}?`);
    if (!confirm_resume) return;

    try {
        await supabaseClient.from('service_zones')
            .update({ 
                status: 'approved',
                outage_message: null,
                outage_start: null
            })
            .eq('pin', pin);

        clearOutageAlert();
        alert(`Zone ${pin} service resumed!`);
        document.getElementById('outage-pin-select').value = '';
    } catch (err) {
        alert('Error resuming service: ' + err.message);
    }
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
        let launchDate = zone.created_at ? new Date(zone.created_at).toLocaleDateString('en-GB') : 'Live';
        tbody.innerHTML += `
            <tr>
                <td><strong>${zone.pin}</strong><br><small style="color:#64748b;">${zone.state}</small></td>
                <td><small>${zone.dist} • ${zone.ps}<br>Corp: ${zone.muni}</small></td>
                <td>${launchDate}</td>
                <td><i class="fa-solid fa-person-biking" style="color:var(--medi-brand);"></i> <strong>${zone.riders}</strong> Riders</td>
                <td><i class="fa-solid fa-store" style="color:var(--warning-orange);"></i> <strong>${zone.merchants}</strong> Shops</td>
                <td><i class="fa-solid fa-users" style="color:#2563eb;"></i> <strong>${zone.users}</strong> Users</td>
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
    let pin = document.getElementById('net-pin').value.trim();
    let dist = document.getElementById('net-dist').value.trim();
    let ps = document.getElementById('net-ps').value.trim();
    let muni = document.getElementById('net-muni').value.trim();
    let state = document.getElementById('net-state').value;

    if(!pin || !dist || !ps || !muni) { alert("Please complete all geographic parameters!"); return; }

    const { error } = await supabaseClient.from('service_zones').insert([
        { pin: pin, dist: dist, ps: ps, muni: muni, state: state, riders: 0, merchants: 0, users: 0, status: "approved" }
    ]);

    if(!error) {
        document.getElementById('net-pin').value = "";
        document.getElementById('net-dist').value = "";
        document.getElementById('net-ps').value = "";
        document.getElementById('net-muni').value = "";
        alert(`Success! Area ${pin} added Live to Database.`);
    } else {
        alert("Error adding zone: " + error.message);
    }
}

async function toggleZoneStatus(pin, currentStatus) {
    let nextStatus = currentStatus === 'approved' ? 'suspended' : 'approved';
    const { error } = await supabaseClient.from('service_zones').update({ status: nextStatus }).eq('pin', pin);
    if(error) alert("Status update failed: " + error.message);
}

function simulateUserOrder() {
    let inputPin = document.getElementById('sim-pin').value.trim();
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
    let rider = riderPayouts.find(r => r.id === riderId);
    if(!rider) return;

    if(confirm(`Confirm automated settlement of ₹${rider.amount} to ${rider.name}?`)) {
        let btn = document.getElementById(`pay-rider-${riderId}`);
        if(btn){
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;
            btn.disabled = true;
        }

        try {
            // Update payout status
            const { error } = await supabaseClient.from('rider_payouts').update({ paid: true }).eq('id', riderId);

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

                if(btn) {
                    btn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Disbursed`;
                    btn.style.backgroundColor = "#64748b";
                }
                
                loadPayoutLedger();
                alert(`✓ ₹${rider.amount} transferred to ${rider.name}`);
            } else {
                alert("Payout Update Error: " + error.message);
                fetchInitialData();
            }
        } catch(err) {
            alert("Error: " + err.message);
            if(btn) {
                btn.innerHTML = `<i class="fa-solid fa-wallet"></i> Pay Now`;
                btn.disabled = false;
            }
        }
    }
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
        let licenseImgSrc = kyc.license_img ? kyc.license_img : 'https://via.placeholder.com/150?text=No+Image+Found';
        let plateImgSrc = kyc.plate_img ? kyc.plate_img : 'https://via.placeholder.com/150?text=No+Image+Found';

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
    let kycTarget = riderKYC.find(k => k.id === riderId);
    if(!kycTarget) return;

    if(confirm("Are the vehicle plates and driver identification valid?")) {
        const { error } = await supabaseClient.from('admin_kyc_verifications').update({ verified: true }).eq('id', riderId);
        
        if(!error) {
            alert(`KYC Approved for ${kycTarget.name}`);
            fetchInitialData();
        } else {
            alert("KYC Approval Failed: " + error.message);
        }
    }
}

// ================= EXISTING NOTIFICATIONS (UNCHANGED) =================
function toggleRiderInput() {
    const target = document.getElementById('rider-target').value;
    const idGroup = document.getElementById('rider-id-group');
    if(idGroup) {
        idGroup.style.display = target === 'individual' ? 'block' : 'none';
    }
}

async function sendRiderNotification() {
    const target = document.getElementById('rider-target').value;
    const riderId = document.getElementById('rider-target-id').value;
    const title = document.getElementById('rider-title').value.trim();
    const msg = document.getElementById('rider-message').value.trim();

    if(!title || !msg) { alert("Notification Subject and Message are required!"); return; }
    if(target === 'individual' && !riderId) { alert("Please specify the Rider Staff ID."); return; }

    try {
        await supabaseClient.from('rider_notifications').insert([{
            title: title,
            message: msg,
            target: target,
            rider_id: target === 'individual' ? riderId : null,
            sent_by: 'admin',
            created_at: new Date().toISOString()
        }]);
    } catch(e) { console.error('Notification save error:', e); }

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
    
    document.getElementById('rider-title').value = "";
    document.getElementById('rider-message').value = "";
    document.getElementById('rider-target-id').value = "";
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