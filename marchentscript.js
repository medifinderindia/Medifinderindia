// ==========================================
// 🗄️ Supabase Initialization (Instant Client Boot)
// ==========================================
const supabaseUrl = 'https://rnpbglinkpsikeszcjcl.supabase.co'; 
const supabaseKey = 'sb_publishable_Ogc4JOrhQXAl9zRTDU0y3g_oGnitfuZ'; 

if (typeof window.supabaseClientInstance === 'undefined' && typeof window.supabase !== 'undefined') {
    window.supabaseClientInstance = window.supabase.createClient(supabaseUrl, supabaseKey);
}

const dbSupabase = window.supabaseClientInstance;

// ==========================================
// 🔔📲 BACKGROUND / OFF-SCREEN PUSH NOTIFICATION ENGINE
// (Fires even when merchant has minimized the tab or switched apps)
// ==========================================
function requestBackgroundNotificationPermission() {
    if ('Notification' in window) {
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission().then(perm => {
                console.log("🔔 Notification permission result:", perm);
            });
        }
    }
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('merchant-sw.js').catch(() => {
            console.log("ℹ️ Background service worker not found, using in-page fallback alerts only.");
        });
    }
}

function playMerchantAlertTone() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
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
        console.log("Audio alert skipped:", e.message);
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
            console.log("System notification dispatch failed:", e.message);
        }
    }
}

// ==========================================
// 🛡️ SECURITY & LOGIN PROTECTION BLOCK (ASYNC SESSION CAPTURE)
// ==========================================
(async () => {
    try {
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

    if (!confirm("Are you sure you want to logout?")) return;

    try {
        if (dbSupabase?.auth) {
            await dbSupabase.auth.signOut();
        }
        localStorage.clear();
        sessionStorage.clear();
        window.location.replace("index.html");
    } catch (err) {
        console.error(err);
        localStorage.clear();
        sessionStorage.clear();
        window.location.replace("index.html");
    }
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
    
    // merchant_kyc টেবিলে ডেটা চেক করে ইনসার্ট বা আপডেট করা
    const { data: existingData } = await dbSupabase
        .from('merchant_kyc')
        .select('id')
        .eq('merchant_id', targetMerchantId)
        .single();

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
    if (error) {
        console.error("KYC Error:", error);
        alert("KYC সাবমিট করতে সমস্যা হয়েছে: " + error.message);
    } else {
        alert("✅ KYC ডকুমেন্ট জমা দেওয়া হয়েছে।");
    }
}

// Run all modules on DOM Content Loaded
document.addEventListener("DOMContentLoaded", async () => {
    console.log("🚀 Medi Finder Terminal System Loaded Successfully!");

    if (!dbSupabase) {
        console.error("Supabase client is not initialized. Check your CDN links.");
        return;
    }

    try {
        const { data: { session } } = await dbSupabase.auth.getSession();
        if (!session && !localStorage.getItem("merchantSessionActive")) {
            window.location.replace("index.html");
            return;
        }
    } catch (secErr) {
        console.error("Security session fetch failed:", secErr);
        window.location.replace("index.html");
        return;
    }

    const isLoaded = await loadCurrentMerchantStatus();
    if (!isLoaded) {
        console.warn("⚠️ Waiting for merchant profile mapping connection...");
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

    dbSupabase
        .channel('live-orders')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
            const order = payload.new;
            const marginProfit = (order.total_amount * 0.20).toFixed(2);
            
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

    dbSupabase
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
                .eq('status', 'Completed');
            if (error) throw error;

            if (orders && orders.length > 0) {
                if (revenueSection) revenueSection.style.display = 'block'; 
                
                let totalRevenue = orders.reduce((sum, order) => sum + Number(order.total_amount), 0);
                let totalProfit = (totalRevenue * 0.20).toFixed(2); 
                
                if (totalEarningsEl) {
                    totalEarningsEl.innerText = `₹${totalProfit}`;
                }
            } else {
                if (revenueSection) revenueSection.style.display = 'none'; 
            }
        } catch (err) {
            console.error("Live revenue tracking block failure:", err.message);
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
            console.error("Error fetching medicines:", error.message);
        }
    }

    let activeMerchantId = window.currentMerchantId || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
    if (activeMerchantId) {
        dbSupabase
            .channel('realtime-medicines')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'medicines', filter: `merchant_id=eq.${activeMerchantId}` }, () => {
                fetchMedicines(searchInput ? searchInput.value : '');
            })
            .subscribe();
    }

    function renderMedicines(medicines) {
        if (!medicineGrid) return;
        medicineGrid.innerHTML = '';

        if (medicines.length === 0) {
            medicineGrid.innerHTML = `<div style="text-align:center; width:100%; padding:20px; color:#888;">No medicines found.</div>`;
            return;
        }

        medicines.forEach(med => {
            const isPending = med.status === 'Pending';
            const isSuspended = med.status === 'Suspended' || med.stock_qty <= 0;
            
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
                if (confirm("Are you sure you want to delete this medicine permanently?")) {
                    try {
                        const { error } = await dbSupabase.from('medicines').delete().eq('id', id);
                        if (error) throw error;
                        alert("✅ Medicine deleted successfully!");
                    } catch (err) { alert("Delete failed: " + err.message); }
                }
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
        } catch (e) { console.error("Error setting up edit nodes:", e); }
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
                    if (!prodName) return alert("Please enter the product name before going to next step!");
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
            .from('avatars') 
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = dbSupabase.storage
            .from('avatars')
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
            const { error: uploadError } = await dbSupabase.storage.from('avatars').upload(filePath, file);
            if (uploadError) { console.error('Image upload error:', uploadError); urls.push(null); continue; }
            const { data: { publicUrl } } = dbSupabase.storage.from('avatars').getPublicUrl(filePath);
            urls.push(publicUrl);
        }
        return urls;
    }

    async function saveMedicineToSupabase(targetStatus) {
        const activeId = window.currentMerchantId || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
        if (!activeId) return alert("Error: Merchant session identifier not found.");

        try {
            const { data: merchantData, error: merchantError } = await dbSupabase.from('merchants').select('license_status').eq('id', activeId).single();
            if (merchantError || !merchantData || merchantData.license_status !== 'Verified') {
                alert("Forbidden: Your merchant account must be 'Verified' by the administrator before listing items.");
                return;
            }
        } catch (e) { alert("Verification check fault."); return; }

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
        const drugType = document.getElementById('drugType')?.value || 'Branded';
        const stockQty = parseInt(document.getElementById('stockQty')?.value) || 0;
        const unitType = document.getElementById('unitType')?.value || 'Strip';
        const rackLocation = document.getElementById('rackLocation')?.value || '';
        const sideEffects = document.getElementById('sideEffects')?.value || '';
        const category = dosageForm;

        if (!prodName || !unitPrice || !stockQty) { alert("Please complete mandatory parameters: Product Name, Price, and Stock."); return; }

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
            if (imageUrls && imageUrls.some(u => u)) {
                medicineObject.images = imageUrls.filter(u => u);
            }

            if (currentEditingId) { 
                response = await dbSupabase.from('medicines').update(medicineObject).eq('id', currentEditingId); 
            } else { 
                response = await dbSupabase.from('medicines').insert([medicineObject]); 
            }
            if (response.error) throw response.error;
            
            if (targetStatus === 'Pending') { 
                alert("Medicine uploaded successfully! Waiting for Admin approval."); 
                window.location.href = 'marchenthome.html'; 
            } else { 
                alert("Saved as draft."); 
                window.location.href = 'marchenthome.html'; 
            }
        } catch (error) { 
            alert("Save failed: " + error.message);
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

    if (btnVerifyOrder) {
        btnVerifyOrder.addEventListener('click', () => {
            btnVerifyOrder.classList.add('loading');
            if (verifyText) verifyText.innerText = "Verifying...";
            
            setTimeout(() => {
                if(document.getElementById('distanceSelector')) document.getElementById('distanceSelector').value = "12";
                if(document.getElementById('autoVehicle')) document.getElementById('autoVehicle').value = "Bike Delivery (Rider)";
                if(document.getElementById('deliverySpeed')) document.getElementById('deliverySpeed').value = "Super Fast Delivery (Within 30 Mins)";
                if(document.getElementById('pickupAddress')) document.getElementById('pickupAddress').value = "Medi Care Pharmacy, Kolkata Node-A";
                if(document.getElementById('deliveryAddress')) document.getElementById('deliveryAddress').value = "72/1 Park Street, Customer Floor-3";
                
                if(productPreviewArea) productPreviewArea.style.display = 'block';

                if (orderRequiresRx) {
                    if (prescriptionVaultSection) prescriptionVaultSection.style.display = 'block';
                    if (rxVerificationBox) rxVerificationBox.style.display = 'block';
                    if (btnBroadcast) {
                        btnBroadcast.setAttribute('disabled', 'true');
                        btnBroadcast.style.opacity = "0.5";
                    }
                } else {
                    if (prescriptionVaultSection) prescriptionVaultSection.style.display = 'none';
                    if (rxVerificationBox) rxVerificationBox.style.display = 'none';
                    if (btnBroadcast) {
                        btnBroadcast.removeAttribute('disabled');
                        btnBroadcast.style.opacity = "1";
                    }
                }
                
                if(riderStatusBox) {
                    riderStatusBox.innerHTML = '<span class="status-badge active-ready"><i class="fa-solid fa-circle-info"></i> Awaiting Inventory Checklist Confirmation</span>';
                }
                
                btnVerifyOrder.classList.remove('loading');
                btnVerifyOrder.innerHTML = '<i class="fa-solid fa-circle-check"></i> Verified';
                btnVerifyOrder.style.background = '#e6fffa';
                btnVerifyOrder.style.color = '#00a389';
                btnVerifyOrder.style.borderColor = '#b2f5ea';
            }, 1500);
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
        btnBroadcast.addEventListener('click', () => {
            if (orderRequiresRx && (!chkConfirmItems || !chkConfirmItems.checked)) {
                alert("🔒 Broadcast Locked: You must check the validation box matching prescription details first.");
                return;
            }
            alert("🚀 Broadcast Published to Fleet Stream Successfully! Local logistics nodes notified.");

            // 📲 Send a background/system notification too, so the merchant is alerted
            // about the successful broadcast even if this tab is minimized or backgrounded.
            const broadcastOrderId = document.getElementById('orderIdSelect')?.value || 'N/A';
            fireMerchantBackgroundNotification(
                "🚀 Order Broadcasted to Fleet!",
                `Order ${broadcastOrderId} has been published to the rider pool successfully.`,
                null
            );
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
                .eq('status', 'Completed')
                .order('created_at', { ascending: true });

            if (error) throw error;

            if (!data || data.length === 0) {
                renderZeroStateFinance();
                return;
            }
            processFinancialPipeline(data);
        } catch (err) {
            console.error("Ledger Integration Error:", err.message);
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
        let intervals = timeFilter ? timeFilter.value : 'thismonth';
        let totalRevenue = orders.reduce((sum, ord) => sum + Number(ord.total_amount), 0);
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
    console.log("Initializing Profile Event Listeners...");

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

    if (avatarInput) {
        avatarInput.addEventListener('change', async (e) => {
            if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0];
                let targetMerchantId = window.currentMerchantId || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
                
                if (!targetMerchantId) return alert("Error: Merchant session identifier missing.");

                try {
                    if (profileDisplay) profileDisplay.style.opacity = '0.5';
                    
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${targetMerchantId}_avatar.${fileExt}`;
                    const filePath = `avatars/${fileName}`;

                    const { error: uploadError } = await dbSupabase.storage
                        .from('avatars')
                        .upload(filePath, file, { upsert: true });

                    if (uploadError) throw uploadError;

                    const { data: { publicUrl } } = dbSupabase.storage
                        .from('avatars')
                        .getPublicUrl(filePath);

                    const finalUrl = `${publicUrl}?t=${Date.now()}`;

                    const { error: dbError } = await dbSupabase
                        .from('merchants')
                        .update({ merchant_avatar: finalUrl })
                        .eq('id', targetMerchantId);

                    if (dbError) throw dbError;

                    if (profileDisplay) {
                        profileDisplay.src = finalUrl;
                        profileDisplay.style.opacity = '1';
                    }
                    alert("✅ Profile Image uploaded and sync updated in Database!");

                } catch (err) {
                    console.error("Avatar Upload Anomaly:", err);
                    alert("Upload failed: " + err.message);
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
                bankFileNameDisplay.innerText = `📄 Attached: ${e.target.files[0].name}`;
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
            if (!targetMerchantId) return alert("Error: Merchant ID missing.");

            try {
                let bankImageUrl = null;
                // ব্যাংক ফাইল আপলোড প্রসেসিং
                if (bankImageFile && bankImageFile.files && bankImageFile.files.length > 0) {
                    const file = bankImageFile.files[0];
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${targetMerchantId}_bankdoc.${fileExt}`;
                    const filePath = `bank_documents/${fileName}`;

                    const { error: uploadError } = await dbSupabase.storage
                        .from('avatars')
                        .upload(filePath, file, { upsert: true });

                    if (uploadError) throw uploadError;

                    const { data: { publicUrl } } = dbSupabase.storage
                        .from('avatars')
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
                    alert("✅ Bank Settlement Parameters Streamed & Saved into Database!");
                    window.closePopup('bankModal');
                    await loadCurrentMerchantStatus();
                } else { throw error; }
            } catch (error) { alert("Bank writing anomaly: " + error.message); }
        });
    }

    function updateVisualMap(lat, lon) {
        if (typeof L === 'undefined') {
            console.error("Leaflet Library is missing! Ensure Leaflet CDN is loaded in HTML.");
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
            console.error("Leaflet execution fault:", e);
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
                fileNameDisplay.innerText = `📄 Attached: ${e.target.files[0].name}`;
                btnVerifyLicense.removeAttribute('disabled');
                btnVerifyLicense.style.opacity = "1";
                btnVerifyLicense.style.cursor = "pointer";
            }
        };
    }

    if (btnVerifyLicense) {
        btnVerifyLicense.addEventListener('click', async (e) => {
            e.preventDefault();
            const licenseNo = document.getElementById('licenseIdInput')?.value || '';
            if (!licenseNo) return alert("Please enter your License Registration ID.");

            let targetMerchantId = window.currentMerchantId || currentMerchantData?.id || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
            if (!targetMerchantId) return alert("Error: Merchant ID missing.");

            const fileInput = document.getElementById('licenseFile');
            if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                return alert("Please select a license file to upload.");
            }

            const file = fileInput.files[0];
            const filePath = `licenses/${targetMerchantId}_${Date.now()}_${file.name}`;

            try {
                btnVerifyLicense.disabled = true;
                btnVerifyLicense.innerText = "Uploading...";

                const { error: uploadError } = await dbSupabase.storage
                    .from('avatars')
                    .upload(filePath, file);

                if (uploadError) {
                    alert("File upload failed: " + uploadError.message);
                    btnVerifyLicense.disabled = false;
                    btnVerifyLicense.innerText = "Run Online Verification Check";
                    return;
                }

                const { data: urlData } = dbSupabase.storage.from('avatars').getPublicUrl(filePath);
                const publicUrl = urlData?.publicUrl || '';

                await saveMerchantKyc(publicUrl, licenseNo);

                const { error } = await dbSupabase.from('merchants').update({
                    license_status: 'Pending',
                    license_id: licenseNo
                }).eq('id', targetMerchantId);

                if (!error) {
                    alert("License uploaded and verification request submitted!");
                    if (verifyStatusEl) {
                        verifyStatusEl.innerText = "Pending Review";
                        verifyStatusEl.className = "status-pill pending";
                        verifyStatusEl.style.background = "#ffa000";
                    }
                    window.closePopup('licenseModal');
                    await loadCurrentMerchantStatus();
                } else { throw error; }
            } catch (err) {
                alert("Verification Save Error: " + err.message);
                btnVerifyLicense.disabled = false;
                btnVerifyLicense.innerText = "Run Online Verification Check";
            }
        });
    }

    if (btnDropMapPin) {
        btnDropMapPin.addEventListener('click', (e) => {
            e.preventDefault();
            if (!navigator.geolocation) return alert("Triangulation failure: GPS context denied.");

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

                        alert("🎯 GPS Sub-Meter Sync Successful! Shop icon marker updated on map.");
                    }
                } catch (err) { alert("GPS coordinates locked, but address lookup failed."); }
            }, () => alert("Unable to establish accurate device lock."), { enableHighAccuracy: true, timeout: 10000 });
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

            if(!pin || !city || !dist || !state) return alert("Please fill out all mandatory fields.");

            let targetMerchantId = window.currentMerchantId || currentMerchantData?.id || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
            if (!targetMerchantId) return alert("Error: Merchant ID missing.");

            try {
                const { error } = await dbSupabase.from('merchants').update({
                    pincode: pin, city: city, district: dist, state: state,
                    resolved_address: fullAddr, latitude: globalLat, longitude: globalLon
                }).eq('id', targetMerchantId);

                if (!error) {
                    alert("✅ Location Saved into Database!");
                    window.closePopup('geoModal');
                } else { throw error; }
            } catch (error) { alert("Data write anomaly: " + error.message); }
        });
    }

    if (btnSaveStoreCore) {
        btnSaveStoreCore.addEventListener('click', async (e) => {
            e.preventDefault();
            const updatedName = document.getElementById('shopNameInput')?.value || '';
            if (!updatedName) return alert("Please specify business name.");
            
            let targetMerchantId = window.currentMerchantId || currentMerchantData?.id || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
            if (!targetMerchantId) return alert("Error: Merchant ID missing.");

            try {
                const { error } = await dbSupabase.from('merchants').update({ merchant_name: updatedName }).eq('id', targetMerchantId);
                if (!error) {
                    if (document.getElementById('merchantNameInput')) document.getElementById('merchantNameInput').value = updatedName;
                    alert("✅ Shop Identity Updated into Database!");
                    window.closePopup('storeCoreModal');
                } else { throw error; }
            } catch (err) { alert("Save Profile Error: " + err.message); }
        });
    }

}

// ==========================================
// 🔐 六. GLOBAL FEATURES & LANGUAGE SWITCHER
// ==========================================
function initGlobalFeatures() {
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
            alert(selectedLang === 'bn' ? "ভাষা পরিবর্তন সফল হয়েছে!" : "Language switched successfully!");
            window.closePopup('langModal');
        };
    }

}

function applyFullWebLanguage(lang) {
    const elementsToTranslate = {
        logoTitle: document.querySelector('.logo-area h1'),
        storeSetupTitle: document.querySelector('.settings-glass-card:nth-child(1) h3'),
        storeSetupDesc: document.querySelector('.settings-glass-card:nth-child(1) .section-desc'),
        licenseTitle: document.querySelector('.settings-glass-card:nth-child(2) h3'),
        licenseDesc: document.querySelector('.settings-glass-card:nth-child(2) .section-desc'),
        geoTitle: document.querySelector('.settings-glass-card:nth-child(4) h3'),
        geoDesc: document.querySelector('.settings-glass-card:nth-child(4) .section-desc'),
        helpTitle: document.querySelector('.settings-glass-card:nth-child(5) h3'),
        helpDesc: document.querySelector('.settings-glass-card:nth-child(5) .section-desc')
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
            console.error("No active session found during refresh trigger.");
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
                console.log("🔗 Realtime backward compatibility linked successfully.");
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
                globalLat = 22.5726; 
                globalLon = 88.3639;
            }
            
            if (typeof updateVisualMap === 'function') {
                updateVisualMap(globalLat, globalLon);
            } else if (profileMapInstance) {
                profileMapInstance.setView([globalLat, globalLon], 16);
                if (profileMapMarker) profileMapMarker.setLatLng([globalLat, globalLon]);
            }
            console.log("🎯 All merchant dataset mounted successfully and safe from refresh wipe.");
            return true; 
        } else {
            console.warn("⚠️ No merchant record mapped to this context.");
            return false;
        }
    } catch (e) { 
        console.error("Error auto-filling merchant real-time profile assets:", e.message);
        return false;
    }
}