// ==========================================
// 🗄️ Supabase Initialization (Instant Client Boot)
// URL & key loaded from supabase-constants.js
// ==========================================
if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_KEY === 'undefined') {

}
if (typeof window.supabaseClientInstance === 'undefined' && typeof window.supabase !== 'undefined') {
    window.supabaseClientInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
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
        navigator.serviceWorker.register('Merchant-sw.js').catch(() => {

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
                    window.location.href = 'marchentorders.html';
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
                // 📍 Auto-trigger the device Geolocation prompt the instant this
                // card is opened, so the merchant doesn't need a second click.
                const dropPinBtn = document.getElementById('btnDropMapPin');
                if (dropPinBtn) dropPinBtn.click();
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
            verified: false,
            rejection_reason: null
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

// ==========================================
// 🪪 VERIFICATION CARD RENDERER (shared by License & Bank popups)
// Paints the small status pill on the settings card, and switches each
// popup between its read-only "view" summary (status + image + Edit/Cancel)
// and its editable upload form, based on the merchant's current status.
// ==========================================
function paintStatusPill(el, status) {
    if (!el) return;
    const map = {
        verified:   { text: 'Verified',       cls: 'status-pill verified',   bg: '#2e7d32', color: '#fff' },
        pending:    { text: 'Pending Review',  cls: 'status-pill pending',    bg: '#ffa000', color: '#fff' },
        unverified: { text: 'Unverified',      cls: 'status-pill unverified', bg: '#fef2f2', color: '#ef4444' }
    };
    const s = map[(status || '').toLowerCase()] || map.unverified;
    el.innerText = s.text;
    el.className = s.cls;
    el.style.background = s.bg;
    el.style.color = s.color;
}

function renderLicenseCard(merchantData, kycImg) {
    const status = merchantData.license_status;
    paintStatusPill(document.getElementById('verifyStatus'), status);

    const viewState = document.getElementById('licenseViewState');
    const formState = document.getElementById('licenseFormState');
    if (!viewState || !formState) return;

    const submitted = status === 'verified' || status === 'pending';

    if (submitted) {
        viewState.style.display = '';
        formState.style.display = 'none';

        const idText = document.getElementById('licenseViewIdText');
        if (idText) idText.value = merchantData.license_id || '—';

        const img = document.getElementById('licenseViewImg');
        if (img && kycImg) { img.src = kycImg; img.style.display = ''; }
        else if (img && !img.src) { img.style.display = 'none'; }

        const note = document.getElementById('licenseViewNote');
        if (note) {
            if (status === 'verified') note.innerHTML = '<span class="status-pill verified">Verified</span> Product publishing is unlocked.';
            else if (status === 'pending') note.innerHTML = '<span class="status-pill pending">Pending Review</span> Awaiting admin review.';
            else note.innerHTML = '<span class="status-pill unverified">Unverified</span> Tap Edit to upload a valid document.';
        }

        const cancelBtn = document.getElementById('btnCancelLicense');
        if (cancelBtn) cancelBtn.style.display = status === 'verified' ? 'none' : '';
    } else {
        viewState.style.display = 'none';
        formState.style.display = '';
    }
}

function renderBankCard(merchantData) {
    const hasBank = !!(merchantData.bank_no && merchantData.ifsc_code);
    const status = hasBank ? (merchantData.bank_status || 'Pending') : 'Unverified';
    paintStatusPill(document.getElementById('bankVerifyStatus'), status);

    const viewState = document.getElementById('bankViewState');
    const formState = document.getElementById('bankFormState');
    if (!viewState || !formState) return;

    if (hasBank) {
        viewState.style.display = '';
        formState.style.display = 'none';

        const noText = document.getElementById('bankViewNoText');
        if (noText) noText.value = merchantData.bank_no || '—';
        const ifscText = document.getElementById('bankViewIfscText');
        if (ifscText) ifscText.value = merchantData.ifsc_code || '—';
        const upiText = document.getElementById('bankViewUpiText');
        if (upiText) upiText.value = merchantData.upi_id || '—';

        const img = document.getElementById('bankViewImg');
        if (img) {
            if (merchantData.bank_image) { img.src = merchantData.bank_image; img.style.display = ''; }
            else { img.style.display = 'none'; }
        }

        const note = document.getElementById('bankViewNote');
        if (note) {
            note.innerHTML = status === 'Verified'
                ? '<span class="status-pill verified">Verified</span> Your settlement account is confirmed.'
                : '<span class="status-pill pending">Pending Review</span> Your settlement account is on file.';
        }
    } else {
        viewState.style.display = 'none';
        formState.style.display = '';
    }
}

// Run all modules on DOM Content Loaded
document.addEventListener("DOMContentLoaded", async () => {

    // Measure the REAL rendered height of the locked top-bar and bottom-nav
    // (same technique used on marchentpromotions.html) and publish them as
    // CSS custom properties, so merchant-shared.css can size the scrollable
    // .content-body to fit exactly between them — no guessed pixel values,
    // stays correct even if fonts/safe-area/wrapping change the bar height.
    function syncLayoutHeights() {
        const header = document.querySelector('.top-bar, header.header, .header');
        const nav = document.querySelector('.bottom-nav');
        if (header) document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
        if (nav) document.documentElement.style.setProperty('--bottomnav-h', nav.offsetHeight + 'px');
    }
    syncLayoutHeights();
    window.addEventListener('load', syncLayoutHeights);
    window.addEventListener('resize', syncLayoutHeights);
    window.addEventListener('orientationchange', syncLayoutHeights);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', syncLayoutHeights);
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(syncLayoutHeights);
        document.querySelectorAll('.top-bar, .header, .bottom-nav').forEach(el => ro.observe(el));
    }

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
                `Order ID: ${order.id || 'N/A'}. Value: ₹${order.total_amount}. Tap to view and accept.`,
                order.id,
                'order'
            );

            // 📲 Also fire a real background/system notification so the merchant
            // gets alerted even if this site tab is minimized or not in focus.
            fireMerchantBackgroundNotification(
                `🛒 New Order Received! Profit: ₹${marginProfit}`,
                `Order ID: ${order.id || 'N/A'} • Value: ₹${order.total_amount}. Tap to view and accept.`,
                order.id
            );
        })
        .subscribe();

    window._profileAlertsChannel = dbSupabase
        .channel('profile-alerts')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'merchants' }, payload => {
            const merchant = payload.new;
            if (typeof renderLicenseCard === 'function') renderLicenseCard(merchant, null);
            if (typeof renderBankCard === 'function') renderBankCard(merchant);
            const verifyStatusEl = document.getElementById('verifyStatus');
            if (merchant.license_status === 'verified') {
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
            } else if (merchant.license_status === 'pending') {
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
            refreshUnreadNotifBadge();
            if (window._notifPanelOpen) {
                fetchMerchantNotifications().then(renderNotifPanel);
            }
        })
        .subscribe();

    refreshUnreadNotifBadge();
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
            window.location.href = 'marchentorders.html';
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

// ==========================================
// 🔔 PERSISTED NOTIFICATION HISTORY (Notification Center)
// Fetches & displays saved rows from merchant_notifications so the
// merchant always has a real history — separate from the temporary
// toast popups above, which are never saved to this list.
// ==========================================
function _notifIconFor(n) {
    const t = (n.title || '').toLowerCase();
    const c = (n.category || '').toLowerCase();
    if (t.includes('kyc') || t.includes('license')) return { icon: 'fa-shield-halved', color: '#0284c7' };
    if (t.includes('product') || t.includes('medicine') || t.includes('approved') && t.includes('live')) return { icon: 'fa-box-open', color: '#7c3aed' };
    if (c === 'order' || t.includes('order')) return { icon: 'fa-receipt', color: '#e02020' };
    if (t.includes('payout') || t.includes('payment') || t.includes('settlement')) return { icon: 'fa-wallet', color: '#059669' };
    if (n.type === 'error') return { icon: 'fa-circle-exclamation', color: '#ef4444' };
    if (n.type === 'warning') return { icon: 'fa-triangle-exclamation', color: '#f59e0b' };
    return { icon: 'fa-bullhorn', color: '#64748b' };
}

function _timeAgo(dateStr) {
    if (!dateStr) return '';
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

async function fetchMerchantNotifications() {
    const merchantId = window.currentMerchantId || localStorage.getItem('merchantId') || localStorage.getItem('merchant_id');
    if (!merchantId || !dbSupabase) return [];
    try {
        const { data, error } = await dbSupabase
            .from('merchant_notifications')
            .select('*')
            .or(`merchant_id.eq.${merchantId},merchant_id.is.null`)
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        return data || [];
    } catch (e) {
        return [];
    }
}

async function refreshUnreadNotifBadge() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    const merchantId = window.currentMerchantId || localStorage.getItem('merchantId') || localStorage.getItem('merchant_id');
    if (!merchantId || !dbSupabase) { badge.textContent = ''; return; }
    try {
        const { count, error } = await dbSupabase
            .from('merchant_notifications')
            .select('id', { count: 'exact', head: true })
            .or(`merchant_id.eq.${merchantId},merchant_id.is.null`)
            .eq('is_read', false);
        if (error) throw error;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.style.display = 'inline-flex';
        } else {
            badge.textContent = '';
            badge.style.display = 'none';
        }
    } catch (e) {
        badge.textContent = '';
    }
}

function _notifPanelEl() {
    let panel = document.getElementById('notifHistoryPanel');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'notifHistoryPanel';
    panel.className = 'notif-history-panel';
    panel.innerHTML = `
        <div class="notif-history-overlay" id="notifHistoryOverlay"></div>
        <div class="notif-history-card">
            <div class="notif-history-head">
                <h3><i class="fa-solid fa-bell"></i> Notifications</h3>
                <div class="notif-history-actions">
                    <button type="button" id="btnMarkAllNotifRead">Mark all read</button>
                    <button type="button" id="btnCloseNotifPanel" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>
            <div class="notif-history-list" id="notifHistoryList">
                <div class="notif-history-empty">Loading...</div>
            </div>
        </div>
        <style>
            .notif-history-panel { position: fixed; inset: 0; z-index: 10000; display: none; }
            .notif-history-panel.show { display: block; }
            .notif-history-overlay { position: absolute; inset: 0; background: rgba(15,23,42,0.35); }
            .notif-history-card { position: absolute; top: 0; right: 0; height: 100%; width: min(380px, 100%); background: #fff; box-shadow: -8px 0 30px rgba(0,0,0,0.15); display: flex; flex-direction: column; animation: notifSlideIn 0.25s ease; }
            @keyframes notifSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
            .notif-history-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid #f1f5f9; }
            .notif-history-head h3 { margin: 0; font-size: 16px; color: #0f172a; display: flex; align-items: center; gap: 8px; }
            .notif-history-actions { display: flex; align-items: center; gap: 12px; }
            .notif-history-actions button { border: none; background: none; cursor: pointer; }
            #btnMarkAllNotifRead { color: #e02020; font-size: 12.5px; font-weight: 600; }
            #btnCloseNotifPanel { font-size: 16px; color: #94a3b8; padding: 4px; }
            .notif-history-list { flex: 1; overflow-y: auto; }
            .notif-history-empty { padding: 60px 20px; text-align: center; color: #94a3b8; font-size: 14px; }
            .notif-history-item { display: flex; gap: 12px; padding: 14px 18px; border-bottom: 1px solid #f8fafc; cursor: pointer; position: relative; }
            .notif-history-item.unread { background: #fff7f7; }
            .notif-history-item .nh-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 14px; color: #fff; }
            .notif-history-item .nh-body { flex: 1; min-width: 0; }
            .notif-history-item .nh-title { font-size: 13.5px; font-weight: 700; color: #1e293b; margin-bottom: 3px; }
            .notif-history-item .nh-msg { font-size: 12.5px; color: #64748b; line-height: 1.4; word-break: break-word; }
            .notif-history-item .nh-time { font-size: 11px; color: #b0b8c4; margin-top: 4px; }
            .notif-history-item .nh-dot { width: 8px; height: 8px; border-radius: 50%; background: #e02020; position: absolute; right: 16px; top: 18px; }
        </style>
    `;
    document.body.appendChild(panel);
    panel.querySelector('#notifHistoryOverlay').addEventListener('click', closeMerchantNotifications);
    panel.querySelector('#btnCloseNotifPanel').addEventListener('click', closeMerchantNotifications);
    panel.querySelector('#btnMarkAllNotifRead').addEventListener('click', markAllNotifRead);
    return panel;
}

function renderNotifPanel(list) {
    const listEl = document.getElementById('notifHistoryList');
    if (!listEl) return;
    if (!list || list.length === 0) {
        listEl.innerHTML = `<div class="notif-history-empty"><i class="fa-regular fa-bell-slash" style="font-size:28px; display:block; margin-bottom:10px; opacity:0.5;"></i>No notifications yet</div>`;
        return;
    }
    listEl.innerHTML = list.map(n => {
        const meta = _notifIconFor(n);
        return `
            <div class="notif-history-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" data-order="${n.category === 'order' ? '1' : ''}">
                <div class="nh-icon" style="background:${meta.color};"><i class="fa-solid ${meta.icon}"></i></div>
                <div class="nh-body">
                    <div class="nh-title">${(n.title || 'Notification').replace(/</g, '&lt;')}</div>
                    <div class="nh-msg">${(n.message || '').replace(/</g, '&lt;')}</div>
                    <div class="nh-time">${_timeAgo(n.created_at)}</div>
                </div>
                ${n.is_read ? '' : '<span class="nh-dot"></span>'}
            </div>
        `;
    }).join('');

    listEl.querySelectorAll('.notif-history-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.getAttribute('data-id');
            const isOrder = item.getAttribute('data-order') === '1';
            markNotifRead(id);
            if (isOrder) window.location.href = 'marchentorders.html';
        });
    });
}

async function markNotifRead(id) {
    if (!id || !dbSupabase) return;
    try {
        await dbSupabase.from('merchant_notifications').update({ is_read: true }).eq('id', id);
        const item = document.querySelector(`.notif-history-item[data-id="${id}"]`);
        if (item) {
            item.classList.remove('unread');
            const dot = item.querySelector('.nh-dot');
            if (dot) dot.remove();
        }
        refreshUnreadNotifBadge();
    } catch (e) {}
}

async function markAllNotifRead() {
    const merchantId = window.currentMerchantId || localStorage.getItem('merchantId') || localStorage.getItem('merchant_id');
    if (!merchantId || !dbSupabase) return;
    try {
        await dbSupabase.from('merchant_notifications').update({ is_read: true }).or(`merchant_id.eq.${merchantId},merchant_id.is.null`).eq('is_read', false);
        document.querySelectorAll('.notif-history-item.unread').forEach(item => {
            item.classList.remove('unread');
            const dot = item.querySelector('.nh-dot');
            if (dot) dot.remove();
        });
        refreshUnreadNotifBadge();
    } catch (e) {}
}

window.showMerchantNotifications = async function() {
    const panel = _notifPanelEl();
    panel.classList.add('show');
    window._notifPanelOpen = true;
    const list = await fetchMerchantNotifications();
    renderNotifPanel(list);
};

window.closeMerchantNotifications = function() {
    const panel = document.getElementById('notifHistoryPanel');
    if (panel) panel.classList.remove('show');
    window._notifPanelOpen = false;
};
function closeMerchantNotifications() { window.closeMerchantNotifications(); }

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
    // The MFD/Expiry fields are <input type="month"> now (merchants only
    // pick a month + year, not a specific day), which gives a "YYYY-MM"
    // value. The database date columns still need a full date, so store
    // the 1st of that month.
    function normalizeMonthDate(val) {
        if (!val) return null;
        return /^\d{4}-\d{2}$/.test(val) ? `${val}-01` : val;
    }
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
            if (typeof setProductType === 'function') setProductType(editData.product_type || 'Medicine');
            const typeRadio = document.querySelector(`input[name="productType"][value="${editData.product_type || 'Medicine'}"]`);
            if (typeRadio) typeRadio.checked = true;
            if (document.getElementById('dosageForm')) document.getElementById('dosageForm').value = editData.dosage_form || '';
            if (document.getElementById('composition')) document.getElementById('composition').value = editData.composition || '';
            if (window.syncSaltChipsFromComposition) window.syncSaltChipsFromComposition();
            if (document.getElementById('strength')) document.getElementById('strength').value = editData.strength || '';
            if (document.getElementById('manufacturer')) document.getElementById('manufacturer').value = editData.manufacturer || '';
            if (document.getElementById('brandName')) document.getElementById('brandName').value = editData.brand_name || '';
            if (document.getElementById('prescriptionReq')) document.getElementById('prescriptionReq').value = editData.prescription_req || 'No';
            if (document.getElementById('mfdDate')) document.getElementById('mfdDate').value = (editData.mfd_date || '').slice(0, 7);
            if (document.getElementById('expiryDate')) document.getElementById('expiryDate').value = (editData.expiry_date || '').slice(0, 7);
            if (document.getElementById('batchNumber')) document.getElementById('batchNumber').value = editData.batch_number || '';
            if (document.getElementById('lotNumber')) document.getElementById('lotNumber').value = editData.lot_number || '';
            if (document.getElementById('warrantyPeriod')) document.getElementById('warrantyPeriod').value = editData.warranty_period || 'No Warranty';
            if (document.getElementById('modelNumber')) document.getElementById('modelNumber').value = editData.model_number || '';
            if (document.getElementById('itemColor')) document.getElementById('itemColor').value = editData.item_color || '';
            if (document.getElementById('deviceType')) document.getElementById('deviceType').value = editData.device_type || '';
            if (document.getElementById('displaySpec')) document.getElementById('displaySpec').value = editData.display_spec || '';
            if (document.getElementById('batteryInfo')) document.getElementById('batteryInfo').value = editData.battery_info || '';
            if (document.getElementById('measurementRange')) document.getElementById('measurementRange').value = editData.measurement_range || '';
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
            if (document.getElementById('productDescription')) document.getElementById('productDescription').value = (editData.description || '').toUpperCase();
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
            if (currentStep === totalSteps) { btnNext.innerHTML = 'Upload Product <i class="fa-solid fa-cloud-arrow-up"></i>'; } else { btnNext.innerHTML = 'Next <i class="fa-solid fa-arrow-right"></i>'; }
        }
    }

    if (btnNext) {
        btnNext.addEventListener('click', async () => {
            if (currentStep < totalSteps) {
                if (currentStep === 1) {
                    const prodName = document.getElementById('prodName')?.value?.trim();
                    if (!prodName) { showToast("Please enter the product name before going to next step", "error"); return; }
                    if ((window.currentProductType || 'Medicine') === 'Medicine') {
                        const composition = document.getElementById('composition')?.value?.trim();
                        if (!composition) { showToast("Please enter the Composition / Salt Name", "error"); return; }
                    }
                } else if (currentStep === 2) {
                    // Every field on this step is required except Lot Number,
                    // which stays optional — but whatever else is missing gets
                    // named so the merchant knows exactly what to fix before
                    // moving on.
                    const category = document.getElementById('dosageForm')?.value?.trim();
                    if (!category) { showToast("Please select a Category before going to next step", "error"); return; }
                    const manufacturer = document.getElementById('manufacturer')?.value?.trim();
                    if (!manufacturer) { showToast("Please enter the Manufacturer Company Name", "error"); return; }
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
        // Upload all selected images at once instead of one-by-one — this is
        // most of why Upload used to feel slow (4 sequential round-trips).
        const tasks = [];
        for (let i = 1; i <= 4; i++) {
            const fileInput = document.getElementById('fileInput' + i);
            if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                tasks.push(Promise.resolve(null));
                continue;
            }
            const file = fileInput.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${i}_medicine.${fileExt}`;
            const filePath = `products/${fileName}`;
            tasks.push(
                dbSupabase.storage.from('products').upload(filePath, file)
                    .then(({ error }) => {
                        if (error) return null;
                        const { data: { publicUrl } } = dbSupabase.storage.from('products').getPublicUrl(filePath);
                        return publicUrl;
                    })
                    .catch(() => null)
            );
        }
        return Promise.all(tasks);
    }

    async function saveMedicineToSupabase(targetStatus) {
        const activeId = window.currentMerchantId || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
        if (!activeId) { showToast("Error: Merchant session identifier not found.", "error"); return; }

        try {
            const { data: merchantData, error: merchantError } = await dbSupabase.from('merchants').select('license_status').eq('id', activeId).single();
            if (merchantError || !merchantData || merchantData.license_status !== 'verified') {
                showToast("Error: Your merchant account must be verified by the administrator before listing items.", "error");
                reEnableButtons();
                return;
            }
        } catch (e) { showToast("Verification check failed.", "error"); reEnableButtons(); return; }

        const prodName = document.getElementById('prodName')?.value || '';
        const productType = window.currentProductType || 'Medicine';
        const composition = document.getElementById('composition')?.value || '';
        const dosageForm = document.getElementById('dosageForm')?.value || 'Tablet';
        const strength = document.getElementById('strength')?.value || '';
        const manufacturer = document.getElementById('manufacturer')?.value || '';
        const brandName = document.getElementById('brandName')?.value || '';
        const prescriptionReq = document.getElementById('prescriptionReq')?.value || 'No';
        const productDescription = document.getElementById('productDescription')?.value || '';
        const mfdDate = normalizeMonthDate(document.getElementById('mfdDate')?.value);
        const expiryDate = normalizeMonthDate(document.getElementById('expiryDate')?.value);
        const batchNumber = document.getElementById('batchNumber')?.value || '';
        const lotNumber = document.getElementById('lotNumber')?.value || '';
        const warrantyPeriod = document.getElementById('warrantyPeriod')?.value || '';
        const modelNumber = document.getElementById('modelNumber')?.value || '';
        const itemColor = document.getElementById('itemColor')?.value || '';
        const deviceType = document.getElementById('deviceType')?.value || '';
        const displaySpec = document.getElementById('displaySpec')?.value || '';
        const batteryInfo = document.getElementById('batteryInfo')?.value || '';
        const measurementRange = document.getElementById('measurementRange')?.value || '';
        const unitPrice = parseFloat(document.getElementById('unitPrice')?.value) || 0;
        const mrpPrice = parseFloat(document.getElementById('mrpPrice')?.value) || null;
        const drugType = document.getElementById('drugType')?.value || 'Branded';
        const stockQty = parseInt(document.getElementById('stockQty')?.value) || 0;
        const unitType = document.getElementById('unitType')?.value || 'Strip';
        const rackLocation = document.getElementById('rackLocation')?.value || '';
        const sideEffects = document.getElementById('sideEffects')?.value || '';
        const category = dosageForm;

        if (!prodName || !unitPrice || !stockQty) { showToast("Please complete mandatory fields: Product Name, Price, and Stock.", "error"); reEnableButtons(); return; }

        try {
            // Show loading
            const nextBtn = document.getElementById('btnNext');
            const draftBtn = document.getElementById('btnDraft');
            if (nextBtn) { nextBtn.disabled = true; nextBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...'; }
            if (draftBtn) { draftBtn.disabled = true; }

            // Upload all images (previously only imageUrls[0] was kept and the
            // 2nd/3rd real photos the merchant uploaded were discarded, which is
            // why the storefront showed 1 real photo + 3 duplicate demo photos)
            let imageUrls = await uploadAllMedicineImages();
            let mainImageUrl = imageUrls[0] || null;
            let secondImageUrl = imageUrls[1] || null;
            let thirdImageUrl = imageUrls[2] || null;

            let response;
            const rawId = window.currentMerchantId || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id')) || localStorage.getItem('merchant_id');
            const activeMerchantId = rawId ? parseInt(rawId) : null;
            
            // prescription_req (text 'Yes'/'No') is the field the merchant form
            // actually sets. is_rx (boolean) is what the admin table and the
            // user-facing storefront read to decide OTC vs Rx. These used to be
            // two disconnected columns — a merchant could pick "Yes (Rx Required)"
            // here and it would still show as OTC everywhere else. Always derive
            // is_rx from the same value so they can never go out of sync again.
            const isRxBool = prescriptionReq === 'Yes';

            const medicineObject = {
                merchant_id: activeMerchantId,
                product_name: prodName,
                name: prodName,
                product_type: productType,
                composition: composition,
                dosage_form: dosageForm,
                strength: strength,
                manufacturer: manufacturer,
                brand_name: brandName,
                prescription_req: prescriptionReq,
                is_rx: isRxBool,
                description: productDescription,
                mfd_date: mfdDate,
                expiry_date: expiryDate,
                batch_number: batchNumber,
                lot_number: lotNumber,
                warranty_period: warrantyPeriod,
                model_number: modelNumber,
                item_color: itemColor,
                device_type: deviceType,
                display_spec: displaySpec,
                battery_info: batteryInfo,
                measurement_range: measurementRange,
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
            if (secondImageUrl) {
                medicineObject.image_url_2 = secondImageUrl;
            }
            if (thirdImageUrl) {
                medicineObject.image_url_3 = thirdImageUrl;
            }

            if (currentEditingId) { 
                response = await dbSupabase.from('medicines').update(medicineObject).eq('id', currentEditingId);
                currentEditingId = null;
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
            reEnableButtons();
        }
    }

    function reEnableButtons() {
        const nextBtn = document.getElementById('btnNext');
        const draftBtn = document.getElementById('btnDraft');
        if (nextBtn) { nextBtn.disabled = false; nextBtn.innerHTML = 'Upload Product <i class="fa-solid fa-cloud-arrow-up"></i>'; }
        if (draftBtn) { draftBtn.disabled = false; }
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

    // 🪪 লাইসেন্স ভিউ-স্টেট: Edit / Cancel বাটন হ্যান্ডলার
    const btnEditLicense = document.getElementById('btnEditLicense');
    const btnCancelLicense = document.getElementById('btnCancelLicense');
    if (btnEditLicense) {
        btnEditLicense.addEventListener('click', () => {
            const vs = document.getElementById('licenseViewState');
            const fs = document.getElementById('licenseFormState');
            if (vs) vs.style.display = 'none';
            if (fs) fs.style.display = '';
        });
    }
    if (btnCancelLicense) {
        btnCancelLicense.addEventListener('click', () => {
            showConfirmationModal("Cancel this license submission? You'll need to re-upload before you can publish products.", async () => {
                let targetMerchantId = window.currentMerchantId || currentMerchantData?.id || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
                if (!targetMerchantId) { showToast("Error: Merchant ID missing.", "error"); return; }
                try {
                    const { error } = await dbSupabase.from('merchants').update({ license_status: 'unverified' }).eq('id', targetMerchantId);
                    if (error) throw error;
                    showToast("License submission cancelled.", "success");
                    await loadCurrentMerchantStatus();
                } catch (err) {
                    showToast("Cancel failed: " + err.message, "error");
                }
            });
        });
    }

    // 🏦 ব্যাংক ভিউ-স্টেট: Edit / Cancel বাটন হ্যান্ডলার
    const btnEditBank = document.getElementById('btnEditBank');
    const btnCancelBank = document.getElementById('btnCancelBank');
    if (btnEditBank) {
        btnEditBank.addEventListener('click', () => {
            const vs = document.getElementById('bankViewState');
            const fs = document.getElementById('bankFormState');
            if (vs) vs.style.display = 'none';
            if (fs) fs.style.display = '';
        });
    }
    if (btnCancelBank) {
        btnCancelBank.addEventListener('click', () => {
            showConfirmationModal("Remove these bank details? You can add them again anytime.", async () => {
                let targetMerchantId = window.currentMerchantId || currentMerchantData?.id || (localStorage.getItem('merchantId') || localStorage.getItem('merchant_id'));
                if (!targetMerchantId) { showToast("Error: Merchant ID missing.", "error"); return; }
                try {
                    const { error } = await dbSupabase.from('merchants').update({ bank_no: null, ifsc_code: null, upi_id: null, bank_image: null }).eq('id', targetMerchantId);
                    if (error) throw error;
                    showToast("Bank details removed.", "success");
                    await loadCurrentMerchantStatus();
                } catch (err) {
                    showToast("Cancel failed: " + err.message, "error");
                }
            });
        });
    }

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
                    license_status: 'pending',
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
                const { data, error } = await dbSupabase
                    .from('merchants')
                    .update({ merchant_name: updatedName })
                    .eq('id', targetMerchantId)
                    .select();

                console.log("MERCHANT UPDATE ID:", targetMerchantId);
                console.log("MERCHANT UPDATE VALUE:", updatedName);
                console.log("MERCHANT UPDATE DATA:", data);
                console.log("MERCHANT UPDATE ERROR:", error);

                if (error) {
                    throw new Error(
                        `Supabase ${error.code || 'ERROR'}: ${error.message || 'Unknown error'}`
                    );
                }

                if (document.getElementById('merchantNameInput')) document.getElementById('merchantNameInput').value = updatedName;
                showToast("Shop identity updated successfully.", "success");
                window.closePopup('storeCoreModal');
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
        bankTitle: document.querySelector('.settings-glass-card:nth-child(3) h3'),
        bankDesc: document.querySelector('.settings-glass-card:nth-child(3) .section-desc'),
        geoTitle: document.querySelector('.settings-glass-card:nth-child(4) h3'),
        geoDesc: document.querySelector('.settings-glass-card:nth-child(4) .section-desc'),
        helpTitle: document.querySelector('.settings-glass-card:nth-child(8) h3'),
        helpDesc: document.querySelector('.settings-glass-card:nth-child(8) .section-desc')
    };

    if (lang === 'bn') {
        if (elementsToTranslate.logoTitle) elementsToTranslate.logoTitle.innerHTML = 'মেডি <span class="highlight">ফাইন্ডার</span>';
        if (elementsToTranslate.storeSetupTitle) elementsToTranslate.storeSetupTitle.innerHTML = '<i class="fa-solid fa-store"></i> প্রধান দোকান সেটআপ';
        if (elementsToTranslate.storeSetupDesc) elementsToTranslate.storeSetupDesc.innerText = 'আপনার নিবন্ধিত অফিসিয়াল দোকানের নাম পরিচালনা করুন।';
        if (elementsToTranslate.licenseTitle) elementsToTranslate.licenseTitle.innerHTML = '<i class="fa-solid fa-file-shield"></i> সরকারি লাইসেন্স হাব';
        if (elementsToTranslate.licenseDesc) elementsToTranslate.licenseDesc.innerText = 'আপনার সরকারি ড্রাগ লাইসেন্স এখানে আপলোড ও যাচাই করুন।';
        if (elementsToTranslate.bankTitle) elementsToTranslate.bankTitle.innerHTML = '<i class="fa-solid fa-bank"></i> ব্যাংক অ্যাকাউন্ট ডিটেইলস (KYC)';
        if (elementsToTranslate.bankDesc) elementsToTranslate.bankDesc.innerText = 'ব্যাংক অ্যাকাউন্ট, IFSC কোড এবং সেটেলমেন্ট UPI আইডি পরিচালনা করুন।';
        if (elementsToTranslate.geoTitle) elementsToTranslate.geoTitle.innerHTML = '<i class="fa-solid fa-map-location-dot"></i> লোকেশন ও ঠিকানা ম্যাপিং';
        if (elementsToTranslate.geoDesc) elementsToTranslate.geoDesc.innerText = 'দোকানের অবস্থান, পিনকোড এবং লাইভ ম্যাপ কনফিগার করুন।';
        if (elementsToTranslate.helpTitle) elementsToTranslate.helpTitle.innerHTML = '<i class="fa-solid fa-circle-question"></i> সাহায্য কেন্দ্র ও মার্চেন্ট গাইড';
        if (elementsToTranslate.helpDesc) elementsToTranslate.helpDesc.innerText = 'যেকোনো অপারেশনাল সমস্যা তাৎক্ষণিকভাবে সমাধান করার নির্দেশিকা।';
    } else {
        if (elementsToTranslate.logoTitle) elementsToTranslate.logoTitle.innerHTML = 'MEDI <span class="highlight">FINDER</span>';
        if (elementsToTranslate.storeSetupTitle) elementsToTranslate.storeSetupTitle.innerHTML = '<i class="fa-solid fa-store"></i> Store Core Setup';
        if (elementsToTranslate.storeSetupDesc) elementsToTranslate.storeSetupDesc.innerText = 'Manage your registered official shop identity.';
        if (elementsToTranslate.licenseTitle) elementsToTranslate.licenseTitle.innerHTML = '<i class="fa-solid fa-file-shield"></i> Government License Hub';
        if (elementsToTranslate.licenseDesc) elementsToTranslate.licenseDesc.innerText = 'Upload and verify your government drug license here.';
        if (elementsToTranslate.bankTitle) elementsToTranslate.bankTitle.innerHTML = '<i class="fa-solid fa-bank"></i> Bank Account Details (KYC)';
        if (elementsToTranslate.bankDesc) elementsToTranslate.bankDesc.innerText = 'Manage bank accounts, IFSC code, and settlement UPI IDs.';
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

            let kycImg = null;
            try {
                const { data: kycRow } = await dbSupabase
                    .from('merchant_kyc')
                    .select('license_img')
                    .eq('merchant_id', merchantData.id)
                    .maybeSingle();
                kycImg = kycRow?.license_img || null;
            } catch (e) { /* non-fatal — view state just falls back to no image */ }
            
            window.currentMerchantId = merchantData.id;
            localStorage.setItem("merchantId", String(merchantData.id));
            localStorage.setItem('merchantSessionActive', 'true');
            localStorage.setItem('userEmail', activeUser.email || '');
            
            // 👤 গুগল লগইন হলে user_metadata থেকে নাম/ছবি ফলব্যাক হিসেবে ব্যবহার করা হয়
            const googleName = activeUser.user_metadata?.full_name || activeUser.user_metadata?.name || '';
            const googleAvatar = activeUser.user_metadata?.avatar_url || activeUser.user_metadata?.picture || '';
            const resolvedMerchantName = merchantData.merchant_name || googleName || '';

            if (document.getElementById('merchantNameInput')) document.getElementById('merchantNameInput').value = resolvedMerchantName;
            if (document.getElementById('shopNameInput')) document.getElementById('shopNameInput').value = resolvedMerchantName;
            if (document.getElementById('merchantEmailInput')) document.getElementById('merchantEmailInput').value = merchantData.email || '';
            if (document.getElementById('merchantPhoneInput')) document.getElementById('merchantPhoneInput').value = merchantData.phone || '';
            if (document.getElementById('licenseIdInput')) document.getElementById('licenseIdInput').value = merchantData.license_id || '';

            // 🆔 UID — always pulled live from the database (never hardcoded)
            const uidBadgeEl = document.getElementById('uidBadge');
            if (uidBadgeEl) {
                const realUid = merchantData.uid || merchantData.merchant_code || ('MT' + String(merchantData.id).padStart(4, '0'));
                uidBadgeEl.innerHTML = `<i class="fa-solid fa-fingerprint"></i> ID: #${realUid}`;
            }
            
            // 🏦 অটো-রিসেট প্রতিরোধে সুপাবেস ডাটাবেস থেকে ব্যাংক ডেটা লোড
            if (document.getElementById('bankNoInput')) document.getElementById('bankNoInput').value = merchantData.bank_no || '';
            if (document.getElementById('bankIfscInput')) document.getElementById('bankIfscInput').value = merchantData.ifsc_code || '';
            if (document.getElementById('bankUpiInput')) document.getElementById('bankUpiInput').value = merchantData.upi_id || '';
            if (merchantData.bank_image && document.getElementById('bankFileNameDisplay')) {
                document.getElementById('bankFileNameDisplay').innerText = `📄 Document Synced Successfully`;
            }

            if (document.getElementById('profileDisplay')) {
                if (merchantData.merchant_avatar) {
                    document.getElementById('profileDisplay').src = merchantData.merchant_avatar;
                    localStorage.setItem('merchant_avatar', merchantData.merchant_avatar);
                } else if (googleAvatar) {
                    // কাস্টম আপলোড না থাকলে গুগলের ছবিটা দেখাও (ডিফল্ট ব্রোকেন আইকনের বদলে)
                    document.getElementById('profileDisplay').src = googleAvatar;
                }
                // দুটোর কোনোটাই না থাকলে HTML-এ সেট করা নিরপেক্ষ প্লেসহোল্ডার আইকনটাই থেকে যাবে
            }

            renderLicenseCard(merchantData, kycImg);
            renderBankCard(merchantData);

            const unlocked = merchantData.license_status === 'verified';
            document.getElementById('bankCard') && (document.getElementById('bankCard').style.display = unlocked ? '' : 'none');
            document.getElementById('geoCard') && (document.getElementById('geoCard').style.display = unlocked ? '' : 'none');
            
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