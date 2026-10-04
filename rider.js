// ==========================================
// 1. Global Configuration & Supabase Initialization
// URL & key loaded from supabase-constants.js
// ==========================================
const supabaseClient = (typeof supabase !== 'undefined' && typeof SUPABASE_URL !== 'undefined')
    ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================
// ✅ NEW: Real shop/customer contact + address resolution helpers
// (orders.pharmacy_name is often blank — real shop info must be
// joined from merchants via orders.merchant_id. Customer address
// comes from orders.customer_address / delivery_address / address
// fallback chain, confirmed against the live orders schema.)
// ============================================================
function cleanTelNumber(phone) {
    if (!phone) return '';
    const cleaned = String(phone).trim().replace(/[\s\-\(\)]/g, '');
    return cleaned;
}

// Builds a safe call button. If no valid phone is available, renders
// a disabled "No phone available" pill instead of a fake tel: link.
function buildCallButtonHtml(label, phone, extraClass) {
    const tel = cleanTelNumber(phone);
    if (!tel) {
        return `<span class="btn-call-user ${extraClass || ''}" style="background:#94a3b8; cursor:not-allowed; opacity:0.75;"><i class="fa-solid fa-phone-slash"></i> No phone available</span>`;
    }
    return `<a href="tel:${escapeHtml(tel)}" class="btn-call-user ${extraClass || ''}"><i class="fa-solid fa-phone"></i> ${escapeHtml(label)}</a>`;
}

function getCustomerInfo(order) {
    if (!order) return { name: 'Customer', phone: '', address: '' };
    const name = order.user_name || order.customer_name || 'Customer';
    const phone = order.user_phone || order.customer_phone || '';
    const address = order.customer_address || order.delivery_address || order.address || '';
    return { name, phone, address };
}

// Fetches real shop (merchant) info via orders.merchant_id — since
// orders.pharmacy_name/address/phone are frequently blank in practice.
// Falls back to orders.pharmacy_name + pharmacy_lat/lon only if no
// merchant row can be resolved. Caches the result on the order object
// so repeated calls (map + card render) don't re-fetch.
async function getShopInfo(order) {
    if (!order) return { name: 'Pharmacy', address: '', phone: '', lat: null, lon: null };
    if (order.__shopInfoCache) return order.__shopInfoCache;

    let name = order.pharmacy_name || '';
    let address = '';
    let phone = '';
    let lat = (order.pharmacy_lat !== undefined && order.pharmacy_lat !== null) ? Number(order.pharmacy_lat) : null;
    let lon = (order.pharmacy_lon !== undefined && order.pharmacy_lon !== null) ? Number(order.pharmacy_lon) : null;

    if (order.merchant_id && supabaseClient) {
        try {
            const { data: merchant, error } = await supabaseClient
                .from('merchants')
                .select('shop_name, merchant_name, phone, address, resolved_address, city, district, state, pincode, latitude, longitude')
                .eq('id', order.merchant_id)
                .maybeSingle();
            if (!error && merchant) {
                name = merchant.shop_name || merchant.merchant_name || name;
                address = merchant.resolved_address || merchant.address ||
                    [merchant.address, merchant.city, merchant.district, merchant.state, merchant.pincode].filter(Boolean).join(', ');
                phone = merchant.phone || '';
                if (lat === null && merchant.latitude !== null && merchant.latitude !== undefined) lat = Number(merchant.latitude);
                if (lon === null && merchant.longitude !== null && merchant.longitude !== undefined) lon = Number(merchant.longitude);
            }
        } catch (e) {
            // silent fallback to whatever order-level data exists — never fake it
        }
    }

    const info = {
        name: name || 'Pharmacy',
        address: address || '',
        phone: phone || '',
        lat: (lat !== null && !isNaN(lat)) ? lat : null,
        lon: (lon !== null && !isNaN(lon)) ? lon : null
    };
    order.__shopInfoCache = info;
    return info;
}

// Global Variables
let activeOrderData = null; 
let map = null;
let countdownTimer = null;
let riderActiveMinutes = 600; 
let currentRiderId = localStorage.getItem("riderId") || ""; 
let cachedRiderPosition = null;

// ✅ NEW: On Duty / Off Duty স্ট্যাটাস (সব পেজে localStorage দিয়ে সিঙ্ক থাকবে)
let isOnDuty = localStorage.getItem("rider_duty_status") !== "off"; // ডিফল্ট = ON DUTY
// ✅ NEW: লাইভ জিপিএস ব্রডকাস্টিং হ্যান্ডেল
let liveLocationInterval = null;
let liveRiderMarker = null;

// ============================================================
// ✅ NEW BLOCK: Performance utilities — debounce/throttle/cache
// ============================================================
function debounce(fn, wait = 300) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
}

function throttle(fn, limit = 300) {
    let inThrottle = false;
    return (...args) => {
        if (inThrottle) return;
        fn(...args);
        inThrottle = true;
        setTimeout(() => { inThrottle = false; }, limit);
    };
}

// ছোট TTL সহ in-memory request cache — একই ডেটা বারবার fetch করা এড়ানোর জন্য
const _requestCache = new Map();
async function cachedFetch(key, fetchFn, ttlMs = 15000) {
    const now = Date.now();
    const hit = _requestCache.get(key);
    if (hit && (now - hit.time) < ttlMs) return hit.value;
    const value = await fetchFn();
    _requestCache.set(key, { value, time: now });
    return value;
}

// ============================================================
// ✅ NEW: একই error toast বারবার দেখানো বন্ধ — প্রতিটা key-র জন্য cooldown থাকে
// ============================================================
const _toastOnceAt = {};
function toastOnce(key, msg, type = 'error', cooldownMs = 60000) {
    const now = Date.now();
    if (_toastOnceAt[key] && (now - _toastOnceAt[key]) < cooldownMs) return;
    _toastOnceAt[key] = now;
    showToast(msg, type);
}

// ============================================================
// ✅ NEW: Delivery charge নিয়ম — pharmacy থেকে customer পর্যন্ত দূরত্ব
//   ≤ 10 km  → ₹25
//   > 10 km  → ₹35  (20 km বা তার বেশিও ₹35)
// ============================================================
const DELIVERY_NEAR_KM = 10;
const DELIVERY_NEAR_CHARGE = 25;
const DELIVERY_FAR_CHARGE = 35;

function distanceKmExact(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeDeliveryCharge(order) {
    if (!order) return DELIVERY_NEAR_CHARGE;
    const num = v => (v === undefined || v === null || v === '') ? null : Number(v);
    const shop = order.__shopInfoCache || {};
    const pLat = num(order.pharmacy_lat) !== null ? num(order.pharmacy_lat) : num(shop.lat);
    const pLon = num(order.pharmacy_lon) !== null ? num(order.pharmacy_lon) : num(shop.lon);
    const uLat = num(order.user_lat);
    const uLon = num(order.user_lon);
    if ([pLat, pLon, uLat, uLon].every(v => v !== null && !isNaN(v))) {
        const km = distanceKmExact(pLat, pLon, uLat, uLon);
        return km <= DELIVERY_NEAR_KM ? DELIVERY_NEAR_CHARGE : DELIVERY_FAR_CHARGE;
    }
    // coordinates নেই — আগে থেকে সঠিক slab সেভ থাকলে সেটাই, না থাকলে base charge
    const stored = Number(order.delivery_charge);
    if (stored === DELIVERY_NEAR_CHARGE || stored === DELIVERY_FAR_CHARGE) return stored;
    return DELIVERY_NEAR_CHARGE;
}

// ============================================================
// ✅ NEW: auth user id / riders.id একবার বের করে ক্যাশ করা (প্রতি GPS tick এ network call নয়)
// ============================================================
let _riderAuthUserId = null;
async function getRiderAuthId() {
    if (_riderAuthUserId) return _riderAuthUserId;
    if (!supabaseClient) return null;
    const { data: { session } } = await supabaseClient.auth.getSession();
    _riderAuthUserId = (session && session.user && session.user.id) || null;
    return _riderAuthUserId;
}

async function ensureRiderBigIntId() {
    const cached = parseInt(currentRiderId) || parseInt(localStorage.getItem('riderId'));
    if (cached) { currentRiderId = cached; return cached; }
    if (!supabaseClient) return null;
    const authId = await getRiderAuthId();
    if (!authId) return null;
    const { data, error } = await supabaseClient.from('riders').select('id').eq('auth_user_id', authId).maybeSingle();
    if (error || !data || !data.id) return null;
    currentRiderId = data.id;
    localStorage.setItem('riderId', data.id);
    return data.id;
}

// ==========================================
// ✅ NEW BLOCK (400-FIX helper): Schema-safe riders table update
// ==========================================
// Central helper for every UPDATE against the `riders` table.
//
// Why this exists: the spec forbids guessing at columns that may not
// exist on `riders` (e.g. vehicle_plate / vehicle_type) and forbids
// silently eating errors. PostgREST returns a specific, recognisable
// error when a column in the update payload doesn't exist in its
// schema cache (code 'PGRST204', message like
// "Could not find the 'vehicle_plate' column of 'riders' in the schema
// cache"). This helper:
//   1. Always resolves the target row by auth_user_id (never email) —
//      this matches the riders RLS policy (auth.uid() = auth_user_id)
//      and is the root fix for the "PATCH /riders?email=..." 400/403.
//   2. Sends the full payload first.
//   3. If PostgREST reports an unknown-column error, it strips exactly
//      that column from the payload and retries — so we adapt to the
//      *actual* live schema instead of assuming columns exist, without
//      silently dropping fields that ARE valid.
//   4. Surfaces every Supabase error object (code/message/details/hint)
//      to the console and rethrows so callers can show a real UI error.
async function safeUpdateRiderByAuthUser(authUserId, payload, { maxRetries = 6, returning = true } = {}) {
    if (!supabaseClient) throw new Error('Supabase client not initialized');
    if (!authUserId) throw new Error('Missing auth_user_id for riders update');

    let workingPayload = { ...payload };
    let attempts = 0;

    while (attempts <= maxRetries) {
        attempts++;
        let q = supabaseClient
            .from('riders')
            .update(workingPayload)
            .eq('auth_user_id', authUserId);
        if (returning) q = q.select(); // GPS tick এ পুরো row ফেরত আনার দরকার নেই
        const { data, error } = await q;

        if (!error) {
            return { data, error: null, appliedPayload: workingPayload };
        }

        console.error("RIDER UPDATE ERROR:", {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint
        });

        // PostgREST "unknown column" signature — safe to drop that one
        // field and retry with what's left. Any other error is real and
        // must propagate (never silently swallowed).
        const unknownColMatch = typeof error.message === 'string'
            ? error.message.match(/Could not find the '([^']+)' column/i)
            : null;
        const isUnknownColumnError = error.code === 'PGRST204' && unknownColMatch;

        if (isUnknownColumnError) {
            const badCol = unknownColMatch[1];
            if (!(badCol in workingPayload)) {
                // Nothing left to strip — this isn't actually recoverable, bail out.
                throw error;
            }
            const { [badCol]: _drop, ...rest } = workingPayload;
            workingPayload = rest;
            if (Object.keys(workingPayload).length === 0) {
                // Every field was rejected — nothing valid to save.
                throw error;
            }
            continue; // retry with the trimmed payload
        }

        // Not a recoverable schema mismatch — surface it as-is.
        throw error;
    }

    throw new Error('safeUpdateRiderByAuthUser: exceeded retry budget while adapting payload to schema');
}

// ============================================================
// ✅ NEW BLOCK: Zomato/Swiggy স্টাইল স্মুথ পেজ ট্রানজিশন (SPA-like)
// পেজ পাল্টানোর সময় সাদা ফ্ল্যাশ/জাম্প এর বদলে fade in/out হবে, আর
// বটম-ন্যাভ/হেডার অ্যাভাটার ক্লিকে navigate করার আগে ছোট fade-out হবে
// ============================================================
(function enableSmoothPageTransitions() {
    const styleTag = document.createElement('style');
    styleTag.textContent = `
        body { opacity: 0; transition: opacity 0.22s ease; }
        body.page-ready { opacity: 1; }
        img { transition: opacity 0.25s ease; }
    `;
    document.head.appendChild(styleTag);

    function fadeInBody() {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => document.body.classList.add('page-ready'));
        });
    }

    function navigateWithFade(url) {
        document.body.classList.remove('page-ready');
        setTimeout(() => { window.location.href = url; }, 160);
    }

    document.addEventListener("DOMContentLoaded", () => {
        fadeInBody();

        // ✅ বটম নেভিগেশন এবং যেকোনো internal .html লিংকে ক্লিক করলে smooth fade-out করে তারপর navigate করবে
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href$=".html"], a[href*=".html?"]');
            if (!link) return;
            const href = link.getAttribute('href');
            if (!href || href.startsWith('http') || link.target === '_blank') return;
            e.preventDefault();
            navigateWithFade(href);
        });
    });

    // Header avatar বাটনের মতো onclick="window.location.href=...' ব্যবহৃত জায়গার জন্যও ব্যবহারযোগ্য
    window.navigateWithFade = navigateWithFade;
})();

// ✅ NEW: সব <img> ট্যাগে lazy loading চালু (উপরের navbar লোগো ছাড়া — সেটা সবসময় সাথে সাথেই লাগবে)
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('img').forEach(img => {
        if (!img.closest('.navbar') && !img.hasAttribute('loading')) {
            img.setAttribute('loading', 'lazy');
        }
    });
});

// DOM Content Loaded Handler
document.addEventListener("DOMContentLoaded", async () => {
    if (!supabaseClient) return;
    try {
        // Wait a moment for Supabase SDK to hydrate session from localStorage
        await new Promise(r => setTimeout(r, 100));
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error) {

            // Don't redirect on session check errors - let the page load
        } else if (!window.location.pathname.includes("home.html") && !session) {
            // Only redirect if there's truly no session after waiting

            window.location.replace("home.html");
            return;
        }
        
        if (session && session.user) {
            localStorage.setItem("isLoggedIn", "true");
            localStorage.setItem("userEmail", session.user.email);

            // ✅ FIX: আগে riders টেবিলে row শুধু autoApplyGoogleAvatar() এর ভেতরেই (এবং সেটাও
            // শুধু Google ছবি থাকলে + local avatar cache খালি থাকলে) তৈরি হতো। ফলে email/password
            // দিয়ে লগইন করা রাইডার বা যাদের avatar cache আগে থেকেই সেট আছে, তাদের riders টেবিলে
            // কোনো row-ই তৈরি হতো না। এর ফলে duty_status আপডেট (toggle/heartbeat) নীরবে fail করত
            // (admin dashboard এ "Online Riders" 0 দেখাত) এবং loadCurrentRiderProfileStatus() row
            // না পেয়ে সাথে সাথেই থেমে যেত (name/username/KYC ব্যাজ কখনো আপডেট হতো না)।
            // এখন লগইনের সাথে সাথেই একটা row গ্যারান্টি করা হচ্ছে।
            await ensureRiderDbRow(session.user);

            // Google দিয়ে লগইন করলে Google প্রোফাইল পিকচার অটোমেটিক অ্যাভাটার হিসেবে বসবে —
            // তবে rider যদি আগে থেকেই নিজের কাস্টম অ্যাভাটার আপলোড/সেট করে থাকে (riders.avatar_url বা
            // localStorage rider_avatar), সেটা এখানে ওভাররাইট হবে না — শুধু প্রথমবার/ফাঁকা থাকলেই বসবে।
            await autoApplyGoogleAvatar(session.user);
        }
    } catch (secErr) {

        // Don't redirect on errors - let the page load with limited functionality
    }

    const savedLang = localStorage.getItem("app_language") || "en";
    applyInstantTranslation(savedLang);

    await loadCurrentRiderProfileStatus();

    // ✅ NEW: On Duty / Off Duty সুইচ UI সিঙ্ক করা (হোম ও অর্ডার পেজে)
    initDutyToggleUI();

    // ✅ NEW FIX: লগইন/পেজ লোড হওয়ার সাথে সাথেই riders টেবিলে duty_status DB তে সিঙ্ক করা।
    // আগে duty_status শুধু ম্যানুয়ালি টগল বাটনে ক্লিক করলেই DB তে সেভ হতো, তাই লগইন করার পরও
    // অ্যাডমিন প্যানেলের "Online Riders" কাউন্ট ০ দেখাচ্ছিল যতক্ষণ না রাইডার নিজে বাটনে ক্লিক করছিল।
    syncDutyStatusOnPageLoad();
    startDutyHeartbeat();

    // ✅ NEW: single-file SPA — decide which tab to show on load. A refresh keeps
    // you on whichever tab you were last on (sessionStorage), a `?open=kyc` deep
    // link (from the "Verify to earn" popup) always forces the Profile tab open
    // and launches the KYC wizard, and otherwise it defaults to Home.
    let initialTab = 'home';
    try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('open') === 'kyc') {
            initialTab = 'profile';
        } else if (localStorage.getItem('rider_kyc_wizard_open') === '1') {
            // ✅ KYC ফর্ম খোলা অবস্থায় পেজ রিলোড/ট্যাব কিল হয়েছিল (যেমন ক্যামেরা খোলার পর low memory) —
            // হোমে না গিয়ে সরাসরি KYC তে ফিরে যাবে, draft সহ
            initialTab = 'profile';
            window._resumeKycWizard = true;
        } else {
            const savedTab = sessionStorage.getItem('rider_active_tab');
            if (savedTab) initialTab = savedTab;
        }
    } catch (e) {}
    switchRiderTab(initialTab);

    if (initialTab === 'profile') {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const wantsKyc = urlParams.get('open') === 'kyc' || window._resumeKycWizard === true;
            if (wantsKyc && typeof openKycWizard === 'function') {
                const kycStatus = window._kycApplicationCache ? window._kycApplicationCache.status : 'not_submitted';
                if (kycStatus === 'approved' || kycStatus === 'pending') {
                    // আর খোলার দরকার নেই — resume flag/draft মুছে ফেলা
                    window._resumeKycWizard = false;
                    onKycWizardClosed();
                    if (kycStatus === 'approved') clearKycDraft();
                } else {
                    setTimeout(() => openKycWizard(), 300);
                }
            }
        } catch (e) {}
    }

    // ✅ NEW: ব্রাউজার ব্যাকগ্রাউন্ডে থাকলেও নতুন অর্ডার নোটিফিকেশনের জন্য পারমিশন রিকোয়েস্ট
    // Notification permission is asked only when the rider taps ON DUTY (see toggleDutyStatus)

    // ✅ NEW: রাইডার অন-ডিউটি থাকলে প্রতি ৫ সেকেন্ডে লাইভ লোকেশন ব্রডকাস্ট শুরু
    startLiveLocationTracking();

    if (document.getElementById("todayTotalEarnings")) {
        initEarningsPage();
    }
    
    if (document.getElementById('zomatoRealMap')) {
        initBaseTrackingMap();
    }
    
    if (document.getElementById("ordersContainer")) {
        listenToAvailableOrders();
    }
    
    if (document.getElementById("avatarDisplayImage")) {
        const savedAvatar = localStorage.getItem("rider_avatar");
        if (savedAvatar) {
            document.getElementById("avatarDisplayImage").src = savedAvatar;
        } else {
            document.getElementById("avatarDisplayImage").src = "https://cdn-icons-png.flaticon.com/512/149/149071.png"; 
        }
    }

    // ✅ NEW: হোম পেজের হেডারে প্রোফাইল অ্যাভাটার লোড করা
    if (document.getElementById("headerAvatarImg")) {
        const savedHeaderAvatar = localStorage.getItem("rider_avatar");
        if (savedHeaderAvatar) {
            document.getElementById("headerAvatarImg").src = savedHeaderAvatar;
        }
    }
    
    if (document.getElementById("activeHoursTracker")) {
        loadActiveHoursFromDB();
    }

    loadDeliveryNotifications();
    if (window._notifInterval) clearInterval(window._notifInterval);
    window._notifInterval = setInterval(loadDeliveryNotifications, 60000);

    if (supabaseClient) {
        if (window._riderNotifsChannel) supabaseClient.removeChannel(window._riderNotifsChannel);
        window._riderNotifsChannel = supabaseClient
            .channel('rider-notifs-realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rider_notifications' }, payload => {
                const n = payload.new;
                const myId = localStorage.getItem("riderId") || localStorage.getItem("rider_id");
                if (n.rider_id && String(n.rider_id) !== String(myId)) return;

                // ✅ Badge count বাড়ানো, ১০ এর বেশি হলে "10+" দেখানো
                const badge = document.getElementById('noti-badge');
                if (badge) {
                    const current = badge.style.display === 'none' ? 0 : (parseInt(badge.textContent) || 0);
                    const next = current + 1;
                    badge.textContent = next > 10 ? '10+' : String(next);
                    badge.style.display = 'inline-flex';
                }

                // ✅ Dropdown খোলা থাকলেও instant নতুন notification card উপরে বসবে, রিফ্রেশ লাগবে না
                const dropdownBody = document.getElementById('noti-dropdown-body');
                if (dropdownBody) {
                    const placeholder = dropdownBody.querySelector('p.noti-item');
                    if (placeholder) dropdownBody.innerHTML = '';
                    dropdownBody.insertAdjacentHTML('afterbegin', renderNotiItemHtml({ ...n, is_read: false }));
                }

                showToast(`🔔 ${n.title || 'Notification'}: ${sanitizeNotificationMessage(n.message)}`, 'info');
            })
            .subscribe();

        // ✅ NEW: rider_kyc টেবিলে admin কোনো ডকুমেন্ট verify/reject করলে — profile পেজ খোলা
        // থাকলে রিফ্রেশ ছাড়াই সাথে সাথে Pending → Verified/Rejected UI আপডেট হয়ে যাবে
        if (document.getElementById('kycVerifyBanner')) {
            if (window._kycRealtimeChannel) supabaseClient.removeChannel(window._kycRealtimeChannel);
            window._kycRealtimeChannel = supabaseClient
                .channel('rider-kyc-application-realtime')
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rider_kyc_application' }, payload => {
                    const myId = localStorage.getItem("riderId") || localStorage.getItem("rider_id");
                    if (payload.new.rider_id && String(payload.new.rider_id) !== String(myId)) return;
                    const wasStatus = payload.old ? payload.old.status : null;
                    loadCurrentRiderProfileStatus();
                    if (payload.new.status === 'approved' && wasStatus !== 'approved') {
                        showToast("✅ Your KYC has been verified!", "success");
                    } else if (payload.new.status === 'rejected' && wasStatus !== 'rejected') {
                        showToast("⚠️ Your KYC application was rejected — check Profile for details.", "error");
                    }
                })
                .subscribe();
        }
    }
});

// ==========================================
// 2. Map Engine: Always Visible, Dynamic Coordinates & Modes
// ==========================================
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c * 10) / 10;
}

async function initBaseTrackingMap() {
    const sessionOrder = localStorage.getItem("active_delivery_order");

    // ✅ FIX (#15): no more hardcoded Kolkata fallback. Map centers on
    // real rider GPS if available; if not, and there's no active order
    // either, we center on a neutral world view (0,0 zoomed way out is
    // ugly, so we just wait for GPS — Leaflet needs *a* center to init,
    // but we no longer silently pretend it's a real place).
    let centerLat = null, centerLon = null;
    let gotGps = false;
    if (cachedRiderPosition) {
        centerLat = cachedRiderPosition.lat;
        centerLon = cachedRiderPosition.lon;
        gotGps = true;
    } else {
        // ✅ smooth: ক্যাশ করা লোকেশন নিয়ে দ্রুত (২.৫ সেকেন্ডের বেশি অপেক্ষা নয়), high-accuracy ছাড়া
        try {
            const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, maximumAge: 300000, timeout: 2500 }));
            centerLat = pos.coords.latitude;
            centerLon = pos.coords.longitude;
            cachedRiderPosition = { lat: centerLat, lon: centerLon };
            gotGps = true;
        } catch(e) {}
    }

    let shopInfo = null;
    if (sessionOrder) {
        activeOrderData = JSON.parse(sessionOrder);
        shopInfo = await getShopInfo(activeOrderData);
        const custInfo = getCustomerInfo(activeOrderData);

        const pLat = shopInfo.lat;
        const pLon = shopInfo.lon;
        const uLat = (activeOrderData.user_lat !== undefined && activeOrderData.user_lat !== null) ? Number(activeOrderData.user_lat) : null;
        const uLon = (activeOrderData.user_lon !== undefined && activeOrderData.user_lon !== null) ? Number(activeOrderData.user_lon) : null;

        // ✅ FIX: rider এর আসল GPS পাওয়া গেলে ম্যাপ সেন্টার তাঁর নিজের অবস্থানেই থাকবে,
        // না পেলে real pharmacy/customer কোঅর্ডিনেট থাকলে তার মাঝামাঝি — কখনো fake location নয়
        if (!gotGps) {
            if (pLat !== null && pLon !== null && uLat !== null && uLon !== null) {
                centerLat = (pLat + uLat) / 2;
                centerLon = (pLon + uLon) / 2;
            } else if (pLat !== null && pLon !== null) {
                centerLat = pLat; centerLon = pLon;
            } else if (uLat !== null && uLon !== null) {
                centerLat = uLat; centerLon = uLon;
            }
        }

        const paymentVal = document.getElementById("paymentStatusValue");
        if (paymentVal) {
            paymentVal.innerText = activeOrderData.payment_status ? activeOrderData.payment_status.toUpperCase() : "ONLINE PAID";
        }

        updateMapVehiclePill(activeOrderData.vehicle_type || 'bike');
    } else {
        // ✅ কোনো active order না থাকলে distance সবসময় 0 KM দেখাবে
        const distEl = document.getElementById("distanceLeftValue");
        const etaEl = document.getElementById("etaValue");
        if (distEl) distEl.innerText = "0 km";
        if (etaEl) etaEl.innerText = "--";
    }

    // ✅ FIX (#15): no fake location anywhere — if we truly have nothing
    // real to center on, default the Leaflet view to a harmless global
    // origin at low zoom rather than a specific fabricated city.
    if (centerLat === null || centerLon === null) {
        centerLat = 20; centerLon = 0;
    }

    map = L.map('zomatoRealMap').setView([centerLat, centerLon], (gotGps || sessionOrder) ? 12 : 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        attribution: 'MediFinder India Express Tracking',
        updateWhenIdle: true,
        keepBuffer: 2
    }).addTo(map);

    // ✅ FIX: rider marker এখন থেকে সবসময় আসল GPS position এ বসবে (আগে ফেক midpoint এ বসতো,
    // যা পরে লাইভ GPS marker এর সাথে দুইটা আলাদা marker দেখাতো)
    if (gotGps) {
        updateLiveRiderMarkerOnMap(centerLat, centerLon);
    }

    if (sessionOrder) {
        renderMapMarkers(activeOrderData, shopInfo);
        loadAcceptedOrderDetails(activeOrderData, shopInfo);
        if (document.getElementById("orderCount")) {
            document.getElementById("orderCount").innerText = "1";
        }
        updateLiveDistanceAndETA(); // ✅ প্রথমবার লোড হওয়ার সাথে সাথেই distance/ETA বসিয়ে দেওয়া
        // Listen for order status changes in real-time
        listenToOrderUpdates(activeOrderData.order_id);
    } else {
        if (document.getElementById("orderCount")) {
            document.getElementById("orderCount").innerText = "0";
        }
        const container = document.getElementById("activeOrdersContainer");
        if (container) {
            container.innerHTML = `
                <div style="text-align:center; padding: 30px 15px; color: #64748b;">
                    <i class="fa-solid fa-box-open" style="font-size: 2.5rem; color: #cbd5e1; margin-bottom: 10px;"></i>
                    <h4>No Active Deliveries</h4>
                    <p style="font-size: 0.85rem; margin-top: 5px;">Accept a request from the home tab to start tracking.</p>
                </div>`;
        }
        const paymentVal = document.getElementById("paymentStatusValue");
        if (paymentVal) paymentVal.innerText = "N/A";
    }
}

// ✅ NEW: "My Location" ফ্লোটিং বাটন — GPS পারমিশন নিয়ে instant নিজের অবস্থানে zoom করবে
function focusMyLocationOnMap() {
    if (!map || !navigator.geolocation) return;
    const btn = document.getElementById("myLocationBtn");
    // ক্যাশ করা লোকেশন থাকলে সাথে সাথে zoom — অপেক্ষা নেই
    if (cachedRiderPosition) {
        map.setView([cachedRiderPosition.lat, cachedRiderPosition.lon], 16, { animate: true });
        updateLiveRiderMarkerOnMap(cachedRiderPosition.lat, cachedRiderPosition.lon);
    }
    if (btn) btn.classList.add("locating");
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude, lon = pos.coords.longitude;
            cachedRiderPosition = { lat, lon };
            map.setView([lat, lon], 16, { animate: true });
            updateLiveRiderMarkerOnMap(lat, lon);
            if (btn) btn.classList.remove("locating");
        },
        (err) => {
            if (btn) btn.classList.remove("locating");
            if (cachedRiderPosition) return; // পুরনো লোকেশন দেখানো হয়ে গেছে, error দেখানোর দরকার নেই
            toastOnce('gps-focus',
                (err && err.code === 1) ? 'Location permission is off. Please allow location access.' : 'Could not find your location yet. Please try again in an open area.',
                'error', 15000);
        },
        { enableHighAccuracy: false, maximumAge: 30000, timeout: 10000 }
    );
}

// ✅ NEW: rider এর বর্তমান GPS অনুযায়ী distance ও ETA লাইভ আপডেট করা
// order accept করার আগে pharmacy কে টার্গেট ধরে, picked_up/out_for_delivery হলে customer কে টার্গেট ধরে
// ✅ REWRITE (#4 + #15): Distance keeps coming from real GPS always.
// ETA now has fixed business logic — pickup phase shows "Pickup", and
// the customer-delivery phase (picked_up/out_for_delivery) always shows
// a flat "20 min" regardless of distance. No fake fallback coordinates
// are used anywhere — missing real coords means "Location unavailable".
function updateLiveDistanceAndETA() {
    const distEl = document.getElementById("distanceLeftValue");
    const etaEl = document.getElementById("etaValue");
    if (!distEl) return;

    if (!activeOrderData || !cachedRiderPosition) {
        distEl.innerText = "0 km";
        if (etaEl) etaEl.innerText = "--";
        return;
    }

    const status = activeOrderData.status || 'accepted';
    // ✅ FIX: `status` এখন accept করার সাথে সাথেই সবসময় 'picked_up' হয়ে যায় (customer
    // ট্র্যাকিং ফিক্সের জন্য), তাই ডেলিভারি-ফেজ বোঝার জন্য এখন `rider_pickup_stage`
    // কলামটাই আসল সোর্স — রাইডার আসলেই ফার্মেসি থেকে তুলেছে কিনা সেটা বলে।
    const pickupStage = activeOrderData.rider_pickup_stage || 'assigned';
    const isDeliveryPhase = (pickupStage === 'picked_up');

    let targetLat, targetLon;
    if (isDeliveryPhase) {
        targetLat = (activeOrderData.user_lat !== undefined && activeOrderData.user_lat !== null) ? Number(activeOrderData.user_lat) : null;
        targetLon = (activeOrderData.user_lon !== undefined && activeOrderData.user_lon !== null) ? Number(activeOrderData.user_lon) : null;
    } else {
        const shop = activeOrderData.__shopInfoCache;
        targetLat = shop ? shop.lat : ((activeOrderData.pharmacy_lat !== undefined && activeOrderData.pharmacy_lat !== null) ? Number(activeOrderData.pharmacy_lat) : null);
        targetLon = shop ? shop.lon : ((activeOrderData.pharmacy_lon !== undefined && activeOrderData.pharmacy_lon !== null) ? Number(activeOrderData.pharmacy_lon) : null);
    }

    if (targetLat === null || targetLon === null || isNaN(targetLat) || isNaN(targetLon)) {
        distEl.innerText = "Location unavailable";
    } else {
        const dist = haversineKm(cachedRiderPosition.lat, cachedRiderPosition.lon, targetLat, targetLon);
        distEl.innerText = `${dist} km`;
    }

    if (etaEl) {
        if (isDeliveryPhase) {
            etaEl.innerText = "20 min"; // ✅ fixed ETA during customer-delivery phase, per business rule
        } else {
            etaEl.innerText = "Pickup"; // pickup/pharmacy phase — no ETA countdown
        }
    }
}

function updateMapVehiclePill(mode) {
    const pillBox = document.getElementById("vehiclePillBox");
    const pillIcon = document.getElementById("vehiclePillIcon");
    const pillText = document.getElementById("vehiclePillText");
    
    if (!pillBox || !pillIcon || !pillText) return;
    
    pillBox.className = "vehicle-pill"; 
    if (mode === 'truck') {
        pillBox.classList.add("truck-mode");
        pillIcon.className = "fa-solid fa-truck";
        pillText.innerText = "Truck";
    } else if (mode === 'van') {
        pillBox.classList.add("van-mode");
        pillIcon.className = "fa-solid fa-van-shuttle";
        pillText.innerText = "Van";
    } else {
        pillBox.classList.add("bike-mode");
        pillIcon.className = "fa-solid fa-motorcycle";
        pillText.innerText = "Bike";
    }
}

// ✅ REWRITE (#3 + #15): markers now carry real shop/customer name,
// full address and phone (with a working call button) in their popups.
// No fake fallback coordinates — a marker is only placed when a real
// lat/lon exists for that party.
async function renderMapMarkers(order, shopInfo) {
    if (!shopInfo) shopInfo = await getShopInfo(order);
    const custInfo = getCustomerInfo(order);

    const pLat = shopInfo.lat, pLon = shopInfo.lon;
    const uLat = (order.user_lat !== undefined && order.user_lat !== null) ? Number(order.user_lat) : null;
    const uLon = (order.user_lon !== undefined && order.user_lon !== null) ? Number(order.user_lon) : null;

    const shopIcon = L.icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/4320/4320355.png', iconSize: [35, 35] });
    const userIcon = L.icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/1216/1216844.png', iconSize: [35, 35] });

    const shopPopup = `
        <div style="min-width:180px;">
            <b>${escapeHtml(shopInfo.name)}</b><br>
            <span style="font-size:0.8rem;color:#555;">${escapeHtml(shopInfo.address) || 'Address unavailable'}</span><br>
            <span style="font-size:0.8rem;">${shopInfo.phone ? 'Phone: ' + escapeHtml(shopInfo.phone) : 'No phone available'}</span><br>
            <div style="margin-top:6px;">${buildCallButtonHtml('Call Pharmacy', shopInfo.phone)}</div>
        </div>`;
    const custPopup = `
        <div style="min-width:180px;">
            <b>${escapeHtml(custInfo.name)}</b><br>
            <span style="font-size:0.8rem;color:#555;">${escapeHtml(custInfo.address) || 'Address unavailable'}</span><br>
            <span style="font-size:0.8rem;">${custInfo.phone ? 'Phone: ' + escapeHtml(custInfo.phone) : 'No phone available'}</span><br>
            <div style="margin-top:6px;">${buildCallButtonHtml('Call Customer', custInfo.phone)}</div>
        </div>`;

    if (pLat !== null && pLon !== null && !isNaN(pLat) && !isNaN(pLon)) {
        L.marker([pLat, pLon], {icon: shopIcon}).addTo(map).bindPopup(shopPopup);
    }
    if (uLat !== null && uLon !== null && !isNaN(uLat) && !isNaN(uLon)) {
        L.marker([uLat, uLon], {icon: userIcon}).addTo(map).bindPopup(custPopup);
    }

    // ✅ FIX: আগে এখানে একটা ফেক "You (Rider)" marker মাঝামাঝি বসানো হতো, যেটা আসল লাইভ GPS
    // marker এর সাথে ডুপ্লিকেট হয়ে যেত। এখন rider marker শুধু updateLiveRiderMarkerOnMap()
    // থেকেই বসে — real GPS position থেকে।
    if (pLat !== null && pLon !== null && uLat !== null && uLon !== null && !isNaN(pLat) && !isNaN(uLat)) {
        L.polyline([[pLat, pLon], [uLat, uLon]], {color: '#e63946', weight: 4, dashArray: '5, 10'}).addTo(map);
    }
}

// ==========================================
// 3. Home Screen: Live Realtime Order Queries
// ==========================================
function listenToOrderUpdates(orderId) {
    if (!supabaseClient) return;
    if (window._orderUpdateChannel) {
        supabaseClient.removeChannel(window._orderUpdateChannel);
        window._orderUpdateChannel = null;
    }
    window._orderUpdateChannel = supabaseClient
        .channel('delivery-order-' + orderId)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `order_id=eq.${orderId}` }, (payload) => {
            if (payload.new.status === 'cancelled') {
                showToast("Order has been cancelled by the merchant.", "error");
                localStorage.removeItem("active_delivery_order");
                setTimeout(() => { switchRiderTab("home"); }, 1500);
            } else if (payload.new.status === 'delivered') {
                showToast("Order marked as delivered!", "success");
                localStorage.removeItem("active_delivery_order");
                setTimeout(() => { switchRiderTab("earning"); }, 1500);
            } else if (activeOrderData && payload.new.rider_pickup_stage && payload.new.rider_pickup_stage !== activeOrderData.rider_pickup_stage) {
                // ✅ FIX: `status` accept করার সাথে সাথেই 'picked_up' হয়ে যায়, তাই আসল
                // পিকআপ-ধাপ সিঙ্ক করতে হলে `rider_pickup_stage` কলামটাই দেখতে হবে
                activeOrderData.rider_pickup_stage = payload.new.rider_pickup_stage;
                localStorage.setItem("active_delivery_order", JSON.stringify(activeOrderData));
                renderDeliveryStatusStep(activeOrderData);
                updateLiveDistanceAndETA();
                panMapToPhaseTarget(activeOrderData);
            }
        })
        .subscribe();
}

// ✅ NEW: Zomato/Swiggy স্টাইল skeleton loader — orders fetch হওয়ার আগ পর্যন্ত
// "No orders" ফ্ল্যাশ না দেখিয়ে একটা shimmer placeholder দেখাবে, ফলে পেজটা স্মুথ মনে হবে
function renderOrdersSkeleton(container) {
    if (!container) return;
    let skeletons = '';
    for (let i = 0; i < 3; i++) {
        skeletons += `
        <div class="order-card skeleton-card">
            <div class="skeleton-row">
                <div class="skeleton-line w-30"></div>
                <div class="skeleton-line w-40" style="margin-left:auto;"></div>
            </div>
            <div class="skeleton-row">
                <div class="skeleton-circle"></div>
                <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
                    <div class="skeleton-line w-60"></div>
                    <div class="skeleton-line w-40"></div>
                </div>
            </div>
            <div class="skeleton-row">
                <div class="skeleton-line w-80"></div>
            </div>
        </div>`;
    }
    container.innerHTML = skeletons;
}

function clearOrdersSkeleton(container) {
    if (!container) return;
    container.querySelectorAll('.skeleton-card').forEach(el => el.remove());
}

function listenToAvailableOrders() {
    if (!supabaseClient) return;
    if (window._ordersChannel) {
        supabaseClient.removeChannel(window._ordersChannel);
        window._ordersChannel = null;
    }
    navigator.geolocation.getCurrentPosition(pos => {
        cachedRiderPosition = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    }, () => {}, { timeout: 5000, maximumAge: 60000 });
    const container = document.getElementById("ordersContainer");
    if (!container) return;

    // ✅ FIX: আগে সরাসরি "No orders available" দেখাতো, যেটা ১ মুহূর্ত পরে data এলে flash/flicker করতো।
    // এখন shimmer skeleton দেখাবে যতক্ষণ না আসল data লোড হয়।
    renderOrdersSkeleton(container);

    // ✅ পেজ লোড হওয়ার সাথে সাথেই বর্তমান broadcasted অর্ডারগুলো একবার লোড করা (অন-ডিউটি থাকলে)
    fetchPendingOrdersSnapshot();

    window._ordersChannel = supabaseClient
        .channel('public:orders')
        // ❌ FIX: আগে এখানে INSERT + status==='pending' শুনে সাথে সাথেই order দেখিয়ে দিত —
        // মানে merchant broadcast করার আগেই rider order দেখে ফেলত। এই listener পুরোপুরি
        // বাদ দেওয়া হলো। এখন order শুধু merchant broadcast করলেই (status → 'broadcasted')
        // rider এর কাছে live আসবে, নিচের UPDATE listener দিয়ে।
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
            const isBroadcastLike = (payload.new.status === 'broadcasted' || payload.new.status === 'shipped') && payload.new.delivery_partner !== 'courier';
            if (isBroadcastLike && !payload.new.rider_id) {
                if (!isOnDuty) return;
                if (!document.getElementById(`order-${payload.new.order_id}`) && !isOrderRejectedByMe(payload.new.order_id)) {
                    renderAvailableOrder(payload.new);
                    fireNewOrderNotification(payload.new); // 🔴 merchant ship করার সাথে সাথেই notification
                }
            } else if (!isBroadcastLike) {
                const card = document.getElementById(`order-${payload.new.order_id}`);
                if (card) { card.remove(); checkIfOrdersEmpty(); }
                // ✅ NEW: অন্য রাইডার এই অর্ডার accept করলে (বা অর্ডারটা আর available না থাকলে),
                // এই অর্ডারের নোটিফিকেশনও নিজে থেকে সরিয়ে দেওয়া হয় — ম্যানুয়ালি ✕ করা লাগবে না
                // ✅ smooth: লাইভ লোকেশন আপডেটে প্রতি ৫ সেকেন্ডে এই event আসে, তাই প্রতি order এর জন্য মাত্র একবারই purge
                window._purgedNotiOrders = window._purgedNotiOrders || new Set();
                const purgeKey = String(payload.new.order_id);
                if (!window._purgedNotiOrders.has(purgeKey)) {
                    window._purgedNotiOrders.add(purgeKey);
                    removeOrderNotificationByOrderId(payload.new.order_id);
                }
            }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, (payload) => {
            const card = document.getElementById(`order-${payload.old.order_id}`);
            if (card) card.remove();
            checkIfOrdersEmpty();
        })
        .subscribe();

    // ✅ NEW: Safety-net — realtime event কোনো কারণে (network drop, RLS, missed event) না
    // পৌঁছালেও, প্রতি ২০ সেকেন্ডে একবার snapshot আবার fetch হবে, যাতে rider-এর home page
    // অনির্দিষ্টকাল খালি না থেকে যায়। এটা মূল সমস্যার (RLS/replication) বিকল্প না, শুধু fallback।
    if (window._ordersPollInterval) clearInterval(window._ordersPollInterval);
    window._ordersPollInterval = setInterval(() => {
        if (isOnDuty && !document.hidden) fetchPendingOrdersSnapshot();
    }, 20000);
}

function renderAvailableOrder(order) {
    const container = document.getElementById("ordersContainer");
    if (!container) return;
    clearOrdersSkeleton(container); // ✅ realtime অর্ডার আসলে shimmer থাকলে সেটাও সরিয়ে দাও
    const emptyState = container.querySelector("div[style*='text-align:center']");
    if (emptyState && !emptyState.classList.contains("order-card")) emptyState.remove();

    // Calculate distance if coords available
    let distText = '';
    if (order.pharmacy_lat && order.pharmacy_lon) {
        if (cachedRiderPosition) {
            const dist = haversineKm(cachedRiderPosition.lat, cachedRiderPosition.lon, order.pharmacy_lat, order.pharmacy_lon);
            distText = `<span class="distance-info" style="font-size:0.75rem;color:#64748b;"><i class="fa-solid fa-location-dot"></i> ${dist ? dist + ' km away' : ''}</span>`;
        } else {
            navigator.geolocation.getCurrentPosition(pos => {
                cachedRiderPosition = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                const dist = haversineKm(pos.coords.latitude, pos.coords.longitude, order.pharmacy_lat, order.pharmacy_lon);
                const distEl = document.querySelector(`#order-${order.order_id} .distance-info`);
                if (distEl) distEl.innerText = dist ? `${dist} km away` : '';
            }, () => {}, { timeout: 3000 });
            distText = '<span class="distance-info" style="font-size:0.75rem;color:#64748b;"><i class="fa-solid fa-location-dot"></i> Calculating...</span>';
        }
    }

    // ✅ NEW: KYC approved না থাকলে Accept বাটন লক থাকবে, ক্লিক করলে popup + প্রোফাইলের KYC wizard-এ রিডাইরেক্ট
    const canAccept = window._riderLicenseVerified === true;
    const acceptBtnHtml = canAccept
        ? `<button class="btn-accept" onclick="acceptOrder('${order.order_id}', '${encodeURIComponent(JSON.stringify(order))}')">Accept Request</button>`
        : `<button class="btn-accept btn-locked" onclick="showKycRequiredPopup()"><i class="fa-solid fa-lock"></i> Verify to Earn</button>`;

    const cardHtml = `
        <div class="order-card" id="order-${order.order_id}">
            <div class="card-header">
                <span class="vehicle-tag bike"><i class="fa-solid fa-motorcycle"></i> ${order.vehicle_type ? order.vehicle_type.toUpperCase() : 'DELIVERY'}</span>
                <span class="parcel-number">Parcel ID: #${order.order_id}</span>
                <span class="earnings-amount">₹${computeDeliveryCharge(order)}</span>
            </div>
            <div class="delivery-flow">
                <div class="flow-step">
                    <div class="party-details">
                        <h4 class="party-name">${escapeHtml(order.pharmacy_name) || 'Pharmacy Hub'}</h4>
                        ${distText}
                    </div>
                </div>
                <div class="flow-step">
                    <div class="party-details">
                        <h4 class="party-name">${escapeHtml(order.user_name) || 'Customer'}</h4>
                    </div>
                </div>
            </div>
            <div class="card-footer">
                <button class="btn-reject" onclick="rejectOrder('${order.order_id}')">Reject</button>
                ${acceptBtnHtml}
            </div>
        </div>`;
    container.insertAdjacentHTML('beforeend', cardHtml);
}

// ✅ NEW: KYC approve না হওয়া পর্যন্ত অর্ডার accept করার চেষ্টা করলে এই popup দেখাবে, Continue করলে
// সরাসরি প্রোফাইলের KYC wizard-এ (Rider Details থেকে শুরু, আগে যা লেখা ছিল prefill হয়ে) নিয়ে যাবে
function showKycRequiredPopup() {
    const goToProfile = confirm("Please upload your documents and complete KYC before accepting delivery orders.\n\nContinue to KYC now?");
    if (goToProfile) {
        switchRiderTab("profile"); setTimeout(() => { if (typeof openKycWizard === 'function') openKycWizard(); }, 200);
    }
}

// ✅ NEW: এই সেশনে যে অর্ডারগুলো এই রাইডার রিজেক্ট করেছে সেগুলো মনে রাখা হয়,
// যাতে broadcast/snapshot আবার লোড হলেও সেগুলো আবার স্ক্রিনে ফিরে না আসে।
// (অন্য রাইডাররা তবুও এই অর্ডারটা দেখতে ও গ্রহণ করতে পারবে — শুধু এই রাইডারের ভিউ থেকে সরানো হচ্ছে)
window._rejectedOrderIds = window._rejectedOrderIds || new Set();

function isOrderRejectedByMe(orderId) {
    return window._rejectedOrderIds.has(String(orderId));
}

function rejectOrder(orderId) {
    window._rejectedOrderIds.add(String(orderId));
    const card = document.getElementById(`order-${orderId}`);
    if (card) card.remove();
    checkIfOrdersEmpty();
    showToast("Order dismissed from your list.", "info");
}

function checkIfOrdersEmpty() {
    const container = document.getElementById("ordersContainer");
    if (container && container.children.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#999;"><i class="fas fa-inbox" style="font-size:3rem;margin-bottom:12px;display:block;color:#ddd;"></i><p style="font-size:0.9rem;font-weight:600;">No orders available</p><p style="font-size:0.78rem;">New delivery requests will appear here</p></div>`;
    }
}

// ==========================================
// 4. Delivery Management Routing Actions
// ==========================================
async function acceptOrder(orderId, orderObj) {
    if (!supabaseClient) return;
    // ✅ NEW: ডাবল-সেফটি — বাটন লক থাকা সত্ত্বেও কোনোভাবে কল হলে এখানেও আটকে দেওয়া হবে
    if (window._riderLicenseVerified !== true) {
        showKycRequiredPopup();
        return;
    }
    try {
        if (typeof orderObj === 'string') orderObj = JSON.parse(decodeURIComponent(orderObj));
        let riderUuid = '';
        let riderBigIntId = null;
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session?.user?.id) {
                riderUuid = session.user.id;
                const { data: riderRow } = await supabaseClient.from('riders').select('id').eq('auth_user_id', riderUuid).maybeSingle();
                if (riderRow) riderBigIntId = riderRow.id;
            }
        } catch(e) {
            showToast("Session check failed: " + (e.message || e), "error");
        }

        // ✅ FIX: আগে এখানে status: 'accepted' লেখা হতো, কিন্তু merchant নিজেও order প্রথমে
        // accept করার সময় একই 'accepted' status লেখে। ফলে merchant "Shipped" করার পরে (status:
        // 'shipped') যখন rider Accept করত, status আবার 'accepted' এ ফিরে যেত — customer এর
        // অর্ডার ট্র্যাকিং টাইমলাইন উল্টো দিকে চলে যেত ("Accepted by pharmacy" আবার দেখাত),
        // "Out for Delivery" এ যেত না। এখন 'picked_up' লেখা হচ্ছে, যেটা customer পাশে
        // (userscript.js) আগে থেকেই "Out for Delivery" ধাপ হিসেবে ম্যাপ করা আছে — তাই rider
        // Accept করা মাত্রই customer সাথে সাথে "Out for Delivery" দেখবে।
        //
        // ✅ NEW: `status` কাস্টমারের ট্র্যাকিং-এর জন্য (উপরের ফিক্স অনুযায়ী) সাথে সাথেই
        // 'picked_up' লেখা হয়, কিন্তু রাইডারের নিজের স্ক্রিনে তখনও আসলে ফার্মেসিতে পৌঁছায়নি —
        // তাই রাইডারের নিজের দুই-ধাপ পিকআপ ফ্লো (ফার্মেসির দিকনির্দেশ → Arrived → Picked Up →
        // কাস্টমারের দিকনির্দেশ) আলাদা কলাম `rider_pickup_stage` দিয়ে ট্র্যাক করা হয়, `status`
        // ছোঁয়া ছাড়াই। `pickup_deadline_at` একটা ফিক্সড টাইমস্ট্যাম্প — পেজ রিফ্রেশ করলেও
        // টাইমার আবার 25:00 থেকে শুরু না হয়ে ঠিক জায়গা থেকে কাউন্ট করবে।
        const pickupDeadline = new Date(Date.now() + 25 * 60 * 1000).toISOString();
        // ✅ Delivery charge নিয়ম: ≤10 km → ₹25, তার বেশি → ₹35 (pharmacy → customer দূরত্ব)
        const deliveryCharge = computeDeliveryCharge(orderObj);
        const updatePayload = { status: 'picked_up', rider_pickup_stage: 'assigned', pickup_deadline_at: pickupDeadline, delivery_charge: deliveryCharge };
        if (riderBigIntId) updatePayload.rider_id = riderBigIntId;

        const { error } = await supabaseClient
            .from('orders')
            .update(updatePayload)
            .eq('order_id', orderId);

        if (error) throw error;

        orderObj.status = 'picked_up';
        orderObj.rider_pickup_stage = 'assigned';
        orderObj.pickup_deadline_at = pickupDeadline;
        orderObj.delivery_charge = deliveryCharge;
        orderObj.rider_id = riderBigIntId || riderUuid;
        localStorage.setItem("active_delivery_order", JSON.stringify(orderObj));
        showToast("Order Accepted Successfully!", "success");
        switchRiderTab("delivery");
    } catch (error) {

        showToast("Failed to accept order or already assigned to another rider.", "error");
    }
}

// ✅ REWRITE (#1 + #2): full shop (pickup) and customer (deliver-to)
// blocks now show name + complete address + phone, each with its own
// working call button. Shop info is resolved via merchants (join on
// merchant_id) since orders.pharmacy_name/address/phone are frequently
// blank. Missing phone shows "No phone available" — never a fake tel: link.
async function loadAcceptedOrderDetails(order, shopInfo) {
    const container = document.getElementById("activeOrdersContainer");
    if (!container) return;

    if (!shopInfo) shopInfo = await getShopInfo(order);
    const custInfo = getCustomerInfo(order);

    container.innerHTML = `
        <div class="order-card-premium" id="card-${order.order_id}" style="background: #fff; padding: 20px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <span style="font-weight: 700; color:#333;">ID: #${order.order_id}</span>
                <div class="timer-badge" id="liveTimerBox" style="background:#fff2f2; padding:6px 12px; border-radius:20px; color:#e63946;">
                    <i class="fa-solid fa-clock"></i> <span id="timerText">25:00 Mins</span>
                </div>
            </div>
            <div class="delivery-steps" style="border-left: 2px dashed #ddd; padding-left: 15px; margin-bottom: 15px; text-align:left;">
                <p style="margin-bottom:10px;">
                    <strong>Pickup:</strong> ${escapeHtml(shopInfo.name)}<br>
                    <span style="font-size:0.82rem; color:#64748b;">${escapeHtml(shopInfo.address) || 'Address unavailable'}</span><br>
                    <span style="display:inline-flex; align-items:center; gap:8px; margin-top:6px;">
                        <span style="font-size:0.82rem;">${shopInfo.phone ? 'Phone: ' + escapeHtml(shopInfo.phone) : 'No phone available'}</span>
                        ${buildCallButtonHtml('Call Pharmacy', shopInfo.phone)}
                    </span>
                </p>
                <p>
                    <strong>Deliver To:</strong> ${escapeHtml(custInfo.name)}<br>
                    <span style="font-size:0.82rem; color:#64748b;">${escapeHtml(custInfo.address) || 'Address unavailable'}</span><br>
                    <span style="display:inline-flex; align-items:center; gap:8px; margin-top:6px;">
                        <span style="font-size:0.82rem;">${custInfo.phone ? 'Phone: ' + escapeHtml(custInfo.phone) : 'No phone available'}</span>
                    </span>
                </p>
            </div>
            <!-- ✅ NEW: পিকআপ স্ট্যাটাস টগল স্টেপ — কাস্টমারের কাছে যাওয়ার আগে ফার্মেসিতে আগে পৌঁছাতে/প্যাক করতে হবে -->
            <div id="statusStepBar" style="margin-bottom: 15px;"></div>
            <div style="display: flex; justify-content: space-between; align-items: center; background: #f9f9f9; padding: 12px; border-radius: 10px; gap: 8px; flex-wrap: wrap;">
                <div><span>Earnings: </span><strong style="color: #2ec4b6; font-size: 18px;">₹${computeDeliveryCharge(order)}</strong></div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items:center;">
                    <span id="phaseCallBtnSlot"></span>
                    <button id="otpVerifyTriggerBtn" onclick="openOtpModal()" style="background: #e63946; color:#fff; border:none; padding: 10px 18px; border-radius: 8px; font-weight:600; cursor:pointer;">Verify OTP</button>
                </div>
            </div>
        </div>`;
    renderDeliveryStatusStep(order); // ✅ NEW: কারেন্ট স্টেপ অনুযায়ী বাটন/OTP-লক/কল-বাটন রেন্ডার করা
    startDeliveryTimer(order);
    panMapToPhaseTarget(order);
}

// ✅ FIX: টাইমার এখন আর সবসময় ফিক্সড 25:00 থেকে শুরু হয় না — order.pickup_deadline_at
// (একটা ফিক্সড টাইমস্ট্যাম্প, accept করার মুহূর্তেই DB-তে সেভ হয়) থেকে বাকি সময় হিসাব করে,
// তাই পেজ রিফ্রেশ করলেও টাইমার আবার নতুন করে শুরু হয় না — ঠিক জায়গা থেকেই কাউন্ট করে।
function startDeliveryTimer(order) {
    let deadline = order && order.pickup_deadline_at ? new Date(order.pickup_deadline_at).getTime() : null;
    if (!deadline || isNaN(deadline)) {
        // পুরনো অর্ডার যেগুলোর deadline সেভ হয়নি, তাদের জন্য ফলব্যাক — এখন থেকে ২৫ মিনিট, এবং
        // ভবিষ্যতে রিফ্রেশে যেন একই deadline থাকে তার জন্য localStorage-এ সেভ করে দেওয়া হয়
        deadline = Date.now() + 25 * 60 * 1000;
        if (order) {
            order.pickup_deadline_at = new Date(deadline).toISOString();
            localStorage.setItem("active_delivery_order", JSON.stringify(order));
        }
    }

    clearInterval(countdownTimer);
    const tick = () => {
        const timerTextEl = document.getElementById("timerText");
        if (!timerTextEl) return;
        const totalSeconds = Math.round((deadline - Date.now()) / 1000);
        if (totalSeconds <= 0) {
            clearInterval(countdownTimer);
            timerTextEl.innerText = "Delayed!";
            return;
        }
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        timerTextEl.innerText = `${mins}:${secs < 10 ? '0' : ''}${secs} Mins`;
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
}

// ✅ NEW: পিকআপ ধাপ বদলালে ম্যাপ অটো-প্যান করে সেই মুহূর্তের গন্তব্যে (ফার্মেসি বা কাস্টমার) ফোকাস করে
function panMapToPhaseTarget(order) {
    if (!map) return;
    const stage = order.rider_pickup_stage || 'assigned';
    let lat, lon;
    if (stage === 'picked_up') {
        lat = (order.user_lat !== undefined && order.user_lat !== null) ? Number(order.user_lat) : null;
        lon = (order.user_lon !== undefined && order.user_lon !== null) ? Number(order.user_lon) : null;
    } else {
        const shop = order.__shopInfoCache || {};
        lat = shop.lat !== undefined ? shop.lat : null;
        lon = shop.lon !== undefined ? shop.lon : null;
    }
    if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
        map.setView([lat, lon], 15, { animate: true });
    }
}

// ==========================================
// 5B. NEW: পিকআপ স্ট্যাটাস টগল স্টেপ (Arrived at Store → Picked Up → OTP Unlock)
// ==========================================
function renderDeliveryStatusStep(order) {
    const stepBar = document.getElementById("statusStepBar");
    const otpBtn = document.getElementById("otpVerifyTriggerBtn");
    if (!stepBar) return;

    // ✅ FIX: `status` accept করার মুহূর্তেই সবসময় 'picked_up' হয়ে যায় (customer-side ফিক্স,
    // acceptOrder() দ্রষ্টব্য) — তাই রাইডারের নিজের পিকআপ ধাপ বোঝাতে এখন `rider_pickup_stage`
    // ব্যবহার হয়, `status` নয়।
    const stage = order.rider_pickup_stage || 'assigned';

    if (stage === 'arrived_at_store') {
        stepBar.innerHTML = `
            <button onclick="markOrderPickedUp()" style="width:100%; background:#3b82f6; color:#fff; border:none; padding:12px; border-radius:8px; font-weight:600; cursor:pointer;">
                <i class="fa-solid fa-box"></i> Medicine Packed / Mark Picked Up
            </button>`;
        lockOtpButton(otpBtn, true);
    } else if (stage === 'picked_up') {
        stepBar.innerHTML = `
            <div style="background:#dcfce7; color:#16a34a; padding:10px; border-radius:8px; text-align:center; font-weight:600;">
                <i class="fa-solid fa-circle-check"></i> Picked Up — Heading to Customer
            </div>`;
        lockOtpButton(otpBtn, false);
    } else {
        // ডিফল্ট: 'assigned' স্টেজ — এখনও ফার্মেসিতে পৌঁছায়নি
        stepBar.innerHTML = `
            <button onclick="markArrivedAtStore()" style="width:100%; background:#f59e0b; color:#fff; border:none; padding:12px; border-radius:8px; font-weight:600; cursor:pointer;">
                <i class="fa-solid fa-store"></i> Arrived at Pharmacy
            </button>`;
        lockOtpButton(otpBtn, true);
    }

    renderPhaseCallButton(order, stage);
}

// ✅ NEW: ফুটারে সবসময় "Call Customer" দেখানোর বদলে — যে ধাপে আছে সেই পার্টিকেই (ফার্মেসি
// বা কাস্টমার) কল করার বাটন প্রমিনেন্টলি দেখানো হয়, যাতে "merchant এর call বাটন নেই"
// এই সমস্যা না থাকে
function renderPhaseCallButton(order, stage) {
    const slot = document.getElementById("phaseCallBtnSlot");
    if (!slot) return;
    if (stage === 'picked_up') {
        const custInfo = getCustomerInfo(order);
        slot.innerHTML = buildCallButtonHtml('Call Customer', custInfo.phone);
    } else {
        const shop = order.__shopInfoCache || {};
        slot.innerHTML = buildCallButtonHtml('Call Pharmacy', shop.phone);
    }
}

function lockOtpButton(otpBtn, locked) {
    if (!otpBtn) return;
    otpBtn.disabled = locked;
    otpBtn.style.opacity = locked ? "0.5" : "1";
    otpBtn.style.cursor = locked ? "not-allowed" : "pointer";
    otpBtn.title = locked ? "Complete pickup steps first" : "";
}

async function markArrivedAtStore() {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient.from('orders').update({ rider_pickup_stage: 'arrived_at_store' }).eq('order_id', activeOrderData.order_id);
        if (error) throw error;
        activeOrderData.rider_pickup_stage = 'arrived_at_store';
        localStorage.setItem("active_delivery_order", JSON.stringify(activeOrderData));
        renderDeliveryStatusStep(activeOrderData);
        showToast("Status updated: Arrived at Pharmacy. Please collect & pack the medicines.", "success");
    } catch (err) {
        showToast("Failed to update status: " + (err.message || err), "error");
    }
}

async function markOrderPickedUp() {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient.from('orders').update({ rider_pickup_stage: 'picked_up' }).eq('order_id', activeOrderData.order_id);
        if (error) throw error;
        activeOrderData.rider_pickup_stage = 'picked_up';
        localStorage.setItem("active_delivery_order", JSON.stringify(activeOrderData));
        renderDeliveryStatusStep(activeOrderData);
        updateLiveDistanceAndETA(); // ✅ পিকআপের পর টার্গেট এখন pharmacy থেকে customer এ বদলে যাবে
        panMapToPhaseTarget(activeOrderData); // ✅ ম্যাপও এখন কাস্টমারের দিকে প্যান করবে
        showToast("Status updated: Order Picked Up. You can now head to the customer's location.", "success");
    } catch (err) {
        showToast("Failed to update status: " + (err.message || err), "error");
    }
}

// ==========================================
// 5C. NEW: On Duty / Off Duty সুইচ সিস্টেম
// ==========================================
function initDutyToggleUI() {
    const pill = document.getElementById("statusTogglePill") || document.querySelector(".status-toggle-pill");
    if (pill) {
        pill.style.cursor = "pointer";
        pill.onclick = toggleDutyStatus;
    }
    const homeDutyBtn = document.getElementById("dutyToggleBtn");
    if (homeDutyBtn) {
        homeDutyBtn.onclick = toggleDutyStatus;
    }
    renderDutyToggleUI();
}

function renderDutyToggleUI() {
    const pulseDot = document.querySelector(".pulse-dot");
    const statusTxt = document.querySelector(".status-txt");
    const homeDutyBtn = document.getElementById("dutyToggleBtn");

    if (statusTxt) statusTxt.innerText = isOnDuty ? "On Duty" : "Off Duty";
    if (pulseDot) {
        if (isOnDuty) pulseDot.classList.add("active");
        else pulseDot.classList.remove("active");
    }
    if (homeDutyBtn) {
        homeDutyBtn.innerText = isOnDuty ? "🟢 On Duty" : "🔴 Off Duty";
        homeDutyBtn.style.background = isOnDuty ? "#10b981" : "#94a3b8";
    }
}

async function toggleDutyStatus() {
    if (!supabaseClient) return;
    isOnDuty = !isOnDuty;
    localStorage.setItem("rider_duty_status", isOnDuty ? "on" : "off");
    renderDutyToggleUI();

    if (isOnDuty) {
        requestBrowserNotificationPermission(); // asked once, from the rider's own tap
        showToast("You are now ON DUTY. New delivery requests will be visible again.", "info");
        fetchPendingOrdersSnapshot();
        startLiveLocationTracking(true);
    } else {
        showToast("You are now OFF DUTY. New requests are paused to save battery & data.", "info");
        checkIfOrdersEmpty();
        stopLiveLocationTracking();
    }

    try {
        // ✅ FIX: email দিয়ে upsert(onConflict:'email') 403 দিচ্ছিল কারণ RLS policy auth_user_id
        // ম্যাচ করে চেক করে, email না। এখন safeUpdateRiderByAuthUser() দিয়ে auth_user_id ম্যাচ
        // করেই update() করা হচ্ছে — row তো ensureRiderDbRow() দিয়ে লগইনের সময়ই গ্যারান্টিভাবে
        // তৈরি হয়ে যায়। প্রতিটা Supabase error (code/message/details/hint) console এ দেখা যাবে।
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
            await safeUpdateRiderByAuthUser(user.id, { duty_status: isOnDuty ? 'online' : 'offline' });
        }
    } catch (err) {
        console.error("RIDER UPDATE ERROR:", err);
        showToast("Duty status DB update error: " + (err.message || err), "error");
    }
}

// ==========================================
// ✅ NEW BLOCK: Duty-status DB sync (fixes admin dashboard "Online Riders" showing 0)
// ==========================================

// পেজ লোড হওয়ার সাথে সাথেই বর্তমান isOnDuty অবস্থাটা riders টেবিলে লিখে দেওয়া হয়,
// যাতে রাইডার লগইন করা মাত্রই অ্যাডমিন প্যানেলে সে অনলাইন হিসেবে দেখা যায় —
// আগে শুধু ম্যানুয়াল টগল ক্লিকেই এটা DB তে যেত।
async function syncDutyStatusOnPageLoad() {
    if (!supabaseClient) return;
    try {
        // ✅ FIX: এখানেও email-ভিত্তিক upsert(onConflict:'email') 403 দিচ্ছিল। row তৈরির
        // দায়িত্ব ensureRiderDbRow()-এর, তাই এখানে auth_user_id দিয়ে safeUpdateRiderByAuthUser() ব্যবহার করা হচ্ছে।
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;
        await safeUpdateRiderByAuthUser(user.id, {
            duty_status: isOnDuty ? 'online' : 'offline',
            last_active_at: new Date().toISOString()
        });
    } catch (err) {
        // নীরবে ফেইল হবে — UI ব্লক করার দরকার নেই, কিন্তু console এ error থাকবে (safeUpdateRiderByAuthUser এ log হয়)
    }
}

// প্রতি ৬০ সেকেন্ডে "heartbeat" পাঠানো হয় (শুধু duty অন থাকলে), যাতে অ্যাডমিন প্যানেল
// বুঝতে পারে রাইডার এখনও সত্যিকারের অ্যাক্টিভ আছে কিনা (ট্যাব বন্ধ/ক্র্যাশ হলে stale হয়ে যাবে)।
function startDutyHeartbeat() {
    if (window._dutyHeartbeatInterval) clearInterval(window._dutyHeartbeatInterval);
    window._dutyHeartbeatInterval = setInterval(async () => {
        if (!supabaseClient || !isOnDuty) return;
        try {
            // ✅ FIX: email-ভিত্তিক upsert(onConflict:'email') 403 দিচ্ছিল — auth_user_id দিয়ে safeUpdateRiderByAuthUser()
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) return;
            await safeUpdateRiderByAuthUser(user.id, { duty_status: 'online', last_active_at: new Date().toISOString() });
        } catch (err) {
            // silent — heartbeat, error already logged in safeUpdateRiderByAuthUser
        }
    }, 60000);
}

// ব্রাউজার ট্যাব/অ্যাপ বন্ধ হওয়ার সময় (রাইডার ম্যানুয়ালি অফ-ডিউটি না করলেও) best-effort
// ভাবে duty_status = offline সেট করার চেষ্টা করা হয়, যাতে অ্যাডমিন প্যানেল real-time মিথ্যা
// "online" না দেখায়।
//
// ✅ FINAL FIX (spec #10): এখানেই ছিল আসল "PATCH /rest/v1/riders?email=eq...  400 Bad Request"
// error-এর উৎস। দুটো সমস্যা ছিল: (ক) filter email=eq... ব্যবহার হচ্ছিল, যেখানে RLS policy
// auth.uid() = auth_user_id ম্যাচ করে — email না; (খ) Authorization header এ anon
// SUPABASE_KEY পাঠানো হচ্ছিল, actual logged-in user এর session access token না — ফলে
// auth.uid() রিকোয়েস্টের ভেতরে null হয়ে যেত এবং RLS policy কখনো pass করত না।
// এখন: (১) filter auth_user_id=eq.<uid> ব্যবহার করা হচ্ছে, (২) Authorization header এ
// বর্তমান সেশনের real access_token পাঠানো হচ্ছে (এখনো apikey হিসেবে anon key-ই যাচ্ছে,
// যেটা Supabase-এর REST API-র জন্য mandatory এবং সঠিক)। এই দুটো মিলিয়েই RLS policy
// (auth.uid() = auth_user_id) সঠিকভাবে ম্যাচ করবে এবং 400/403 আর আসবে না।
window.addEventListener("pagehide", () => {
    try {
        // KYC চলাকালীন ক্যামেরা খুললে পেজ hide হয় — তখন রাইডারকে offline দেখানো ঠিক না
        if (localStorage.getItem('rider_kyc_wizard_open') === '1') return;
        if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_KEY === 'undefined') return;
        // Supabase JS SDK persists the session in localStorage under a key derived from the
        // project ref — we read the raw persisted session here (rather than awaiting
        // supabaseClient.auth.getSession(), which is async and may not resolve before the
        // page actually unloads) so we can grab the real user id + access token synchronously.
        let authUserId = null;
        let accessToken = null;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
            try {
                const raw = localStorage.getItem(key);
                const parsed = JSON.parse(raw);
                const sessionObj = parsed?.currentSession || parsed; // supabase-js v2 stores the session directly
                if (sessionObj?.user?.id) {
                    authUserId = sessionObj.user.id;
                    accessToken = sessionObj.access_token || null;
                    break;
                }
            } catch (e) { /* not a session blob, skip */ }
        }
        if (!authUserId) return; // no known session — nothing safe to update

        const url = `${SUPABASE_URL}/rest/v1/riders?auth_user_id=eq.${encodeURIComponent(authUserId)}`;
        fetch(url, {
            method: "PATCH",
            keepalive: true,
            headers: {
                "Content-Type": "application/json",
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${accessToken || SUPABASE_KEY}`,
                "Prefer": "return=minimal"
            },
            body: JSON.stringify({ duty_status: "offline" })
        });
    } catch (err) {
        // silent — best effort only, page is already unloading
    }
});

async function fetchPendingOrdersSnapshot() {
    if (!supabaseClient) return;
    const container = document.getElementById("ordersContainer");
    if (!container) return;
    if (!isOnDuty) {
        clearOrdersSkeleton(container);
        checkIfOrdersEmpty();
        return;
    }
    try {
        const { data, error } = await supabaseClient
            .from('orders')
            .select('*')
            .in('status', ['broadcasted', 'shipped']) // ✅ FIX: merchant এর "Ship" বাটন আসলে status='shipped' সেট করে (না 'broadcasted'),
            // কিন্তু এই query আগে শুধু 'broadcasted' খুঁজত — ফলে merchant ship করলেও rider এর কাছে order কখনো আসত না।
            // এখন দুটো status-ই match করবে যাতে ship করা মাত্রই rider এর available orders list এ চলে আসে।
            .neq('delivery_partner', 'courier'); // ✅ Standard-delivery অর্ডার এখন সয়ংক্রিয়ভাবে Shiprocket এ বুক হয়ে যায় —
            // ওগুলো courier দিয়ে যাচ্ছে, তাই rider এর available list এ দেখানো ঠিক না।
        if (error) throw error;

        clearOrdersSkeleton(container); // ✅ real data চলে এসেছে, এখন shimmer সরিয়ে দাও

        if (data && data.length > 0) {
            data.forEach(order => {
                if (!document.getElementById(`order-${order.order_id}`) && !isOrderRejectedByMe(order.order_id)) {
                    renderAvailableOrder(order);
                }
            });
        }
        checkIfOrdersEmpty();
    } catch (err) {
        clearOrdersSkeleton(container);
        checkIfOrdersEmpty();
        showToast("Pending orders load error: " + (err.message || err), "error");
    }
}

// ==========================================
// 5D. NEW: লাইভ জিপিএস লোকেশন ব্রডকাস্টিং (প্রতি ৫ সেকেন্ডে)
// ==========================================
let liveWatchId = null;
let _gpsErrorCount = 0;
let _gpsHighAccuracy = true;
let _gpsDenied = false;
let _lastBroadcast = { t: 0, lat: null, lon: null };
let _broadcastBusy = false;
const GPS_BROADCAST_MS = 5000;        // সর্বনিম্ন ৫ সেকেন্ড পর পর server এ পাঠানো
const GPS_FORCE_BROADCAST_MS = 15000; // না নড়লেও ১৫ সেকেন্ডে একবার
const GPS_MIN_MOVE_M = 15;            // ১৫ মিটারের বেশি নড়লে সাথে সাথে পাঠানো

// ✅ REWRITE: আগে প্রতি ৩ সেকেন্ডে নতুন getCurrentPosition (high accuracy, maximumAge 0) চালু হতো —
// আগেরটা শেষ হওয়ার আগেই নতুনটা শুরু, ফলে বারবার "Timeout expired" আসত আর প্রতিবার error toast
// দেখাত। এখন একটাই watchPosition চলে, error হলে চুপচাপ low-accuracy এ নেমে যায়, আর একই
// error toast কয়েক মিনিটে একবারের বেশি দেখায় না।
function startLiveLocationTracking(force) {
    if (!navigator.geolocation) return;
    if (force) _gpsDenied = false;
    if (_gpsDenied) return;
    if (!isOnDuty) return; // Off-Duty রাইডারের লোকেশন পাঠানো হবে না
    if (liveWatchId !== null) return; // ইতিমধ্যে চলছে
    // ক্যাশে থাকা লোকেশন দিয়ে দ্রুত প্রথম fix (error হলে চুপচাপ)
    navigator.geolocation.getCurrentPosition(onGpsFix, () => {}, { enableHighAccuracy: false, maximumAge: 120000, timeout: 5000 });
    beginGpsWatch(true);
}

function beginGpsWatch(highAccuracy) {
    if (liveWatchId !== null) { try { navigator.geolocation.clearWatch(liveWatchId); } catch (e) {} liveWatchId = null; }
    _gpsHighAccuracy = highAccuracy;
    _gpsErrorCount = 0;
    liveWatchId = navigator.geolocation.watchPosition(onGpsFix, onGpsError, {
        enableHighAccuracy: highAccuracy,
        maximumAge: 10000,
        timeout: highAccuracy ? 25000 : 40000
    });
}

function onGpsFix(position) {
    _gpsErrorCount = 0;
    const lat = position.coords.latitude, lon = position.coords.longitude;
    cachedRiderPosition = { lat, lon };
    // লোকাল UI আপডেট — network লাগে না, তাই প্রতি fix এই
    if (map) updateLiveRiderMarkerOnMap(lat, lon);
    if (activeOrderData) updateLiveDistanceAndETA();

    // server এ পাঠানো throttled
    const now = Date.now();
    const elapsed = now - _lastBroadcast.t;
    if (elapsed < GPS_BROADCAST_MS) return;
    const movedM = _lastBroadcast.lat === null ? Infinity : distanceKmExact(_lastBroadcast.lat, _lastBroadcast.lon, lat, lon) * 1000;
    if (movedM < GPS_MIN_MOVE_M && elapsed < GPS_FORCE_BROADCAST_MS) return;
    broadcastRiderLocation(lat, lon);
}

function onGpsError(err) {
    console.warn('GPS:', err && err.code, err && err.message);
    if (err && err.code === 1) { // permission denied
        _gpsDenied = true;
        stopLiveLocationTracking();
        toastOnce('gps-denied', 'Location permission is off. Please allow location access in your browser settings to receive orders.', 'error', 120000);
        return;
    }
    _gpsErrorCount++;
    // high accuracy বারবার timeout করলে চুপচাপ network/low-accuracy লোকেশনে নেমে যাওয়া
    if (_gpsHighAccuracy && _gpsErrorCount >= 2) { beginGpsWatch(false); return; }
    if (_gpsErrorCount >= 5) {
        toastOnce('gps-weak', 'GPS signal is weak — using your last known location. Move to an open area.', 'info', 180000);
    }
}

function stopLiveLocationTracking() {
    if (liveWatchId !== null) {
        try { navigator.geolocation.clearWatch(liveWatchId); } catch (e) {}
        liveWatchId = null;
    }
    if (liveLocationInterval) {
        clearInterval(liveLocationInterval);
        liveLocationInterval = null;
    }
}

// অ্যাপে ফিরে এলে tracking থেমে থাকলে আবার চালু
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isOnDuty && liveWatchId === null && !_gpsDenied) {
        const kycOpen = localStorage.getItem('rider_kyc_wizard_open') === '1';
        if (!kycOpen) startLiveLocationTracking();
    }
});

async function broadcastRiderLocation(lat, lon) {
    if (!supabaseClient || _broadcastBusy) return;
    _broadcastBusy = true;
    _lastBroadcast = { t: Date.now(), lat, lon };
    cachedRiderPosition = { lat, lon };
    try {
        const nowIso = new Date().toISOString();
        const jobs = [];

        // riders টেবিলে লাইভ লোকেশন (অ্যাডমিন/ট্র্যাকিং প্যানেলের জন্য)
        const authId = await getRiderAuthId();
        if (authId) {
            jobs.push(
                safeUpdateRiderByAuthUser(authId, { current_lat: lat, current_lon: lon, location_updated_at: nowIso }, { returning: false })
                    .catch(err => {
                        console.error('RIDER LOCATION UPDATE ERROR:', err);
                        toastOnce('bcast-rider', 'Location sync problem — will keep retrying.', 'error', 90000);
                    })
            );
        }

        // সক্রিয় অর্ডার থাকলে orders টেবিলেও (কাস্টমার/ফার্মেসি লাইভ দেখতে পারবে)
        const sessionOrder = localStorage.getItem("active_delivery_order");
        if (sessionOrder) {
            let order = null;
            try { order = JSON.parse(sessionOrder); } catch (e) {}
            if (order && order.order_id) {
                jobs.push(
                    supabaseClient.from('orders')
                        .update({ rider_lat: lat, rider_lon: lon, location_updated_at: nowIso })
                        .eq('order_id', order.order_id)
                        .then(({ error }) => { if (error) console.error("ORDER LOCATION UPDATE ERROR:", error); })
                );
            }
        }
        await Promise.all(jobs);
    } catch (err) {
        console.error('Location broadcast error:', err);
        toastOnce('bcast', 'Location broadcast problem — will keep retrying.', 'error', 90000);
    } finally {
        _broadcastBusy = false;
    }
}

function updateLiveRiderMarkerOnMap(lat, lon) {
    if (!map) return;
    try {
        if (liveRiderMarker) {
            liveRiderMarker.setLatLng([lat, lon]);
        } else {
            const riderIcon = L.icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/2972/2972185.png', iconSize: [40, 40] });
            liveRiderMarker = L.marker([lat, lon], { icon: riderIcon }).addTo(map).bindPopup("<b>You (Live)</b>");
        }
    } catch (e) {
        showToast("Map marker update error: " + (e.message || e), "error");
    }
}

// ==========================================
// 5E. NEW: ব্যাকগ্রাউন্ড ব্রাউজার নোটিফিকেশন (নতুন অর্ডার ব্রডকাস্ট হলে)
// ==========================================
function requestBrowserNotificationPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
        Notification.requestPermission().then(perm => {

        });
    }
}

function fireNewOrderNotification(order) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    try {
        const noti = new Notification("🚴 New Delivery Request!", {
            body: `Parcel #${order.order_id} • ₹${computeDeliveryCharge(order)} • Tap to view`,
            icon: "1779304435608.png",
            tag: `order-${order.order_id}`
        });
        noti.onclick = () => {
            window.focus();
            window.focus(); switchRiderTab("home");
        };
    } catch (e) {
        showToast("Browser notification error: " + (e.message || e), "error");
    }
}


// ✅ REWRITE (Parcel Verification popup fix):
// Root cause of the auto-appearing OTP popup was NOT a stray JS call — grep
// confirms openOtpModal() was only ever wired to two onclick handlers (the
// footer "Verify OTP" button, and — as a bug — the timer badge, now removed
// above). The real cause was CSS: #otpModal lives OUTSIDE the #tab-* wrappers
// (it's a shared overlay, same as the KYC/payout/complaint pages), but the
// SPA-merge's `.hidden` utility rules were only ever scoped as `#tab-home
// .hidden`, `#tab-delivery .hidden`, etc. Since #otpModal is never a
// descendant of any #tab-*, `hidden` on it matched no CSS rule, while its own
// base `.otp-modal-overlay { display:flex; position:fixed; inset:0 }` rule
// still applied unconditionally — so it rendered full-screen immediately on
// load. Fixed with a dedicated global `.otp-modal-overlay.hidden` rule in
// rider.css (see there) that no longer depends on any #tab-* scope.
function openOtpModal() {
    // ✅ (#3) never open without a real active order
    if (!activeOrderData || !activeOrderData.order_id) {
        showToast('No active delivery order found.', 'error');
        return;
    }
    const otpModal = document.getElementById("otpModal");
    const otpFormContent = document.getElementById("otpFormContent");
    const otpInput = document.getElementById("otpInput");
    const verifyBtn = document.querySelector('.btn-modal-submit');
    const successScreen = document.getElementById("otpSuccessScreen");
    if (!otpModal || !otpFormContent) return;

    // ✅ (#11) every open is a clean reset — no leftover success state, no stale input/button
    if (successScreen) successScreen.classList.add('hidden');
    otpFormContent.style.display = "block";
    if (otpInput) otpInput.value = "";
    if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.innerText = "Verify & Complete"; }

    otpModal.classList.remove("hidden");
    if (otpInput) setTimeout(() => otpInput.focus(), 50);
}

function closeOtpModal() {
    const otpModal = document.getElementById("otpModal");
    const successScreen = document.getElementById("otpSuccessScreen");
    if (otpModal) otpModal.classList.add("hidden");
    if (successScreen) successScreen.classList.add('hidden'); // ✅ (#11) never leaves success-mode active behind a closed modal
}

// ✅ NEW: full-screen green success UI (replaces the old small white
// "Verification Successful!" card). Only ever called after OTP verification
// + order update + wallet credit have ALL already succeeded (see call sites
// inside verifyOtpCode() below) — never on its own.
function showOtpSuccessScreen(amount) {
    const otpModal = document.getElementById("otpModal");
    const successScreen = document.getElementById("otpSuccessScreen");
    const amountEl = document.getElementById("otpSuccessAmount");
    if (otpModal) otpModal.classList.add("hidden"); // hide the small OTP card first
    if (amountEl) amountEl.innerText = `+₹${Number(amount || 0).toFixed(2)}`;
    if (successScreen) successScreen.classList.remove('hidden');

    setTimeout(() => {
        if (successScreen) successScreen.classList.add('hidden');
        switchRiderTab("earning");
    }, 2000);
}

// ✅ REWRITE (#5, #6, #9, #13): Robust OTP → delivered → wallet credit
// sequence with real error checking at every DB step and duplicate
// protection.
//
// IMPORTANT schema note discovered while wiring this up: riders_wallet
// has a UNIQUE constraint on rider_id alone (riders_wallet_rider_id_key),
// so each rider can only ever have ONE row in riders_wallet — it is a
// running wallet balance (balance / total_earned / total_withdrawn),
// not a per-order ledger. So this step upserts that single row (adds
// this delivery's amount on top of the existing balance/total_earned)
// instead of inserting a new row per order, which the unique constraint
// would reject on the 2nd delivery. Per-order History/Today/Week totals
// are computed separately from the `orders` table (see loadEarningsFromDB)
// since that table has no such restriction and already holds rider_id,
// delivery_charge, status and updated_at per order.
async function verifyOtpCode() {
    if (!supabaseClient) return;
    if (!activeOrderData) { showToast('No active delivery order found.', 'error'); return; }
    const otpInput = document.getElementById("otpInput");
    const otpFormContent = document.getElementById("otpFormContent");
    if (!otpInput || !otpFormContent) return;
    const enteredOtp = otpInput.value;
    const correctOtp = activeOrderData.delivery_secure_code || activeOrderData.customer_otp;
    if (!correctOtp) { showToast('No delivery code found for this order. Contact support.', 'error'); return; }

    if (enteredOtp !== correctOtp) {
        showToast("Incorrect OTP Code! Please provide a valid transaction security code.", "error");
        otpInput.value = "";
        otpInput.focus();
        return; // ✅ (#5) stays on the OTP form — success screen never touched
    }

    clearInterval(countdownTimer);
    const verifyBtn = document.querySelector('.btn-modal-submit');
    if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.innerText = "Verifying..."; }

    try {
        // STEP 2: resolve the real BIGINT riders.id for the logged-in rider
        const { data: { session }, error: sessErr } = await supabaseClient.auth.getSession();
        if (sessErr) throw sessErr;
        if (!session?.user?.id) throw new Error("You're not logged in. Please log in again.");

        const { data: riderRow, error: riderErr } = await supabaseClient
            .from('riders').select('id').eq('auth_user_id', session.user.id).maybeSingle();
        if (riderErr) throw riderErr;
        if (!riderRow || !riderRow.id) throw new Error("Rider profile not found. Contact support.");
        const riderId = riderRow.id;

        // STEP 3: check if this order was already delivered (duplicate protection)
        const { data: orderRow, error: orderFetchErr } = await supabaseClient
            .from('orders').select('order_id, status, delivery_charge').eq('order_id', activeOrderData.order_id).maybeSingle();
        if (orderFetchErr) throw orderFetchErr;
        if (!orderRow) throw new Error("Order not found. It may have been removed.");

        if (orderRow.status === 'delivered') {
            // Already delivered previously — do NOT insert duplicate earning/history,
            // and do NOT show the green success screen (no new credit happened this time)
            localStorage.removeItem("active_delivery_order");
            showToast("This order was already delivered — no duplicate earning added.", "info");
            closeOtpModal();
            switchRiderTab("earning");
            return;
        }

        // STEP 4: earning এখন দূরত্ব-নিয়ম (≤10 km ₹25, তার বেশি ₹35) থেকে বের হয় —
        // একই amount order এ লেখা হয় (history/total এর সোর্স) এবং wallet এ যোগ হয়
        const amount = computeDeliveryCharge({ ...activeOrderData, ...orderRow, delivery_charge: activeOrderData.delivery_charge });

        // STEP 4b: mark order as delivered
        const { error: updateErr } = await supabaseClient
            .from('orders')
            .update({ status: 'delivered', payment_status: 'Paid', delivery_charge: amount, updated_at: new Date().toISOString() })
            .eq('order_id', activeOrderData.order_id);
        if (updateErr) throw updateErr;

        // STEP 5 + 6: credit riders_wallet — upsert the single per-rider row,
        // guarding against double-crediting the exact same order (e.g. double click / retry)

        const { data: existingWallet, error: walletFetchErr } = await supabaseClient
            .from('riders_wallet').select('id, order_id, balance, total_earned').eq('rider_id', riderId).maybeSingle();
        if (walletFetchErr) throw walletFetchErr;

        if (existingWallet && String(existingWallet.order_id) === String(activeOrderData.order_id)) {
            // Same order already credited to this rider's wallet — skip, not an error
        } else if (existingWallet) {
            const newBalance = (Number(existingWallet.balance) || 0) + amount;
            const newTotalEarned = (Number(existingWallet.total_earned) || 0) + amount;
            const { error: walletUpdateErr } = await supabaseClient
                .from('riders_wallet')
                .update({
                    order_id: activeOrderData.order_id,
                    amount_earned: amount,
                    balance: newBalance,
                    total_earned: newTotalEarned,
                    status: 'success',
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingWallet.id);
            if (walletUpdateErr) throw walletUpdateErr;
        } else {
            const { error: walletInsertErr } = await supabaseClient
                .from('riders_wallet')
                .insert([{
                    rider_id: riderId,
                    order_id: activeOrderData.order_id,
                    amount_earned: amount,
                    balance: amount,
                    total_earned: amount,
                    total_withdrawn: 0,
                    status: 'success',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }]);
            if (walletInsertErr) throw walletInsertErr;
        }

        // ✅ (#7,#8,#9) Everything succeeded (OTP correct + order delivered + wallet
        // credited) — ONLY now show the full-screen green success UI, with the real
        // delivery_charge amount, then auto-route to the Earning tab.
        localStorage.removeItem("active_delivery_order");
        showOtpSuccessScreen(amount);

    } catch (err) {
        // ✅ Never silently succeed on failure — revert UI so rider can retry
        if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.innerText = "Verify & Complete"; }
        otpFormContent.style.display = "block";
        showToast("Delivery completion failed: " + (err.message || err), "error");
    }
}

// ==========================================
// 6. Metrics and Earnings Layout Controls
// ==========================================
// ✅ REWRITE (#7, #8, #9): per-order earnings history now comes from the
// `orders` table (status='delivered', rider_id=current rider), NOT from
// riders_wallet.
//
// Why: the live schema shows riders_wallet_rider_id_key = UNIQUE(rider_id)
// — riders_wallet can only ever hold ONE row per rider (a running wallet
// balance), so it structurally cannot hold a dated per-order history.
// `orders` already carries rider_id, delivery_charge and updated_at per
// completed delivery with no such restriction, so period totals
// (Today/Yesterday/This Week/... ) and the completed-history list are
// computed from there — each delivered order = one history entry, exactly
// as required. riders_wallet is still used (in verifyOtpCode / payout) as
// the running wallet balance for payout eligibility.
async function loadEarningsFromDB() {
    if (!supabaseClient) return;
    try {
        const riderId = await ensureRiderBigIntId();
        if (!riderId) { window._riderWalletEntries = []; return; }
        const { data: deliveredOrders, error } = await supabaseClient.from('orders')
            .select('order_id, delivery_charge, updated_at, pharmacy_lat, pharmacy_lon, user_lat, user_lon')
            .eq('rider_id', riderId)
            .eq('status', 'delivered')
            .order('updated_at', { ascending: false });
        if (error) throw error;
        window._riderWalletEntries = (deliveredOrders || []).map(o => {
            // delivery_charge ফাঁকা/০ থাকলে দূরত্ব-নিয়ম থেকে হিসাব — যাতে কোনো delivery ₹0 গণনা না হয়
            const stored = Number(o.delivery_charge);
            return {
                order_id: o.order_id,
                amount_earned: (stored > 0) ? stored : computeDeliveryCharge(o),
                created_at: o.updated_at
            };
        });
        window._earnSeenOrders = new Set(window._riderWalletEntries.map(e => String(e.order_id)));
    } catch (e) {
        window._riderWalletEntries = [];
        showToast("Earnings load error: " + (e.message || e), "error");
    }
}

// ✅ NEW: প্রতিটা filter period এর জন্য শুরু/শেষ তারিখের রেঞ্জ বের করা
function getPeriodRange(period) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 86400000);
    const day = now.getDay(); // 0=Sunday
    switch (period) {
        case 'today':
            return [startOfToday, endOfToday];
        case 'yesterday': {
            const s = new Date(startOfToday.getTime() - 86400000);
            return [s, startOfToday];
        }
        case 'thisWeek': {
            const s = new Date(startOfToday.getTime() - day * 86400000);
            return [s, endOfToday];
        }
        case 'lastWeek': {
            const sThis = new Date(startOfToday.getTime() - day * 86400000);
            const s = new Date(sThis.getTime() - 7 * 86400000);
            return [s, sThis];
        }
        case 'thisMonth': {
            const s = new Date(now.getFullYear(), now.getMonth(), 1);
            return [s, endOfToday];
        }
        case 'lastMonth': {
            const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const e = new Date(now.getFullYear(), now.getMonth(), 1);
            return [s, e];
        }
        case 'allTime':
        default:
            return [new Date(0), new Date(now.getTime() + 86400000)];
    }
}

const PERIOD_LABELS = {
    today: 'Today', yesterday: 'Yesterday', thisWeek: 'This Week', lastWeek: 'Last Week',
    thisMonth: 'This Month', lastMonth: 'Last Month', allTime: 'All Time'
};

function getEntriesForPeriod(period) {
    const [start, end] = getPeriodRange(period);
    return (window._riderWalletEntries || []).filter(e => {
        const d = new Date(e.created_at);
        return d >= start && d < end;
    });
}

function sumEarningsForPeriod(period) {
    return getEntriesForPeriod(period).reduce((sum, e) => sum + (parseFloat(e.amount_earned) || 0), 0);
}

// ✅ NEW: Total Earnings card এর period switch করলে headline amount আপডেট হবে
function selectEarningsPeriod(period) {
    const filterRow = document.getElementById("earningsPeriodFilter");
    if (filterRow) {
        filterRow.querySelectorAll('.period-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.period === period);
        });
    }
    const total = sumEarningsForPeriod(period);
    const totalEl = document.getElementById("todayTotalEarnings");
    if (totalEl) totalEl.innerText = `₹${total.toLocaleString('en-IN')}`;
    const labelEl = document.getElementById("earningsPeriodLabel");
    if (labelEl) labelEl.innerText = `Total Earnings — ${PERIOD_LABELS[period] || period}`;
}

// ✅ FIX: আগে এখানে localStorage("today_earnings") থেকে টোটাল দেখানো হতো, যেটা কখনো
// আসলে সেট হতো না — তাই সবসময় ₹0 দেখাতো। এখন riders_wallet টেবিল থেকে আসল completed
// delivery earnings period অনুযায়ী (Today/Yesterday/This Week ইত্যাদি) sum করে দেখানো হয়।
async function initEarningsPage() {
    await loadEarningsFromDB();
    await loadActiveHoursFromDB();

    selectEarningsPeriod('today');       // মূল headline card — ডিফল্ট "Today"
    selectHistoryPeriod('today');        // Recent Completed History লিস্ট
    selectProfitPeriod('today');         // Profit Analysis গ্রাফ
    refreshPayoutButton();               // আজকের payout যোগ্য amount বাটনে দেখানো

    // ✅ FIX (#7, #12): earnings/history are sourced from `orders` now (see
    // loadEarningsFromDB note on the riders_wallet unique(rider_id)
    // constraint), so the realtime listener follows `orders` UPDATE events
    // for this rider instead of riders_wallet — a delivery completing
    // (status → delivered) on this or another device updates Total
    // Earnings, History and the Profit graph without a manual refresh.
    const _earnRiderId = await ensureRiderBigIntId();
    if (supabaseClient && _earnRiderId) {
        if (window._walletRealtimeChannel) supabaseClient.removeChannel(window._walletRealtimeChannel);
        window._walletRealtimeChannel = supabaseClient
            .channel('rider-earnings-realtime')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `rider_id=eq.${_earnRiderId}` }, async (payload) => {
                // ✅ FIX: লাইভ GPS প্রতি ৫ সেকেন্ডে এই order row আপডেট করে — আগে প্রতিবার earnings
                // রিফ্রেশ + "Earnings updated" toast আসত। এখন শুধু নতুন delivered order এ একবার।
                if (!payload.new || payload.new.status !== 'delivered') return;
                const seen = window._earnSeenOrders || (window._earnSeenOrders = new Set());
                const oid = String(payload.new.order_id);
                if (seen.has(oid)) return;
                seen.add(oid);
                await loadEarningsFromDB();
                const activeEarnChip = document.querySelector('#earningsPeriodFilter .period-chip.active');
                const activeHistChip = document.querySelector('#historyPeriodFilter .period-chip.active');
                const activeProfitChip = document.querySelector('#profitPeriodFilter .period-chip.active');
                selectEarningsPeriod(activeEarnChip ? activeEarnChip.dataset.period : 'today');
                selectHistoryPeriod(activeHistChip ? activeHistChip.dataset.period : 'today');
                selectProfitPeriod(activeProfitChip ? activeProfitChip.dataset.period : 'today');
                refreshPayoutButton();
                showToast("💰 Earnings updated!", "success");
            })
            .subscribe();
    }
}

// ✅ NEW: Recent Completed History লিস্ট, DB থেকে period অনুযায়ী ফিল্টার করে রেন্ডার করা হয়
function renderEarningsHistory(period) {
    const historyCount = document.querySelector(".history-count");
    const earningList = document.getElementById("earning-history-list");
    const entries = getEntriesForPeriod(period);

    if (!earningList) return;

    if (entries.length === 0) {
        if (historyCount) historyCount.innerText = "0 Orders";
        earningList.innerHTML = `<p style="text-align:center; color:#64748b; padding:20px; width:100%;">No completed deliveries in this period.</p>`;
        return;
    }

    if (historyCount) historyCount.innerText = `${entries.length} Orders`;
    earningList.innerHTML = "";
    entries.forEach(item => {
        const dt = new Date(item.created_at);
        const timeLabel = isNaN(dt.getTime()) ? '' : dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        earningList.insertAdjacentHTML('beforeend', `
            <div class="history-item">
                <div class="item-left-content">
                    <div class="delivery-success-icon"><i class="fa-solid fa-circle-check" style="color:#10b981;"></i></div>
                    <div class="item-details">
                        <h4>Order #${item.order_id || 'N/A'}</h4>
                        <p><i class="fa-regular fa-clock"></i> Completed at ${timeLabel}</p>
                    </div>
                </div>
                <div class="payout-amount-badge"><span class="payout-indicator">+₹${Number(item.amount_earned || 0).toLocaleString('en-IN')}</span></div>
            </div>`);
    });
}

// ✅ NEW: History সেকশনের filter chip ক্লিক হ্যান্ডলার
function selectHistoryPeriod(period) {
    const filterRow = document.getElementById("historyPeriodFilter");
    if (filterRow) {
        filterRow.querySelectorAll('.period-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.period === period);
        });
    }
    renderEarningsHistory(period);
}

// ✅ NEW: Profit Analysis গ্রাফ — period অনুযায়ী দিনভিত্তিক bucket এ ভাগ করে sparkline আঁকা হয়
function selectProfitPeriod(period) {
    const filterRow = document.getElementById("profitPeriodFilter");
    if (filterRow) {
        filterRow.querySelectorAll('.period-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.period === period);
        });
    }
    renderProfitGraph(period);
}

// ✅ REWRITE (premium): trade-ideas.com স্টাইল রঙিন সেগমেন্ট বজায় রেখে এবার প্রতিটা সেগমেন্ট
// smooth curve (Catmull-Rom → Bezier) দিয়ে আঁকা হয় জ্যাগেড সরলরেখার বদলে, ছোট period
// (Today/Yesterday) এর জন্য বেশি bucket (ঘণ্টাভিত্তিক রেজোলিউশন) ব্যবহার করা হয় যাতে গ্রাফ
// একটা একক ডায়াগোনাল লাইনের মতো ফাঁকা না দেখায়, এবং নিচে একটা axis label সারি যোগ হয়েছে।
function renderProfitGraph(period) {
    const entries = getEntriesForPeriod(period);
    const [start, end] = getPeriodRange(period);
    const totalMs = Math.max(1, end.getTime() - start.getTime());

    const isSingleDay = (period === 'today' || period === 'yesterday');
    // ✅ FIX: আগে 'today'/'yesterday' এর জন্যও মাত্র ২টা bucket (২-পয়েন্টের সরলরেখা) হতো,
    // যেটা গ্রাফ হিসেবে প্রায় অকেজো দেখাতো। এখন একদিনের রেঞ্জকে ৮টা (৩-ঘণ্টার) bucket এ
    // ভাগ করা হয়, বাকি period গুলো আগের মতোই দিনভিত্তিক (সর্বোচ্চ ৭টা bucket)।
    const bucketCount = isSingleDay ? 8 : Math.min(7, Math.max(2, Math.round(totalMs / 86400000) || 2));
    const bucketMs = totalMs / bucketCount;
    const buckets = new Array(bucketCount).fill(0);

    entries.forEach(e => {
        const t = new Date(e.created_at).getTime() - start.getTime();
        let idx = Math.floor(t / bucketMs);
        if (idx < 0) idx = 0;
        if (idx >= bucketCount) idx = bucketCount - 1;
        buckets[idx] += (parseFloat(e.amount_earned) || 0);
    });

    const maxVal = Math.max(...buckets, 1);
    const stepX = 100 / (bucketCount - 1 || 1);
    const pts = buckets.map((v, i) => ({
        x: i * stepX,
        y: 28 - (v / maxVal) * 26 // ৩০ ভিউবক্সের মধ্যে ২৮..২ রেঞ্জে
    }));

    const GREEN = '#16c784';
    const RED = '#ea3943';

    // --- Catmull-Rom → Bezier control points, প্রতিটা সেগমেন্টের জন্য একটা মসৃণ কার্ভ ---
    function controlPoints(p0, p1, p2, p3) {
        const cp1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
        const cp2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
        return [cp1, cp2];
    }

    // --- Fill area: পুরো স্মুথ কার্ভ অনুসরণ করে, নিচে ক্লোজ করা ---
    let fillD = `M0,30 L${pts[0].x},${pts[0].y.toFixed(1)}`;
    let segmentsSvg = '';
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] || pts[i + 1];
        const [cp1, cp2] = controlPoints(p0, p1, p2, p3);
        const curveCmd = ` C${cp1.x.toFixed(1)},${cp1.y.toFixed(1)} ${cp2.x.toFixed(1)},${cp2.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
        fillD += curveCmd;

        const rising = p2.y <= p1.y; // SVG y-axis উল্টো, তাই y কমা মানে value বাড়া
        const color = rising ? GREEN : RED;
        segmentsSvg += `<path d="M${p1.x.toFixed(1)},${p1.y.toFixed(1)}${curveCmd}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
    }
    fillD += ` L100,30 Z`;

    // --- প্রতিটা পয়েন্টে ছোট্ট ডট (শেষেরটা বড়, live/latest বোঝাতে) ---
    let dotsSvg = '';
    pts.forEach((p, i) => {
        const isLast = i === pts.length - 1;
        const dotColor = i === 0 ? GREEN : (pts[i].y <= pts[i - 1].y ? GREEN : RED);
        dotsSvg += `<circle cx="${p.x}" cy="${p.y.toFixed(1)}" r="${isLast ? 2.4 : 1.3}" fill="${dotColor}" ${isLast ? 'stroke="#fff" stroke-width="0.8"' : ''}/>`;
    });

    const svgEl = document.querySelector(".chart-svg");
    if (svgEl) {
        svgEl.innerHTML = `
            <defs>
                <linearGradient id="graphGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${GREEN}" stop-opacity="0.22"/>
                    <stop offset="100%" stop-color="${GREEN}" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <path d="${fillD}" fill="url(#graphGradient)"/>
            ${segmentsSvg}
            ${dotsSvg}
        `;
    }

    // --- নিচে axis labels (ঘণ্টা/দিন অনুযায়ী) ---
    const canvasEl = document.querySelector(".sparkline-canvas");
    if (canvasEl) {
        let labelsEl = canvasEl.parentElement.querySelector(".graph-axis-labels");
        if (!labelsEl) {
            labelsEl = document.createElement("div");
            labelsEl.className = "graph-axis-labels";
            canvasEl.insertAdjacentElement('afterend', labelsEl);
        }
        const labelCount = Math.min(bucketCount, isSingleDay ? 5 : 7);
        const labelIdxs = Array.from({ length: labelCount }, (_, i) => Math.round(i * (bucketCount - 1) / (labelCount - 1 || 1)));
        labelsEl.innerHTML = labelIdxs.map(i => {
            const t = new Date(start.getTime() + i * bucketMs);
            const text = isSingleDay
                ? t.toLocaleTimeString('en-IN', { hour: 'numeric', hour12: true })
                : t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
            return `<span>${text}</span>`;
        }).join('');
    }

    const total = buckets.reduce((s, v) => s + v, 0);
    const firstHalf = buckets.slice(0, Math.ceil(bucketCount / 2)).reduce((s, v) => s + v, 0);
    const secondHalf = total - firstHalf;
    const isUp = secondHalf >= firstHalf;

    const trendGraph = document.getElementById("trendGraphContainer");
    const alertStatus = document.querySelector(".trend-alert-status");
    if (trendGraph) trendGraph.className = isUp ? "graph-box trend-up" : "graph-box trend-down";
    if (alertStatus) {
        if (total <= 0) {
            alertStatus.innerHTML = `<i class="fa-solid fa-minus"></i> No data yet`;
        } else {
            alertStatus.innerHTML = `<i class="fa-solid fa-arrow-trend-${isUp ? 'up' : 'down'}"></i> ₹${total.toLocaleString('en-IN')} total`;
        }
    }
}

// ✅ REWRITE (#10, #11, #13): payout amount is no longer trusted from the
// UI text — it's read straight from riders_wallet.balance (the real,
// accumulated, unpaid wallet balance for this rider — see the
// riders_wallet unique(rider_id) note in loadEarningsFromDB). Duplicate
// protection checks admin_payout_requests for any existing pending
// request before allowing a new one. DB earnings/history are never wiped
// via localStorage — that reset is removed entirely.
const PAYOUT_REJECTED = ['rejected', 'declined', 'failed', 'cancelled', 'canceled'];
const PAYOUT_OPEN = ['pending', 'approved', 'in_progress', 'processing', 'accepted'];

// আজকের earning থেকে কতটা এখনও payout request করা যায় — আজ যত টাকা request হয়ে গেছে
// (rejected ছাড়া) সেটা বাদ দিয়ে। এতে একই earning দুইবার request করা যায় না।
async function getTodayPayoutState(riderBigIntId) {
    const { data: reqs, error } = await supabaseClient
        .from('admin_payout_requests')
        .select('id, total_payout_amount, request_status, requested_at')
        .eq('rider_id', riderBigIntId);
    if (error) throw error;
    const startToday = getPeriodRange('today')[0];
    let alreadyRequestedToday = 0;
    let hasOpen = false;
    (reqs || []).forEach(r => {
        const st = (r.request_status || '').toLowerCase();
        if (!PAYOUT_REJECTED.includes(st) && r.requested_at && new Date(r.requested_at) >= startToday) {
            alreadyRequestedToday += Number(r.total_payout_amount) || 0;
        }
        if (PAYOUT_OPEN.includes(st)) hasOpen = true;
    });
    const earnedToday = sumEarningsForPeriod('today');
    const available = Math.max(0, Math.round((earnedToday - alreadyRequestedToday) * 100) / 100);
    return { earnedToday, alreadyRequestedToday, available, hasOpen };
}

async function refreshPayoutButton() {
    const btn = document.getElementById("payoutRequestBtn");
    if (!btn || !supabaseClient) return;
    try {
        const riderId = await ensureRiderBigIntId();
        if (!riderId) return;
        const st = await getTodayPayoutState(riderId);
        window._payoutState = st;
        const amt = st.available.toLocaleString('en-IN');
        if (st.available <= 0) {
            btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> No payout available today';
            btn.disabled = true;
        } else if (st.hasOpen) {
            btn.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> Payout in progress (₹${amt} more available)`;
            btn.disabled = true;
        } else {
            btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Request ₹${amt} Payout`;
            btn.disabled = false;
        }
        btn.style.opacity = btn.disabled ? '0.6' : '1';
    } catch (e) {
        console.error('PAYOUT STATE ERROR:', e);
    }
}

// ✅ REWRITE: payout amount এখন DB থেকে ঠিকঠাক হিসাব হয় — আজকের delivered order এর earning থেকে
// আজ আগে request হয়ে যাওয়া amount বাদ দিয়ে। Duplicate/double payout আটকানো আছে, আর
// request এর আগে earnings fresh করে নেওয়া হয় যাতে সদ্য delivery হওয়া order বাদ না পড়ে।
async function handlePayoutRequest() {
    if (!supabaseClient) return;
    const payoutRequestBtn = document.getElementById("payoutRequestBtn");
    if (!payoutRequestBtn || payoutRequestBtn.disabled) return;

    payoutRequestBtn.disabled = true;
    payoutRequestBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    try {
        const riderBigIntId = await ensureRiderBigIntId();
        if (!riderBigIntId) throw new Error("Rider profile not found. Please log in again.");

        await loadEarningsFromDB();
        const st = await getTodayPayoutState(riderBigIntId);

        if (st.earnedToday <= 0) {
            showToast("No earnings today to withdraw. Complete a delivery first.", "error");
            return;
        }
        if (st.hasOpen) {
            showToast("You already have a payout request being processed. Please wait for it to complete.", "error");
            return;
        }
        if (st.available <= 0) {
            showToast("Today's earnings have already been requested for payout.", "info");
            return;
        }

        const { error } = await supabaseClient.from('admin_payout_requests').insert([{
            rider_id: riderBigIntId, total_payout_amount: st.available, amount: st.available,
            active_duty_hours: Math.floor(riderActiveMinutes / 60),
            request_status: 'pending', status: 'pending', requested_at: new Date().toISOString()
        }]);
        if (error) throw error;

        showToast(`Payout of ₹${st.available} requested! Admin will review shortly.`, "success");
        await initEarningsPage();
    } catch (err) {
        showToast("Payout request failed: " + (err.message || err), "error");
    } finally {
        await refreshPayoutButton();
    }
}

// ✅ NEW: "Check Your Payment" — maps whatever request_status string the admin dashboard
// writes into one of exactly 3 rider-facing states: Pending -> In Progress -> Completed.
function normalizePayoutStatus(raw) {
    const s = (raw || '').toLowerCase();
    if (s === 'completed' || s === 'paid' || s === 'done' || s === 'success') {
        return { key: 'completed', label: 'Completed' };
    }
    if (s === 'approved' || s === 'in_progress' || s === 'processing' || s === 'accepted') {
        return { key: 'in_progress', label: 'In Progress' };
    }
    if (s === 'rejected' || s === 'declined' || s === 'failed') {
        return { key: 'pending', label: 'Rejected' };
    }
    return { key: 'pending', label: 'Pending' };
}

async function openPayoutHistory() {
    openSubPage('payoutHistoryPage');
    const body = document.getElementById('payoutHistoryBody');
    if (!body) return;
    body.innerHTML = `<p style="text-align:center;color:#999;padding:20px;">Loading payout requests...</p>`;
    if (!supabaseClient) return;

    try {
        const { data: { session }, error: sessErr } = await supabaseClient.auth.getSession();
        if (sessErr) throw sessErr;
        if (!session?.user?.id) throw new Error("You're not logged in. Please log in again.");

        const { data: riderRow, error: riderErr } = await supabaseClient
            .from('riders').select('id').eq('auth_user_id', session.user.id).maybeSingle();
        if (riderErr) throw riderErr;
        if (!riderRow || !riderRow.id) throw new Error("Rider profile not found.");

        const { data: requests, error: reqErr } = await supabaseClient
            .from('admin_payout_requests')
            .select('id, total_payout_amount, request_status, requested_at')
            .eq('rider_id', riderRow.id)
            .order('requested_at', { ascending: false });
        if (reqErr) throw reqErr;

        if (!requests || requests.length === 0) {
            body.innerHTML = `<p style="text-align:center;color:#999;padding:20px;">No payout requests yet. Once you request a payout, its status will show up here.</p>`;
            return;
        }

        body.innerHTML = requests.map(r => {
            const st = normalizePayoutStatus(r.request_status);
            const dt = r.requested_at ? new Date(r.requested_at) : null;
            const dateLabel = dt && !isNaN(dt.getTime()) ? dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            return `
                <div class="payout-history-item">
                    <div class="payout-history-left">
                        <h4>₹${Number(r.total_payout_amount || 0).toLocaleString('en-IN')}</h4>
                        <p>${escapeHtml(dateLabel)}</p>
                    </div>
                    <span class="payout-status-pill status-${st.key}">${st.label}</span>
                </div>`;
        }).join('');
    } catch (err) {
        body.innerHTML = `<p style="text-align:center;color:#ef4444;padding:20px;">Could not load payout history: ${escapeHtml(err.message || String(err))}</p>`;
    }
}

function updateActiveHoursUI() {
    const hours = Math.floor(riderActiveMinutes / 60);
    const trackerText = document.getElementById("activeHoursTracker");
    if (trackerText) trackerText.innerText = `Active Duty: ${hours}h Today`;
}

async function loadActiveHoursFromDB() {
    if (!supabaseClient) return;
    try {
        if (!currentRiderId) return;
        const today = new Date().toISOString().split('T')[0];
        // ✅ FIX (#7, #13): riders_wallet only ever holds one row per rider
        // (unique(rider_id)), so "deliveries today" must be counted from
        // the orders table instead — plus the query result's `error` is
        // now actually checked.
        const { data, error } = await supabaseClient.from('orders')
            .select('order_id')
            .eq('rider_id', currentRiderId)
            .eq('status', 'delivered')
            .gte('updated_at', today);
        if (error) throw error;
        if (data && data.length > 0) {
            riderActiveMinutes = Math.max(60, data.length * 30); // Estimate from deliveries
        } else {
            riderActiveMinutes = 0;
        }
        updateActiveHoursUI();
    } catch(e) {
        showToast("Active hours load error: " + (e.message || e), "error");
    }
}

// ==========================================
// 7. Profile Management, Language & Strict Doc KYC Actions
// ==========================================
function processAvatarUpdate(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const avatarDisplayImage = document.getElementById("avatarDisplayImage");
            if (avatarDisplayImage) {
                avatarDisplayImage.src = e.target.result;
            }
            localStorage.setItem("rider_avatar", e.target.result);
            showToast("Profile avatar image applied successfully!", "success");
            
            await saveRiderProfileToDatabase();
        };
        reader.readAsDataURL(file);
    }
}

// ✅ NEW: লগইন করার সাথে সাথেই riders টেবিলে ওই ইমেইলের একটা row আছে কিনা নিশ্চিত করা হয়।
// row না থাকলে email + সম্ভব হলে Google full_name/duty_status দিয়ে একটা নতুন row বসিয়ে দেওয়া হয়।
// row আগে থেকেই থাকলে কিছুই ওভাররাইট করা হয় না (শুধু email/duty_status এর upsert, বাকি কলাম অপরিবর্তিত থাকে)।
async function ensureRiderDbRow(user) {
    if (!supabaseClient || !user?.id) return;
    try {
        // ✅ FIX: auth_user_id দিয়ে চেক করা হচ্ছে (email দিয়ে না), কারণ RLS policy
        // auth.uid() = auth_user_id ম্যাচ করে — email match করে না, তাই 403 আসছিল।
        const { data: existing } = await supabaseClient
            .from('riders')
            .select('id')
            .eq('auth_user_id', user.id)
            .maybeSingle();

        if (existing) return; // row already exists — nothing to do

        const googleName = user.user_metadata?.full_name || user.user_metadata?.name || "";
        await supabaseClient.from('riders').insert({
            auth_user_id: user.id,
            email: user.email,
            full_name: googleName,
            duty_status: (localStorage.getItem("rider_duty_status") !== "off") ? 'online' : 'offline'
        });
    } catch (err) {
        // নীরবে ফেইল হবে — এটা best-effort সেফটি-নেট, পেজ লোড ব্লক করবে না
    }
}

// ✅ NEW: Google OAuth দিয়ে লগইন করলে Google প্রোফাইল পিকচারটা রাইডারের অ্যাভাটার হিসেবে
// অটোমেটিক বসিয়ে দেওয়া হয় — কিন্তু শুধু তখনই, যখন rider এখনো কোনো কাস্টম অ্যাভাটার
// সেট করেনি (riders.avatar_url খালি)। এরপর rider চাইলে profile পেজ থেকে নিজে বদলে নিতে পারবে।
async function autoApplyGoogleAvatar(user) {
    if (!supabaseClient || !user) return;
    try {
        const googlePic = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
        if (!googlePic) return;

        // যদি ইতিমধ্যে localStorage এ কোনো অ্যাভাটার সেভ করা থাকে, সেটাকে অগ্রাধিকার দেওয়া হবে
        if (localStorage.getItem("rider_avatar")) return;

        const { data: existingRider } = await supabaseClient
            .from('riders')
            .select('avatar_url')
            .eq('auth_user_id', user.id)
            .maybeSingle();

        // rider যদি আগে থেকেই কাস্টম অ্যাভাটার সেট করে থাকে, সেটা ওভাররাইট করা হবে না
        if (existingRider && existingRider.avatar_url) {
            localStorage.setItem("rider_avatar", existingRider.avatar_url);
            return;
        }

        localStorage.setItem("rider_avatar", googlePic);
        // ✅ FIX: email দিয়ে upsert(onConflict:'email') 403 দিচ্ছিল — এখন auth_user_id দিয়ে safeUpdateRiderByAuthUser()
        try {
            await safeUpdateRiderByAuthUser(user.id, { avatar_url: googlePic });
        } catch (err) {
            // silent — avatar auto-fill is a nice-to-have, error already logged
        }
    } catch (err) {
        // silent — avatar auto-fill is a nice-to-have, not critical
    }
}

// ✅ REWRITE (spec #11): No longer assumes every column exists. Builds the
// payload from whatever fields are actually present in the DOM, then hands
// it to safeUpdateRiderByAuthUser() which sends it as-is first and only
// drops a field if PostgREST itself reports that exact column doesn't
// exist in the live schema (PGRST204) — never guessed up front. vehicle_plate
// and vehicle_type are included here because riders_kyc (rider_kyc.plate_no /
// vehicle_type) is the real source of truth for vehicle KYC — if riders.vehicle_plate
// / riders.vehicle_type also exist as sync columns they get updated too; if they
// don't exist on this installation, safeUpdateRiderByAuthUser drops them
// automatically instead of failing the whole save.
async function saveRiderProfileToDatabase() {
    if (!supabaseClient) return;

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        const payload = {
            full_name: document.getElementById("profileDisplayName") ? document.getElementById("profileDisplayName").innerText : "",
            avatar_url: localStorage.getItem("rider_avatar") || ""
        };

        await safeUpdateRiderByAuthUser(user.id, payload);

    } catch (dbErr) {
        showToast("Profile save failed: " + (dbErr.message || dbErr), "error");
    }
}

function setAppLanguage(lang) {
    localStorage.setItem("app_language", lang);
    applyInstantTranslation(lang);
    showToast(`Language updated to: ${lang.toUpperCase()}`, "info");
    closeSubPage('languagePage');
}

function applyInstantTranslation(lang) {
    const translationTargets = document.querySelectorAll(".tr-text");
    translationTargets.forEach(element => {
        const translatedText = element.getAttribute(`data-${lang}`);
        if (translatedText) element.innerText = translatedText;
    });
}

// Global safe closeSubPage function
function closeSubPage(pageId) {
    const pageElement = document.getElementById(pageId);
    if (pageElement) {
        pageElement.classList.add('hidden');
        if (document.body) {
            document.documentElement.style.overflowY = '';
        }
        // ✅ NEW (KYC full-screen redesign): the wizard hides the normal bottom nav
        // while open and pushes one history entry for the Android hardware-back
        // safety-net (see popstate handler below) — restore/consume both here so
        // every close path (step-1 Back, successful submit, or any future close)
        // is handled from one place.
        if (pageId === 'kycWizardPage') {
            showRiderBottomNav();
            if (_kycHistoryPushed) { _kycHistoryPushed = false; history.back(); }
            onKycWizardClosed();
        }
    } else {

    }
}

function toggleNotifications() {
    const notiDropdown = document.getElementById('notiDropdown');
    if (!notiDropdown) return;
    notiDropdown.classList.toggle('hidden');

    // ✅ ড্রপডাউনের বাইরে ক্লিক করলে বন্ধ হয়ে যাবে (Zomato/Swiggy স্টাইল)
    if (!notiDropdown.classList.contains('hidden')) {
        setTimeout(() => {
            document.addEventListener('click', closeNotiDropdownOutside);
        }, 0);
    }
}

function closeNotiDropdownOutside(e) {
    const notiDropdown = document.getElementById('notiDropdown');
    const notiBtn = document.querySelector('.notification-btn');
    if (!notiDropdown) return;
    if (notiDropdown.contains(e.target) || (notiBtn && notiBtn.contains(e.target))) return;
    notiDropdown.classList.add('hidden');
    document.removeEventListener('click', closeNotiDropdownOutside);
}

// ✅ FIX: আগে notification লোড হওয়ার সাথে সাথেই সবগুলো is_read=true করে দিত (auto mark-all-read),
// ফলে badge/লাল ডট কখনো ঠিকমতো দেখাই যেত না। এখন শুধু unread count (10+ ক্যাপসহ) লোড হয় এবং
// প্রতিটা notification ক্লিক করলে আলাদাভাবে read হবে (নিচের markNotificationAsRead ফাংশন)।
//
// ✅ NEW: প্রতিটা notification এ একটা ✕ (cross) বাটন থাকবে — সেটা চাপলে notification
// DB থেকে permanently ডিলিট হয়ে যাবে, তাই রিফ্রেশ করলেও আর ফিরে আসবে না।
// ✅ NEW: ✕ না চাপলেও ১০ দিন পর পুরনো notification অটোমেটিক ডিলিট হয়ে যায় (নিচে purge অংশ দেখুন)।
// ✅ NEW: order-সংক্রান্ত notification-এ order_id থাকলে সেটা DOM-এ data-order-id হিসেবে বসানো
// হয়, যাতে অন্য রাইডার অর্ডারটা accept করলে (listenToAvailableOrders এ দেখুন) মিলিয়ে সেই
// notification নিজে থেকেই সরিয়ে দেওয়া যায়।
const NOTI_AUTO_PURGE_DAYS = 10;

// ✅ NEW: DB থেকে delete করার সাথে সাথে localStorage-এও permanently "dismissed" হিসেবে
// মার্ক রাখা হয় — কারণ Supabase-এ rider_notifications টেবিলে DELETE policy না থাকলে (RLS)
// সার্ভার-সাইড delete চুপচাপ ব্যর্থ হতে পারে (কোনো error ছাড়াই), আর সেক্ষেত্রে রিফ্রেশ/dropdown
// আবার খুললে পুরনো row-টা DB থেকে আবার চলে আসতো। এখন ক্রস করা ID localStorage-এ সেভ থাকায়,
// DB delete কাজ করুক বা না করুক — একবার ক্রস করলে সেটা রাইডারের কাছে আর কখনো দেখাবে না।
const DISMISSED_NOTI_KEY = 'dismissedNotificationIds';

function getDismissedNotiIds() {
    try {
        const raw = localStorage.getItem(DISMISSED_NOTI_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
}

function markNotiDismissedLocally(id) {
    try {
        const dismissed = getDismissedNotiIds();
        dismissed[id] = Date.now();
        // পুরনো (৩০ দিনের বেশি) এন্ট্রি ছেঁটে ফেলে localStorage-কে ছোট রাখা
        const cutoff = Date.now() - 30 * 86400000;
        Object.keys(dismissed).forEach(k => { if (dismissed[k] < cutoff) delete dismissed[k]; });
        localStorage.setItem(DISMISSED_NOTI_KEY, JSON.stringify(dismissed));
    } catch (e) { /* localStorage full/unavailable — চুপচাপ স্কিপ, DB delete-ই মূল ভরসা */ }
}

async function loadDeliveryNotifications() {
    const badge = document.getElementById('noti-badge');
    const dropdownBody = document.getElementById('noti-dropdown-body');
    if (!badge || !supabaseClient) return;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.user) return;
        const numericRiderId = localStorage.getItem("riderId") || localStorage.getItem("rider_id");
        if (!numericRiderId) return;

        const dismissed = getDismissedNotiIds();

        // ✅ NEW: ১০ দিনের বেশি পুরনো notification গুলো ব্যাকগ্রাউন্ডে permanently ডিলিট করে দেওয়া
        // (ম্যানুয়ালি ✕ না করলেও এই বয়সের notification আর দেখানো হবে না)
        const purgeBeforeIso = new Date(Date.now() - NOTI_AUTO_PURGE_DAYS * 86400000).toISOString();
        supabaseClient.from('rider_notifications')
            .delete()
            .or(`rider_id.eq.${parseInt(numericRiderId)},rider_id.is.null`)
            .lt('created_at', purgeBeforeIso)
            .then(() => {}).catch(() => {});

        // Unread count (exact, capped at "10+" for display)
        const { count } = await supabaseClient.from('rider_notifications')
            .select('id', { count: 'exact', head: true })
            .or(`rider_id.eq.${parseInt(numericRiderId)},rider_id.is.null`)
            .eq('is_read', false)
            .gte('created_at', purgeBeforeIso);

        // ✅ dismissed (ক্রস করা) হিসেবে লোকালি মার্ক করা আইডিগুলো unread count থেকেও বাদ যাবে
        let unread = count || 0;

        // Recent notifications (read + unread) for the dropdown list.
        // ✅ order_id কলাম থাকলে সেটাও আনার চেষ্টা করা হয় (না থাকলে fallback করে বেসিক কলামেই থামে)
        let data;
        const res1 = await supabaseClient.from('rider_notifications')
            .select('id, title, message, created_at, is_read, order_id')
            .or(`rider_id.eq.${parseInt(numericRiderId)},rider_id.is.null`)
            .gte('created_at', purgeBeforeIso)
            .order('created_at', { ascending: false })
            .limit(30);
        if (res1.error) {
            const res2 = await supabaseClient.from('rider_notifications')
                .select('id, title, message, created_at, is_read')
                .or(`rider_id.eq.${parseInt(numericRiderId)},rider_id.is.null`)
                .gte('created_at', purgeBeforeIso)
                .order('created_at', { ascending: false })
                .limit(30);
            data = res2.data;
        } else {
            data = res1.data;
        }

        // ✅ FIX: যেসব ID আগে ক্রস করা হয়েছিল (localStorage-এ dismissed), সেগুলো বাদ দিয়ে রেন্ডার
        // করা হয় — DB-তে delete সফল না হলেও (RLS ইত্যাদির কারণে) এগুলো আর কখনো ফিরে আসবে না।
        const visibleData = (data || []).filter(n => !dismissed[n.id]).slice(0, 15);
        const dismissedUnreadCount = (data || []).filter(n => dismissed[n.id] && !n.is_read).length;
        unread = Math.max(0, unread - dismissedUnreadCount);

        if (unread > 0) {
            badge.textContent = unread > 10 ? '10+' : String(unread);
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
            badge.textContent = '0';
        }

        if (dropdownBody) {
            if (visibleData.length > 0) {
                dropdownBody.innerHTML = visibleData.map(n => renderNotiItemHtml(n)).join('');
            } else {
                dropdownBody.innerHTML = `<p class="noti-item" style="text-align:center;color:#999;padding:20px;">No new notifications</p>`;
            }
        }
    } catch (e) {
        showToast("Notifications load error: " + (e.message || e), "error");
    }
}

// ✅ NEW: একটা notification card এর HTML — cross(✕) বাটনসহ, একই টেমপ্লেট সবখানে (initial load + realtime insert) ব্যবহার হয়
// ✅ NEW: notification-এ কী প্রোডাক্ট/আইটেম আছে তা কোথাও দেখানো হবে না — শুধু Pickup/Deliver
// address অংশটুকু রাখা হয়, ". Order: ... Items: ... Total: ..." অংশ কেটে বাদ দেওয়া হয়।
function sanitizeNotificationMessage(msg) {
    if (!msg) return '';
    const idx = msg.search(/\.\s*Order\s*:/i);
    if (idx !== -1) return msg.slice(0, idx).trim() + '.';
    return msg;
}

function renderNotiItemHtml(n) {
    return `<div class="noti-item ${n.is_read ? 'read' : 'unread'}" data-noti-id="${n.id}" ${n.order_id ? `data-order-id="${n.order_id}"` : ''} onclick="markNotificationAsRead(${n.id}, this)">
        <button class="noti-cross-btn" title="Remove" onclick="event.stopPropagation(); deleteNotification(${n.id}, this)"><i class="fa-solid fa-xmark"></i></button>
        <p><strong>${escapeHtml(n.title) || 'Notification'}</strong></p>
        <p>${escapeHtml(sanitizeNotificationMessage(n.message))}</p>
        <span>${n.created_at ? timeAgo(n.created_at) : 'Just now'}</span>
    </div>`;
}

// ✅ NEW: ✕ বাটনে ক্লিক করলে notification permanently ডিলিট হবে (DB + localStorage dismissed-list
// দুটো জায়গা থেকেই) — DB delete RLS-এর কারণে ব্যর্থ হলেও, localStorage-এর কারণে একবার ক্রস
// করলে রিফ্রেশ করলেও আর কখনো ফিরে আসবে না।
async function deleteNotification(id, btnEl) {
    if (!id) return;
    const item = btnEl ? btnEl.closest('.noti-item') : document.querySelector(`.noti-item[data-noti-id="${id}"]`);
    const wasUnread = item && item.classList.contains('unread');

    // ✅ সবার আগে localStorage-এ permanently dismissed মার্ক করে দেওয়া — এটাই আসল গ্যারান্টি
    markNotiDismissedLocally(id);

    if (item) {
        item.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
        item.style.opacity = '0';
        item.style.transform = 'translateX(12px)';
        setTimeout(() => {
            item.remove();
            const dropdownBody = document.getElementById('noti-dropdown-body');
            if (dropdownBody && dropdownBody.children.length === 0) {
                dropdownBody.innerHTML = `<p class="noti-item" style="text-align:center;color:#999;padding:20px;">No new notifications</p>`;
            }
        }, 150);
    }

    if (wasUnread) {
        const badge = document.getElementById('noti-badge');
        if (badge && badge.style.display !== 'none') {
            const current = badge.textContent;
            if (current !== '10+') {
                const c = (parseInt(current) || 0) - 1;
                if (c <= 0) { badge.style.display = 'none'; badge.textContent = '0'; }
                else { badge.textContent = String(c); }
            }
        }
    }

    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient.from('rider_notifications').delete().eq('id', id);
        if (error) throw error;
    } catch (e) {
        // ✅ DB delete ব্যর্থ হলেও চুপচাপ থাকা হয় (toast দেখানো হয় না) — কারণ localStorage
        // dismissed-list ইতিমধ্যে UI-তে permanently hide করার দায়িত্ব নিয়ে নিয়েছে
    }
}

// ✅ NEW: কোনো অর্ডার আর broadcast/available না থাকলে (অন্য রাইডার accept করলে বা মার্চেন্ট
// বাতিল করলে) — সেই অর্ডার সংক্রান্ত notification (যদি order_id মিলে) DOM ও DB থেকে সরিয়ে দেওয়া হয়।
async function removeOrderNotificationByOrderId(orderId) {
    if (!orderId) return;
    document.querySelectorAll(`.noti-item[data-order-id="${orderId}"]`).forEach(el => {
        const id = el.dataset.notiId;
        el.remove();
        if (id) {
            markNotiDismissedLocally(id);
            if (supabaseClient) {
                supabaseClient.from('rider_notifications').delete().eq('id', id).then(() => {}).catch(() => {});
            }
        }
    });
    const dropdownBody = document.getElementById('noti-dropdown-body');
    if (dropdownBody && dropdownBody.children.length === 0) {
        dropdownBody.innerHTML = `<p class="noti-item" style="text-align:center;color:#999;padding:20px;">No new notifications</p>`;
    }
}

// ✅ NEW: একটা notification ক্লিক করলে সেটা read হবে — লাল ডট চলে যাবে, badge count ১ কমবে,
// এবং database এ is_read=true সেভ হবে (Facebook/Zomato স্টাইল)
async function markNotificationAsRead(id, el) {
    if (!supabaseClient || !id) return;
    if (el && el.classList.contains('read')) return; // already read, nothing to do

    if (el) {
        el.classList.remove('unread');
        el.classList.add('read');
    }

    const badge = document.getElementById('noti-badge');
    if (badge && badge.style.display !== 'none') {
        const current = badge.textContent;
        if (current !== '10+') {
            const c = (parseInt(current) || 0) - 1;
            if (c <= 0) {
                badge.style.display = 'none';
                badge.textContent = '0';
            } else {
                badge.textContent = String(c);
            }
        }
    }

    try {
        const { error } = await supabaseClient.from('rider_notifications').update({ is_read: true }).eq('id', id);
        if (error) throw error;
    } catch (e) {
        showToast("Could not mark notification as read: " + (e.message || e), "error");
    }
}

function timeAgo(dateStr) {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + ' mins ago';
    if (diff < 86400) return Math.floor(diff / 3600) + ' hours ago';
    return Math.floor(diff / 86400) + ' days ago';
}
function openSubPage(pageId) { const el = document.getElementById(pageId); if (!el) return; el.classList.remove('hidden'); document.documentElement.style.overflowY = 'hidden'; }

async function triggerProfileNameEdit() {
    const newName = await new Promise(resolve => {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
        modal.innerHTML = `<div style="background:#fff;border-radius:16px;padding:24px;width:90%;max-width:360px;text-align:center;">
            <h3 style="margin:0 0 12px;font-size:1rem;color:#2f3542;">Enter New Profile Name</h3>
            <input type="text" id="modalPromptInput" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:0.9rem;margin-bottom:14px;outline:none;" placeholder="Type new name...">
            <div style="display:flex;gap:10px;">
                <button onclick="this.closest('.modal').remove()" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-weight:600;">Cancel</button>
                <button id="modalPromptOk" style="flex:1;padding:10px;border:none;border-radius:8px;background:#e02020;color:#fff;cursor:pointer;font-weight:600;">OK</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        const input = modal.querySelector('#modalPromptInput');
        input.focus();
        modal.querySelector('#modalPromptOk').onclick = () => { const v = input.value.trim(); modal.remove(); resolve(v || null); };
        modal.onclick = (e) => { if (e.target === modal) { modal.remove(); resolve(null); } };
    });
    if (newName) {
        if (document.getElementById("profileDisplayName")) {
            document.getElementById("profileDisplayName").innerText = newName;
            await saveRiderProfileToDatabase();
        }
    }
}

// ============================================================
// FIX: showConfirmationModal() was called by processGlobalLogout() but was never
// defined anywhere, so tapping "Logout Account" threw a ReferenceError and did nothing.
// Self-contained confirm dialog (no dependency on rider.css).
// ============================================================
function showConfirmationModal(message, onConfirm) {
    const old = document.getElementById('riderConfirmOverlay');
    if (old) old.remove();
    const o = document.createElement('div');
    o.id = 'riderConfirmOverlay';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px';
    o.innerHTML = '<div style="background:#fff;border-radius:18px;padding:22px;width:min(340px,100%);text-align:center;font-family:inherit">'
        + '<div style="font-size:16px;font-weight:800;color:#111827;margin-bottom:18px" id="riderConfirmMsg"></div>'
        + '<div style="display:flex;gap:10px">'
        + '<button type="button" id="riderConfirmNo" style="flex:1;padding:12px;border-radius:12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:700;color:#374151">Cancel</button>'
        + '<button type="button" id="riderConfirmYes" style="flex:1;padding:12px;border-radius:12px;border:0;background:#e02020;color:#fff;font-weight:700">Yes, Logout</button>'
        + '</div></div>';
    document.body.appendChild(o);
    document.getElementById('riderConfirmMsg').textContent = message || 'Are you sure?';
    document.getElementById('riderConfirmNo').onclick = () => o.remove();
    o.addEventListener('click', e => { if (e.target === o) o.remove(); });
    document.getElementById('riderConfirmYes').onclick = async () => {
        o.remove();
        try { await onConfirm(); } catch (e) { console.error('Confirm action failed', e); }
    };
}
window.showConfirmationModal = showConfirmationModal;

async function processGlobalLogout() {
    showConfirmationModal("Are you sure you want to logout?", async () => {
        try {
            if (supabaseClient?.auth) await supabaseClient.auth.signOut();
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace("home.html");
        } catch (err) {
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace("home.html");
        }
    });
}

// ============================================================
// ✅ NEW BLOCK: Single-file SPA tab switching (rider.html merges what used
// to be 4 separate pages — delyvaryhome/order/earning/profile.html — into
// one file with #tab-home / #tab-delivery / #tab-earning / #tab-profile
// sections). switchRiderTab() replaces every old `window.location.href =
// "delyvaryX.html"` full-page navigation with an instant in-page toggle.
// ============================================================
window._activeRiderTab = 'home';

function switchRiderTab(tab) {
    const validTabs = ['home', 'delivery', 'earning', 'profile'];
    if (!validTabs.includes(tab)) tab = 'home';
    window._activeRiderTab = tab;

    document.querySelectorAll('.rider-tab').forEach(sec => {
        sec.classList.toggle('hidden', sec.id !== `tab-${tab}`);
    });
    initBottomNav();

    // ✅ FIX: Leaflet মাপ ভুল হিসাব করে যদি তার container display:none অবস্থায় init হয় —
    // Delivery ট্যাব হাইড থাকা অবস্থায় ম্যাপ প্রথমবার লোড হয়ে থাকলে, ট্যাবে ফেরত এলে
    // invalidateSize() কল করে সঠিক সাইজ/পজিশন রিক্যালকুলেট করানো হয়
    if (tab === 'delivery' && typeof map !== 'undefined' && map) {
        setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 60);
    }

    // পেজ রিফ্রেশ করলে যেন সবশেষ যে ট্যাবে ছিল সেখানেই ফিরে আসে (ঠিক যেমন আলাদা পেজ হলে হতো)
    try { sessionStorage.setItem('rider_active_tab', tab); } catch (e) {}

    const titles = { home: 'MediFinder India - Rider Home', delivery: 'Order Tracking | MediFinder India', earning: 'MediFinder India - Driver Metrics', profile: 'MediFinder India - Rider Profile Configuration' };
    document.title = titles[tab] || 'MediFinder India - Rider App';
}

// Bottom nav active state — now driven by the in-app active tab instead of
// the page filename (there's only one file, rider.html, so pathname-based
// detection no longer applies)
function initBottomNav() {
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        const tab = item.getAttribute('data-tab');
        item.classList.toggle('active', tab === window._activeRiderTab);
    });
}

// ✅ NEW: একাধিকবার (initial load + realtime event + upload success) loadCurrentRiderProfileStatus()
// প্রায় একসাথে কল হলে race condition হতে পারতো — ধীরে শেষ হওয়া পুরনো কল, পরে শুরু হওয়া নতুন কলের
// (সঠিক) DOM আপডেটকে ওভাররাইট করে পুরনো/খালি ডেটা দিয়ে বসিয়ে দিত। এখন একটা sequence number
// দিয়ে গার্ড করা হলো — শুধু সর্বশেষ শুরু হওয়া কলটাই DOM আপডেট করতে পারবে।
let _profileStatusCallSeq = 0;

// ✅ REWRITE (spec §15, §10): rider row is now resolved via
// auth_user_id (never email) — matches the RLS policy and is the
// second half of the 400/403 fix (ensureRiderDbRow / safeUpdateRiderByAuthUser
// already used auth_user_id for writes; this was the last read path
// still using email).
async function loadCurrentRiderProfileStatus() {
    if (window.location.pathname.includes('home.html')) return; 
    const _mySeq = ++_profileStatusCallSeq;

    try {
        let currentSession = null;
        let authUserId = null;

        if (supabaseClient.auth && typeof supabaseClient.auth.getSession === 'function') {
            const { data: { session: s } } = await supabaseClient.auth.getSession();
            currentSession = s;
            if (s && s.user) authUserId = s.user.id;
        }

        if (!authUserId) return;

        // STEP 1-2: auth user -> riders row using auth_user_id (source of truth for RLS)
        const { data, error } = await supabaseClient
            .from('riders')
            .select('*')
            .eq('auth_user_id', authUserId)
            .maybeSingle();

        if (error) {
            console.error("RIDERS FETCH ERROR:", { code: error.code, message: error.message, details: error.details, hint: error.hint });
            return;
        }
        if (_mySeq !== _profileStatusCallSeq) return;
        const riderProfile = data || {};
        const rId = riderProfile.id;
        if (rId) {
            localStorage.setItem('riderId', rId);
            currentRiderId = rId; 
        }

        // ✅ NEW: unified KYC application — single row per rider in rider_kyc_application
        let kycApp = null;
        if (rId) {
            const { data: appData, error: appErr } = await supabaseClient
                .from('rider_kyc_application')
                .select('*')
                .eq('rider_id', rId)
                .maybeSingle();
            if (appErr) console.error("RIDER_KYC_APPLICATION FETCH ERROR:", { code: appErr.code, message: appErr.message, details: appErr.details, hint: appErr.hint });
            kycApp = appData || null;
        }
        if (_mySeq !== _profileStatusCallSeq) return;
        window._kycApplicationCache = kycApp;

        const kycStatus = kycApp ? kycApp.status : 'not_submitted';
        // ✅ Accept Order button (home/order pages) stays locked until KYC is fully approved
        window._riderLicenseVerified = (kycStatus === 'approved');

        renderKycStatusUI(kycApp, kycStatus, riderProfile);

        // Avatar: custom upload always wins; once approved, the verified selfie becomes
        // the profile picture unless the rider has since uploaded their own custom avatar.
        if (riderProfile.avatar_url) {
            localStorage.setItem("rider_avatar", riderProfile.avatar_url);
            if (document.getElementById("avatarDisplayImage")) {
                document.getElementById("avatarDisplayImage").src = riderProfile.avatar_url;
            }
        }
        if (kycStatus === 'approved' && kycApp && kycApp.selfie_img && !riderProfile.avatar_url && document.getElementById("avatarDisplayImage")) {
            document.getElementById("avatarDisplayImage").src = kycApp.selfie_img;
        }

        // ✅ FIX: আগে full_name খালি থাকলে HTML এর স্ট্যাটিক "Rider Account" লেখাই থেকে যেত।
        // এখন fallback chain: signup name → Google display name → email prefix।
        if (document.getElementById('profileDisplayName')) {
            const googleName = currentSession?.user?.user_metadata?.full_name || currentSession?.user?.user_metadata?.name || "";
            const nameToShow = riderProfile.full_name || googleName || (currentSession?.user?.email ? currentSession.user.email.split('@')[0] : "Rider");
            document.getElementById('profileDisplayName').innerText = nameToShow;
        }
        if (document.getElementById('profileDisplayUsername')) {
            let uidDisplay;
            if (riderProfile.rider_uid) {
                uidDisplay = '@' + riderProfile.rider_uid;
            } else if (riderProfile.username) {
                uidDisplay = riderProfile.username.startsWith('@') ? riderProfile.username : '@' + riderProfile.username;
            } else if (rId) {
                uidDisplay = '@RD' + String(rId).padStart(6, '0');
            } else if (currentSession?.user?.email) {
                uidDisplay = '@' + currentSession.user.email.split('@')[0];
            } else {
                uidDisplay = '@rider';
            }
            document.getElementById('profileDisplayUsername').innerText = uidDisplay;
        }
        if (document.getElementById("verificationStatus")) {
            document.getElementById("verificationStatus").innerText = riderProfile.status || "Pending";
        }

        // ✅ Total Lifetime Income — completed delivery অনুযায়ী calculate
        if (document.getElementById("totalLifetimeIncome") && rId) {
            loadTotalLifetimeIncome(rId);
        }

    } catch (e) { 
        showToast("Profile status load error: " + (e.message || e), "error");
    }
}

// ============================================================
// ✅ NEW BLOCK: Rider KYC v2 — unified onboarding wizard, banner
// ring, read-only views, complaint & delete-account flows.
// Table: rider_kyc_application (one row per rider_id).
// ============================================================

// Renders either the "Verify your account to earn money" banner
// (not_submitted / pending / rejected) or the read-only Account
// Details & Legal section (approved) — including the avatar's
// green verified ring and small vehicle badge.
function renderKycStatusUI(kycApp, status, riderProfile) {
    const banner = document.getElementById('kycVerifyBanner');
    const approvedSection = document.getElementById('kycApprovedSection');
    const ringFill = document.getElementById('kycRingFill');
    const ringLabel = document.getElementById('kycRingLabel');
    const bannerTitle = document.getElementById('kycBannerTitle');
    const bannerSub = document.getElementById('kycBannerSubtext');
    const bannerAvatar = document.getElementById('kycBannerAvatar');
    const avatarWrapper = document.getElementById('avatarWrapper');
    const vehicleBadge = document.getElementById('vehicleBadgeImg');
    const mainAvatarImg = document.getElementById('avatarDisplayImage');

    if (bannerAvatar && mainAvatarImg && mainAvatarImg.src) {
        bannerAvatar.src = mainAvatarImg.src;
    }

    // ✅ NEW: Home page-এর লাল KYC ব্যানার — Profile পেজে না থেকেও (Home/Delivery/Earning এ)
    // approve না হওয়া পর্যন্ত দেখাবে
    const homeBanner = document.getElementById('homeKycBanner');

    if (status === 'approved') {
        if (banner) banner.classList.add('hidden');
        if (approvedSection) approvedSection.classList.remove('hidden');
        if (avatarWrapper) avatarWrapper.classList.add('kyc-approved');
        if (vehicleBadge) {
            if (kycApp && kycApp.vehicle_img) {
                vehicleBadge.src = kycApp.vehicle_img;
                vehicleBadge.classList.remove('hidden');
            } else {
                vehicleBadge.classList.add('hidden');
            }
        }
        if (homeBanner) homeBanner.classList.add('hidden');
        return;
    }

    if (homeBanner) {
        homeBanner.classList.remove('hidden');
        const textEl = homeBanner.querySelector('.kyc-home-banner-text');
        if (textEl) {
            if (status === 'pending') textEl.innerText = 'Your KYC is under review — please wait for approval.';
            else if (status === 'rejected') textEl.innerText = 'KYC rejected — tap to fix and resubmit.';
            else textEl.innerText = 'Please upload your documents and earn money';
        }
    }

    if (approvedSection) approvedSection.classList.add('hidden');
    if (avatarWrapper) avatarWrapper.classList.remove('kyc-approved');
    if (vehicleBadge) vehicleBadge.classList.add('hidden');
    if (banner) banner.classList.remove('hidden');

    const percent = computeKycCompletionPercent(kycApp);
    if (ringFill) {
        const circumference = 163.36; // 2 * PI * r(26)
        ringFill.style.strokeDashoffset = String(circumference - (circumference * percent / 100));
        ringFill.classList.remove('kyc-ring-green', 'kyc-ring-amber');
        if (status === 'pending') ringFill.classList.add('kyc-ring-amber');
    }
    if (ringLabel) ringLabel.innerText = percent + '%';

    if (banner) banner.classList.remove('kyc-pending-state', 'kyc-rejected-state');
    if (status === 'pending') {
        if (banner) banner.classList.add('kyc-pending-state');
        if (bannerTitle) bannerTitle.innerText = 'Application under review';
        if (bannerSub) bannerSub.innerText = 'We are reviewing your documents. This usually takes 24–48 hours.';
    } else if (status === 'rejected') {
        if (banner) banner.classList.add('kyc-rejected-state');
        if (bannerTitle) bannerTitle.innerText = 'Application rejected — tap to fix';
        if (bannerSub) bannerSub.innerText = (kycApp && kycApp.rejection_reason) ? kycApp.rejection_reason : 'Please review and resubmit your documents.';
    } else {
        if (bannerTitle) bannerTitle.innerText = 'Verify your account to earn money';
        if (bannerSub) bannerSub.innerText = 'Complete your KYC to start accepting orders';
    }
}

// Completion % that drives the ring — checked against whichever fields
// are actually required for the rider's chosen vehicle type.
function computeKycCompletionPercent(app) {
    if (!app) return 0;
    const skipDoc = (app.vehicle_type === 'bicycle' || app.vehicle_type === 'ev');
    const required = ['first_name','age','contact_no','address','vehicle_type','vehicle_img','selfie_img','id_type','id_no','id_img','bank_doc_img','account_no','ifsc_code','branch'];
    if (!skipDoc) required.push('vehicle_no','license_img','license_no');
    let filled = 0;
    required.forEach(k => { if (app[k] !== undefined && app[k] !== null && String(app[k]).trim() !== '') filled++; });
    return Math.round((filled / required.length) * 100);
}

// ---------------- Wizard navigation ----------------
const KYC_STEP_TITLES = { 1: 'Rider Details', 2: 'Vehicle Details', 3: 'License & Insurance', 4: 'Identity Verification', 5: 'Bank & Payment', 6: 'Preview & Submit' };
let kycCurrentStep = 1;
window._kycDraft = { fields: {}, existing: null };

function showKycStep(n) {
    kycCurrentStep = n;
    document.querySelectorAll('.kyc-step').forEach(el => {
        el.classList.toggle('hidden', Number(el.dataset.step) !== n);
    });
    document.querySelectorAll('.kyc-dot').forEach(dot => {
        const s = Number(dot.dataset.step);
        dot.classList.toggle('active', s === n);
        dot.classList.toggle('done', s < n);
    });
    const titleEl = document.getElementById('kycWizardStepTitle');
    if (titleEl) titleEl.innerText = KYC_STEP_TITLES[n] || '';

    // ✅ NEW (full-screen redesign): shared bottom action bar — step counter +
    // dynamic Continue/Submit label, and always scroll the new step into view
    const stepCountEl = document.getElementById('kycStepCount');
    if (stepCountEl) stepCountEl.innerText = `${n}/6`;
    const continueBtn = document.getElementById('kycFsContinueBtn');
    if (continueBtn) continueBtn.innerText = (n === 6) ? 'Submit Application' : 'Continue →';
    const bodyEl = document.querySelector('#kycWizardPage .kyc-fs-body');
    if (bodyEl) bodyEl.scrollTop = 0;
    saveKycDraft(); // ধাপ বদলালেই progress লোকাল স্টোরেজে সেভ
}

// ✅ NEW: the full-screen wizard has ONE shared bottom "Continue →" button
// instead of a separate Continue button baked into every step — this just
// routes it to the right existing function per step, nothing duplicated.
function kycFsContinue() {
    if (kycCurrentStep === 6) { submitKycApplication(); }
    else { kycWizardNext(kycCurrentStep); }
}

function kycWizardBack() {
    if (kycCurrentStep <= 1) { closeSubPage('kycWizardPage'); return; }
    showKycStep(kycCurrentStep - 1);
}

function selectKycVehicle(type) {
    window._kycDraft.fields.vehicle_type = type;
    document.querySelectorAll('.kyc-vehicle-option').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.vehicle === type);
    });
    const skipDoc = (type === 'bicycle' || type === 'ev');
    const noRow = document.getElementById('kycVehicleNoRow');
    const noHint = document.getElementById('kycVehicleNoHint');
    if (noRow) noRow.style.display = skipDoc ? 'none' : '';
    if (noHint) noHint.classList.toggle('hidden', !skipDoc);
    const licenseFields = document.getElementById('kycLicenseFields');
    const licenseSkipNote = document.getElementById('kycLicenseSkipNote');
    if (licenseFields) licenseFields.classList.toggle('hidden', skipDoc);
    if (licenseSkipNote) licenseSkipNote.classList.toggle('hidden', !skipDoc);
    saveKycDraft();
}

function onKycIdTypeChange() {
    const typeEl = document.getElementById('kycIdType');
    const input = document.getElementById('kycIdNo');
    const hint = document.getElementById('kycIdNoHint');
    if (!typeEl || !input) return;
    const type = typeEl.value;
    if (type === 'aadhaar') { input.placeholder = '12-digit Aadhaar number'; input.maxLength = 12; if (hint) hint.innerText = 'Aadhaar number must be exactly 12 digits.'; }
    else if (type === 'pan') { input.placeholder = 'ABCDE1234F'; input.maxLength = 10; if (hint) hint.innerText = 'PAN format: 5 letters + 4 digits + 1 letter.'; }
    else if (type === 'voter') { input.placeholder = 'Voter ID number'; input.maxLength = 12; if (hint) hint.innerText = 'Enter your Voter ID (EPIC) number.'; }
    else { input.placeholder = 'Select an ID type first'; if (hint) hint.innerText = ''; }
}

function normalizeVehicleNo(raw) {
    if (!raw) return { valid: false, value: '' };
    const compact = raw.trim().toUpperCase().replace(/[\s\-]+/g, '');
    const shapeOk = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}[A-Z0-9]{2,4}$/.test(compact);
    return { valid: shapeOk, value: compact };
}

function hasExistingImg(field) {
    return !!(window._kycDraft.existing && window._kycDraft.existing[field]);
}
function hasChosenFile(inputId) {
    // ✅ ছবি এখন compress করে memory/IndexedDB তে রাখা হয় (input.files এ নয়)
    return !!(window._kycFiles && window._kycFiles[inputId]);
}

function validateAndCollectStep(step) {
    const d = window._kycDraft.fields;
    if (step === 1) {
        const firstName = document.getElementById('kycFirstName').value.trim();
        const age = document.getElementById('kycAge').value.trim();
        const contact = document.getElementById('kycContactNo').value.trim();
        const whatsapp = document.getElementById('kycWhatsappNo').value.trim();
        const email = document.getElementById('kycEmail').value.trim();
        const address = document.getElementById('kycAddress').value.trim();
        if (!firstName) return 'Please enter your first name.';
        if (!/^\d{1,2}$/.test(age) || Number(age) < 18 || Number(age) > 70) return 'Please enter a valid age (18–70).';
        if (!/^[6-9]\d{9}$/.test(contact)) return 'Please enter a valid 10-digit contact number.';
        if (whatsapp && !/^[6-9]\d{9}$/.test(whatsapp)) return 'WhatsApp number must be a valid 10-digit number.';
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
        if (!address) return 'Please enter your address.';
        Object.assign(d, { first_name: firstName, age: Number(age), contact_no: contact, whatsapp_no: whatsapp, email, address });
        return null;
    }
    if (step === 2) {
        const type = d.vehicle_type;
        if (!type) return 'Please select a vehicle type.';
        if (!hasChosenFile('kycVehicleImg') && !hasExistingImg('vehicle_img')) return 'Please upload a vehicle image.';
        const skipDoc = (type === 'bicycle' || type === 'ev');
        let vehicleNo = document.getElementById('kycVehicleNo').value.trim();
        if (!skipDoc) {
            const check = normalizeVehicleNo(vehicleNo);
            if (!check.valid) return 'Please enter a valid vehicle number, e.g. WB-62-C-XXXX.';
            vehicleNo = check.value;
        } else {
            vehicleNo = '';
        }
        d.vehicle_no = vehicleNo;
        return null;
    }
    if (step === 3) {
        const skipDoc = (d.vehicle_type === 'bicycle' || d.vehicle_type === 'ev');
        if (!skipDoc) {
            const licenseNo = document.getElementById('kycLicenseNo').value.trim();
            if (!hasChosenFile('kycLicenseImg') && !hasExistingImg('license_img')) return 'Please upload your driving license image.';
            if (!licenseNo) return 'Please enter your driving license number.';
            d.license_no = licenseNo;
        } else {
            d.license_no = '';
        }
        return null;
    }
    if (step === 4) {
        if (!hasChosenFile('kycSelfieImg') && !hasExistingImg('selfie_img')) return 'Please upload a selfie.';
        const idType = document.getElementById('kycIdType').value;
        if (!idType) return 'Please select an ID type.';
        if (!hasChosenFile('kycIdImg') && !hasExistingImg('id_img')) return 'Please upload your ID image.';
        const idNo = document.getElementById('kycIdNo').value.trim().toUpperCase();
        if (idType === 'aadhaar' && !/^\d{12}$/.test(idNo)) return 'Aadhaar number must be exactly 12 digits.';
        if (idType === 'pan' && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(idNo)) return 'Please enter a valid PAN number (e.g. ABCDE1234F).';
        if (idType === 'voter' && !/^[A-Z0-9]{6,12}$/.test(idNo)) return 'Please enter a valid Voter ID number.';
        Object.assign(d, { id_type: idType, id_no: idNo });
        return null;
    }
    if (step === 5) {
        if (!hasChosenFile('kycBankDocImg') && !hasExistingImg('bank_doc_img')) return 'Please upload your passbook / account photo.';
        const accNo = document.getElementById('kycAccountNo').value.trim();
        const ifsc = document.getElementById('kycIfscCode').value.trim().toUpperCase();
        const branch = document.getElementById('kycBranch').value.trim();
        const upi = document.getElementById('kycUpiId').value.trim();
        if (!/^\d{9,18}$/.test(accNo)) return 'Please enter a valid bank account number.';
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return 'Please enter a valid IFSC code, e.g. SBIN0001234.';
        if (!branch) return 'Please enter your branch name.';
        Object.assign(d, { account_no: accNo, ifsc_code: ifsc, branch, upi_id: upi });
        return null;
    }
    return null;
}

function kycWizardNext(step) {
    const err = validateAndCollectStep(step);
    if (err) { showToast(err, "error"); return; }
    saveKycDraft(); // Continue চাপলেই সেভ — সম্পূর্ণ submit না হওয়া পর্যন্ত লোকাল স্টোরেজে থাকবে
    if (step < 5) { showKycStep(step + 1); }
    else { renderKycPreview(); showKycStep(6); }
}

function kycPreviewRow(label, value) {
    return `<div class="kyc-preview-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value || '—')}</span></div>`;
}

function renderKycPreview() {
    const d = window._kycDraft.fields;
    const body = document.getElementById('kycPreviewBody');
    if (!body) return;
    const skipDoc = (d.vehicle_type === 'bicycle' || d.vehicle_type === 'ev');
    body.innerHTML = `
        <div class="kyc-preview-section">
            <h5>Rider Details <span class="kyc-edit-link" onclick="showKycStep(1)">Edit</span></h5>
            ${kycPreviewRow('Name', d.first_name)}
            ${kycPreviewRow('Age', d.age)}
            ${kycPreviewRow('Contact', d.contact_no)}
            ${kycPreviewRow('WhatsApp', d.whatsapp_no)}
            ${kycPreviewRow('Email', d.email)}
            ${kycPreviewRow('Address', d.address)}
        </div>
        <div class="kyc-preview-section">
            <h5>Vehicle Details <span class="kyc-edit-link" onclick="showKycStep(2)">Edit</span></h5>
            ${kycPreviewRow('Type', d.vehicle_type)}
            ${skipDoc ? '' : kycPreviewRow('Vehicle No.', d.vehicle_no)}
        </div>
        <div class="kyc-preview-section">
            <h5>License &amp; Insurance <span class="kyc-edit-link" onclick="showKycStep(3)">Edit</span></h5>
            ${skipDoc ? '<p style="font-size:0.8rem;color:var(--text-muted);">Not required for this vehicle type.</p>' : kycPreviewRow('License No.', d.license_no)}
        </div>
        <div class="kyc-preview-section">
            <h5>Identity <span class="kyc-edit-link" onclick="showKycStep(4)">Edit</span></h5>
            ${kycPreviewRow('ID Type', d.id_type)}
            ${kycPreviewRow('ID No.', d.id_no)}
        </div>
        <div class="kyc-preview-section">
            <h5>Bank &amp; Payment <span class="kyc-edit-link" onclick="showKycStep(5)">Edit</span></h5>
            ${kycPreviewRow('Account No.', d.account_no)}
            ${kycPreviewRow('IFSC', d.ifsc_code)}
            ${kycPreviewRow('Branch', d.branch)}
            ${kycPreviewRow('UPI ID', d.upi_id)}
        </div>
    `;
}

// ✅ NEW (KYC full-screen redesign): hide/restore the normal rider bottom nav
// while the onboarding wizard is open, so it reads as an independent page.
function hideRiderBottomNav() {
    const nav = document.querySelector('.bottom-nav');
    if (nav) nav.classList.add('hidden');
}
function showRiderBottomNav() {
    const nav = document.querySelector('.bottom-nav');
    if (nav) nav.classList.remove('hidden');
}

// ✅ NEW: premium upload cards (hidden native <input type=file>, styled label/preview
// on top) for every file input inside the wizard. One delegated 'change' listener,
// wired once — keeps the existing input IDs the rest of the KYC JS depends on untouched.
let _kycUploadCardsWired = false;

// ============================================================
// ✅ NEW: KYC draft persistence + হালকা ছবি হ্যান্ডলিং
//
// সমস্যা: ক্যামেরা খোলার পর ফোনের memory কম পড়লে ব্রাউজার ট্যাব কিল করে দেয়, ফলে ছবি তোলার
// পর পেজ রিলোড হয়ে হোমে চলে যেত এবং সব লেখা/ছবি হারিয়ে যেত। আগে পুরো ফটো FileReader দিয়ে
// base64 (DataURL) বানানো হতো — সেটাই বড় memory spike ছিল।
//
// এখন: (১) ছবি সাথে সাথে ছোট (max 1280px, JPEG) করা হয় এবং preview দেখানো হয় objectURL দিয়ে,
// (২) ছবি IndexedDB তে আর লেখাগুলো localStorage এ সেভ হয় — প্রতিটা Continue, প্রতিটা টাইপ, আর
// অ্যাপ ব্যাকগ্রাউন্ডে যাওয়ার মুহূর্তে, (৩) রিলোড হলে রাইডার সরাসরি একই ধাপে, আগের সব তথ্য ও
// ছবিসহ ফিরে আসে। Submit সফল হলেই draft মুছে যায়।
// ============================================================
const KYC_DRAFT_KEY = 'rider_kyc_draft_v1';
const KYC_WIZARD_OPEN_KEY = 'rider_kyc_wizard_open';
const KYC_TEXT_FIELD_IDS = ['kycFirstName','kycAge','kycContactNo','kycWhatsappNo','kycEmail','kycAddress','kycVehicleNo','kycLicenseNo','kycIdType','kycIdNo','kycAccountNo','kycIfscCode','kycBranch','kycUpiId'];
const KYC_FILE_FOLDERS = { kycVehicleImg: 'vehicle', kycLicenseImg: 'license', kycInsuranceImg: 'insurance', kycSelfieImg: 'selfie', kycIdImg: 'id', kycBankDocImg: 'bankdoc', kycQrImg: 'qr' };
window._kycFiles = window._kycFiles || {};
window._kycPreviewUrls = window._kycPreviewUrls || {};
window._kycRestoring = false;

function kycIdb() {
    if (window._kycIdbPromise) return window._kycIdbPromise;
    window._kycIdbPromise = new Promise((resolve) => {
        try {
            const req = indexedDB.open('rider_kyc_draft', 1);
            req.onupgradeneeded = () => { req.result.createObjectStore('files'); };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
            req.onblocked = () => resolve(null);
        } catch (e) { resolve(null); }
    });
    return window._kycIdbPromise;
}
async function kycIdbOp(mode, fn) {
    const db = await kycIdb();
    if (!db) return null;
    return new Promise((resolve) => {
        try {
            const tx = db.transaction('files', mode);
            const req = fn(tx.objectStore('files'));
            tx.oncomplete = () => resolve(req && ('result' in req) ? req.result : true);
            tx.onerror = () => resolve(null);
            tx.onabort = () => resolve(null);
        } catch (e) { resolve(null); }
    });
}
const kycIdbPut = (k, blob) => kycIdbOp('readwrite', st => st.put(blob, k));
const kycIdbDelete = (k) => kycIdbOp('readwrite', st => st.delete(k));
const kycIdbClear = () => kycIdbOp('readwrite', st => st.clear());
const kycIdbGet = (k) => kycIdbOp('readonly', st => st.get(k));

// বড় ক্যামেরা ফটো → max 1280px JPEG (সাধারণত ২০০–400 KB)। fail করলে আসল ফাইলই ফেরত।
async function compressKycImage(file, maxDim = 1280, quality = 0.72) {
    if (!file || !file.type || !file.type.startsWith('image/')) return file;
    let bitmap = null, url = null;
    try {
        let source, w, h;
        if (window.createImageBitmap) {
            try { bitmap = await createImageBitmap(file); } catch (e) { bitmap = null; }
        }
        if (bitmap) {
            source = bitmap; w = bitmap.width; h = bitmap.height;
        } else {
            url = URL.createObjectURL(file);
            // ১০ সেকেন্ডে লোড না হলে আটকে না থেকে আসল ফাইলই ব্যবহার হবে
            const img = await new Promise((res, rej) => {
                const i = new Image();
                const timer = setTimeout(() => rej(new Error('image decode timeout')), 10000);
                i.onload = () => { clearTimeout(timer); res(i); };
                i.onerror = (err) => { clearTimeout(timer); rej(err); };
                i.src = url;
            });
            source = img; w = img.naturalWidth; h = img.naturalHeight;
        }
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(source, 0, 0, cw, ch);
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
        canvas.width = 0; canvas.height = 0; // canvas memory সাথে সাথে ছেড়ে দেওয়া
        if (!blob) return file;
        return (scale < 1 || blob.size < file.size) ? blob : file;
    } catch (e) {
        return file;
    } finally {
        if (bitmap && bitmap.close) bitmap.close();
        if (url) URL.revokeObjectURL(url);
    }
}

function setKycCardState(inputId, blob, label) {
    const input = document.getElementById(inputId);
    const card = input ? input.closest('.kyc-upload-card') : null;
    if (!card) return;
    const placeholder = card.querySelector('.kyc-upload-placeholder');
    const result = card.querySelector('.kyc-upload-result');
    const filenameEl = card.querySelector('.kyc-upload-filename');
    const previewImg = card.querySelector('.kyc-upload-preview');
    if (window._kycPreviewUrls[inputId]) {
        URL.revokeObjectURL(window._kycPreviewUrls[inputId]);
        delete window._kycPreviewUrls[inputId];
    }
    if (blob) {
        const url = URL.createObjectURL(blob);
        window._kycPreviewUrls[inputId] = url;
        card.classList.add('has-file');
        if (placeholder) placeholder.classList.add('hidden');
        if (result) result.classList.remove('hidden');
        if (filenameEl) filenameEl.textContent = label || 'Photo ready';
        if (previewImg) { previewImg.src = url; previewImg.classList.remove('hidden'); }
    } else {
        card.classList.remove('has-file');
        if (placeholder) placeholder.classList.remove('hidden');
        if (result) result.classList.add('hidden');
        if (previewImg) { previewImg.removeAttribute('src'); previewImg.classList.add('hidden'); }
    }
}

function kycPhotoLabel(blob) {
    return 'Photo ready · ' + Math.max(1, Math.round(blob.size / 1024)) + ' KB';
}

function saveKycDraft() {
    if (window._kycRestoring) return;
    try {
        const wizard = document.getElementById('kycWizardPage');
        if (!wizard || wizard.classList.contains('hidden')) return;
        const fields = {};
        KYC_TEXT_FIELD_IDS.forEach(id => { const el = document.getElementById(id); if (el) fields[id] = el.value; });
        localStorage.setItem(KYC_DRAFT_KEY, JSON.stringify({
            step: kycCurrentStep,
            vehicle: (window._kycDraft && window._kycDraft.fields && window._kycDraft.fields.vehicle_type) || null,
            fields,
            savedAt: Date.now()
        }));
    } catch (e) { /* storage full / private mode — draft is best-effort */ }
}
const saveKycDraftDebounced = debounce(saveKycDraft, 350);

async function clearKycDraft() {
    try { localStorage.removeItem(KYC_DRAFT_KEY); } catch (e) {}
    Object.keys(window._kycPreviewUrls).forEach(id => { try { URL.revokeObjectURL(window._kycPreviewUrls[id]); } catch (e) {} });
    window._kycPreviewUrls = {};
    window._kycFiles = {};
    await kycIdbClear();
}

// ওয়াইজার্ড বন্ধ হলে (Back/Submit) — resume flag মুছে দেওয়া, GPS আবার চালু করা
function onKycWizardClosed() {
    try { localStorage.removeItem(KYC_WIZARD_OPEN_KEY); } catch (e) {}
    if (isOnDuty) startLiveLocationTracking();
}

async function restoreKycDraft(opts) {
    window._kycRestoring = true;
    try {
        // ১) ছবি ফেরত আনা (memory তে থাকলে সেটা, না হলে IndexedDB থেকে)
        for (const id of Object.keys(KYC_FILE_FOLDERS)) {
            let blob = window._kycFiles[id] || null;
            if (!blob) {
                blob = await kycIdbGet(id);
                if (blob) window._kycFiles[id] = blob;
            }
            if (blob) setKycCardState(id, blob, kycPhotoLabel(blob));
        }

        // ২) লেখা ফেরত আনা
        let raw = null;
        try { raw = localStorage.getItem(KYC_DRAFT_KEY); } catch (e) {}
        if (!raw) return;
        const draft = JSON.parse(raw);
        const fields = draft.fields || {};
        KYC_TEXT_FIELD_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (el && fields[id] !== undefined && fields[id] !== '') el.value = fields[id];
        });
        if (draft.vehicle) selectKycVehicle(draft.vehicle);
        if (fields.kycIdType) onKycIdTypeChange();

        // ৩) আগের ধাপে ফিরে যাওয়া — আগের ধাপগুলো valid থাকলে ঠিক সেই ধাপে, নাহলে প্রথম অসম্পূর্ণ ধাপে
        let target = Math.min(6, Math.max(1, Number(draft.step) || 1));
        for (let st = 1; st < target && st <= 5; st++) {
            const err = validateAndCollectStep(st);
            if (err) { target = st; showToast(err, 'info'); break; }
        }
        if (target === 6) renderKycPreview();
        showKycStep(target);
        if (opts && opts.resumed) showToast('Welcome back — your KYC progress has been restored.', 'info');
    } catch (e) {
        console.error('KYC DRAFT RESTORE ERROR:', e);
    } finally {
        window._kycRestoring = false;
        saveKycDraft();
    }
}

function initKycUploadCards() {
    if (_kycUploadCardsWired) return;
    _kycUploadCardsWired = true;
    const wizard = document.getElementById('kycWizardPage');
    if (!wizard) return;

    wizard.addEventListener('change', async function (e) {
        const input = e.target;
        if (!input || !input.matches) return;
        if (!input.matches('input[type="file"]')) { saveKycDraftDebounced(); return; } // select/text change
        const inputId = input.id;
        const file = input.files && input.files[0];
        if (!file || !KYC_FILE_FOLDERS[inputId]) return;
        const card = input.closest('.kyc-upload-card');
        if (card) card.classList.add('processing');
        try {
            const blob = await compressKycImage(file);
            window._kycFiles[inputId] = blob;
            setKycCardState(inputId, blob, kycPhotoLabel(blob));
            await kycIdbPut(inputId, blob);
            saveKycDraft();
        } catch (err) {
            console.error('KYC IMAGE ERROR:', err);
            showToast('Could not process that photo. Please try again.', 'error');
        } finally {
            input.value = ''; // আসল (বড়) ফাইলের reference ছেড়ে দেওয়া — একই ছবি আবার বাছলেও change আসবে
            if (card) card.classList.remove('processing');
        }
    });
    wizard.addEventListener('input', saveKycDraftDebounced);

    // অ্যাপ ব্যাকগ্রাউন্ডে গেলে (ক্যামেরা খোলার ঠিক আগের মুহূর্ত) সাথে সাথে সেভ
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveKycDraft(); });
    window.addEventListener('pagehide', saveKycDraft);
}

// ✅ NEW: on open (fresh, or reopening a rejected/in-progress application), show
// each upload card as "already on file" when a URL exists for it but no new file
// has been chosen yet in this session — matches the text-field prefill behaviour.
function markKycUploadCardsFromExisting(existing) {
    const fieldMap = {
        kycVehicleImg: 'vehicle_img', kycLicenseImg: 'license_img', kycInsuranceImg: 'insurance_img',
        kycSelfieImg: 'selfie_img', kycIdImg: 'id_img', kycBankDocImg: 'bank_doc_img', kycQrImg: 'qr_code_img'
    };
    Object.keys(fieldMap).forEach(inputId => {
        const input = document.getElementById(inputId);
        const card = input ? input.closest('.kyc-upload-card') : null;
        if (!card) return;
        const placeholder = card.querySelector('.kyc-upload-placeholder');
        const result = card.querySelector('.kyc-upload-result');
        const filenameEl = card.querySelector('.kyc-upload-filename');
        const previewImg = card.querySelector('.kyc-upload-preview');
        if (existing && existing[fieldMap[inputId]]) {
            card.classList.add('has-file');
            if (placeholder) placeholder.classList.add('hidden');
            if (result) result.classList.remove('hidden');
            if (filenameEl) filenameEl.textContent = 'Already uploaded';
            if (previewImg) { previewImg.src = existing[fieldMap[inputId]]; previewImg.classList.remove('hidden'); }
        } else {
            card.classList.remove('has-file');
            if (placeholder) placeholder.classList.remove('hidden');
            if (result) result.classList.add('hidden');
            if (previewImg) { previewImg.src = ''; previewImg.classList.add('hidden'); }
        }
    });
}

// ✅ NEW: lets the Android hardware/browser back button step back inside the
// wizard (or close it at step 1) instead of leaving the rider app entirely.
let _kycHistoryPushed = false;
window.addEventListener('popstate', function () {
    if (!_kycHistoryPushed) return; // nothing of ours to handle
    const wizard = document.getElementById('kycWizardPage');
    if (!wizard || wizard.classList.contains('hidden')) return;
    _kycHistoryPushed = false; // this pop consumes the entry we pushed
    if (kycCurrentStep > 1) {
        showKycStep(kycCurrentStep - 1);
        history.pushState({ kycModal: true }, ''); // stay one history slot "inside" the wizard
        _kycHistoryPushed = true;
    } else {
        closeKycWizardUIOnly();
    }
});
function closeKycWizardUIOnly() {
    const wizard = document.getElementById('kycWizardPage');
    if (wizard) wizard.classList.add('hidden');
    if (document.body) document.documentElement.style.overflowY = '';
    showRiderBottomNav();
    onKycWizardClosed();
}

function openKycWizard() {
    const existing = window._kycApplicationCache || null;
    window._kycDraft = { fields: {}, existing: existing || null };
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v === undefined || v === null) ? '' : v; };
    if (existing) {
        setVal('kycFirstName', existing.first_name);
        setVal('kycAge', existing.age);
        setVal('kycContactNo', existing.contact_no);
        setVal('kycWhatsappNo', existing.whatsapp_no);
        setVal('kycEmail', existing.email);
        setVal('kycAddress', existing.address);
        setVal('kycVehicleNo', existing.vehicle_no);
        setVal('kycLicenseNo', existing.license_no);
        setVal('kycIdType', existing.id_type);
        setVal('kycIdNo', existing.id_no);
        setVal('kycAccountNo', existing.account_no);
        setVal('kycIfscCode', existing.ifsc_code);
        setVal('kycBranch', existing.branch);
        setVal('kycUpiId', existing.upi_id);
        document.querySelectorAll('.kyc-vehicle-option').forEach(btn => btn.classList.remove('selected'));
        if (existing.vehicle_type) selectKycVehicle(existing.vehicle_type);
        if (existing.id_type) onKycIdTypeChange();
    } else {
        ['kycFirstName','kycAge','kycContactNo','kycWhatsappNo','kycEmail','kycAddress','kycVehicleNo','kycLicenseNo','kycIdNo','kycAccountNo','kycIfscCode','kycBranch','kycUpiId'].forEach(id => setVal(id, ''));
        setVal('kycIdType', '');
        document.querySelectorAll('.kyc-vehicle-option').forEach(btn => btn.classList.remove('selected'));
        const noRow = document.getElementById('kycVehicleNoRow'); if (noRow) noRow.style.display = '';
        const licenseFields = document.getElementById('kycLicenseFields'); if (licenseFields) licenseFields.classList.remove('hidden');
        const licenseSkipNote = document.getElementById('kycLicenseSkipNote'); if (licenseSkipNote) licenseSkipNote.classList.add('hidden');
    }
    window._kycRestoring = true; // restore শেষ না হওয়া পর্যন্ত খালি ফর্ম দিয়ে draft ওভাররাইট হবে না
    markKycUploadCardsFromExisting(existing);
    initKycUploadCards();
    showKycStep(1);
    openSubPage('kycWizardPage');
    hideRiderBottomNav();
    if (!_kycHistoryPushed) {
        history.pushState({ kycModal: true }, '');
        _kycHistoryPushed = true;
    }
    // ক্যামেরা/ফাইল পিকারের সময় memory বাঁচাতে লাইভ GPS সাময়িক বন্ধ (KYC approve না হওয়া পর্যন্ত অর্ডারও নেই)
    try { localStorage.setItem(KYC_WIZARD_OPEN_KEY, '1'); } catch (e) {}
    stopLiveLocationTracking();
    restoreKycDraft({ resumed: !!window._resumeKycWizard });
    window._resumeKycWizard = false;
}

function handleKycBannerTap() {
    const app = window._kycApplicationCache;
    const status = app ? app.status : 'not_submitted';
    if (status === 'pending') {
        showToast('Your application is under review. We will notify you once it is checked.', 'info');
        return;
    }
    openKycWizard();
}

// ✅ FIX: rider.html is now a single-file SPA (Home/Delivery/Earning/Profile are all
// sections of the same page), so this no longer needs to navigate anywhere — it just
// switches to the Profile tab and opens the wizard directly, same as handleKycBannerTap().
function goToKycFromHome() {
    const app = window._kycApplicationCache;
    const status = app ? app.status : 'not_submitted';
    if (status === 'pending') {
        showToast('Your KYC application is under review. We will notify you once it is checked.', 'info');
        return;
    }
    switchRiderTab('profile');
    openKycWizard();
}

async function uploadKycFile(inputId, folder) {
    const blob = window._kycFiles && window._kycFiles[inputId];
    if (!blob) return null;
    const riderId = currentRiderId || 'rider';
    const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };
    const ext = extMap[blob.type] || 'jpg';
    const filePath = `rider_docs/${riderId}/kyc/${folder}_${Date.now()}.${ext}`;
    const { error } = await supabaseClient.storage.from('media').upload(filePath, blob, { contentType: blob.type || 'image/jpeg' });
    if (error) throw error;
    const { data } = supabaseClient.storage.from('media').getPublicUrl(filePath);
    return data?.publicUrl || null;
}

async function submitKycApplication() {
    if (!supabaseClient) return;
    const btn = document.getElementById('kycSubmitBtn');
    if (btn) { btn.disabled = true; btn.innerText = 'Submitting...'; }
    try {
        const riderId = parseInt(currentRiderId) || parseInt(localStorage.getItem('riderId')) || null;
        if (!riderId) { showToast('Could not determine rider ID.', 'error'); return; }

        const existing = window._kycDraft.existing || {};
        const d = window._kycDraft.fields;

        // ✅ Submit এর আগে সব ধাপ আবার যাচাই — required লেখা ও required ছবি (vehicle, license*, selfie, ID, bank doc)
        // একটাও বাদ থাকলে সেই ধাপে ফিরিয়ে নিয়ে যাবে। (*bicycle/EV ছাড়া)
        for (let st = 1; st <= 5; st++) {
            const vErr = validateAndCollectStep(st);
            if (vErr) { showKycStep(st); showToast(vErr, 'error'); return; }
        }

        showToast('Uploading documents...', 'info');
        // একটা একটা করে আপলোড — ফোনে memory/network চাপ কম
        const up = {};
        for (const [inputId, folder] of Object.entries(KYC_FILE_FOLDERS)) {
            up[inputId] = await uploadKycFile(inputId, folder);
        }
        const vehicleImgUrl = up.kycVehicleImg, licenseImgUrl = up.kycLicenseImg, insuranceImgUrl = up.kycInsuranceImg,
              selfieImgUrl = up.kycSelfieImg, idImgUrl = up.kycIdImg, bankDocImgUrl = up.kycBankDocImg, qrImgUrl = up.kycQrImg;

        const payload = {
            rider_id: riderId,
            status: 'pending',
            rejection_reason: '',
            submitted_at: new Date().toISOString(),
            first_name: d.first_name,
            age: d.age,
            contact_no: d.contact_no,
            whatsapp_no: d.whatsapp_no || '',
            email: d.email || '',
            address: d.address,
            vehicle_type: d.vehicle_type,
            vehicle_img: vehicleImgUrl || existing.vehicle_img || '',
            vehicle_no: d.vehicle_no || '',
            license_img: licenseImgUrl || existing.license_img || '',
            license_no: d.license_no || '',
            insurance_img: insuranceImgUrl || existing.insurance_img || '',
            selfie_img: selfieImgUrl || existing.selfie_img || '',
            id_type: d.id_type,
            id_no: d.id_no,
            id_img: idImgUrl || existing.id_img || '',
            bank_doc_img: bankDocImgUrl || existing.bank_doc_img || '',
            account_no: d.account_no,
            ifsc_code: d.ifsc_code,
            branch: d.branch,
            upi_id: d.upi_id || '',
            qr_code_img: qrImgUrl || existing.qr_code_img || ''
        };

        const { error } = await supabaseClient
            .from('rider_kyc_application')
            .upsert(payload, { onConflict: 'rider_id' });
        if (error) {
            console.error('KYC SUBMIT ERROR:', { code: error.code, message: error.message, details: error.details, hint: error.hint });
            throw error;
        }

        showToast('✅ KYC application submitted! We will review it shortly.', 'success');
        await clearKycDraft(); // সফল submit — এখন draft মুছে ফেলা
        closeSubPage('kycWizardPage');
        await loadCurrentRiderProfileStatus();
    } catch (err) {
        showToast('Submission failed: ' + (err.message || err), 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = 'Submit Application'; }
    }
}

// ---------------- Read-only KYC views (approved / rejected review) ----------------
function kycReadRow(label, value) {
    return `<div class="kyc-preview-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value || '—')}</span></div>`;
}
function kycReadImg(url, alt) {
    return url ? `<img src="${escapeHtml(url)}" class="kyc-preview-img" alt="${escapeHtml(alt || '')}">` : '';
}

function openKycReadonly(section) {
    const app = window._kycApplicationCache;
    if (!app) { showToast('No KYC data found.', 'error'); return; }
    const titleEl = document.getElementById('kycReadonlyTitle');
    const bodyEl = document.getElementById('kycReadonlyBody');
    if (!bodyEl || !titleEl) return;

    const pillClass = app.status === 'approved' ? 'approved' : (app.status === 'rejected' ? 'rejected' : 'pending');
    const pillText = app.status === 'approved' ? 'Verified' : (app.status === 'rejected' ? 'Rejected' : 'Pending Review');
    let html = `<span class="kyc-readonly-status-pill ${pillClass}">${pillText}</span>`;
    if (app.rejection_reason) html += `<p style="color:#dc2626; font-size:0.82rem; margin:8px 0 14px;">Reason: ${escapeHtml(app.rejection_reason)}</p>`;

    const skipDoc = (app.vehicle_type === 'bicycle' || app.vehicle_type === 'ev');

    if (section === 'rider') {
        titleEl.innerText = 'Rider Details';
        html += `<div class="kyc-preview-section">
            ${kycReadRow('Name', app.first_name)}
            ${kycReadRow('Age', app.age)}
            ${kycReadRow('Contact', app.contact_no)}
            ${kycReadRow('WhatsApp', app.whatsapp_no)}
            ${kycReadRow('Email', app.email)}
            ${kycReadRow('Address', app.address)}
        </div>`;
    } else if (section === 'vehicle') {
        titleEl.innerText = 'Vehicle Details';
        html += `<div class="kyc-preview-section">
            ${kycReadRow('Type', app.vehicle_type)}
            ${skipDoc ? '' : kycReadRow('Vehicle No.', app.vehicle_no)}
        </div>${kycReadImg(app.vehicle_img, 'Vehicle')}`;
    } else if (section === 'license') {
        titleEl.innerText = 'License & Insurance';
        if (skipDoc) {
            html += `<p class="kyc-note">Not required for this vehicle type.</p>`;
        } else {
            html += `<div class="kyc-preview-section">${kycReadRow('License No.', app.license_no)}</div>${kycReadImg(app.license_img, 'License')}`;
        }
        if (app.insurance_img) html += kycReadImg(app.insurance_img, 'Insurance');
    } else if (section === 'identity') {
        titleEl.innerText = 'Identity';
        html += `<div class="kyc-preview-section">
            ${kycReadRow('ID Type', app.id_type)}
            ${kycReadRow('ID No.', app.id_no)}
        </div>${kycReadImg(app.selfie_img, 'Selfie')}${kycReadImg(app.id_img, 'ID')}`;
    } else if (section === 'banking') {
        titleEl.innerText = 'Bank & Payment';
        html += `<div class="kyc-preview-section">
            ${kycReadRow('Account No.', app.account_no)}
            ${kycReadRow('IFSC', app.ifsc_code)}
            ${kycReadRow('Branch', app.branch)}
            ${kycReadRow('UPI ID', app.upi_id)}
        </div>${kycReadImg(app.bank_doc_img, 'Bank Document')}`;
    }

    bodyEl.innerHTML = html;
    openSubPage('kycReadonlyPage');
}

// ---------------- Complaint ----------------
async function submitRiderComplaint() {
    const reasonEl = document.getElementById('complaintReasonInput');
    const subjectEl = document.getElementById('complaintSubjectInput');
    const messageEl = document.getElementById('complaintMessageInput');
    const reason = reasonEl ? reasonEl.value : '';
    const subject = subjectEl ? subjectEl.value.trim() : '';
    const message = messageEl ? messageEl.value.trim() : '';
    if (!reason) { showToast('Please select a reason.', 'error'); return; }
    if (!subject) { showToast('Please enter a subject.', 'error'); return; }
    if (!message) { showToast('Please describe your complaint.', 'error'); return; }
    if (!supabaseClient) return;
    try {
        const riderId = parseInt(currentRiderId) || parseInt(localStorage.getItem('riderId')) || null;
        if (!riderId) { showToast('Could not determine rider ID.', 'error'); return; }
        const { error } = await supabaseClient.from('rider_complaints').insert({ rider_id: riderId, reason, subject, message });
        if (error) throw error;
        showToast('Complaint submitted. Our team will get back to you soon.', 'success');
        if (reasonEl) reasonEl.value = '';
        if (subjectEl) subjectEl.value = '';
        if (messageEl) messageEl.value = '';
        closeSubPage('complaintPage');
    } catch (err) {
        showToast('Could not submit complaint: ' + (err.message || err), 'error');
    }
}

// ---------------- Delete account ----------------
function goToDeleteAccountConfirm() {
    const reasonEl = document.getElementById('deleteReasonInput');
    if (!reasonEl || !reasonEl.value) { showToast('Please select a reason.', 'error'); return; }
    const step1 = document.getElementById('deleteAccountStep1');
    const step2 = document.getElementById('deleteAccountStep2');
    if (step1) step1.classList.add('hidden');
    if (step2) step2.classList.remove('hidden');
}

async function confirmDeleteAccount() {
    if (!supabaseClient) return;
    try {
        const riderId = parseInt(currentRiderId) || parseInt(localStorage.getItem('riderId')) || null;
        const reasonEl = document.getElementById('deleteReasonInput');
        const reason = (reasonEl && reasonEl.value) || 'Not specified';
        if (riderId) {
            await supabaseClient.from('rider_account_deletion_requests').insert({ rider_id: riderId, reason });
        }
        showToast('Your account deletion request has been submitted.', 'info');
        if (supabaseClient.auth) await supabaseClient.auth.signOut();
        localStorage.clear();
        sessionStorage.clear();
        window.location.replace('home.html');
    } catch (err) {
        showToast('Could not process deletion request: ' + (err.message || err), 'error');
    }
}

// ✅ NEW: rider এর সব completed/delivered অর্ডারের delivery_charge যোগ করে Total Lifetime Income দেখানো
async function loadTotalLifetimeIncome(riderId) {
    const el = document.getElementById("totalLifetimeIncome");
    if (!el || !supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('orders')
            .select('delivery_charge')
            .eq('rider_id', riderId)
            .in('status', ['delivered', 'completed']);
        if (error) throw error;
        const total = (data || []).reduce((sum, o) => sum + (Number(o.delivery_charge) || 0), 0);
        el.innerText = `₹${total.toLocaleString('en-IN')}`;
    } catch (e) {
        el.innerText = "₹0";
    }
}

async function loadCurrentMerchantStatus() {

}