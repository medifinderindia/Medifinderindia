// ==========================================
// 1. Supabase Initialization & Core Setups
// URL & key loaded from supabase-constants.js
// ==========================================
let supabaseClient = null;

// ডেটা স্ট্রিম ভেরিয়েবলসমূহ
let pendingMedicines = [];
let pendingPayouts = [];
let onboardingMerchants = [];
let merchantLedger = [];
let currentKycFilter = 'all';

// Supabase ক্লায়েন্ট ইনিশিয়ালাইজেশন
if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    document.addEventListener("DOMContentLoaded", async () => {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            updateDbStatus(false, "No active session. Please login via Admin Panel first.");
            showToast("Session expired. Please login again.", "error");
            localStorage.removeItem('merchantSessionActive');
            window.location.href = "index.html";
            return;
        }
        updateDbStatus(true, "Connected to Supabase production network.");
        initializeAllDataStreams();
    });
} else {
    document.addEventListener("DOMContentLoaded", () => {
        updateDbStatus(false, "Supabase SDK missing or failed to initialize.");
    });
}

// ডাটাবেস কানেকশন স্ট্যাটাস আপডেটার
function updateDbStatus(isSuccess, message) {
    const dbStatusText = document.getElementById('db-status-text');
    if (!dbStatusText) return;
    if (isSuccess) {
        dbStatusText.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #10b981;"></i> ${message}`;
    } else {
        dbStatusText.innerHTML = `<i class="fa-solid fa-circle-xmark" style="color: #ef4444;"></i> ${message}`;
    }
}

// সব রিয়েল-টাইম এবং ইনিশিয়াল ডেটা ফেচিং রান করা
function initializeAllDataStreams() {
    loadMedicineApprovals();
    loadMerchantPayouts();
    loadMerchantVerification();
    loadMerchantLedger();
    initRealtimeMerchantStreams();
}

// ফুল-পেজ পপআপ মডাল ওপেন এবং ক্লোজ লজিক
function openPopup(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closePopup(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// ==========================================
// 2. Realtime Replication Synchronization
// ==========================================
function initRealtimeMerchantStreams() {
    if (!supabaseClient) return;

    // মেডিসিন টেবিল রিয়েল-টাইম ট্র্যাকিং
    supabaseClient
        .channel('realtime-medicines')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'medicines' }, () => {
            loadMedicineApprovals();
        })
        .subscribe();

    // পে-আউট টেবিল রিয়েল-টাইম ট্র্যাকিং
    supabaseClient
        .channel('realtime-payouts')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_payouts' }, () => {
            loadMerchantPayouts();
            loadMerchantLedger();
        })
        .subscribe();

    // মার্চেন্ট অনবোর্ডিং লাইসেন্স ট্র্যাকিং
    supabaseClient
        .channel('realtime-merchants')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_kyc' }, () => {
            loadMerchantVerification();
        })
        .subscribe();

    // Ledger ট্র্যাকিং
    supabaseClient
        .channel('realtime-ledger')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payout_history' }, () => {
            loadMerchantLedger();
        })
        .subscribe();
}

// ==========================================
// 3. Medicine Approval Gateway Logic
// ==========================================
function esc(str) { return String(str || '').replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function loadMedicineApprovals() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('medicines')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        pendingMedicines = data || [];
        renderMedicinesTable();
    } catch (e) {
        showToast("Medicines Load Error: " + e.message, "error");
        pendingMedicines = [];
        renderMedicinesTable();
    }
}

function renderMedicinesTable() {
    const tableBody = document.getElementById('medicine-approval-table');
    const emptyMsg = document.getElementById('medicine-empty-msg');
    if (!tableBody) return;

    if (pendingMedicines.length === 0) {
        tableBody.innerHTML = "";
        if (emptyMsg) emptyMsg.style.display = 'block';
        return;
    }

    if (emptyMsg) emptyMsg.style.display = 'none';
    tableBody.innerHTML = "";

    pendingMedicines.forEach((med) => {
        let discountPercent = 0;
        const medMrp = med.mrp || med.unit_price || 0;
        const medPrice = med.selling_price || med.unit_price || 0;
        if (medMrp && medPrice && medMrp > medPrice) {
            discountPercent = Math.round(((medMrp - medPrice) / medMrp) * 100);
        }

        // Trust prescription_req (the text the merchant actually chose) as the
        // source of truth, and fall back to is_rx only for older rows that
        // don't have prescription_req set. This keeps the badge correct even
        // for rows created before is_rx/prescription_req were synced.
        const medIsRx = med.prescription_req
            ? med.prescription_req === 'Yes'
            : (med.is_rx === true || med.is_rx === 'true');

        let statusBadgeClass = "status-hidden";
        if (medIsRx) statusBadgeClass = "status-active";

        tableBody.innerHTML += `
            <tr>
                <td>
                    <div style="font-weight: 600; color: #1e293b;">${med.product_name || med.name || 'Unnamed'}</div>
                    <div style="font-size: 12px; color: #64748b;">ID: ${String(med.id).slice(0,8)} | ${med.dosage_form || med.category || 'N/A'}</div>
                </td>
                <td><span style="font-weight:500; color:#475569;">${med.merchant_id || 'N/A'}</span></td>
                <td>₹${medMrp}</td>
                <td><strong>₹${medPrice}</strong></td>
                <td><span style="color:#10b981; font-weight:bold;">${discountPercent}% Off</span></td>
                <td><span class="status-badge ${statusBadgeClass}">${medIsRx ? 'Prescription' : 'OTC'}</span></td>
                <td>
                    <div style="display:flex; gap:6px;">
                        <button class="refund-btn" style="background:#10b981; padding: 6px 10px; font-size:13px;" onclick="approveMedicine('${esc(med.id)}')">
                            <i class="fa-solid fa-check"></i> Approve
                        </button>
                        <button class="refund-btn" style="background:#e02020; padding: 6px 10px; font-size:13px;" onclick="openEditModal('${esc(med.id)}', '${esc(med.product_name || med.name || '')}', ${medMrp}, ${medPrice})">
                            <i class="fa-solid fa-pen"></i> Edit
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
}

async function approveMedicine(id) {
    if (!supabaseClient) return;

    // Self-heal is_rx from prescription_req at the moment of approval, so any
    // product that slipped through with a mismatched flag gets corrected
    // right before it goes live on the storefront.
    const med = pendingMedicines.find(m => String(m.id) === String(id));
    const updatePayload = { status: 'Approved' };
    if (med && med.prescription_req) {
        updatePayload.is_rx = med.prescription_req === 'Yes';
    }

    const { error } = await supabaseClient
        .from('medicines')
        .update(updatePayload)
        .eq('id', id);

    if (!error) {
        showToast("Medicine status set to 'Approved' live on app.", "success");
        loadMedicineApprovals();
    } else {
        showToast("Error approving product: " + error.message, "error");
    }
}

// এডিট মডাল কন্ট্রোল
function openEditModal(id, name, mrp, selling) {
    const editIdEl = document.getElementById('edit-med-id');
    const editNameEl = document.getElementById('edit-med-name');
    const editMrpEl = document.getElementById('edit-med-mrp');
    const editSellingEl = document.getElementById('edit-med-selling');
    if (editIdEl) editIdEl.value = id;
    if (editNameEl) editNameEl.value = name;
    if (editMrpEl) editMrpEl.value = mrp;
    if (editSellingEl) editSellingEl.value = selling;
    calculateModalDiscount();
    openPopup('edit-modal');
}

function calculateModalDiscount() {
    const mrpEl = document.getElementById('edit-med-mrp');
    const sellingEl = document.getElementById('edit-med-selling');
    const mrp = mrpEl ? parseFloat(mrpEl.value) || 0 : 0;
    const selling = sellingEl ? parseFloat(sellingEl.value) || 0 : 0;
    const discountInput = document.getElementById('edit-med-discount');
    
    if (discountInput) {
        if (mrp && selling && mrp > selling) {
            const pct = Math.round(((mrp - selling) / mrp) * 100);
            discountInput.value = `${pct}% Off calculated`;
        } else {
            discountInput.value = `0% / Invalid Price`;
        }
    }
}

async function saveModalEdits() {
    if (!supabaseClient) return;
    const id = document.getElementById('edit-med-id')?.value;
    if (!id) { showToast('No medicine selected for editing', "error"); return; }
    const mrp = parseFloat(document.getElementById('edit-med-mrp')?.value || 0);
    const selling = parseFloat(document.getElementById('edit-med-selling')?.value || 0);

    if (!mrp || !selling) {
        showToast('Please fill in valid prices', "error");
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('medicines')
            .update({ mrp: mrp, selling_price: selling, unit_price: selling })
            .eq('id', id);
        if (error) throw error;
        showToast("Medicine prices updated successfully!", "success");
        loadMedicineApprovals();
        closePopup('edit-modal');
    } catch (e) {
        showToast("Error updating medicine: " + e.message, "error");
    }
}

async function removeMedicineByModal() {
    if (!supabaseClient) return;
    const id = document.getElementById('edit-med-id')?.value;
    if (!id) { showToast('No medicine selected', "error"); return; }
    showConfirmationModal("Permanently remove this medicine?", async () => {
        try {
            const { error } = await supabaseClient.from('medicines').delete().eq('id', id);
            if (error) throw error;
            showToast("Medicine removed from system.", "info");
            loadMedicineApprovals();
            closePopup('edit-modal');
        } catch (e) {
            showToast("Error removing medicine: " + e.message, "error");
        }
    });
}

// ==========================================
// 4. Merchant Payouts Logic
// ==========================================
async function loadMerchantPayouts() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('merchant_payouts')
            .select('*')
            .neq('status', 'Settled')
            .order('created_at', { ascending: false });
        if (error) throw error;
        pendingPayouts = data || [];
        renderPayoutsTable();
    } catch (e) {
        showToast("Payouts Load Error: " + e.message, "error");
        pendingPayouts = [];
        renderPayoutsTable();
    }
}

function renderPayoutsTable() {
    const tableBody = document.getElementById('payouts-table');
    const emptyMsg = document.getElementById('payouts-empty-msg');
    if (!tableBody) return;

    if (pendingPayouts.length === 0) {
        tableBody.innerHTML = "";
        if (emptyMsg) emptyMsg.style.display = 'block';
        return;
    }

    if (emptyMsg) emptyMsg.style.display = 'none';
    tableBody.innerHTML = "";

    pendingPayouts.forEach((payout, idx) => {
        const payAmount = payout.amount || 0;
        tableBody.innerHTML += `
            <tr>
                <td>
                    <div style="font-weight:600;">Order #${payout.order_id || 'N/A'}</div>
                    <div style="font-size:12px; color:#64748b;">Merchant ID: ${payout.merchant_id || payout.shop_id || 'Unknown'}</div>
                </td>
                <td>
                    <div style="font-size:13px; font-weight:500;"><i class="fa-solid fa-shop" style="color:#e02020;"></i> Merchant Shop</div>
                    <div style="font-size:13px; color:#64748b;"><i class="fa-solid fa-location-dot" style="color:#ef4444;"></i> Delivery Location</div>
                </td>
                <td><span style="color:#0f172a; font-weight:700; font-size:16px;">₹${payAmount}</span></td>
                <td>
                    <div style="font-weight:600; color:#059669;">${payout.payment_mode || 'Online Transfer'}</div>
                    <div style="font-size:11px; color:#94a3b8;">Triggered: ${payout.settled_at ? new Date(payout.settled_at).toLocaleDateString() : 'Just Now'}</div>
                </td>
                <td>
                    <button class="refund-btn" style="background:#059669;" onclick="clearMerchantPayout(${idx}, '${esc(payout.id)}', '${esc(payAmount)}')">
                        <i class="fa-solid fa-money-check-dollar"></i> Dispatch Bank Payout
                    </button>
                </td>
            </tr>
        `;
    });
}

async function clearMerchantPayout(index, id, amount) {
    const verification = await new Promise(resolve => {
        const m = document.createElement('div');
        m.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
        m.innerHTML = `<div style="background:#fff;border-radius:16px;padding:24px;width:90%;max-width:360px;text-align:center;">
            <h3 style="margin:0 0 12px;font-size:1rem;color:#2f3542;">Dispatch Payment</h3>
            <input type="text" id="_pi" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:0.9rem;margin-bottom:14px;outline:none;" placeholder="Type RELEASE to confirm">
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
    if (verification !== "RELEASE") {
        showToast("Financial transaction aborted safely.", "info");
        return;
    }

    if (supabaseClient) {
        const payout = pendingPayouts[index] || {};
        const { error } = await supabaseClient
            .from('merchant_payouts')
            .update({ status: 'Settled' })
            .eq('id', id);

        if (!error) {
            await supabaseClient.from('payout_history').insert({
                transaction_id: 'TXN-' + Date.now(),
                recipient_name: 'Merchant #' + (payout.merchant_id || payout.shop_id || 'Unknown'),
                amount: payAmount,
                type: 'Merchant',
                payment_method: payout.payment_mode || 'Online Transfer',
                status: 'Completed',
                reference: id
            });
            showToast("Success! High-speed reversal bank settlement accomplished.", "success");
            loadMerchantPayouts();
            loadMerchantLedger();
        } else {
            showToast("Payout processing network failure: " + error.message, "error");
        }
    }
}

// ==========================================
// 5. FEATURE: MERCHANT FINANCIAL LEDGER (NEW)
// ==========================================
async function loadMerchantLedger() {
    if (!supabaseClient) return;

    try {
        const { data, error } = await supabaseClient
            .from('payout_history')
            .select('*')
            .eq('type', 'Merchant')
        ;

        if (!error && data) {
            merchantLedger = data;
            renderMerchantLedger();
            updateLedgerStats();
        }
    } catch (err) {
        showToast("Ledger Load Error: " + err.message, "error");
    }
}

function renderMerchantLedger() {
    const tbody = document.getElementById('ledger-table-body');
    if (!tbody) return;

    if (merchantLedger.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 30px;">No ledger history available yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    merchantLedger.forEach((entry) => {
        const date = new Date(entry.created_at);
        const statusColor = entry.status === 'Completed' ? '#10b981' : '#f97316';
        
        tbody.innerHTML += `
            <tr>
                <td><strong>${entry.transaction_id || 'TXN-' + entry.id}</strong></td>
                <td>${entry.recipient_name || 'N/A'}</td>
                <td style="color: #0f172a; font-weight: 700;">₹${entry.amount}</td>
                <td><span style="font-size: 11px; background: #f1f5f9; padding: 3px 8px; border-radius: 3px;">Merchant</span></td>
                <td>${entry.payment_method || 'Bank Transfer'}</td>
                <td><span style="color: ${statusColor}; font-weight: 600; font-size: 12px;">● ${entry.status}</span></td>
                <td><small>${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})}</small></td>
                <td><small style="font-family: monospace;">${entry.reference || 'N/A'}</small></td>
            </tr>
        `;
    });
}

function updateLedgerStats() {
    let totalTrans = merchantLedger.length;
    let totalAmount = merchantLedger.reduce((sum, item) => sum + (item.amount || 0), 0);
    let completedAmount = merchantLedger
        .filter(p => p.status === 'Completed')
        .reduce((sum, item) => sum + (item.amount || 0), 0);
    let pendingAmount = totalAmount - completedAmount;
    let avgSettlement = totalTrans > 0 ? Math.floor(totalAmount / totalTrans) : 0;

    const ledgerTotalTrans = document.getElementById('ledger-total-trans');
    const ledgerTotalAmount = document.getElementById('ledger-total-amount');
    const ledgerPendingAmount = document.getElementById('ledger-pending-amount');
    const ledgerAvgSettlement = document.getElementById('ledger-avg-settlement');
    if (ledgerTotalTrans) ledgerTotalTrans.textContent = totalTrans;
    if (ledgerTotalAmount) ledgerTotalAmount.textContent = '₹' + totalAmount.toLocaleString('en-IN');
    if (ledgerPendingAmount) ledgerPendingAmount.textContent = '₹' + pendingAmount.toLocaleString('en-IN');
    if (ledgerAvgSettlement) ledgerAvgSettlement.textContent = '₹' + avgSettlement.toLocaleString('en-IN');
}

function filterLedger() {
    const dateFrom = document.getElementById('ledger-date-from')?.value || '';
    const dateTo = document.getElementById('ledger-date-to')?.value || '';
    const status = document.getElementById('ledger-status-filter')?.value || '';

    let filtered = merchantLedger;

    if (dateFrom) {
        const fromDate = new Date(dateFrom);
        filtered = filtered.filter(entry => new Date(entry.created_at) >= fromDate);
    }

    if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setDate(toDate.getDate() + 1);
        filtered = filtered.filter(entry => new Date(entry.created_at) < toDate);
    }

    if (status) {
        filtered = filtered.filter(entry => entry.status === status);
    }

    const tbody = document.getElementById('ledger-table-body');
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 30px;">No records match your filters.</td></tr>`;
        renderFilteredStats(filtered);
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach((entry) => {
        const date = new Date(entry.created_at);
        const statusColor = entry.status === 'Completed' ? '#10b981' : '#f97316';
        
        tbody.innerHTML += `
            <tr>
                <td><strong>${entry.transaction_id || 'TXN-' + entry.id}</strong></td>
                <td>${entry.recipient_name || 'N/A'}</td>
                <td style="color: #0f172a; font-weight: 700;">₹${entry.amount}</td>
                <td><span style="font-size: 11px; background: #f1f5f9; padding: 3px 8px; border-radius: 3px;">Merchant</span></td>
                <td>${entry.payment_method || 'Bank Transfer'}</td>
                <td><span style="color: ${statusColor}; font-weight: 600; font-size: 12px;">● ${entry.status}</span></td>
                <td><small>${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})}</small></td>
                <td><small style="font-family: monospace;">${entry.reference || 'N/A'}</small></td>
            </tr>
        `;
    });
    renderFilteredStats(filtered);
}

function renderFilteredStats(filtered) {
    const totalTrans = filtered.length;
    const totalAmount = filtered.reduce((sum, item) => sum + (item.amount || 0), 0);
    const completedAmount = filtered.filter(p => p.status === 'Completed').reduce((sum, item) => sum + (item.amount || 0), 0);
    const pendingAmount = totalAmount - completedAmount;
    const avgSettlement = totalTrans > 0 ? Math.floor(totalAmount / totalTrans) : 0;
    const el1 = document.getElementById('ledger-total-trans');
    const el2 = document.getElementById('ledger-total-amount');
    const el3 = document.getElementById('ledger-pending-amount');
    const el4 = document.getElementById('ledger-avg-settlement');
    if (el1) el1.textContent = totalTrans;
    if (el2) el2.textContent = '₹' + totalAmount.toLocaleString('en-IN');
    if (el3) el3.textContent = '₹' + pendingAmount.toLocaleString('en-IN');
    if (el4) el4.textContent = '₹' + avgSettlement.toLocaleString('en-IN');
}

function exportLedgerMerchant() {
    if (merchantLedger.length === 0) {
        showToast('No data to export', "info");
        return;
    }

    let csv = 'Transaction ID,Merchant Name,Amount,Type,Payment Method,Status,Date,Reference\n';
    
    merchantLedger.forEach(entry => {
        const date = new Date(entry.created_at).toLocaleDateString('en-GB');
        csv += `"${entry.transaction_id || 'TXN-' + entry.id}","${entry.recipient_name || 'N/A'}",${entry.amount},"Merchant","${entry.payment_method || 'Bank Transfer'}","${entry.status}","${date}","${entry.reference || 'N/A'}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `merchant_ledger_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}

// ==========================================
// 6. Onboarding & License Review Logic
// ==========================================
async function loadMerchantVerification() {
    if (!supabaseClient) return;
    try {
        const { data: kycData, error: kycErr } = await supabaseClient
            .from('merchant_kyc')
            .select('id, merchant_id, license_img, license_no, verified, rejection_reason, verified_at, rejected_at, created_at')
            .order('created_at', { ascending: false });
        if (kycErr) throw kycErr;

        const { data: merData } = await supabaseClient
            .from('merchants')
            .select('id, shop_name, merchant_name, phone, email, license_status');

        const merMap = {};
        (merData || []).forEach(m => { merMap[m.id] = m; });

        onboardingMerchants = (kycData || []).map(k => ({
            ...k,
            merchants: merMap[k.merchant_id] || null
        }));
        renderVerificationCards();
    } catch (e) {
        showToast("KYC Load Error: " + e.message, "error");
        onboardingMerchants = [];
        renderVerificationCards();
    }
}

function renderVerificationCards() {
    const container = document.getElementById('verification-container');
    const emptyMsg = document.getElementById('verification-empty-msg');
    const counterBadge = document.getElementById('verify-count');
    if (!container) return;

    const pendingCount = onboardingMerchants.filter(k => !k.verified && !k.rejection_reason).length;

    if (counterBadge) {
        if (pendingCount > 0) {
            counterBadge.textContent = pendingCount;
            counterBadge.style.display = 'inline-block';
        } else {
            counterBadge.style.display = 'none';
        }
    }

    if (onboardingMerchants.length === 0) {
        container.innerHTML = "";
        if (emptyMsg) emptyMsg.style.display = 'block';
        return;
    }

    if (emptyMsg) emptyMsg.style.display = 'none';
    container.innerHTML = "";

    const filtered = onboardingMerchants.filter(k => {
        if (currentKycFilter === 'pending') return !k.verified && !k.rejection_reason;
        if (currentKycFilter === 'verified') return k.verified;
        if (currentKycFilter === 'rejected') return k.rejection_reason && !k.verified;
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:30px; color:#64748b;">No ' + currentKycFilter + ' records found.</div>';
        return;
    }

    filtered.forEach((kyc) => {
        const isVerified = kyc.verified;
        const isRejected = kyc.rejection_reason && !kyc.verified;
        const isPending = !isVerified && !isRejected;

        let statusBadge = '';
        let actions = '';
        if (isVerified) {
            statusBadge = '<span style="background:#dcfce7; color:#16a34a; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:700;"><i class="fa-solid fa-check-circle"></i> Verified</span>';
        } else if (isRejected) {
            statusBadge = '<span style="background:#fee2e2; color:#dc2626; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:700;"><i class="fa-solid fa-xmark-circle"></i> Rejected</span>';
            actions = `<div style="display:flex; gap:10px; justify-content:flex-end; margin-top:10px;">
                <button style="background:#10b981; color:#fff; padding:8px 16px; font-size:14px; border:none; border-radius:6px; cursor:pointer;" onclick="approveKyc('${esc(kyc.id)}', '${esc(kyc.merchant_id || '')}')"><i class="fa-solid fa-certificate"></i> Re-Approve</button>
            </div>`;
        } else {
            statusBadge = '<span style="background:#fef3c7; color:#d97706; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:700;"><i class="fa-solid fa-clock"></i> Pending</span>';
            actions = `<div style="display:flex; gap:10px; justify-content:flex-end; margin-top:10px;">
                <button style="background:#ef4444; color:#fff; padding:8px 16px; font-size:14px; border:none; border-radius:6px; cursor:pointer;" onclick="rejectKyc('${esc(kyc.id)}', '${esc(kyc.merchants?.id || '')}')"><i class="fa-solid fa-xmark"></i> Reject</button>
                <button style="background:#10b981; color:#fff; padding:8px 16px; font-size:14px; border:none; border-radius:6px; cursor:pointer;" onclick="approveKyc('${esc(kyc.id)}', '${esc(kyc.merchant_id || '')}')"><i class="fa-solid fa-certificate"></i> Approve</button>
            </div>`;
        }

        const borderColor = isVerified ? '#10b981' : isRejected ? '#ef4444' : '#f59e0b';

        container.innerHTML += `
            <div style="border:1px solid #e2e8f0; border-left:4px solid ${borderColor}; margin-bottom:20px; background:#fff; padding:20px; border-radius:8px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px;">
                    <div>
                        <h3 style="color:#0f172a; font-size:18px; margin:0 0 4px 0;">${kyc.merchants?.shop_name || 'Unnamed Pharmacy Store'}</h3>
                        <p style="color:#64748b; font-size:14px; margin:2px 0;"><i class="fa-solid fa-user"></i> Owner: ${kyc.merchants?.merchant_name || 'N/A'}</p>
                        <p style="color:#64748b; font-size:14px; margin:2px 0;"><i class="fa-solid fa-phone"></i> ${kyc.merchants?.phone || 'N/A'}</p>
                        <p style="color:#64748b; font-size:14px; margin:2px 0;"><i class="fa-solid fa-envelope"></i> ${kyc.merchants?.email || 'N/A'}</p>
                    </div>
                    <div style="text-align:right;">
                        ${statusBadge}
                        <div style="font-size:12px; font-weight:bold; color:#1e293b; margin-top:6px;">License: ${kyc.license_no || 'REG-PENDING'}</div>
                    </div>
                </div>
                <div style="background:#f8fafc; padding:12px; border-radius:6px; font-size:13px; color:#475569; margin-bottom:15px; border-left:3px solid #e02020;">
                    <strong>Drug License Proof:</strong> <br>
                    <a href="${kyc.license_img || '#'}" target="_blank" style="color:#e02020; text-decoration:underline; font-weight:600;"><i class="fa-solid fa-file-pdf"></i> View Document</a>
                </div>
                ${isRejected ? `<div style="background:#fef2f2; padding:10px; border-radius:6px; font-size:13px; color:#dc2626; margin-bottom:10px; border-left:3px solid #ef4444;"><strong>Rejection Reason:</strong> ${kyc.rejection_reason}</div>` : ''}
                ${isVerified && kyc.verified_at ? `<div style="font-size:12px; color:#64748b;">Verified on: ${new Date(kyc.verified_at).toLocaleDateString('en-IN')}</div>` : ''}
                ${actions}
            </div>
        `;
    });
}

async function approveKyc(id) {
    if (!supabaseClient) return;
    showConfirmationModal(`Approve this merchant's license and verify account?`, async () => {

        const { data: kycRec, error: kycErr } = await supabaseClient
            .from('merchant_kyc')
            .update({ verified: true, verified_at: new Date().toISOString() })
            .eq('id', id)
            .select('merchant_id')
            .single();

        if (kycErr) {
            showToast("Error: " + kycErr.message, "error");
            return;
        }

        if (kycRec && kycRec.merchant_id) {
            const { error: merErr } = await supabaseClient
                .from('merchants')
                .update({ license_status: 'Verified' })
                .eq('id', kycRec.merchant_id);
            if (merErr) { showToast("Merchant status update failed: " + merErr.message, "error"); }
            await supabaseClient.from('merchant_notifications').insert({
                merchant_id: kycRec.merchant_id,
                title: 'KYC Approved',
                message: 'Your KYC has been approved. Your account is now verified.',
                type: 'success',
                category: 'admin',
                is_read: false
            });
        }

        showToast("Merchant KYC approved successfully. Account is now verified.", "success");
        loadMerchantVerification();
    });
}

async function rejectKyc(id, merchantId) {
    if (!supabaseClient) return;
    const reason = await new Promise(resolve => {
        const m = document.createElement('div');
        m.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
        m.innerHTML = `<div style="background:#fff;border-radius:16px;padding:24px;width:90%;max-width:360px;text-align:center;">
            <h3 style="margin:0 0 12px;font-size:1rem;color:#2f3542;">KYC Rejection Reason</h3>
            <input type="text" id="_pi" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:0.9rem;margin-bottom:14px;outline:none;" placeholder="Enter rejection reason (visible to merchant)">
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

    const { error } = await supabaseClient
        .from('merchant_kyc')
        .update({ verified: false, rejection_reason: reason, rejected_at: new Date().toISOString() })
        .eq('id', id);

    if (error) {
        showToast("Error: " + error.message, "error");
        return;
    }

    if (merchantId) {
        const { error: merErr } = await supabaseClient
            .from('merchants')
            .update({ license_status: 'Rejected' })
            .eq('id', merchantId);
        if (merErr) { showToast("Merchant status update failed: " + merErr.message, "error"); }
        await supabaseClient.from('merchant_notifications').insert({
            merchant_id: merchantId,
            title: 'KYC Rejected',
            message: 'Your KYC has been rejected. Reason: ' + reason,
            type: 'error',
            category: 'admin',
            is_read: false
        });
    }

    showToast("Merchant KYC rejected. Merchant has been notified.", "info");
    loadMerchantVerification();
}

function filterKyc(filter) {
    currentKycFilter = filter;
    document.querySelectorAll('.kyc-filter-btn').forEach(btn => {
        btn.style.background = '#f8fafc';
        btn.style.color = '#64748b';
    });
    const activeBtn = document.getElementById('kyc-filter-' + filter);
    if (activeBtn) {
        activeBtn.style.background = '#e02020';
        activeBtn.style.color = '#fff';
    }
    renderVerificationCards();
}

// ==========================================
// 7. Merchant Alerts & Broadcast Logic
// ==========================================
function toggleMerchantInput() {
    const targetEl = document.getElementById('merchant-notif-target');
    const target = targetEl ? targetEl.value : '';
    const group = document.getElementById('merchant-id-group');
    if (group) {
        group.style.display = (target === 'individual') ? 'block' : 'none';
    }
}

async function sendMerchantNotification() {
    const targetEl = document.getElementById('merchant-notif-target');
    const shopIdEl = document.getElementById('merchant-target-id');
    const titleEl = document.getElementById('merchant-notif-title');
    const messageEl = document.getElementById('merchant-notif-message');

    const target = targetEl ? targetEl.value : '';
    const shopId = shopIdEl ? shopIdEl.value.trim() : '';
    const title = titleEl ? titleEl.value.trim() : '';
    const message = messageEl ? messageEl.value.trim() : '';

    if (!title || !message) {
        showToast("Alert notification headers and system message body cannot be blank!", "error");
        return;
    }

    if (target === 'individual' && !shopId) {
        showToast("Please map a target unique Merchant Shop ID!", "error");
        return;
    }

    if (supabaseClient) {
        let resolvedMerchantId = null;
        if (target === 'individual' && shopId) {
            try {
                const { data: shopMerchant } = await supabaseClient.from('merchants').select('id').eq('shop_name', shopId).maybeSingle();
                if (shopMerchant) {
                    resolvedMerchantId = shopMerchant.id;
                } else {
                    const { data: byId } = await supabaseClient.from('merchants').select('id').eq('id', parseInt(shopId)).maybeSingle();
                    if (byId) resolvedMerchantId = byId.id;
                }
            } catch (e) { showToast("Merchant lookup failed: " + (e.message || e), "error"); }
        }

        const insertData = {
            merchant_id: resolvedMerchantId,
            title: title,
            message: message,
            type: 'info',
            category: 'admin',
            is_read: false,
            created_at: new Date().toISOString()
        };

        const { error } = await supabaseClient.from('merchant_notifications').insert(insertData);

        if (!error) {
            showToast("Broadcast alert system pipeline successfully deployed!", "success");
            if (titleEl) titleEl.value = "";
            if (messageEl) messageEl.value = "";
            if (shopIdEl) shopIdEl.value = "";
            closePopup('notifications-modal');
        } else {
            showToast("Failed to broadcast alert message: " + error.message, "error");
        }
    }
}