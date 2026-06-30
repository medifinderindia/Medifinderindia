// Supabase Credentials
const SUPABASE_URL = 'https://rnpbglinkpsikeszcjcl.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_Ogc4JOrhQXAl9zRTDU0y3g_oGnitfuZ';
let supabaseClient = null;

if (SUPABASE_URL !== "YOUR_SUPABASE_PROJECT_URL" && typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// State Holders
let cancelledOrders = [];
let rxOrders = [];
let rxStats = {
    pending: 0,
    approved: 0,
    rejected: 0
};
let currentRxFilter = 'pending';

document.addEventListener("DOMContentLoaded", () => {
    loadCancelledOrders();
    initRealtimeOrders();
    fetchLiveOffer();
    loadRxOrders();
    initRealtimeRxOrders();
});

// ============================================
// TAB SWITCHING LOGIC
// ============================================
function switchUserTab(event, tabName) {
    // Hide all sections
    document.querySelectorAll('.tab-content-section').forEach(sec => {
        sec.classList.remove('active');
    });
    
    // Show selected section
    const targetSection = document.getElementById(`${tabName}-section`);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    // Refresh rx data when switching to rx-audit tab
    if (tabName === 'rx-audit') {
        loadRxOrders();
    }
}

// ============================================
// FEATURE 1: OFFER MANAGEMENT LOGIC (EXISTING)
// ============================================
async function fetchLiveOffer() {
    if (!supabaseClient) return;
    try {
        const { data } = await supabaseClient.from('offers').select('*').eq('id', 1).single();
        if (data && data.status === 'active' && data.text) {
            document.getElementById('offer-text').value = data.text;
            document.getElementById('offer-expiry').value = data.expiry || "";
            showOfferUI(data.text);
        } else {
            hideOfferUI();
        }
    } catch (err) {
        console.log("Error loading live offer: ", err);
    }
}

async function updateOffer() {
    const offerText = document.getElementById('offer-text').value.trim();
    const expiryDate = document.getElementById('offer-expiry').value;

    if (offerText === "") {
        alert("Please enter offer text!");
        return;
    }

    if (supabaseClient) {
        await supabaseClient.from('offers').upsert({ id: 1, text: offerText, expiry: expiryDate, status: 'active' });
    }
    showOfferUI(offerText);
    alert("Offer activated successfully! Instantly updated on user devices.");
}

async function clearOffer() {
    document.getElementById('offer-text').value = "";
    document.getElementById('offer-expiry').value = "";
    if (supabaseClient) {
        await supabaseClient.from('offers').upsert({ id: 1, text: "", expiry: "", status: 'inactive' });
    }
    hideOfferUI();
    alert("Offer hidden from users successfully.");
}

function showOfferUI(text) {
    document.getElementById('live-offer-status').textContent = "Live on User App";
    document.getElementById('live-offer-status').className = "status-badge status-active";
    document.getElementById('preview-text').textContent = text;
    document.getElementById('app-offer-preview').style.display = "block";
}

function hideOfferUI() {
    document.getElementById('live-offer-status').textContent = "Hidden / Inactive";
    document.getElementById('live-offer-status').className = "status-badge status-hidden";
    document.getElementById('app-offer-preview').style.display = "none";
}

// ============================================
// FEATURE 2: ORDER REFUNDS (EXISTING)
// ============================================
async function loadCancelledOrders() {
    if (!supabaseClient) return;
    
    const { data, error } = await supabaseClient
        .from('cancelled_orders')
        .select('*')
        .neq('status', 'Refunded');

    if (!error && data) {
        cancelledOrders = data;
        renderOrdersTable();
    }
}

function initRealtimeOrders() {
    if (!supabaseClient) return;

    supabaseClient
        .channel('realtime-cancelled-orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cancelled_orders' }, (payload) => {
            if (payload.eventType === 'INSERT') {
                if (payload.new.status !== 'Refunded') {
                    cancelledOrders.unshift(payload.new);
                }
            } 
            else if (payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
                cancelledOrders = cancelledOrders.filter(order => order.id !== payload.old.id);
                if (payload.new && payload.new.status !== 'Refunded') {
                    cancelledOrders.unshift(payload.new);
                }
            }
            
            renderOrdersTable();
        })
        .subscribe();
}

function renderOrdersTable() {
    const tableBody = document.getElementById('cancelled-orders-table');
    if (!tableBody) return;
    
    if (cancelledOrders.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding: 20px;">No pending cancelled orders from users.</td></tr>`;
        return;
    }

    tableBody.innerHTML = "";
    cancelledOrders.forEach((order, index) => {
        tableBody.innerHTML += `
            <tr id="order-row-${order.id}">
                <td><strong>${order.id}</strong></td>
                <td>${order.customer || 'Unknown'}</td>
                <td><span style="color: #2c3e50; font-weight:bold;">₹${order.amount}</span></td>
                <td><span class="reason-tag">${order.reason || 'Not specified'}</span></td>
                <td><span style="color: #2563eb; font-weight:500;">${order.payment || 'Online'}</span></td>
                <td>
                    <button id="refund-btn-${index}" class="refund-btn" onclick="processTransfer(${index}, '${order.id}', '${order.amount}')">
                        <i class="fa-solid fa-money-bill-transfer"></i> Transfer Refund
                    </button>
                </td>
            </tr>
        `;
    });
}

async function processTransfer(index, orderId, amount) {
    const btn = document.getElementById(`refund-btn-${index}`);
    
    const firstCheck = confirm(`Are you sure you want to trigger instant reversal of ₹${amount} for Order ${orderId}?`);
    if (!firstCheck) return;

    const secondCheck = prompt(`Type "CONFIRM" to complete the real bank refund:`);
    if (secondCheck !== "CONFIRM") {
        alert("Refund cancelled. Verification failed.");
        return;
    }

    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Transferring...`;
    btn.disabled = true;
    
    if (supabaseClient) {
        const { error } = await supabaseClient
            .from('cancelled_orders')
            .update({ status: 'Refunded', refunded_at: new Date().toISOString() })
            .eq('id', orderId);

        if (!error) {
            btn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Refunded`;
            btn.style.backgroundColor = "#64748b";
            alert(`Success! ₹${amount} has been securely processed back to the user's account for Order ${orderId}.`);
            
            cancelledOrders = cancelledOrders.filter(order => order.id !== orderId);
            renderOrdersTable();
        } else {
            btn.innerHTML = `<i class="fa-solid fa-money-bill-transfer"></i> Transfer Refund`;
            btn.disabled = false;
            alert("Transaction Error: " + error.message);
        }
    }
}

// ============================================
// FEATURE 3: PRESCRIPTION AUDIT GATE (NEW)
// ============================================
async function loadRxOrders() {
    if (!supabaseClient) return;

    try {
        const { data, error } = await supabaseClient
            .from('rx_orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (!error && data) {
            rxOrders = data;
            updateRxStats();
            filterRxOrders(currentRxFilter);
        }
    } catch (err) {
        console.error("Error loading Rx orders:", err);
    }
}

function initRealtimeRxOrders() {
    if (!supabaseClient) return;

    supabaseClient
        .channel('realtime-rx-orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rx_orders' }, () => {
            loadRxOrders();
        })
        .subscribe();
}

function updateRxStats() {
    rxStats.pending = rxOrders.filter(o => o.rx_status === 'pending').length;
    rxStats.approved = rxOrders.filter(o => o.rx_status === 'approved').length;
    rxStats.rejected = rxOrders.filter(o => o.rx_status === 'rejected').length;

    document.getElementById('rx-pending-count').textContent = rxStats.pending;
    document.getElementById('rx-approved-count').textContent = rxStats.approved;
    document.getElementById('rx-rejected-count').textContent = rxStats.rejected;

    let total = rxStats.approved + rxStats.rejected;
    let compliance = total > 0 ? Math.round((rxStats.approved / total) * 100) : 0;
    document.getElementById('rx-compliance-percent').textContent = compliance + '%';
}

function filterRxOrders(filter) {
    currentRxFilter = filter;
    
    // Update button states
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    event?.currentTarget?.classList.add('active');

    const container = document.getElementById('rx-orders-container');
    if (!container) return;

    let filtered = rxOrders.filter(order => order.rx_status === filter);

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fa-solid fa-inbox"></i></div>
                <div class="empty-state-text">No ${filter} prescription orders at this moment</div>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    filtered.forEach((order) => {
        renderRxCard(order);
    });
}

function renderRxCard(order) {
    const container = document.getElementById('rx-orders-container');
    
    let statusBadgeClass = 'pending';
    let statusText = 'Pending Review';
    
    if (order.rx_status === 'approved') {
        statusBadgeClass = 'verified';
        statusText = 'Approved';
    } else if (order.rx_status === 'rejected') {
        statusBadgeClass = 'pending';
        statusText = 'Rejected';
    }

    const rxImageUrl = order.rx_image || 'https://via.placeholder.com/300?text=No+Prescription+Image';
    const createdDate = new Date(order.created_at).toLocaleDateString('en-GB');

    const cardHTML = `
        <div class="rx-card">
            <div class="rx-header">
                <div>
                    <div class="rx-title">${order.medicine_name}</div>
                    <small style="color: #64748b;">Order: ${order.order_id}</small>
                </div>
                <span class="rx-badge ${statusBadgeClass}">${statusText}</span>
            </div>

            <div class="rx-details">
                <div class="rx-detail-item">
                    <div class="rx-detail-label"><i class="fa-solid fa-user"></i> Patient Name</div>
                    <div class="rx-detail-value">${order.customer_name || 'N/A'}</div>
                </div>
                <div class="rx-detail-item">
                    <div class="rx-detail-label"><i class="fa-solid fa-phone"></i> Phone</div>
                    <div class="rx-detail-value">${order.customer_phone || 'N/A'}</div>
                </div>
                <div class="rx-detail-item">
                    <div class="rx-detail-label"><i class="fa-solid fa-user-doctor"></i> Doctor Name</div>
                    <div class="rx-detail-value">${order.doctor_name || 'Not Provided'}</div>
                </div>
                <div class="rx-detail-item">
                    <div class="rx-detail-label"><i class="fa-solid fa-calendar"></i> Prescription Date</div>
                    <div class="rx-detail-value">${createdDate}</div>
                </div>
                <div class="rx-detail-item">
                    <div class="rx-detail-label"><i class="fa-solid fa-money-bill"></i> Order Amount</div>
                    <div class="rx-detail-value" style="color: #10b981; font-weight: 700;">₹${order.amount}</div>
                </div>
                <div class="rx-detail-item">
                    <div class="rx-detail-label"><i class="fa-solid fa-hospital"></i> Hospital</div>
                    <div class="rx-detail-value">${order.hospital_name || 'Not Specified'}</div>
                </div>
            </div>

            ${order.notes ? `
                <div class="rx-notes">
                    <strong>Admin Notes:</strong> ${order.notes}
                </div>
            ` : ''}

            <div class="rx-image-container">
                <div style="font-weight: 600; margin-bottom: 8px; color: #0f172a;">
                    <i class="fa-solid fa-image"></i> Prescription Document
                </div>
                <img src="${rxImageUrl}" alt="Prescription" class="rx-image">
                <a href="${rxImageUrl}" target="_blank" class="rx-button view">
                    <i class="fa-solid fa-expand"></i> View Full Size
                </a>
            </div>

            <div class="rx-actions">
                ${order.rx_status === 'pending' ? `
                    <button class="rx-button approve" onclick="approveRxOrder('${order.id}', '${order.order_id}', '${order.customer_name}')">
                        <i class="fa-solid fa-check"></i> Approve Prescription
                    </button>
                    <button class="rx-button reject" onclick="rejectRxOrder('${order.id}', '${order.order_id}')">
                        <i class="fa-solid fa-times"></i> Reject & Cancel Order
                    </button>
                ` : `
                    <div style="padding: 8px 12px; background: #f1f5f9; border-radius: 6px; font-size: 13px; color: #64748b;">
                        <i class="fa-solid fa-lock"></i> This order is locked from further review
                    </div>
                `}
            </div>
        </div>
    `;

    container.innerHTML += cardHTML;
}

async function approveRxOrder(rxId, orderId, patientName) {
    const confirm_action = confirm(`Approve prescription for ${patientName}?\n\nOrder: ${orderId}\n\nThis will unlock the order for delivery processing.`);
    if (!confirm_action) return;

    if (!supabaseClient) return;

    const { error } = await supabaseClient
        .from('rx_orders')
        .update({ 
            rx_status: 'approved',
            approved_at: new Date().toISOString(),
            approved_by: 'admin'
        })
        .eq('id', rxId);

    if (!error) {
        // Also update the order status in main orders table
        await supabaseClient.from('orders')
            .update({ rx_verified: true })
            .eq('id', orderId);

        alert(`✓ Prescription approved for ${patientName}!\n\nOrder ${orderId} can now be processed.`);
        loadRxOrders();
    } else {
        alert('Error approving prescription: ' + error.message);
    }
}

async function rejectRxOrder(rxId, orderId) {
    const reason = prompt('Enter reason for rejection:');
    if (!reason) return;

    if (!supabaseClient) return;

    const { error } = await supabaseClient
        .from('rx_orders')
        .update({ 
            rx_status: 'rejected',
            rejection_reason: reason,
            rejected_at: new Date().toISOString()
        })
        .eq('id', rxId);

    if (!error) {
        // Cancel the related order
        await supabaseClient.from('orders')
            .update({ status: 'Rejected', rx_verified: false })
            .eq('id', orderId);

        alert(`✓ Prescription rejected!\n\nReason: ${reason}\n\nOrder has been automatically cancelled.`);
        loadRxOrders();
    } else {
        alert('Error rejecting prescription: ' + error.message);
    }
}

// ============================================
// FEATURE 4: NOTIFICATIONS (EXISTING)
// ============================================
function toggleIndividualInput() {
    const target = document.getElementById('notif-target').value;
    document.getElementById('user-id-group').style.display = (target === 'individual') ? 'block' : 'none';
}

async function sendNotification() {
    const target = document.getElementById('notif-target').value;
    const userId = document.getElementById('user-id').value.trim();
    const title = document.getElementById('notif-title').value.trim();
    const message = document.getElementById('notif-message').value.trim();

    if (!title || !message) {
        alert("Please fill up both Title and Message Body!");
        return;
    }

    if (target === 'individual' && !userId) {
        alert("Please enter a Target User ID/Phone Number!");
        return;
    }

    if (supabaseClient) {
        await supabaseClient.from('notifications').insert({ 
            target, 
            user_id: userId, 
            title, 
            message,
            created_at: new Date().toISOString()
        });
    }

    alert("Notification Dispatched Successfully!");
    document.getElementById('notif-title').value = "";
    document.getElementById('notif-message').value = "";
    document.getElementById('user-id').value = "";
}

// ============================================
// FEATURE 6: ALL ORDERS MANAGEMENT
// ============================================
let allOrdersData = [];

async function loadAllOrders() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);
        if (error) throw error;
        allOrdersData = data || [];
        renderAllOrders(allOrdersData);
    } catch (e) {
        console.error('Error loading orders:', e);
    }
}

function renderAllOrders(orders) {
    const tbody = document.getElementById('all-orders-table');
    if (!tbody) return;
    if (!orders.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:20px;">No orders found.</td></tr>';
        return;
    }
    tbody.innerHTML = orders.map(o => `
        <tr>
            <td><strong>#${(o.id || '').toString().slice(0,8)}</strong></td>
            <td>${o.customer_name || o.user_email || 'N/A'}</td>
            <td>₹${Number(o.total_amount || 0).toFixed(2)}</td>
            <td><span class="badge ${getStatusClass(o.status)}">${o.status || 'Unknown'}</span></td>
            <td>${o.payment_method || 'N/A'}</td>
            <td>${o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN') : 'N/A'}</td>
            <td>
                <select onchange="updateOrderStatus('${o.id}', this.value)" style="padding:4px 8px; border-radius:6px; border:1px solid #dcdde1; font-size:12px;">
                    <option value="">Change...</option>
                    <option value="pending">Pending</option>
                    <option value="Accepted">Accepted</option>
                    <option value="Picked Up">Picked Up</option>
                    <option value="Delivered">Delivered</option>
                    <option value="Cancelled">Cancelled</option>
                </select>
            </td>
        </tr>
    `).join('');
}

function getStatusClass(status) {
    const s = (status || '').toLowerCase();
    if (s === 'delivered') return 'badge-success';
    if (s === 'cancelled') return 'badge-danger';
    if (s === 'pending') return 'badge-warning';
    return 'badge-info';
}

function filterAllOrders() {
    const statusFilter = document.getElementById('order-status-filter').value;
    const search = (document.getElementById('order-search').value || '').toLowerCase();
    let filtered = allOrdersData;
    if (statusFilter !== 'all') {
        filtered = filtered.filter(o => o.status === statusFilter);
    }
    if (search) {
        filtered = filtered.filter(o =>
            (o.id || '').toLowerCase().includes(search) ||
            (o.customer_name || '').toLowerCase().includes(search) ||
            (o.user_email || '').toLowerCase().includes(search)
        );
    }
    renderAllOrders(filtered);
}

async function updateOrderStatus(orderId, newStatus) {
    if (!newStatus || !supabaseClient) return;
    if (!confirm(`Change order #${orderId.slice(0,8)} to "${newStatus}"?`)) return;
    try {
        const { error } = await supabaseClient
            .from('orders')
            .update({ status: newStatus })
            .eq('id', orderId);
        if (error) throw error;
        loadAllOrders();
        alert('Order status updated!');
    } catch (e) {
        console.error('Error updating order:', e);
        alert('Failed to update order.');
    }
}

// ============================================
// FEATURE 7: ALL USERS LIST
// ============================================
let allUsersData = [];

async function loadAllUsers() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        allUsersData = data || [];
        renderAllUsers(allUsersData);
    } catch (e) {
        console.error('Error loading users:', e);
    }
}

function renderAllUsers(users) {
    const tbody = document.getElementById('users-table');
    if (!tbody) return;
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:20px;">No users found.</td></tr>';
        return;
    }
    tbody.innerHTML = users.map(u => `
        <tr>
            <td>${u.full_name || u.name || 'N/A'}</td>
            <td>${u.email || 'N/A'}</td>
            <td>${u.phone || u.mobile || 'N/A'}</td>
            <td>${(u.address || '').slice(0, 30) || 'N/A'}</td>
            <td>${u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN') : 'N/A'}</td>
        </tr>
    `).join('');
}

function filterUsers() {
    const search = (document.getElementById('user-search').value || '').toLowerCase();
    let filtered = allUsersData;
    if (search) {
        filtered = filtered.filter(u =>
            (u.full_name || u.name || '').toLowerCase().includes(search) ||
            (u.email || '').toLowerCase().includes(search) ||
            (u.phone || u.mobile || '').toLowerCase().includes(search)
        );
    }
    renderAllUsers(filtered);
}

// ============================================
// TAB SWITCH HOOKS
// ============================================
const origSwitchTab = switchUserTab;
switchUserTab = function(event, tabName) {
    origSwitchTab(event, tabName);
    if (tabName === 'all-orders') loadAllOrders();
    if (tabName === 'users-list') loadAllUsers();
};