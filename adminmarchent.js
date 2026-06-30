// ==========================================
// 1. Supabase Initialization & Core Setups
// ==========================================
const SUPABASE_URL = 'https://rnpbglinkpsikeszcjcl.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_Ogc4JOrhQXAl9zRTDU0y3g_oGnitfuZ';
let supabaseClient = null;

// ডেটা স্ট্রিম ভেরিয়েবলসমূহ
let pendingMedicines = [];
let pendingPayouts = [];
let onboardingMerchants = [];
let merchantLedger = [];

// Supabase ক্লায়েন্ট ইনিশিয়ালাইজেশন
if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    document.addEventListener("DOMContentLoaded", () => {
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
async function loadMedicineApprovals() {
    if (!supabaseClient) return;
    
    const { data, error } = await supabaseClient
        .from('medicines')
        .select('*')
        .order('created_at', { ascending: false });

    if (!error && data) {
        pendingMedicines = data;
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
        if (med.mrp && med.selling_price && med.mrp > med.selling_price) {
            discountPercent = Math.round(((med.mrp - med.selling_price) / med.mrp) * 100);
        }

        let statusBadgeClass = "status-hidden";
        if (med.status === 'Approved' || med.status === 'Active') statusBadgeClass = "status-active";

        tableBody.innerHTML += `
            <tr>
                <td>
                    <div style="font-weight: 600; color: #1e293b;">${med.name}</div>
                    <div style="font-size: 12px; color: #64748b;">ID: ${med.id} | Vol: ${med.dosage || 'N/A'}</div>
                </td>
                <td><span style="font-weight:500; color:#475569;">${med.shop_id || 'Unknown Shop'}</span></td>
                <td>₹${med.mrp}</td>
                <td><strong>₹${med.selling_price}</strong></td>
                <td><span style="color:#10b981; font-weight:bold;">${discountPercent}% Off</span></td>
                <td><span class="status-badge ${statusBadgeClass}">${med.status || 'Pending'}</span></td>
                <td>
                    <div style="display:flex; gap:6px;">
                        <button class="refund-btn" style="background:#10b981; padding: 6px 10px; font-size:13px;" onclick="approveMedicine('${med.id}')">
                            <i class="fa-solid fa-check"></i> Approve
                        </button>
                        <button class="refund-btn" style="background:#2563eb; padding: 6px 10px; font-size:13px;" onclick="openEditModal('${med.id}', '${med.name}', ${med.mrp}, ${med.selling_price})">
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
    const { error } = await supabaseClient
        .from('medicines')
        .update({ status: 'Approved' })
        .eq('id', id);

    if (!error) {
        alert("Medicine status set to 'Approved' live on app.");
        loadMedicineApprovals();
    } else {
        alert("Error approving product: " + error.message);
    }
}

// এডিট মডাল কন্ট্রোল
function openEditModal(id, name, mrp, selling) {
    document.getElementById('edit-med-id').value = id;
    document.getElementById('edit-med-name').value = name;
    document.getElementById('edit-med-mrp').value = mrp;
    document.getElementById('edit-med-selling').value = selling;
    calculateModalDiscount();
    openPopup('edit-modal');
}

function calculateModalDiscount() {
    const mrp = parseFloat(document.getElementById('edit-med-mrp').value) || 0;
    const selling = parseFloat(document.getElementById('edit-med-selling').value) || 0;
    const discountInput = document.getElementById('edit-med-discount');
    
    if (mrp && selling && mrp > selling) {
        const pct = Math.round(((mrp - selling) / mrp) * 100);
        discountInput.value = `${pct}% Off calculated`;
    } else {
        discountInput.value = `0% / Invalid Price`;
    }
}

async function saveModalEdits() {
    if (!supabaseClient) return;
    const id = document.getElementById('edit-med-id').value;
    const mrp = parseFloat(document.getElementById('edit-med-mrp').value);
    const selling = parseFloat(document.getElementById('edit-med-selling').value);

    if (!mrp || !selling) {
        alert('Please fill in valid prices');
        return;
    }

    const { error } = await supabaseClient
        .from('medicines')
        .update({ mrp: mrp, selling_price: selling })
        .eq('id', id);

    if (!error) {
        alert("Medicine prices updated successfully!");
        loadMedicineApprovals();
        closePopup('edit-modal');
    } else {
        alert("Error updating medicine: " + error.message);
    }
}

async function removeMedicineByModal() {
    if (!supabaseClient) return;
    const id = document.getElementById('edit-med-id').value;
    const confirm_remove = confirm("Permanently remove this medicine?");
    if (!confirm_remove) return;

    const { error } = await supabaseClient
        .from('medicines')
        .delete()
        .eq('id', id);

    if (!error) {
        alert("Medicine removed from system.");
        loadMedicineApprovals();
        closePopup('edit-modal');
    } else {
        alert("Error removing medicine: " + error.message);
    }
}

// ==========================================
// 4. Merchant Payouts Logic
// ==========================================
async function loadMerchantPayouts() {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
        .from('merchant_payouts')
        .select('*')
        .neq('status', 'Settled')
        .order('created_at', { ascending: false });

    if (!error && data) {
        pendingPayouts = data;
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
        tableBody.innerHTML += `
            <tr>
                <td>
                    <div style="font-weight:600;">Order #${payout.order_id || 'N/A'}</div>
                    <div style="font-size:12px; color:#64748b;">Merchant ID: ${payout.shop_id || 'Unknown'}</div>
                </td>
                <td>
                    <div style="font-size:13px; font-weight:500;"><i class="fa-solid fa-shop" style="color:#2563eb;"></i> ${payout.pickup_address || 'Merchant Shop'}</div>
                    <div style="font-size:13px; color:#64748b;"><i class="fa-solid fa-location-dot" style="color:#ef4444;"></i> ${payout.drop_address || 'User Location'}</div>
                </td>
                <td><span style="color:#0f172a; font-weight:700; font-size:16px;">₹${payout.amount}</span></td>
                <td>
                    <div style="font-weight:600; color:#059669;">${payout.payment_mode || 'Online Transfer'}</div>
                    <div style="font-size:11px; color:#94a3b8;">Triggered: ${payout.created_at ? new Date(payout.created_at).toLocaleDateString() : 'Just Now'}</div>
                </td>
                <td>
                    <button class="refund-btn" style="background:#059669;" onclick="clearMerchantPayout(${idx}, '${payout.id}', '${payout.amount}')">
                        <i class="fa-solid fa-money-check-dollar"></i> Dispatch Bank Payout
                    </button>
                </td>
            </tr>
        `;
    });
}

async function clearMerchantPayout(index, id, amount) {
    const verification = prompt(`Type "RELEASE" to dispatch instant credit payment of ₹${amount} directly to merchant account:`);
    if (verification !== "RELEASE") {
        alert("Financial transaction aborted safely.");
        return;
    }

    if (supabaseClient) {
        const { error } = await supabaseClient
            .from('merchant_payouts')
            .update({ status: 'Settled', settled_at: new Date().toISOString() })
            .eq('id', id);

        if (!error) {
            alert("Success! High-speed reversal bank settlement accomplished.");
            loadMerchantPayouts();
            loadMerchantLedger();
        } else {
            alert("Payout processing network failure: " + error.message);
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
            .order('created_at', { ascending: false });

        if (!error && data) {
            merchantLedger = data;
            renderMerchantLedger();
            updateLedgerStats();
        }
    } catch (err) {
        console.error("Ledger load error:", err);
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

    document.getElementById('ledger-total-trans').textContent = totalTrans;
    document.getElementById('ledger-total-amount').textContent = '₹' + totalAmount.toLocaleString('en-IN');
    document.getElementById('ledger-pending-amount').textContent = '₹' + pendingAmount.toLocaleString('en-IN');
    document.getElementById('ledger-avg-settlement').textContent = '₹' + avgSettlement.toLocaleString('en-IN');
}

function filterLedger() {
    const dateFrom = document.getElementById('ledger-date-from').value;
    const dateTo = document.getElementById('ledger-date-to').value;
    const status = document.getElementById('ledger-status-filter').value;

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
}

function exportLedgerMerchant() {
    if (merchantLedger.length === 0) {
        alert('No data to export');
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

    const { data, error } = await supabaseClient
        .from('merchant_kyc')
        .select(`
            id, 
            license_img, 
            license_no, 
            verified, 
            rejection_reason,
            verified_at,
            rejected_at,
            created_at,
            merchants(id, shop_name, owner_name, phone, address, email, license_status)
        `)
        .order('created_at', { ascending: false });

    if (!error && data) {
        onboardingMerchants = data;
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
                <button style="background:#10b981; color:#fff; padding:8px 16px; font-size:14px; border:none; border-radius:6px; cursor:pointer;" onclick="approveKyc('${kyc.id}')"><i class="fa-solid fa-certificate"></i> Re-Approve</button>
            </div>`;
        } else {
            statusBadge = '<span style="background:#fef3c7; color:#d97706; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:700;"><i class="fa-solid fa-clock"></i> Pending</span>';
            actions = `<div style="display:flex; gap:10px; justify-content:flex-end; margin-top:10px;">
                <button style="background:#ef4444; color:#fff; padding:8px 16px; font-size:14px; border:none; border-radius:6px; cursor:pointer;" onclick="rejectKyc('${kyc.id}', '${kyc.merchants?.id || ''}')"><i class="fa-solid fa-xmark"></i> Reject</button>
                <button style="background:#10b981; color:#fff; padding:8px 16px; font-size:14px; border:none; border-radius:6px; cursor:pointer;" onclick="approveKyc('${kyc.id}')"><i class="fa-solid fa-certificate"></i> Approve</button>
            </div>`;
        }

        const borderColor = isVerified ? '#10b981' : isRejected ? '#ef4444' : '#f59e0b';

        container.innerHTML += `
            <div style="border:1px solid #e2e8f0; border-left:4px solid ${borderColor}; margin-bottom:20px; background:#fff; padding:20px; border-radius:8px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px;">
                    <div>
                        <h3 style="color:#0f172a; font-size:18px; margin:0 0 4px 0;">${kyc.merchants?.shop_name || 'Unnamed Pharmacy Store'}</h3>
                        <p style="color:#64748b; font-size:14px; margin:2px 0;"><i class="fa-solid fa-user"></i> Owner: ${kyc.merchants?.owner_name || 'N/A'}</p>
                        <p style="color:#64748b; font-size:14px; margin:2px 0;"><i class="fa-solid fa-phone"></i> ${kyc.merchants?.phone || 'N/A'}</p>
                        <p style="color:#64748b; font-size:14px; margin:2px 0;"><i class="fa-solid fa-envelope"></i> ${kyc.merchants?.email || 'N/A'}</p>
                    </div>
                    <div style="text-align:right;">
                        ${statusBadge}
                        <div style="font-size:12px; font-weight:bold; color:#1e293b; margin-top:6px;">License: ${kyc.license_no || 'REG-PENDING'}</div>
                    </div>
                </div>
                <div style="background:#f8fafc; padding:12px; border-radius:6px; font-size:13px; color:#475569; margin-bottom:15px; border-left:3px solid #2563eb;">
                    <strong>Drug License Proof:</strong> <br>
                    <a href="${kyc.license_img || '#'}" target="_blank" style="color:#2563eb; text-decoration:underline; font-weight:600;"><i class="fa-solid fa-file-pdf"></i> View Document</a>
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
    const check = confirm(`Approve this merchant's license and verify account?`);
    if (!check) return;

    const { error } = await supabaseClient
        .from('merchant_kyc')
        .update({ verified: true, verified_at: new Date().toISOString() })
        .eq('id', id);

    if (error) {
        alert("Error: " + error.message);
        return;
    }

    const { data: kycData } = await supabaseClient
        .from('merchant_kyc')
        .select('merchant_id')
        .eq('id', id)
        .single();

    if (kycData && kycData.merchant_id) {
        await supabaseClient
            .from('merchants')
            .update({ license_status: 'Verified', updated_at: new Date().toISOString() })
            .eq('id', kycData.merchant_id);
    }

    alert("Merchant KYC approved successfully. Account is now verified.");
    loadMerchantVerification();
}

async function rejectKyc(id, merchantId) {
    if (!supabaseClient) return;
    const reason = prompt("Enter rejection reason (visible to merchant):");
    if (!reason) return;

    const { error } = await supabaseClient
        .from('merchant_kyc')
        .update({ verified: false, rejection_reason: reason, rejected_at: new Date().toISOString() })
        .eq('id', id);

    if (error) {
        alert("Error: " + error.message);
        return;
    }

    if (merchantId) {
        await supabaseClient
            .from('merchants')
            .update({ license_status: 'Rejected', updated_at: new Date().toISOString() })
            .eq('id', merchantId);
    }

    alert("Merchant KYC rejected. Merchant has been notified.");
    loadMerchantVerification();
}

let currentKycFilter = 'all';
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
    const target = document.getElementById('merchant-notif-target').value;
    const group = document.getElementById('merchant-id-group');
    if (group) {
        group.style.display = (target === 'individual') ? 'block' : 'none';
    }
}

async function sendMerchantNotification() {
    const target = document.getElementById('merchant-notif-target').value;
    const shopId = document.getElementById('merchant-target-id').value.trim();
    const title = document.getElementById('merchant-notif-title').value.trim();
    const message = document.getElementById('merchant-notif-message').value.trim();

    if (!title || !message) {
        alert("Alert notification headers and system message body cannot be blank!");
        return;
    }

    if (target === 'individual' && !shopId) {
        alert("Please map a target unique Merchant Shop ID!");
        return;
    }

    if (supabaseClient) {
        const { error } = await supabaseClient.from('merchant_alerts').insert({
            target_audience: target,
            shop_id: target === 'individual' ? shopId : null,
            title: title,
            message: message,
            created_at: new Date().toISOString()
        });

        if (!error) {
            alert("Broadcast alert system pipeline successfully deployed!");
            document.getElementById('merchant-notif-title').value = "";
            document.getElementById('merchant-notif-message').value = "";
            document.getElementById('merchant-target-id').value = "";
            closePopup('notifications-modal');
        } else {
            alert("Failed to broadcast alert message: " + error.message);
        }
    }
}