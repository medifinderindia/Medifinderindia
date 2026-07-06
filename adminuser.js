// Supabase Credentials (loaded from supabase-constants.js)
let supabaseClient = null;

if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

function esc(str) { return String(str || '').replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// State Holders
let cancelledOrders = [];
let rxOrders = [];
let rxStats = {
    pending: 0,
    approved: 0,
    rejected: 0
};
let currentRxFilter = 'pending';

document.addEventListener("DOMContentLoaded", async () => {
    if (!supabaseClient) return;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        showToast("Session expired. Please login again.", "error");
        return;
    }
    loadCancelledOrders();
    initRealtimeOrders();
    fetchLiveOffer();
    loadRxOrders();
    initRealtimeRxOrders();
    loadAllOrders();
    loadAllUsers();
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
            const offerTextEl = document.getElementById('offer-text');
            const offerExpiryEl = document.getElementById('offer-expiry');
            if (offerTextEl) offerTextEl.value = data.text;
            if (offerExpiryEl) offerExpiryEl.value = data.expiry || "";
            showOfferUI(data.text);
        } else {
            hideOfferUI();
        }
    } catch (err) {
        showToast("Offer Load Error: " + (err.message || err), "error");
    }
}

async function updateOffer() {
    const offerTextEl = document.getElementById('offer-text');
    const offerExpiryEl = document.getElementById('offer-expiry');
    const offerText = offerTextEl ? offerTextEl.value.trim() : "";
    const expiryDate = offerExpiryEl ? offerExpiryEl.value : "";

    if (offerText === "") {
        showToast("Please enter offer text!", "error");
        return;
    }

    if (supabaseClient) {
        try {
            const { error } = await supabaseClient.from('offers').upsert({ id: 1, text: offerText, expiry: expiryDate, status: 'active' });
            if (error) throw error;
        } catch(e) { showToast("Failed to update offer: " + e.message, "error"); return; }
    }
    showOfferUI(offerText);
    showToast("Offer activated successfully! Instantly updated on user devices.", "success");
}

async function clearOffer() {
    const offerTextEl = document.getElementById('offer-text');
    const offerExpiryEl = document.getElementById('offer-expiry');
    if (offerTextEl) offerTextEl.value = "";
    if (offerExpiryEl) offerExpiryEl.value = "";
    if (supabaseClient) {
        try {
            const { error } = await supabaseClient.from('offers').upsert({ id: 1, text: "", expiry: "", status: 'inactive' });
            if (error) throw error;
        } catch(e) { showToast("Failed to clear offer: " + e.message, "error"); return; }
    }
    hideOfferUI();
    showToast("Offer hidden from users successfully.", "info");
}

function showOfferUI(text) {
    const statusEl = document.getElementById('live-offer-status');
    const previewEl = document.getElementById('preview-text');
    const previewContainer = document.getElementById('app-offer-preview');
    if (statusEl) {
        statusEl.textContent = "Live on User App";
        statusEl.className = "status-badge status-active";
    }
    if (previewEl) previewEl.textContent = text;
    if (previewContainer) previewContainer.style.display = "block";
}

function hideOfferUI() {
    const statusEl = document.getElementById('live-offer-status');
    const previewContainer = document.getElementById('app-offer-preview');
    if (statusEl) {
        statusEl.textContent = "Hidden / Inactive";
        statusEl.className = "status-badge status-hidden";
    }
    if (previewContainer) previewContainer.style.display = "none";
}

// ============================================
// FEATURE 2: ORDER REFUNDS (EXISTING)
// ============================================
async function loadCancelledOrders() {
    if (!supabaseClient) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('cancelled_orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            showToast("Cancelled orders load error: " + (error.message || error), "error");
            cancelledOrders = [];
            renderOrdersTable();
            return;
        }
        cancelledOrders = data || [];
        renderOrdersTable();
    } catch (e) {
        showToast("Cancelled orders load error: " + (e.message || e), "error");
        cancelledOrders = [];
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
                <td><span style="color: #2c3e50; font-weight:bold;">₹${order.total_amount}</span></td>
                <td><span class="reason-tag">${order.reason || 'Not specified'}</span></td>
                <td><span style="color: #e02020; font-weight:500;">${order.payment || 'Online'}</span></td>
                <td>
                    <button id="refund-btn-${index}" class="refund-btn" onclick="processTransfer(${index}, '${esc(order.id)}', '${esc(order.total_amount)}')">
                        <i class="fa-solid fa-money-bill-transfer"></i> Transfer Refund
                    </button>
                </td>
            </tr>
        `;
    });
}

async function processTransfer(index, orderId, amount) {
    const btn = document.getElementById(`refund-btn-${index}`);
    
    showConfirmationModal(`Are you sure you want to trigger instant reversal of ₹${amount} for Order ${orderId}?`, async () => {
        if (btn) {
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Transferring...`;
            btn.disabled = true;
        }
        
        if (supabaseClient) {
            const { error } = await supabaseClient
                .from('orders')
                .update({ status: 'refunded' })
                .eq('id', orderId);

            if (!error) {
                if (btn) {
                    btn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Refunded`;
                    btn.style.backgroundColor = "#64748b";
                }
                showToast(`Success! ₹${amount} has been securely processed back to the user's account for Order ${orderId}.`, "success");
                
                cancelledOrders = cancelledOrders.filter(order => order.id !== orderId);
                renderOrdersTable();
            } else {
                if (btn) {
                    btn.innerHTML = `<i class="fa-solid fa-money-bill-transfer"></i> Transfer Refund`;
                    btn.disabled = false;
                }
                showToast("Transaction Error: " + error.message, "error");
            }
        }
    });
}

// ============================================
// FEATURE 3: PRESCRIPTION AUDIT GATE (NEW)
// ============================================
async function loadRxOrders() {
    if (!supabaseClient) return;

    try {
        let { data, error } = await supabaseClient
            .from('rx_orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {

            const fallback = await supabaseClient
                .from('orders')
                .select('*')
                .order('created_at', { ascending: false });
            data = fallback.data;
            error = fallback.error;
        }

        if (!error && data) {
            rxOrders = data;
            updateRxStats();
            filterRxOrders(currentRxFilter);
        }
    } catch (err) {
        showToast("Rx Orders Load Error: " + (err.message || err), "error");
    }
}

function initRealtimeRxOrders() {
    if (!supabaseClient) return;

    supabaseClient
        .channel('realtime-rx-orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
            loadRxOrders();
        })
        .subscribe();
}

function updateRxStats() {
    rxStats.pending = rxOrders.filter(o => o.status === 'pending').length;
    rxStats.approved = rxOrders.filter(o => o.status === 'accepted' || o.status === 'delivered').length;
    rxStats.rejected = rxOrders.filter(o => o.status === 'cancelled' || o.status === 'rejected').length;

    const pendingEl = document.getElementById('rx-pending-count');
    const approvedEl = document.getElementById('rx-approved-count');
    const rejectedEl = document.getElementById('rx-rejected-count');
    const complianceEl = document.getElementById('rx-compliance-percent');

    if (pendingEl) pendingEl.textContent = rxStats.pending;
    if (approvedEl) approvedEl.textContent = rxStats.approved;
    if (rejectedEl) rejectedEl.textContent = rxStats.rejected;

    let total = rxStats.approved + rxStats.rejected;
    let compliance = total > 0 ? Math.round((rxStats.approved / total) * 100) : 0;
    if (complianceEl) complianceEl.textContent = compliance + '%';
}

function filterRxOrders(filter, event) {
    currentRxFilter = filter;
    
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    if (event && event.currentTarget) event.currentTarget.classList.add('active');

    const container = document.getElementById('rx-orders-container');
    if (!container) return;

    let filtered;
    if (filter === 'pending') {
        filtered = rxOrders.filter(order => order.status === 'pending');
    } else if (filter === 'approved') {
        filtered = rxOrders.filter(order => order.status === 'accepted' || order.status === 'delivered');
    } else if (filter === 'rejected') {
        filtered = rxOrders.filter(order => order.status === 'cancelled' || order.status === 'rejected');
    } else {
        filtered = rxOrders;
    }

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
    const s = order.status || '';
    
    if (s === 'accepted' || s === 'delivered') {
        statusBadgeClass = 'verified';
        statusText = 'Approved';
    } else if (s === 'cancelled' || s === 'rejected') {
        statusBadgeClass = 'pending';
        statusText = 'Rejected';
    }

    const itemsText = order.items_text || '';
    const createdDate = order.created_at ? new Date(order.created_at).toLocaleDateString('en-GB') : 'N/A';

    const cardHTML = `
        <div class="rx-card">
            <div class="rx-header">
                <div>
                    <div class="rx-title">${esc(itemsText || order.order_id)}</div>
                    <small style="color: #64748b;">Order: ${esc(order.order_id)}</small>
                </div>
                <span class="rx-badge ${statusBadgeClass}">${statusText}</span>
            </div>

            <div class="rx-details">
                <div class="rx-detail-item">
                    <div class="rx-detail-label"><i class="fa-solid fa-user"></i> Patient Name</div>
                    <div class="rx-detail-value">${esc(order.customer_name || 'N/A')}</div>
                </div>
                <div class="rx-detail-item">
                    <div class="rx-detail-label"><i class="fa-solid fa-phone"></i> Phone</div>
                    <div class="rx-detail-value">${esc(order.customer_phone || 'N/A')}</div>
                </div>
                <div class="rx-detail-item">
                    <div class="rx-detail-label"><i class="fa-solid fa-calendar"></i> Order Date</div>
                    <div class="rx-detail-value">${createdDate}</div>
                </div>
                <div class="rx-detail-item">
                    <div class="rx-detail-label"><i class="fa-solid fa-money-bill"></i> Order Amount</div>
                    <div class="rx-detail-value" style="color: #10b981; font-weight: 700;">₹${Number(order.total_amount || 0)}</div>
                </div>
                <div class="rx-detail-item">
                    <div class="rx-detail-label"><i class="fa-solid fa-truck"></i> Delivery Address</div>
                    <div class="rx-detail-value">${esc(order.delivery_address || order.customer_address || 'Not Specified')}</div>
                </div>
            </div>

            ${order.items_img ? `
                <div class="rx-image-container">
                    <div style="font-weight: 600; margin-bottom: 8px; color: #0f172a;">
                        <i class="fa-solid fa-image"></i> Order Image
                    </div>
                    <img src="${esc(order.items_img)}" alt="Order" class="rx-image" onerror="this.style.display='none'">
                </div>
            ` : ''}

            <div class="rx-actions">
                ${s === 'pending' ? `
                    <button class="rx-button approve" onclick="approveRxOrder('${esc(order.id)}', '${esc(order.order_id)}', '${esc(order.customer_name)}')">
                        <i class="fa-solid fa-check"></i> Approve Prescription
                    </button>
                    <button class="rx-button reject" onclick="rejectRxOrder('${esc(order.id)}', '${esc(order.order_id)}')">
                        <i class="fa-solid fa-times"></i> Reject & Cancel Order
                    </button>
                ` : `
                    <div style="padding: 8px 12px; background: #f1f5f9; border-radius: 6px; font-size: 13px; color: #64748b;">
                        <i class="fa-solid fa-lock"></i> This order is ${statusText.toLowerCase()} - no further action
                    </div>
                `}
            </div>
        </div>
    `;

    container.innerHTML += cardHTML;
}

async function approveRxOrder(rxId, orderId, patientName) {
    showConfirmationModal(`Approve prescription for ${patientName}? Order: ${orderId}`, async () => {
        if (!supabaseClient) return;

        let success = false;
        try {
            const { error: rxErr } = await supabaseClient.from('rx_orders').update({ rx_status: 'approved', approved_at: new Date().toISOString(), approved_by: 'admin' }).eq('id', rxId);
            if (rxErr) {
                const { error: orderErr } = await supabaseClient.from('orders').update({ status: 'accepted' }).eq('order_id', orderId);
                if (!orderErr) success = true;
            } else {
                success = true;
                await supabaseClient.from('orders').update({ status: 'accepted' }).eq('order_id', orderId).catch(() => {});
            }
        } catch(e) {
            try {
                const { error: fallbackErr } = await supabaseClient.from('orders').update({ status: 'accepted' }).eq('order_id', orderId);
                if (!fallbackErr) success = true;
            } catch(e2) {}
        }

        if (success) {
            showToast(`Prescription approved for ${patientName}! Order ${orderId} can now be processed.`, "success");
            loadRxOrders();
        } else {
            showToast('Could not update order. Please try again.', "error");
        }
    });
}

async function rejectRxOrder(rxId, orderId) {
    const reason = await new Promise(resolve => {
        const m = document.createElement('div');
        m.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
        m.innerHTML = `<div style="background:#fff;border-radius:16px;padding:24px;width:90%;max-width:360px;text-align:center;">
            <h3 style="margin:0 0 12px;font-size:1rem;color:#2f3542;">Rejection Reason</h3>
            <input type="text" id="_pi" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:0.9rem;margin-bottom:14px;outline:none;" placeholder="Enter reason for rejection">
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
    if (!supabaseClient) return;

    let success = false;
    try {
        const { error: rxErr } = await supabaseClient.from('rx_orders').update({ rx_status: 'rejected', rejection_reason: reason, rejected_at: new Date().toISOString() }).eq('id', rxId);
        if (rxErr) {
            const { error: orderErr } = await supabaseClient.from('orders').update({ status: 'cancelled' }).eq('order_id', orderId);
            if (!orderErr) success = true;
        } else {
            success = true;
            await supabaseClient.from('orders').update({ status: 'cancelled' }).eq('order_id', orderId).catch(() => {});
        }
    } catch(e) {
        try {
            const { error: fallbackErr } = await supabaseClient.from('orders').update({ status: 'cancelled' }).eq('order_id', orderId);
            if (!fallbackErr) success = true;
        } catch(e2) {}
    }

    if (success) {
        showToast(`Prescription rejected! Reason: ${reason}. Order has been cancelled.`, "info");
        loadRxOrders();
    } else {
        showToast('Could not update order. Please try again.', "error");
    }
}

// ============================================
// FEATURE 4: NOTIFICATIONS (EXISTING)
// ============================================
function toggleIndividualInput() {
    const targetEl = document.getElementById('notif-target');
    const groupIdEl = document.getElementById('user-id-group');
    if (!targetEl || !groupIdEl) return;
    const target = targetEl.value;
    groupIdEl.style.display = (target === 'individual') ? 'block' : 'none';
}

async function sendNotification() {
    const targetEl = document.getElementById('notif-target');
    const userIdEl = document.getElementById('user-id');
    const titleEl = document.getElementById('notif-title');
    const messageEl = document.getElementById('notif-message');

    const target = targetEl ? targetEl.value : '';
    const userId = userIdEl ? userIdEl.value.trim() : '';
    const title = titleEl ? titleEl.value.trim() : '';
    const message = messageEl ? messageEl.value.trim() : '';

    if (!title || !message) {
        showToast("Please fill up both Title and Message Body!", "error");
        return;
    }

    if (target === 'individual' && !userId) {
        showToast("Please enter a Target User ID/Phone Number!", "error");
        return;
    }

    if (supabaseClient) {
        try {
            await supabaseClient.from('notifications').insert({ 
                target, 
                user_id: userId, 
                title, 
                message,
                created_at: new Date().toISOString()
            });
        } catch (e) {
            showToast("Notification send failed: " + (e.message || e), "error");
            return;
        }
    }

    showToast("Notification Dispatched Successfully!", "success");
    if (titleEl) titleEl.value = "";
    if (messageEl) messageEl.value = "";
    if (userIdEl) userIdEl.value = "";
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
        showToast("All orders load error: " + (e.message || e), "error");
        allOrdersData = [];
        renderAllOrders(allOrdersData);
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
            <td>${o.user_email || 'Guest'}</td>
            <td>₹${Number(o.total_amount || 0).toFixed(2)}</td>
            <td><span class="badge ${getStatusClass(o.status)}">${o.status || 'Unknown'}</span></td>
            <td>${o.payment_mode || o.payment_status || 'N/A'}</td>
            <td>${o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN') : 'N/A'}</td>
            <td>
                <select onchange="updateOrderStatus('${o.id}', this.value)" style="padding:4px 8px; border-radius:6px; border:1px solid #dcdde1; font-size:12px;">
                    <option value="">Change...</option>
                    <option value="pending">Pending</option>
                    <option value="accepted">Accepted</option>
                    <option value="picked_up">Picked Up</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
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
    const statusFilterEl = document.getElementById('order-status-filter');
    const searchEl = document.getElementById('order-search');
    const statusFilter = statusFilterEl ? statusFilterEl.value : 'all';
    const search = (searchEl ? searchEl.value : '').toLowerCase();
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
    showConfirmationModal(`Change order #${orderId.slice(0,8)} to "${newStatus}"?`, async () => {
        try {
            const { error } = await supabaseClient
                .from('orders')
                .update({ status: newStatus })
                .eq('id', orderId);
            if (error) throw error;
            loadAllOrders();
            showToast('Order status updated!', "success");
        } catch (e) {

            showToast('Failed to update order.', "error");
        }
    });
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
        showToast("All users load error: " + (e.message || e), "error");
        allUsersData = [];
        renderAllUsers(allUsersData);
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
            <td>${u.full_name || 'N/A'}</td>
            <td>${u.email || 'N/A'}</td>
            <td>${u.phone || 'N/A'}</td>
            <td>${u.address || 'N/A'}</td>
            <td>${u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN') : 'N/A'}</td>
        </tr>
    `).join('');
}

function filterUsers() {
    const searchEl = document.getElementById('user-search');
    const search = (searchEl ? searchEl.value : '').toLowerCase();
    let filtered = allUsersData;
    if (search) {
        filtered = filtered.filter(u =>
            (u.full_name || '').toLowerCase().includes(search) ||
            (u.email || '').toLowerCase().includes(search) ||
            (u.phone || '').toLowerCase().includes(search)
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