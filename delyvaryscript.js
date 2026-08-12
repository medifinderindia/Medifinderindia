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
async function safeUpdateRiderByAuthUser(authUserId, payload, { maxRetries = 6 } = {}) {
    if (!supabaseClient) throw new Error('Supabase client not initialized');
    if (!authUserId) throw new Error('Missing auth_user_id for riders update');

    let workingPayload = { ...payload };
    let attempts = 0;

    while (attempts <= maxRetries) {
        attempts++;
        const { data, error } = await supabaseClient
            .from('riders')
            .update(workingPayload)
            .eq('auth_user_id', authUserId)
            .select();

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
        } else if (!window.location.pathname.includes("index.html") && !session) {
            // Only redirect if there's truly no session after waiting

            window.location.replace("index.html");
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

    // Bottom nav active state
    initBottomNav();

    // ✅ NEW: হোম পেজ থেকে "Verify License" popup এর মাধ্যমে রিডাইরেক্ট হলে সরাসরি License সেকশন খুলে যাবে
    try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('open') === 'license' && typeof openSubPage === 'function') {
            setTimeout(() => openSubPage('licensePage'), 200);
        }
    } catch(e) {}

    // ✅ NEW: ব্রাউজার ব্যাকগ্রাউন্ডে থাকলেও নতুন অর্ডার নোটিফিকেশনের জন্য পারমিশন রিকোয়েস্ট
    requestBrowserNotificationPermission();

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

                showToast(`🔔 ${n.title || 'Notification'}: ${n.message || ''}`, 'info');
            })
            .subscribe();

        // ✅ NEW: rider_kyc টেবিলে admin কোনো ডকুমেন্ট verify/reject করলে — profile পেজ খোলা
        // থাকলে রিফ্রেশ ছাড়াই সাথে সাথে Pending → Verified/Rejected UI আপডেট হয়ে যাবে
        if (document.getElementById('vehicleStatusTag')) {
            if (window._kycRealtimeChannel) supabaseClient.removeChannel(window._kycRealtimeChannel);
            window._kycRealtimeChannel = supabaseClient
                .channel('rider-kyc-realtime')
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rider_kyc' }, payload => {
                    const myId = localStorage.getItem("riderId") || localStorage.getItem("rider_id");
                    if (payload.new.rider_id && String(payload.new.rider_id) !== String(myId)) return;
                    const wasVerified = payload.old ? payload.old.verified : null;
                    loadCurrentRiderProfileStatus();
                    if (payload.new.verified === true && wasVerified !== true) {
                        showToast("✅ Your KYC documents have been verified!", "success");
                    } else if (payload.new.rejection_reason && !wasVerified) {
                        showToast("⚠️ A KYC document was rejected — check Profile for details.", "error");
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
    try {
        const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 }));
        centerLat = pos.coords.latitude;
        centerLon = pos.coords.longitude;
        cachedRiderPosition = { lat: centerLat, lon: centerLon };
        gotGps = true;
    } catch(e) {}

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
        attribution: 'MediFinder Express Tracking' 
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
            showToast("Could not get your location: " + (err.message || err), "error");
            if (btn) btn.classList.remove("locating");
        },
        { enableHighAccuracy: true, timeout: 8000 }
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
    const isDeliveryPhase = (status === 'picked_up' || status === 'out_for_delivery');

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
                setTimeout(() => { window.location.href = "delyvaryhome.html"; }, 1500);
            } else if (payload.new.status === 'delivered') {
                showToast("Order marked as delivered!", "success");
                localStorage.removeItem("active_delivery_order");
                setTimeout(() => { window.location.href = "delyvaryearning.html"; }, 1500);
            } else if (activeOrderData && (payload.new.status === 'picked_up' || payload.new.status === 'out_for_delivery' || payload.new.status === 'arrived_at_store')) {
                // ✅ NEW: status অন্য কোনো ডিভাইস/সোর্স থেকে বদলালেও ETA phase ও step UI সিঙ্ক থাকবে
                activeOrderData.status = payload.new.status;
                localStorage.setItem("active_delivery_order", JSON.stringify(activeOrderData));
                renderDeliveryStatusStep(activeOrderData);
                updateLiveDistanceAndETA();
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
            const isBroadcastLike = (payload.new.status === 'broadcasted' || payload.new.status === 'shipped');
            if (isBroadcastLike && !payload.new.rider_id) {
                if (!isOnDuty) return;
                if (!document.getElementById(`order-${payload.new.order_id}`) && !isOrderRejectedByMe(payload.new.order_id)) {
                    renderAvailableOrder(payload.new);
                    fireNewOrderNotification(payload.new); // 🔴 merchant ship করার সাথে সাথেই notification
                }
            } else if (!isBroadcastLike) {
                const card = document.getElementById(`order-${payload.new.order_id}`);
                if (card) card.remove();
                checkIfOrdersEmpty();
                // ✅ NEW: অন্য রাইডার এই অর্ডার accept করলে (বা অর্ডারটা আর available না থাকলে),
                // এই অর্ডারের নোটিফিকেশনও নিজে থেকে সরিয়ে দেওয়া হয় — ম্যানুয়ালি ✕ করা লাগবে না
                removeOrderNotificationByOrderId(payload.new.order_id);
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
        if (isOnDuty) fetchPendingOrdersSnapshot();
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

    // ✅ NEW: Driving License verified না থাকলে Accept বাটন লক থাকবে, ক্লিক করলে popup + প্রোফাইলে রিডাইরেক্ট
    const canAccept = window._riderLicenseVerified === true;
    const acceptBtnHtml = canAccept
        ? `<button class="btn-accept" onclick="acceptOrder('${order.order_id}', '${encodeURIComponent(JSON.stringify(order))}')">Accept Request</button>`
        : `<button class="btn-accept btn-locked" onclick="showLicenseRequiredPopup()"><i class="fa-solid fa-lock"></i> Verify License</button>`;

    const cardHtml = `
        <div class="order-card" id="order-${order.order_id}">
            <div class="card-header">
                <span class="vehicle-tag bike"><i class="fa-solid fa-motorcycle"></i> ${order.vehicle_type ? order.vehicle_type.toUpperCase() : 'DELIVERY'}</span>
                <span class="parcel-number">Parcel ID: #${order.order_id}</span>
                <span class="earnings-amount">₹${order.delivery_charge || 45}</span>
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

// ✅ NEW: License verify ছাড়া অর্ডার accept করার চেষ্টা করলে এই popup দেখাবে, Confirm করলে প্রোফাইলের License অংশে নিয়ে যাবে
function showLicenseRequiredPopup() {
    const goToProfile = confirm("Please verify your Driving License before accepting delivery orders.\n\nGo to your Profile's License section now?");
    if (goToProfile) {
        window.location.href = "delyvaryprofile.html?open=license";
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
        showLicenseRequiredPopup();
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
        const updatePayload = { status: 'picked_up' };
        if (riderBigIntId) updatePayload.rider_id = riderBigIntId;

        const { error } = await supabaseClient
            .from('orders')
            .update(updatePayload)
            .eq('order_id', orderId);

        if (error) throw error;

        orderObj.status = 'picked_up';
        orderObj.rider_id = riderBigIntId || riderUuid;
        localStorage.setItem("active_delivery_order", JSON.stringify(orderObj));
        showToast("Order Accepted Successfully!", "success");
        window.location.href = "delyvaryorder.html";
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
                <div class="timer-badge" id="liveTimerBox" onclick="openOtpModal()" style="cursor:pointer; background:#fff2f2; padding:6px 12px; border-radius:20px; color:#e63946;">
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
                <div><span>Earnings: </span><strong style="color: #2ec4b6; font-size: 18px;">₹${order.delivery_charge || 45}</strong></div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    ${buildCallButtonHtml('Call Customer', custInfo.phone)}
                    <button id="otpVerifyTriggerBtn" onclick="openOtpModal()" style="background: #e63946; color:#fff; border:none; padding: 10px 18px; border-radius: 8px; font-weight:600; cursor:pointer;">Verify OTP</button>
                </div>
            </div>
        </div>`;
    renderDeliveryStatusStep(order); // ✅ NEW: কারেন্ট স্টেপ অনুযায়ী বাটন/OTP-লক রেন্ডার করা
    startDeliveryTimer(25);
}

function startDeliveryTimer(minutes) {
    let totalSeconds = minutes * 60;
    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
        const timerTextEl = document.getElementById("timerText");
        if (!timerTextEl) return;
        if (totalSeconds <= 0) {
            clearInterval(countdownTimer);
            timerTextEl.innerText = "Delayed!";
            return;
        }
        totalSeconds--;
        let mins = Math.floor(totalSeconds / 60);
        let secs = totalSeconds % 60;
        timerTextEl.innerText = `${mins}:${secs < 10 ? '0' : ''}${secs} Mins`;
    }, 1000);
}

// ==========================================
// 5B. NEW: পিকআপ স্ট্যাটাস টগল স্টেপ (Arrived at Store → Picked Up → OTP Unlock)
// ==========================================
function renderDeliveryStatusStep(order) {
    const stepBar = document.getElementById("statusStepBar");
    const otpBtn = document.getElementById("otpVerifyTriggerBtn");
    if (!stepBar) return;

    const status = order.status || 'accepted';

    if (status === 'arrived_at_store') {
        stepBar.innerHTML = `
            <button onclick="markOrderPickedUp()" style="width:100%; background:#3b82f6; color:#fff; border:none; padding:12px; border-radius:8px; font-weight:600; cursor:pointer;">
                <i class="fa-solid fa-box"></i> Medicine Packed / Mark Picked Up
            </button>`;
        lockOtpButton(otpBtn, true);
    } else if (status === 'picked_up' || status === 'out_for_delivery') {
        stepBar.innerHTML = `
            <div style="background:#dcfce7; color:#16a34a; padding:10px; border-radius:8px; text-align:center; font-weight:600;">
                <i class="fa-solid fa-circle-check"></i> Picked Up — Heading to Customer
            </div>`;
        lockOtpButton(otpBtn, false);
    } else {
        // ডিফল্ট: 'accepted' স্টেজ — এখনও ফার্মেসিতে পৌঁছায়নি
        stepBar.innerHTML = `
            <button onclick="markArrivedAtStore()" style="width:100%; background:#f59e0b; color:#fff; border:none; padding:12px; border-radius:8px; font-weight:600; cursor:pointer;">
                <i class="fa-solid fa-store"></i> Arrived at Pharmacy
            </button>`;
        lockOtpButton(otpBtn, true);
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
        const { error } = await supabaseClient.from('orders').update({ status: 'arrived_at_store' }).eq('order_id', activeOrderData.order_id);
        if (error) throw error;
        activeOrderData.status = 'arrived_at_store';
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
        const { error } = await supabaseClient.from('orders').update({ status: 'picked_up' }).eq('order_id', activeOrderData.order_id);
        if (error) throw error;
        activeOrderData.status = 'picked_up';
        localStorage.setItem("active_delivery_order", JSON.stringify(activeOrderData));
        renderDeliveryStatusStep(activeOrderData);
        updateLiveDistanceAndETA(); // ✅ পিকআপের পর টার্গেট এখন pharmacy থেকে customer এ বদলে যাবে
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
        showToast("You are now ON DUTY. New delivery requests will be visible again.", "info");
        fetchPendingOrdersSnapshot();
        startLiveLocationTracking();
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
            .in('status', ['broadcasted', 'shipped']); // ✅ FIX: merchant এর "Ship" বাটন আসলে status='shipped' সেট করে (না 'broadcasted'),
            // কিন্তু এই query আগে শুধু 'broadcasted' খুঁজত — ফলে merchant ship করলেও rider এর কাছে order কখনো আসত না।
            // এখন দুটো status-ই match করবে যাতে ship করা মাত্রই rider এর available orders list এ চলে আসে।
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
function startLiveLocationTracking() {
    if (!navigator.geolocation) {

        return;
    }
    if (!isOnDuty) return; // Off-Duty রাইডারের লোকেশন পাঠানো হবে না
    if (liveLocationInterval) return; // ইতিমধ্যে চলছে

    liveLocationInterval = setInterval(() => {
        if (!isOnDuty) return;
        navigator.geolocation.getCurrentPosition(
            (position) => {
                broadcastRiderLocation(position.coords.latitude, position.coords.longitude);
            },
            (err) => { showToast("GPS error: " + (err.message || err), "error"); },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
    }, 3000); // ✅ FIX: আগে ছিল 5000ms (৫ সেকেন্ড), স্পেক অনুযায়ী এখন প্রতি ৩ সেকেন্ডে GPS আপডেট হবে
}

function stopLiveLocationTracking() {
    if (liveLocationInterval) {
        clearInterval(liveLocationInterval);
        liveLocationInterval = null;
    }
}

async function broadcastRiderLocation(lat, lon) {
    if (!supabaseClient) return;
    cachedRiderPosition = { lat, lon }; // ✅ FIX: প্রতি টিকে সর্বশেষ GPS position ক্যাশে রাখা, distance/ETA হিসাবের জন্য
    try {
        // riders টেবিলে লাইভ লোকেশন আপডেট (এডমিন/ট্র্যাকিং প্যানেলের জন্য, সবসময় অন-ডিউটিতে)
        // ✅ FIX: email দিয়ে .eq('email', ...) 400/403 দিচ্ছিল — auth_user_id দিয়ে safeUpdateRiderByAuthUser()
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
            try {
                await safeUpdateRiderByAuthUser(user.id, { current_lat: lat, current_lon: lon, location_updated_at: new Date().toISOString() });
            } catch (err) {
                showToast("Location broadcast error: " + (err.message || err), "error");
            }
        }

        // সক্রিয় অর্ডার থাকলে orders টেবিলেও লাইভ পজিশন আপডেট (কাস্টমার/ফার্মেসি লাইভ দেখতে পারবে)
        const sessionOrder = localStorage.getItem("active_delivery_order");
        if (sessionOrder) {
            let order;
            try { order = JSON.parse(sessionOrder); } catch(e) { return; }
            const { error: orderErr } = await supabaseClient
                .from('orders')
                .update({ rider_lat: lat, rider_lon: lon, location_updated_at: new Date() })
                .eq('order_id', order.order_id);
            if (orderErr) {
                console.error("ORDER LOCATION UPDATE ERROR:", orderErr);
            }

            updateLiveRiderMarkerOnMap(lat, lon);
            updateLiveDistanceAndETA(); // ✅ GPS আপডেট হলেই distance/ETA স্বয়ংক্রিয়ভাবে কমবে বা বাড়বে
        }
    } catch (err) {
        showToast("Location broadcast error: " + (err.message || err), "error");
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
            body: `Parcel #${order.order_id} • ₹${order.delivery_charge || 45} • Tap to view`,
            icon: "1779304435608.png",
            tag: `order-${order.order_id}`
        });
        noti.onclick = () => {
            window.focus();
            window.location.href = "delyvaryhome.html";
        };
    } catch (e) {
        showToast("Browser notification error: " + (e.message || e), "error");
    }
}


function openOtpModal() {
    const otpModal = document.getElementById("otpModal");
    const otpFormContent = document.getElementById("otpFormContent");
    const successCheckmark = document.getElementById("successCheckmark");
    if (!otpModal || !otpFormContent || !successCheckmark) return;
    otpModal.classList.remove("hidden");
    otpFormContent.style.display = "block";
    successCheckmark.style.display = "none";
}

function closeOtpModal() {
    const otpModal = document.getElementById("otpModal");
    if (!otpModal) return;
    otpModal.classList.add("hidden");
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
    const successCheckmark = document.getElementById("successCheckmark");
    if (!otpInput || !otpFormContent || !successCheckmark) return;
    const enteredOtp = otpInput.value;
    const correctOtp = activeOrderData.delivery_secure_code || activeOrderData.customer_otp;
    if (!correctOtp) { showToast('No delivery code found for this order. Contact support.', 'error'); return; }

    if (enteredOtp !== correctOtp) {
        showToast("Incorrect OTP Code! Please provide a valid transaction security code.", "error");
        otpInput.value = "";
        otpInput.focus();
        return;
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
            // Already delivered previously — do NOT insert duplicate earning/history
            localStorage.removeItem("active_delivery_order");
            otpFormContent.style.display = "none";
            successCheckmark.style.display = "block";
            const successMsgEl = successCheckmark.querySelector('p');
            if (successMsgEl) successMsgEl.innerText = "This order was already marked delivered earlier.";
            showToast("This order was already delivered — no duplicate earning added.", "info");
            setTimeout(() => {
                closeOtpModal();
                window.location.href = "delyvaryearning.html";
            }, 1800);
            return;
        }

        // STEP 4: mark order as delivered
        const { error: updateErr } = await supabaseClient
            .from('orders')
            .update({ status: 'delivered', payment_status: 'Paid', updated_at: new Date().toISOString() })
            .eq('order_id', activeOrderData.order_id);
        if (updateErr) throw updateErr;

        // STEP 5 + 6: credit riders_wallet — upsert the single per-rider row,
        // guarding against double-crediting the exact same order (e.g. double click / retry)
        const amount = (orderRow.delivery_charge !== null && orderRow.delivery_charge !== undefined)
            ? Number(orderRow.delivery_charge)
            : Number(activeOrderData.delivery_charge || 45);

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

        // Everything succeeded — now show success UI and route to Earning page
        otpFormContent.style.display = "none";
        successCheckmark.style.display = "block";
        localStorage.removeItem("active_delivery_order");

        setTimeout(() => {
            closeOtpModal();
            showToast("Delivery Completed successfully! Payout added to Earning Wallet.", "success");
            window.location.href = "delyvaryearning.html";
        }, 2200);

    } catch (err) {
        // ✅ Never silently succeed on failure — revert UI so rider can retry
        if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.innerText = "Verify & Complete"; }
        otpFormContent.style.display = "block";
        successCheckmark.style.display = "none";
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
        if (!currentRiderId) return;
        const { data: deliveredOrders, error } = await supabaseClient.from('orders')
            .select('order_id, delivery_charge, updated_at')
            .eq('rider_id', currentRiderId)
            .eq('status', 'delivered')
            .order('updated_at', { ascending: false });
        if (error) throw error;
        window._riderWalletEntries = (deliveredOrders || []).map(o => ({
            order_id: o.order_id,
            amount_earned: o.delivery_charge || 0,
            created_at: o.updated_at
        }));
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

    // ✅ FIX (#7, #12): earnings/history are sourced from `orders` now (see
    // loadEarningsFromDB note on the riders_wallet unique(rider_id)
    // constraint), so the realtime listener follows `orders` UPDATE events
    // for this rider instead of riders_wallet — a delivery completing
    // (status → delivered) on this or another device updates Total
    // Earnings, History and the Profit graph without a manual refresh.
    if (supabaseClient && currentRiderId) {
        if (window._walletRealtimeChannel) supabaseClient.removeChannel(window._walletRealtimeChannel);
        window._walletRealtimeChannel = supabaseClient
            .channel('rider-earnings-realtime')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `rider_id=eq.${currentRiderId}` }, async () => {
                await loadEarningsFromDB();
                const activeEarnChip = document.querySelector('#earningsPeriodFilter .period-chip.active');
                const activeHistChip = document.querySelector('#historyPeriodFilter .period-chip.active');
                const activeProfitChip = document.querySelector('#profitPeriodFilter .period-chip.active');
                selectEarningsPeriod(activeEarnChip ? activeEarnChip.dataset.period : 'today');
                selectHistoryPeriod(activeHistChip ? activeHistChip.dataset.period : 'today');
                selectProfitPeriod(activeProfitChip ? activeProfitChip.dataset.period : 'today');
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

// ✅ REWRITE: আগে পুরো গ্রাফের একটাই স্ট্যাটিক রঙ (container class অনুযায়ী) থাকতো।
// এখন trade-ideas.com এর মতো real segment-by-segment রঙিন লাইন আঁকা হয় — যেই অংশটা
// আগের point থেকে বেড়েছে সেটা সবুজ, যেই অংশ কমেছে সেটা লাল। SVG সম্পূর্ণ ডাইনামিকভাবে
// পুনর্নির্মাণ করা হয় (fill area + rising/falling line segments + point dots)।
function renderProfitGraph(period) {
    const entries = getEntriesForPeriod(period);
    const [start, end] = getPeriodRange(period);

    // পুরো রেঞ্জটাকে সর্বোচ্চ ৭টা bucket এ ভাগ করা হয় (দিনভিত্তিক), যাতে ছোট/বড় যেকোনো period এ গ্রাফ পড়া যায়
    const totalMs = Math.max(1, end.getTime() - start.getTime());
    const bucketCount = Math.min(7, Math.max(2, Math.round(totalMs / 86400000)) || 2);
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

    // --- Fill area (হালকা শেড, পুরো কার্ভের নিচে) ---
    const fillD = `M0,30 L${pts.map(p => `${p.x},${p.y.toFixed(1)}`).join(' L')} L100,30 Z`;

    // --- প্রতিটা সেগমেন্ট আলাদাভাবে সবুজ/লাল রঙে আঁকা (আগেরটার চেয়ে বাড়লে সবুজ, কমলে লাল) ---
    let segmentsSvg = '';
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const rising = b.y <= a.y; // SVG y-axis উল্টো, তাই y কমা মানে value বাড়া
        const color = rising ? GREEN : RED;
        segmentsSvg += `<line x1="${a.x}" y1="${a.y.toFixed(1)}" x2="${b.x}" y2="${b.y.toFixed(1)}" stroke="${color}" stroke-width="2.4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
    }
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

function updateGraphTrend() {
    const svgPath = document.querySelector(".chart-svg path:nth-child(2)");
    const isPayoutRequested = localStorage.getItem("payout_requested_state") === "true";
    
    if (isPayoutRequested && svgPath) {
        svgPath.setAttribute("d", "M0,2 Q15,5 35,18 T75,25 T100,28");
        const alertStatus = document.querySelector(".trend-alert-status");
        if (alertStatus) alertStatus.innerHTML = `<i class="fa-solid fa-arrow-trend-down"></i> Payout Processed`;
        const trendGraph = document.getElementById("trendGraphContainer");
        if (trendGraph) trendGraph.className = "graph-box trend-down";
    } else {
        // ✅ NEW: আগে এখানে কিছুই হতো না, তাই "+12.4% vs yesterday" টেক্সটটা সবসময় হার্ডকোড
        // হয়েই থাকতো, আসল ডাটার সাথে কোনো সম্পর্ক ছিল না। এখন আজ বনাম গতকালের real
        // earnings তুলনা করে ব্যাজ ও গ্রাফের up/down স্টেট আপডেট হবে।
        const todayVal = parseFloat(localStorage.getItem('today_earnings')) || 0;
        const yesterdayVal = parseFloat(localStorage.getItem('yesterday_earnings')) || 0;
        const alertStatus = document.querySelector(".trend-alert-status");
        const trendGraph = document.getElementById("trendGraphContainer");
        if (alertStatus && trendGraph) {
            if (yesterdayVal <= 0 && todayVal <= 0) {
                alertStatus.innerHTML = `<i class="fa-solid fa-minus"></i> No data yet`;
                trendGraph.className = "graph-box trend-up";
            } else if (yesterdayVal <= 0) {
                alertStatus.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> New earnings today`;
                trendGraph.className = "graph-box trend-up";
            } else {
                const pctChange = ((todayVal - yesterdayVal) / yesterdayVal) * 100;
                const isUp = pctChange >= 0;
                trendGraph.className = isUp ? "graph-box trend-up" : "graph-box trend-down";
                alertStatus.innerHTML = `<i class="fa-solid fa-arrow-trend-${isUp ? 'up' : 'down'}"></i> ${isUp ? '+' : ''}${pctChange.toFixed(1)}% vs yesterday`;
                if (svgPath) {
                    svgPath.setAttribute("d", isUp ? "M0,22 Q15,8 35,18 T75,5 T100,2" : "M0,10 Q15,15 35,12 T75,22 T100,26");
                }
            }
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
async function handlePayoutRequest() {
    if (!supabaseClient) return;
    const payoutRequestBtn = document.getElementById("payoutRequestBtn");
    if (!payoutRequestBtn) return;

    if (payoutRequestBtn) { payoutRequestBtn.disabled = true; payoutRequestBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; }

    try {
        const { data: { session }, error: sessErr } = await supabaseClient.auth.getSession();
        if (sessErr) throw sessErr;
        if (!session?.user?.id) throw new Error("You're not logged in. Please log in again.");

        const { data: riderRow, error: riderErr } = await supabaseClient
            .from('riders').select('id').eq('auth_user_id', session.user.id).maybeSingle();
        if (riderErr) throw riderErr;
        if (!riderRow || !riderRow.id) throw new Error("Rider profile not found.");
        const riderBigIntId = riderRow.id;

        // STEP: read the actual eligible/unpaid balance from riders_wallet — never trust the UI text
        const { data: walletRow, error: walletErr } = await supabaseClient
            .from('riders_wallet').select('balance').eq('rider_id', riderBigIntId).maybeSingle();
        if (walletErr) throw walletErr;
        const totalAmount = Number(walletRow?.balance) || 0;

        if (totalAmount <= 0) {
            showToast("No earnings to withdraw. Complete deliveries first.", "error");
            return;
        }

        // STEP (#11): duplicate protection — block if a pending/approved request already exists
        const { data: existingRequests, error: existingErr } = await supabaseClient
            .from('admin_payout_requests').select('id, request_status').eq('rider_id', riderBigIntId);
        if (existingErr) throw existingErr;
        const hasOpenRequest = (existingRequests || []).some(r => {
            const s = (r.request_status || '').toLowerCase();
            return s === 'pending' || s === 'approved';
        });
        if (hasOpenRequest) {
            showToast("You already have a payout request being processed. Please wait for it to complete.", "error");
            return;
        }

        const { error } = await supabaseClient.from('admin_payout_requests').insert([{
            rider_id: riderBigIntId, total_payout_amount: totalAmount,
            active_duty_hours: Math.floor(riderActiveMinutes / 60).toString(), 
            request_status: 'pending', requested_at: new Date().toISOString()
        }]);
        if (error) throw error;

        showToast(`Payout of ₹${totalAmount} requested! Admin will review shortly.`, "success");
        initEarningsPage();
    } catch (err) {
        showToast("Payout request failed: " + (err.message || err), "error");
    } finally {
        if (payoutRequestBtn) { payoutRequestBtn.disabled = false; payoutRequestBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Request Payout to Admin'; }
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
            vehicle_plate: document.getElementById("vehiclePlateInput") ? document.getElementById("vehiclePlateInput").value : "",
            license_number: document.getElementById("licenseStringInput") ? document.getElementById("licenseStringInput").value : "",
            vehicle_type: document.getElementById("vehicleTypeSelector") ? document.getElementById("vehicleTypeSelector").value : "bike",
            bank_account: document.getElementById("bankAccountInput") ? document.getElementById("bankAccountInput").value : "",
            bank_name: document.getElementById("bankNameInput") ? document.getElementById("bankNameInput").value : "",
            account_number: document.getElementById("bankAccountNumberInput") ? document.getElementById("bankAccountNumberInput").value : "",
            branch_name: document.getElementById("bankBranchInput") ? document.getElementById("bankBranchInput").value : "",
            ifsc_code: document.getElementById("bankifscinput") ? document.getElementById("bankifscinput").value : "",
            upi_id: document.getElementById("upiIdInput") ? document.getElementById("upiIdInput").value : "",
            avatar_url: localStorage.getItem("rider_avatar") || ""
        };

        await safeUpdateRiderByAuthUser(user.id, payload);

    } catch (dbErr) {
        showToast("Profile save failed: " + (dbErr.message || dbErr), "error");
    }
}

// ✅ REWRITE: এখন Bank Name, Account Holder, Account Number, IFSC, Branch — সব লাগবে,
// এবং Passbook/Cancelled Cheque ছবি (max 200 KB) আপলোড না করলে Bank কখনো verify হওয়ার
// প্রসেসেই যাবে না (Pending Review এ সেট হবে না)।
async function verifyAndSubmitFinancials() {
    const bankNameInput = document.getElementById("bankNameInput");
    const bankAccountInput = document.getElementById("bankAccountInput");
    const bankAccountNumberInput = document.getElementById("bankAccountNumberInput");
    const bankifscinput = document.getElementById("bankifscinput");
    const bankBranchInput = document.getElementById("bankBranchInput");
    const passbookImageInput = document.getElementById("passbookImageInput");
    if (!bankNameInput || !bankAccountInput || !bankAccountNumberInput || !bankifscinput || !bankBranchInput) return;

    const bankName = bankNameInput.value.trim();
    const bankAccount = bankAccountInput.value.trim();
    const accountNumber = bankAccountNumberInput.value.trim();
    const ifsc = bankifscinput.value.trim();
    const branch = bankBranchInput.value.trim();

    if (bankName === "" || bankAccount === "" || accountNumber === "" || ifsc === "" || branch === "") {
        showToast("Please fill all bank details!", "error");
        return;
    }

    // ✅ Passbook ছবি ছাড়া bank verify হতে পারবে না
    // ✅ FIX: আগে 200 KB ম্যাক্স সাইজ লিমিট ছিল যেটা বেশিরভাগ ফোন ক্যামেরা ছবিতেই আটকে যেত —
    // এখন সেই ফিক্সড 200 KB লিমিট সম্পূর্ণ সরিয়ে দেওয়া হলো, যেকোনো সাইজের ছবি আপলোড করা যাবে।
    if (!passbookImageInput || !passbookImageInput.files || passbookImageInput.files.length === 0) {
        showToast("Please upload your Passbook / Cancelled Cheque photo. Bank details can't be verified without it.", "error");
        return;
    }
    const passbookFile = passbookImageInput.files[0];

    try {
        showToast("Uploading passbook photo...", "info");
        const filePath = `rider_docs/${currentRiderId || 'rider'}_passbook_${Date.now()}_${passbookFile.name}`;
        const { error: uploadError } = await supabaseClient.storage.from('media').upload(filePath, passbookFile);
        if (uploadError) {
            showToast("Passbook upload failed: " + uploadError.message, "error");
            return;
        }
        const { data: urlData } = supabaseClient.storage.from('media').getPublicUrl(filePath);
        const passbookUrl = urlData?.publicUrl || '';

        await saveRiderProfileToDatabase();

        // ✅ FIX: email দিয়ে .eq('email', ...) 400/403 দিচ্ছিল — auth_user_id দিয়ে safeUpdateRiderByAuthUser()
        const { data: { user: passbookUser } } = await supabaseClient.auth.getUser();
        if (passbookUser) {
            await safeUpdateRiderByAuthUser(passbookUser.id, { passbook_url: passbookUrl });
        }

        // ✅ Passbook সহ সব ডিটেইলস জমা পড়লেই "Pending Review" এ যাবে
        await markBankDetailsPendingReview();

        showToast("Financial configurations saved! Bank details are now under review.", "success");
        closeSubPage('payoutConfigPage');
        await loadCurrentRiderProfileStatus();
    } catch (err) {
        showToast("Bank details save failed: " + (err.message || err), "error");
    }
}

async function markBankDetailsPendingReview() {
    if (!supabaseClient) return;
    try {
        // ✅ FIX: email দিয়ে .eq('email', ...) 400/403 দিচ্ছিল — auth_user_id দিয়ে safeUpdateRiderByAuthUser()
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;
        await safeUpdateRiderByAuthUser(user.id, { bank_verified: false, bank_rejection_reason: '' });
    } catch (err) {
        // silent — non-critical status flag, error already logged in safeUpdateRiderByAuthUser
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

// ==========================================
// ✅ VEHICLE KYC — spec sections 1–14 (Vehicle Verification exact screenshot flow)
// ==========================================
//
// Source of truth: rider_kyc.plate_no / rider_kyc.plate_img / rider_kyc.vehicle_img
// (rider_kyc.rider_id -> riders.id, resolved via auth_user_id, never email/guessed columns).
//
// sendKycToAdmin() below already:
//  - resolves the existing rider_kyc row for this rider_id (one shared row per rider)
//  - UPDATEs it in place on resubmission (no duplicate row created), or INSERTs once if none exists
//  - always resets verified=false and rejection_reason='' on a fresh submission (Pending Review)
// This satisfies spec §3 (submit), §5 (edit/resubmit updates the same row), §8 (reject → edit →
// resubmit clears rejection_reason and returns to Pending), and §18-L (no duplicate rider_kyc rows).
async function sendKycToAdmin(type, payloadData) {
    if (!supabaseClient) return;
    try {
        const riderId = parseInt(currentRiderId) || 0;
        const nameEl = document.getElementById("profileDisplayName");
        const name = nameEl ? nameEl.innerText : '';
        
        const { data: existingData, error: fetchErr } = await supabaseClient
            .from('rider_kyc')
            .select('id, license_no, license_img, plate_no, plate_img, vehicle_img, aadhaar_no, aadhaar_img, pan_no, pan_img')
            .eq('rider_id', riderId)
            .maybeSingle();
        if (fetchErr) {
            console.error("RIDER_KYC FETCH ERROR:", fetchErr);
            throw fetchErr;
        }

        let query;
        if (existingData) {
            const updatePayload = {
                name: name,
                verified: false,
                rejection_reason: ''
            };
            if (type === 'Vehicle_Plate') {
                updatePayload.plate_no = payloadData.plate || existingData.plate_no;
                updatePayload.plate_img = payloadData.plate_img || existingData.plate_img;
                updatePayload.vehicle_img = payloadData.plate_img || existingData.vehicle_img;
            } else if (type === 'Driver_License' || type === 'License') {
                updatePayload.license_no = payloadData.license_no || existingData.license_no;
                updatePayload.license_img = payloadData.license_img || existingData.license_img;
            } else if (type === 'Aadhaar') {
                updatePayload.aadhaar_no = payloadData.aadhaar_no || existingData.aadhaar_no;
                updatePayload.aadhaar_img = payloadData.aadhaar_img || existingData.aadhaar_img;
            } else if (type === 'PAN') {
                updatePayload.pan_no = payloadData.pan_no || existingData.pan_no;
                updatePayload.pan_img = payloadData.pan_img || existingData.pan_img;
            }
            query = supabaseClient.from('rider_kyc').update(updatePayload).eq('id', existingData.id);
        } else {
            const insertPayload = {
                rider_id: riderId,
                name: name,
                verified: false,
                license_no: '',
                license_img: '',
                plate_no: '',
                plate_img: '',
                vehicle_img: '',
                aadhaar_no: '',
                aadhaar_img: '',
                pan_no: '',
                pan_img: ''
            };
            if (type === 'Vehicle_Plate') {
                insertPayload.plate_no = payloadData.plate || '';
                insertPayload.plate_img = payloadData.plate_img || '';
                insertPayload.vehicle_img = payloadData.plate_img || '';
            } else if (type === 'Driver_License' || type === 'License') {
                insertPayload.license_no = payloadData.license_no || '';
                insertPayload.license_img = payloadData.license_img || '';
            } else if (type === 'Aadhaar') {
                insertPayload.aadhaar_no = payloadData.aadhaar_no || '';
                insertPayload.aadhaar_img = payloadData.aadhaar_img || '';
            } else if (type === 'PAN') {
                insertPayload.pan_no = payloadData.pan_no || '';
                insertPayload.pan_img = payloadData.pan_img || '';
            }
            query = supabaseClient.from('rider_kyc').insert([insertPayload]);
        }

        const { error } = await query;
        if (error) {
            console.error("RIDER_KYC SAVE ERROR:", { code: error.code, message: error.message, details: error.details, hint: error.hint });
            throw error;
        }

        // ✅ FIX: email দিয়ে না, auth_user_id দিয়ে riders.is_verified reset করা হচ্ছে —
        // এটাও আগে .eq('id', riderId) ব্যবহার করত যেটা ঠিকই ছিল (riders.id বৈধ bigint PK),
        // তাই এটা অপরিবর্তিত রাখা হলো, শুধু error visibility যোগ করা হলো।
        const { error: verErr } = await supabaseClient.from('riders').update({ is_verified: false }).eq('id', riderId);
        if (verErr) console.error("RIDERS.is_verified UPDATE ERROR:", verErr);
    } catch (err) {
        console.error("KYC SUBMISSION ERROR:", err);
        showToast("KYC submission error: " + (err.message || err), "error");
    }
}

// ✅ FIX (spec §12, §13): transport-mode value stored in DB stays exactly
// 'bike' | 'van' | 'truck' (the <select> already only offers those three
// values, so no mapping needed here — UI labels are handled by the
// <option> text itself: "Motorcycle / Scooter / EV", "Van", "Truck").
// Plate number is trimmed + uppercased before validation/storage, and a
// basic Indian-plate shape check blocks obviously invalid input while
// staying compatible with formats like "WB24AB1234" or "WB-24-AB-1234".
function normalizeAndValidatePlate(raw) {
    if (!raw) return { valid: false, value: '' };
    // Strip spaces/hyphens for the shape check, but keep a clean
    // hyphenated display value for what actually gets stored.
    const compact = raw.trim().toUpperCase().replace(/[\s\-]+/g, '');
    // Indian plate shape: 2 letters (state), 1-2 digits (RTO), 1-3 letters (series, optional), 4 digits (number)
    const shapeOk = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(compact);
    if (!shapeOk) return { valid: false, value: raw.trim().toUpperCase() };
    // Rebuild a consistent hyphenated display form: STATE-RTO-SERIES-NUMBER
    const m = compact.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{4})$/);
    const display = m ? [m[1], m[2], m[3], m[4]].filter(Boolean).join('-') : compact;
    return { valid: true, value: display };
}

// ✅ REWRITE (spec §1–§3, §13, §14): validates plate + image, uploads to
// the existing `media` bucket, resolves the current rider via
// auth_user_id -> riders.id (never email), saves to rider_kyc (source of
// truth for vehicle KYC), and — only if riders.vehicle_plate / vehicle_type
// actually exist on this installation — syncs them too (handled safely by
// safeUpdateRiderByAuthUser inside saveRiderProfileToDatabase, which drops
// unknown columns instead of failing).
async function runOnlinePlateValidationCheck() {
    const vehiclePlateInput = document.getElementById("vehiclePlateInput");
    const fileInput = document.getElementById("plateImageInput");
    if (!vehiclePlateInput) return;

    // STEP 1: validate plate number (trim + uppercase + shape check)
    const plateCheck = normalizeAndValidatePlate(vehiclePlateInput.value);
    if (!vehiclePlateInput.value || !vehiclePlateInput.value.trim()) {
        showToast("Plate empty.", "error");
        return;
    }
    if (!plateCheck.valid) {
        showToast("Please enter a valid registration plate (e.g., WB-24-AB-1234).", "error");
        return;
    }
    const plateInput = plateCheck.value;
    vehiclePlateInput.value = plateInput; // reflect normalized display value back into the input

    const typeInput = document.getElementById("vehicleTypeSelector") ? document.getElementById("vehicleTypeSelector").value : "bike";

    // STEP 2: validate image exists
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showToast("Please upload vehicle plate image.", "error");
        return;
    }

    try {
        // STEP 3: upload image to existing Supabase Storage bucket `media`
        const file = fileInput.files[0];
        const filePath = `rider_docs/${currentRiderId || 'rider'}_plate_${Date.now()}_${file.name}`;

        showToast("Uploading plate image...", "info");
        const { error: uploadError } = await supabaseClient.storage
            .from('media')
            .upload(filePath, file);

        if (uploadError) {
            console.error("PLATE IMAGE UPLOAD ERROR:", uploadError);
            showToast("Plate upload failed: " + uploadError.message, "error");
            return;
        }

        // STEP 4: get public URL
        const { data: urlData } = supabaseClient.storage.from('media').getPublicUrl(filePath);
        const publicUrl = urlData?.publicUrl || '';

        // STEP 5 + 6: current authenticated rider -> riders.auth_user_id -> riders.id
        // (currentRiderId is kept in sync with riders.id by loadCurrentRiderProfileStatus(),
        // and sendKycToAdmin() below resolves rider_kyc against that same riders.id.)

        // STEP 7: save/update rider_kyc (plate_no / plate_img / vehicle_img / verified=false)
        await sendKycToAdmin('Vehicle_Plate', { plate: plateInput, vehicle_type: typeInput, plate_img: publicUrl });

        // Sync riders.vehicle_plate / riders.vehicle_type too, if those columns exist
        // on this installation — saveRiderProfileToDatabase()/safeUpdateRiderByAuthUser()
        // silently drops any column PostgREST reports as unknown, so this never breaks
        // the KYC submission itself.
        await saveRiderProfileToDatabase();

        // STEP 8: submission successful -> Pending Review, form hides, locked view shows
        showToast("Vehicle plate documents submitted for KYC review!", "success");
        const vehicleEditFormEl = document.getElementById('vehicleEditForm');
        if (vehicleEditFormEl) vehicleEditFormEl.dataset.userEditing = 'false';
        await loadCurrentRiderProfileStatus();
    } catch (err) {
        console.error("VEHICLE DOCUMENT SAVE ERROR:", err);
        showToast("Error saving vehicle documents: " + (err.message || err), "error");
    }
}

async function runGovLicenseVerificationQuery() {
    const licenseStringInput = document.getElementById("licenseStringInput");
    const fileInput = document.getElementById("licenseImageInput");
    if (!licenseStringInput) return;
    const licenseInput = licenseStringInput.value.trim();
    if (licenseInput === "") { showToast("License empty.", "error"); return; }
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showToast("Please upload license image.", "error");
        return;
    }

    try {
        const file = fileInput.files[0];
        const filePath = `rider_docs/${currentRiderId || 'rider'}_license_${Date.now()}_${file.name}`;
        
        showToast("Uploading license image...", "info");
        const { error: uploadError } = await supabaseClient.storage
            .from('media')
            .upload(filePath, file);

        if (uploadError) {
            showToast("License upload failed: " + uploadError.message, "error");
            return;
        }

        const { data: urlData } = supabaseClient.storage.from('media').getPublicUrl(filePath);
        const publicUrl = urlData?.publicUrl || '';

        await sendKycToAdmin('Driver_License', { license_no: licenseInput, license_img: publicUrl });
        await saveRiderProfileToDatabase();
        showToast("Driver license submitted for KYC review!", "success");
        const licenseEditFormEl = document.getElementById('licenseEditForm');
        // ✅ FIX: আগের মতো sub-page বন্ধ করে দেওয়া হয় না — এখানেই locked view (image + no. + Cancel/Edit) দেখাবে
        if (licenseEditFormEl) licenseEditFormEl.dataset.userEditing = 'false';
        await loadCurrentRiderProfileStatus();
    } catch (err) {
        showToast("Error saving license documents: " + err.message, "error");
    }
}

// ✅ NEW: Aadhaar Card KYC submission — License এর মতোই প্যাটার্ন, rider_kyc টেবিলে aadhaar_no/aadhaar_img সেভ হয়
async function runAadhaarVerificationQuery() {
    const aadhaarStringInput = document.getElementById("aadhaarStringInput");
    const fileInput = document.getElementById("aadhaarImageInput");
    if (!aadhaarStringInput) return;
    const aadhaarInput = aadhaarStringInput.value.trim();
    if (aadhaarInput === "") { showToast("Aadhaar number empty.", "error"); return; }
    if (!/^\d{12}$/.test(aadhaarInput.replace(/\s/g, ''))) {
        showToast("Please enter a valid 12-digit Aadhaar number.", "error");
        return;
    }
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showToast("Please upload Aadhaar card image.", "error");
        return;
    }

    try {
        const file = fileInput.files[0];
        const filePath = `rider_docs/${currentRiderId || 'rider'}_aadhaar_${Date.now()}_${file.name}`;

        showToast("Uploading Aadhaar image...", "info");
        const { error: uploadError } = await supabaseClient.storage.from('media').upload(filePath, file);
        if (uploadError) {
            showToast("Aadhaar upload failed: " + uploadError.message, "error");
            return;
        }

        const { data: urlData } = supabaseClient.storage.from('media').getPublicUrl(filePath);
        const publicUrl = urlData?.publicUrl || '';

        await sendKycToAdmin('Aadhaar', { aadhaar_no: aadhaarInput, aadhaar_img: publicUrl });
        showToast("Aadhaar submitted for KYC review!", "success");
        const aadhaarEditFormEl = document.getElementById('aadhaarEditForm');
        // ✅ FIX: sub-page বন্ধ না করে locked view (image + no. + Cancel/Edit) এখানেই দেখানো হবে
        if (aadhaarEditFormEl) aadhaarEditFormEl.dataset.userEditing = 'false';
        await loadCurrentRiderProfileStatus();
    } catch (err) {
        showToast("Error saving Aadhaar documents: " + (err.message || err), "error");
    }
}

// ✅ NEW: PAN Card KYC submission — একই প্যাটার্ন, rider_kyc টেবিলে pan_no/pan_img সেভ হয়
async function runPanVerificationQuery() {
    const panStringInput = document.getElementById("panStringInput");
    const fileInput = document.getElementById("panImageInput");
    if (!panStringInput) return;
    const panInput = panStringInput.value.trim().toUpperCase();
    if (panInput === "") { showToast("PAN number empty.", "error"); return; }
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(panInput)) {
        showToast("Please enter a valid PAN number (e.g., ABCDE1234F).", "error");
        return;
    }
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showToast("Please upload PAN card image.", "error");
        return;
    }

    try {
        const file = fileInput.files[0];
        const filePath = `rider_docs/${currentRiderId || 'rider'}_pan_${Date.now()}_${file.name}`;

        showToast("Uploading PAN image...", "info");
        const { error: uploadError } = await supabaseClient.storage.from('media').upload(filePath, file);
        if (uploadError) {
            showToast("PAN upload failed: " + uploadError.message, "error");
            return;
        }

        const { data: urlData } = supabaseClient.storage.from('media').getPublicUrl(filePath);
        const publicUrl = urlData?.publicUrl || '';

        await sendKycToAdmin('PAN', { pan_no: panInput, pan_img: publicUrl });
        showToast("PAN card submitted for KYC review!", "success");
        const panEditFormEl = document.getElementById('panEditForm');
        // ✅ FIX: sub-page বন্ধ না করে locked view (image + no. + Cancel/Edit) এখানেই দেখানো হবে
        if (panEditFormEl) panEditFormEl.dataset.userEditing = 'false';
        await loadCurrentRiderProfileStatus();
    } catch (err) {
        showToast("Error saving PAN documents: " + (err.message || err), "error");
    }
}

// Global safe closeSubPage function
function closeSubPage(pageId) {
    const pageElement = document.getElementById(pageId);
    if (pageElement) {
        pageElement.classList.add('hidden');
        if (document.body) {
            document.body.style.overflow = 'auto';
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
function renderNotiItemHtml(n) {
    return `<div class="noti-item ${n.is_read ? 'read' : 'unread'}" data-noti-id="${n.id}" ${n.order_id ? `data-order-id="${n.order_id}"` : ''} onclick="markNotificationAsRead(${n.id}, this)">
        <button class="noti-cross-btn" title="Remove" onclick="event.stopPropagation(); deleteNotification(${n.id}, this)"><i class="fa-solid fa-xmark"></i></button>
        <p><strong>${escapeHtml(n.title) || 'Notification'}</strong></p>
        <p>${escapeHtml(n.message) || ''}</p>
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
function openSubPage(pageId) { const el = document.getElementById(pageId); if (!el) return; el.classList.remove('hidden'); if(document.body) document.body.style.overflow = 'hidden'; }

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

async function processGlobalLogout() {
    showConfirmationModal("Are you sure you want to logout?", async () => {
        try {
            if (supabaseClient?.auth) await supabaseClient.auth.signOut();
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace("index.html");
        } catch (err) {
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace("index.html");
        }
    });
}

// Bottom nav active state
function initBottomNav() {
    const currentPage = window.location.pathname.split('/').pop();
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        const href = item.getAttribute('href');
        if (href && href.includes(currentPage)) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// ✅ NEW: KYC ডকুমেন্ট আপলোডের পর আর সরাসরি upload ফর্ম না দেখিয়ে, আগে যা সাবমিট করা হয়েছিল
// তার লক করা প্রিভিউ (status + image + number) দেখায়। শুধু "Edit" চাপলেই ফর্ম খোলে।
// prefix: 'vehicle' | 'license' | 'aadhaar' | 'pan'
function applyKycLockUI(prefix, { hasKyc, verified, reason, imgUrl, numberLabel, numberValue }) {
    const lockedView = document.getElementById(prefix + 'LockedView');
    const editForm = document.getElementById(prefix + 'EditForm');
    const badge = document.getElementById(prefix + 'LockedStatusBadge');
    const img = document.getElementById(prefix + 'LockedImg');
    const reasonEl = document.getElementById(prefix + 'LockedReason');
    if (!lockedView || !editForm) return;

    // যদি এখনো কিছু সাবমিটই না করে থাকে, তাহলে সরাসরি upload ফর্ম দেখাও
    if (!hasKyc) {
        lockedView.classList.add('hidden');
        lockedView.style.display = 'none';
        editForm.classList.remove('hidden');
        editForm.style.display = '';
        return;
    }

    // ইউজার যদি এইমাত্র "Edit" চেপে থাকে (এই সেশনে), তাহলে ফর্ম খোলা রাখো — জোর করে লক করে দিও না
    if (editForm.dataset.userEditing === 'true') return;

    // ✅ FIX: শুধু inline style নয়, class দিয়েও জোর করে হাইড করা হচ্ছে — যাতে কোনো race
    // condition বা stale render-এ Edit Form ও Locked View একসাথে দেখা না যায়
    lockedView.classList.remove('hidden');
    lockedView.style.display = '';
    editForm.classList.add('hidden');
    editForm.style.display = 'none';
    editForm.dataset.userEditing = 'false';

    if (badge) {
        badge.classList.remove('verified', 'rejected');
        if (verified) {
            badge.textContent = 'Verified'; badge.classList.add('verified');
            badge.style.background = '#dcfce7'; badge.style.color = '#16a34a';
        } else if (reason) {
            badge.textContent = 'Rejected'; badge.classList.add('rejected');
            badge.style.background = '#fee2e2'; badge.style.color = '#dc2626';
        } else {
            badge.textContent = 'Pending Review';
            badge.style.background = '#fef3c7'; badge.style.color = '#d97706';
        }
    }
    if (img) {
        // ✅ FIX (spec §14): never leave a broken <img>. If no URL is stored, hide the
        // element and show a text placeholder instead of a broken image icon.
        let placeholder = document.getElementById(prefix + 'LockedImgPlaceholder');
        if (imgUrl) {
            img.src = imgUrl;
            img.style.display = '';
            img.onerror = () => {
                img.style.display = 'none';
                if (!placeholder) {
                    placeholder = document.createElement('p');
                    placeholder.id = prefix + 'LockedImgPlaceholder';
                    placeholder.style.cssText = 'text-align:center;color:#94a3b8;font-size:0.82rem;margin-bottom:12px;';
                    placeholder.textContent = 'Plate image unavailable';
                    img.insertAdjacentElement('afterend', placeholder);
                }
                placeholder.style.display = '';
            };
            if (placeholder) placeholder.style.display = 'none';
        } else {
            img.style.display = 'none';
            if (!placeholder) {
                placeholder = document.createElement('p');
                placeholder.id = prefix + 'LockedImgPlaceholder';
                placeholder.style.cssText = 'text-align:center;color:#94a3b8;font-size:0.82rem;margin-bottom:12px;';
                placeholder.textContent = 'Plate image unavailable';
                img.insertAdjacentElement('afterend', placeholder);
            }
            placeholder.style.display = '';
        }
    }
    const numberEl = document.getElementById(prefix + 'Locked' + numberLabel);
    if (numberEl) numberEl.textContent = numberValue || '—';
    if (reasonEl) {
        if (reason) { reasonEl.textContent = 'Rejection reason: ' + reason; reasonEl.style.display = ''; }
        else { reasonEl.style.display = 'none'; }
    }

    // ✅ NEW: একবার admin approve করে "Verified" হয়ে গেলে আর Edit/Cancel KYC বাটন কোনোটাই
    // দেখানো হবে না — শুধু ছবি আর status-ই দেখাবে (pure View Mode), রাইডার আর নিজে থেকে বদলাতে পারবে না।
    const editBtn = document.getElementById(prefix + 'LockedEditBtn');
    const cancelBtn = document.getElementById(prefix + 'LockedCancelBtn');
    if (editBtn) editBtn.style.display = verified ? 'none' : '';
    if (cancelBtn) cancelBtn.style.display = verified ? 'none' : '';
}

// "Edit" বাটনে ক্লিক করলে লক করা ভিউ থেকে upload ফর্মে যাওয়া
function enableKycEdit(prefix) {
    const lockedView = document.getElementById(prefix + 'LockedView');
    const editForm = document.getElementById(prefix + 'EditForm');
    if (lockedView) { lockedView.classList.add('hidden'); lockedView.style.display = 'none'; }
    if (editForm) {
        editForm.classList.remove('hidden');
        editForm.style.display = '';
        editForm.dataset.userEditing = 'true'; // পরের রিফ্রেশে আবার জোর করে লক না হয়ে যায়
    }
}

// ✅ NEW: Edit ফর্মের পাশের "Cancel" বাটন — কোনো কিছু সেভ না করেই DB-এর আসল অবস্থা অনুযায়ী
// আবার সঠিক ভিউতে (locked/edit) ফিরিয়ে দেয় — আগে থেকে কিছু সাবমিট করা থাকলে locked view,
// নাহলে upload ফর্মই থেকে যাবে (খালি locked view দেখাবে না)
function cancelKycEdit(prefix) {
    const editForm = document.getElementById(prefix + 'EditForm');
    if (editForm) editForm.dataset.userEditing = 'false';
    loadCurrentRiderProfileStatus();
}

// ✅ NEW: "Cancel KYC" — Pending/Rejected অবস্থায় থাকা একটা নির্দিষ্ট ডকুমেন্ট (vehicle/license/
// aadhaar/pan) সম্পূর্ণ ডিলিট করে দেয় (rider_kyc row থেকে শুধু সেই ডকুমেন্টের no./image কলাম
// null করা হয়, বাকি ৩টা ডকুমেন্টের ডেটা অক্ষত থাকে — কারণ rider_kyc একটাই shared row)।
// এর ফলে Admin Panel থেকেও সেই ডকুমেন্ট চলে যাবে এবং rider app এ আবার Upload Document ফর্ম দেখাবে।
//
// ✅ FIX (spec §6): only a PENDING submission may be cancelled this way — a
// verified/approved document must never be wiped by accident. If the
// document is already Verified, cancellation is blocked with a clear
// message instead of silently deleting approved data.
const KYC_CANCEL_FIELDS = {
    vehicle: { plate_no: null, plate_img: null, vehicle_img: null },
    license: { license_no: null, license_img: null },
    aadhaar: { aadhaar_no: null, aadhaar_img: null },
    pan: { pan_no: null, pan_img: null }
};
const KYC_CANCEL_LABELS = {
    vehicle: 'Vehicle/Plate KYC',
    license: 'Driving License KYC',
    aadhaar: 'Aadhaar KYC',
    pan: 'PAN Card KYC'
};
async function cancelKycSubmission(prefix) {
    if (!supabaseClient) return;
    const fields = KYC_CANCEL_FIELDS[prefix];
    if (!fields) return;

    try {
        const riderId = parseInt(currentRiderId) || parseInt(localStorage.getItem('riderId')) || null;
        if (!riderId) { showToast("Could not determine rider ID.", "error"); return; }

        // ✅ FIX (spec §6): re-check current verified status from DB right before cancelling —
        // never trust stale DOM state — and refuse to cancel an already-Verified submission.
        const { data: currentKyc, error: kycFetchErr } = await supabaseClient
            .from('rider_kyc').select('verified').eq('rider_id', riderId).maybeSingle();
        if (kycFetchErr) {
            console.error("RIDER_KYC STATUS CHECK ERROR:", kycFetchErr);
            showToast("Could not check current status: " + kycFetchErr.message, "error");
            return;
        }
        if (currentKyc && currentKyc.verified === true) {
            showToast("This document is already Verified and can't be cancelled.", "error");
            return;
        }

        const confirmed = confirm(`Cancel your ${KYC_CANCEL_LABELS[prefix] || prefix + ' KYC'} submission? This will permanently delete it and you'll need to upload again.`);
        if (!confirmed) return;

        const { error } = await supabaseClient.from('rider_kyc').update(fields).eq('rider_id', riderId);
        if (error) {
            console.error("RIDER_KYC CANCEL ERROR:", { code: error.code, message: error.message, details: error.details, hint: error.hint });
            throw error;
        }

        const editForm = document.getElementById(prefix + 'EditForm');
        if (editForm) editForm.dataset.userEditing = 'false';

        showToast("KYC submission cancelled. You can upload again anytime.", "info");
        await loadCurrentRiderProfileStatus();
    } catch (err) {
        showToast("Cancel KYC failed: " + (err.message || err), "error");
    }
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
    if (window.location.pathname.includes('index.html')) return; 
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

        // ✅ FIX: আগে row না পেলে (data null) পুরো ফাংশনটাই সাথে সাথে থেমে যেত — মানে
        // profileDisplayName, profileDisplayUsername, KYC status badge কিছুই আপডেট হতো না,
        // static placeholder ("Rider", "@...", "Unverified") আটকে থাকত। এখন ensureRiderDbRow()
        // লগইনের সময়ই row গ্যারান্টি করে, তবু কোনো race condition/error হলেও নিচের কোডটা
        // session থেকে fallback নাম দেখিয়ে চালিয়ে যাবে, পুরোপুরি থেমে যাবে না।
        if (error) {
            console.error("RIDERS FETCH ERROR:", { code: error.code, message: error.message, details: error.details, hint: error.hint });
            return;
        }
        // ✅ এই মুহূর্তে যদি আরেকটা newer কল ইতিমধ্যে শুরু হয়ে গিয়ে থাকে, তাহলে এই (পুরনো) কল
        // আর কোনো DOM পরিবর্তন করবে না।
        if (_mySeq !== _profileStatusCallSeq) return;
        const riderProfile = data || {};
        // STEP 3: actual riders.id
        const rId = riderProfile.id;
        if (rId) {
            localStorage.setItem('riderId', rId);
            currentRiderId = rId; 
        }

        if (riderProfile.avatar_url) {
            localStorage.setItem("rider_avatar", riderProfile.avatar_url);
            if (document.getElementById("avatarDisplayImage")) {
                document.getElementById("avatarDisplayImage").src = riderProfile.avatar_url;
            }
        }

        // Fetch current rider KYC status from database to display correct verification badges and reasons
        let kycVerified = riderProfile.is_verified;
        let kycReason = "";
        let hasKyc = false;

        // ✅ NOTE: aadhaar_no/pan_no কলাম rider_kyc টেবিলে না থাকলে ফলব্যাক করা হয়, যাতে
        // পুরনো Vehicle/License স্ট্যাটাস ভেঙে না যায়। নতুন কলাম যোগ করার SQL নিচে দেওয়া হলো।
        let kycData = null;
        // STEP 4-8: rider_kyc row using rider_id -> vehicle KYC status, plate number, plate image, rejection reason
        const res1 = await supabaseClient
            .from('rider_kyc')
            .select('verified, rejection_reason, aadhaar_no, aadhaar_img, pan_no, pan_img, license_no, license_img, plate_no, plate_img, vehicle_img')
            .eq('rider_id', rId)
            .maybeSingle();
        if (res1.error) {
            console.error("RIDER_KYC FETCH ERROR:", { code: res1.error.code, message: res1.error.message, details: res1.error.details, hint: res1.error.hint });
            const res2 = await supabaseClient
                .from('rider_kyc')
                .select('verified, rejection_reason')
                .eq('rider_id', rId)
                .maybeSingle();
            if (res2.error) console.error("RIDER_KYC FALLBACK FETCH ERROR:", res2.error);
            kycData = res2.data;
        } else {
            kycData = res1.data;
        }

        // ✅ আবার চেক — উপরের await চলাকালীন আরেকটা newer কল শুরু হয়ে থাকলে এখানেও থেমে যাও
        if (_mySeq !== _profileStatusCallSeq) return;

        if (kycData) {
            hasKyc = true;
            kycVerified = kycData.verified;
            kycReason = kycData.rejection_reason || "";
        }

        // ✅ NEW: গ্লোবাল ফ্ল্যাগ — Driving License/KYC verified না হলে Accept Order বাটন লক থাকবে (দেখুন acceptOrder ও renderAvailableOrder)
        window._riderLicenseVerified = (kycVerified === true);

        // ✅ NEW: প্রতিটা ডকুমেন্টের জন্য লক করা প্রিভিউ/এডিট UI আপডেট করা — spec §1/§4/§7/§9 (exact
        // screenshot flow: Status/Plate No/Plate image + Pending/Verified/Rejected states).
        // rider_kyc একটাই shared row সব ৪টা ডকুমেন্টের জন্য, তাই শুধু hasKyc (রো আছে কিনা) দিয়ে বিচার
        // করলে যেটা আসলে upload-ই করা হয়নি সেটাও লক দেখাবে। তাই সেই নির্দিষ্ট ডকুমেন্টের নিজস্ব
        // no./ছবি আসলেই সাবমিট করা আছে কিনা সেটা আলাদাভাবে চেক করা হচ্ছে।
        const vehicleImgVal = kycData?.vehicle_img || kycData?.plate_img;
        applyKycLockUI('vehicle', { hasKyc: hasKyc && !!(kycData?.plate_no || vehicleImgVal), verified: kycVerified, reason: kycReason, imgUrl: vehicleImgVal, numberLabel: 'Plate', numberValue: kycData?.plate_no });
        applyKycLockUI('license', { hasKyc: hasKyc && !!(kycData?.license_no || kycData?.license_img), verified: kycVerified, reason: kycReason, imgUrl: kycData?.license_img, numberLabel: 'No', numberValue: kycData?.license_no });
        applyKycLockUI('aadhaar', { hasKyc: hasKyc && !!(kycData?.aadhaar_no || kycData?.aadhaar_img), verified: kycVerified, reason: kycReason, imgUrl: kycData?.aadhaar_img, numberLabel: 'No', numberValue: kycData?.aadhaar_no });
        applyKycLockUI('pan', { hasKyc: hasKyc && !!(kycData?.pan_no || kycData?.pan_img), verified: kycVerified, reason: kycReason, imgUrl: kycData?.pan_img, numberLabel: 'No', numberValue: kycData?.pan_no });

        // STEP 9: profile main page status — vehicleStatusTag reflects the actual DB status
        if (document.getElementById("vehicleStatusTag")) {
            if (kycVerified) {
                document.getElementById("vehicleStatusTag").innerText = "Verified";
                document.getElementById("vehicleStatusTag").style.background = "#dcfce7";
                document.getElementById("vehicleStatusTag").style.color = "#16a34a";
            } else if (kycReason) {
                document.getElementById("vehicleStatusTag").innerText = "Rejected";
                document.getElementById("vehicleStatusTag").style.background = "#fee2e2";
                document.getElementById("vehicleStatusTag").style.color = "#dc2626";
            } else if (hasKyc) {
                document.getElementById("vehicleStatusTag").innerText = "Pending Review";
                document.getElementById("vehicleStatusTag").style.background = "#fef3c7";
                document.getElementById("vehicleStatusTag").style.color = "#d97706";
            } else {
                // ✅ FIX: Unverified এখন লাল (আগে ধূসর ছিল) — Unverified=লাল, Pending=হলুদ, Verified=সবুজ
                document.getElementById("vehicleStatusTag").innerText = "Unverified";
                document.getElementById("vehicleStatusTag").style.background = "#fee2e2";
                document.getElementById("vehicleStatusTag").style.color = "#ef4444";
            }
        }

        if (document.getElementById("licenseStatusTag")) {
            if (kycVerified) {
                document.getElementById("licenseStatusTag").innerText = "Verified";
                document.getElementById("licenseStatusTag").style.background = "#dcfce7";
                document.getElementById("licenseStatusTag").style.color = "#16a34a";
            } else if (kycReason) {
                document.getElementById("licenseStatusTag").innerText = "Rejected: " + kycReason;
                document.getElementById("licenseStatusTag").style.background = "#fee2e2";
                document.getElementById("licenseStatusTag").style.color = "#dc2626";
            } else if (hasKyc) {
                document.getElementById("licenseStatusTag").innerText = "Pending Review";
                document.getElementById("licenseStatusTag").style.background = "#fef3c7";
                document.getElementById("licenseStatusTag").style.color = "#d97706";
            } else {
                document.getElementById("licenseStatusTag").innerText = "Unverified";
                document.getElementById("licenseStatusTag").style.background = "#fee2e2";
                document.getElementById("licenseStatusTag").style.color = "#ef4444";
            }
        }

        // ✅ NEW: Aadhaar ও PAN স্ট্যাটাস ট্যাগ — একই rider_kyc row এর shared verified/rejection_reason
        // ফলো করে (Vehicle/License এর মতোই), যতক্ষণ না DB তে আলাদা per-document verification কলাম যোগ হয়
        if (document.getElementById("aadhaarStatusTag")) {
            const tag = document.getElementById("aadhaarStatusTag");
            if (kycVerified) {
                tag.innerText = "Verified"; tag.style.background = "#dcfce7"; tag.style.color = "#16a34a";
            } else if (kycReason) {
                tag.innerText = "Rejected: " + kycReason; tag.style.background = "#fee2e2"; tag.style.color = "#dc2626";
            } else if (hasKyc) {
                tag.innerText = "Pending Review"; tag.style.background = "#fef3c7"; tag.style.color = "#d97706";
            } else {
                tag.innerText = "Unverified"; tag.style.background = "#fee2e2"; tag.style.color = "#ef4444";
            }
        }

        if (document.getElementById("panStatusTag")) {
            const tag = document.getElementById("panStatusTag");
            if (kycVerified) {
                tag.innerText = "Verified"; tag.style.background = "#dcfce7"; tag.style.color = "#16a34a";
            } else if (kycReason) {
                tag.innerText = "Rejected: " + kycReason; tag.style.background = "#fee2e2"; tag.style.color = "#dc2626";
            } else if (hasKyc) {
                tag.innerText = "Pending Review"; tag.style.background = "#fef3c7"; tag.style.color = "#d97706";
            } else {
                tag.innerText = "Unverified"; tag.style.background = "#fee2e2"; tag.style.color = "#ef4444";
            }
        }

        if (document.getElementById('aadhaarStringInput') && kycData?.aadhaar_no) {
            document.getElementById('aadhaarStringInput').value = kycData.aadhaar_no;
        }
        if (document.getElementById('panStringInput') && kycData?.pan_no) {
            document.getElementById('panStringInput').value = kycData.pan_no;
        }

        // ✅ NEW: Bank & Payment স্ট্যাটাস ট্যাগ — আগে এটা কখনো আপডেট হতো না, সবসময়
        // "Unverified" আটকে থাকতো। এখন Vehicle/License এর মতোই Unverified → Pending →
        // Verified/Rejected ফ্লো ফলো করবে।
        if (document.getElementById("payoutVerificationTag")) {
            const bankHasData = !!(riderProfile.bank_account || riderProfile.upi_id);
            const bankVerified = riderProfile.bank_verified;
            const bankRejectReason = riderProfile.bank_rejection_reason || "";
            const payoutTag = document.getElementById("payoutVerificationTag");
            if (bankVerified === true) {
                payoutTag.innerText = "Verified";
                payoutTag.style.background = "#dcfce7";
                payoutTag.style.color = "#16a34a";
            } else if (bankRejectReason) {
                payoutTag.innerText = "Rejected: " + bankRejectReason;
                payoutTag.style.background = "#fee2e2";
                payoutTag.style.color = "#dc2626";
            } else if (bankHasData) {
                payoutTag.innerText = "Pending Review";
                payoutTag.style.background = "#fef3c7";
                payoutTag.style.color = "#d97706";
            } else {
                payoutTag.innerText = "Unverified";
                payoutTag.style.background = "#fee2e2";
                payoutTag.style.color = "#ef4444";
            }
        }

        // ✅ FIX: আগে full_name খালি থাকলে HTML এর স্ট্যাটিক "Rider Account" লেখাই থেকে যেত।
        // এখন fallback chain: signup name → Google display name → email prefix।
        if (document.getElementById('profileDisplayName')) {
            const googleName = currentSession?.user?.user_metadata?.full_name || currentSession?.user?.user_metadata?.name || "";
            const nameToShow = riderProfile.full_name || googleName || (currentSession?.user?.email ? currentSession.user.email.split('@')[0] : "Rider");
            document.getElementById('profileDisplayName').innerText = nameToShow;
        }
        if (document.getElementById('profileDisplayUsername')) {
            // ✅ FIX: স্ট্যাটিক "@rider" এর বদলে signup সময় জেনারেট হওয়া Rider UID (riders.rider_uid কলাম
            // থাকলে সেটা, না থাকলে rider এর id দিয়ে @RD###### ফরম্যাটে জেনারেট করা)
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
        if (document.getElementById('vehicleTypeSelector') && riderProfile.vehicle_type) {
            document.getElementById('vehicleTypeSelector').value = riderProfile.vehicle_type;
        }
        // ✅ NEW (spec §15): plate number in the edit form should prefer the rider_kyc value
        // (source of truth for vehicle KYC) and only fall back to riders.vehicle_plate if
        // rider_kyc has nothing yet.
        if (document.getElementById('vehiclePlateInput') && (kycData?.plate_no || riderProfile.vehicle_plate)) {
            document.getElementById('vehiclePlateInput').value = kycData?.plate_no || riderProfile.vehicle_plate;
        }
        if (document.getElementById('licenseStringInput') && riderProfile.license_number) {
            document.getElementById('licenseStringInput').value = riderProfile.license_number;
        }
        if (document.getElementById('bankAccountInput') && riderProfile.bank_account) {
            document.getElementById('bankAccountInput').value = riderProfile.bank_account;
        }
        if (document.getElementById('bankNameInput') && riderProfile.bank_name) {
            document.getElementById('bankNameInput').value = riderProfile.bank_name;
        }
        if (document.getElementById('bankAccountNumberInput') && riderProfile.account_number) {
            document.getElementById('bankAccountNumberInput').value = riderProfile.account_number;
        }
        if (document.getElementById('bankBranchInput') && riderProfile.branch) {
            document.getElementById('bankBranchInput').value = riderProfile.branch;
        }
        if (document.getElementById('bankifscinput') && riderProfile.ifsc_code) {
            document.getElementById('bankifscinput').value = riderProfile.ifsc_code;
        }
        if (document.getElementById('upiIdInput') && riderProfile.upi_id) {
            document.getElementById('upiIdInput').value = riderProfile.upi_id;
        }
        if (document.getElementById("verificationStatus")) {
            document.getElementById("verificationStatus").innerText = riderProfile.status || "Pending";
        }

        // ✅ NEW: Total Lifetime Income — completed delivery অনুযায়ী calculate
        if (document.getElementById("totalLifetimeIncome") && rId) {
            loadTotalLifetimeIncome(rId);
        }

    } catch (e) { 
        showToast("Profile status load error: " + (e.message || e), "error");
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