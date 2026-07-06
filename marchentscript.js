// ==========================================
// 🗄️ Supabase Initialization (Instant Client Boot)
// URL & key loaded from supabase-constants.js
// ==========================================
if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_KEY === 'undefined') {

}
if (typeof window.supabaseClientInstance === 'undefined' && typeof window.supabase !== 'undefined') {
    window.supabaseClientInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

const dbSupabase = window.supabaseClientInstance;

// Merchant ID initialization - ensure it's always available
async function ensureMerchantId() {
    let id = localStorage.getItem('merchantId') || localStorage.getItem('merchant_id');
    if (id) { id = parseInt(id); if (!isNaN(id)) { localStorage.setItem('merchantId', id); return id; } }
    try {
        const { data: { session } } = await dbSupabase.auth.getSession();
        if (!session?.user) return null;
        const { data } = await dbSupabase.from('merchants').select('id').eq('email', session.user.email).maybeSingle();
        if (data?.id) { localStorage.setItem('merchantId', data.id); return data.id; }
        const { data: phData } = await dbSupabase.from('merchants').select('id').eq('phone', session.user.phone || '').maybeSingle();
        if (phData?.id) { localStorage.setItem('merchantId', phData.id); return phData.id; }
    } catch (e) {}
    return null;
}

// ==========================================
// 🔔📲 BACKGROUND / OFF-SCREEN PUSH NOTIFICATION ENGINE
// (Fires even when merchant has minimized the tab or switched apps)
// ==========================================
function requestBackgroundNotificationPermission() {
    if ('Notification' in window) {
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission().then(perm => {

            });
        }
    }
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('merchant-sw.js').catch(() => {

        });
    }
}

function playMerchantAlertTone() {
    try {
        if (!window._audioCtx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) window._audioCtx = new AudioCtx();
        }
        const ctx = window._audioCtx;
        if (!ctx) return;
        const notes = [880, 988, 1175, 988, 880];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            osc.type = 'square';
            gain.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.25);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.2);
            osc.start(ctx.currentTime + i * 0.25);
            osc.stop(ctx.currentTime + i * 0.25 + 0.25);
        });
    } catch (e) {

    }
}

// Fires a real OS-level notification (works even if site is backgrounded/minimized)
function fireMerchantBackgroundNotification(title, body, onClickOrderId) {
    playMerchantAlertTone();

    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            const sysNotif = new Notification(title, {
                body: body,
                icon: '1779304435608.png',
                badge: '1779304435608.png',
                tag: 'medifinder-merchant-order',
                requireInteraction: true,
                vibrate: [250, 100, 250]
            });
            sysNotif.onclick = () => {
                window.focus();
                if (onClickOrderId) {
                    localStorage.setItem('pendingBroadcastOrderId', onClickOrderId);
                    window.location.href = 'marchentdboyrequest.html';
                }
                sysNotif.close();
            };
        } catch (e) {

        }
    }
}

// ==========================================
// 🛡️ SECURITY & LOGIN PROTECTION BLOCK (ASYNC SESSION CAPTURE)
// ==========================================
(async () => {
    try {
        if (!dbSupabase) return;
        const { data } = await dbSupabase.auth.getSession();
        if (!data || !data.session) {
            window.location.replace("index.html");
            return;
        }
        localStorage.setItem("merchantSessionActive", "true");
        if (data.session.user) {
            localStorage.setItem("userEmail", data.session.user.email);
        }
    } catch (e) {
        window.location.replace("index.html");
    }
})();

// ==========================================
// 🌐 GLOBAL WINDOW SCOPE POPUP & LOGOUT HANDLERS
// ==========================================
window.openPopup = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        if (modalId === 'geoModal') {
            setTimeout(() => { 
                if (typeof window.invalidateProfileMapInstance === 'function') {
                    window.invalidateProfileMapInstance(); 
                }
            }, 300);
        }
    }
};

window.closePopup = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('show');
};

window.closePopupOutside = function(event, modalId) {
    if (event.target === event.currentTarget) {
        window.closePopup(modalId);
    }
};

window.handleTerminalLogout = async function(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    showConfirmationModal("Are you sure you want to logout?", async () => {
        try {
            if (dbSupabase?.auth) {
                await dbSupabase.auth.signOut();
            }
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace("index.html");
        } catch (err) {

            localStorage.clear();
            sessionStorage.clear();
            window.location.replace("index.html");
        }
    });
};

// Global State Management
let currentEditingId = null;
let profileMapInstance = null;
let profileMapMarker = null;
let globalLat = null;
let globalLon = null;
let currentMerchantData = null;

// ==========================================
// 👤 আপডেট করা KYC ফাংশন (লাইসেন্স আপলোডের জন্য)
// ==========================================
async function saveMerchantKyc(fileUrl, licenseNo) {
    let targetMerchantId = window.currentMerchantId || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
    if (!targetMerchantId) throw new Error('Merchant ID not found');
    targetMerchantId = parseInt(targetMerchantId, 10);
    if (isNaN(targetMerchantId)) throw new Error('Invalid Merchant ID');

    const { data: existingData } = await dbSupabase
        .from('merchant_kyc')
        .select('id')
        .eq('merchant_id', targetMerchantId)
        .maybeSingle();

    let query;
    if (existingData) {
        query = dbSupabase.from('merchant_kyc').update({ 
            license_img: fileUrl, 
            license_no: licenseNo, 
            verified: false 
        }).eq('id', existingData.id);
    } else {
        query = dbSupabase.from('merchant_kyc').insert({ 
            merchant_id: targetMerchantId, 
            license_img: fileUrl, 
            license_no: licenseNo,
            verified: false 
        });
    }

    const { error } = await query;
    if (error) throw error;
}

// Run all modules on DOM Content Loaded
document.addEventListener("DOMContentLoaded", async () => {

    if (!dbSupabase) {

        return;
    }

    await ensureMerchantId();

    const cachedAvatar = localStorage.getItem('merchant_avatar');
    if (cachedAvatar) {
        const profileImg = document.getElementById('profileDisplay');
        if (profileImg) profileImg.src = cachedAvatar;
        const headerImg = document.getElementById('headerAvatar');
        if (headerImg) headerImg.src = cachedAvatar;
        const sidebarImg = document.getElementById('sidebarAvatar');
        if (sidebarImg) sidebarImg.src = cachedAvatar;
    }

    try {
        const { data: { session } } = await dbSupabase.auth.getSession();
        if (!session && !localStorage.getItem("merchantSessionActive")) {
            window.location.replace("index.html");
            return;
        }
    } catch (secErr) {

        window.location.replace("index.html");
        return;
    }

    const isLoaded = await loadCurrentMerchantStatus();
    if (!isLoaded) {

    }

    initNotificationSystem();
    requestBackgroundNotificationPermission();

    if (document.getElementById('medicineGrid')) {
        initHomePage();
    }
    if (document.getElementById('medicineForm') || document.getElementById('medImageInput') || document.getElementById('btnDraft')) {
        initAddMedicinePage();
    }
    if (document.getElementById('merchantNameInput') || document.getElementById('btnDropMapPin') || document.getElementById('langSelect') || document.getElementById('btnSaveStoreCore') || document.getElementById('btnSaveGeoAddress') || document.getElementById('btnSaveBankDetails')) {
        initProfilePage();
    }
    if (document.getElementById('btnBroadcast') || document.getElementById('orderIdSelect')) {
        initDeliveryPage();
    }
    if (document.getElementById('totalReceivedDisplay') || document.getElementById('tradingSvg')) {
        initPaymentAnalyticsPage();
    }
    
    initGlobalFeatures();
});

// ==========================================
// 🔔 NOTIFICATION & LIVE MESSAGING SYSTEM
// ==========================================
function initNotificationSystem() {
    const notifContainer = document.getElementById('notificationContainer') || createNotificationContainer();
    if (notifContainer) notifContainer.innerHTML = ''; 

    if (window._liveOrdersChannel) { dbSupabase.removeChannel(window._liveOrdersChannel); }
    if (window._profileAlertsChannel) { dbSupabase.removeChannel(window._profileAlertsChannel); }

    window._liveOrdersChannel = dbSupabase
        .channel('live-orders')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
            const order = payload.new;
            const marginProfit = ((Number(order.total_amount) || 0) * 0.20).toFixed(2);
            
            showCustomNotification(
                `🛒 Live Order Received! Profit: ₹${marginProfit}`,
                `Order ID: ${order.id || 'N/A'}. Value: ₹${order.total_amount}. Click to broadcast to riders.`,
                order.id,
                'order'
            );

            // 📲 Also fire a real background/system notification so the merchant
            // gets alerted even if this site tab is minimized or not in focus.
            fireMerchantBackgroundNotification(
                `🛒 New Order Received! Profit: ₹${marginProfit}`,
                `Order ID: ${order.id || 'N/A'} • Value: ₹${order.total_amount}. Tap to broadcast to delivery riders.`,
                order.id
            );
        })
        .subscribe();

    window._profileAlertsChannel = dbSupabase
        .channel('profile-alerts')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'merchants' }, payload => {
            const merchant = payload.new;
            const verifyStatusEl = document.getElementById('verifyStatus');
            if (merchant.license_status === 'Verified') {
                showCustomNotification(
                    `✅ Account Verified!`,
                    `Admin has verified your Government License Hub. Your shop is now official.`,
                    null,
                    'profile'
                );
                fireMerchantBackgroundNotification(
                    `✅ Account Verified!`,
                    `Admin has verified your Government License Hub. Your shop is now official.`,
                    null
                );
                if (verifyStatusEl) {
                    verifyStatusEl.innerText = "Verified";
                    verifyStatusEl.className = "status-pill verified";
                    verifyStatusEl.style.background = "#2e7d32";
                }
            } else if (merchant.license_status === 'Pending') {
                if (verifyStatusEl) {
                    verifyStatusEl.innerText = "Pending Review";
                    verifyStatusEl.className = "status-pill pending";
                    verifyStatusEl.style.background = "#ffa000";
                    verifyStatusEl.style.color = "#fff";
                }
            } else if (merchant.license_status === 'Rejected') {
                showCustomNotification(
                    `License Rejected`,
                    `Admin has rejected your license. Please re-upload a valid drug license.`,
                    null,
                    'profile'
                );
                fireMerchantBackgroundNotification(
                    `License Rejected`,
                    `Admin has rejected your license. Please re-upload a valid drug license.`,
                    null
                );
                if (verifyStatusEl) {
                    verifyStatusEl.innerText = "Rejected";
                    verifyStatusEl.className = "status-pill rejected";
                    verifyStatusEl.style.background = "#ef4444";
                    verifyStatusEl.style.color = "#fff";
                }
            }
        })
        .subscribe();

    if (window._merchantNotifsChannel) { dbSupabase.removeChannel(window._merchantNotifsChannel); }
    window._merchantNotifsChannel = dbSupabase
        .channel('merchant-notifs-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'merchant_notifications' }, payload => {
            const n = payload.new;
            const merchantId = localStorage.getItem('merchantId') || localStorage.getItem('merchant_id');
            if (n.merchant_id && String(n.merchant_id) !== String(merchantId)) return;
            showCustomNotification(
                `🔔 ${n.title || 'Notification'}`,
                n.message || '',
                null,
                n.type === 'order' ? 'order' : 'profile'
            );
            fireMerchantBackgroundNotification(
                n.title || 'Notification',
                n.message || '',
                null
            );
            const badge = document.getElementById('notifBadge');
            if (badge) {
                const current = parseInt(badge.textContent) || 0;
                badge.textContent = current + 1;
                badge.style.display = 'inline-flex';
            }
        })
        .subscribe();
}

function showCustomNotification(title, message, orderId, type) {
    const notifContainer = document.getElementById('notificationContainer') || createNotificationContainer();
    const notif = document.createElement('div');
    notif.className = `custom-notification-toast local-${type}`;
    notif.style = 'background: #fff; border-left: 5px solid #ff4d4d; padding: 15px; margin: 10px 0; border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); cursor: pointer; animation: slideIn 0.3s ease;';
    
    if (type === 'order') {
        notif.style.borderLeftColor = '#ff4d4d'; 
    } else {
        notif.style.borderLeftColor = '#00e676'; 
    }

    notif.innerHTML = `
        <strong style="color: #2e7d32; display: flex; align-items: center; gap: 8px;">${title}</strong>
        <p style="margin: 5px 0 0 0; font-size: 13px; color: #555;">${message}</p>
    `;
    
    notif.addEventListener('click', () => {
        if (orderId) {
            localStorage.setItem('pendingBroadcastOrderId', orderId);
            window.location.href = 'marchentdboyrequest.html'; 
        }
    });
    
    notifContainer.appendChild(notif);
    setTimeout(() => {
        notif.style.opacity = '0';
        setTimeout(() => notif.remove(), 300);
    }, 8000);
}

function createNotificationContainer() {
    let container = document.getElementById('notificationContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notificationContainer';
        container.style = 'position: fixed; top: 20px; right: 20px; z-index: 9999; max-width: 320px;';
        document.body.appendChild(container);
    }
    return container;
}

// ... আপনার বাকি ফাংশনগুলো (initHomePage, initAddMedicinePage, initDeliveryPage, initPaymentAnalyticsPage, initProfilePage, initGlobalFeatures, loadCurrentMerchantStatus) এখানে আগের মতোই থাকবে। আমি সেগুলো এখানে নতুন করে দিচ্ছি না কারণ সেগুলো অলরেডি আপনার কাছে আছে এবং আমি কোনোটাই ডিলিট করিনি।
// [এখানে আপনার বাকি ফাংশনগুলো যেমন: initHomePage, initAddMedicinePage, initDeliveryPage, 
// initPaymentAnalyticsPage, initProfilePage, initGlobalFeatures, loadCurrentMerchantStatus 
// আগের মতোই থাকবে।]
// ==========================================
// 🏠 HOME PAGE LOGIC (MEDICINE LIST & REVENUE + REALTIME LISTENER)
// ==========================================
async function initHomePage() {
    const medicineGrid = document.getElementById('medicineGrid');
    const searchInput = document.getElementById('medicineSearch');
    const filterSelect = document.getElementById('filterBottom') || document.getElementById('categoryFilter');
    const searchIcon = document.getElementById('searchIconTrigger');
    const totalEarningsEl = document.getElementById('totalEarningsDisplay'); 
    const revenueSection = document.getElementById('revenueVisualizerCard'); 

    let currentFilter = 'all';

    async function updateLiveEarnings() {
        try {
            let activeMerchantId = window.currentMerchantId || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
            if (!activeMerchantId) return;

            const { data: orders, error } = await dbSupabase
                .from('orders')
                .select('total_amount, status')
                .eq('merchant_id', activeMerchantId)
                .eq('status', 'delivered');
            if (error) throw error;

            if (orders && orders.length > 0) {
                if (revenueSection) revenueSection.style.display = 'block'; 
                
                let totalRevenue = orders.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);
                let totalProfit = (totalRevenue * 0.20).toFixed(2); 
                
                if (totalEarningsEl) {
                    totalEarningsEl.innerText = `₹${totalProfit}`;
                }
            } else {
                if (revenueSection) revenueSection.style.display = 'none'; 
            }
        } catch (err) {
            showToast("Earnings update error: " + (err.message || err), "error");
        }
    }

    async function fetchMedicines(searchQuery = '') {
        try {
            let activeMerchantId = window.currentMerchantId || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
            if (!activeMerchantId) return;

            let query = dbSupabase.from('medicines').select('*').eq('merchant_id', activeMerchantId);
            
            if (searchQuery) query = query.ilike('product_name', `%${searchQuery}%`);
            if (currentFilter && currentFilter !== 'all') query = query.eq('dosage_form', currentFilter);

            query = query.order('id', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;

            renderMedicines(data);
            await updateLiveEarnings();
        } catch (error) {
            showToast("Medicines load error: " + (error.message || error), "error");
        }
    }

    let activeMerchantId = window.currentMerchantId || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
    if (activeMerchantId) {
        if (window._medicinesChannel) { dbSupabase.removeChannel(window._medicinesChannel); }
        window._medicinesChannel = dbSupabase
            .channel('realtime-medicines')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'medicines', filter: `merchant_id=eq.${activeMerchantId}` }, () => {
                fetchMedicines(searchInput ? searchInput.value : '');
            })
            .subscribe();
    }

    function renderMedicines(medicines) {
        if (!medicineGrid) return;
        medicineGrid.innerHTML = '';

        if (!medicines || medicines.length === 0) {
            medicineGrid.innerHTML = `<div style="text-align:center; width:100%; padding:20px; color:#888;">No medicines found.</div>`;
            return;
        }

        medicines.forEach(med => {
            const isPending = med.status === 'Pending';
            const isSuspended = med.status === 'Suspended' || (med.stock_qty || 0) <= 0;
            
            const card = document.createElement('div');
            card.className = `medicine-card standard-shadow`;
            if (isSuspended || isPending) card.style.opacity = '0.65';
            
            if(med.stock_qty > 0 && med.stock_qty <= 5) {
                showCustomNotification("Stock Warning!", `${med.product_name} is running out of stock. Please restock soon.`, med.id, 'profile');
                fireMerchantBackgroundNotification("⚠️ Stock Warning!", `${med.product_name} is running out of stock (${med.stock_qty} left). Please restock soon.`, null);
            }

            let statusBadge = '';
            let toggleStatusButton = '';

            if (isPending) {
                statusBadge = `<span class="stock-badge out-of-stock" style="background:#ffa000; color:#fff;">Pending Admin Approval</span>`;
                toggleStatusButton = `<button class="action-btn" style="background: #cccccc; color: #666; border:none; padding: 5px 8px; border-radius:3px; margin: 0 2px; cursor:not-allowed;" disabled><i class="fa-solid fa-clock"></i> Waiting</button>`;
            } else if (isSuspended) {
                statusBadge = `<span class="stock-badge out-of-stock">Currently Unavailable</span>`;
                toggleStatusButton = `<button class="action-btn start-action" data-id="${med.id}" style="background: #2e7d32; color: #fff; border:none; padding: 5px 8px; border-radius:3px; margin: 0 2px; cursor:pointer;"><i class="fa-solid fa-play"></i> Start</button>`;
            } else {
                statusBadge = `<span class="stock-badge in-stock">Active / Live</span>`;
                toggleStatusButton = `<button class="action-btn stop-action" data-id="${med.id}" style="background: #ffa000; color: #fff; border:none; padding: 5px 8px; border-radius:3px; margin: 0 2px; cursor:pointer;"><i class="fa-solid fa-hand"></i> Stop</button>`;
            }

            card.innerHTML = `
                <div class="card-image-area">
                    <img src="${med.image_url || 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=500'}" alt="${med.product_name}" class="med-image">
                    ${statusBadge}
                </div>
                <div class="card-details">
                    <span class="med-category">${med.dosage_form}</span>
                    <h3 class="med-name">${med.product_name}</h3>
                    <p class="med-company">By ${med.manufacturer}</p>
                    <div class="card-meta">
                        <div class="price-tag">
                            <span class="currency">₹</span><span class="price-val">${med.unit_price}</span>
                            <span class="per-strip">/ ${med.unit_type || 'Strip'}</span>
                        </div>
                        <div class="qty-status">
                            <span class="qty-count">${med.stock_qty}</span> Pcs left
                        </div>
                    </div>
                    <div class="card-actions">
                        <button class="action-btn edit-action" data-id="${med.id}"><i class="fa-regular fa-pen-to-square"></i> Edit</button>
                        ${toggleStatusButton}
                        <button class="action-btn delete-action" data-id="${med.id}" style="background:#d32f2f; color:#fff;"><i class="fa-regular fa-trash-can"></i> Delete</button>
                    </div>
                </div>
            `;
            medicineGrid.appendChild(card);
        });

        attachCardEvents();
    }

    function attachCardEvents() {
        document.querySelectorAll('.edit-action').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.closest('button').dataset.id;
                const { data, error } = await dbSupabase.from('medicines').select('*').eq('id', id).single();
                if(!error) {
                    localStorage.setItem('editMedicineData', JSON.stringify(data));
                    window.location.href = 'marchentadd.html'; 
                } else {
                    showToast("Failed to load medicine: " + (error.message || error), "error");
                }
            });
        });

        document.querySelectorAll('.start-action').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.closest('button').dataset.id;
                await dbSupabase.from('medicines').update({ status: 'Active' }).eq('id', id);
            });
        });

        document.querySelectorAll('.stop-action').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.closest('button').dataset.id;
                await dbSupabase.from('medicines').update({ status: 'Suspended' }).eq('id', id);
            });
        });

        document.querySelectorAll('.delete-action').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const id = e.target.closest('button').dataset.id;
                showConfirmationModal("Are you sure you want to delete this medicine permanently?", async () => {
                    try {
                        const { error } = await dbSupabase.from('medicines').delete().eq('id', id);
                        if (error) throw error;
                        showToast("Medicine deleted successfully", "success");
                    } catch (err) { showToast("Delete failed: " + err.message, "error"); }
                });
            });
        });
    }

    if (filterSelect) { filterSelect.addEventListener('change', (e) => { currentFilter = e.target.value; fetchMedicines(searchInput ? searchInput.value : ''); }); }
    if (searchIcon) { searchIcon.addEventListener('click', () => { fetchMedicines(searchInput ? searchInput.value : ''); }); }
    if (searchInput) { searchInput.addEventListener('input', (e) => { fetchMedicines(e.target.value); }); }

    fetchMedicines();
}

// ==========================================
// ➕ ২. ADD MEDICINE PAGE LOGIC (WITH STORAGE INTEGRATION)
// ==========================================
function initAddMedicinePage() {
    let currentStep = 1;
    const totalSteps = 3;
    const btnNext = document.getElementById('btnNext');
    const btnBack = document.getElementById('btnBack');
    const btnDraft = document.getElementById('btnDraft');

    const editDataStr = localStorage.getItem('editMedicineData');
    if (editDataStr) {
        try {
            const editData = JSON.parse(editDataStr);
            currentEditingId = editData.id;
            if (document.getElementById('prodName')) document.getElementById('prodName').value = editData.product_name || '';
            if (document.getElementById('composition')) document.getElementById('composition').value = editData.composition || '';
            if (document.getElementById('dosageForm')) document.getElementById('dosageForm').value = editData.dosage_form || 'Tablets';
            if (document.getElementById('strength')) document.getElementById('strength').value = editData.strength || '';
            if (document.getElementById('manufacturer')) document.getElementById('manufacturer').value = editData.manufacturer || '';
            if (document.getElementById('prescriptionReq')) document.getElementById('prescriptionReq').value = editData.prescription_req || 'No';
            if (document.getElementById('mfdDate')) document.getElementById('mfdDate').value = editData.mfd_date || '';
            if (document.getElementById('expiryDate')) document.getElementById('expiryDate').value = editData.expiry_date || '';
            if (document.getElementById('batchNumber')) document.getElementById('batchNumber').value = editData.batch_number || '';
            if (document.getElementById('storageCondition')) document.getElementById('storageCondition').value = editData.storage_condition || 'Below 30°C';
            if (document.getElementById('unitPrice')) document.getElementById('unitPrice').value = editData.unit_price || '';
            if (document.getElementById('mrpPrice')) document.getElementById('mrpPrice').value = editData.mrp || '';
            if (document.getElementById('discountPct')) {
                const mrp = parseFloat(editData.mrp) || 0;
                const price = parseFloat(editData.unit_price) || 0;
                document.getElementById('discountPct').value = (mrp > 0 && price > 0 && price < mrp) ? Math.round(((mrp - price) / mrp) * 100) : '';
            }
            if (document.getElementById('drugType')) document.getElementById('drugType').value = editData.drug_type || 'Branded';
            if (document.getElementById('stockQty')) document.getElementById('stockQty').value = editData.stock_qty || '';
            if (document.getElementById('unitType')) document.getElementById('unitType').value = editData.unit_type || 'Strip';
            if (document.getElementById('rackLocation')) document.getElementById('rackLocation').value = editData.rack_location || '';
            if (document.getElementById('sideEffects')) document.getElementById('sideEffects').value = editData.side_effects || '';
            if (document.getElementById('productDescription')) document.getElementById('productDescription').value = editData.description || '';
            // Load existing image if available
            if (editData.image_url) {
                const img1 = document.getElementById('imagePreview1');
                if (img1) { img1.src = editData.image_url; img1.style.display = 'block'; img1.parentElement.classList.add('has-img'); }
            }
            localStorage.removeItem('editMedicineData'); 
        } catch (e) {}
    }

    function updateStepForm() {
        for (let i = 1; i <= totalSteps; i++) {
            const panel = document.getElementById(`step-panel-${i}`);
            const ind = document.getElementById(`ind-${i}`);
            const line = document.getElementById(`line-${i}`);
            if (panel) panel.classList.remove('active');
            if (ind) ind.classList.remove('active');
            if (line) line.classList.remove('active');
        }
        const activePanel = document.getElementById(`step-panel-${currentStep}`);
        const activeInd = document.getElementById(`ind-${currentStep}`);
        if (activePanel) activePanel.classList.add('active');
        if (activeInd) activeInd.classList.add('active');
        
        for (let i = 1; i < currentStep; i++) { 
            const activeLine = document.getElementById(`line-${i}`);
            if (activeLine) activeLine.classList.add('active'); 
        }
        if (btnBack) {
            if (currentStep === 1) { btnBack.setAttribute('disabled', 'true'); } else { btnBack.removeAttribute('disabled'); }
        }
        if (btnNext) {
            if (currentStep === totalSteps) { btnNext.innerHTML = 'Publish to Admin <i class="fa-solid fa-cloud-arrow-up"></i>'; } else { btnNext.innerHTML = 'Next <i class="fa-solid fa-arrow-right"></i>'; }
        }
    }

    if (btnNext) {
        btnNext.addEventListener('click', async () => {
            if (currentStep < totalSteps) {
                if (currentStep === 1) {
                    const prodName = document.getElementById('prodName')?.value;
                    if (!prodName) { showToast("Please enter the product name before going to next step", "error"); return; }
                }
                currentStep++;
                updateStepForm();
            } else {
                await saveMedicineToSupabase('Pending');
            }
        });
    }
    if (btnBack) { btnBack.addEventListener('click', () => { if (currentStep > 1) { currentStep--; updateStepForm(); } }); }
    if (btnDraft) { btnDraft.addEventListener('click', async () => { await saveMedicineToSupabase('Suspended'); }); }

    async function uploadMedicineImage() {
        const fileInput = document.getElementById('fileInput1');
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) return null;

        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_medicine.${fileExt}`;
        const filePath = `products/${fileName}`;

        const { error: uploadError } = await dbSupabase.storage
            .from('products') 
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = dbSupabase.storage
            .from('products')
            .getPublicUrl(filePath);

        return publicUrl;
    }

    async function uploadAllMedicineImages() {
        const urls = [];
        for (let i = 1; i <= 4; i++) {
            const fileInput = document.getElementById('fileInput' + i);
            if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                urls.push(null);
                continue;
            }
            const file = fileInput.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${i}_medicine.${fileExt}`;
            const filePath = `products/${fileName}`;
            const { error: uploadError } = await dbSupabase.storage.from('products').upload(filePath, file);
            if (uploadError) { urls.push(null); continue; }
            const { data: { publicUrl } } = dbSupabase.storage.from('products').getPublicUrl(filePath);
            urls.push(publicUrl);
        }
        return urls;
    }

    async function saveMedicineToSupabase(targetStatus) {
        const activeId = window.currentMerchantId || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
        if (!activeId) { showToast("Error: Merchant session identifier not found.", "error"); return; }

        try {
            const { data: merchantData, error: merchantError } = await dbSupabase.from('merchants').select('license_status').eq('id', activeId).single();
            if (merchantError || !merchantData || merchantData.license_status !== 'Verified') {
                showToast("Error: Your merchant account must be verified by the administrator before listing items.", "error");
                return;
            }
        } catch (e) { showToast("Verification check failed.", "error"); return; }

        const prodName = document.getElementById('prodName')?.value || '';
        const composition = document.getElementById('composition')?.value || '';
        const dosageForm = document.getElementById('dosageForm')?.value || 'Tablets';
        const strength = document.getElementById('strength')?.value || '';
        const manufacturer = document.getElementById('manufacturer')?.value || '';
        const prescriptionReq = document.getElementById('prescriptionReq')?.value || 'No';
        const productDescription = document.getElementById('productDescription')?.value || '';
        const mfdDate = document.getElementById('mfdDate')?.value || null;
        const expiryDate = document.getElementById('expiryDate')?.value || null;
        const batchNumber = document.getElementById('batchNumber')?.value || '';
        const storageCondition = document.getElementById('storageCondition')?.value || 'Below 30°C';
        const unitPrice = parseFloat(document.getElementById('unitPrice')?.value) || 0;
        const mrpPrice = parseFloat(document.getElementById('mrpPrice')?.value) || null;
        const drugType = document.getElementById('drugType')?.value || 'Branded';
        const stockQty = parseInt(document.getElementById('stockQty')?.value) || 0;
        const unitType = document.getElementById('unitType')?.value || 'Strip';
        const rackLocation = document.getElementById('rackLocation')?.value || '';
        const sideEffects = document.getElementById('sideEffects')?.value || '';
        const category = dosageForm;

        if (!prodName || !unitPrice || !stockQty) { showToast("Please complete mandatory fields: Product Name, Price, and Stock.", "error"); return; }

        try {
            // Show loading
            const nextBtn = document.getElementById('btnNext');
            const draftBtn = document.getElementById('btnDraft');
            if (nextBtn) { nextBtn.disabled = true; nextBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }
            if (draftBtn) { draftBtn.disabled = true; }

            // Upload all images
            let imageUrls = await uploadAllMedicineImages();
            let mainImageUrl = imageUrls[0] || null;

            let response;
            const rawId = window.currentMerchantId || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id')) || localStorage.getItem('merchant_id');
            const activeMerchantId = rawId ? parseInt(rawId) : null;
            
            const medicineObject = {
                merchant_id: activeMerchantId,
                product_name: prodName,
                composition: composition,
                dosage_form: dosageForm,
                strength: strength,
                manufacturer: manufacturer,
                prescription_req: prescriptionReq,
                description: productDescription,
                mfd_date: mfdDate,
                expiry_date: expiryDate,
                batch_number: batchNumber,
                storage_condition: storageCondition,
                unit_price: unitPrice,
                mrp: mrpPrice,
                selling_price: unitPrice,
                drug_type: drugType,
                stock_qty: stockQty,
                unit_type: unitType,
                rack_location: rackLocation,
                side_effects: sideEffects,
                category: category,
                status: targetStatus
            };

            if (mainImageUrl) {
                medicineObject.image_url = mainImageUrl;
            }

            if (currentEditingId) { 
                response = await dbSupabase.from('medicines').update(medicineObject).eq('id', currentEditingId); 
            } else { 
                response = await dbSupabase.from('medicines').insert([medicineObject]); 
            }
            if (response.error) throw response.error;
            
            if (targetStatus === 'Pending') { 
                showToast("Medicine uploaded successfully. Waiting for Admin approval.", "success"); 
                window.location.href = 'marchenthome.html'; 
            } else { 
                showToast("Saved as draft.", "success"); 
                window.location.href = 'marchenthome.html'; 
            }
        } catch (error) { 
            showToast("Save failed: " + error.message, "error");
            const nextBtn = document.getElementById('btnNext');
            const draftBtn = document.getElementById('btnDraft');
            if (nextBtn) { nextBtn.disabled = false; nextBtn.innerHTML = 'Next <i class="fa-solid fa-arrow-right"></i>'; }
            if (draftBtn) { draftBtn.disabled = false; }
        }
    }
}

// ==========================================
// 🚚 DELIVERY AND FLEET DISTRIBUTION LOGIC
// ==========================================
function initDeliveryPage() {
    const btnVerifyOrder = document.getElementById('btnVerifyOrder');
    const verifyText = document.getElementById('verifyText');
    const btnBroadcast = document.getElementById('btnBroadcast');
    const rxVerificationBox = document.getElementById('rxVerificationBox');
    const chkConfirmItems = document.getElementById('chkConfirmItems');
    const prescriptionVaultSection = document.getElementById('prescriptionVaultSection');
    const productPreviewArea = document.getElementById('productPreviewArea');
    const riderStatusBox = document.getElementById('riderStatusBox');

    const liabilityModal = document.getElementById('liabilityModal');
    const btnModalConfirm = document.getElementById('btnModalConfirm');
    const btnModalCancel = document.getElementById('btnModalCancel');

    let orderRequiresRx = true; 
    let verifiedOrder = null;

    if (btnVerifyOrder) {
        btnVerifyOrder.addEventListener('click', async () => {
            const orderInput = document.getElementById('orderIdSelect');
            const rawOrderId = (orderInput?.value || '').replace('#', '').trim();
            if (!rawOrderId) { showToast('Please enter an Order ID', 'error'); return; }

            btnVerifyOrder.classList.add('loading');
            if (verifyText) verifyText.innerText = "Verifying...";

            try {
                const mid = window.currentMerchantId || localStorage.getItem('merchantId') || localStorage.getItem('merchant_id');
                let query = dbSupabase.from('orders').select('*, items_text, items_img, address, total_amount, customer_name, user_email, prescription_url').eq('order_id', rawOrderId);
                if (mid) query = query.eq('merchant_id', mid);
                const { data: order, error } = await query.single();
                if (error || !order) {
                    showToast('Order not found or not yours', 'error');
                    btnVerifyOrder.classList.remove('loading');
                    if (verifyText) verifyText.innerText = "Verify";
                    return;
                }

                verifiedOrder = order;

                if (document.getElementById('distanceSelector')) document.getElementById('distanceSelector').value = "12";
                if (document.getElementById('autoVehicle')) document.getElementById('autoVehicle').value = "Bike Delivery (Rider)";
                if (document.getElementById('deliverySpeed')) document.getElementById('deliverySpeed').value = "Super Fast Delivery (Within 30 Mins)";
                if (document.getElementById('pickupAddress')) document.getElementById('pickupAddress').value = order.address || "Medi Care Pharmacy";
                if (document.getElementById('deliveryAddress')) document.getElementById('deliveryAddress').value = order.delivery_address || order.address || "Customer Address";

                if (productPreviewArea) {
                    productPreviewArea.style.display = 'block';
                    const itemsHtml = (order.items_text || '').split(',').map(item => {
                        const parts = item.split('|');
                        const name = parts[0] || 'Item';
                        const qty = parts[1] || '1';
                        return `<div class="item-mini-card"><div class="item-info"><h5>${name} <span class="item-qty">x ${qty}</span></h5></div></div>`;
                    }).join('');
                    const h4 = productPreviewArea.querySelector('h4');
                    if (h4 && itemsHtml) h4.insertAdjacentHTML('afterend', itemsHtml);
                }

                if (order.prescription_url) {
                    if (prescriptionVaultSection) prescriptionVaultSection.style.display = 'block';
                    const rxImg = document.getElementById('customerRxImage');
                    if (rxImg) rxImg.src = order.prescription_url;
                }

                const hasRx = /\brx\b/i.test(order.items_text || '');
                orderRequiresRx = hasRx;

                if (orderRequiresRx) {
                    if (rxVerificationBox) rxVerificationBox.style.display = 'block';
                    if (btnBroadcast) { btnBroadcast.setAttribute('disabled', 'true'); btnBroadcast.style.opacity = "0.5"; }
                } else {
                    if (prescriptionVaultSection) prescriptionVaultSection.style.display = 'none';
                    if (rxVerificationBox) rxVerificationBox.style.display = 'none';
                    if (btnBroadcast) { btnBroadcast.removeAttribute('disabled'); btnBroadcast.style.opacity = "1"; }
                }

                if (riderStatusBox) riderStatusBox.innerHTML = '<span class="status-badge active-ready"><i class="fa-solid fa-circle-info"></i> Awaiting Inventory Checklist Confirmation</span>';

                btnVerifyOrder.classList.remove('loading');
                btnVerifyOrder.innerHTML = '<i class="fa-solid fa-circle-check"></i> Verified';
                btnVerifyOrder.style.background = '#e6fffa';
                btnVerifyOrder.style.color = '#00a389';
                btnVerifyOrder.style.borderColor = '#b2f5ea';
            } catch (err) {

                showToast('Verification failed. Try again.', 'error');
                btnVerifyOrder.classList.remove('loading');
                if (verifyText) verifyText.innerText = "Verify";
            }
        });
    }

    if (chkConfirmItems) {
        chkConfirmItems.addEventListener('change', (e) => {
            if (e.target.checked) {
                if (liabilityModal) liabilityModal.classList.add('show');
            } else {
                if (btnBroadcast) {
                    btnBroadcast.setAttribute('disabled', 'true');
                    btnBroadcast.style.opacity = "0.5";
                }
                if(riderStatusBox) {
                    riderStatusBox.innerHTML = '<span class="status-badge active-ready"><i class="fa-solid fa-circle-info"></i> Awaiting Inventory Checklist Confirmation</span>';
                }
            }
        });
    }

    if (btnModalConfirm) {
        btnModalConfirm.addEventListener('click', () => {
            if (liabilityModal) liabilityModal.classList.remove('show');
            if (btnBroadcast) {
                btnBroadcast.removeAttribute('disabled');
                btnBroadcast.style.opacity = "1";
            }
            if(riderStatusBox) {
                riderStatusBox.innerHTML = '<span class="status-badge active-ready" style="background:#e6fffa; color:#00a389;"><i class="fa-solid fa-spinner fa-spin"></i> Ready to Broadcast to Fleet</span>';
            }
        });
    }

    if (btnModalCancel) {
        btnModalCancel.addEventListener('click', () => {
            if (liabilityModal) liabilityModal.classList.remove('show');
            if (chkConfirmItems) chkConfirmItems.checked = false; 
            if (btnBroadcast) {
                btnBroadcast.setAttribute('disabled', 'true');
                btnBroadcast.style.opacity = "0.5";
            }
        });
    }

    if (btnBroadcast) {
        btnBroadcast.addEventListener('click', async () => {
            if (orderRequiresRx && (!chkConfirmItems || !chkConfirmItems.checked)) {
                showToast("Broadcast locked: You must check the validation box matching prescription details first.", "error");
                return;
            }
            const broadcastOrderId = document.getElementById('orderIdSelect')?.value?.replace('#', '').trim() || '';
            const mid = window.currentMerchantId || localStorage.getItem('merchantId') || localStorage.getItem('merchant_id');
            let broadcastSuccess = false;
            try {
                const { error: brErr } = await dbSupabase.from('delivery_requests').insert([{
                    order_id: broadcastOrderId,
                    merchant_id: mid || null,
                    status: 'broadcast',
                    created_at: new Date().toISOString()
                }]);
                if (brErr) throw brErr;
                if (verifiedOrder) {
                    await dbSupabase.from('orders').update({ status: 'broadcasted' }).eq('order_id', broadcastOrderId);
                }
                broadcastSuccess = true;
            } catch (dbErr) {
                showToast("Broadcast DB error: " + (dbErr.message || dbErr), "error");
            }
            if (broadcastSuccess) {
                showToast("Broadcast published to fleet stream successfully.", "success");
            } else {
                showToast("Broadcast failed. Please try again.", "error");
            }
            if (broadcastSuccess) {
                fireMerchantBackgroundNotification(
                    "Order Broadcasted to Fleet!",
                    `Order ${broadcastOrderId} has been published to the rider pool successfully.`,
                    null
                );
            }
            if (riderStatusBox) riderStatusBox.innerHTML = broadcastSuccess
                ? '<span class="status-badge active-ready" style="background:#e6fffa; color:#00a389;"><i class="fa-solid fa-circle-check"></i> Broadcast Published — Awaiting Rider Acceptance</span>'
                : '<span class="status-badge" style="background:#fee2e2; color:#dc2626;"><i class="fa-solid fa-exclamation-circle"></i> Broadcast Failed — Try Again</span>';
        });
    }
}

// ==========================================
// 📊 ৪. DYNAMIC PAYMENT & LIVE ANALYTICS ENGINE
// ==========================================
async function initPaymentAnalyticsPage() {
    const totalReceivedDisplay = document.getElementById('totalReceivedDisplay');
    const totalProfitDisplay = document.getElementById('totalProfitDisplay');
    const timeFilter = document.getElementById('timeFilter');
    const graphHintText = document.getElementById('graphHintText');
    const receivedTrend = document.getElementById('receivedTrend');

    const chartTrendLine = document.getElementById('chartTrendLine');
    const chartGlowPath = document.getElementById('chartGlowPath');
    const chartPointerCircle = document.getElementById('chartPointerCircle');
    const chartPointerPulse = document.getElementById('chartPointerPulse');
    const graphXLabels = document.getElementById('graphXLabels');

    const gridMax = document.getElementById('gridMax');
    const gridMidHigh = document.getElementById('gridMidHigh');
    const gridMid = document.getElementById('gridMid');
    const gridMin = document.getElementById('gridMin');

    async function fetchLiveOrderMetrics() {
        if (graphHintText) graphHintText.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Synchronization with live financial ledger...';
        
        try {
            let activeMerchantId = window.currentMerchantId || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
            if (!activeMerchantId) return;

            const { data, error } = await dbSupabase
                .from('orders')
                .select('total_amount, created_at, merchant_id')
                .eq('merchant_id', activeMerchantId)
                .eq('status', 'delivered')
                .order('created_at', { ascending: true });

            if (error) throw error;

            if (!data || data.length === 0) {
                renderZeroStateFinance();
                return;
            }
            processFinancialPipeline(data);
        } catch (err) {

            if (graphHintText) graphHintText.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444"></i> Sync Error: ${err.message}`;
        }
    }

    function renderZeroStateFinance() {
        if (totalReceivedDisplay) totalReceivedDisplay.innerText = "₹0";
        if (totalProfitDisplay) totalProfitDisplay.innerText = "₹0";
        if (gridMax) gridMax.innerText = "₹0";
        if (gridMidHigh) gridMidHigh.innerText = "₹0";
        if (gridMid) gridMid.innerText = "₹0";
        if (gridMin) gridMin.innerText = "₹0";

        if (chartTrendLine) chartTrendLine.setAttribute('d', 'M 0,200 L 500,200');
        if (chartGlowPath) chartGlowPath.setAttribute('d', 'M 0,200 L 500,200 Z');
        if (graphHintText) graphHintText.innerHTML = '<i class="fa-solid fa-circle-info"></i> Standard Startup Phase active. No transaction assets recorded yet.';
    }

    function processFinancialPipeline(orders) {
        let intervals = (timeFilter && timeFilter.value) ? timeFilter.value : 'thismonth';
        let totalRevenue = orders.reduce((sum, ord) => sum + (Number(ord.total_amount) || 0), 0);
        let totalProfit = totalRevenue * 0.20; 

        if (totalReceivedDisplay) totalReceivedDisplay.innerText = `₹${totalRevenue.toLocaleString('en-IN')}`;
        if (totalProfitDisplay) totalProfitDisplay.innerText = `₹${totalProfit.toLocaleString('en-IN')}`;

        let dataPoints = [0, 0, 0, 0];
        let labelTexts = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];

        if (intervals === 'thisweek') {
            dataPoints = [0, 0, 0, 0, 0, 0, 0];
            labelTexts = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            orders.forEach(o => {
                let day = new Date(o.created_at).getDay();
                let index = day === 0 ? 6 : day - 1;
                dataPoints[index] += Number(o.total_amount);
            });
        } else {
            orders.forEach(o => {
                let date = new Date(o.created_at).getDate();
                let wIndex = Math.min(Math.floor((date - 1) / 7), 3);
                dataPoints[wIndex] += Number(o.total_amount);
            });
        }

        if (graphXLabels) graphXLabels.innerHTML = labelTexts.map(l => `<span>${l}</span>`).join('');

        let lastNode = dataPoints[dataPoints.length - 1];
        let prevNode = dataPoints[dataPoints.length - 2] || 0;
        let percentageTrend = prevNode > 0 ? (((lastNode - prevNode) / prevNode) * 100).toFixed(1) : (lastNode > 0 ? 100 : 0);

        if (percentageTrend > 0) {
            if (receivedTrend) receivedTrend.innerHTML = `<i class="fa-solid fa-caret-up"></i> +${percentageTrend}%`;
            if (graphHintText) graphHintText.innerHTML = `<i class="fa-solid fa-circle-chevron-up" style="color:#22c55e"></i> Index moving <strong>UP by ${percentageTrend}%</strong>.`;
            setGraphColor('#22c55e');
        } else if (percentageTrend < 0) {
            if (receivedTrend) receivedTrend.innerHTML = `<i class="fa-solid fa-caret-down"></i> ${percentageTrend}%`;
            if (graphHintText) graphHintText.innerHTML = `<i class="fa-solid fa-circle-chevron-down" style="color:#ef4444"></i> Operational ledger registers a temporary <strong>DOWNFALL of ${Math.abs(percentageTrend)}%</strong>.`;
            setGraphColor('#ef4444');
        } else {
            setGraphColor('#3b82f6');
        }

        drawVectorGraph(dataPoints);
    }

    function setGraphColor(colorHex) {
        if (chartTrendLine) chartTrendLine.setAttribute('stroke', colorHex);
        if (chartPointerCircle) chartPointerCircle.setAttribute('fill', colorHex);
        if (chartPointerPulse) chartPointerPulse.setAttribute('stroke', colorHex);
    }

    function drawVectorGraph(points) {
        const maxVal = Math.max(...points, 1000);
        if (gridMax) gridMax.innerText = `₹${Math.round(maxVal).toLocaleString('en-IN')}`;
        
        const width = 500, height = 200, totalSegments = points.length - 1;
        let pathCommands = "", fillCommands = "M 0,200 ";

        points.forEach((val, index) => {
            let x = (index / totalSegments) * width;
            let y = height - ((val / maxVal) * (height - 30)) - 10; 

            if (index === 0) {
                pathCommands += `M ${x},${y} `;
                fillCommands += `L ${x},${y} `;
            } else {
                let prevX = ((index - 1) / totalSegments) * width;
                let prevY = height - ((points[index - 1] / maxVal) * (height - 30)) - 10;
                let cpX1 = prevX + (x - prevX) / 2;
                pathCommands += `C ${cpX1},${prevY} ${cpX1},${y} ${x},${y} `;
                fillCommands += `C ${cpX1},${prevY} ${cpX1},${y} ${x},${y} `;
            }

            if (index === points.length - 1) {
                if (chartPointerCircle) { chartPointerCircle.setAttribute('cx', x); chartPointerCircle.setAttribute('cy', y); }
                if (chartPointerPulse) { chartPointerPulse.setAttribute('cx', x); chartPointerPulse.setAttribute('cy', y); }
            }
        });

        fillCommands += `L ${width},200 Z`;
        if (chartTrendLine) chartTrendLine.setAttribute('d', pathCommands);
        if (chartGlowPath) chartGlowPath.setAttribute('d', fillCommands);
    }

    if (timeFilter) timeFilter.addEventListener('change', fetchLiveOrderMetrics);
    fetchLiveOrderMetrics();
}

// ==========================================
// 👤 ৫. PROFILE ENGINE (ADVANCED MAP & AVATAR STORAGE UPLOAD)
// ==========================================
async function initProfilePage() {

    const verifyStatusEl = document.getElementById('verifyStatus');
    const licenseUploadZone = document.getElementById('licenseUploadZone');
    const licenseFileInput = document.getElementById('licenseFile');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const btnVerifyLicense = document.getElementById('btnVerifyLicense');
    const btnDropMapPin = document.getElementById('btnDropMapPin');
    const btnSaveGeoAddress = document.getElementById('btnSaveGeoAddress');
    const btnSaveStoreCore = document.getElementById('btnSaveStoreCore');
    const avatarInput = document.getElementById('avatarInput');
    const profileDisplay = document.getElementById('profileDisplay');

    // 🏦 নতুন ব্যাংক ইন্টিগ্রেশন নোডস রেফারেন্স
    const bankImageUploadZone = document.getElementById('bankImageUploadZone');
    const bankImageFile = document.getElementById('bankImageFile');
    const bankFileNameDisplay = document.getElementById('bankFileNameDisplay');
    const btnSaveBankDetails = document.getElementById('btnSaveBankDetails');

    globalLat = null;
    globalLon = null;

    if (avatarInput) {
        avatarInput.addEventListener('change', async (e) => {
            if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0];
                let targetMerchantId = window.currentMerchantId || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
                
                if (!targetMerchantId) { showToast("Error: Merchant session identifier missing.", "error"); return; }

                try {
                    if (profileDisplay) profileDisplay.style.opacity = '0.5';
                    
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${targetMerchantId}_avatar.${fileExt}`;
                    const filePath = `avatars/${fileName}`;

                    const { error: uploadError } = await dbSupabase.storage
                        .from('media')
                        .upload(filePath, file, { upsert: true });

                    if (uploadError) throw uploadError;

                    const { data: { publicUrl } } = dbSupabase.storage
                        .from('media')
                        .getPublicUrl(filePath);

                    const finalUrl = `${publicUrl}?t=${Date.now()}`;

                    const { error: dbError } = await dbSupabase
                        .from('merchants')
                        .update({ merchant_avatar: finalUrl })
                        .eq('id', targetMerchantId);

                    if (dbError) throw dbError;

                    localStorage.setItem('merchant_avatar', finalUrl);

                    if (profileDisplay) {
                        profileDisplay.src = finalUrl;
                        profileDisplay.style.opacity = '1';
                    }
                    showToast("Profile image uploaded and synced to database.", "success");

                } catch (err) {

                    showToast("Upload failed: " + err.message, "error");
                    if (profileDisplay) profileDisplay.style.opacity = '1';
                }
            }
        });
    }

    // 🏦 ব্যাংক আপলোড ফাইল হ্যান্ডলার ট্রিগার
    if (bankImageUploadZone && bankImageFile) {
        bankImageUploadZone.onclick = () => bankImageFile.click();
        bankImageFile.onchange = (e) => {
            if (e.target.files && e.target.files[0]) {
                if (bankFileNameDisplay) bankFileNameDisplay.innerText = `📄 Attached: ${e.target.files[0].name}`;
            }
        };
    }

    // 🏦 ব্যাংক সাবমিট বোতাম ইভেন্ট হ্যান্ডলার
    if (btnSaveBankDetails) {
        btnSaveBankDetails.addEventListener('click', async (e) => {
            e.preventDefault();
            const bankNo = document.getElementById('bankNoInput')?.value || '';
            const bankIfsc = document.getElementById('bankIfscInput')?.value || '';
            const bankUpi = document.getElementById('bankUpiInput')?.value || '';

            let targetMerchantId = window.currentMerchantId || currentMerchantData?.id || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
            if (!targetMerchantId) { showToast("Error: Merchant ID missing.", "error"); return; }

            try {
                let bankImageUrl = null;
                // ব্যাংক ফাইল আপলোড প্রসেসিং
                if (bankImageFile && bankImageFile.files && bankImageFile.files.length > 0) {
                    const file = bankImageFile.files[0];
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${targetMerchantId}_bankdoc.${fileExt}`;
                    const filePath = `bank_documents/${fileName}`;

                    const { error: uploadError } = await dbSupabase.storage
                        .from('media')
                        .upload(filePath, file, { upsert: true });

                    if (uploadError) throw uploadError;

                    const { data: { publicUrl } } = dbSupabase.storage
                        .from('media')
                        .getPublicUrl(filePath);
                    bankImageUrl = publicUrl;
                }

                const updatePayload = {
                    bank_no: bankNo,
                    ifsc_code: bankIfsc.toUpperCase(),
                    upi_id: bankUpi
                };

                if (bankImageUrl) {
                    updatePayload.bank_image = bankImageUrl;
                }

                const { error } = await dbSupabase.from('merchants').update(updatePayload).eq('id', targetMerchantId);

                if (!error) {
                    showToast("Bank settlement parameters saved to database.", "success");
                    window.closePopup('bankModal');
                    await loadCurrentMerchantStatus();
                } else { throw error; }
            } catch (error) { showToast("Bank details save failed: " + error.message, "error"); }
        });
    }

    function updateVisualMap(lat, lon) {
        if (typeof L === 'undefined') {

            return;
        }

        const defaultShopIcon = L.icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/1047/1047711.png', 
            iconSize: [38, 38],
            iconAnchor: [19, 38],
            popupAnchor: [0, -34]
        });

        const mapContainer = document.getElementById('profileLiveMiniMap');
        if (!mapContainer) return;

        try {
            if (!profileMapInstance) {
                profileMapInstance = L.map('profileLiveMiniMap').setView([lat, lon], 16);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '© OpenStreetMap'
                }).addTo(profileMapInstance);
                
                profileMapMarker = L.marker([lat, lon], {icon: defaultShopIcon}).addTo(profileMapInstance)
                    .bindPopup('<b>Your Pharmacy Location Node</b>').openPopup();
            } else {
                profileMapInstance.setView([lat, lon], 16);
                profileMapMarker.setLatLng([lat, lon]);
            }
        } catch(e) {

        }
    }

    window.invalidateProfileMapInstance = function() {
        if (profileMapInstance) {
            profileMapInstance.invalidateSize();
        }
    };

    if (licenseUploadZone && licenseFileInput) {
        licenseUploadZone.onclick = () => licenseFileInput.click();
        licenseFileInput.onchange = (e) => {
            if (e.target.files && e.target.files[0]) {
                if (fileNameDisplay) fileNameDisplay.innerText = `📄 Attached: ${e.target.files[0].name}`;
                if (btnVerifyLicense) {
                    btnVerifyLicense.removeAttribute('disabled');
                    btnVerifyLicense.style.opacity = "1";
                    btnVerifyLicense.style.cursor = "pointer";
                }
            }
        };
    }

    if (btnVerifyLicense) {
        btnVerifyLicense.addEventListener('click', async (e) => {
            e.preventDefault();
            const licenseNo = document.getElementById('licenseIdInput')?.value || '';
            if (!licenseNo) { showToast("Please enter your License Registration ID.", "error"); return; }

            let targetMerchantId = window.currentMerchantId || currentMerchantData?.id || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
            if (!targetMerchantId) { showToast("Error: Merchant ID missing.", "error"); return; }

            const fileInput = document.getElementById('licenseFile');
            if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                showToast("Please select a license file to upload.", "error"); return;
            }

            const file = fileInput.files[0];
            const filePath = `licenses/${targetMerchantId}_${Date.now()}_${file.name}`;

            try {
                btnVerifyLicense.disabled = true;
                btnVerifyLicense.innerText = "Uploading...";

                const { error: uploadError } = await dbSupabase.storage
                    .from('media')
                    .upload(filePath, file);

                if (uploadError) {
                    showToast("File upload failed: " + uploadError.message, "error");
                    btnVerifyLicense.disabled = false;
                    btnVerifyLicense.innerText = "Run Online Verification Check";
                    return;
                }

                const { data: urlData } = dbSupabase.storage.from('media').getPublicUrl(filePath);
                const publicUrl = urlData?.publicUrl || '';

                await saveMerchantKyc(publicUrl, licenseNo);

                const { error } = await dbSupabase.from('merchants').update({
                    license_status: 'Pending',
                    license_id: licenseNo
                }).eq('id', targetMerchantId);

                if (!error) {
                    showToast("License uploaded and verification request submitted!", "success");
                    if (verifyStatusEl) {
                        verifyStatusEl.innerText = "Pending Review";
                        verifyStatusEl.className = "status-pill pending";
                        verifyStatusEl.style.background = "#ffa000";
                    }
                    window.closePopup('licenseModal');
                    await loadCurrentMerchantStatus();
                } else { throw error; }
            } catch (err) {
                showToast("Verification Save Error: " + err.message, "error");
                btnVerifyLicense.disabled = false;
                btnVerifyLicense.innerText = "Run Online Verification Check";
            }
        });
    }

    if (btnDropMapPin) {
        btnDropMapPin.addEventListener('click', (e) => {
            e.preventDefault();
            if (!navigator.geolocation) { showToast("Error: Triangulation failure: GPS context denied.", "error"); return; }

            if(document.getElementById('autoAddress')) document.getElementById('autoAddress').value = "Locking high-accuracy GPS satellite feed...";

            navigator.geolocation.getCurrentPosition(async (pos) => {
                globalLat = pos.coords.latitude;
                globalLon = pos.coords.longitude;

                updateVisualMap(globalLat, globalLon);

                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${globalLat}&lon=${globalLon}`);
                    const geoData = await res.json();
                    if (geoData && geoData.address) {
                        const addr = geoData.address;
                        const city = addr.city || addr.town || addr.village || '';
                        const district = addr.county || addr.state_district || '';
                        const state = addr.state || '';
                        const pincode = addr.postcode || '';

                        if(document.getElementById('cityInput')) document.getElementById('cityInput').value = city;
                        if(document.getElementById('districtInput')) document.getElementById('districtInput').value = district;
                        if(document.getElementById('stateInput')) document.getElementById('stateInput').value = state;
                        if(document.getElementById('pinCodeInput')) document.getElementById('pinCodeInput').value = pincode;
                        if(document.getElementById('autoAddress')) document.getElementById('autoAddress').value = geoData.display_name;

                        showToast("GPS sync successful. Shop icon marker updated on map.", "success");
                    }
                } catch (err) { showToast("GPS coordinates locked, but address lookup failed.", "error"); }
            }, () => { showToast("Error: Unable to establish accurate device lock.", "error"); }, { enableHighAccuracy: true, timeout: 10000 });
        });
    }

    if (btnSaveGeoAddress) {
        btnSaveGeoAddress.addEventListener('click', async (e) => {
            e.preventDefault();
            const pin = document.getElementById('pinCodeInput')?.value || '';
            const city = document.getElementById('cityInput')?.value || '';
            const dist = document.getElementById('districtInput')?.value || '';
            const state = document.getElementById('stateInput')?.value || '';
            const fullAddr = document.getElementById('autoAddress')?.value || '';

            if(!pin || !city || !dist || !state) { showToast("Please fill out all mandatory fields.", "error"); return; }

            let targetMerchantId = window.currentMerchantId || currentMerchantData?.id || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
            if (!targetMerchantId) { showToast("Error: Merchant ID missing.", "error"); return; }

            try {
                const { error } = await dbSupabase.from('merchants').update({
                    pincode: pin, city: city, district: dist, state: state,
                    resolved_address: fullAddr, latitude: globalLat, longitude: globalLon
                }).eq('id', targetMerchantId);

                if (!error) {
                    showToast("Location saved to database.", "success");
                    window.closePopup('geoModal');
                } else { throw error; }
            } catch (error) { showToast("Data write failed: " + error.message, "error"); }
        });
    }

    if (btnSaveStoreCore) {
        btnSaveStoreCore.addEventListener('click', async (e) => {
            e.preventDefault();
            const updatedName = document.getElementById('shopNameInput')?.value || '';
            if (!updatedName) { showToast("Please specify business name.", "error"); return; }
            
            let targetMerchantId = window.currentMerchantId || currentMerchantData?.id || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
            if (!targetMerchantId) { showToast("Error: Merchant ID missing.", "error"); return; }

            try {
                const { error } = await dbSupabase.from('merchants').update({ merchant_name: updatedName }).eq('id', targetMerchantId);
                if (!error) {
                    if (document.getElementById('merchantNameInput')) document.getElementById('merchantNameInput').value = updatedName;
                    showToast("Shop identity updated successfully.", "success");
                    window.closePopup('storeCoreModal');
                } else { throw error; }
            } catch (err) { showToast("Save profile failed: " + err.message, "error"); }
        });
    }

    await loadCurrentMerchantStatus();
}

// ==========================================
// 🔐 六. GLOBAL FEATURES & LANGUAGE SWITCHER
// ==========================================
function initGlobalFeatures() {
    const logoutBtn = document.getElementById('logoutActionBtn');
    const langSelect = document.getElementById('langSelect');
    const btnApplyLanguage = document.querySelector("#langModal .popup-submit-btn");

    if (langSelect && btnApplyLanguage) {
        const savedLang = localStorage.getItem('terminalLanguage') || 'en';
        langSelect.value = savedLang;
        applyFullWebLanguage(savedLang);

        btnApplyLanguage.onclick = (e) => {
            e.preventDefault();
            const selectedLang = langSelect.value;
            localStorage.setItem('terminalLanguage', selectedLang);
            applyFullWebLanguage(selectedLang);
            showToast(selectedLang === 'bn' ? "ভাষা পরিবর্তন সফল হয়েছে!" : "Language switched successfully!", "success");
            window.closePopup('langModal');
        };
    }

    if (logoutBtn) {
        logoutBtn.replaceWith(logoutBtn.cloneNode(true));
        const activeLogoutBtn = document.getElementById('logoutActionBtn');
        if (activeLogoutBtn) {
            activeLogoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.handleTerminalLogout(e);
            });
        }
    }
}

function applyFullWebLanguage(lang) {
    const elementsToTranslate = {
        logoTitle: document.querySelector('.logo-area h1'),
        storeSetupTitle: document.querySelector('.settings-glass-card:nth-child(1) h3'),
        storeSetupDesc: document.querySelector('.settings-glass-card:nth-child(1) .section-desc'),
        licenseTitle: document.querySelector('.settings-glass-card:nth-child(2) h3'),
        licenseDesc: document.querySelector('.settings-glass-card:nth-child(2) .section-desc'),
        geoTitle: document.querySelector('.settings-glass-card:nth-child(3) h3'),
        geoDesc: document.querySelector('.settings-glass-card:nth-child(3) .section-desc'),
        helpTitle: document.querySelector('.settings-glass-card:nth-child(4) h3'),
        helpDesc: document.querySelector('.settings-glass-card:nth-child(4) .section-desc')
    };

    if (lang === 'bn') {
        if (elementsToTranslate.logoTitle) elementsToTranslate.logoTitle.innerHTML = 'মেডি <span class="highlight">ফাইন্ডার</span>';
        if (elementsToTranslate.storeSetupTitle) elementsToTranslate.storeSetupTitle.innerHTML = '<i class="fa-solid fa-store"></i> প্রধান দোকান সেটআপ';
        if (elementsToTranslate.storeSetupDesc) elementsToTranslate.storeSetupDesc.innerText = 'আপনার নিবন্ধিত অফিসিয়াল দোকানের নাম পরিচালনা করুন।';
        if (elementsToTranslate.licenseTitle) elementsToTranslate.licenseTitle.innerHTML = '<i class="fa-solid fa-file-shield"></i> সরকারি লাইসেন্স হাব';
        if (elementsToTranslate.licenseDesc) elementsToTranslate.licenseDesc.innerText = 'আপনার সরকারি ড্রাগ লাইসেন্স এখানে আপলোড ও যাচাই করুন।';
        if (elementsToTranslate.geoTitle) elementsToTranslate.geoTitle.innerHTML = '<i class="fa-solid fa-map-location-dot"></i> লোকেশন ও ঠিকানা ম্যাপিং';
        if (elementsToTranslate.geoDesc) elementsToTranslate.geoDesc.innerText = 'দোকানের অবস্থান, পিনকোড এবং লাইভ ম্যাপ কনফিগার করুন।';
        if (elementsToTranslate.helpTitle) elementsToTranslate.helpTitle.innerHTML = '<i class="fa-solid fa-circle-question"></i> সাহায্য কেন্দ্র ও মার্চেন্ট গাইডセンター';
        if (elementsToTranslate.helpDesc) elementsToTranslate.helpDesc.innerText = 'যেকোনো operational সমস্যা তাৎক্ষণিকভাবে সমাধান করার নির্দেশিকা।';
    } else {
        if (elementsToTranslate.logoTitle) elementsToTranslate.logoTitle.innerHTML = 'MEDI <span class="highlight">FINDER</span>';
        if (elementsToTranslate.storeSetupTitle) elementsToTranslate.storeSetupTitle.innerHTML = '<i class="fa-solid fa-store"></i> Store Core Setup';
        if (elementsToTranslate.storeSetupDesc) elementsToTranslate.storeSetupDesc.innerText = 'Manage your registered official shop identity.';
        if (elementsToTranslate.licenseTitle) elementsToTranslate.licenseTitle.innerHTML = '<i class="fa-solid fa-file-shield"></i> Government License Hub';
        if (elementsToTranslate.licenseDesc) elementsToTranslate.licenseDesc.innerText = 'Upload and verify your government drug license here.';
        if (elementsToTranslate.geoTitle) elementsToTranslate.geoTitle.innerHTML = '<i class="fa-solid fa-map-location-dot"></i> Geolocation & Address Mapping';
        if (elementsToTranslate.geoDesc) elementsToTranslate.geoDesc.innerText = 'Configure shop location, pincode, and contact maps.';
        if (elementsToTranslate.helpTitle) elementsToTranslate.helpTitle.innerHTML = '<i class="fa-solid fa-circle-question"></i> Help Desk & Merchant Guide';
        if (elementsToTranslate.helpDesc) elementsToTranslate.helpDesc.innerText = 'Quick FAQ guide to solve operational issues instantly.';
    }
}

// ==========================================
// 🔑 AUTOMATIC DATA FETCH & NODE MOUNT ENGINE (REFRESH SAFE)
// ==========================================
async function loadCurrentMerchantStatus() {
    if (window.location.pathname.includes('index.html')) {
        return false; 
    }

    try {
        if (!dbSupabase.auth) return false;

        const { data: authUserData, error: userErr } = await dbSupabase.auth.getUser();
        if (userErr || !authUserData?.user) {

            return false;
        }

        const activeUser = authUserData.user;
        let merchantData = null;

        const queryResult = await dbSupabase
            .from('merchants')
            .select('*')
            .eq('auth_user_id', activeUser.id);

        if (!queryResult.error && queryResult.data && queryResult.data.length > 0) {
            merchantData = queryResult.data[0];
        } else if (activeUser.email) {
            const fallbackResult = await dbSupabase
                .from('merchants')
                .select('*')
                .eq('email', activeUser.email);
                
            if (!fallbackResult.error && fallbackResult.data && fallbackResult.data.length > 0) {
                merchantData = fallbackResult.data[0];
                await dbSupabase
                    .from('merchants')
                    .update({ auth_user_id: activeUser.id })
                    .eq('id', merchantData.id);

            }
        }

        if (merchantData) {
            currentMerchantData = merchantData;
            
            window.currentMerchantId = merchantData.id;
            localStorage.setItem("merchantId", String(merchantData.id));
            localStorage.setItem('merchantSessionActive', 'true');
            localStorage.setItem('userEmail', activeUser.email || '');
            
            if (document.getElementById('merchantNameInput')) document.getElementById('merchantNameInput').value = merchantData.merchant_name || '';
            if (document.getElementById('shopNameInput')) document.getElementById('shopNameInput').value = merchantData.merchant_name || '';
            if (document.getElementById('merchantEmailInput')) document.getElementById('merchantEmailInput').value = merchantData.email || '';
            if (document.getElementById('merchantPhoneInput')) document.getElementById('merchantPhoneInput').value = merchantData.phone || '';
            if (document.getElementById('licenseIdInput')) document.getElementById('licenseIdInput').value = merchantData.license_id || '';
            
            // 🏦 অটো-রিসেট প্রতিরোধে সুপাবেস ডাটাবেস থেকে ব্যাংক ডেটা লোড
            if (document.getElementById('bankNoInput')) document.getElementById('bankNoInput').value = merchantData.bank_no || '';
            if (document.getElementById('bankIfscInput')) document.getElementById('bankIfscInput').value = merchantData.ifsc_code || '';
            if (document.getElementById('bankUpiInput')) document.getElementById('bankUpiInput').value = merchantData.upi_id || '';
            if (merchantData.bank_image && document.getElementById('bankFileNameDisplay')) {
                document.getElementById('bankFileNameDisplay').innerText = `📄 Document Synced Successfully`;
            }

            if (merchantData.merchant_avatar && document.getElementById('profileDisplay')) {
                document.getElementById('profileDisplay').src = merchantData.merchant_avatar;
                localStorage.setItem('merchant_avatar', merchantData.merchant_avatar);
            }

            const verifyStatusEl = document.getElementById('verifyStatus');
            if (verifyStatusEl) {
                if (merchantData.license_status === 'Verified') {
                    verifyStatusEl.innerText = "Verified";
                    verifyStatusEl.className = "status-pill verified";
                    verifyStatusEl.style.background = "#2e7d32";
                    verifyStatusEl.style.color = "#fff";
                } else if (merchantData.license_status === 'Pending') {
                    verifyStatusEl.innerText = "Pending Review";
                    verifyStatusEl.className = "status-pill pending";
                    verifyStatusEl.style.background = "#ffa000";
                    verifyStatusEl.style.color = "#fff";
                } else if (merchantData.license_status === 'Rejected') {
                    verifyStatusEl.innerText = "Rejected";
                    verifyStatusEl.className = "status-pill rejected";
                    verifyStatusEl.style.background = "#ef4444";
                    verifyStatusEl.style.color = "#fff";
                } else {
                    verifyStatusEl.innerText = "Unverified";
                    verifyStatusEl.className = "status-pill unverified";
                    verifyStatusEl.style.background = "#ef4444";
                    verifyStatusEl.style.color = "#fff";
                }
            }
            
            if(document.getElementById('pinCodeInput')) document.getElementById('pinCodeInput').value = merchantData.pincode || '';
            if(document.getElementById('cityInput')) document.getElementById('cityInput').value = merchantData.city || '';
            if(document.getElementById('districtInput')) document.getElementById('districtInput').value = merchantData.district || '';
            if(document.getElementById('stateInput')) document.getElementById('stateInput').value = merchantData.state || '';
            if(document.getElementById('autoAddress')) document.getElementById('autoAddress').value = merchantData.resolved_address || '';
            
            if (merchantData.latitude && merchantData.longitude) {
                globalLat = Number(merchantData.latitude);
                globalLon = Number(merchantData.longitude);
            } else {
                globalLat = 22.5726;  // fallback — real coords set by GPS
                globalLon = 88.3639; // fallback — real coords set by GPS
            }
            
            if (typeof updateVisualMap === 'function') {
                updateVisualMap(globalLat, globalLon);
            } else if (profileMapInstance) {
                profileMapInstance.setView([globalLat, globalLon], 16);
                if (profileMapMarker) profileMapMarker.setLatLng([globalLat, globalLon]);
            }

            return true; 
        } else {

            return false;
        }
    } catch (e) { 

        return false;
    }
}