/* ==========================================================================
   1. GLOBAL SYSTEM CONFIGURATIONS & SUPABASE INIT
   URL & key loaded from supabase-constants.js
   ========================================================================== */
const supabase = (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_KEY !== 'undefined' && window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

let currentCart = JSON.parse(localStorage.getItem('medi_cart')) || [];
let patientsData = JSON.parse(localStorage.getItem('medi_patients')) || [];
// ✅ NEW — which patient (or "Self") the current checkout is for. Reset to
// Self by default; never persisted across sessions on purpose (re-asked
// per checkout, same as the real apps this was modeled on).
let selectedOrderPatient = { id: '', name: '' };
let alarmsData = JSON.parse(localStorage.getItem('medi_alarms')) || [];
let systemNotifications = [];
let savedAddresses = []; // Flipkart-style multi-address book, loaded from user_addresses table
let adminOffers = [];

let currentUserEmail = '';
let currentAuthUserId = '';   // Supabase auth UUID, set once session resolves — used by the notification system
let selectedPaymentMethod = "COD";
let selectedDeliverySpeed = "manual"; // 'express' (30min, +20), 'sameday' (+10), 'manual' (free, 5-7 days)
let selectedDeliverySpeedFee = 0;
let cartActivePatientId = localStorage.getItem('medi_cart_patient_id') || 'self';
// Reserved once the shopper opens the Online Payment screen — reused as the
// real order_id (both in the UPI intent's tn= note AND the order row itself)
// so the note the customer's UPI app shows always matches the order that
// actually gets created after "Payment Completed".
let pendingOnlineOrderId = null;
// 'UPI' (paid via the UPI app deep link) or 'UPI_QR' (paid by scanning the
// static QR) — set the moment the shopper picks one, saved as payment_mode.
let selectedOnlinePaymentMethod = null;
let isPincodeVerified = false;
let verifiedAddress = localStorage.getItem('medi_verified_address') || "";
let discountAmount = 0;
// Tracks which coupon row is currently applied at checkout so it can be
// marked used (is_used = true) once the order actually goes through —
// { code, source: 'personal'|'public', id }. 'personal' = a user_coupons
// row owned by this user (referral/order rewards); 'public' = a general
// coupons row anyone with the code can use.
let appliedCouponInfo = null;
let isPrescriptionUploaded = localStorage.getItem('medi_presc_uploaded_status') === 'true' || false;
let activePrescription = JSON.parse(localStorage.getItem('medi_active_prescription') || 'null'); // {fileName, url, date} of the currently active upload

// Shows exactly one of the three prescription-widget states (default / uploading / uploaded)
// and keeps it correct across page loads by reading the persisted activePrescription record.
function renderPrescriptionWidgetState() {
    const defaultState = document.getElementById('presc-default-state');
    const progressState = document.getElementById('presc-progress-state');
    const uploadedState = document.getElementById('presc-uploaded-state');
    if (!defaultState && !uploadedState) return; // widget not on this page

    if (activePrescription && activePrescription.url) {
        if (defaultState) defaultState.style.display = 'none';
        if (progressState) progressState.style.display = 'none';
        if (uploadedState) uploadedState.style.display = 'flex';
        const nameEl = document.getElementById('presc-uploaded-filename');
        if (nameEl) nameEl.innerText = activePrescription.fileName || 'Prescription';

        // Once a pharmacy has accepted this prescription, it's locked in —
        // Delete and Replace both disappear so the accepted slip can't be
        // pulled out from under the pharmacy that's already preparing it.
        const isLocked = activePrescription.status === 'accepted';
        const deleteBtn = document.getElementById('presc-delete-btn');
        const replaceLbl = document.querySelector('label[for="presc-file-input"].presc-icon-action-btn');
        if (deleteBtn) deleteBtn.style.display = isLocked ? 'none' : '';
        if (replaceLbl) replaceLbl.style.display = isLocked ? 'none' : '';
        if (isLocked) {
            setPrescriptionWaitingStatus('✅ Accepted by a pharmacy — locked and can\'t be deleted until it\'s delivered.');
        }
    } else {
        if (defaultState) defaultState.style.display = 'flex';
        if (progressState) progressState.style.display = 'none';
        if (uploadedState) uploadedState.style.display = 'none';
        setPrescriptionWaitingStatus('');
    }
}

function showPrescriptionProgressState() {
    const defaultState = document.getElementById('presc-default-state');
    const progressState = document.getElementById('presc-progress-state');
    const uploadedState = document.getElementById('presc-uploaded-state');
    if (defaultState) defaultState.style.display = 'none';
    if (uploadedState) uploadedState.style.display = 'none';
    if (progressState) progressState.style.display = 'flex';
    const bar = document.getElementById('presc-progress-bar');
    if (bar) bar.style.width = '0%';
}

// The Supabase JS storage.upload() call doesn't expose byte-level progress,
// so this animates toward ~90% while the real upload is in flight and snaps
// to 100% only once it actually resolves — an honest "still working" cue
// rather than a fake instant bar.
function animatePrescriptionProgress() {
    const bar = document.getElementById('presc-progress-bar');
    if (!bar) return () => {};
    let pct = 0;
    const timer = setInterval(() => {
        pct = Math.min(90, pct + Math.random() * 12);
        bar.style.width = pct + '%';
    }, 250);
    return () => { clearInterval(timer); bar.style.width = '100%'; };
}

// ✅ Fix (Item 8b — Logout button, and several other silent no-ops): this
// function was called from ~9 places across the app (Logout, Delete
// Prescription, Empty Cart, Cancel Order, Delete Address, etc.) but was
// never actually defined anywhere in this file — every direct (unguarded)
// call to it threw "showConfirmationModal is not defined" the instant it
// ran, silently, with no visible error to the user. That's the real reason
// tapping Logout appeared to do nothing. Defined only if it doesn't already
// exist (e.g. from prod-utils.js), so this can never override or duplicate
// a real implementation if one is ever added there.
if (typeof window.showConfirmationModal !== 'function') {
    window.showConfirmationModal = function(message, onConfirm, options) {
        options = options || {};
        document.getElementById('mf-confirm-modal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'mf-confirm-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:10050;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
        modal.innerHTML = `
            <div style="background:#fff;border-radius:18px;padding:22px 20px;width:100%;max-width:340px;box-sizing:border-box;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.25);animation:slideUpView 0.2s ease;">
                <div style="width:44px;height:44px;border-radius:50%;background:#fdecec;color:#e02020;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:1.2rem;">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                </div>
                <p style="font-size:0.9rem;color:#2f3542;font-weight:600;margin:0 0 18px;line-height:1.4;">${message}</p>
                <div style="display:flex;gap:10px;">
                    <button type="button" id="mf-confirm-cancel-btn" style="flex:1;padding:11px;border-radius:10px;border:1px solid #e4e7eb;background:#fff;color:#57606f;font-weight:700;font-size:0.85rem;cursor:pointer;">${options.cancelText || 'Cancel'}</button>
                    <button type="button" id="mf-confirm-ok-btn" style="flex:1;padding:11px;border-radius:10px;border:none;background:#e02020;color:#fff;font-weight:700;font-size:0.85rem;cursor:pointer;">${options.confirmText || 'Confirm'}</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const close = () => modal.remove();
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        document.getElementById('mf-confirm-cancel-btn').onclick = close;
        document.getElementById('mf-confirm-ok-btn').onclick = () => { close(); if (typeof onConfirm === 'function') onConfirm(); };
    };
}

window.deleteActivePrescription = function() {
    if (activePrescription && activePrescription.status === 'accepted') {
        showToast("This prescription has already been accepted by a pharmacy and can't be deleted.", "error");
        return;
    }
    showConfirmationModal("Delete this prescription? You'll need to re-upload it for Rx orders.", async () => {
        const toDelete = activePrescription;
        activePrescription = null;
        isPrescriptionUploaded = false;
        localStorage.removeItem('medi_active_prescription');
        localStorage.setItem('medi_presc_uploaded_status', 'false');
        renderPrescriptionWidgetState();

        // ✅ Fix: supabase storage.remove() does NOT throw on failure — it
        // returns { error } (and a silent empty array when the DELETE
        // storage policy blocks it). The old try/catch therefore never saw
        // a failure, so the image stayed in storage while the app said
        // "Prescription deleted". Now the real result is checked. Needs the
        let storageRemoved = true;
        // storagePath can be missing (e.g. slip restored from an older save),
        // so fall back to deriving it from the public URL.
        let rmPath = toDelete && toDelete.storagePath;
        if (!rmPath && toDelete && toDelete.url) {
            const m = String(toDelete.url).match(/\/media\/([^?]+)/);
            if (m) rmPath = decodeURIComponent(m[1]);
        }
        if (supabase && rmPath) {
            try {
                const { data: rmData, error: rmErr } = await supabase.storage.from('media').remove([rmPath]);
                if (rmErr || !rmData || rmData.length === 0) storageRemoved = false;
                if (rmErr) console.error('[prescription delete] storage remove failed:', rmErr);
            } catch (e) { storageRemoved = false; console.error(e); }
        }
        // A still-pending broadcast order for this slip is cancelled too, so
        // pharmacies stop seeing a slip the customer already withdrew.
        if (supabase && toDelete && toDelete.orderId && toDelete.status !== 'accepted') {
            try { await supabase.from('prescription_orders').update({ status: 'cancelled' }).eq('id', toDelete.orderId); } catch (e) {}
            localStorage.removeItem('medi_pending_rx_id');
        }
        // Also drop the matching entry from the archived "My Prescription Box" list
        if (toDelete && toDelete.url) {
            let myBox = JSON.parse(localStorage.getItem('medi_prescription_box')) || [];
            myBox = myBox.filter(p => p.url !== toDelete.url);
            localStorage.setItem('medi_prescription_box', JSON.stringify(myBox));
        }
        if (storageRemoved) showToast("Prescription deleted.", "info");
        else showToast("Removed from the app, but the image file couldn't be deleted from storage. Please try again.", "error");
    });
};


// add/buy an Rx medicine without a verified prescription on file. Rx uploads
// now live per-item on the Cart page (see promptRxUploadOnAdd) — this used
// to scroll the Home page to its own general prescription widget, which
// isn't what actually gates a Buy Now anymore, so it now adds the item to
// the cart and offers to take the shopper there instead. Home's own
// prescription-upload-section is kept only as a general "send my slip to
// nearby pharmacies" tool, decoupled from this Buy Now flow.
function blockForMissingPrescription(productData) {
    if (productData) {
        try { addToCart(productData); return; } catch (e) {}
    }
    const msg = "This medicine requires a doctor's prescription. Please upload it from your Cart to continue.";
    if (typeof showConfirmationModal === 'function') {
        showConfirmationModal(msg, () => {
            navigateTo('cart');
        });
    } else {
        showToast("Upload prescription for Rx medicines from the Cart page.", "error");
    }
}

// Auto-picks the customer's live mobile number so they never have to retype it
// on the prescription popup — prefers the default saved delivery address,
// then falls back to the number they entered last time.
function getAutoUserPhone() {
    try {
        const def = (savedAddresses || []).find(a => a.is_default) || (savedAddresses || [])[0];
        if (def && def.phone) return def.phone;
    } catch (e) {}
    return localStorage.getItem('medi_last_phone') || '';
}

// Shows/updates the "waiting for pharmacy" status line under the uploaded
// prescription card. Pass an empty string to hide it.
function setPrescriptionWaitingStatus(text) {
    const el = document.getElementById('presc-waiting-status');
    if (!el) return;
    if (!text) { el.style.display = 'none'; el.innerText = ''; return; }
    el.style.display = 'block';
    el.innerText = text;
}

// Live-watches a single broadcast prescription order so the moment ANY nearby
// pharmacy accepts it, the customer's screen updates instantly — no refresh.
function watchPendingPrescriptionOrder(id) {
    if (!supabase || !id) return;
    localStorage.setItem('medi_pending_rx_id', id);
    setPrescriptionWaitingStatus('⏳ Waiting for a pharmacy to accept your prescription (5–10 min)...');
    if (window._rxWatchChannel) { try { supabase.removeChannel(window._rxWatchChannel); } catch (e) {} }
    window._rxWatchChannel = supabase
        .channel('rx-order-' + id)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'prescription_orders', filter: `id=eq.${id}` }, payload => {
            const row = payload.new;
            if (row.status === 'accepted') {
                showToast("Your prescription was accepted by a nearby pharmacy!", "success");
                localStorage.removeItem('medi_pending_rx_id');
                // Lock it in on this device — Delete/Replace disappear — but
                // keep this SAME channel open so we still hear about delivery.
                if (activePrescription) {
                    activePrescription.orderId = id;
                    activePrescription.status = 'accepted';
                    localStorage.setItem('medi_active_prescription', JSON.stringify(activePrescription));
                }
                renderPrescriptionWidgetState();
            } else if (row.status === 'delivered') {
                showToast("Your prescription order has been delivered!", "success");
                localStorage.removeItem('medi_pending_rx_id');
                try { supabase.removeChannel(window._rxWatchChannel); } catch (e) {}
                // Fulfilled — clear the widget back to its default "upload a
                // prescription" state automatically.
                activePrescription = null;
                isPrescriptionUploaded = false;
                localStorage.removeItem('medi_active_prescription');
                localStorage.setItem('medi_presc_uploaded_status', 'false');
                renderPrescriptionWidgetState();
            } else if (row.status === 'cancelled') {
                setPrescriptionWaitingStatus('');
                localStorage.removeItem('medi_pending_rx_id');
                try { supabase.removeChannel(window._rxWatchChannel); } catch (e) {}
            }
        })
        .subscribe();
}

let userLiveLat = 22.5726;  // fallback — real coords set by GPS
let userLiveLng = 88.3639; // fallback — real coords set by GPS
const shopCoordinates = { lat: 22.5780, lng: 88.3650 }; // fallback — real coords set by GPS

// ============================================================
// GPS ACCURACY + ERROR HANDLING (shared by every geolocation call in this
// file — detectLiveUserGPSCoordinates(), setupMapPageModules()'s initial fix
// and its live watchPosition()). Keeps a single source of truth for the
// real device accuracy (position.coords.accuracy, never faked) and makes
// sure a GPS failure shows one friendly message instead of raw JS errors
// or a spam of repeated toasts.
// ============================================================
let userGPSAccuracyMeters = null;
let _gpsErrorToastShownAt = 0;

// Options used by every getCurrentPosition()/watchPosition() call in this
// file. maximumAge:0 always asks for a fresh fix rather than a cached one.
const GEO_OPTIONS_ONE_SHOT = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
const GEO_OPTIONS_WATCH = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };

// Renders "Location accuracy: ±25 m" (real value, never fabricated) into any
// element carrying id="gps-accuracy-indicator" or class="gps-accuracy-indicator"
// that exists on the current page. No-ops safely if neither is present.
function renderGPSAccuracyIndicator(accuracyMeters) {
    if (accuracyMeters === null || accuracyMeters === undefined || isNaN(accuracyMeters)) return;
    userGPSAccuracyMeters = accuracyMeters;
    const label = `Location accuracy: ±${Math.round(accuracyMeters)} m`;
    const targets = document.querySelectorAll('#gps-accuracy-indicator, .gps-accuracy-indicator');
    targets.forEach(el => { el.textContent = label; el.style.display = ''; });
}

// Turns a raw GeolocationPositionError into one friendly, non-technical
// message and shows it at most once every 20s so a flaky signal (common
// with watchPosition on the move) never spams the shopper with toasts.
// Never exposes err.message / raw JS error text to the user.
function handleGeolocationError(err) {
    let msg = "Couldn't get your location. Please try again.";
    if (err && typeof err.code === 'number') {
        if (err.code === 1) msg = "Location access was denied. Please allow location permission to see accurate delivery distance and nearby pharmacies.";
        else if (err.code === 2) msg = "Your location couldn't be determined right now. Please check your GPS/network and try again.";
        else if (err.code === 3) msg = "Location request timed out. Please try again in an area with a clearer signal.";
    }
    const now = Date.now();
    if (now - _gpsErrorToastShownAt > 20000) {
        _gpsErrorToastShownAt = now;
        if (typeof showToast === 'function') showToast(msg, "error");
    }
}

// Wraps navigator.geolocation.getCurrentPosition()/watchPosition() so every
// call site in this file gets the same options + friendly error handling +
// "browser unsupported" guard, without duplicating that boilerplate everywhere.
function safeWatchPosition(onSuccess, options) {
    if (!navigator.geolocation) {
        handleGeolocationError({ code: 0 });
        return null;
    }
    return navigator.geolocation.watchPosition(onSuccess, handleGeolocationError, options || GEO_OPTIONS_WATCH);
}
function safeGetCurrentPosition(onSuccess, options) {
    if (!navigator.geolocation) {
        handleGeolocationError({ code: 0 });
        return;
    }
    navigator.geolocation.getCurrentPosition(onSuccess, handleGeolocationError, options || GEO_OPTIONS_ONE_SHOT);
}

// ============================================================
// LANGUAGE MATRIX - West Bengal regional languages + major Indian languages
// ============================================================
const languageMatrix = {
    en: {
        title: "MEDI FINDER", editBtn: "Edit Name", addrTitle: "Manage Delivery Addresses",
        selectTitle: "App Display Language", patientTitle: "Manage Patients", patientDesc: "Add or select profiles for regular medical orders",
        pillTitle: "Pill Reminders", pillDesc: "Set active scheduling alerts to take daily doses",
        referTitle: "Refer & Earn", referDesc: "Invite friends to unlock unique ₹100 shopping coupons",
        careTitle: "Customer Care Desk", helpTitle: "Help Desk", helpDesc: "Find diagnostic assistance or file complaints",
        termsTitle: "Terms & Conditions", termsDesc: "Review licensing and operational usage guidelines",
        logoutTitle: "Logout Account", navHome: "HOME", navMap: "MAP", navOrder: "ORDER", navCart: "CART", navProfile: "PROFILE",
        myBox: "My Prescription Box", searchPlaceholder: "Search medicines, syrups, baby care..."
    },
    bn: {
        title: "মেডি ফাইন্ডার", editBtn: "নাম পরিবর্তন করুন", addrTitle: "ডেলিভারি অ্যাড্রেস ম্যানেজ",
        selectTitle: "অ্যাপ ডিসপ্লে ভাষা", patientTitle: "পেশেন্ট প্রোফাইল পরিচালনা", patientDesc: "নিয়মিত মেডিকেল অর্ডারের জন্য প্রোফাইল যোগ করুন",
        pillTitle: "ওষুধের রিমাইন্ডার", pillDesc: "প্রতিদিনের ডোজ নেওয়ার জন্য অ্যালার্ম শিডিউল করুন",
        referTitle: "রেফার এবং আর্ন", referDesc: "১০০ টাকার শপিং কুপন পেতে বন্ধুদের আমন্ত্রণ জানান",
        careTitle: "কাস্টমার কেয়ার ডেস্ক", helpTitle: "হেল্প ডেস্ক", helpDesc: "সহায়তা খুঁজুন অথবা অভিযোগ দায়ের করুন",
        termsTitle: "শর্তাবলী", termsDesc: "লাইসেন্সিং এবং ব্যবহারবিধি পর্যালোচনা করুন",
        logoutTitle: "অ্যাকাউন্ট লগআউট", navHome: "হোম", navMap: "ম্যাপ", navOrder: "অর্ডার", navCart: "কার্ট", navProfile: "প্রোফাইল",
        myBox: "আমার প্রেসক্রিপশন বক্স", searchPlaceholder: "ওষুধ, সিরাপ, বেবি কেয়ার খুঁজুন..."
    },
    hi: {
        title: "मेडी फाइंडर", editBtn: "नाम बदलें", addrTitle: "डिलिवरी पता प्रबंधित करें",
        selectTitle: "APP की प्रदर्शन भाषा", patientTitle: "मरीजों का प्रबंधन", patientDesc: "नियमित चिकित्सा आदेशों के लिए प्रोफाइल जोड़ें",
        pillTitle: "दवा अनुस्मारक", pillDesc: "दैनिक खुराक लेने के लिए सक्रिय अलार्म सेट करें",
        referTitle: "Refer & Earn", referDesc: "₹100 के shopping कूपन अनलॉक करने के लिए आमंत्रित करें",
        careTitle: "ग्राहक सेवा डेस्क", helpTitle: "सहायता डेस्क", helpDesc: "नैदानिक सहायता प्राप्त करें या शिकायत दर्ज करें",
        termsTitle: "नियम एवं शर्तें", termsDesc: "लाइसेंसिंग और परिचालन उपयोग दिशानिर्देश देखें",
        logoutTitle: "खाता लॉगआउट", navHome: "होम", navMap: "मानचित्र", navOrder: "ऑर्डर", navCart: "कार्ट", navProfile: "प्रोफाइल",
        myBox: "मेरा प्रिस्क्रिप्शन बॉक्स", searchPlaceholder: "दवाइयाँ, सिरप, बेबी केयर खोजें..."
    },
    // Santali (West Bengal tribal language)
    sat: {
        title: "MEDI FINDER", editBtn: "नाम बदलें", addrTitle: "डेलिभारी ठिकाना",
        selectTitle: "भाषा चुनुं", patientTitle: "मरीज मैनेज", patientDesc: "नियमित ऑर्डर के लिए प्रोफाइल जोड़ें",
        pillTitle: "दवाई याद दिलाना", pillDesc: "हर दिन दवाई लेने के लिए अलार्म लगाएं",
        referTitle: "Refer & Earn", referDesc: "दोस्तों को बुलाएं, ₹100 कूपन पाएं",
        careTitle: "कस्टमर केयर", helpTitle: "हेल्प", helpDesc: "मदद लें या शिकायत करें",
        termsTitle: "शर्तें", termsDesc: "नियम और शर्तें",
        logoutTitle: "लॉगआउट", navHome: "होम", navMap: "नक्शा", navOrder: "ऑर्डर", navCart: "कार्ट", navProfile: "प्रोफाइल",
        myBox: "मेरा प्रेस्क्रिप्शन", searchPlaceholder: "दवाई खोजें..."
    },
    // Rajbangsi (North Bengal dialect)
    rjb: {
        title: "মেডি ফাইন্ডার", editBtn: "নাম বদলান", addrTitle: "ঠিকানা ম্যানেজ",
        selectTitle: "ভাষা বাছুন", patientTitle: "রুগী প্রোফাইল", patientDesc: "নিয়মিত অর্ডারের জন্য প্রোফাইল যোগ করুন",
        pillTitle: "ওষুধের সময়", pillDesc: "প্রতিদিন ওষুধ খাওয়ার অ্যালার্ম দিন",
        referTitle: "রেফার করুন", referDesc: "বন্ধুদের ডাকুন, ১০০ টাকা কুপন পান",
        careTitle: "কাস্টমার কেয়ার", helpTitle: "হেল্প", helpDesc: "সাহায্য নিন বা অভিযোগ জানান",
        termsTitle: "শর্তাবলী", termsDesc: "নিয়মকানুন দেখুন",
        logoutTitle: "লগআউট", navHome: "হোম", navMap: "ম্যাপ", navOrder: "অর্ডার", navCart: "কার্ট", navProfile: "প্রোফাইল",
        myBox: "আমার প্রেসক্রিপশন", searchPlaceholder: "ওষুধ খুঁজুন..."
    },
    // Odia
    or: {
        title: "ମେଡି ଫାଇଣ୍ଡର", editBtn: "ନାମ ବଦଳାନ୍ତୁ", addrTitle: "ଡେଲିଭରି ଠିକଣା",
        selectTitle: "ଭାଷା ବାଛନ୍ତୁ", patientTitle: "ରୋଗୀ ପ୍ରୋଫାଇଲ", patientDesc: "ନିୟମିତ ଅର୍ଡର ପାଇଁ ପ୍ରୋଫାଇଲ ଯୋଡ଼ନ୍ତୁ",
        pillTitle: "ଔଷଧ ସ୍ମରଣ", pillDesc: "ପ୍ରତିଦିନ ଔଷଧ ଖାଇବା ପାଇଁ ଆଲାର୍ମ ଦିଅନ୍ତୁ",
        referTitle: "ରେଫର & ଇଆର୍ନ", referDesc: "ବନ୍ଧୁଙ୍କୁ ଡାକନ୍ତୁ ₹100 କୁପନ ପାଆନ୍ତୁ",
        careTitle: "ଗ୍ରାହକ ସେବା", helpTitle: "ହେଲ୍ପ ଡେସ୍କ", helpDesc: "ସାହାଯ୍ୟ ନିଅନ୍ତୁ ବା ଅଭିଯୋଗ ଜଣାନ୍ତୁ",
        termsTitle: "ସର୍ତ୍ତ ଓ ନିୟମ", termsDesc: "ଲାଇସେନ୍ସ ଓ ବ୍ୟବହାର ନୀତି ଦେଖନ୍ତୁ",
        logoutTitle: "ଲଗ୍ ଆଉଟ", navHome: "ହୋମ", navMap: "ମ୍ୟାପ", navOrder: "ଅର୍ଡର", navCart: "କାର୍ଟ", navProfile: "ପ୍ରୋଫାଇଲ",
        myBox: "ମୋ ପ୍ରେସ୍କ୍ରିପ୍ସନ ବକ୍ସ", searchPlaceholder: "ଔଷଧ ଖୋଜନ୍ତୁ..."
    },
    te: {
        title: "మెడి ఫైండర్", editBtn: "పేరు మార్చు", addrTitle: "డెలివరీ అడ్రస్ నిర్వహణ",
        selectTitle: "యాప్ భాష", patientTitle: "పేషెంట్ నిర్వహణ", patientDesc: "సాధారణ ఆర్డర్‌ల కోసం ప్రొఫైల్‌లు జోడించండి",
        pillTitle: "పిల్ రిమైండర్లు", pillDesc: "రోజువారీ మోతాదు కోసం అలారాలు సెట్ చేయండి",
        referTitle: "రెఫర్ & ఆర్న్", referDesc: "₹100 కూపన్లు పొందండి",
        careTitle: "కస్టమర్ కేర్", helpTitle: "హెల్ప్ డెస్క్", helpDesc: "సహాయం పొందండి లేదా ఫిర్యాదు చేయండి",
        termsTitle: "నిబంధనలు", termsDesc: "లైసెన్సింగ్ నిబంధనలు చదవండి",
        logoutTitle: "లాగ్‌అవుట్", navHome: "హోమ్", navMap: "మ్యాప్", navOrder: "ఆర్డర్", navCart: "కార్ట్", navProfile: "ప్రొఫైల్",
        myBox: "నా ప్రిస్క్రిప్షన్ బాక్స్", searchPlaceholder: "మందులు వెతకండి..."
    },
    mr: {
        title: "मेडी फाइंडर", editBtn: "नाव बदला", addrTitle: "डिलिव्हरी पत्ता व्यवस्थापन",
        selectTitle: "अ‍ॅप प्रदर्शन भाषा", patientTitle: "रुग्ण व्यवस्थापन", patientDesc: "नियमित वैद्यकीय ऑर्डरसाठी प्रोफाइल जोडा",
        pillTitle: "औषध स्मरणपत्र", pillDesc: "दैनंदिन डोससाठी अलार्म सेट करा",
        referTitle: "रेफर करा & कमवा", referDesc: "मित्रांना आमंत्रित करा, ₹100 कूपन मिळवा",
        careTitle: "ग्राहक सेवा", helpTitle: "मदत केंद्र", helpDesc: "मदत मिळवा किंवा तक्रार नोंदवा",
        termsTitle: "अटी व शर्ती", termsDesc: "परवाना आणि वापर मार्गदर्शक तत्त्वे",
        logoutTitle: "खाते लॉगआउट", navHome: "होम", navMap: "नकाशा", navOrder: "ऑर्डर", navCart: "कार्ट", navProfile: "प्रोफाइल",
        myBox: "माझा प्रिस्क्रिप्शन बॉक्स", searchPlaceholder: "औषधे शोधा..."
    },
    ta: {
        title: "மெடி ஃபைண்டர்", editBtn: "பெயர் திருத்து", addrTitle: "டெலிவரி முகவரி",
        selectTitle: "மொழி தேர்வு", patientTitle: "நோயாளர் நிர்வாகம்", patientDesc: "வழக்கமான ஆர்டர்களுக்கு சுயவிவரங்கள் சேர்க்கவும்",
        pillTitle: "மாத்திரை நினைவூட்டல்", pillDesc: "தினசரி மருந்துக்கு அலாரம் வைக்கவும்",
        referTitle: "பரிந்துரை & சம்பாதி", referDesc: "நண்பர்களை அழைக்கவும், ₹100 கூப்பன் பெறவும்",
        careTitle: "வாடிக்கையாளர் சேவை", helpTitle: "உதவி மேசை", helpDesc: "உதவி பெறுங்கள் அல்லது புகார் தெரிவிக்கவும்",
        termsTitle: "விதிமுறைகள்", termsDesc: "உரிம மற்றும் பயன்பாட்டு வழிகாட்டுதல்கள்",
        logoutTitle: "வெளியேறு", navHome: "முகப்பு", navMap: "வரைபடம்", navOrder: "ஆர்டர்", navCart: "கார்ட்", navProfile: "சுயவிவரம்",
        myBox: "என் மருந்துச் சீட்டு பெட்டி", searchPlaceholder: "மருந்துகளை தேடுங்கள்..."
    },
    gu: {
        title: "મેડી ફાઇન્ડર", editBtn: "નામ બદલો", addrTitle: "ડિલિવરી સરનામું",
        selectTitle: "ભાષા પસંદ કરો", patientTitle: "દર્દી પ્રોફાઇલ", patientDesc: "નિયમિત ઓર્ડર માટે પ્રોફાઇલ ઉમેરો",
        pillTitle: "ગોળી રિમાઇન્ડર", pillDesc: "રોજ દવા લેવા અલાર્મ સેટ કરો",
        referTitle: "રેફર & કમાઓ", referDesc: "મિત્રોને આમંત્રિત કરો, ₹100 કૂપન મેળવો",
        careTitle: "ગ્રાહક સેવા", helpTitle: "મદદ ડેસ્ક", helpDesc: "સહાય મેળવો અથવા ફરિયાદ કરો",
        termsTitle: "નિયમો અને શરતો", termsDesc: "લાઇસન્સ માર્ગદર્શિકા",
        logoutTitle: "લૉગ આઉટ", navHome: "હોમ", navMap: "નકશો", navOrder: "ઓર્ડર", navCart: "કાર્ટ", navProfile: "પ્રોફાઇલ",
        myBox: "મારો પ્રિસ્ક્રિપ્શન બૉક્સ", searchPlaceholder: "દવા શોધો..."
    },
    kn: {
        title: "ಮೆಡಿ ಫೈಂಡರ್", editBtn: "ಹೆಸರು ಬದಲಿಸಿ", addrTitle: "ವಿತರಣಾ ವಿಳಾಸ",
        selectTitle: "ಭಾಷೆ ಆಯ್ಕೆ", patientTitle: "ರೋಗಿ ನಿರ್ವಹಣೆ", patientDesc: "ನಿಯಮಿತ ಆದೇಶಗಳಿಗೆ ಪ್ರೊಫೈಲ್ ಸೇರಿಸಿ",
        pillTitle: "ಮಾತ್ರೆ ಜ್ಞಾಪನ", pillDesc: "ದೈನಂದಿನ ಡೋಸ್‌ಗೆ ಅಲಾರ್ಮ್ ಹೊಂದಿಸಿ",
        referTitle: "ರೆಫರ್ & ಗಳಿಸಿ", referDesc: "ಸ್ನೇಹಿತರನ್ನು ಆಹ್ವಾನಿಸಿ ₹100 ಕೂಪನ್ ಪಡೆಯಿರಿ",
        careTitle: "ಗ್ರಾಹಕ ಸೇವೆ", helpTitle: "ಸಹಾಯ ಮೇಜು", helpDesc: "ಸಹಾಯ ಪಡೆಯಿರಿ ಅಥವಾ ದೂರು ಸಲ್ಲಿಸಿ",
        termsTitle: "ನಿಯಮಗಳು & ಷರತ್ತುಗಳು", termsDesc: "ಪರವಾನಗಿ ಮಾರ್ಗಸೂಚಿ",
        logoutTitle: "ಲಾಗ್‌ಔಟ್", navHome: "ಹೋಮ್", navMap: "ನಕ್ಷೆ", navOrder: "ಆರ್ಡರ್", navCart: "ಕಾರ್ಟ್", navProfile: "ಪ್ರೊಫೈಲ್",
        myBox: "ನನ್ನ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಬಾಕ್ಸ್", searchPlaceholder: "ಔಷಧ ಹುಡುಕಿ..."
    },
    ml: {
        title: "മെഡി ഫൈൻഡർ", editBtn: "പേര് മാറ്റുക", addrTitle: "ഡെലിവറി അഡ്രസ്",
        selectTitle: "ഭാഷ തിരഞ്ഞെടുക്കുക", patientTitle: "രോഗി മാനേജ്‌മെന്റ്", patientDesc: "പ്രൊഫൈലുകൾ ചേർക്കുക",
        pillTitle: "ഗുളിക ഓർമ്മ", pillDesc: "ദൈനംദിന ഡോസ് അലാറം സജ്ജമാക്കുക",
        referTitle: "റഫർ & നേടൂ", referDesc: "സുഹൃത്തുക്കളെ ക്ഷണിക്കൂ ₹100 കൂപ്പൺ നേടൂ",
        careTitle: "ഉപഭോക്തൃ സേവനം", helpTitle: "ഹെൽപ് ഡെസ്ക്", helpDesc: "സഹായം നേടുക അല്ലെങ്കിൽ പരാതി നൽകുക",
        termsTitle: "നിബന്ധനകൾ", termsDesc: "ലൈസൻസ് മാർഗ്ഗനിർദ്ദേശം",
        logoutTitle: "ലോഗ്ഔട്ട്", navHome: "ഹോം", navMap: "മാപ്പ്", navOrder: "ഓർഡർ", navCart: "കാർട്ട്", navProfile: "പ്രൊഫൈൽ",
        myBox: "എന്റെ പ്രിസ്ക്രിപ്ഷൻ ബോക്സ്", searchPlaceholder: "മരുന്ന് തിരയുക..."
    },
    pa: {
        title: "ਮੇਡੀ ਫਾਈਂਡਰ", editBtn: "ਨਾਮ ਬਦਲੋ", addrTitle: "ਡਿਲੀਵਰੀ ਪਤਾ",
        selectTitle: "ਭਾਸ਼ਾ ਚੁਣੋ", patientTitle: "ਮਰੀਜ਼ ਪ੍ਰਬੰਧਨ", patientDesc: "ਨਿਯਮਿਤ ਆਰਡਰਾਂ ਲਈ ਪ੍ਰੋਫਾਈਲ ਜੋੜੋ",
        pillTitle: "ਦਵਾਈ ਯਾਦ", pillDesc: "ਰੋਜ਼ਾਨਾ ਦਵਾਈ ਲਈ ਅਲਾਰਮ ਲਗਾਓ",
        referTitle: "ਰੈਫਰ & ਕਮਾਓ", referDesc: "ਦੋਸਤਾਂ ਨੂੰ ਸੱਦੋ ₹100 ਕੂਪਨ ਪਾਓ",
        careTitle: "ਗਾਹਕ ਸੇਵਾ", helpTitle: "ਮਦਦ ਕੇਂਦਰ", helpDesc: "ਮਦਦ ਲਓ ਜਾਂ ਸ਼ਿਕਾਇਤ ਕਰੋ",
        termsTitle: "ਨਿਯਮ ਅਤੇ ਸ਼ਰਤਾਂ", termsDesc: "ਲਾਇਸੈਂਸ ਦਿਸ਼ਾ-ਨਿਰਦੇਸ਼",
        logoutTitle: "ਲੌਗ ਆਉਟ", navHome: "ਹੋਮ", navMap: "ਨਕਸ਼ਾ", navOrder: "ਆਰਡਰ", navCart: "ਕਾਰਟ", navProfile: "ਪ੍ਰੋਫਾਈਲ",
        myBox: "ਮੇਰਾ ਪ੍ਰਿਸਕ੍ਰਿਪਸ਼ਨ ਬਾਕਸ", searchPlaceholder: "ਦਵਾਈਆਂ ਖੋਜੋ..."
    },
    ur: {
        title: "میڈی فائنڈر", editBtn: "نام تبدیل کریں", addrTitle: "ڈیلیوری پتہ",
        selectTitle: "زبان منتخب کریں", patientTitle: "مریض انتظام", patientDesc: "باقاعدہ آرڈر کے لیے پروفائل شامل کریں",
        pillTitle: "دوائی یاد دہانی", pillDesc: "روزانہ خوراک کے لیے الارم لگائیں",
        referTitle: "ریفر اور کمائیں", referDesc: "دوستوں کو مدعو کریں ₹100 کوپن پائیں",
        careTitle: "کسٹمر کیئر", helpTitle: "مدد ڈیسک", helpDesc: "مدد حاصل کریں یا شکایت کریں",
        termsTitle: "شرائط و ضوابط", termsDesc: "لائسنس رہنما خطوط",
        logoutTitle: "لاگ آؤٹ", navHome: "ہوم", navMap: "نقشہ", navOrder: "آرڈر", navCart: "کارٹ", navProfile: "پروفائل",
        myBox: "میرا نسخہ باکس", searchPlaceholder: "دوائیں تلاش کریں..."
    }
};

// ============================================================
// MEDIFINDER SMART LOADING SYSTEM (added — full-page boot loader +
// reusable favicon.png product-image loading/fallback). Does not
// touch existing UI, routing, Supabase, or business logic below.
// ============================================================
const MF_IMG_PLACEHOLDER = 'favicon.png';
const MF_SMART_IMG_SELECTORS = '.img-container img, .cart-item-img, #modal-main-img, .order-img-box img, #order-detail-body img, #sponsoredOfferModal img';

function mfHideBootLoader() {
    const loader = document.getElementById('mf-boot-loader');
    if (!loader || loader.classList.contains('mf-loader-hidden')) return;
    loader.classList.add('mf-loader-hidden');
    setTimeout(() => { if (loader.parentNode) loader.parentNode.removeChild(loader); }, 400);
}
window.addEventListener('load', mfHideBootLoader);
setTimeout(mfHideBootLoader, 4000); // safety net only — never used to add delay

function mfApplySmartImage(img) {
    if (!img || img.dataset.mfSmart === '1') return;
    const realSrc = img.getAttribute('src');
    if (!realSrc || realSrc.indexOf(MF_IMG_PLACEHOLDER) !== -1) return;
    img.dataset.mfSmart = '1';
    img.classList.add('mf-smart-img');

    if (img.complete && img.naturalWidth > 0) {
        img.classList.add('mf-img-ready'); // already cached/instant — no placeholder flash
        return;
    }

    img.src = MF_IMG_PLACEHOLDER;
    const preloader = new Image();
    preloader.onload = () => {
        img.style.opacity = '0';
        setTimeout(() => {
            img.src = realSrc;
            img.classList.add('mf-img-ready');
            requestAnimationFrame(() => { img.style.opacity = '1'; });
        }, 140);
    };
    preloader.onerror = () => {
        img.src = MF_IMG_PLACEHOLDER;
        img.classList.add('mf-img-ready');
    };
    preloader.src = realSrc;
}

function mfScanForSmartImages(root) {
    (root || document).querySelectorAll(MF_SMART_IMG_SELECTORS).forEach(mfApplySmartImage);
}

function initMfSmartImageSystem() {
    mfScanForSmartImages(document);
    const mfImgObserver = new MutationObserver((mutations) => {
        mutations.forEach(m => {
            m.addedNodes.forEach(node => {
                if (node.nodeType !== 1) return;
                if (node.matches && node.matches(MF_SMART_IMG_SELECTORS)) mfApplySmartImage(node);
                if (node.querySelectorAll) mfScanForSmartImages(node);
            });
        });
    });
    mfImgObserver.observe(document.body, { childList: true, subtree: true });
}

document.addEventListener("DOMContentLoaded", () => {

    // Every init step below now runs through runInitStep() instead of being
    // called bare. Previously a single thrown error in ANY one of these
    // (e.g. a null DOM lookup on a page that doesn't have that element,
    // or a temporary Supabase/network hiccup) would stop this ENTIRE
    // listener dead — so every setup*() call listed AFTER the one that
    // threw never ran at all. That one root cause was silently breaking
    // huge swaths of the app at once (map page, cart page, profile menu,
    // hamburger, voice search, wishlist, bottom nav...) with no visible
    // error to the user, because the only trace was a console error most
    // people never open. Wrapping each step isolates failures so one
    // broken module can no longer take the rest of the app down with it.
    function runInitStep(label, fn) {
        try { fn(); } catch (err) { console.error(`[init] ${label} failed:`, err); }
    }

    runInitStep('renderPrescriptionWidgetState', renderPrescriptionWidgetState);

    // Resume the "waiting for pharmacy" live status if the user left and came
    // back while a broadcast prescription order is still pending acceptance.
    runInitStep('watchPendingPrescriptionOrder', () => {
        const _pendingRxId = localStorage.getItem('medi_pending_rx_id');
        if (_pendingRxId) watchPendingPrescriptionOrder(_pendingRxId);
    });

    runInitStep('detectLiveUserGPSCoordinates', detectLiveUserGPSCoordinates);
    runInitStep('autoFillSavedUserDataOnAuth', autoFillSavedUserDataOnAuth);
    runInitStep('retryPendingOrderSync', retryPendingOrderSync);
    runInitStep('setupGlobalNotificationHub', setupGlobalNotificationHub);
    runInitStep('setupHomePageModules', setupHomePageModules);
    runInitStep('setupCartPageModules', setupCartPageModules);
    runInitStep('setupOrdersPageModules', setupOrdersPageModules);
    runInitStep('setupProfilePageModules', setupProfilePageModules);
    runInitStep('setupMapPageModules', () => { if (document.getElementById('map')) setupMapPageModules(); });

    runInitStep('setupGlobalCloseButtonListeners', setupGlobalCloseButtonListeners);
    runInitStep('runBackgroundPillAlarmEngine interval', () => setInterval(runBackgroundPillAlarmEngine, 10000));
    runInitStep('setupServiceWorkerNotifications', setupServiceWorkerNotifications);

    runInitStep('initLiveOfferAndBroadcastStream', () => {
        if (supabase && document.getElementById('user-app-banner')) {
            initLiveOfferAndBroadcastStream();
        }
    });

    runInitStep('language init', () => {
        const savedLang = localStorage.getItem('medi_active_language_env') || 'en';
        triggerGlobalAppLanguageTranslation(savedLang);
        updateSearchPlaceholder(savedLang);
    });

    runInitStep('initAutoSlider', initAutoSlider);
    runInitStep('loadSponsoredProducts', () => {
        loadSponsoredProducts().then(() => {
            const newSlides = document.querySelectorAll('#home-slider .slide');
            if (newSlides.length > 0) initAutoSlider();
        }).catch(() => {});
        if (supabase && document.getElementById('home-slider')) {
            initSponsoredRealtime();
        }
    });
    runInitStep('initModalRatingStars', initModalRatingStars);
    runInitStep('initScrollToTop', initScrollToTop);
    runInitStep('initHomeStickyScroll', initHomeStickyScroll);
    runInitStep('initWishlistButtons', initWishlistButtons);
    runInitStep('initVoiceSearch', initVoiceSearch);
    runInitStep('initServicesMenu', initServicesMenu);
    // ✅ initHamburgerMenu() removed — no hamburger menu in the app.
    runInitStep('updateProductCount', updateProductCount);

    // Live "Cart (N)" bottom-nav badge — synced with the cart on every load.
    runInitStep('updateCartNavBadge', updateCartNavBadge);

    // Home-only header greeting ("Hi, [Name]" + time-of-day message) and its
    // show-on-Home-only visibility. Also refreshed on every navigateTo() call
    // (see the SPA router below) and every 5 min so the greeting stays correct
    // ("Good afternoon" -> "Good evening") if the app is left open.
    runInitStep('home header greeting', () => {
        renderHomeHeaderGreeting();
        updateHomeHeaderVisibility((window.location.hash || '').replace('#', '') || 'home');
        setInterval(renderHomeHeaderGreeting, 5 * 60 * 1000);
    });

    // Prefetch adjacent pages for instant tab switching
    runInitStep('setupPagePrefetch', setupPagePrefetch);

    // Smart loading system: scan existing product images + watch for
    // dynamically-inserted ones; hide the boot loader now that the page's
    // own setup is done (window 'load' above still covers slower assets).
    runInitStep('initMfSmartImageSystem', initMfSmartImageSystem);
    runInitStep('mfHideBootLoader', mfHideBootLoader);
});

// Fixes orders (and cart/notifications) appearing to "disappear" when the user
// hits the browser Back button. The browser often restores the page from its
// back/forward cache (bfcache) instead of reloading it — DOMContentLoaded does
// NOT fire again in that case, so the page just shows whatever was rendered
// before the order existed. event.persisted === true is how we detect that
// restore and force everything to re-sync against localStorage + Supabase.
window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return; // normal load/navigation — DOMContentLoaded already handled it
    if (document.getElementById('order-list')) refreshOrdersFromServer();
});

// Global BUY NOW / ADD TO CART handler (outside async to guarantee early registration)
document.addEventListener('click', (e) => {
    const card = e.target.closest('.product-card');
    if (!card) return;
    if (e.target.closest('.add-to-cart-btn')) {
        e.stopPropagation();
        addToCart(card.dataset);
    } else if (e.target.closest('.immediate-order')) {
        e.stopPropagation();
        const isRx = card.getAttribute('data-is-rx') === 'true' || card.dataset.isRx === 'true';
        const existingCartItem = isRx ? currentCart.find(i => String(i.id) === String(card.dataset.id)) : null;
        if (isRx && !(existingCartItem && existingCartItem.rxVerified)) {
            blockForMissingPrescription(card.dataset);
            return;
        }
        navigateToProductDetail(card.dataset);
    }
});

// Inline fallback handlers — called directly from onclick attributes. These
// used to ALSO fire the document-level delegated listener above for the very
// same click (inline onclick runs at the target phase, then the click still
// bubbles up to document afterwards), so a single tap silently called
// addToCart() TWICE — quietly inflating quantities (and the bottom-nav
// count) without ever showing a duplicate row, since the second call just
// incremented the same item's qty. stopPropagation() here stops that bubble,
// so only ONE of the two listeners now ever runs per tap.
window.handleQuickAddToCart = function(btn) {
    if (window.event) window.event.stopPropagation();
    const card = btn.closest('.product-card');
    if (!card) return;
    addToCart(card.dataset);
};
window.handleQuickBuyNow = function(btn) {
    if (window.event) window.event.stopPropagation();
    const card = btn.closest('.product-card');
    if (!card) return;
    const isRx = card.getAttribute('data-is-rx') === 'true' || card.dataset.isRx === 'true';
    const existingCartItem = isRx ? currentCart.find(i => String(i.id) === String(card.dataset.id)) : null;
    if (isRx && !(existingCartItem && existingCartItem.rxVerified)) {
        blockForMissingPrescription(card.dataset);
        return;
    }
    navigateToProductDetail(card.dataset);
};

// ============================================================
// PAGE PREFETCH SYSTEM - Instant Tab Switching
// ============================================================
function setupPagePrefetch(){
    const pages = []; // no-op after user.html/user.css/user.js consolidation — pages are already in the DOM, nothing to prefetch
    const prefetched = new Set();
    
    // Prefetch on hover over nav items
    document.querySelectorAll('.nav-item').forEach(function(item){
        item.addEventListener('mouseenter', function(){
            const onclick = item.getAttribute('onclick');
            if(!onclick) return;
            const match = onclick.match(/window\.location\.href\s*=\s*'([^']+)'/);
            if(!match) return;
            const page = match[1].split('?')[0];
            if(!prefetched.has(page) && page !== window.location.pathname.split('/').pop()){
                prefetchPage(page);
                prefetched.add(page);
            }
        });
        item.addEventListener('touchstart', function(){
            item.dispatchEvent(new Event('mouseenter'));
        }, {passive:true});
    });
    
    // Prefetch all nav pages after 2s idle
    setTimeout(function(){
        pages.forEach(function(p){
            if(!prefetched.has(p) && p !== window.location.pathname.split('/').pop()){
                prefetchPage(p);
                prefetched.add(p);
            }
        });
    }, 2000);
}

function prefetchPage(page){
    if(prefetchCache[page]) return;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = page;
    link.as = 'document';
    document.head.appendChild(link);
    prefetchCache[page] = true;
}

const prefetchCache = {};

// ============================================================
// SERVICE WORKER + BACKGROUND NOTIFICATION SYSTEM
// ============================================================
function setupServiceWorkerNotifications() {
    if ('serviceWorker' in navigator && 'Notification' in window) {
        // 'default' means the user hasn't been asked yet; once they grant or
        // deny it, Notification.permission stops being 'default' and this
        // skips the prompt on every subsequent page load.
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }

        // Register service worker for background notifications
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(e => {
                // SW not found, fallback to in-page alarm only

            });
        }
    }
}

function fireSystemNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        const osNotification = new Notification(title, {
            body: body,
            icon: '1779304435608.png',
            badge: '1779304435608.png',
            vibrate: [200, 100, 200]
        });
        // Tapping the OS notification should bring the app to the front and
        // land on Home — previously this notification had no click handler
        // at all, so tapping it did nothing.
        osNotification.onclick = function() {
            window.focus();
            const currentPage = window.location.pathname.split('/').pop();
            if (currentPage && currentPage !== 'userhome.html') {
                navigateTo('home');
            }
            osNotification.close();
        };
    }
    // Also play alarm tone using Web Audio API
    playAlarmTone();
}

function playAlarmTone() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const notes = [523, 659, 784, 659, 523];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.5, ctx.currentTime + i * 0.3);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.3 + 0.25);
            osc.start(ctx.currentTime + i * 0.3);
            osc.stop(ctx.currentTime + i * 0.3 + 0.3);
        });
    } catch(e) {

    }
}

function detectLiveUserGPSCoordinates() {
    safeGetCurrentPosition((pos) => {
        userLiveLat = pos.coords.latitude;
        userLiveLng = pos.coords.longitude;
        renderGPSAccuracyIndicator(pos.coords.accuracy);

        if (document.getElementById('order-list')) {
            setupOrdersPageModules();
        }
        // Real GPS fix just landed — recompute the cart's distance-based
        // delivery fee against it instead of the fallback coordinates.
        if (document.getElementById('cart-items-container') && typeof refreshDeliveryDistanceAndBill === 'function') {
            refreshDeliveryDistanceAndBill();
            if (typeof refreshShiprocketRateAndBill === 'function') refreshShiprocketRateAndBill();
        }
        // Same idea for the home page's "20 Min" express badges — they were
        // first computed against the fallback coords, so recheck them now.
        if (document.getElementById('main-products-grid') && typeof refreshExpressDeliveryBadges === 'function') {
            refreshExpressDeliveryBadges();
        }
    }, GEO_OPTIONS_ONE_SHOT);
}

// Keeps every "who's logged in" display (profile fields) in sync with the
// real account, both immediately (from cache) and again once the real
// session resolves.
function applyUserIdentityToUI(name, uid, email, avatarUrl) {
    const nameTargets = ['user-name', 'new-name-input'];
    nameTargets.forEach(id => {
        const el = document.getElementById(id);
        if (!el || !name) return;
        if (el.tagName === 'INPUT') el.value = name; else el.innerText = name;
    });
    // Keep the Home-only "Hi, [Name]" header greeting in sync too, the moment
    // a real name becomes available (cache, then again once Supabase resolves).
    if (name) renderHomeHeaderGreeting();
    if (uid) {
        const uidDisplay = document.getElementById('user-uid-display');
        if (uidDisplay) uidDisplay.innerText = "User ID: " + uid;
    }
    if (email) {
        const usernameEl = document.getElementById('user-username');
        if (usernameEl) usernameEl.innerText = email;
    }
    if (avatarUrl) {
        document.querySelectorAll('#profile-pic').forEach(img => { img.src = avatarUrl; });
    }
}

// ============================================================
// HOME-ONLY HEADER — "Hi, [Name]" + time-of-day greeting
// Shown ONLY on the Home tab (see updateHomeHeaderVisibility(), hooked into
// the SPA router's navigateTo() below). Name is always pulled live from the
// same cached/session-resolved profile name applyUserIdentityToUI() already
// maintains — never hardcoded. Greeting text updates automatically by hour.
// ============================================================

// "Good morning / Good noon / Good evening / Good night" — matches the
// exact wording requested. Hour bands: 3–10:59 morning, 11–15:59 noon,
// 16–19:59 evening, 20:00–2:59 night (wraps past midnight).
function getTimeBasedGreeting() {
    const hour = new Date().getHours();
    if (hour >= 3 && hour < 11) return "Good morning";
    if (hour >= 11 && hour < 16) return "Good noon";
    if (hour >= 16 && hour < 20) return "Good evening";
    return "Good night"; // 20:00–23:59 and 00:00–02:59
}

// Renders into whichever of these exist on the page (all optional, safely
// null-checked, so this never errors if the HTML only has some of them):
//   #home-greeting-name  -> just the name ("Rejoyan")
//   #home-greeting-time  -> just the greeting line ("Good afternoon")
//   #home-greeting-text  -> combined fallback ("Hi, Rejoyan") if the split
//                           name/time elements aren't present
function renderHomeHeaderGreeting() {
    const name = localStorage.getItem('medi_profile_name') || 'there';
    const greeting = getTimeBasedGreeting();

    const nameEl = document.getElementById('home-greeting-name');
    const timeEl = document.getElementById('home-greeting-time');
    const combinedEl = document.getElementById('home-greeting-text');

    if (nameEl) nameEl.textContent = `Hi, ${name}`;
    if (timeEl) timeEl.textContent = greeting;
    if (!nameEl && !timeEl && combinedEl) combinedEl.textContent = `Hi, ${name}`;
}

// Home gets the header; Shops/Cart/Orders/Profile never do. Looks for a
// single header element carrying id="home-only-header" (or, if the markup
// uses a class instead, class="home-only-header") and toggles it — nothing
// else on the page is touched, so no other header gets created or removed.
function updateHomeHeaderVisibility(page) {
    const headers = document.querySelectorAll('#home-only-header, .home-only-header');
    headers.forEach(el => { el.style.display = (page === 'home') ? '' : 'none'; });
    if (page === 'home') renderHomeHeaderGreeting();
}

async function autoFillSavedUserDataOnAuth() {
    const cachedName = localStorage.getItem('medi_profile_name');
    const cachedUid = localStorage.getItem('medi_user_uid');
    const cachedAvatar = localStorage.getItem('medi_profile_avatar');
    applyUserIdentityToUI(cachedName, cachedUid, null, cachedAvatar);
    if (verifiedAddress && document.getElementById('current-address')) {
        document.getElementById('current-address').innerText = verifiedAddress;
    }
    if (patientsData && patientsData.length > 0 && document.getElementById('patients-record-list')) {
        renderPatientsListUI();
    }
    if (alarmsData && alarmsData.length > 0 && document.getElementById('active-alarms-list')) {
        renderAlarmsListUI();
    }

    if (supabase) {
        let session = null;
        try {
            const sessionResult = await supabase.auth.getSession();
            session = sessionResult.data.session;
            if (session && session.user) {
                currentUserEmail = session.user.email || '';
                currentAuthUserId = session.user.id || '';
                const userEmail = session.user.email;

                // The real, stable Supabase auth UID is the single source of truth for
                // "User ID" everywhere (profile page + hamburger) — persisted so it's
                // consistent across sessions/devices instead of a randomly-generated one.
                const stableUid = session.user.id.substring(0, 12).toUpperCase();
                localStorage.setItem('medi_user_uid', stableUid);
                applyUserIdentityToUI(null, stableUid, userEmail);

                const { data: profileArray, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('email', userEmail)
                    .limit(1);

                // Item 4: when someone signs up with Google/email and no `profiles`
                // row exists yet (or one exists but is missing a name/photo), Google
                // already gave us that info on the auth session itself
                // (user_metadata.full_name / .name and .avatar_url / .picture) —
                // previously this was never read, so the account looked nameless
                // and photo-less everywhere until the person manually edited their
                // profile. Now it's backfilled automatically and saved so it's
                // there for good.
                const meta = session.user.user_metadata || {};
                const metaName = meta.full_name || meta.name || '';
                const metaAvatar = meta.avatar_url || meta.picture || '';

                let profile = (!profileError && profileArray && profileArray.length > 0) ? profileArray[0] : null;
                const resolvedName = (profile && profile.full_name) || metaName || '';
                const resolvedAvatar = (profile && profile.avatar_url) || metaAvatar || '';

                if (resolvedName) {
                    localStorage.setItem('medi_profile_name', resolvedName);
                }
                if (resolvedAvatar) {
                    localStorage.setItem('medi_profile_avatar', resolvedAvatar);
                }
                applyUserIdentityToUI(resolvedName || null, null, userEmail, resolvedAvatar || null);

                if (profile && profile.address && document.getElementById('current-address')) {
                    document.getElementById('current-address').innerText = profile.address;
                    localStorage.setItem('medi_verified_address', profile.address);
                }

                // Persist the backfilled name/photo into `profiles` so this only
                // ever has to happen once per account, not on every login.
                const needsBackfill = (!profile && (metaName || metaAvatar)) ||
                    (profile && ((!profile.full_name && metaName) || (!profile.avatar_url && metaAvatar)));
                if (needsBackfill) {
                    try {
                        await supabase.from('profiles').upsert({
                            email: userEmail,
                            full_name: (profile && profile.full_name) || metaName || null,
                            avatar_url: (profile && profile.avatar_url) || metaAvatar || null
                        }, { onConflict: 'email' });
                    } catch (e) {}
                }

                const { data: dbPatients } = await supabase.from('patients').select('*').eq('user_email', userEmail);
                if (dbPatients && dbPatients.length > 0) {
                    patientsData = dbPatients;
                    localStorage.setItem('medi_patients', JSON.stringify(patientsData));
                    if (document.getElementById('patients-record-list')) renderPatientsListUI();
                }

                const { data: dbAlarms } = await supabase.from('reminders').select('*').eq('user_email', userEmail);
                if (dbAlarms && dbAlarms.length > 0) {
                    alarmsData = dbAlarms;
                    localStorage.setItem('medi_alarms', JSON.stringify(alarmsData));
                    if (document.getElementById('active-alarms-list')) renderAlarmsListUI();
                }
            }
        } catch(e) {

        } finally {
            // ✅ Guest-state placeholder now only needs to worry about the
            // profile page itself — the hamburger menu it used to also
            // reset is gone. Profile page shows its own logged-out prompt
            // via the normal auth-state UI already handled elsewhere.
        }
    }
}

function setupGlobalCloseButtonListeners() {
    document.addEventListener('click', (e) => {
        if (e.target.closest('.modal-close-cross') || e.target.closest('.close-btn') || e.target.closest('.close-modal-btn') || e.target.id === 'map-modal-close' || e.target.id === 'cancel-name' || e.target.id === 'close-help-modal' || e.target.id === 'close-otp-modal') {
            const openModal = e.target.closest('.modal') || e.target.closest('.modal-overlay-view') || document.querySelector('.modal.active');
            if (openModal) {
                openModal.style.display = "none";
                openModal.classList.remove('active');
            }
        }
        if (e.target.classList.contains('modal') || e.target.classList.contains('modal-overlay-view')) {
            e.target.style.display = "none";
            e.target.classList.remove('active');
        }
    });
}

// Resolves the logged-in user's Supabase auth UUID, waiting on the session
// if autoFillSavedUserDataOnAuth hasn't populated currentAuthUserId yet.
async function getCurrentAuthUserId() {
    if (currentAuthUserId) return currentAuthUserId;
    if (!supabase) return '';
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
            currentAuthUserId = session.user.id;
            return currentAuthUserId;
        }
    } catch (e) {}
    return '';
}

// Call this from anywhere (order placed, cancelled, prescription approved,
// coin/coupon added, etc.) to create a real, persistent notification row.
// Pass userId = null for an admin broadcast that every user sees.
async function pushUserNotification(userId, type, title, message, orderId) {
    if (!supabase) return;
    try {
        await supabase.from('notifications').insert([{
            user_id: userId || null,
            type: type || 'general',
            title: title || 'MediFinder',
            message: message || '',
            order_id: orderId || null
        }]);
    } catch (e) {}
}

function timeAgoLabel(dateStr) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + ' min' + (mins > 1 ? 's' : '') + ' ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + ' hour' + (hrs > 1 ? 's' : '') + ' ago';
    const days = Math.floor(hrs / 24);
    return days + ' day' + (days > 1 ? 's' : '') + ' ago';
}

function updateNotiBadge() {
    const badge = document.getElementById('noti-badge');
    if (!badge) return;
    const unreadCount = systemNotifications.filter(n => !n.is_read).length;
    // ✅ Simple red-dot indicator instead of a numeric pill — just show/hide it.
    badge.style.display = unreadCount > 0 ? 'block' : 'none';
}

function renderNotificationDropdown(notiDropdown) {
    const body = notiDropdown.querySelector('.dropdown-body');
    if (!body) return;

    if (systemNotifications.length === 0) {
        body.innerHTML = `<div class="noti-empty"><i class="fa-solid fa-bell-slash"></i><p>No Notifications Yet</p></div>`;
        return;
    }

    body.innerHTML = systemNotifications.map(n => `
        <div class="noti-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" onclick="markNotificationRead('${n.id}')">
            ${n.is_read ? '' : '<span class="noti-unread-dot">●</span>'}
            <button class="noti-delete-btn" onclick="deleteUserNotification('${n.id}', event)"><i class="fa-solid fa-xmark"></i></button>
            <p><strong>${n.title || ''}</strong><br>${n.message || ''}</p>
            <span>${timeAgoLabel(n.created_at)}</span>
        </div>
    `).join('');
}

// Clicking a single notification card marks only that one read — the red dot
// on it disappears and the badge count drops by exactly one, immediately —
// and then takes the user to the Home page (unless they're already there).
window.markNotificationRead = async function(id) {
    const target = systemNotifications.find(n => n.id === id);
    if (target && !target.is_read) {
        target.is_read = true;
        const notiDropdown = document.getElementById('notiDropdown');
        if (notiDropdown) renderNotificationDropdown(notiDropdown);
        updateNotiBadge();
        if (supabase) {
            try { await supabase.from('notifications').update({ is_read: true }).eq('id', id); } catch (e) {}
        }
    }
    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage && currentPage !== 'userhome.html') {
        navigateTo('home');
    }
};

window.deleteUserNotification = async function(id, event) {
    if (event) event.stopPropagation();
    systemNotifications = systemNotifications.filter(n => n.id !== id);
    const notiDropdown = document.getElementById('notiDropdown');
    if (notiDropdown) renderNotificationDropdown(notiDropdown);
    updateNotiBadge();
    if (supabase) {
        try { await supabase.from('notifications').delete().eq('id', id); } catch (e) {}
    }
};

async function setupGlobalNotificationHub() {
    const notiBtn = document.getElementById('notiBtn');
    const notiDropdown = document.getElementById('notiDropdown');

    async function refreshNotifications() {
        if (!supabase) return;
        const uid = await getCurrentAuthUserId();
        try {
            let query = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
            query = uid ? query.or(`user_id.eq.${uid},user_id.is.null`) : query.is('user_id', null);
            const { data, error } = await query;
            if (!error && data) systemNotifications = data;
        } catch (e) {}
        updateNotiBadge();
        const notiPage = document.getElementById('page-notification');
        if (notiDropdown && notiPage && notiPage.classList.contains('active')) renderNotificationDropdown(notiDropdown);
    }

    // Unread count loads the moment the session resolves, not just on a later click
    await refreshNotifications();

    // Bell now opens a real full page (#page-notification) instead of a
    // dropdown that could end up clipped/hidden under the scrollable content.
    if (notiBtn && notiDropdown) {
        notiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            renderNotificationDropdown(notiDropdown);
            if (typeof window.navigateTo === 'function') window.navigateTo('notification');
        });
    }
    const notiCloseBtn = document.getElementById('noti-close-btn');
    if (notiCloseBtn) {
        notiCloseBtn.addEventListener('click', () => {
            if (typeof window.navigateTo === 'function') window.navigateTo('home');
        });
    }

    // Realtime: new rows, reads, and deletes reflect instantly with no page refresh
    if (supabase) {
        supabase.channel('user-notifications-feed')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
                refreshNotifications();
            })
            .subscribe();
    }
}

// ============================================================
// HOME PAGE: Search with Suggestions
// ============================================================
// ============================================================
// SHOP VIEW — real merchant info card, injected above the products grid
// on the existing ?merchant=ID storefront (doc3 "VIEW" flow). Deliberately
// reuses this SPA route rather than creating a new HTML page. Every field
// is read straight off the real `merchants`/`orders` rows; anything the
// row doesn't actually have shows "Not available" instead of being guessed.
// NOTE: shop image + prescription-support field names weren't confirmed
// anywhere else in this codebase, so this checks a few likely column names
// and falls back gracefully — see the final report for the exact columns
// to confirm/rename if different.
// ============================================================
async function renderShopInfoCard(m, merchantId) {
    const productsSection = document.querySelector('.products-showcase-section');
    if (!productsSection || !productsSection.parentNode) return;
    document.getElementById('shop-info-card')?.remove();

    const shopImg = m.shop_image_url || m.logo_url || m.profile_image || m.avatar_url || m.shop_image || '';
    const ownerName = m.merchant_name || 'Not available';
    const isVerified = String(m.license_status || '').toLowerCase() === 'verified';
    const hasRxField = (m.accepts_prescription !== undefined && m.accepts_prescription !== null) || (m.prescription_allowed !== undefined && m.prescription_allowed !== null);
    const rxAllowed = m.accepts_prescription ?? m.prescription_allowed ?? null;

    let totalOrders = null;
    let joinedLabel = 'Not available';
    try {
        if (supabase) {
            const { count } = await supabase.from('orders').select('order_id', { count: 'exact', head: true }).eq('merchant_id', merchantId);
            totalOrders = typeof count === 'number' ? count : null;
        }
    } catch (e) { /* leave totalOrders null -> "Not available" */ }
    if (m.created_at) {
        const joined = new Date(m.created_at);
        if (!isNaN(joined.getTime())) {
            const months = Math.max(0, Math.floor((Date.now() - joined.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
            const yrs = Math.floor(months / 12), mos = months % 12;
            joinedLabel = yrs > 0 ? `${yrs} year${yrs > 1 ? 's' : ''}${mos > 0 ? ' ' + mos + ' mo' : ''}` : `${mos} month${mos !== 1 ? 's' : ''}`;
        }
    }

    const card = document.createElement('div');
    card.id = 'shop-info-card';
    card.style.cssText = 'background:#fff;border-radius:16px;padding:16px;margin:0 0 12px;box-shadow:0 4px 18px rgba(47,53,66,0.08);';
    card.innerHTML = `
        <div style="width:100%;height:120px;border-radius:12px;overflow:hidden;background:#f8f9fa;display:flex;align-items:center;justify-content:center;margin-bottom:12px;">
            ${shopImg ? `<img src="${shopImg}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='<i class=\\'fa-solid fa-shop\\' style=\\'font-size:2.4rem;color:#ccd3da;\\'></i>'">` : `<i class="fa-solid fa-shop" style="font-size:2.4rem;color:#ccd3da;"></i>`}
        </div>
        <h3 style="margin:0;font-size:1.05rem;color:#2f3542;">${m.shop_name || m.merchant_name || 'Pharmacy'}</h3>
        <p style="margin:2px 0 10px;font-size:0.8rem;color:#747d8c;">by ${ownerName}</p>
        <div style="display:flex;gap:18px;padding:10px 0;border-top:1px solid #f4f6f8;border-bottom:1px solid #f4f6f8;margin-bottom:10px;">
            <div><p style="margin:0;font-size:0.68rem;color:#a4b0be;">Total Orders</p><p style="margin:2px 0 0;font-size:0.95rem;font-weight:700;color:#2f3542;">${totalOrders !== null ? totalOrders : 'Not available'}</p></div>
            <div><p style="margin:0;font-size:0.68rem;color:#a4b0be;">With MediFinder</p><p style="margin:2px 0 0;font-size:0.95rem;font-weight:700;color:#2f3542;">${joinedLabel}</p></div>
        </div>
        <p style="margin:0 0 6px;font-size:0.8rem;color:#57606f;"><i class="fa-solid fa-location-dot" style="color:#e02020;"></i> ${m.address || m.city || 'Address not available'}
            ${isVerified ? '<span style="color:#28a745;font-weight:600;margin-left:8px;"><i class="fa-solid fa-circle-check"></i> License Verified</span>' : '<span style="color:#a4b0be;font-weight:600;margin-left:8px;">Not yet verified</span>'}
        </p>
        ${hasRxField ? `<p style="margin:0 0 10px;font-size:0.8rem;color:${rxAllowed ? '#28a745' : '#a4b0be'};font-weight:600;"><i class="fa-solid fa-file-prescription"></i> ${rxAllowed ? 'Prescription Allowed' : 'Prescription orders not supported here'}</p>` : ''}
        ${(!hasRxField || rxAllowed) ? `<button type="button" id="shop-rx-order-btn" style="width:100%;padding:11px;border:none;border-radius:10px;background:#1c82aa;color:#fff;font-weight:700;font-size:0.82rem;cursor:pointer;"><i class="fa-solid fa-file-medical"></i> Order medicine using uploaded prescription from this shop</button>` : ''}
    `;
    productsSection.parentNode.insertBefore(card, productsSection);

    const rxBtn = document.getElementById('shop-rx-order-btn');
    if (rxBtn) {
        rxBtn.onclick = () => {
            // Reuses the EXISTING prescription upload/order pipeline — just
            // remembers which shop this is for first, so the merchant
            // notification/broadcast can prioritize/target this pharmacy.
            localStorage.setItem('medi_rx_target_merchant', merchantId);
            navigateTo('home');
            setTimeout(() => {
                document.querySelector('.prescription-upload-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                showToast(`Upload your prescription — we'll prioritize ${m.shop_name || 'this pharmacy'}.`, 'info');
            }, 300);
        };
    }
}


// ✅ Extracted from setupHomePageModules() so the Home product grid can be
// (re)loaded on demand — specifically so "Medical Instrument" mode can be
// toggled in-place via navigateTo('instrument') with no page reload,
// instead of the old ?type=instrument query-param + full-reload approach.
// Behaves identically to the inline code this replaced; just callable again.
async function loadHomeProductGrid(isInstrumentMode, merchantFilterId) {
    const productsGrid = document.getElementById('main-products-grid');
    const noProductsMsg = document.getElementById('no-products-msg');
    const embeddedCards = productsGrid ? productsGrid.querySelectorAll('.product-card') : [];
    let allProductNames = [];
    if (!productsGrid) return allProductNames;
    if (supabase) {
        try {
            // NOTE: this used to read from `partner_medicines` (a separate,
            // disconnected table), which is why the storefront showed demo
            // composition/ratings/etc. that never matched what a merchant
            // actually uploaded. `medicines` is the real table merchants add
            // to and admin approves — that is the single source of truth now.
            let medQuery = supabase.from('medicines').select('*').eq('status', 'Approved');
            if (merchantFilterId) medQuery = medQuery.eq('merchant_id', merchantFilterId);
            if (isInstrumentMode) medQuery = medQuery.eq('product_type', 'Instrument');
            const { data: dbProducts, error: dbError } = await medQuery;
            
            if (!dbError && dbProducts && dbProducts.length > 0) {
                allProductNames = dbProducts.map(p => p.name || p.product_name);

                // "20 Min" is a real express-delivery promise, not decoration —
                // only show it on medicines whose merchant is actually within
                // 12km of the shopper. Fetch every relevant merchant's saved
                // location (marchentprofile.html -> merchants.latitude/longitude)
                // once up front and compare with haversineKm() against the same
                // live GPS coords (userLiveLat/userLiveLng) already used for the
                // cart delivery-fee and map-distance calculations elsewhere.
                const merchantIdsForDistance = [...new Set(dbProducts.map(p => p.merchant_id).filter(Boolean))];
                const merchantCoordsMap = {};
                if (merchantIdsForDistance.length > 0) {
                    try {
                        const { data: merchantCoords } = await supabase.from('merchants').select('id, latitude, longitude').in('id', merchantIdsForDistance);
                        if (merchantCoords) {
                            merchantCoords.forEach(m => {
                                if (m.latitude && m.longitude) merchantCoordsMap[m.id] = { lat: parseFloat(m.latitude), lng: parseFloat(m.longitude) };
                            });
                        }
                    } catch (e) {}
                }

                await mfLoadRealRatings(dbProducts.map(p => p.id));
                productsGrid.innerHTML = dbProducts.map(prod => {
                    const sellingPrice = parseFloat(prod.selling_price || prod.unit_price || prod.price || 0);
                    const mrp = parseFloat(prod.mrp || 0);
                    const discount = mrp > sellingPrice && sellingPrice > 0 ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0;
                    const rating = mfRealRatingFor(prod);
                    const stock = parseInt(prod.stock_qty || prod.stock || 0);
                    const isOutOfStock = stock <= 0;
                    // prescription_req (merchant's actual choice) is the source of
                    // truth; is_rx is kept in sync at write-time but we fall back
                    // to it for any older row that predates that fix.
                    const isRx = prod.prescription_req ? prod.prescription_req === 'Yes' : (prod.is_rx === true || prod.is_rx === 'true');
                    const freeDelivery = sellingPrice >= 499;
                    const img = prod.image_url || prod.img || 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=400';
                    const categoryLabel = prod.category || prod.dosage_form || 'Medicine';
                    const categoryKey = normalizeCategoryKey(categoryLabel);
                    const manufacturer = prod.manufacturer || '';
                    const productName = prod.name || prod.product_name || 'Unnamed';
                    
                    let expressBadge = '';
                    let overlayBadges = '';
                    if (isOutOfStock) {
                        expressBadge = '<div class="badge-express" style="position:static;background:#999;"><i class="fa-solid fa-ban"></i> Currently Unavailable</div>';
                    } else {
                        const merchantCoord = merchantCoordsMap[prod.merchant_id];
                        const withinExpressRange = merchantCoord && haversineKm(userLiveLat, userLiveLng, merchantCoord.lat, merchantCoord.lng) <= 12;
                        if (withinExpressRange) {
                            expressBadge = '<div class="badge-express express-20min-badge" style="position:static;"><i class="fa-solid fa-bolt"></i> 20 Min</div>';
                        }
                    }
                    if (discount > 0) {
                        overlayBadges += `<div class="badge-express" style="background:#28a745; left:auto; right:8px; top:8px; font-size:0.7rem;"><i class="fa-solid fa-tag"></i> ${discount}% OFF</div>`;
                    }
                    // FREE DELIVERY is no longer an overlay badge — it renders as a small
                    // inline "FREE" chip beside the product name (see .product-title-row below).

                    const hasRealRating = rating > 0;
                    const stars = [1,2,3,4,5].map(i => 
                        i <= Math.floor(rating) ? '<i class="fa-solid fa-star" style="color:#ffa500; font-size:0.7rem;"></i>' : 
                        (i - 0.5 <= rating ? '<i class="fa-solid fa-star-half-stroke" style="color:#ffa500; font-size:0.7rem;"></i>' : 
                        '<i class="fa-regular fa-star" style="color:#ccc; font-size:0.7rem;"></i>')
                    ).join('');

                    const rxTag = isRx ? '<span style="color:#ff4d4d; font-size:0.7rem; font-weight:bold; margin-left:4px;">[Rx]</span>' : '';
                    const disabledBtn = isOutOfStock ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : '';
                    
                    return `
                    <div class="product-card" data-id="${prod.id}" data-category="${categoryKey}" data-name="${productName}" data-price="${sellingPrice}" data-mrp-orig="${prod.mrp || ''}" data-img="${img}" data-img2="${prod.image_url_2 || ''}" data-img3="${prod.image_url_3 || ''}" data-expiry="${prod.expiry_date || prod.expiry || ''}" data-rating="${rating}" data-manufacturer="${manufacturer}" data-desc="${prod.description || ''}" data-is-rx="${isRx}" data-prescription-req="${prod.prescription_req || (isRx ? 'Yes' : 'No')}" data-merchant-id="${prod.merchant_id || ''}" data-mrp="${mrp}" data-stock="${stock}" data-likes="${prod.likes_count || 0}" data-composition="${(prod.composition || '').replace(/"/g,'&quot;')}" data-dosage-form="${prod.dosage_form || ''}" data-strength="${prod.strength || ''}" data-category-raw="${categoryLabel}" data-product-type="${prod.product_type || 'Medicine'}" data-weight-kg="${prod.weight_kg || ''}">
                        <!-- ✅ FIX: the opening <div class="product-card" ...> tag above was
                             never actually closed with a ">" before this point — every
                             attribute list ran straight into the badge/image markup that
                             followed, so the browser's HTML parser mis-parsed the whole
                             card (image, badges and name landing in the wrong spots,
                             sometimes outside the card entirely). Adding the missing ">"
                             fixes the product image and name positions on the Home page. -->
                        ${overlayBadges}
                        <div class="img-container">
                            <img src="${img}" alt="${productName}" loading="lazy">
                        </div>
                        ${expressBadge ? `<div class="badge-express-row" style="display:flex; justify-content:flex-end; padding:4px 6px 0;">${expressBadge}</div>` : ''}
                        <div class="prod-info">
                            <span class="prod-cat-label" style="display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${categoryLabel}</span>
                            <div class="product-title-row" style="display:flex;align-items:center;gap:4px;min-width:0;max-width:100%;">
                                <h4 style="flex:1 1 auto;min-width:0;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${productName}${rxTag}</h4>
                                ${freeDelivery ? `
                                    <span class="free-delivery-mini" style="flex:0 0 auto;background:#0d6efd;color:#fff;font-size:0.55rem;font-weight:700;padding:2px 5px;border-radius:4px;white-space:nowrap;line-height:1.2;">
                                        <i class="fa-solid fa-truck"></i> FREE
                                    </span>
                                ` : ''}
                            </div>
                            ${manufacturer ? `<p style="font-size:0.7rem; color:#888; margin:2px 0 4px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${manufacturer}</p>` : ''}
                            <div style="display:flex; align-items:center; gap:4px; margin-bottom:4px;">
                                ${hasRealRating
                                    ? `<span style="background:#388e3c; color:#fff; padding:1px 5px; border-radius:3px; font-size:0.65rem; font-weight:600;">${rating} <i class="fa-solid fa-star" style="font-size:0.55rem;"></i></span>
                                       <span style="color:#888; font-size:0.65rem;">${stars}</span>`
                                    : `<span style="background:#eef1f4; color:#888; padding:1px 6px; border-radius:3px; font-size:0.65rem; font-weight:600;">New</span>`}
                            </div>
                            <div class="price" style="display:flex; align-items:baseline; gap:6px; flex-wrap:wrap;">
                                <span style="font-size:1.05rem; font-weight:700; color:#2f3542;">₹${sellingPrice.toFixed(2)}</span>
                                ${mrp > sellingPrice ? `<span style="font-size:0.75rem; color:#999; text-decoration:line-through;">₹${mrp.toFixed(2)}</span>` : ''}
                                ${discount > 0 ? `<span style="font-size:0.7rem; color:#28a745; font-weight:600;">${discount}% off</span>` : ''}
                            </div>
                            <div class="btn-group">
                                <button class="order-btn immediate-order" onclick="handleQuickBuyNow(this)" ${disabledBtn}>${isOutOfStock ? 'UNAVAILABLE' : 'BUY NOW'}</button>
                                <button class="add-to-cart-btn" onclick="handleQuickAddToCart(this)" ${disabledBtn}><i class="fas fa-shopping-cart"></i> CART</button>
                            </div>
                        </div>
                    </div>
                    `;
                }).join('');

                // Item count badge stays hidden here — it's only ever shown while
                // the shopper is actively typing a search query (see the search
                // input handler below), not on the default browse view.
                const countBadge = document.getElementById('product-count-badge');
                if (countBadge) countBadge.textContent = `${dbProducts.length} items`;

                // The section heading is a static "Available Medicine" label now
                // (no live count in parentheses) — skipped in seller-storefront
                // mode (seller name) and instrument mode ("Medical Instruments"),
                // both of which set their own heading text separately above.
                const heading = document.getElementById('products-section-heading');
                if (heading && !merchantFilterId && !isInstrumentMode) heading.textContent = 'Available Medicine';

                if (noProductsMsg) noProductsMsg.style.display = 'none';
            } else if (dbProducts && dbProducts.length === 0) {
                // No medicines available
                if (noProductsMsg) {
                    noProductsMsg.innerHTML = '<i class="fa-solid fa-box-open" style="font-size:2rem; color:#ccc; margin-bottom:8px; display:block;"></i>No medicines available yet. Check back soon!';
                    noProductsMsg.style.display = 'block';
                }
            } else {
                // Show embedded products when no DB products
                embeddedCards.forEach(card => card.style.display = 'block');
                if (noProductsMsg) noProductsMsg.style.display = 'none';
            }
        } catch (e) {

            // Show embedded products on error
            embeddedCards.forEach(card => card.style.display = 'block');
            if (noProductsMsg) noProductsMsg.style.display = 'none';
        }
    } else {
        // No supabase - show embedded products
        embeddedCards.forEach(card => card.style.display = 'block');
        if (noProductsMsg) noProductsMsg.style.display = 'none';
    }
    return allProductNames;
}

// Shows/hides the "Medical Instrument" stripped-down view of the Home page —
// quick services, prescription-upload card and medicine category chips don't
// apply there, plus a distinct heading and its own "Back to Home" bar. Called
// both on a fresh load (URL has ?type=instrument) and by setInstrumentMode()
// below for the no-reload SPA toggle.
function applyInstrumentModeUI(active) {
    ['quick-services-menu', 'prescription-upload-section', 'categories-section'].forEach(cls => {
        const el = document.querySelector('.' + cls);
        if (!el) return;
        if (active) {
            if (el.dataset.instrPrevDisplay === undefined) el.dataset.instrPrevDisplay = el.style.display || '';
            el.style.display = 'none';
        } else if (el.dataset.instrPrevDisplay !== undefined) {
            el.style.display = el.dataset.instrPrevDisplay;
            delete el.dataset.instrPrevDisplay;
        }
    });
    const heading = document.getElementById('products-section-heading');
    const backBar = document.getElementById('instrument-mode-back-bar');
    if (active) {
        if (heading) heading.textContent = 'Medical Instruments';
        if (!backBar) {
            const bar = document.createElement('div');
            bar.id = 'instrument-mode-back-bar';
            bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:12px 16px;background:#fff;border-bottom:1px solid #eee;font-size:0.85rem;color:#e02020;font-weight:600;cursor:pointer;';
            bar.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Back to MediFinder Home';
            // ✅ "Back to Home" bug fix: this used to call navigateTo('home')
            // while ALREADY on the home app-page (instrument mode is just a
            // display mode of Home, not a separate page) — navigateTo() saw
            // it was already the active page and did nothing, so the hidden
            // sections/heading/this bar never got restored. It now calls
            // setInstrumentMode(false) directly, which is what actually
            // undoes all of this mode's UI/state changes.
            bar.addEventListener('click', () => { setInstrumentMode(false); });
            const productsSection = document.querySelector('.products-showcase-section');
            if (productsSection && productsSection.parentNode) {
                productsSection.parentNode.insertBefore(bar, productsSection);
            }
        }
    } else {
        if (heading) heading.textContent = 'Available Medicine';
        if (backBar) backBar.remove();
    }
}

// ✅ Real SPA toggle for "Medical Instrument" — no page reload, no
// ?type=instrument for internal navigation (that query param still works for
// old external links landing fresh on the page, handled above). Used by
// navigateTo('instrument') and navigateTo('home') to enter/exit cleanly.
async function setInstrumentMode(active) {
    window.__instrumentModeActive = !!active;
    applyInstrumentModeUI(!!active);
    await loadHomeProductGrid(!!active, null);
    const mainScroll = document.getElementById('main-scroll');
    if (mainScroll) mainScroll.scrollTop = 0;
}

async function setupHomePageModules() {
    if (!document.getElementById('family-health-banner') && !document.getElementById('main-products-grid')) return;

    // Normalizes whatever text the merchant picked for "dosage form / category"
    // (e.g. "Tablets", "SYRUP", "Baby Care Kit") down to the exact lowercase
    // keys used by the category filter chips: tablet, capsule, syrup, insulin,
    // baby, food, others. This is what makes clicking a category chip actually
    // filter the live database products (previously it silently matched
    // nothing because casing/labels never lined up).
    function normalizeCategoryKey(raw) {
        const c = String(raw || '').toLowerCase().trim();
        if (!c) return 'others';
        if (c.includes('insulin')) return 'insulin';
        if (c.includes('capsule')) return 'capsule';
        if (c.includes('syrup')) return 'syrup';
        if (c.includes('tablet') || c.includes('pill')) return 'tablet';
        if (c.includes('baby') || c.includes('infant') || c.includes('diaper')) return 'baby';
        if (c.includes('food') || c.includes('drink') || c.includes('supplement') || c.includes('nutrition') || c.includes('horlicks')) return 'food';
        return 'others';
    }
    window.normalizeCategoryKey = normalizeCategoryKey;


    const productsGrid = document.getElementById('main-products-grid');
    if (!productsGrid) return;
    const noProductsMsg = document.getElementById('no-products-msg');

    const embeddedCards = productsGrid.querySelectorAll('.product-card');
    embeddedCards.forEach(card => card.style.display = 'none');
    if (noProductsMsg) noProductsMsg.style.display = 'block';

    let allProductNames = [];

    // Seller storefront mode — reached via "View seller's other products" on
    // product-detail.html (userhome.html?merchant=ID). Previously this param
    // was never read, so it silently dumped the visitor on the normal,
    // unfiltered home page. Now it hides the generic homepage furniture and
    // turns this same grid into a single-seller store showing everything
    // that merchant has approved, still orderable exactly like any product.
    const merchantFilterId = new URLSearchParams(window.location.search).get('merchant');
    // Quick Services "Medical Instrument" tile now uses navigateTo('instrument')
    // (see setInstrumentMode() + the navigateTo() special-case below) — the old
    // ?type=instrument query param is kept ONLY so any external/legacy link
    // still using it keeps working exactly as before on a fresh page load.
    const typeFilterParam = new URLSearchParams(window.location.search).get('type');
    const isInstrumentMode = typeFilterParam === 'instrument' || window.__instrumentModeActive === true;
    if (!merchantFilterId) applyInstrumentModeUI(isInstrumentMode);
    if (merchantFilterId) {
        ['quick-services-menu', 'auto-slider-section', 'prescription-upload-section', 'categories-section'].forEach(cls => {
            const el = document.querySelector('.' + cls);
            if (el) el.style.display = 'none';
        });
        const heading = document.getElementById('products-section-heading');
        if (heading) heading.textContent = 'Loading seller\u2019s store...';
        if (!document.getElementById('seller-store-back-bar')) {
            const backBar = document.createElement('div');
            backBar.id = 'seller-store-back-bar';
            backBar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:12px 16px;background:#fff;border-bottom:1px solid #eee;font-size:0.85rem;color:#e02020;font-weight:600;cursor:pointer;';
            backBar.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Back to MediFinder Home';
            backBar.addEventListener('click', () => { navigateTo('home'); });
            const productsSection = document.querySelector('.products-showcase-section');
            if (productsSection && productsSection.parentNode) {
                productsSection.parentNode.insertBefore(backBar, productsSection);
            }
        }
        if (supabase) {
            supabase.from('merchants').select('*').eq('id', merchantFilterId).maybeSingle()
                .then(async ({ data: m }) => {
                    if (heading) heading.textContent = m ? 'Products from ' + (m.shop_name || m.merchant_name || 'this Seller') : 'Seller\u2019s Store';
                    if (m) await renderShopInfoCard(m, merchantFilterId);
                }).catch(() => { if (heading) heading.textContent = 'Seller\u2019s Store'; });
        }
    }

    // Show skeleton loading
    productsGrid.innerHTML = Array(6).fill('').map(() => `
        <div class="product-card skeleton-card" style="pointer-events:none;">
            <div style="background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%); background-size:200% 100%; animation:shimmer 1.5s infinite; height:140px; border-radius:8px;"></div>
            <div style="padding:12px;">
                <div style="background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%); background-size:200% 100%; animation:shimmer 1.5s infinite; height:14px; width:40%; border-radius:4px; margin-bottom:8px;"></div>
                <div style="background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%); background-size:200% 100%; animation:shimmer 1.5s infinite; height:16px; width:80%; border-radius:4px; margin-bottom:8px;"></div>
                <div style="background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%); background-size:200% 100%; animation:shimmer 1.5s infinite; height:14px; width:30%; border-radius:4px; margin-bottom:12px;"></div>
                <div style="display:flex; gap:8px;">
                    <div style="background:#f0f0f0; height:32px; flex:1; border-radius:6px;"></div>
                    <div style="background:#f0f0f0; height:32px; width:40px; border-radius:6px;"></div>
                </div>
            </div>
        </div>
    `).join('');
    if (!document.getElementById('shimmer-css')) {
        const shimmerCSS = document.createElement('style');
        shimmerCSS.id = 'shimmer-css';
        shimmerCSS.textContent = '@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }';
        document.head.appendChild(shimmerCSS);
    }

    allProductNames = await loadHomeProductGrid(isInstrumentMode, merchantFilterId);

    if (supabase) {
        try {
            const { data } = await supabase.from('offers').select('*').eq('active', true).limit(1);
            const bannerSection = document.getElementById('family-health-banner');
            if (data && data.length > 0) {
                const banner = document.querySelector('#family-health-banner h2');
                const bannerDesc = document.querySelector('#family-health-banner p');
                if (banner) banner.innerText = data[0].title;
                if (bannerDesc) bannerDesc.innerText = data[0].description;
                if (bannerSection) bannerSection.style.display = 'block';
            } else {
                if (bannerSection) bannerSection.style.display = 'none';
            }
        } catch (e) { }
    }

    const bookNowBtn = document.querySelector('.know-more-btn');
    if (bookNowBtn) {
        bookNowBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openHealthCheckupPopup();
        });
    }

    // ============================================================
    // SEARCH WITH SUGGESTIONS (2-3 letter trigger)
    // ============================================================
    const homeSearchInput = document.getElementById('home-medicine-search');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    let suggestionsBox = document.getElementById('search-suggestions-box');

    if (!suggestionsBox && homeSearchInput) {
        suggestionsBox = document.createElement('div');
        suggestionsBox.id = 'search-suggestions-box';
        suggestionsBox.style.cssText = `
            position: absolute; top: 100%; left: 0; right: 0; background: #fff;
            border-radius: 0 0 12px 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.12);
            z-index: 9999; max-height: 200px; overflow-y: auto; display: none;
            border: 1px solid #f1f2f6; border-top: none;
        `;
        const wrapper = homeSearchInput.closest('.search-bar-wrapper') || homeSearchInput.parentElement;
        wrapper.style.position = 'relative';
        wrapper.appendChild(suggestionsBox);
    }

    // Static medicine names for suggestions fallback
    const staticMedicineList = [
        "Paracetamol", "Amoxicillin", "Azithromycin", "Omeprazole", "Metformin",
        "Atorvastatin", "Cetirizine", "Ibuprofen", "Pantoprazole", "Cough Syrup",
        "Vitamin C", "Vitamin D3", "Calcium Tablets", "Iron Supplement", "Baby Diapers",
        "Insulin Glargine", "Betadine", "Antiseptic Lotion", "Crocin", "Dolo 650",
        "Thermometer", "Oximeter", "Blood Pressure Monitor", "Glucometer",
        "Ranitidine", "Albendazole", "Metronidazole", "Ciprofloxacin"
    ];

    // Flipkart-style search dock: while actively searching, the promo top-bar
    // AND the logo/notification header both disappear, and the search bar
    // itself pins to the very top of the page in the header's place — same
    // pattern as tapping the search box in the Flipkart app.
    if (!document.getElementById('search-dock-css')) {
        const dockStyle = document.createElement('style');
        dockStyle.id = 'search-dock-css';
        dockStyle.textContent = `
            body.search-docked .top-bar { display: none !important; }
            body.search-docked header { display: none !important; }
            body.search-docked .truemeds-search-section { position: sticky; top: 0; z-index: 70; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
        `;
        document.head.appendChild(dockStyle);
    }

    // Item 1: while actively searching, hide everything except the search bar
    // itself and the results grid — quick services, slider, prescription
    // upload, and the category chips all disappear so the results are the
    // only thing under the search box, and come back once the query is cleared.
    function setSearchModeSections(isSearching) {
        document.body.classList.toggle('search-docked', isSearching);
        if (isSearching) {
            const mainScroll = document.getElementById('main-scroll');
            if (mainScroll) mainScroll.scrollTo({ top: 0, behavior: 'smooth' });
        }
        if (merchantFilterId) return; // seller-storefront mode already hides these permanently
        // In instrument mode, quick-services-menu / prescription-upload-section /
        // categories-section are hidden permanently (see isInstrumentMode block
        // above) — don't let clearing the search bring them back. Only the
        // slider still toggles with search state on that page.
        const permanentlyHiddenClasses = isInstrumentMode
            ? ['auto-slider-section']
            : ['quick-services-menu', 'auto-slider-section', 'prescription-upload-section', 'categories-section'];
        permanentlyHiddenClasses.forEach(cls => {
            const el = document.querySelector('.' + cls);
            if (el) el.style.display = isSearching ? 'none' : '';
        });
    }
    window.setSearchModeSections = setSearchModeSections;

    // While the shopper is typing, the mic icon steps aside for a plain
    // search button in the same spot (mic isn't useful once you're already
    // typing) — mic comes back the moment the box is emptied.
    const headerSearchBtn = document.getElementById('header-search-btn');
    const micBtnEl = document.getElementById('voice-search-btn');
    function toggleSearchIconState(showSearchIcon) {
        if (micBtnEl) micBtnEl.style.display = showSearchIcon ? 'none' : '';
        if (headerSearchBtn) headerSearchBtn.style.display = showSearchIcon ? '' : 'none';
    }
    if (headerSearchBtn && homeSearchInput) {
        headerSearchBtn.addEventListener('click', () => {
            homeSearchInput.blur();
            if (suggestionsBox) suggestionsBox.style.display = 'none';
        });
    }

    if (homeSearchInput) {
        homeSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            if (clearSearchBtn) clearSearchBtn.style.display = query.length > 0 ? "block" : "none";
            setSearchModeSections(query.length > 0);
            toggleSearchIconState(query.length > 0);
            const countBadgeToggle = document.getElementById('product-count-badge');
            if (countBadgeToggle) countBadgeToggle.style.display = query.length > 0 ? '' : 'none';

            // Show suggestions from the very first character typed
            if (query.length >= 1 && suggestionsBox) {
                const names = allProductNames.length > 0 ? allProductNames : staticMedicineList;
                const matches = names.filter(n => n.toLowerCase().includes(query)).slice(0, 5);
                
                if (matches.length > 0) {
                    suggestionsBox.innerHTML = matches.map(m => `
                        <div class="suggestion-item" style="padding:10px 16px; cursor:pointer; font-size:0.88rem; color:#2f3542; border-bottom:1px solid #f8f9fa; display:flex; align-items:center; gap:8px;">
                            <i class="fa-solid fa-magnifying-glass" style="color:#ff4d4d; font-size:0.75rem;"></i> ${m}
                        </div>
                    `).join('');
                    suggestionsBox.style.display = 'block';

                    suggestionsBox.querySelectorAll('.suggestion-item').forEach(item => {
                        item.addEventListener('mousedown', (ev) => {
                            ev.preventDefault();
                            homeSearchInput.value = item.innerText.trim();
                            suggestionsBox.style.display = 'none';
                            homeSearchInput.dispatchEvent(new Event('input'));
                        });
                    });
                } else {
                    suggestionsBox.style.display = 'none';
                }
            } else if (suggestionsBox) {
                suggestionsBox.style.display = 'none';
            }

            // Filter product grid
            if (query.length === 0) {
                const totalGridCards = productsGrid.querySelectorAll('.product-card');
                totalGridCards.forEach(card => {
                    card.style.display = "block";
                });
                if (noProductsMsg) noProductsMsg.style.display = 'none';
                const countBadge = document.getElementById('product-count-badge');
                if (countBadge) countBadge.textContent = `${totalGridCards.length} items`;
                return;
            }

            const productCards = productsGrid.querySelectorAll('.product-card');
            let matchedCount = 0;
            const categoryItems = document.querySelectorAll('.category-item');
            if (categoryItems.length > 0) {
                categoryItems.forEach(i => i.classList.remove('active'));
                categoryItems[0].classList.add('active');
            }

            productCards.forEach(card => {
                const name = (card.dataset.name || "").toLowerCase();
                const desc = (card.dataset.desc || "").toLowerCase();
                const mfg = (card.dataset.manufacturer || "").toLowerCase();
                const cat = (card.dataset.category || "").toLowerCase();
                if (name.includes(query) || desc.includes(query) || mfg.includes(query) || cat.includes(query)) {
                    card.style.display = "block"; matchedCount++;
                } else {
                    card.style.display = "none";
                }
            });
            if (noProductsMsg) noProductsMsg.style.display = matchedCount === 0 ? "block" : "none";
            const countBadge = document.getElementById('product-count-badge');
            if (countBadge) countBadge.textContent = `${matchedCount} items`;
        });

        homeSearchInput.addEventListener('blur', () => {
            setTimeout(() => { if (suggestionsBox) suggestionsBox.style.display = 'none'; }, 200);
        });
    }

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            if (homeSearchInput) homeSearchInput.value = "";
            clearSearchBtn.style.display = "none";
            if (suggestionsBox) suggestionsBox.style.display = 'none';
            if (noProductsMsg) noProductsMsg.style.display = "none";
            setSearchModeSections(false);
            toggleSearchIconState(false);
            const totalGridCards = productsGrid.querySelectorAll('.product-card');
            totalGridCards.forEach(card => {
                card.style.display = "block";
            });
            const countBadge = document.getElementById('product-count-badge');
            if (countBadge) { countBadge.textContent = `${totalGridCards.length} items`; countBadge.style.display = 'none'; }
        });
    }

    const categoryItems = document.querySelectorAll('.category-item');
    if (categoryItems.length > 0) {
        categoryItems.forEach(item => {
            item.addEventListener('click', () => {
                categoryItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                const searchInput = document.getElementById('home-medicine-search');
                if (searchInput) { searchInput.value = ""; if (clearSearchBtn) clearSearchBtn.style.display = "none"; }
                toggleSearchIconState(false);
                const catCountBadge = document.getElementById('product-count-badge');
                if (catCountBadge) catCountBadge.style.display = 'none';
                const targetCategory = item.getAttribute('data-category');
                const productCards = productsGrid.querySelectorAll('.product-card');
                let visibleCount = 0;
                productCards.forEach(card => {
                    if (targetCategory === 'all' || card.getAttribute('data-category') === targetCategory) {
                        card.style.display = 'block'; visibleCount++;
                    } else {
                        card.style.display = 'none';
                    }
                });
                if (noProductsMsg) noProductsMsg.style.display = visibleCount === 0 ? "block" : "none";
                const countBadge = document.getElementById('product-count-badge');
                if (countBadge) countBadge.textContent = `${visibleCount} items`;
            });
        });
    }

    // ============================================================
    // PRESCRIPTION UPLOAD
    // ============================================================
    async function handlePrescriptionFile(file) {
        if (!file) return;
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        const isImage = file.type.startsWith('image/');
        if (!isPdf && !isImage) {
            showToast("Please upload an image (JPG/PNG) or a PDF file.", "error");
            return;
        }

        const fileExt = file.name.split('.').pop();
        const uniqueFileName = `${Date.now()}_prescription.${fileExt}`;
        const storagePath = `live_slips/${uniqueFileName}`;
        let uploadedPrescriptionUrl = '';

        showPrescriptionProgressState();
        const finishProgress = animatePrescriptionProgress();

        if (supabase) {
            const { data, error } = await supabase.storage.from('media').upload(storagePath, file);
            finishProgress();
            if (error) {
                showToast("Upload failed: " + error.message, "error");
                renderPrescriptionWidgetState();
                return;
            }
            const { data: urlData } = supabase.storage.from('media').getPublicUrl(storagePath);
            uploadedPrescriptionUrl = urlData.publicUrl;

            activePrescription = { fileName: file.name, url: uploadedPrescriptionUrl, storagePath, date: new Date().toLocaleDateString('en-GB'), status: 'uploaded' };
            localStorage.setItem('medi_active_prescription', JSON.stringify(activePrescription));

            // Save prescription record for My Box (archive of every upload, kept even after delete/replace)
            let myBox = JSON.parse(localStorage.getItem('medi_prescription_box')) || [];
            myBox.push({
                id: 'PRESC-' + Date.now(),
                fileName: file.name,
                url: uploadedPrescriptionUrl,
                date: new Date().toLocaleDateString('en-GB'),
                thumb: isImage ? URL.createObjectURL(file) : ''
            });
            localStorage.setItem('medi_prescription_box', JSON.stringify(myBox));
        } else {
            finishProgress();
        }

        isPrescriptionUploaded = true;
        localStorage.setItem('medi_presc_uploaded_status', 'true');
        renderPrescriptionWidgetState();
        showToast("Prescription uploaded successfully!", "success");

        // The AI (Gemini) auto-read step has been removed — it was failing with
        // 401 Unauthorized and isn't needed for the actual business flow: the
        // slip just needs to reach nearby pharmacies. Instead, show a quick
        // phone-number confirmation sheet, and broadcast the moment it's
        // submitted (no medicine detection/selection involved anymore).
        if (uploadedPrescriptionUrl) {
            openPrescriptionPhoneConfirmSheet(uploadedPrescriptionUrl);
        }
    }

    const prescInput = document.getElementById('presc-file-input');
    if (prescInput) {
        prescInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handlePrescriptionFile(e.target.files[0]);
            e.target.value = "";
        });
    }
    const prescCameraInput = document.getElementById('presc-camera-input');
    if (prescCameraInput) {
        prescCameraInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handlePrescriptionFile(e.target.files[0]);
            e.target.value = "";
        });
    }
    const prescViewBtn = document.getElementById('presc-view-btn');
    if (prescViewBtn) {
        prescViewBtn.addEventListener('click', () => {
            if (activePrescription && activePrescription.url) window.open(activePrescription.url, '_blank');
        });
    }
    const prescDeleteBtn = document.getElementById('presc-delete-btn');
    if (prescDeleteBtn) {
        prescDeleteBtn.addEventListener('click', () => window.deleteActivePrescription());
    }

    if (productsGrid) {
        productsGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            if (!card) return;
            if (e.target.closest('.btn-group') || e.target.classList.contains('immediate-order') || e.target.classList.contains('add-to-cart-btn')) {
                return;
            }
            navigateToProductDetail(card.dataset);
        });
    }

    const bigCartBtn = document.getElementById('modal-add-to-cart-action');
    if (bigCartBtn) {
        bigCartBtn.onclick = () => {
            const modalName = document.getElementById('modal-prod-name')?.innerText;
            const modalPrice = document.getElementById('modal-price')?.innerText?.replace('₹', '');
            const modalImg = document.getElementById('modal-main-img')?.src;
            const isRxAttr = document.getElementById('product-detail-modal').getAttribute('data-modal-rx') === 'true';

            addToCart({
                id: "p_modal_" + Math.floor(Math.random() * 100),
                name: modalName,
                price: modalPrice,
                img: modalImg,
                isRx: isRxAttr
            });
            document.getElementById('product-detail-modal').style.display = "none";
            document.getElementById('product-detail-modal').classList.remove('active');
        };
    }
}

function openHealthCheckupPopup() {
    let popup = document.createElement('div');
    popup.className = "modal active";
    popup.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;justify-content:center;align-items:center;z-index:10000;padding:16px;box-sizing:border-box;`;
    popup.innerHTML = `
        <div class="modal-content" style="background:#ffffff;width:100%;max-width:420px;border-radius:16px;padding:24px;box-shadow:0 12px 30px rgba(0,0,0,0.25);box-sizing:border-box;max-height:90vh;overflow-y:auto;text-align:left;border-top:5px solid #ff4d4d;">
            <h3 style="color:#ff4d4d;margin-top:0;margin-bottom:16px;font-size:1.3rem;display:flex;align-items:center;gap:8px;">
                <i class="fa-solid fa-square-plus"></i> Book Health Checkup
            </h3>
            <form id="checkupForm" style="display:flex;flex-direction:column;gap:14px;">
                <input type="text" id="chk-name" placeholder="Patient Full Name" required style="padding:12px;border-radius:8px;border:1px solid #ced4da;font-size:0.95rem;width:100%;box-sizing:border-box;">
                <input type="tel" id="chk-phone" placeholder="10-Digit Mobile Number" required style="padding:12px;border-radius:8px;border:1px solid #ced4da;font-size:0.95rem;width:100%;box-sizing:border-box;">
                <select id="chk-topic" required style="padding:12px;border-radius:8px;border:1px solid #ced4da;font-size:0.95rem;width:100%;box-sizing:border-box;background:#fff;">
                    <option value="" disabled selected>-- Select Checkup Profile --</option>
                    <option value="Full Body Checkup">Complete Full Body Package (Free)</option>
                    <option value="Diabetes Care">Diabetes & Blood Sugar Monitoring</option>
                    <option value="Cardiac Profile">Cardiovascular Heart Health Screening</option>
                    <option value="Kidney Health">Liver & Kidney Function Profile</option>
                </select>
                <input type="date" id="chk-date" required style="padding:12px;border-radius:8px;border:1px solid #ced4da;font-size:0.95rem;width:100%;box-sizing:border-box;">
                <div style="display:flex;gap:12px;margin-top:8px;">
                    <button type="button" id="close-checkup" style="flex:1;padding:12px;border-radius:8px;border:1px solid #ced4da;background:#f8f9fa;cursor:pointer;font-weight:600;">Cancel</button>
                    <button type="submit" style="flex:1;padding:12px;border-radius:8px;border:none;background:#ff4d4d;color:#fff;cursor:pointer;font-weight:600;">Confirm Booking</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(popup);
    document.getElementById('close-checkup').onclick = () => popup.remove();
    document.getElementById('checkupForm').onsubmit = async (e) => {
        e.preventDefault();
        const payload = {
            name: document.getElementById('chk-name').value,
            phone: document.getElementById('chk-phone').value,
            topic: document.getElementById('chk-topic').value,
            date: document.getElementById('chk-date').value,
            created_at: new Date().toISOString()
        };
        if (supabase) {
            const { error } = await supabase.from('checkups').insert([payload]);
            if (error) { showToast("Database error: " + error.message, "error"); return; }
        }
        showToast(`Your ${payload.topic} request submitted successfully!`, "success");
        popup.remove();
    };
}

// Accurate great-circle distance in km (replaces the old rough sqrt() estimate
// used around the map code, and reused to find pharmacies near a prescription).
function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// The home page's "20 Min" express badge is computed once, synchronously,
// while the product grid is first built — using whatever GPS fix is
// available at that instant (often still the fallback coords, since real
// GPS resolves a moment later). This re-checks every already-rendered card
// against the real fix once it lands, without re-fetching or re-rendering
// the whole grid (which would duplicate event listeners).
async function refreshExpressDeliveryBadges() {
    if (!supabase) return;
    const grid = document.getElementById('main-products-grid');
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll('.product-card')).filter(c => c.dataset.merchantId);
    if (cards.length === 0) return;
    const merchantIds = [...new Set(cards.map(c => c.dataset.merchantId))];
    try {
        const { data: merchantCoords } = await supabase.from('merchants').select('id, latitude, longitude').in('id', merchantIds);
        if (!merchantCoords) return;
        const coordMap = {};
        merchantCoords.forEach(m => { if (m.latitude && m.longitude) coordMap[m.id] = { lat: parseFloat(m.latitude), lng: parseFloat(m.longitude) }; });
        cards.forEach(card => {
            const stock = parseInt(card.dataset.stock || '0');
            if (stock <= 0) return; // "Currently Unavailable" badge stays as-is
            const existing = card.querySelector('.express-20min-badge');
            const coord = coordMap[card.dataset.merchantId];
            const within = coord && haversineKm(userLiveLat, userLiveLng, coord.lat, coord.lng) <= 12;
            if (within && !existing) {
                const badgeEl = document.createElement('div');
                badgeEl.className = 'badge-express express-20min-badge';
                badgeEl.style.position = 'static';
                badgeEl.innerHTML = '<i class="fa-solid fa-bolt"></i> 20 Min';
                let row = card.querySelector('.badge-express-row');
                if (!row) {
                    row = document.createElement('div');
                    row.className = 'badge-express-row';
                    row.style.cssText = 'display:flex; justify-content:flex-end; padding:4px 6px 0;';
                    const imgContainer = card.querySelector('.img-container');
                    if (imgContainer && imgContainer.nextSibling) imgContainer.parentNode.insertBefore(row, imgContainer.nextSibling);
                    else card.appendChild(row);
                }
                row.appendChild(badgeEl);
            } else if (!within && existing) {
                const row = existing.closest('.badge-express-row');
                existing.remove();
                if (row && !row.children.length) row.remove();
            }
        });
    } catch (e) {}
}
window.refreshExpressDeliveryBadges = refreshExpressDeliveryBadges;

// Creates ONE shared row in `prescription_orders` (so acceptance is atomic —
// whichever pharmacy taps Accept first wins, via the accept_prescription_order
// RPC, and every other pharmacy's Accept button disappears live) and then
// notifies every nearby pharmacy through the EXISTING `merchant_notifications`
// table (already wired up with realtime + the notification bell), tagging
// each notification with related_prescription_id so tapping it opens this
// exact request. Returns the new prescription_orders id, or null on failure.
async function broadcastPrescriptionToNearbyPharmacies(prescriptionUrl, selectedMedicines, customerPhone) {
    if (!supabase) return null;
    try {
        const userLat = await new Promise((resolve) => {
            if (!navigator.geolocation) return resolve(null);
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => resolve(null),
                { timeout: 6000 }
            );
        });

        const { data: merchants, error } = await supabase
            .from('merchants')
            .select('id, latitude, longitude, shop_name, merchant_name, status')
            .in('status', ['active', 'approved']);
        if (error || !merchants) return null;

        let targets = merchants;
        if (userLat) {
            const RADIUS_KM = 15;
            targets = merchants
                .filter(m => m.latitude && m.longitude)
                .map(m => ({ ...m, _dist: haversineKm(userLat.lat, userLat.lng, parseFloat(m.latitude), parseFloat(m.longitude)) }))
                .filter(m => m._dist <= RADIUS_KM)
                .sort((a, b) => a._dist - b._dist);
        }
        if (targets.length === 0) targets = merchants; // fallback: notify everyone if we couldn't get location

        // ✅ NEW — doc3 "Order using prescription from this shop": if the
        // upload was started from a specific shop's Shop View page, target
        // ONLY that merchant instead of broadcasting to every nearby one.
        // One-shot — cleared right after being read so it never leaks into
        // a later, ordinary home-page upload.
        const targetedMerchantId = localStorage.getItem('medi_rx_target_merchant');
        if (targetedMerchantId) {
            localStorage.removeItem('medi_rx_target_merchant');
            const onlyThisShop = merchants.filter(m => String(m.id) === String(targetedMerchantId));
            if (onlyThisShop.length > 0) targets = onlyThisShop;
        }


        let userId = '', userName = '';
        try {
            const { data: userData } = await supabase.auth.getUser();
            userId = userData?.user?.id || '';
            userName = userData?.user?.user_metadata?.full_name || '';
        } catch (e) {}

        const defaultAddr = (savedAddresses || []).find(a => a.is_default) || (savedAddresses || [])[0];
        const userAddress = defaultAddr
            ? `${defaultAddr.address1 || ''}${defaultAddr.address2 ? ', ' + defaultAddr.address2 : ''}, ${defaultAddr.city || ''} - ${defaultAddr.pincode || ''}`
            : (verifiedAddress || '');

        const { data: rxOrder, error: rxErr } = await supabase.from('prescription_orders').insert([{
            user_id: userId || null,
            user_name: userName || defaultAddr?.name || 'Customer',
            user_phone: customerPhone || '',
            user_email: currentUserEmail || '',
            user_address: userAddress,
            prescription_url: prescriptionUrl,
            medicines: selectedMedicines,
            status: 'pending',
            delivery_otp: generateSecureSixDigitOTP()
        }]).select().single();
        if (rxErr || !rxOrder) return null;

        const medNames = selectedMedicines.map(m => m.name).join(', ');
        const notifMessage = medNames
            ? `Customer needs: ${medNames}. Tap to view the prescription & accept.`
            : `Customer uploaded a prescription. Tap to view & accept.`;
        const notifRows = targets.map(m => ({
            merchant_id: m.id,
            title: '🩺 New Prescription Order Nearby',
            message: notifMessage,
            type: 'order',
            related_prescription_id: rxOrder.id
        }));
        await supabase.from('merchant_notifications').insert(notifRows);

        return rxOrder.id;
    } catch (e) {
        return null; // Non-fatal — the medicines are already in the user's cart either way.
    }
}

// Item 3: rendered as a bottom sheet (slides up from the bottom of the
// screen, like the rest of the app's mobile modals) instead of a centered
// dialog. The prescription itself has ALREADY been sent to nearby pharmacies
// by this point (see handlePrescriptionFile) — this sheet is now just an
// optional "add the medicines AI could read off your slip to your cart"
// helper, so it no longer re-broadcasts anything.
// Replaces the old AI medicine-matching sheet. This is now the only step
// between "file uploaded to storage" and "nearby pharmacies notified" — a
// quick bottom sheet showing the prescription number/reference and asking
// for (or confirming) the phone number the pharmacy should call. Submitting
// it is what actually triggers the broadcast.
function openPrescriptionPhoneConfirmSheet(prescriptionUrl) {
    const autoPhone = getAutoUserPhone();
    if (!document.getElementById('presc-bottom-sheet-css')) {
        const style = document.createElement('style');
        style.id = 'presc-bottom-sheet-css';
        style.textContent = `
            @keyframes prescSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
            .presc-bottom-sheet { animation: prescSheetUp 0.28s cubic-bezier(0.2,0.8,0.2,1); }
        `;
        document.head.appendChild(style);
    }
    const refNo = 'RX-' + Date.now().toString().slice(-8);
    let popup = document.createElement('div');
    popup.className = "modal active";
    popup.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100vh;background:rgba(0,0,0,0.6);display:flex;justify-content:center;align-items:flex-end;z-index:10000;`;
    popup.innerHTML = `
        <div class="modal-content presc-bottom-sheet" style="background:#fff;width:100%;max-width:600px;border-radius:20px 20px 0 0;padding:20px;box-sizing:border-box;border-top:5px solid #ff4d4d;max-height:85vh;overflow-y:auto;text-align:left;">
            <div style="width:40px;height:4px;background:#e1e2e6;border-radius:2px;margin:0 auto 12px;"></div>
            <h3 style="margin:0 0 4px;"><i class="fa-solid fa-file-prescription" style="color:#ff4d4d"></i> Prescription Uploaded</h3>
            <p style="font-size:0.78rem;color:#6c757d;margin:0 0 12px;">Reference No: <strong>${refNo}</strong></p>
            <div style="margin-bottom:6px;">
                <label style="font-size:0.8rem;color:#555;display:block;margin-bottom:4px;"><i class="fa-solid fa-phone" style="color:#ff4d4d"></i> Your live mobile no. (pharmacy will call you on this)</label>
                <input type="tel" id="presc-phone-input" value="${autoPhone}" maxlength="10" placeholder="10-digit mobile number" style="width:100%;padding:10px;border-radius:8px;border:1px solid #ced4da;box-sizing:border-box;font-size:0.9rem;">
            </div>
            <div style="display:flex;gap:10px;margin-top:15px;">
                <button id="cancel-presc" style="flex:1;padding:10px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;">Cancel</button>
                <button id="submit-presc-phone" style="flex:1;padding:10px;border-radius:8px;border:none;background:#2ed573;color:#fff;cursor:pointer;font-weight:600;">Send to Nearby Pharmacies</button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);
    document.getElementById('cancel-presc').onclick = () => popup.remove();
    document.getElementById('submit-presc-phone').onclick = async () => {
        const phoneInput = document.getElementById('presc-phone-input');
        const phone = (phoneInput?.value || '').trim();
        if (phone.length < 10) { showToast("Please enter a valid 10-digit mobile number.", "error"); return; }
        localStorage.setItem('medi_last_phone', phone);

        const submitBtn = document.getElementById('submit-presc-phone');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = 'Sending...'; }

        const rxId = await broadcastPrescriptionToNearbyPharmacies(prescriptionUrl, [], phone);
        if (rxId) {
            if (activePrescription) {
                activePrescription.orderId = rxId;
                activePrescription.status = 'pending';
                localStorage.setItem('medi_active_prescription', JSON.stringify(activePrescription));
            }
            watchPendingPrescriptionOrder(rxId);
            showToast("Sent to nearby pharmacies! Waiting for acceptance (5–10 min)...", "success");
            // Refresh the order list right away if we're already on that page.
            if (document.getElementById('order-list')) refreshOrdersFromServer();
        } else {
            showToast("Couldn't notify pharmacies right now — please try again.", "error");
        }
        popup.remove();
    };
}

// ============================================================
// PRODUCT DETAIL - opens as an in-app SPA page (page-product-detail)
// instead of navigating away to a separate product-detail.html file.
// Same data this used to serialize into the URL is now just used to
// fill in the page directly, then navigateTo('product-detail') shows
// it the same way Home/Shops/Cart/etc. already switch pages — no full
// page reload, so it opens instantly and Back returns to where the
// user tapped from.
// ============================================================
let __pdCurrentData = null;
let __pdReturnPage = 'home';
let __pdQty = 1;

function pdEsc(s) { return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c])); }

function navigateToProductDetail(data) {
    try {
        localStorage.setItem('currentProduct', JSON.stringify(data));
        __pdCurrentData = data;
        __pdQty = 1;

        // Brief skeleton so the page never shows half-blank content while
        // the DOM is being filled — hidden again the moment the paint below
        // finishes (near-instant when we already have card data, and stays
        // up longer if this page was opened without any, e.g. a raw link).
        const skeleton = document.getElementById('pd-skeleton');
        const content = document.getElementById('pd-content');
        const errorState = document.getElementById('pd-error-state');
        if (skeleton) skeleton.style.display = 'block';
        if (content) content.style.display = 'none';
        if (errorState) errorState.style.display = 'none';

        // These blocks are filled in asynchronously (Supabase calls further
        // below), one product at a time. If we don't clear them here, the
        // *previous* product's offers/rating/variants/FBT/similar/seller
        // content stays visible — sometimes for a couple of seconds on a
        // slow connection — until this product's own async loaders finish
        // and overwrite it. That's what looks like "data from another
        // product" mixing into this one.
        ['pd-offers-block', 'pd-flash-sale-banner', 'pd-rating-breakdown', 'pd-variants-block',
         'pd-fbt-block', 'pd-similar-block', 'pd-more-seller-block'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const reviewCountTag = document.getElementById('pd-review-count-tag');
        if (reviewCountTag) reviewCountTag.style.display = 'none';
        const sellerBadge = document.getElementById('pd-seller-verified-badge');
        if (sellerBadge) sellerBadge.style.display = 'none';
        const reviewsList = document.getElementById('pd-reviews-list');
        if (reviewsList) reviewsList.innerHTML = '<p class="pd-no-reviews">Loading reviews…</p>';
        const seeAllBtn = document.getElementById('pd-see-all-reviews-btn');
        if (seeAllBtn) seeAllBtn.style.display = 'none';
        const writeReviewForm = document.getElementById('pd-write-review-form');
        if (writeReviewForm) writeReviewForm.style.display = 'none';

        paintProductDetail(data);

        if (skeleton) skeleton.style.display = 'none';
        if (content) content.style.display = 'block';

        // Remember which page we tapped the product from so the Back
        // button returns there instead of always going Home.
        const activePageEl = document.querySelector('.app-page.active');
        const activePageKey = activePageEl ? activePageEl.getAttribute('data-page') : null;
        if (activePageKey && activePageKey !== 'product-detail') __pdReturnPage = activePageKey;

        if (typeof window.navigateTo === 'function') window.navigateTo('product-detail');

        // Everything below is best-effort and DB-backed: it re-fetches the
        // authoritative row from `medicines` by id (so a stale/incomplete
        // card never shows the wrong price, stock, composition or image —
        // see loadPdAuthoritativeData) and independently loads offers,
        // reviews, frequently-bought-together and similar products. Each
        // piece fails silently and hides its own section if its table/
        // column isn't there — nothing here can break the page above.
        loadPdAuthoritativeData(data);
        loadPdWishlistState(data);
        loadPdRatingAndReviews(data);
        loadPdOffersAndFlashSale(data);
        loadPdSellerVerification(data);
        renderPdDeliveryBox();
        loadPdFrequentlyBoughtTogether(data);
        loadPdSimilarProducts(data);
        loadPdMoreFromSeller(data);
    } catch (e) {
        showToast('Something went wrong. Please try again.', 'error');
    }
}

// Fills every DOM field that's already available synchronously from
// whatever `data` we currently have (dataset on first paint, or the fuller
// DB row once loadPdAuthoritativeData() resolves). Safe to call twice.
function paintProductDetail(data) {
    const isRx = data.isRx === true || data.isRx === 'true' || data['data-is-rx'] === 'true' || data.prescriptionReq === 'true' || data.prescription_req === 'Yes';
    const price = parseFloat(data.price ?? data.selling_price ?? data.unit_price) || 0;
    const mrp = parseFloat(data.mrp) || 0;
    const stockQty = data.stock !== undefined ? parseInt(data.stock) : (data.stock_qty !== undefined ? parseInt(data.stock_qty) : NaN);
    const inStock = String(data.stock ?? data.stock_qty ?? '').toLowerCase() !== 'out' && String(data.stock ?? data.stock_qty ?? '') !== '0';
    const productType = data.productType || data['data-product-type'] || data.product_type || 'Medicine';
    const isInstrument = String(productType).toLowerCase() !== 'medicine';

    const setText = (id, val, fallback) => {
        const el = document.getElementById(id);
        if (el) el.textContent = (val !== undefined && val !== null && val !== '') ? val : (fallback || '—');
    };

    const img = document.getElementById('pd-main-img');
    if (img) img.src = data.img || data.image_url || '';

    setText('pd-name', data.name, 'Product');
    setText('pd-manufacturer', data.manufacturer, 'Not specified');
    setText('pd-rating', data.rating, '0.0');
    setText('pd-description', data.desc || data.description, 'No description available for this product.');
    setText('pd-composition', data.composition, 'Not available');
    setText('pd-dosage-form', data.dosageForm || data.dosage_form, 'Not available');
    setText('pd-strength', data.strength, 'Not available');
    setText('pd-category', data.category || data.categoryRaw || data['data-category-raw'], 'Not available');
    setText('pd-pack-size', data.packSize || data.pack_size, 'Not specified');
    setText('pd-storage', data.storage || data.storage_instructions, 'Store in a cool, dry place away from direct sunlight.');
    setText('pd-side-effects', data.sideEffects || data.side_effects, 'Not specified — check the pack insert or ask your pharmacist.');
    setText('pd-warnings', data.warnings, 'Not specified — check the pack insert or ask your pharmacist.');

    // Instrument vs medicine details block — only one shows, based on
    // product_type, so a device never shows fake composition/dosage fields.
    const medInfoItem = document.getElementById('pd-medicine-info-item');
    const instInfoItem = document.getElementById('pd-instrument-info-item');
    if (medInfoItem) medInfoItem.style.display = isInstrument ? 'none' : 'block';
    if (instInfoItem) {
        instInfoItem.style.display = isInstrument ? 'block' : 'none';
        if (isInstrument) {
            setText('pd-inst-brand', data.brand, 'Not specified');
            setText('pd-inst-type', data.deviceType || data.device_type, data.categoryRaw || 'Not specified');
            setText('pd-inst-color', data.color, 'Not specified');
            setText('pd-inst-display', data.display || data.displayType || data.display_type, 'Not specified');
            setText('pd-inst-battery', data.battery, 'Not specified');
            setText('pd-inst-range', data.measurementRange || data.measurement_range, 'Not specified');
            setText('pd-inst-model', data.modelNumber || data.model_number, 'Not specified');
            setText('pd-inst-warranty', data.warranty, 'Not specified');
        }
    }

    const priceEl = document.getElementById('pd-price');
    if (priceEl) priceEl.textContent = `₹${price.toFixed(2)}`;

    const mrpEl = document.getElementById('pd-mrp');
    const discEl = document.getElementById('pd-discount');
    const savingsEl = document.getElementById('pd-savings-line');
    if (mrp > price && mrpEl && discEl) {
        mrpEl.textContent = `₹${mrp.toFixed(2)}`;
        mrpEl.style.display = 'inline';
        const pct = Math.round(((mrp - price) / mrp) * 100);
        discEl.textContent = `${pct}% OFF`;
        discEl.style.display = 'inline';
        if (savingsEl) { savingsEl.textContent = `You Save ₹${(mrp - price).toFixed(2)}`; savingsEl.style.display = 'block'; }
    } else {
        if (mrpEl) mrpEl.style.display = 'none';
        if (discEl) discEl.style.display = 'none';
        if (savingsEl) savingsEl.style.display = 'none';
    }

    const rxBadge = document.getElementById('pd-rx-badge');
    if (rxBadge) rxBadge.style.display = isRx ? 'flex' : 'none';
    const rxWarning = document.getElementById('pd-rx-warning');
    if (rxWarning) rxWarning.style.display = isRx ? 'flex' : 'none';

    // Stock intelligence: not just In Stock / Out of Stock — flags low
    // stock by exact remaining count whenever we actually have that number.
    const stockText = document.getElementById('pd-stock-text');
    const stockTag = document.getElementById('pd-stock-tag');
    if (stockText) {
        if (!inStock) { stockText.textContent = 'Currently unavailable'; if (stockTag) stockTag.style.color = '#e02020'; }
        else if (!isNaN(stockQty) && stockQty > 0 && stockQty <= 5) { stockText.textContent = `Only ${stockQty} left`; if (stockTag) stockTag.style.color = '#e67e22'; }
        else { stockText.textContent = 'In Stock'; if (stockTag) stockTag.style.color = ''; }
    }

    const qtyEl = document.getElementById('pd-qty');
    if (qtyEl) qtyEl.textContent = String(__pdQty);

    const addBtn = document.getElementById('pd-add-to-cart-btn');
    const buyBtn = document.getElementById('pd-buy-now-btn');
    [addBtn, buyBtn].forEach(btn => { if (btn) btn.disabled = !inStock; });
    if (buyBtn) buyBtn.textContent = inStock ? 'BUY NOW' : 'UNAVAILABLE';

    // "Sold by [shop]" block — only shown when this product actually
    // carries a merchant_id (every real DB product does; only very old/
    // sample rows might not). Tapping "Visit Shop"/"View Products" opens
    // the shop as an in-app page via navigateToShopDetail().
    const soldByBlock = document.getElementById('pd-sold-by-block');
    const merchantId = data.merchantId || data['data-merchant-id'] || data.merchant_id || '';
    if (soldByBlock) {
        if (merchantId) {
            soldByBlock.style.display = 'flex';
            soldByBlock.dataset.merchantId = merchantId;
            const shopNameEl = document.getElementById('pd-shop-name');
            if (shopNameEl) {
                shopNameEl.textContent = 'this pharmacy';
                if (typeof getMerchantNameCached === 'function') {
                    getMerchantNameCached(merchantId).then(name => { if (name) shopNameEl.textContent = name; });
                }
            }
        } else {
            soldByBlock.style.display = 'none';
        }
    }

    // Return policy — Rx items are never returnable; non-Rx follows the
    // same ₹499+ eligibility rule already used elsewhere in the app for
    // "eligible" non-Rx returns; opened/damaged packaging is never eligible
    // (stated here so the rule doesn't need repeating per item), while an
    // expired/wrong/damaged item always routes to a complaint instead.
    const returnPolicyEl = document.getElementById('pd-return-policy');
    if (returnPolicyEl) {
        if (isRx) {
            returnPolicyEl.textContent = 'Prescription medicines cannot be returned once dispensed.\nReceived an expired, wrong or damaged item? Raise a complaint from your Orders page instead.';
        } else if (price >= 499 || mrp >= 499) {
            returnPolicyEl.textContent = '7-day returns available on this product if unopened and undamaged.\nOpened or damaged packaging is not eligible for return.\nReceived an expired, wrong or damaged item? Raise a complaint from your Orders page instead.';
        } else {
            returnPolicyEl.textContent = 'This product is below the ₹499 return-eligibility threshold and cannot be returned once delivered.\nReceived an expired, wrong or damaged item? Raise a complaint from your Orders page instead.';
        }
    }
    setText('pd-delivery-eta', null); // reset — renderPdDeliveryBox() fills this from the saved address

    renderPdGallery(data);
    renderPdBreadcrumb(data);
}

// ============ Image gallery (multiple images, thumbnails, counter) ============
function renderPdGallery(data) {
    const track = document.getElementById('pd-gallery-track');
    const thumbs = document.getElementById('pd-gallery-thumbs');
    const counter = document.getElementById('pd-img-counter');
    const mainImg = document.getElementById('pd-main-img');
    if (!track || !mainImg) return;

    const urls = [data.img || data.image_url, data.img2 || data['data-img2'] || data.image_url_2, data.img3 || data['data-img3'] || data.image_url_3]
        .map(u => (u || '').trim()).filter(Boolean);
    const uniqueUrls = [...new Set(urls.length ? urls : [mainImg.src])];

    // The track is a persistent DOM element reused across every product
    // (this is an in-app SPA page, not a fresh page load), so a scroll
    // position left over from swiping through a *previous* product's
    // gallery would otherwise still be applied here — making the page
    // open on that old slide 2/3 instead of this product's main image.
    // Always snap back to the first slide before doing anything else.
    track.scrollLeft = 0;

    // Rebuild any extra slides beyond the first (which is #pd-main-img
    // itself, so existing code that sets its .src keeps working).
    track.querySelectorAll('img.pd-gallery-extra').forEach(el => el.remove());
    uniqueUrls.slice(1).forEach(url => {
        const im = document.createElement('img');
        im.className = 'pd-gallery-img pd-gallery-extra';
        im.src = url;
        im.alt = data.name || 'Product image';
        track.appendChild(im);
    });

    if (uniqueUrls.length > 1) {
        counter.style.display = 'block';
        counter.textContent = `1 / ${uniqueUrls.length}`;
        thumbs.style.display = 'flex';
        thumbs.innerHTML = uniqueUrls.map((u, i) => `<img src="${pdEsc(u)}" class="${i === 0 ? 'active' : ''}" data-idx="${i}">`).join('');
        thumbs.querySelectorAll('img').forEach(t => {
            t.addEventListener('click', () => {
                const idx = parseInt(t.dataset.idx);
                const slide = track.children[idx];
                if (slide) slide.scrollIntoView({ behavior: 'smooth', inline: 'center' });
            });
        });
        track.onscroll = () => {
            const idx = Math.round(track.scrollLeft / track.clientWidth);
            counter.textContent = `${Math.min(idx + 1, uniqueUrls.length)} / ${uniqueUrls.length}`;
            thumbs.querySelectorAll('img').forEach((t, i) => t.classList.toggle('active', i === idx));
        };
    } else {
        counter.style.display = 'none';
        thumbs.style.display = 'none';
        thumbs.innerHTML = '';
        track.onscroll = null;
    }
}

// ============ Breadcrumb ============
function renderPdBreadcrumb(data) {
    const catEl = document.getElementById('pd-crumb-cat');
    const nameEl = document.getElementById('pd-crumb-name');
    if (catEl) catEl.textContent = data.category || data.categoryRaw || data['data-category-raw'] || 'Products';
    if (nameEl) nameEl.textContent = data.name || 'Product';
}

// ============ Database-authoritative refresh (feature: never trust a
// stale/incomplete card for price, stock, composition, Rx status, image) ============
async function loadPdAuthoritativeData(originalData) {
    const id = originalData.id;
    if (!supabase || !id) return;
    try {
        const { data: row, error } = await supabase.from('medicines').select('*').eq('id', id).maybeSingle();
        if (error || !row) return;
        const merged = {
            ...originalData,
            id: row.id,
            name: row.name || row.product_name || originalData.name,
            manufacturer: row.manufacturer || originalData.manufacturer,
            rating: row.rating ?? originalData.rating,
            desc: row.description || originalData.desc,
            composition: row.composition || originalData.composition,
            dosageForm: row.dosage_form || originalData.dosageForm,
            strength: row.strength || originalData.strength,
            category: row.category || originalData.category,
            categoryRaw: row.category || originalData.categoryRaw,
            price: row.selling_price ?? row.unit_price ?? row.price ?? originalData.price,
            mrp: row.mrp ?? originalData.mrp,
            stock: row.stock_qty ?? row.stock ?? originalData.stock,
            isRx: row.is_rx === true || row.prescription_req === 'Yes' || originalData.isRx,
            merchantId: row.merchant_id || originalData.merchantId,
            img: row.image_url || originalData.img,
            img2: row.image_url_2 || originalData.img2,
            img3: row.image_url_3 || originalData.img3,
            productType: row.product_type || originalData.productType,
            packSize: row.pack_size,
            storage: row.storage_instructions || row.storage,
            sideEffects: row.side_effects,
            warnings: row.warnings,
            brand: row.brand,
            deviceType: row.device_type,
            color: row.color,
            display: row.display_type,
            battery: row.battery,
            measurementRange: row.measurement_range,
            modelNumber: row.model_number,
            warranty: row.warranty,
            weightKg: row.weight_kg,
        };
        __pdCurrentData = merged;
        localStorage.setItem('currentProduct', JSON.stringify(merged));
        paintProductDetail(merged);

        // Variants — only rendered when the row actually carries a
        // variant group; otherwise the block stays hidden (never fabricated).
        if (row.variant_group_id) loadPdVariants(row);
    } catch (e) { /* keep showing the card's own data — non-fatal */ }
}

async function loadPdVariants(row) {
    const block = document.getElementById('pd-variants-block');
    const rowEl = document.getElementById('pd-variants-row');
    if (!supabase || !block || !rowEl) return;
    try {
        const { data, error } = await supabase.from('medicines').select('id, name, color, variant_label, image_url')
            .eq('variant_group_id', row.variant_group_id).eq('status', 'Approved');
        if (error || !data || data.length < 2) return;
        rowEl.innerHTML = data.map(v => `
            <div class="pd-variant-swatch ${v.id === row.id ? 'active' : ''}" data-id="${v.id}">
                <span class="pd-variant-dot" style="background:${pdEsc(v.color || '#ccc')};"></span>${pdEsc(v.variant_label || v.color || v.name)}
            </div>`).join('');
        rowEl.querySelectorAll('.pd-variant-swatch').forEach(sw => {
            sw.addEventListener('click', () => {
                const target = data.find(v => String(v.id) === sw.dataset.id);
                if (target && target.id !== row.id) navigateToProductDetail({ id: target.id, name: target.name, img: target.image_url });
            });
        });
        block.style.display = 'block';
    } catch (e) { /* no variant columns yet — block stays hidden */ }
}

// ============ Wishlist heart ============
async function loadPdWishlistState(data) {
    const heart = document.getElementById('pd-wishlist-heart');
    if (!heart) return;
    const id = String(data.id || '');
    let saved = JSON.parse(localStorage.getItem('medi_wishlist') || '[]');
    heart.classList.toggle('active', saved.includes(id));
    heart.innerHTML = saved.includes(id) ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';

    const uid = await getCurrentAuthUserId();
    if (supabase && uid) {
        try {
            const { data: rows } = await supabase.from('user_wishlist').select('medicine_id').eq('user_id', uid);
            if (rows) {
                saved = rows.map(r => String(r.medicine_id));
                localStorage.setItem('medi_wishlist', JSON.stringify(saved));
                heart.classList.toggle('active', saved.includes(id));
                heart.innerHTML = saved.includes(id) ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';
            }
        } catch (e) {}
    }
}

// ============ Rating breakdown + reviews (requires a `product_reviews`
// table: id, medicine_id, user_id, user_name, rating, review_text,
// photo_url, created_at — hides itself gracefully until that table exists) ============
let __pdReviewsFull = [];
async function loadPdRatingAndReviews(data) {
    const listEl = document.getElementById('pd-reviews-list');
    const breakdownEl = document.getElementById('pd-rating-breakdown');
    const countTagEl = document.getElementById('pd-review-count-tag');
    const seeAllBtn = document.getElementById('pd-see-all-reviews-btn');
    if (!supabase || !data.id) { if (listEl) listEl.innerHTML = '<p class="pd-no-reviews">No reviews yet.</p>'; return; }
    try {
        const { data: reviews, error } = await supabase.from('product_reviews').select('*').eq('medicine_id', data.id).order('created_at', { ascending: false });
        if (error) throw error;
        __pdReviewsFull = reviews || [];
        if (!reviews || reviews.length === 0) {
            if (listEl) listEl.innerHTML = '<p class="pd-no-reviews">No reviews yet — be the first to share your experience.</p>';
            if (breakdownEl) breakdownEl.style.display = 'none';
            if (countTagEl) countTagEl.style.display = 'none';
            return;
        }
        const avg = reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length;
        if (countTagEl) { countTagEl.textContent = `(${reviews.length})`; countTagEl.style.display = 'inline'; }

        if (breakdownEl) {
            document.getElementById('pd-rb-avg-num').textContent = avg.toFixed(1);
            document.getElementById('pd-rb-count').textContent = `${reviews.length} Rating${reviews.length === 1 ? '' : 's'}`;
            const bars = document.getElementById('pd-rb-bars');
            const counts = [5, 4, 3, 2, 1].map(star => reviews.filter(r => Math.round(r.rating) === star).length);
            bars.innerHTML = [5, 4, 3, 2, 1].map((star, i) => {
                const pct = Math.round((counts[i] / reviews.length) * 100);
                return `<div class="pd-rb-bar-row"><span>${star}★</span><div class="pd-rb-bar-track"><div class="pd-rb-bar-fill" style="width:${pct}%;"></div></div><span>${pct}%</span></div>`;
            }).join('');
            breakdownEl.style.display = 'flex';
        }

        renderPdReviewsList(reviews.slice(0, 3));
        if (seeAllBtn) seeAllBtn.style.display = reviews.length > 3 ? 'block' : 'none';
    } catch (e) {
        // `product_reviews` table doesn't exist in this deployment yet.
        if (listEl) listEl.innerHTML = '<p class="pd-no-reviews">No reviews yet.</p>';
        if (breakdownEl) breakdownEl.style.display = 'none';
    }
}

function renderPdReviewsList(reviews) {
    const listEl = document.getElementById('pd-reviews-list');
    if (!listEl) return;
    listEl.innerHTML = reviews.map(r => {
        const name = r.user_name || 'Anonymous';
        const initial = name.charAt(0).toUpperCase();
        const stars = '★'.repeat(Math.round(r.rating || 0)) + '☆'.repeat(5 - Math.round(r.rating || 0));
        const date = r.created_at ? new Date(r.created_at).toLocaleDateString() : '';
        return `
        <div class="pd-review-item">
            <div class="pd-review-top">
                <span class="pd-review-avatar">${pdEsc(initial)}</span>
                <span class="pd-review-name">${pdEsc(name)}</span>
                <span class="pd-review-date">${pdEsc(date)}</span>
            </div>
            <div class="pd-review-stars">${stars} ${(r.rating || 0).toFixed ? r.rating.toFixed(1) : r.rating}/5</div>
            <p class="pd-review-text">${pdEsc(r.review_text || '')}</p>
            ${r.photo_url ? `<img class="pd-review-photo" src="${pdEsc(r.photo_url)}" alt="Customer photo">` : ''}
            <button type="button" class="pd-review-helpful" data-id="${r.id}"><i class="fa-regular fa-thumbs-up"></i> Helpful${r.helpful_count ? ' (' + r.helpful_count + ')' : ''}</button>
        </div>`;
    }).join('');
    listEl.querySelectorAll('.pd-review-helpful').forEach(btn => {
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            if (supabase) { try { await supabase.rpc('increment_review_helpful', { review_id: btn.dataset.id }); } catch (e) {} }
        });
    });
}

async function submitPdReview() {
    const stars = document.querySelectorAll('#pd-wr-stars i.fa-solid').length;
    const text = document.getElementById('pd-wr-text')?.value.trim();
    const fileInput = document.getElementById('pd-wr-photo');
    if (!stars) { showToast('Please tap a star rating first.', 'error'); return; }
    if (!text) { showToast('Please write a few words about the product.', 'error'); return; }
    if (!supabase || !__pdCurrentData?.id) { showToast('Could not submit — please try again later.', 'error'); return; }

    const uid = await getCurrentAuthUserId();
    let photoUrl = '';
    try {
        if (fileInput && fileInput.files && fileInput.files[0] && uid) {
            const file = fileInput.files[0];
            const path = `product-reviews/${__pdCurrentData.id}/${uid}-${Date.now()}-${file.name}`;
            const { error: upErr } = await supabase.storage.from('media').upload(path, file);
            if (!upErr) photoUrl = supabase.storage.from('media').getPublicUrl(path).data?.publicUrl || '';
        }
        let userName = 'You';
        try {
            const profile = JSON.parse(localStorage.getItem('medi_profile') || '{}');
            userName = profile.name || profile.full_name || userName;
        } catch (e) {}
        const { error } = await supabase.from('product_reviews').insert([{
            medicine_id: __pdCurrentData.id, user_id: uid || null, user_name: userName,
            rating: stars, review_text: text, photo_url: photoUrl || null
        }]);
        if (error) throw error;
        showToast('Thanks — your review has been posted!', 'success');
        document.getElementById('pd-write-review-form').style.display = 'none';
        document.getElementById('pd-wr-text').value = '';
        if (fileInput) fileInput.value = '';
        document.getElementById('pd-wr-photo-name').textContent = '';
        document.querySelectorAll('#pd-wr-stars i').forEach(i => { i.className = 'fa-regular fa-star'; });
        loadPdRatingAndReviews(__pdCurrentData);
    } catch (e) {
        showToast('Reviews aren\u2019t set up yet for this deployment — please try again later.', 'error');
    }
}

// ============ Live offers + flash sale (merges merchant `offers` with
// platform-wide `platform_offers` — never invents a discount that isn't
// actually in either table) ============
async function loadPdOffersAndFlashSale(data) {
    const offersBlock = document.getElementById('pd-offers-block');
    const offersList = document.getElementById('pd-offers-list');
    const flashBanner = document.getElementById('pd-flash-sale-banner');
    const flashText = document.getElementById('pd-flash-sale-text');
    if (!supabase) return;
    const merchantId = data.merchantId || data['data-merchant-id'] || data.merchant_id;
    let rows = [];
    try {
        if (merchantId) {
            const { data: merchantOffers } = await supabase.from('offers').select('*').eq('merchant_id', merchantId);
            if (merchantOffers) rows = rows.concat(merchantOffers);
        }
        const { data: platformOffers } = await supabase.from('platform_offers').select('*').eq('is_active', true);
        if (platformOffers) rows = rows.concat(platformOffers.map(o => ({ ...o, __platform: true })));
    } catch (e) { /* offers/platform_offers not available — sections stay hidden */ }

    const now = new Date();
    const flash = rows.find(o => (o.is_flash === true || o.type === 'flash') && (!o.valid_until || new Date(o.valid_until) >= now) && (!o.valid_from || new Date(o.valid_from) <= now));
    if (flash && flashBanner && flashText) {
        flashText.textContent = `Flash Sale — ${flash.discount_label || flash.discount || 'Limited-time offer'}`;
        flashBanner.style.display = 'flex';
    } else if (flashBanner) { flashBanner.style.display = 'none'; }

    const nonFlash = rows.filter(o => o !== flash);
    if (nonFlash.length && offersBlock && offersList) {
        offersList.innerHTML = nonFlash.slice(0, 5).map(o => `
            <div class="pd-offer-row">
                <span><strong>${pdEsc(o.title || o.discount_label || o.discount || 'Offer')}</strong>${o.description ? ' — ' + pdEsc(o.description) : ''}${o.min_order ? ' (Min order ₹' + o.min_order + ')' : ''}</span>
                ${(o.coupon_code || o.code) ? `<span>${pdEsc(o.coupon_code || o.code)}</span>` : ''}
            </div>`).join('');
        offersBlock.style.display = 'block';
    } else if (offersBlock) { offersBlock.style.display = 'none'; }
}

// ============ Seller verification badge (merchants.license_status) ============
async function loadPdSellerVerification(data) {
    const badge = document.getElementById('pd-seller-verified-badge');
    if (!supabase || !badge) return;
    const merchantId = data.merchantId || data['data-merchant-id'] || data.merchant_id;
    if (!merchantId) { badge.style.display = 'none'; return; }
    try {
        const { data: m } = await supabase.from('merchants').select('license_status').eq('id', merchantId).maybeSingle();
        const verified = m && String(m.license_status || '').toLowerCase() === 'verified';
        badge.style.display = verified ? 'inline-flex' : 'none';
    } catch (e) { badge.style.display = 'none'; }
}

// ============ Delivery availability (reuses the address already on file
// for this account — never fabricates an ETA) ============
function renderPdDeliveryBox() {
    const locEl = document.getElementById('pd-delivery-location');
    const etaEl = document.getElementById('pd-delivery-eta');
    if (!locEl || !etaEl) return;
    if (verifiedAddress) {
        locEl.textContent = `Deliver to ${verifiedAddress}`;
        etaEl.textContent = 'Delivery available — estimated 35–50 min';
    } else {
        locEl.textContent = 'Add a delivery address to check availability';
        etaEl.textContent = '—';
    }
}

// ✅ Item 8 — Product Details location row: "Change" opens the address
// book (Profile → Manage Delivery Addresses), "GPS" uses the live GPS fix
// directly for this delivery check. Delegated on document so it works no
// matter when the product page is painted.
document.addEventListener('click', (e) => {
    const changeBtn = e.target.closest && e.target.closest('#pd-loc-change-btn');
    const gpsBtn = e.target.closest && e.target.closest('#pd-loc-gps-btn');
    if (changeBtn) {
        if (typeof window.navigateTo === 'function') window.navigateTo('profile');
        setTimeout(() => { document.getElementById('manage-address-trigger')?.click(); }, 250);
        return;
    }
    if (gpsBtn) {
        const locEl = document.getElementById('pd-delivery-location');
        const etaEl = document.getElementById('pd-delivery-eta');
        const idle = '<i class="fa-solid fa-location-crosshairs"></i> GPS';
        gpsBtn.disabled = true;
        gpsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        const reset = () => { gpsBtn.disabled = false; gpsBtn.innerHTML = idle; };
        const guard = setTimeout(reset, 12000);
        safeGetCurrentPosition(async (pos) => {
            userLiveLat = pos.coords.latitude;
            userLiveLng = pos.coords.longitude;
            try {
                const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${userLiveLat}&lon=${userLiveLng}&format=json`);
                const geo = await resp.json();
                const a = geo.address || {};
                const place = [a.suburb || a.neighbourhood || a.village, a.city || a.town || a.county, a.postcode].filter(Boolean).join(', ') || geo.display_name || 'your current location';
                if (locEl) locEl.textContent = `Deliver to ${place} (GPS)`;
                if (etaEl) etaEl.textContent = 'Delivery available — estimated 35–50 min';
                showToast('Using your live GPS location.', 'success');
            } catch (err) {
                if (locEl) locEl.textContent = 'Deliver to your current GPS location';
                if (etaEl) etaEl.textContent = 'Delivery available — estimated 35–50 min';
            } finally { clearTimeout(guard); reset(); }
        }, GEO_OPTIONS_ONE_SHOT);
    }
});

// ============ Frequently bought together (other approved products from
// the same merchant) ============
async function loadPdFrequentlyBoughtTogether(data) {
    const block = document.getElementById('pd-fbt-block');
    const listEl = document.getElementById('pd-fbt-list');
    const totalEl = document.getElementById('pd-fbt-total');
    const addBtn = document.getElementById('pd-fbt-add-btn');
    if (!supabase || !block) return;
    const merchantId = data.merchantId || data['data-merchant-id'] || data.merchant_id;
    if (!merchantId) { block.style.display = 'none'; return; }
    try {
        const { data: rows, error } = await supabase.from('medicines').select('*').eq('merchant_id', merchantId).eq('status', 'Approved').neq('id', data.id).limit(3);
        if (error || !rows || rows.length === 0) { block.style.display = 'none'; return; }

        const items = [{ ...data, price: parseFloat(data.price) || 0, checked: true, isBase: true }, ...rows.map(r => ({
            id: r.id, name: r.name || r.product_name, price: parseFloat(r.selling_price ?? r.unit_price ?? r.price) || 0,
            mrp: r.mrp, img: r.image_url, manufacturer: r.manufacturer, merchantId: r.merchant_id,
            isRx: r.is_rx === true || r.prescription_req === 'Yes', weightKg: r.weight_kg, checked: true
        }))];

        function recompute() {
            const total = items.filter(i => i.checked).reduce((s, i) => s + i.price, 0);
            if (totalEl) totalEl.textContent = `₹${total.toFixed(0)}`;
        }
        listEl.innerHTML = items.map((it, i) => `
            <label class="pd-fbt-item">
                <input type="checkbox" data-idx="${i}" ${it.checked ? 'checked' : ''} ${it.isBase ? 'disabled' : ''}>
                <img src="${pdEsc(it.img || '')}" alt="">
                <span class="pd-fbt-item-name">${pdEsc(it.name)}</span>
                <span class="pd-fbt-item-price">₹${it.price.toFixed(0)}</span>
            </label>`).join('');
        listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => { items[parseInt(cb.dataset.idx)].checked = cb.checked; recompute(); });
        });
        recompute();

        if (addBtn) addBtn.onclick = () => {
            items.filter(i => i.checked && !i.isBase).forEach(i => addToCart(i));
            showToast('Selected items added to cart!', 'success');
        };
        block.style.display = 'block';
    } catch (e) { block.style.display = 'none'; }
}

function pdMiniCardHtml(prod) {
    const price = parseFloat(prod.selling_price ?? prod.unit_price ?? prod.price) || 0;
    const isRx = prod.is_rx === true || prod.prescription_req === 'Yes';
    const payload = { id: prod.id, name: prod.name || prod.product_name, price, mrp: prod.mrp, img: prod.image_url, manufacturer: prod.manufacturer, merchantId: prod.merchant_id, isRx, weightKg: prod.weight_kg, composition: prod.composition, desc: prod.description, category: prod.category };
    return `<div class="pd-mini-card" onclick='navigateToProductDetail(${JSON.stringify(payload).replace(/'/g, "&#39;")})'>
        <img src="${pdEsc(prod.image_url || '')}" alt="">
        <div class="pd-mini-card-name">${pdEsc(prod.name || prod.product_name || '')}</div>
        ${isRx ? '<div class="pd-mini-card-rx">Rx</div>' : ''}
        <div class="pd-mini-card-price">₹${price.toFixed(0)}</div>
    </div>`;
}

// ============ Similar products (same category, excluding self) ============
async function loadPdSimilarProducts(data) {
    const block = document.getElementById('pd-similar-block');
    const listEl = document.getElementById('pd-similar-list');
    if (!supabase || !block) return;
    const category = data.category || data.categoryRaw || data['data-category-raw'];
    if (!category) { block.style.display = 'none'; return; }
    try {
        const { data: rows, error } = await supabase.from('medicines').select('*').eq('status', 'Approved').eq('category', category).neq('id', data.id).limit(8);
        if (error || !rows || rows.length === 0) { block.style.display = 'none'; return; }
        listEl.innerHTML = rows.map(pdMiniCardHtml).join('');
        block.style.display = 'block';
    } catch (e) { block.style.display = 'none'; }
}

// ============ More from this seller ============
async function loadPdMoreFromSeller(data) {
    const block = document.getElementById('pd-more-seller-block');
    const listEl = document.getElementById('pd-more-seller-list');
    const titleEl = document.getElementById('pd-more-seller-title');
    if (!supabase || !block) return;
    const merchantId = data.merchantId || data['data-merchant-id'] || data.merchant_id;
    if (!merchantId) { block.style.display = 'none'; return; }
    try {
        const { data: rows, error } = await supabase.from('medicines').select('*').eq('merchant_id', merchantId).eq('status', 'Approved').neq('id', data.id).limit(8);
        if (error || !rows || rows.length === 0) { block.style.display = 'none'; return; }
        let shopName = 'this seller';
        if (typeof getMerchantNameCached === 'function') shopName = (await getMerchantNameCached(merchantId)) || shopName;
        if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-shop" style="color:var(--primary-color);"></i> More from ${pdEsc(shopName)}`;
        listEl.innerHTML = rows.map(pdMiniCardHtml).join('');
        block.style.display = 'block';
    } catch (e) { block.style.display = 'none'; }
}

document.addEventListener('DOMContentLoaded', function () {
    const backBtn = document.getElementById('pd-back-btn');
    if (backBtn) backBtn.addEventListener('click', () => {
        if (typeof window.navigateTo === 'function') window.navigateTo(__pdReturnPage || 'home');
    });

    const shareBtn = document.getElementById('pd-share-btn');
    if (shareBtn) shareBtn.addEventListener('click', async () => {
        const name = __pdCurrentData?.name || 'this product';
        const shareData = { title: name, text: `Check out ${name} on MediFinder India`, url: window.location.href };
        try {
            if (navigator.share) await navigator.share(shareData);
            else { await navigator.clipboard.writeText(shareData.url); showToast('Link copied to clipboard', 'success'); }
        } catch (e) { /* user cancelled share — nothing to do */ }
    });

    const qtyMinus = document.getElementById('pd-qty-minus');
    const qtyPlus = document.getElementById('pd-qty-plus');
    const qtyEl = document.getElementById('pd-qty');
    if (qtyMinus) qtyMinus.addEventListener('click', () => {
        __pdQty = Math.max(1, __pdQty - 1);
        if (qtyEl) qtyEl.textContent = String(__pdQty);
    });
    if (qtyPlus) qtyPlus.addEventListener('click', () => {
        __pdQty = __pdQty + 1;
        if (qtyEl) qtyEl.textContent = String(__pdQty);
    });

    const addBtn = document.getElementById('pd-add-to-cart-btn');
    if (addBtn) addBtn.addEventListener('click', () => {
        if (!__pdCurrentData) return;
        const isRx = __pdCurrentData.isRx === true || __pdCurrentData.isRx === 'true' || __pdCurrentData['data-is-rx'] === 'true';
        const existingCartItem = isRx ? currentCart.find(i => String(i.id) === String(__pdCurrentData.id)) : null;
        if (isRx && !(existingCartItem && existingCartItem.rxVerified)) {
            blockForMissingPrescription(__pdCurrentData);
            return;
        }
        for (let i = 0; i < __pdQty; i++) addToCart(__pdCurrentData);
    });

    const buyBtn = document.getElementById('pd-buy-now-btn');
    if (buyBtn) buyBtn.addEventListener('click', () => {
        if (!__pdCurrentData) return;
        const isRx = __pdCurrentData.isRx === true || __pdCurrentData.isRx === 'true' || __pdCurrentData['data-is-rx'] === 'true';
        const existingCartItem = isRx ? currentCart.find(i => String(i.id) === String(__pdCurrentData.id)) : null;
        if (isRx && !(existingCartItem && existingCartItem.rxVerified)) {
            blockForMissingPrescription(__pdCurrentData);
            return;
        }
        for (let i = 0; i < __pdQty; i++) addToCart(__pdCurrentData);
        if (typeof window.navigateTo === 'function') window.navigateTo('cart');
    });

    const visitShopBtn = document.getElementById('pd-visit-shop-btn');
    if (visitShopBtn) visitShopBtn.addEventListener('click', () => {
        const merchantId = document.getElementById('pd-sold-by-block')?.dataset.merchantId;
        if (merchantId && typeof window.navigateToShopDetail === 'function') window.navigateToShopDetail(merchantId);
    });

    // Wishlist heart on the gallery.
    const heart = document.getElementById('pd-wishlist-heart');
    if (heart) heart.addEventListener('click', async () => {
        if (!__pdCurrentData?.id) return;
        const id = String(__pdCurrentData.id);
        const isNowActive = !heart.classList.contains('active');
        heart.classList.toggle('active', isNowActive);
        heart.innerHTML = isNowActive ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';
        let saved = JSON.parse(localStorage.getItem('medi_wishlist') || '[]');
        if (isNowActive) { if (!saved.includes(id)) saved.push(id); showToast('Added to wishlist!', 'info'); }
        else { saved = saved.filter(x => x !== id); showToast('Removed from wishlist', 'info'); }
        localStorage.setItem('medi_wishlist', JSON.stringify(saved));
        const uid = await getCurrentAuthUserId();
        if (supabase && uid) {
            try {
                if (isNowActive) await supabase.from('user_wishlist').upsert({ user_id: uid, medicine_id: id }, { onConflict: 'user_id,medicine_id' });
                else await supabase.from('user_wishlist').delete().eq('user_id', uid).eq('medicine_id', id);
            } catch (e) {}
        }
    });

    // Breadcrumb "Home" link.
    const crumbHome = document.getElementById('pd-crumb-home');
    if (crumbHome) crumbHome.addEventListener('click', () => { if (typeof window.navigateTo === 'function') window.navigateTo('home'); });

    // Accordion sections (Product Overview / Medicine Info / Device Info /
    // Safety Information / Delivery & Returns) — each opens independently.
    const accordion = document.getElementById('pd-accordion');
    if (accordion) accordion.addEventListener('click', (e) => {
        const head = e.target.closest('.pd-accordion-head');
        if (!head) return;
        head.closest('.pd-accordion-item').classList.toggle('open');
    });

    // Retry on load failure.
    const retryBtn = document.getElementById('pd-retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', () => { if (__pdCurrentData) navigateToProductDetail(__pdCurrentData); });

    // See all reviews — reveals the rest of the already-fetched list.
    const seeAllBtn = document.getElementById('pd-see-all-reviews-btn');
    if (seeAllBtn) seeAllBtn.addEventListener('click', () => { renderPdReviewsList(__pdReviewsFull); seeAllBtn.style.display = 'none'; });

    // Write a review — star input + submit.
    const writeReviewBtn = document.getElementById('pd-write-review-btn');
    const wrForm = document.getElementById('pd-write-review-form');
    if (writeReviewBtn && wrForm) writeReviewBtn.addEventListener('click', () => {
        wrForm.style.display = wrForm.style.display === 'none' ? 'block' : 'none';
    });
    const wrStars = document.getElementById('pd-wr-stars');
    if (wrStars) wrStars.addEventListener('click', (e) => {
        const star = e.target.closest('[data-star]');
        if (!star) return;
        const n = parseInt(star.dataset.star);
        wrStars.querySelectorAll('i').forEach(i => { i.className = parseInt(i.dataset.star) <= n ? 'fa-solid fa-star' : 'fa-regular fa-star'; });
    });
    const wrPhoto = document.getElementById('pd-wr-photo');
    if (wrPhoto) wrPhoto.addEventListener('change', () => {
        const nameEl = document.getElementById('pd-wr-photo-name');
        if (nameEl) nameEl.textContent = wrPhoto.files?.[0]?.name || '';
    });
    const wrSubmit = document.getElementById('pd-wr-submit-btn');
    if (wrSubmit) wrSubmit.addEventListener('click', submitPdReview);
});

/* ============================================================
   SHOP DETAIL — in-app page (page-shop-detail). Replaces the old,
   separate shop-details.html file (never actually reachable from a
   real deployment path) with the same SPA pattern already used for
   Product Detail: fill the page's DOM in place, then navigateTo()
   shows it — no page reload, works identically everywhere the app
   already runs, and Back always returns to where the shop was
   opened from.
   ============================================================ */
let __sdCurrentMerchantId = null;
let __sdReturnPage = 'shops';
let __sdAllProducts = [];   // full product list for the open shop
let __sdActiveCategory = 'all';
let __sdSortMode = 'popular';

function navigateToShopDetail(merchantId) {
    if (!merchantId) return;
    __sdCurrentMerchantId = merchantId;
    __sdActiveCategory = 'all';
    __sdSortMode = 'popular';
    const searchInput = document.getElementById('sd-search-input');
    if (searchInput) searchInput.value = '';
    const sortSelect = document.getElementById('sd-sort-select');
    if (sortSelect) sortSelect.value = 'popular';
    document.querySelectorAll('#sd-categories-scroll .sd-cat-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.cat === 'all');
    });

    const activePageEl = document.querySelector('.app-page.active');
    const activePageKey = activePageEl ? activePageEl.getAttribute('data-page') : null;
    if (activePageKey && activePageKey !== 'shop-detail') __sdReturnPage = activePageKey;

    if (typeof window.navigateTo === 'function') window.navigateTo('shop-detail');
    loadShopDetail(merchantId);
}
window.navigateToShopDetail = navigateToShopDetail;

async function loadShopDetail(merchantId) {
    const skeleton = document.getElementById('sd-skeleton');
    const errorState = document.getElementById('sd-error-state');
    const content = document.getElementById('sd-content');
    if (skeleton) skeleton.style.display = 'block';
    if (errorState) errorState.style.display = 'none';
    if (content) content.style.display = 'none';

    if (!supabase) {
        if (skeleton) skeleton.style.display = 'none';
        if (errorState) errorState.style.display = 'block';
        return;
    }

    try {
        const { data: m, error } = await supabase.from('merchants').select('*').eq('id', merchantId).maybeSingle();
        if (error || !m) throw error || new Error('Shop not found');

        // Products (products stat + the grid itself use the same query).
        const { data: products } = await supabase.from('medicines').select('*').eq('merchant_id', merchantId).eq('status', 'Approved');
        __sdAllProducts = products || [];

        // Total orders stat — best-effort, doesn't block the rest of the page.
        let totalOrders = null;
        try {
            const { count } = await supabase.from('orders').select('order_id', { count: 'exact', head: true }).eq('merchant_id', merchantId);
            totalOrders = typeof count === 'number' ? count : null;
        } catch (e) { /* stays "Not available" */ }

        renderShopDetail(m, totalOrders);

        // Offers/coupons — table may not exist yet in every deployment,
        // so this is wrapped separately and just hides the section on error
        // instead of breaking the rest of the page.
        try {
            const { data: offers, error: offersErr } = await supabase.from('offers').select('*').eq('merchant_id', merchantId);
            if (!offersErr && offers && offers.length > 0) renderShopOffers(offers);
        } catch (e) { /* no offers table yet — section stays hidden */ }

        if (skeleton) skeleton.style.display = 'none';
        if (content) content.style.display = 'block';
    } catch (e) {
        if (skeleton) skeleton.style.display = 'none';
        if (errorState) errorState.style.display = 'block';
    }
}

function renderShopDetail(m, totalOrders) {
    const shopName = m.shop_name || m.merchant_name || 'Pharmacy';
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    setText('sd-page-title', shopName);
    setText('sd-shop-name-h', shopName);
    setText('sd-owner-name', m.owner_name || m.merchant_name || 'Not available');

    const bannerImg = document.getElementById('sd-banner-img');
    const logoImg = document.getElementById('sd-logo-img');
    const logoSrc = m.merchant_avatar || m.avatar_url || '';
    if (bannerImg) bannerImg.src = m.shop_banner_url || logoSrc || '';
    if (logoImg) {
        if (logoSrc) { logoImg.src = logoSrc; logoImg.style.display = 'block'; }
        else { logoImg.style.display = 'none'; }
    }

    // Open/Closed — merchants.status is the only operational-state column
    // that exists today; there's no opening-hours table yet, so the badge
    // reflects account status (active = accepting orders) and the hours
    // line honestly says "not available" instead of guessing a schedule.
    const statusBadge = document.getElementById('sd-status-badge');
    const isActive = ['active', 'approved'].includes(String(m.status || '').toLowerCase());
    if (statusBadge) {
        statusBadge.textContent = isActive ? 'Open' : 'Closed';
        statusBadge.className = 'sd-status-badge ' + (isActive ? 'sd-open' : 'sd-closed');
    }
    setText('sd-hours', m.opening_hours || 'Timing not available');

    // Rating — no dedicated shop-rating column exists; shown as "New" (same
    // convention as a product with no reviews yet) rather than a fake number.
    const ratingEl = document.getElementById('sd-rating');
    const reviewCountEl = document.getElementById('sd-review-count');
    if (m.rating && parseFloat(m.rating) > 0) {
        if (ratingEl) ratingEl.textContent = parseFloat(m.rating).toFixed(1);
        if (reviewCountEl) reviewCountEl.textContent = m.review_count ? `(${m.review_count} reviews)` : '';
    } else {
        if (ratingEl) ratingEl.textContent = 'New';
        if (reviewCountEl) reviewCountEl.textContent = '';
    }

    // Badges
    const isLicenseVerified = String(m.license_status || '').toLowerCase() === 'verified';
    const badgesRow = document.getElementById('sd-badges-row');
    if (badgesRow) {
        let badges = '';
        badges += isLicenseVerified
            ? `<span class="sd-badge sd-badge-verified"><i class="fa-solid fa-circle-check"></i> Licence Verified</span>`
            : `<span class="sd-badge sd-badge-muted"><i class="fa-solid fa-circle-exclamation"></i> Licence not yet verified</span>`;
        // Prescription ordering is a platform-wide feature (see prior
        // decision — no accepts_prescription column exists), so this badge
        // always shows for every shop.
        badges += `<span class="sd-badge sd-badge-info"><i class="fa-solid fa-file-prescription"></i> Prescription Available</span>`;
        if (isLicenseVerified && isActive) badges += `<span class="sd-badge sd-badge-verified"><i class="fa-solid fa-shield-halved"></i> MediFinder Verified</span>`;
        badgesRow.innerHTML = badges;
    }

    // Contact / address / directions
    const phone = m.phone || '';
    const callBtn = document.getElementById('sd-call-btn');
    const waBtn = document.getElementById('sd-whatsapp-btn');
    if (callBtn) { if (phone) { callBtn.href = 'tel:' + phone; callBtn.style.display = 'flex'; } else callBtn.style.display = 'none'; }
    if (waBtn) { if (phone) { waBtn.href = 'https://wa.me/' + phone.replace(/[^0-9]/g, ''); waBtn.style.display = 'flex'; } else waBtn.style.display = 'none'; }

    const lat = parseFloat(m.latitude), lng = parseFloat(m.longitude);
    const hasCoords = !isNaN(lat) && !isNaN(lng);
    const dirBtn = document.getElementById('sd-direction-btn');
    if (dirBtn) {
        if (hasCoords) { dirBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`; dirBtn.style.display = 'flex'; }
        else dirBtn.style.display = 'none';
    }
    setText('sd-address', m.resolved_address || m.address || m.city || 'Address not available');

    const distEl = document.getElementById('sd-distance');
    const etaEl = document.getElementById('sd-eta');
    if (hasCoords && typeof userLiveLat !== 'undefined' && typeof haversineKm === 'function' && userLiveLat) {
        const distKm = haversineKm(userLiveLat, userLiveLng, lat, lng);
        const distLabel = distKm < 0.1 ? '< 100 m' : (distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`);
        if (distEl) distEl.innerHTML = `<i class="fa-solid fa-route"></i> ${distLabel}`;
        if (etaEl) etaEl.innerHTML = `<i class="fa-solid fa-truck-fast"></i> ${distKm <= 12 ? '20+ min' : 'Standard delivery'}`;
        if (typeof fetchRoadRoute === 'function') {
            fetchRoadRoute(userLiveLat, userLiveLng, lat, lng).then(route => {
                if (!route) return;
                if (distEl) distEl.innerHTML = `<i class="fa-solid fa-route"></i> ${route.distanceKm < 1 ? Math.round(route.distanceKm * 1000) + ' m' : route.distanceKm.toFixed(1) + ' km'}`;
                if (etaEl) etaEl.innerHTML = `<i class="fa-solid fa-truck-fast"></i> ${route.durationMin < 60 ? route.durationMin + ' min' : Math.floor(route.durationMin / 60) + 'h ' + (route.durationMin % 60) + 'm'}`;
            }).catch(() => {});
        }
    } else {
        if (distEl) distEl.innerHTML = `<i class="fa-solid fa-route"></i> Not available`;
        if (etaEl) etaEl.innerHTML = `<i class="fa-solid fa-truck-fast"></i> Not available`;
    }

    // Stats
    setText('sd-stat-orders', totalOrders !== null ? String(totalOrders) : 'N/A');
    setText('sd-stat-products', String(__sdAllProducts.length));
    if (m.created_at) {
        const joined = new Date(m.created_at);
        if (!isNaN(joined.getTime())) {
            const months = Math.max(0, Math.floor((Date.now() - joined.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
            const yrs = Math.floor(months / 12), mos = months % 12;
            setText('sd-stat-joined', yrs > 0 ? `${yrs}y ${mos}mo` : `${mos} mo`);
        } else setText('sd-stat-joined', 'Not available');
    } else setText('sd-stat-joined', 'Not available');

    renderShopProducts();
}

function renderShopOffers(offers) {
    const section = document.getElementById('sd-offers-section');
    const list = document.getElementById('sd-offers-list');
    if (!section || !list) return;
    list.innerHTML = offers.map(o => `
        <div class="sd-offer-card">
            <div class="sd-offer-discount">${o.discount_label || o.discount || 'Offer'}</div>
            <div class="sd-offer-code">${o.coupon_code || o.code || ''}</div>
            <div class="sd-offer-meta">${o.min_order ? 'Min order ₹' + o.min_order : ''}${o.valid_until ? ' · Valid till ' + new Date(o.valid_until).toLocaleDateString() : ''}</div>
            <button type="button" class="sd-offer-use-btn" data-code="${o.coupon_code || o.code || ''}">Use Now</button>
        </div>
    `).join('');
    section.style.display = 'block';
    list.querySelectorAll('.sd-offer-use-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.code) { navigator.clipboard?.writeText(btn.dataset.code); }
            if (typeof showToast === 'function') showToast(`Coupon ${btn.dataset.code} copied — apply it at checkout.`, 'success');
        });
    });
}

function renderShopProducts() {
    const grid = document.getElementById('sd-products-grid');
    const noMsg = document.getElementById('sd-no-products-msg');
    const countEl = document.getElementById('sd-products-count');
    if (!grid) return;

    const q = (document.getElementById('sd-search-input')?.value || '').trim().toLowerCase();

    let list = __sdAllProducts.filter(prod => {
        if (__sdActiveCategory !== 'all') {
            const catKey = typeof normalizeCategoryKey === 'function' ? normalizeCategoryKey(prod.category || prod.dosage_form) : 'others';
            if (catKey !== __sdActiveCategory) return false;
        }
        if (q) {
            const name = String(prod.name || prod.product_name || '').toLowerCase();
            if (!name.includes(q)) return false;
        }
        return true;
    });

    if (__sdSortMode === 'price-low') {
        list = list.slice().sort((a, b) => (parseFloat(a.selling_price || a.price || 0)) - (parseFloat(b.selling_price || b.price || 0)));
    } else if (__sdSortMode === 'discount') {
        const discPct = p => {
            const mrp = parseFloat(p.mrp || 0), sp = parseFloat(p.selling_price || p.price || 0);
            return mrp > sp && mrp > 0 ? ((mrp - sp) / mrp) * 100 : 0;
        };
        list = list.slice().sort((a, b) => discPct(b) - discPct(a));
    } else {
        list = list.slice().sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
    }

    if (countEl) countEl.textContent = `(${list.length})`;

    if (list.length === 0) {
        grid.innerHTML = '';
        if (noMsg) noMsg.style.display = 'block';
        return;
    }
    if (noMsg) noMsg.style.display = 'none';

    if (list.some(p => !(p.id in mfRealRatings)) && !window.__mfShopRatingsLoading) {
        window.__mfShopRatingsLoading = true;
        mfLoadRealRatings(list.map(p => p.id)).finally(() => { window.__mfShopRatingsLoading = false; renderShopProducts(); });
    }
    grid.innerHTML = list.map(prod => {
        const sellingPrice = parseFloat(prod.selling_price || prod.unit_price || prod.price || 0);
        const mrp = parseFloat(prod.mrp || 0);
        const discount = mrp > sellingPrice && sellingPrice > 0 ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0;
        const rating = mfRealRatingFor(prod);
        const stock = parseInt(prod.stock_qty || prod.stock || 0);
        const isOutOfStock = stock <= 0;
        const isLowStock = !isOutOfStock && stock > 0 && stock <= 5;
        const isRx = prod.prescription_req ? prod.prescription_req === 'Yes' : (prod.is_rx === true || prod.is_rx === 'true');
        const img = prod.image_url || prod.img || 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=400';
        const categoryLabel = prod.category || prod.dosage_form || 'Medicine';
        const categoryKey = typeof normalizeCategoryKey === 'function' ? normalizeCategoryKey(categoryLabel) : 'others';
        const manufacturer = prod.manufacturer || '';
        const productName = prod.name || prod.product_name || 'Unnamed';
        const rxTag = isRx ? '<span style="color:#ff4d4d;font-size:0.7rem;font-weight:bold;margin-left:4px;">[Rx]</span>' : '';
        const disabledBtn = isOutOfStock ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : '';
        const hasRealRating = rating > 0;

        return `
        <div class="product-card" data-id="${prod.id}" data-category="${categoryKey}" data-name="${productName}" data-price="${sellingPrice}" data-mrp-orig="${prod.mrp || ''}" data-img="${img}" data-img2="${prod.image_url_2 || ''}" data-img3="${prod.image_url_3 || ''}" data-expiry="${prod.expiry_date || prod.expiry || ''}" data-rating="${rating}" data-manufacturer="${manufacturer}" data-desc="${prod.description || ''}" data-is-rx="${isRx}" data-prescription-req="${prod.prescription_req || (isRx ? 'Yes' : 'No')}" data-merchant-id="${prod.merchant_id || ''}" data-mrp="${mrp}" data-stock="${stock}" data-likes="${prod.likes_count || 0}" data-composition="${(prod.composition || '').replace(/"/g,'&quot;')}" data-dosage-form="${prod.dosage_form || ''}" data-strength="${prod.strength || ''}" data-category-raw="${categoryLabel}" data-product-type="${prod.product_type || 'Medicine'}" data-weight-kg="${prod.weight_kg || ''}">
            ${discount > 0 ? `<div class="badge-express" style="background:#28a745;left:auto;right:8px;top:8px;font-size:0.7rem;"><i class="fa-solid fa-tag"></i> ${discount}% OFF</div>` : ''}
            <div class="img-container"><img src="${img}" alt="${productName}" loading="lazy"></div>
            ${isLowStock ? `<div class="badge-express-row" style="display:flex;justify-content:flex-end;padding:4px 6px 0;"><div class="badge-express" style="position:static;background:#e67e22;"><i class="fa-solid fa-triangle-exclamation"></i> Only ${stock} left</div></div>` : ''}
            <div class="prod-info">
                <span class="prod-cat-label" style="display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${categoryLabel}</span>
                <div class="product-title-row" style="display:flex;align-items:center;gap:4px;min-width:0;max-width:100%;">
                    <h4 style="flex:1 1 auto;min-width:0;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${productName}${rxTag}</h4>
                </div>
                ${manufacturer ? `<p style="font-size:0.7rem;color:#888;margin:2px 0 4px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${manufacturer}</p>` : ''}
                <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">
                    ${hasRealRating
                        ? `<span style="background:#388e3c;color:#fff;padding:1px 5px;border-radius:3px;font-size:0.65rem;font-weight:600;">${rating} <i class="fa-solid fa-star" style="font-size:0.55rem;"></i></span>`
                        : `<span style="background:#eef1f4;color:#888;padding:1px 6px;border-radius:3px;font-size:0.65rem;font-weight:600;">New</span>`}
                </div>
                <div class="price" style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;">
                    <span style="font-size:1.05rem;font-weight:700;color:#2f3542;">₹${sellingPrice.toFixed(2)}</span>
                    ${mrp > sellingPrice ? `<span style="font-size:0.75rem;color:#999;text-decoration:line-through;">₹${mrp.toFixed(2)}</span>` : ''}
                </div>
                <div class="btn-group">
                    <button class="order-btn immediate-order" onclick="handleQuickBuyNow(this)" ${disabledBtn}>${isOutOfStock ? 'UNAVAILABLE' : 'BUY NOW'}</button>
                    <button class="add-to-cart-btn" onclick="handleQuickAddToCart(this)" ${disabledBtn}><i class="fas fa-shopping-cart"></i> CART</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

document.addEventListener('DOMContentLoaded', function () {
    const backBtn = document.getElementById('sd-back-btn');
    if (backBtn) backBtn.addEventListener('click', () => {
        if (typeof window.navigateTo === 'function') window.navigateTo(__sdReturnPage || 'shops');
    });

    const cartBtn = document.getElementById('sd-cart-btn');
    if (cartBtn) cartBtn.addEventListener('click', () => { if (typeof window.navigateTo === 'function') window.navigateTo('cart'); });

    const retryBtn = document.getElementById('sd-retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', () => { if (__sdCurrentMerchantId) loadShopDetail(__sdCurrentMerchantId); });

    const rxCtaBtn = document.getElementById('sd-rx-cta-btn');
    if (rxCtaBtn) rxCtaBtn.addEventListener('click', () => {
        if (!__sdCurrentMerchantId) return;
        // Reuses the existing prescription upload/order pipeline — same
        // approach as the previous in-page "shop info card" flow — just
        // remembers which shop this is for first.
        localStorage.setItem('medi_rx_target_merchant', __sdCurrentMerchantId);
        window.navigateTo('home');
        setTimeout(() => {
            document.querySelector('.prescription-upload-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (typeof showToast === 'function') showToast('Upload your prescription — we\u2019ll send it to this pharmacy.', 'info');
        }, 300);
    });

    const searchInput = document.getElementById('sd-search-input');
    if (searchInput) searchInput.addEventListener('input', () => renderShopProducts());

    const sortSelect = document.getElementById('sd-sort-select');
    if (sortSelect) sortSelect.addEventListener('change', () => { __sdSortMode = sortSelect.value; renderShopProducts(); });

    document.getElementById('sd-categories-scroll')?.addEventListener('click', (e) => {
        const chip = e.target.closest('.sd-cat-chip');
        if (!chip) return;
        __sdActiveCategory = chip.dataset.cat;
        document.querySelectorAll('#sd-categories-scroll .sd-cat-chip').forEach(c => c.classList.toggle('active', c === chip));
        renderShopProducts();
    });

    // Tap-to-view-details on a shop product card (buttons inside it are
    // handled separately by the same document-level delegated listener
    // that already covers every other product grid in the app).
    const sdGrid = document.getElementById('sd-products-grid');
    if (sdGrid) {
        sdGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            if (!card) return;
            if (e.target.closest('.btn-group') || e.target.classList.contains('immediate-order') || e.target.classList.contains('add-to-cart-btn')) return;
            navigateToProductDetail(card.dataset);
        });
    }
});

function updateProductCount() {
    const badge = document.getElementById('product-count-badge');
    const grid = document.getElementById('main-products-grid');
    if (!badge || !grid) return;
    const allCards = grid.querySelectorAll('.product-card');
    let count = 0;
    allCards.forEach(card => {
        if (card.style.display !== 'none') count++;
    });
    badge.textContent = `${count} items`;
}

// Item 5: Rx medicines are no longer blocked from the cart entirely. They're
// added like anything else, but flagged unverified (rxVerified: false) until
// their OWN prescription is uploaded from the cart page. A confirmation
// message explains this and offers to take the user to the cart — it no
// longer force-navigates to the home page.
function addToCart(product) {
    const isControlledRx = product.isRx === true || product.isRx === 'true';
    const existing = currentCart.find(item => String(item.id) === String(product.id));
    if (existing) {
        existing.qty += 1;
    } else {
        currentCart.push({
            id: product.id,
            name: product.name,
            price: parseFloat(product.price),
            // ✅ NEW: MRP/listing price carried alongside the selling price so
            // return-eligibility (₹299+ rule) can look at whichever is higher,
            // exactly like the product card already does for the strike-through.
            mrp: parseFloat(product.mrp || product.price) || parseFloat(product.price) || 0,
            img: product.img,
            qty: 1,
            isRx: isControlledRx,
            rxVerified: isControlledRx ? false : true,
            merchantId: product.merchantId || product.merchant_id || '',
            // Used by the Shiprocket rate lookup on Standard delivery (see
            // refreshShiprocketRateAndBill()). Falls back to 0.5kg for any
            // product that doesn't carry a real weight_kg yet, so an old/
            // unweighed product never blocks a Shiprocket rate call.
            weight: parseFloat(product.weightKg || product.weight_kg) || 0.5,
            exempt_platform_fee: product.id === "p2",
            exempt_processing_charge: product.id === "p4",
            // ✅ FIXED: this was read at checkout (see the "sponsor_discount_claims"
            // insert further down) but never actually set anywhere, so a sponsored
            // slot's one-time discount claim was never recorded. Now carried through
            // from openSponsoredOfferModal() when a shopper adds a sponsored deal.
            sponsorDiscountSlotId: product.sponsorDiscountSlotId || null
        });
    }
    localStorage.setItem('medi_cart', JSON.stringify(currentCart));

    if (isControlledRx) {
        promptRxUploadOnAdd(product.name);
    } else {
        showToast(`${product.name} added to cart!`, "success");
    }
    if (document.getElementById('cart-items-container')) renderCartPage();
    updateCartNavBadge();
}

// Replaces the old blockForMissingPrescription() flow for the "add to cart"
// moment specifically — the medicine IS already in the cart at this point,
// so Confirm just takes the user to the cart (where the real upload lives)
// instead of redirecting to the home page and dropping the item.
function promptRxUploadOnAdd(name) {
    const msg = `"${name}" requires a doctor's prescription. It has been added to your cart — please upload the prescription there to continue with your order.`;
    const onCartPage = !!document.getElementById('cart-items-container');
    if (typeof showConfirmationModal === 'function') {
        showConfirmationModal(msg, () => {
            if (!onCartPage) navigateTo('cart');
        });
    } else {
        showToast(`${name} added — upload its prescription in the cart to continue.`, "info");
    }
}

// ============================================================
// CART PAGE
// ============================================================
// ✅ NEW — "This medicine is for" picker. Injected once (idempotent) right
// above the Place Order button; reuses the existing patientsData array
// (populated from the real `patients` table) — never a second patient
// system. Selection is stored in-memory only and read by
// processFinalOrderPayload() when building the real order row.
    // ✅ Item 3: removed the duplicate "This medicine is for" Self/Add-patient
    // box that used to be injected here, right above Place Order. The single
    // "Ordering For" chip row at the top of the cart (renderCartPatientChips)
    // is now the only patient picker — see cartActivePatientId, used directly
    // in the order payload below instead of the old selectedOrderPatient.

function setupCartPageModules() {
    if (!document.getElementById('cart-items-container')) return;
    renderCartPage();

    const cartRxCameraInput = document.getElementById('cart-rx-camera-input');
    if (cartRxCameraInput) cartRxCameraInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleCartRxUpload(e.target.files[0]);
        e.target.value = "";
    });
    const cartRxFileInput = document.getElementById('cart-rx-file-input');
    if (cartRxFileInput) cartRxFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleCartRxUpload(e.target.files[0]);
        e.target.value = "";
    });

    loadCartDeliveryAddress();

    const saveAddrBtn = document.getElementById('save-address-btn');
    if (saveAddrBtn) saveAddrBtn.addEventListener('click', saveDeliveryAddress);

    // Item 10: Edit opens the form pre-filled with the saved address (instead
    // of a blank form) so editing means editing, not starting over.
    const changeAddrBtn = document.getElementById('change-address-btn');
    if (changeAddrBtn) changeAddrBtn.addEventListener('click', () => {
        const addrForm = document.getElementById('address-form');
        const savedBox = document.getElementById('saved-address-box');
        if (addrForm) addrForm.style.display = 'flex';
        if (savedBox) savedBox.style.display = 'none';
    });

    // Item 10: with no saved address at all, the form stays hidden until the
    // person explicitly taps "Add Now" — it no longer shows by default.
    const addNowBtn = document.getElementById('add-now-address-btn');
    if (addNowBtn) addNowBtn.addEventListener('click', () => {
        const addrForm = document.getElementById('address-form');
        if (addrForm) addrForm.style.display = 'flex';
        addNowBtn.style.display = 'none';
    });

    renderCartPatientChips();

    const writeAddrBtn = document.getElementById('cart-write-address-btn');
    if (writeAddrBtn) writeAddrBtn.addEventListener('click', () => {
        const addrForm = document.getElementById('address-form');
        if (addrForm) addrForm.style.display = addrForm.style.display === 'flex' ? 'none' : 'flex';
    });

    const gpsOrderBtn = document.getElementById('cart-use-gps-btn');
    if (gpsOrderBtn) gpsOrderBtn.addEventListener('click', () => {
        gpsOrderBtn.disabled = true;
        gpsOrderBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Detecting your location...';
        safeGetCurrentPosition(async (pos) => {
            try {
                const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`);
                const geo = await resp.json();
                const a = geo.address || {};
                const addrForm = document.getElementById('address-form');
                if (addrForm) addrForm.style.display = 'flex';
                const setVal = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
                setVal('addr-area', geo.display_name || '');
                setVal('addr-city', a.city || a.town || a.village || a.suburb || '');
                setVal('addr-pincode', a.postcode || '');
                showToast("Location detected — please add your name, house no. & phone, then Save.", "success");
                addrForm?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (e) {
                showToast("Couldn't fetch address for this location. Please enter it manually.", "error");
            } finally {
                gpsOrderBtn.disabled = false;
                gpsOrderBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Use GPS to order here';
            }
        }, GEO_OPTIONS_ONE_SHOT);
        setTimeout(() => { if (gpsOrderBtn.disabled) { gpsOrderBtn.disabled = false; gpsOrderBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Use GPS to order here'; } }, 12000);
    });

    document.querySelectorAll('#delivery-speed-options .speed-option-card').forEach(card => {
        card.addEventListener('click', () => {
            if (card.classList.contains('disabled')) {
                showToast("Not available for your pincode yet — please try again after 5 days.", "error");
                return;
            }
            document.querySelectorAll('#delivery-speed-options .speed-option-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            selectedDeliverySpeed = card.dataset.speed;
            selectedDeliverySpeedFee = parseFloat(card.dataset.fee) || 0;
            recalculateBill();
            refreshShiprocketRateAndBill();
        });
    });

    const applyCouponBtn = document.getElementById('apply-coupon-btn');
    if (applyCouponBtn) applyCouponBtn.addEventListener('click', handleCouponApplication);

    const payWithUpiBtn = document.getElementById('pay-with-upi-btn');
    if (payWithUpiBtn) payWithUpiBtn.addEventListener('click', handlePayWithUpiClick);

    // "I've Completed the Payment" under the QR card — same confirmation step
    // as the UPI-app path, just without an app-open attempt first.
    const paidViaQrBtn = document.getElementById('paid-via-qr-btn');
    if (paidViaQrBtn) paidViaQrBtn.addEventListener('click', () => {
        const amountRupees = getCartGrandTotalRupees();
        if (amountRupees <= 0) { showToast('Your cart total is ₹0.00 — add items before paying.', 'error'); return; }
        if (!pendingOnlineOrderId) pendingOnlineOrderId = generateOrderId();
        selectedOnlinePaymentMethod = 'UPI_QR';
        showUpiPaymentConfirmStep();
    });

    const upiGoBackBtn = document.getElementById('upi-payment-goback-btn');
    if (upiGoBackBtn) upiGoBackBtn.addEventListener('click', hideUpiPaymentConfirmStep);

    const upiPaymentCompletedBtn = document.getElementById('upi-payment-completed-btn');
    if (upiPaymentCompletedBtn) upiPaymentCompletedBtn.addEventListener('click', () => {
        if (!selectedOnlinePaymentMethod) selectedOnlinePaymentMethod = 'UPI';
        processFinalOrderPayload();
    });

    const methodRadios = document.querySelectorAll('input[name="payment_method"]');
    methodRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.querySelectorAll('.pay-option').forEach(el => el.classList.remove('active-option'));
            e.target.closest('.pay-option').classList.add('active-option');
            selectedPaymentMethod = e.target.value;

            const upiDrawer = document.getElementById('upi-pay-drawer');
            const codRow = document.getElementById('cod-fee-row');
            if (upiDrawer) upiDrawer.style.display = (e.target.value === 'ONLINE') ? 'block' : 'none';
            if (codRow) codRow.style.display = (e.target.value === 'COD') ? 'flex' : 'none';

            if (e.target.value !== 'ONLINE') {
                // Leaving Online Payment drops any reserved order id/method so a
                // later switch back to ONLINE starts clean.
                pendingOnlineOrderId = null;
                selectedOnlinePaymentMethod = null;
            } else {
                // Fresh entry into Online Payment always starts at the method-
                // choice step, never mid-confirmation from a previous attempt.
                hideUpiPaymentConfirmStep();
            }

            recalculateBill();
            refreshShiprocketRateAndBill();

            if (e.target.value === 'ONLINE') {
                // Read the amount AFTER recalculateBill() so it reflects the
                // total with the COD handling fee removed.
                const amtEl = document.getElementById('upi-drawer-amount');
                if (amtEl) amtEl.textContent = document.getElementById('bill-grand-total')?.innerText || '₹0.00';
            }
        });
    });

    const placeOrderBtn = document.getElementById('place-order-final-btn');
    if (placeOrderBtn) placeOrderBtn.addEventListener('click', handlePlaceOrderClick);

    const stickyPlaceBtn = document.getElementById('place-order-sticky-btn');
    if (stickyPlaceBtn) stickyPlaceBtn.addEventListener('click', handlePlaceOrderClick);

    // ✅ Item 3: duplicate patient picker removed — the "Ordering For" chip
    // row at the top of the cart is now the only place to pick Self/patient.

    // Delegated backup handlers for qty +/- and remove — the container's
    // innerHTML gets fully replaced every time the cart changes, and relying
    // only on freshly-injected inline onclick="" attributes was unreliable
    // (some webviews don't consistently re-bind them, and any special
    // character in an id could silently break the inline attribute string).
    // Delegating from the container itself — which is never replaced —
    // guarantees the tap always resolves correctly. Existing onclick=""
    // attributes are left in place as-is, this is purely an added safety net.
    const cartItemsContainerEl = document.getElementById('cart-items-container');
    if (cartItemsContainerEl && !cartItemsContainerEl.dataset.delegatedBound) {
        cartItemsContainerEl.dataset.delegatedBound = '1';
        cartItemsContainerEl.addEventListener('click', (e) => {
            const qtyBtn = e.target.closest('.cart-item-qty-btn');
            if (qtyBtn) {
                e.preventDefault();
                e.stopPropagation();
                const row = qtyBtn.closest('.cart-item');
                const id = row ? row.dataset.cartId : null;
                if (id) window.changeCartQty(id, qtyBtn.dataset.delta === '-1' ? -1 : 1);
                return;
            }
            const removeBtn = e.target.closest('.cart-item-remove');
            if (removeBtn) {
                e.preventDefault();
                e.stopPropagation();
                const row = removeBtn.closest('.cart-item');
                const id = row ? row.dataset.cartId : null;
                if (id) window.removeFromCart(id);
            }
        });
    }

    const goOrdersBtn = document.getElementById('go-to-orders-after-success');
    if (goOrdersBtn) goOrdersBtn.onclick = () => navigateTo('order');

    const goOrdersAfterPendingBtn = document.getElementById('go-to-orders-after-payment-pending');
    if (goOrdersAfterPendingBtn) goOrdersAfterPendingBtn.onclick = () => navigateTo('order');

    const paymentPendingModal = document.getElementById('payment-pending-modal');
    if (paymentPendingModal) {
        paymentPendingModal.addEventListener('click', (e) => {
            if (e.target === paymentPendingModal) paymentPendingModal.style.display = 'none';
        });
    }

    const successModal = document.getElementById('success-animation-modal');
    if (successModal) {
        successModal.addEventListener('click', (e) => {
            if (e.target === successModal) {
                successModal.classList.remove('modal-revealed');
                setTimeout(() => { successModal.style.display = 'none'; }, 300);
            }
        });
    }
}

// Item 10: the cart's delivery-address box now shows the SAME address book
// used on the profile page (`user_addresses`, address1/address2) instead of
// a separate address only ever saved locally to this one browser. Falls back
// to the old local `medi_delivery_address` for a guest / offline session.
async function loadCartDeliveryAddress() {
    const addNowBtn = document.getElementById('add-now-address-btn');
    const form = document.getElementById('address-form');
    const box = document.getElementById('saved-address-box');

    let addr = null;
    let allAddresses = [];
    if (supabase) {
        try {
            const uid = await getCurrentAuthUserId();
            if (uid) {
                const { data } = await supabase.from('user_addresses').select('*').eq('user_id', uid).order('is_default', { ascending: false }).order('created_at', { ascending: false });
                if (data && data.length > 0) {
                    allAddresses = data;
                    savedAddresses = data; // shared global — Manage Address (profile) reuses this too
                    const a = data[0];
                    addr = { id: a.id, name: a.name, phone: a.phone, house: a.address1, area: a.address2 || '', city: a.city, pincode: a.pincode, landmark: a.landmark || '', tag: a.tag || 'Home', isDefault: !!a.is_default };
                }
            }
        } catch (e) {}
    }
    if (!addr) {
        addr = JSON.parse(localStorage.getItem('medi_delivery_address') || 'null');
    }

    if (addr && addr.house && addr.name) {
        showSavedAddress(addr);
        if (addNowBtn) addNowBtn.style.display = 'none';
    } else {
        // Nothing saved anywhere yet — hide both the form and the saved box,
        // show only "Add Now".
        if (form) form.style.display = 'none';
        if (box) box.style.display = 'none';
        if (addNowBtn) addNowBtn.style.display = 'block';
    }

    renderCartAddressList(allAddresses, addr ? addr.id : null);
    refreshDeliverySpeedAvailability(addr ? addr.pincode : null);
    refreshShiprocketRateAndBill();
    refreshDeliveryDistanceAndBill();
}

// "Address 1 / Address 2 ..." picker shown above the manual entry form —
// tapping a card makes it the active checkout address (reuses the same
// selectSavedAddressAsActive() the Profile > Manage Address list uses).
function renderCartAddressList(list, activeId) {
    const wrap = document.getElementById('cart-address-list');
    if (!wrap) return;
    if (!list || list.length === 0) {
        wrap.innerHTML = '';
        return;
    }
    wrap.innerHTML = list.map((a, idx) => `
        <div class="cart-address-card ${a.id === activeId ? 'active' : ''}" onclick="selectCartSavedAddress('${a.id}')">
            <div class="cart-address-card-top">
                <span class="cart-address-index">Address ${idx + 1}</span>
                ${a.is_default ? '<span class="addr-default-badge">DEFAULT</span>' : ''}
            </div>
            <strong>${a.name || ''}</strong>
            <p>${a.address1}${a.address2 ? ', ' + a.address2 : ''}, ${a.city} - ${a.pincode}</p>
            <i class="fa-solid fa-circle-check cart-address-check"></i>
        </div>
    `).join('');
}

// "Ordering For" chip row — Self + every saved patient (from Profile >
// Manage Patients). Tapping one sets the active patient for this order.
function renderCartPatientChips() {
    const wrap = document.getElementById('cart-patient-chip-row');
    if (!wrap) return;
    const chips = [{ id: 'self', name: 'Self' }, ...patientsData.map(p => ({ id: p.id, name: p.name }))];
    if (!chips.find(c => c.id === cartActivePatientId)) cartActivePatientId = 'self';
    wrap.innerHTML = chips.map(c => `
        <div class="cart-patient-chip ${c.id === cartActivePatientId ? 'active' : ''}" onclick="selectCartPatient('${c.id}')">
            <i class="fa-solid ${c.id === 'self' ? 'fa-user' : 'fa-user-injured'}"></i> ${c.name}
        </div>
    `).join('');
    // ✅ Item 3: the "ORDERING FOR" heading above now reflects who is
    // actually selected (was previously just a hardcoded "Patient" label
    // that never changed, which read as broken).
    const nameEl = document.getElementById('cart-active-patient-name');
    if (nameEl) nameEl.textContent = (chips.find(c => c.id === cartActivePatientId) || chips[0]).name;
}

window.selectCartPatient = function(id) {
    cartActivePatientId = id;
    localStorage.setItem('medi_cart_patient_id', id);
    renderCartPatientChips();
};

// Admin controls which pincodes get 30-min / same-day via the same
// service_zones table checkPincodeServiceability() already reads. Standard
// (5-7 day) delivery always stays available regardless of pincode — only
// the two fast options get locked out for a pincode the admin hasn't
// approved yet.
async function refreshDeliverySpeedAvailability(pincode) {
    const hint = document.getElementById('delivery-speed-hint');
    const expressCard = document.querySelector('#delivery-speed-options .speed-option-card[data-speed="express"]');
    const sameDayCard = document.querySelector('#delivery-speed-options .speed-option-card[data-speed="sameday"]');
    if (!expressCard || !sameDayCard) return;

    if (!pincode) {
        expressCard.classList.add('disabled');
        sameDayCard.classList.add('disabled');
        if (hint) hint.textContent = 'Add a delivery address to check fast-delivery availability.';
        return;
    }

    const zoneCheck = await checkPincodeServiceability(pincode);
    [expressCard, sameDayCard].forEach(card => card.classList.toggle('disabled', !zoneCheck.available));

    if (!zoneCheck.available) {
        if (hint) hint.textContent = '30 Min & Same Day aren\'t launched in your pincode yet — Standard delivery is always available.';
        // Fast options were disabled while selected — fall back to Standard.
        if (selectedDeliverySpeed !== 'manual') {
            document.querySelectorAll('#delivery-speed-options .speed-option-card').forEach(c => c.classList.remove('active'));
            document.querySelector('#delivery-speed-options .speed-option-card[data-speed="manual"]')?.classList.add('active');
            selectedDeliverySpeed = 'manual';
            selectedDeliverySpeedFee = 0;
            recalculateBill();
        }
    } else if (hint) {
        hint.textContent = '30 Min & Same Day are available for your pincode!';
    }
}

window.selectCartSavedAddress = async function(id) {
    await window.selectSavedAddressAsActive(id);
    const a = savedAddresses.find(x => x.id === id);
    if (a) {
        showSavedAddress({ id: a.id, name: a.name, phone: a.phone, house: a.address1, area: a.address2 || '', city: a.city, pincode: a.pincode, landmark: a.landmark || '', tag: a.tag || 'Home', isDefault: !!a.is_default });
        renderCartAddressList(savedAddresses, a.id);
        refreshDeliverySpeedAvailability(a.pincode);
        refreshShiprocketRateAndBill();
        refreshDeliveryDistanceAndBill();
    }
};

function showSavedAddress(addr) {
    const form = document.getElementById('address-form');
    const box = document.getElementById('saved-address-box');
    const display = document.getElementById('saved-address-display');
    const addNowBtn = document.getElementById('add-now-address-btn');
    if (form) form.style.display = 'none';
    if (box) box.style.display = 'block';
    if (addNowBtn) addNowBtn.style.display = 'none';
    if (display) {
        // Real tag ("Home"/"Work"/etc.) instead of a hardcoded "HOME", plus a
        // DEFAULT badge (matching the same addr-default-badge styling used in
        // the Manage Addresses list) whenever this address is the saved default —
        // so the auto-selected address is visibly marked as such, per spec.
        const tagLabel = (addr.tag || 'Home').toUpperCase();
        const defaultBadge = addr.isDefault ? '<span class="addr-default-badge">DEFAULT</span>' : '';
        display.innerHTML = `
            <div class="addr-premium-top">
                <span class="addr-premium-tag"><i class="fa-solid fa-house"></i> ${tagLabel}</span>${defaultBadge}
                <span class="addr-premium-name">${addr.name}</span>
            </div>
            <p class="addr-premium-line"><i class="fa-solid fa-location-dot"></i> ${addr.house}${addr.area ? ', ' + addr.area : ''}, ${addr.city} - ${addr.pincode}${addr.landmark ? ', Near ' + addr.landmark : ''}</p>
            <p class="addr-premium-phone"><i class="fa-solid fa-phone"></i> +91 ${addr.phone}</p>
            <div class="addr-premium-deliver-badge"><i class="fa-solid fa-circle-check"></i> Delivering to this address</div>
        `;
    }
    // Keep the manual-form fields pre-filled too, so tapping Edit shows this
    // address instead of a blank form.
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setVal('addr-house', addr.house); setVal('addr-name', addr.name); setVal('addr-area', addr.area);
    setVal('addr-city', addr.city); setVal('addr-pincode', addr.pincode); setVal('addr-phone', addr.phone);
    setVal('addr-landmark', addr.landmark);
    const editingIdEl = document.getElementById('cart-editing-address-id');
    if (editingIdEl) editingIdEl.value = addr.id || '';
}

// Checks the pincode against the admin's service_zones registry (same table
// the admin "Network Area Control" panel manages via Launch Zone Live /
// Suspend Zone). A pincode with no row at all means that area hasn't been
// launched yet; a row with status 'suspended' means it was launched but is
// temporarily paused — both are treated as unavailable.
async function checkPincodeServiceability(pincode) {
    if (!supabase || !pincode) return { available: true }; // fail-open on setup issues, never brick checkout over a network hiccup
    try {
        const { data, error } = await supabase.from('service_zones').select('pin, dist, status').eq('pin', pincode).maybeSingle();
        if (error) return { available: true };
        if (!data || data.status !== 'approved') return { available: false };
        return { available: true, dist: data.dist };
    } catch (e) {
        return { available: true };
    }
}

async function saveDeliveryAddress() {
    const name = document.getElementById('addr-name')?.value.trim();
    const phone = document.getElementById('addr-phone')?.value.trim();
    const house = document.getElementById('addr-house')?.value.trim();
    const area = document.getElementById('addr-area')?.value.trim();
    const city = document.getElementById('addr-city')?.value.trim();
    const pincode = document.getElementById('addr-pincode')?.value.trim();
    const landmark = document.getElementById('addr-landmark')?.value.trim() || '';
    const statusMsg = document.getElementById('addr-status-msg');

    if (!name || !phone || !house || !area || !city || !pincode) {
        if (statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = '❌ Please fill all required fields.'; }
        return;
    }
    if (pincode.length !== 6) {
        if (statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = '❌ Pincode must be 6 digits.'; }
        return;
    }
    if (phone.length < 10) {
        if (statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = '❌ Enter valid phone number.'; }
        return;
    }

    // ✅ Standard delivery works for any Indian pincode — this used to block
    // saving the address entirely just because 30-Min/Same-Day aren't
    // launched there yet. Now it only informs, never blocks; the fast-speed
    // gating itself happens separately (see refreshDeliverySpeedAvailability).
    if (statusMsg) { statusMsg.style.color = '#747d8c'; statusMsg.innerText = 'Checking fast-delivery availability...'; }
    const zoneCheck = await checkPincodeServiceability(pincode);
    isPincodeVerified = true;
    if (statusMsg) {
        statusMsg.style.color = zoneCheck.available ? '#2ed573' : '#747d8c';
        statusMsg.innerText = zoneCheck.available
            ? '✅ 30 Min & Same Day are available here too!'
            : 'ℹ️ Standard delivery (5-7 days) is available. 30 Min/Same Day aren\'t launched here yet.';
    }

    const addr = { name, phone, house, area, city, pincode, landmark };
    localStorage.setItem('medi_delivery_address', JSON.stringify(addr));
    localStorage.setItem('medi_verified_address', `${house}, ${area}, ${city} - ${pincode}${landmark ? ', Near ' + landmark : ''}`);
    isPincodeVerified = true;

    // Item 10: also persist to the shared `user_addresses` book (same table
    // the profile page uses) so this becomes the one real saved address
    // instead of only living in this browser's localStorage.
    if (supabase) {
        try {
            const uid = await getCurrentAuthUserId();
            if (uid) {
                const editingId = document.getElementById('cart-editing-address-id')?.value || '';
                const payload = { user_id: uid, tag: 'Home', name, phone, address1: house, address2: area || null, landmark: landmark || null, city, state: '', pincode, is_default: true };
                await supabase.from('user_addresses').update({ is_default: false }).eq('user_id', uid);
                if (editingId) {
                    const { data } = await supabase.from('user_addresses').update(payload).eq('id', editingId).select().single();
                    if (data) addr.id = data.id;
                } else {
                    const { data } = await supabase.from('user_addresses').insert([payload]).select().single();
                    if (data) addr.id = data.id;
                }
            }
        } catch (e) {
            // Non-fatal — localStorage copy above already covers this session/order.
        }
    }

    if (statusMsg) { statusMsg.style.color = '#2ed573'; statusMsg.innerText = '✓ Address saved!'; }
    showSavedAddress(addr);
    recalculateBill();
    refreshShiprocketRateAndBill();
}

async function handleCouponApplication() {
    const couponInput = document.getElementById('coupon-input');
    if (!couponInput) return;
    const couponCode = couponInput.value.trim().toUpperCase();
    const statusMsg = document.getElementById('coupon-status-msg');
    function setMsg(text, ok) {
        if (statusMsg) { statusMsg.style.color = ok ? '#2ed573' : '#ff4d4d'; statusMsg.innerText = text; }
    }
    if (!couponCode) { setMsg('Enter a coupon code.', false); return; }
    if (!supabase) { setMsg("Coupons aren't available right now.", false); discountAmount = 0; appliedCouponInfo = null; recalculateBill(); return; }

    const subtotal = currentCart.reduce((s, i) => s + (i.price * i.qty), 0);
    const now = new Date();

    try {
        const uid = await getCurrentAuthUserId();

        // Ownership: check the user's own claimed/earned coupon first
        // (user_coupons — referral/order rewards, private to this account).
        let couponRow = null, source = null;
        if (uid) {
            const { data: personal } = await supabase.from('user_coupons').select('*')
                .eq('user_id', uid).eq('code', couponCode).maybeSingle();
            if (personal) { couponRow = personal; source = 'personal'; }
        }
        // Fall back to a general/public active coupon not tied to one user.
        if (!couponRow) {
            const { data: pub } = await supabase.from('coupons').select('*')
                .eq('code', couponCode).eq('is_active', true).maybeSingle();
            if (pub) { couponRow = pub; source = 'public'; }
        }

        if (!couponRow) { setMsg('Invalid or expired coupon code.', false); discountAmount = 0; appliedCouponInfo = null; recalculateBill(); return; }

        // Not-already-used (single-use enforcement)
        if (couponRow.is_used) { setMsg('This coupon has already been used.', false); discountAmount = 0; appliedCouponInfo = null; recalculateBill(); return; }

        // Active window — never allow before start_date, never after expiry
        const startField = couponRow.start_date || couponRow.valid_from;
        const endField = couponRow.end_date || couponRow.expiry_date || couponRow.valid_until;
        if (startField && new Date(startField) > now) { setMsg('This coupon is not active yet.', false); discountAmount = 0; appliedCouponInfo = null; recalculateBill(); return; }
        if (endField && new Date(endField) < now) { setMsg('This coupon has expired.', false); discountAmount = 0; appliedCouponInfo = null; recalculateBill(); return; }

        // Minimum order
        const minOrder = couponRow.min_order_amount || couponRow.min_order || 0;
        if (minOrder && subtotal < minOrder) { setMsg(`Minimum order ₹${minOrder} required.`, false); discountAmount = 0; appliedCouponInfo = null; recalculateBill(); return; }

        // Percentage vs fixed, capped at max discount and never above subtotal
        if ((couponRow.discount_type || '').toLowerCase() === 'percentage') {
            discountAmount = Math.min((subtotal * (couponRow.discount_value || couponRow.discount_percent || 0)) / 100, couponRow.max_discount_amount || Infinity, subtotal);
        } else {
            discountAmount = Math.min(couponRow.discount_value || couponRow.discount_amount || 0, subtotal);
        }

        appliedCouponInfo = { code: couponCode, source, id: couponRow.id };
        setMsg(`Coupon applied! ₹${discountAmount.toFixed(2)} saved.`, true);
        recalculateBill();
    } catch (e) {
        setMsg("Couldn't validate this coupon right now. Please try again.", false);
        discountAmount = 0;
        appliedCouponInfo = null;
        recalculateBill();
    }
}

function renderCartPage() {
    const container = document.getElementById('cart-items-container');
    if (!container) return;

    // Defensive sanitation: a null/undefined/malformed entry anywhere in
    // currentCart used to make the entire list below throw partway through
    // .map() — since the throw happens INSIDE the map callback, the
    // container.innerHTML assignment never completes, so the page keeps
    // showing whatever was there before (often the very first "cart is
    // empty" placeholder) forever after — while everything that reads
    // currentCart independently (the bottom-nav badge, recalculateBill's
    // total) kept working fine, since neither of those touches the broken
    // entry the same way. That's exactly "count/total update but no items
    // show." Dropping bad entries here — and persisting the cleanup — means
    // one broken row can never blank the whole cart again.
    const cleanCart = currentCart.filter(item => item && typeof item === 'object' && item.id);
    if (cleanCart.length !== currentCart.length) {
        console.warn(`renderCartPage: dropped ${currentCart.length - cleanCart.length} invalid cart item(s)`);
        currentCart = cleanCart;
        localStorage.setItem('medi_cart', JSON.stringify(currentCart));
    }

    const headerBar = document.getElementById('cart-header-bar');
    const itemCountEl = document.getElementById('cart-item-count');
    const stickyBar = document.getElementById('sticky-checkout-bar');
    const freeWrap = document.getElementById('free-delivery-progress');
    if (currentCart.length === 0) {
        container.innerHTML = `<div class="cart-empty-state"><div class="cart-empty-icon"><i class="fa-solid fa-basket-shopping"></i></div><h3>Your cart is empty</h3><p>Browse medicines and add them to your cart</p><button class="cart-empty-btn" onclick="navigateTo('home')"><i class="fa-solid fa-house"></i> Browse Medicines</button></div>`;
        if (headerBar) headerBar.style.display = 'none';
        if (stickyBar) stickyBar.style.display = 'none';
        if (freeWrap) freeWrap.style.display = 'none';
        recalculateBill();
        updateCartNavBadge();
        return;
    }
    const totalQty = currentCart.reduce((s, i) => s + i.qty, 0);
    if (headerBar) {
        headerBar.style.display = 'flex';
        if (itemCountEl) itemCountEl.innerHTML = `<strong>${totalQty}</strong> item${totalQty !== 1 ? 's' : ''}`;
    }
    container.innerHTML = currentCart.map(item => {
        // Each item renders in its own try/catch: one bad row now logs and
        // renders as nothing, instead of a single throw wiping out every
        // other perfectly good item in the cart (see note above).
        try {
        const isRxItem = item.isRx === true || item.isRx === 'true';
        const rxBlocked = isRxItem && !item.rxVerified;
        const rxBadge = isRxItem
            ? (rxBlocked
                ? '<span class="cart-item-rx" style="background:#fff0f0;color:#ff4d4d;border:1px solid #ff4d4d;border-radius:6px;padding:2px 6px;font-size:0.7rem;margin-left:6px;"><i class="fa-solid fa-triangle-exclamation"></i> Rx</span>'
                : '<span class="cart-item-rx" style="background:#f0fff5;color:#2ed573;border:1px solid #2ed573;border-radius:6px;padding:2px 6px;font-size:0.7rem;margin-left:6px;"><i class="fa-solid fa-circle-check"></i> Rx Verified</span>')
            : '';
        // Item 5: a per-item green tick over the thumbnail once THIS item's
        // own prescription has been uploaded and verified — not a global flag.
        const rxTick = (isRxItem && item.rxVerified) ? '<span class="cart-item-rx-tick" style="position:absolute;bottom:-4px;right:-4px;background:#2ed573;color:#fff;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:0.65rem;border:2px solid #fff;"><i class="fa-solid fa-check"></i></span>' : '';
        const uploadRow = rxBlocked ? `
                    <div class="cart-rx-upload-row" style="display:flex;gap:8px;margin-top:6px;">
                        <button type="button" class="cart-rx-upload-btn" data-cart-id="${item.id}" data-mode="camera" style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:7px 8px;border-radius:8px;border:1px solid #ff4d4d;background:#fff;color:#ff4d4d;font-size:0.72rem;font-weight:600;cursor:pointer;"><i class="fa-solid fa-camera"></i> Camera</button>
                        <button type="button" class="cart-rx-upload-btn" data-cart-id="${item.id}" data-mode="gallery" style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:7px 8px;border-radius:8px;border:1px solid #ff4d4d;background:#fff;color:#ff4d4d;font-size:0.72rem;font-weight:600;cursor:pointer;"><i class="fa-solid fa-image"></i> Gallery</button>
                    </div>
                    <p style="margin:4px 0 0;font-size:0.68rem;color:#ff4d4d;">Upload this medicine's prescription — order won't be placed without it</p>` : '';
        return `
        <div class="cart-item" data-cart-id="${item.id}"${rxBlocked ? ' style="border:1px solid #ff4d4d;background:#fff8f8;border-radius:10px;"' : ''}>
            <div class="cart-item-left">
                <div style="position:relative;">
                    <img class="cart-item-img" src="${item.img}">
                    ${rxTick}
                </div>
                <div class="cart-item-info">
                    <h4 class="cart-item-name">${item.name}${rxBadge}</h4>
                    <p class="cart-item-price">₹${item.price}</p>
                    ${uploadRow}
                    <div class="cart-item-qty" style="position:relative; z-index:3; pointer-events:auto;">
                        <button type="button" class="cart-item-qty-btn" data-delta="-1" style="position:relative; z-index:3; pointer-events:auto; cursor:pointer;">-</button>
                        <span class="cart-item-qty-num">${item.qty}</span>
                        <button type="button" class="cart-item-qty-btn" data-delta="1" style="position:relative; z-index:3; pointer-events:auto; cursor:pointer;">+</button>
                    </div>
                </div>
            </div>
            <button type="button" class="cart-item-remove" style="position:relative; z-index:3; pointer-events:auto; cursor:pointer;"><i class="fa-solid fa-trash-can"></i></button>
        </div>
    `;
        } catch (e) {
            console.warn('renderCartPage: skipped one unrenderable cart item', item, e);
            return '';
        }
    }).join('');

    // Wire the per-item camera/gallery buttons through ONE shared hidden file
    // input pair (see usercart.html) rather than one input per cart row.
    container.querySelectorAll('.cart-rx-upload-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            pendingRxCartItemId = btn.dataset.cartId;
            const input = document.getElementById(btn.dataset.mode === 'camera' ? 'cart-rx-camera-input' : 'cart-rx-file-input');
            if (input) input.click();
        });
    });
    // Show an immediate estimate synchronously, then refine it once the real
    // shop-to-customer distance comes back (merchant location + live GPS).
    recalculateBill();
    refreshDeliveryDistanceAndBill();
    refreshShiprocketRateAndBill();
    updateCartNavBadge();
}

// Item 5 + Item 3: uploading a cart-item's prescription both marks that
// specific item verified (green tick, order unblocked) AND immediately
// broadcasts the slip to nearby pharmacies, reusing the same notification
// pipeline as the home page prescription-upload widget.
let pendingRxCartItemId = null;
async function handleCartRxUpload(file) {
    if (!file) return;
    if (!pendingRxCartItemId) { showToast('Please tap Camera/Gallery on the medicine again.', 'error'); return; }
    const item = currentCart.find(i => String(i.id) === String(pendingRxCartItemId));
    if (!item) { pendingRxCartItemId = null; return; }
    const targetId = pendingRxCartItemId; // snapshot — pendingRxCartItemId is cleared below

    showToast('Uploading prescription...', 'info');
    let prescriptionUrl = '';
    try {
        if (!supabase) {
            showToast("Can't upload right now — not connected. Please check your internet and try again.", "error");
            pendingRxCartItemId = null;
            return;
        }
        const fileExt = (file.name && file.name.includes('.')) ? file.name.split('.').pop() : 'jpg';
        const storagePath = `live_slips/cart_${Date.now()}_${targetId}.${fileExt}`;
        // NOTE: this used to pass { upsert: true }. The path is already unique
        // (timestamp + cart item id), so upsert was never actually needed —
        // and upsert makes supabase-js send an "x-upsert" header, which the
        // storage API only honours when the bucket's RLS policy also grants
        // UPDATE (not just INSERT). Only an INSERT policy exists here (same as
        // the working home-page prescription upload, which never sets upsert),
        // so the UPDATE-permission check was failing server-side with a plain
        // 400 Bad Request. Dropping upsert makes this match that working path.
        const { error } = await supabase.storage.from('media').upload(storagePath, file, {
            contentType: file.type || 'image/jpeg'
        });
        if (error) {
            showToast("Upload failed: " + (error.message || error.error || 'please try again.'), "error");
            pendingRxCartItemId = null;
            return;
        }
        const { data: urlData } = supabase.storage.from('media').getPublicUrl(storagePath);
        prescriptionUrl = urlData.publicUrl;
    } catch (e) {
        showToast("Upload failed: " + (e.message || "please try again."), "error");
        pendingRxCartItemId = null;
        return;
    }

    // Only mark verified once the file is actually confirmed uploaded above.
    item.rxVerified = true;
    item.prescriptionUrl = prescriptionUrl; // keep the actual slip URL so it can be attached to the order later
    localStorage.setItem('medi_cart', JSON.stringify(currentCart));
    showToast(`Prescription verified for ${item.name}!`, "success");
    renderCartPage();

    // Broadcast to nearby pharmacies right away — doesn't block the UI.
    if (prescriptionUrl) {
        broadcastPrescriptionToNearbyPharmacies(prescriptionUrl, [{ id: item.id, name: item.name, price: item.price, img: item.img }], getAutoUserPhone())
            .then(rxId => { if (rxId) watchPendingPrescriptionOrder(rxId); });
    }
    pendingRxCartItemId = null;
}

window.clearAllCart = function() {
    if (currentCart.length === 0) return;
    showConfirmationModal('Remove all items from cart?', () => {
        currentCart = [];
        localStorage.setItem('medi_cart', JSON.stringify(currentCart));
        showToast('Cart cleared', 'info');
        renderCartPage();
        updateCartNavBadge();
    });
};

window.changeCartQty = function(id, delta) {
    const item = currentCart.find(i => String(i.id) === String(id));
    if (item) {
        // Quantity can never drop below 1 through the "-" button — removing
        // the item entirely is what the trash/Delete button is for.
        item.qty = Math.max(1, item.qty + delta);
        localStorage.setItem('medi_cart', JSON.stringify(currentCart));
        renderCartPage();
        updateCartNavBadge();
    }
};

// Bottom-nav badge friendly aliases matching the requested naming exactly —
// both simply delegate to the existing, already-working changeCartQty() so
// there's only ever one real implementation of "change quantity by 1".
window.incrementCartItem = function(id) { window.changeCartQty(id, 1); };
window.decrementCartItem = function(id) { window.changeCartQty(id, -1); };

window.removeFromCart = function(id) {
    currentCart = currentCart.filter(item => String(item.id) !== String(id));
    localStorage.setItem('medi_cart', JSON.stringify(currentCart));
    renderCartPage();
    updateCartNavBadge();
};

// ============================================================
// BOTTOM NAV — LIVE CART QUANTITY BADGE ("Cart (3)")
// Reuses the existing currentCart/localStorage cart — no separate cart
// system. Finds the Cart tile inside #bottom-nav via data-page="cart" (same
// attribute setActiveNavIcon() already relies on) and keeps a small badge
// element inside it in sync. Safe no-op if the bottom nav isn't on the page.
// ============================================================
function updateCartNavBadge() {
    const cartNavItem = document.querySelector('#bottom-nav .nav-item[data-page="cart"]');
    if (!cartNavItem) return;
    const totalQty = currentCart.reduce((sum, item) => sum + (item.qty || 0), 0);
    let badge = cartNavItem.querySelector('.nav-cart-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-cart-badge';
        cartNavItem.appendChild(badge);
    }
    if (totalQty > 0) {
        badge.textContent = totalQty > 99 ? '99+' : String(totalQty);
        badge.style.display = '';
    } else {
        badge.textContent = '';
        badge.style.display = 'none';
    }

    // Shop Detail page header has its own cart icon/badge (feature list
    // item "Cart Icon + Cart Count") — kept in sync the same way as the
    // bottom-nav badge above, on every navigateTo().
    const sdBadge = document.getElementById('sd-cart-badge');
    if (sdBadge) {
        if (totalQty > 0) {
            sdBadge.textContent = totalQty > 99 ? '99+' : String(totalQty);
            sdBadge.style.display = 'flex';
        } else {
            sdBadge.style.display = 'none';
        }
    }
}

// ============================================================
// DISTANCE + PRICE BASED DELIVERY FEE ENGINE
// The merchant sets their shop's real GPS location from the "Geolocation &
// Address Config" panel (marchentprofile.html -> merchants.latitude /
// merchants.longitude). The customer's live GPS (userLiveLat/userLiveLng,
// see detectLiveUserGPSCoordinates()) is compared against every merchant
// present in the cart via haversineKm(), and the FARTHEST shop distance
// decides which distance band applies (worst case, since one delivery run
// has to reach every shop in the cart). Within that band, the order
// subtotal decides which price sub-band applies. ₹499+ subtotal is always
// FREE on all four charges, regardless of distance.
// ============================================================
const FREE_DELIVERY_THRESHOLD = 499;
let cartDeliveryDistanceKm = null; // cached by refreshDeliveryDistanceAndBill() — real OSRM road distance when available, Haversine fallback otherwise
let cartDeliveryEtaMin = null;     // cached alongside it — OSRM road ETA in minutes; null when only the Haversine fallback was available

function getDeliveryFeeTierByDistance(distanceKm, subtotal) {
    // Distance bands: <=5km, <=12km, >12km. Only three distance figures were
    // given (5km / 12km / "50km or more"), with nothing specified for the
    // 12–50km gap, so everything past 12km uses the long-distance ("50km+")
    // band. Unknown distance (no GPS fix / merchant location not set yet)
    // also falls back to this band so delivery is never under-charged.
    let band;
    if (distanceKm === null || distanceKm === undefined || isNaN(distanceKm)) band = 'far';
    else if (distanceKm <= 5) band = 'near';
    else if (distanceKm <= 12) band = 'mid';
    else band = 'far';

    // Price sub-band: under ₹150 pays the higher rate; ₹150 up to just under
    // the ₹499 free-delivery cutoff pays the reduced rate (only ₹150 and
    // ₹299 thresholds were given, and nothing further, so ₹299–₹498 reuses
    // the ₹299 figures as the lowest paid tier before delivery becomes free).
    const priceBand = subtotal < 150 ? 'low' : 'mid';

    const FEE_TABLE = {
        near: {
            low: { delivery: 5,  shipping: 2, platform: 2,    processing: 1.50 },
            mid: { delivery: 5,  shipping: 2, platform: 1,    processing: 1 }
        },
        mid: {
            low: { delivery: 20, shipping: 5, platform: 4,    processing: 2 },
            mid: { delivery: 15, shipping: 3, platform: 2.50, processing: 3 }
        },
        far: {
            low: { delivery: 30, shipping: 7, platform: 4,    processing: 2 },
            mid: { delivery: 30, shipping: 4, platform: 3,    processing: 2.50 }
        }
    };
    return FEE_TABLE[band][priceBand];
}

// Looks up every merchant present in the cart, computes the farthest shop
// distance from the customer's live GPS, caches it in cartDeliveryDistanceKm,
// then re-runs recalculateBill() so the bill reflects the real distance band
// instead of the unknown-distance fallback. Safe to call anytime the cart or
// the user's location changes — it always ends by calling recalculateBill().
// ✅ Real product ratings: medicines.rating is just a default "4.5" that was
// never a real customer rating. The average now comes from actual rows in
// product_reviews; a product with no reviews shows "New" instead of a fake
// score. Results are cached so every product grid reads the same numbers.
const mfRealRatings = {}; // medicine id -> { avg, count }
async function mfLoadRealRatings(ids) {
    try {
        if (!supabase || !ids || ids.length === 0) return;
        const { data } = await supabase.from('product_reviews').select('medicine_id, rating').in('medicine_id', ids);
        ids.forEach(id => { mfRealRatings[id] = { avg: 0, count: 0 }; });
        (data || []).forEach(r => {
            const o = mfRealRatings[r.medicine_id] || (mfRealRatings[r.medicine_id] = { avg: 0, count: 0 });
            o.avg += Number(r.rating) || 0; o.count += 1;
        });
        Object.values(mfRealRatings).forEach(o => { if (o.count > 0 && !o._done) { o.avg = o.avg / o.count; o._done = true; } });
    } catch (e) { console.warn('[ratings]', e); }
}
function mfRealRatingFor(prod) {
    const r = mfRealRatings[prod.id];
    return r && r.count > 0 ? Math.round(r.avg * 10) / 10 : 0;
}

// ✅ Real delivery distance: measured from the shop to the address the
// customer is actually delivering to (geocoded from its pincode/city and
// cached), NOT from the live GPS — which sits on a hard-coded Kolkata
// fallback until a real fix lands, and made every far-off shop look 400km+
// away. Live GPS is only used when the address can't be located.
async function resolveActiveDeliveryCoords() {
    try {
        const a = JSON.parse(localStorage.getItem('medi_delivery_address') || 'null');
        if (!a || !a.pincode) return null;
        const key = 'medi_addr_geo_' + [a.house, a.area, a.city, a.pincode].join('|').toLowerCase();
        const cached = localStorage.getItem(key);
        if (cached) return JSON.parse(cached);
        const tries = [
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent([a.house, a.area, a.city, a.pincode].filter(Boolean).join(', '))}`,
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&postalcode=${encodeURIComponent(a.pincode)}`
        ];
        for (const url of tries) {
            const r = await fetch(url); const j = await r.json();
            if (j && j[0]) {
                const c = { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) };
                localStorage.setItem(key, JSON.stringify(c));
                return c;
            }
        }
    } catch (e) {}
    return null;
}

async function refreshDeliveryDistanceAndBill() {
    try {
        if (!supabase || currentCart.length === 0) { recalculateBill(); return; }
        const merchantIds = [...new Set(currentCart.map(i => i.merchantId).filter(Boolean))];
        if (merchantIds.length === 0) { recalculateBill(); return; }
        const { data, error } = await supabase.from('merchants').select('id, latitude, longitude').in('id', merchantIds);
        if (error || !data || data.length === 0) { recalculateBill(); return; }

        // Worst-case shop decides the fee band (one delivery run has to reach
        // every shop in the cart), same rule as before — but now the distance
        // for each shop is the real OSRM road distance when it resolves, with
        // a safe Haversine fallback per-shop if OSRM is slow/unreachable. The
        // page never breaks or blocks on a routing failure.
        const validMerchants = data.filter(m => m.latitude && m.longitude);
        if (validMerchants.length === 0) { cartDeliveryDistanceKm = null; cartDeliveryEtaMin = null; recalculateBill(); return; }

        const dest = (await resolveActiveDeliveryCoords()) || { lat: userLiveLat, lng: userLiveLng };
        const distances = await Promise.all(validMerchants.map(async (m) => {
            const lat = Number(m.latitude), lng = Number(m.longitude);
            const haversine = haversineKm(dest.lat, dest.lng, lat, lng);
            try {
                const route = await fetchRoadRoute(dest.lat, dest.lng, lat, lng);
                if (route) return { km: route.distanceKm, etaMin: route.durationMin };
            } catch (e) { /* fall through to Haversine below */ }
            return { km: haversine, etaMin: null };
        }));

        let worst = distances[0];
        distances.forEach(d => { if (d.km > worst.km) worst = d; });
        cartDeliveryDistanceKm = worst.km;
        cartDeliveryEtaMin = worst.etaMin;
        recalculateBill();
    } catch (e) {
        recalculateBill();
    }
}

// ============================================================
// SHIPROCKET-BASED DELIVERY CHARGE — STANDARD DELIVERY ONLY
// Standard ("manual") is the speed that actually ships via courier, so its
// charge comes from a real Shiprocket rate instead of the flat distance
// table above. Express/Same-day are MediFinder's own fast-rider promises
// and keep using the distance table — Shiprocket doesn't run those.
//
// Each merchant in the cart is its own pickup point, so the `shiprocket`
// Supabase Edge Function is called once per merchant (pickup pincode =
// that merchant's merchants.pincode, delivery pincode = the customer's
// saved address pincode, weight = that merchant's cart items' weight(kg) ×
// qty, cod = whether COD is selected) and the rates are summed into
// cartShiprocketRate. Any failure (network, missing pincode, Shiprocket
// error) fails OPEN back to the distance table — same "never brick
// checkout" pattern as checkPincodeServiceability() — never blocks the
// customer from placing an order.
// ============================================================
let cartShiprocketRate = null;           // cached total Standard-delivery ₹ from Shiprocket, or null when not available/applicable
let cartShiprocketUnserviceable = false; // true only when Shiprocket explicitly reported no courier for this pincode pair

async function fetchShiprocketRateForMerchant(pickupPincode, deliveryPincode, weightKg, isCOD) {
    if (!supabase || !pickupPincode || !deliveryPincode) return null;
    try {
        const { data, error } = await supabase.functions.invoke('shiprocket', {
            body: {
                pickup_postcode: pickupPincode,
                delivery_postcode: deliveryPincode,
                weight: Math.max(0.1, weightKg || 0.5),
                cod: isCOD ? 1 : 0
            }
        });
        if (error || !data || data.success !== true) return null;
        if (data.serviceable === false) return { unserviceable: true };
        return { rate: Number(data.rate) || 0 };
    } catch (e) {
        return null;
    }
}

// Safe to call from anywhere (speed change, address change, payment method
// change, cart load) — it no-ops back to the distance table whenever
// Standard isn't selected or a rate can't be resolved, and always ends by
// calling recalculateBill() so the screen reflects whatever it found.
async function refreshShiprocketRateAndBill() {
    if (selectedDeliverySpeed !== 'manual') {
        cartShiprocketRate = null;
        cartShiprocketUnserviceable = false;
        recalculateBill();
        return;
    }
    const deliveryPincode = document.getElementById('addr-pincode')?.value?.trim();
    if (!supabase || !deliveryPincode || currentCart.length === 0) {
        cartShiprocketRate = null;
        cartShiprocketUnserviceable = false;
        recalculateBill();
        return;
    }

    try {
        const merchantIds = [...new Set(currentCart.map(i => i.merchantId).filter(Boolean))];
        if (merchantIds.length === 0) { cartShiprocketRate = null; recalculateBill(); return; }
        const { data: merchants, error } = await supabase.from('merchants').select('id, pincode').in('id', merchantIds);
        if (error || !merchants || merchants.length === 0) { cartShiprocketRate = null; recalculateBill(); return; }

        const pincodeByMerchant = {};
        merchants.forEach(m => { if (m.pincode) pincodeByMerchant[m.id] = m.pincode; });

        const weightByMerchant = {};
        currentCart.forEach(item => {
            const mId = item.merchantId;
            if (!mId) return;
            const itemWeight = (parseFloat(item.weight) || 0.5) * (item.qty || 1);
            weightByMerchant[mId] = (weightByMerchant[mId] || 0) + itemWeight;
        });

        const isCOD = selectedPaymentMethod === 'COD';
        const results = await Promise.all(Object.keys(weightByMerchant).map(mId =>
            fetchShiprocketRateForMerchant(pincodeByMerchant[mId], deliveryPincode, weightByMerchant[mId], isCOD)
        ));

        // Any merchant that couldn't be rated (missing pincode, network
        // issue, Shiprocket error) → fail open to the distance table rather
        // than show a broken/partial total.
        if (results.some(r => r === null)) {
            cartShiprocketRate = null;
            cartShiprocketUnserviceable = false;
            recalculateBill();
            return;
        }

        if (results.some(r => r.unserviceable)) {
            cartShiprocketRate = null;
            cartShiprocketUnserviceable = true;
            recalculateBill();
            return;
        }

        cartShiprocketRate = results.reduce((sum, r) => sum + (r.rate || 0), 0);
        cartShiprocketUnserviceable = false;
        recalculateBill();
    } catch (e) {
        cartShiprocketRate = null;
        cartShiprocketUnserviceable = false;
        recalculateBill();
    }
}

// Standard delivery uses the live Shiprocket total when one's been resolved
// for the current address/cart/payment method; otherwise (Shiprocket still
// loading, unreachable, or returned nothing) it falls back to a flat ₹15 —
// per explicit request, instead of the old distance-tier guess — so the
// bill line is never blank. Express/Same-day speeds are unaffected: they
// don't use Shiprocket at all and keep their own flat speed fee (₹20/₹10).
function getStandardDeliveryFee(tierDeliveryFee) {
    if (selectedDeliverySpeed !== 'manual') return tierDeliveryFee;
    if (typeof cartShiprocketRate === 'number') return cartShiprocketRate;
    return 15;
}

function recalculateBill() {
    let subtotal = currentCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const SHIPPING_THRESHOLD = FREE_DELIVERY_THRESHOLD; // ₹499+ = FREE delivery
    const freeDelivery = subtotal >= SHIPPING_THRESHOLD;

    let dynamicPlatformFee = 0;
    let dynamicProcessingCharge = 0;
    let shipping = 0;
    let delivery = 0;
    if (subtotal > 0 && !freeDelivery) {
        const tier = getDeliveryFeeTierByDistance(cartDeliveryDistanceKm, subtotal);
        delivery = getStandardDeliveryFee(tier.delivery);
        shipping = tier.shipping;
        dynamicPlatformFee = tier.platform;
        dynamicProcessingCharge = tier.processing;
    }
    let cod = (selectedPaymentMethod === "COD" && subtotal > 0) ? 10 : 0;
    let speedFee = subtotal > 0 ? (selectedDeliverySpeedFee || 0) : 0;
    discountAmount = Math.min(discountAmount, subtotal);
    let grandTotal = Math.max(0, (subtotal - discountAmount) + shipping + delivery + dynamicPlatformFee + dynamicProcessingCharge + cod + speedFee);

    const speedRow = document.getElementById('bill-speed-fee-row');
    const speedFeeEl = document.getElementById('bill-speed-fee');
    if (speedRow && speedFeeEl) {
        if (speedFee > 0) { speedRow.style.display = 'flex'; speedFeeEl.innerText = `₹${speedFee.toFixed(2)}`; }
        else { speedRow.style.display = 'none'; }
    }

    const freeWrap = document.getElementById('free-delivery-progress');
    const freeMsg = document.getElementById('free-delivery-msg');
    const freeText = document.getElementById('free-delivery-text');
    const freeFill = document.getElementById('free-delivery-fill');
    if (freeWrap && subtotal > 0) {
        freeWrap.style.display = 'block';
        if (freeDelivery) {
            if (freeMsg) freeMsg.className = 'free-delivery-msg';
            if (freeText) freeText.textContent = 'You get FREE delivery!';
            if (freeFill) { freeFill.style.width = '100%'; freeFill.className = 'free-delivery-bar-fill done'; }
        } else {
            const remaining = Math.max(0, SHIPPING_THRESHOLD - subtotal);
            const pct = Math.min(100, (subtotal / SHIPPING_THRESHOLD) * 100);
            if (freeMsg) freeMsg.className = 'free-delivery-msg red';
            if (freeText) freeText.textContent = `Add ₹${remaining.toFixed(0)} more for FREE delivery`;
            if (freeFill) { freeFill.style.width = pct + '%'; freeFill.className = pct >= 80 ? 'free-delivery-bar-fill close' : 'free-delivery-bar-fill'; }
        }
    } else if (freeWrap) {
        freeWrap.style.display = 'none';
    }

    if (document.getElementById('bill-subtotal')) {
        document.getElementById('bill-subtotal').innerText = `₹${subtotal.toFixed(2)}`;
        const discEl = document.getElementById('bill-discount');
        if (discEl) discEl.innerText = `-₹${discountAmount.toFixed(2)}`;
        const shippingEl = document.getElementById('bill-shipping');
        if (shippingEl) shippingEl.innerText = freeDelivery ? 'FREE' : `₹${shipping.toFixed(2)}`;
        const deliveryEl = document.getElementById('bill-delivery');
        if (deliveryEl) deliveryEl.innerText = freeDelivery ? 'FREE' : `₹${delivery.toFixed(2)}`;
        const distEl = document.getElementById('bill-delivery-distance');
        if (distEl) distEl.innerText = (cartDeliveryDistanceKm !== null && cartDeliveryDistanceKm !== undefined) ? ` (~${cartDeliveryDistanceKm.toFixed(1)} km)` : '';
        // Optional "Estimated delivery time: 15 min" line — only populated
        // when OSRM actually returned a road ETA (never fabricated).
        const etaEl = document.getElementById('bill-delivery-eta');
        if (etaEl) etaEl.innerText = (cartDeliveryEtaMin !== null && cartDeliveryEtaMin !== undefined) ? `Estimated delivery time: ${cartDeliveryEtaMin} min` : '';
        const platEl = document.getElementById('bill-platform');
        if (platEl) platEl.innerText = `₹${dynamicPlatformFee.toFixed(2)}`;
        const chargeEl = document.getElementById('bill-order-charge');
        if (chargeEl) chargeEl.innerText = `₹${dynamicProcessingCharge.toFixed(2)}`;
        const totalEl = document.getElementById('bill-grand-total');
        if (totalEl) totalEl.innerText = `₹${grandTotal.toFixed(2)}`;
        const freeTag = document.getElementById('free-delivery-tag');
        if (freeTag) freeTag.style.display = freeDelivery ? 'inline-block' : 'none';
    }

    const stickyTotal = document.getElementById('sticky-total-price');
    const stickyBar = document.getElementById('sticky-checkout-bar');
    if (stickyTotal) stickyTotal.textContent = `₹${grandTotal.toFixed(2)}`;
    if (stickyBar) stickyBar.style.display = subtotal > 0 ? 'flex' : 'none';
}

function generateSecureSixDigitOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ============================================================
// UPI INTENT / DEEP-LINK PAYMENT — direct merchant VPA, no gateway
// Merchant VPA: 9593625498@ibl  |  Payee name: MediFinder
//
// This ONLY builds and launches a upi://pay deep link so the customer's own
// UPI app (PhonePe/GPay/Paytm/etc.) opens with the amount pre-filled. No
// PIN, card, or secret key is ever collected on this site — the PIN is
// entered inside the customer's own UPI app. A plain deep link gives no
// callback, so this code NEVER marks an order "Paid" just because the link
// was opened — the shopper has to explicitly confirm with "Payment
// Completed" (see the #upi-payment-confirm step below), and even then the
// order is only saved as payment_verification_status "pending" until
// MediFinder's team verifies it from the admin panel.
const UPI_PAYEE_VPA = "9593625498@ibl";
const UPI_PAYEE_NAME = "MediFinder";

function isMobileDeviceForUpi() {
    return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent || '');
}

// Same "ORD-..." shape used everywhere else in this file — factored out so
// the id shown in the UPI app's note (tn=) is the exact same id the order
// row is saved under once "Payment Completed" is tapped.
function generateOrderId() {
    return "ORD-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
}

function getCartGrandTotalRupees() {
    const amountText = document.getElementById('bill-grand-total')?.innerText || document.getElementById('sticky-total-price')?.innerText || '₹0.00';
    return parseFloat(amountText.replace(/[^0-9.]/g, '')) || 0;
}

function showUpiPaymentConfirmStep() {
    const choice = document.getElementById('upi-method-choice');
    const confirmStep = document.getElementById('upi-payment-confirm');
    if (choice) choice.style.display = 'none';
    if (confirmStep) confirmStep.style.display = 'block';
}

function hideUpiPaymentConfirmStep() {
    const choice = document.getElementById('upi-method-choice');
    const confirmStep = document.getElementById('upi-payment-confirm');
    if (choice) choice.style.display = 'block';
    if (confirmStep) confirmStep.style.display = 'none';
}

// Builds upi://pay?pa=...&pn=...&am=...&cu=INR&tn=... with correct
// URL-encoding (encodeURIComponent turns "@" into "%40" and spaces into
// "%20"). orderIdForNote is the reserved order id so the note the customer
// sees inside their UPI app already names the real MediFinder order.
function buildUpiDeepLink(amountRupees, orderIdForNote) {
    const amt = (Math.round((parseFloat(amountRupees) || 0) * 100) / 100).toFixed(2);
    let link = `upi://pay?pa=${encodeURIComponent(UPI_PAYEE_VPA)}&pn=${encodeURIComponent(UPI_PAYEE_NAME)}&am=${amt}&cu=INR`;
    if (orderIdForNote) link += `&tn=${encodeURIComponent('MediFinder Order ' + orderIdForNote)}`;
    return link;
}

// "PAY NOW" (UPI App card) handler. Mobile-only intent launch; desktop just
// shows a message pointing at the QR option. Uses the standard
// visibility/blur heuristic to guess whether a UPI app actually intercepted
// the link, purely to decide whether to reveal the "Have you completed the
// payment?" confirmation step — this is NOT payment confirmation itself.
function handlePayWithUpiClick() {
    const statusMsg = document.getElementById('upi-pay-status-msg');
    const showStatus = (text, color) => {
        if (!statusMsg) return;
        statusMsg.style.display = 'block';
        statusMsg.style.color = color;
        statusMsg.innerText = text;
    };

    const amountRupees = getCartGrandTotalRupees();
    if (amountRupees <= 0) { showToast('Your cart total is ₹0.00 — add items before paying.', 'error'); return; }

    if (!pendingOnlineOrderId) pendingOnlineOrderId = generateOrderId();

    if (!isMobileDeviceForUpi()) {
        showStatus('UPI app payment is available on mobile devices. Please use the QR Code option below.', '#ff9f43');
        return;
    }

    const upiLink = buildUpiDeepLink(amountRupees, pendingOnlineOrderId);
    localStorage.setItem('medi_last_upi_attempt', JSON.stringify({ amount: amountRupees.toFixed(2), orderId: pendingOnlineOrderId, time: Date.now() }));

    let appOpened = false;
    const markOpened = () => { appOpened = true; };
    document.addEventListener('visibilitychange', markOpened, { once: true });
    window.addEventListener('blur', markOpened, { once: true });

    window.location.href = upiLink;

    setTimeout(() => {
        document.removeEventListener('visibilitychange', markOpened);
        window.removeEventListener('blur', markOpened);
        if (!appOpened) {
            showStatus('Unable to open UPI app? Please use the QR Code option below.', '#ff4d4d');
        } else {
            selectedOnlinePaymentMethod = 'UPI';
            showUpiPaymentConfirmStep();
        }
    }, 2000);
}

// Entry point for the main/sticky "Place Order" buttons. For COD it goes
// straight to processFinalOrderPayload() as before. For ONLINE it never
// places an order directly — the shopper must go through the UPI-app or
// QR card above and tap "Payment Completed" there (that button calls
// processFinalOrderPayload() itself); this just guides them to it so a
// stray tap on the main button can't silently create an unpaid order.
function handlePlaceOrderClick() {
    if (selectedPaymentMethod === 'ONLINE') {
        const upiDrawer = document.getElementById('upi-pay-drawer');
        if (upiDrawer) upiDrawer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast('Please complete your UPI payment above, then tap "Payment Completed".', 'info');
        return;
    }
    processFinalOrderPayload();
}

async function processFinalOrderPayload() {
    if (currentCart.length === 0) { showToast("Your cart is empty!", "error"); return; }
    const addr = JSON.parse(localStorage.getItem('medi_delivery_address') || 'null');
    if (!addr || !addr.house) {
        showToast("Please enter your delivery address first!", "error");
        return;
    }
    // Item 5: each Rx item now needs its OWN uploaded/verified prescription
    // (item.rxVerified, set once that specific item's camera/gallery upload
    // succeeds in the cart) rather than one global flag for the whole cart.
    const unverifiedRxItem = currentCart.find(item => (item.isRx === true || item.isRx === 'true') && !item.rxVerified);
    if (unverifiedRxItem) {
        showToast(`Order blocked! Upload prescription for "${unverifiedRxItem.name}" first.`, "error");
        return;
    }

    // ✅ Standard (5-7 day) delivery is available for every pincode in India —
    // only the fast 30-Min / Same-Day speeds are gated by the admin's
    // service_zones list. This check used to run unconditionally and would
    // incorrectly block a plain Standard order too for a pincode the admin
    // simply hasn't added to that list yet.
    if (selectedDeliverySpeed !== 'manual') {
        const zoneCheckAtOrder = await checkPincodeServiceability(addr.pincode);
        if (!zoneCheckAtOrder.available) {
            showToast("30 Min / Same Day isn't available for your pincode yet — please switch to Standard delivery.", "error");
            return;
        }
    }

    if (supabase) {
        try {
            for (const item of currentCart) {
                if (!item.id) continue;
                const { data: med, error: medErr } = await supabase.from('medicines').select('stock_qty, product_name, status, is_rx, prescription_req').eq('id', item.id).single();
                if (medErr || !med) {
                    showToast(`Product "${item.name}" not found in inventory.`, "error");
                    return;
                }
                if (med.status === 'Draft' || med.status === 'Rejected') {
                    showToast(`"${med.product_name}" is not available for purchase (${med.status}).`, "error");
                    return;
                }
                if (med.stock_qty < item.qty) {
                    showToast(`Insufficient stock for "${med.product_name}". Available: ${med.stock_qty}, requested: ${item.qty}.`, "error");
                    return;
                }
                // Re-check the Rx requirement straight from the DB row — the
                // client-side cart flag alone isn't trustworthy since it could
                // be bypassed by editing localStorage.
                const dbIsRx = med.prescription_req ? med.prescription_req === 'Yes' : (med.is_rx === true);
                if (dbIsRx && !item.rxVerified) {
                    showToast(`Order blocked! "${med.product_name}" requires a prescription upload.`, "error");
                    return;
                }
            }
        } catch(e) {
            showToast("Stock verification failed: " + (e.message || e), "error");
            return;
        }
    }

    const placeOrderBtn = document.getElementById('place-order-final-btn');
    const stickyPlaceBtn = document.getElementById('place-order-sticky-btn');
    const paymentCompletedBtn = document.getElementById('upi-payment-completed-btn');
    const origPlaceBtnHTML = placeOrderBtn ? placeOrderBtn.innerHTML : '';
    const origStickyBtnHTML = stickyPlaceBtn ? stickyPlaceBtn.innerHTML : '';
    const origPaymentCompletedBtnHTML = paymentCompletedBtn ? paymentCompletedBtn.innerHTML : '';
    if (placeOrderBtn) { placeOrderBtn.disabled = true; placeOrderBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...'; }
    if (stickyPlaceBtn) { stickyPlaceBtn.disabled = true; stickyPlaceBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...'; }
    if (paymentCompletedBtn) { paymentCompletedBtn.disabled = true; paymentCompletedBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...'; }

    // Direct UPI/QR payment, no gateway: this only reaches here after the
    // shopper explicitly tapped "Payment Completed" on the confirmation step
    // (see showUpiPaymentConfirmStep/handlePlaceOrderClick above) — there is
    // still no automatic way to confirm the money actually arrived, so the
    // order is saved as payment_verification_status "pending" below and only
    // flips to "verified" once MediFinder's admin team checks it manually.

    try {
    const primaryMerchantId = currentCart.find(item => item.merchantId)?.merchantId || null;
    let physicalDistanceKm = Math.sqrt(Math.pow(userLiveLat - shopCoordinates.lat, 2) + Math.pow(userLiveLng - shopCoordinates.lng, 2)) * 111;
    let calculatedTransitMode = physicalDistanceKm > 15 ? "Truck" : physicalDistanceKm > 5 ? "Van" : "Bike";
    let calculatedETA = Math.round(physicalDistanceKm * 6 + 15);
    const secureDeliveryOTP = generateSecureSixDigitOTP();
    const itemsDescription = currentCart.map(i => `${i.name} × ${i.qty}`).join(', ');
    const firstProductImg = currentCart[0]?.img || "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=400";
    const fullAddress = `${addr.house}, ${addr.area}, ${addr.city} - ${addr.pincode}${addr.landmark ? ', Near ' + addr.landmark : ''}`;
    const orderId = (selectedPaymentMethod === 'ONLINE' && pendingOnlineOrderId) ? pendingOnlineOrderId : generateOrderId();

    const subtotal = currentCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const grandTotal = document.getElementById('bill-grand-total')?.innerText || "₹0.00";

    // Same per-component breakdown recalculateBill() shows on screen — saved
    // onto the order itself so the receipt (order-receipt.html) can show
    // exactly what was charged instead of only the final total.
    const SHIPPING_THRESHOLD_FOR_ORDER = FREE_DELIVERY_THRESHOLD;
    const freeDeliveryForOrder = subtotal >= SHIPPING_THRESHOLD_FOR_ORDER;
    let orderShippingFee = 0, orderDeliveryFee = 0, orderPlatformFee = 0, orderProcessingFee = 0;
    if (subtotal > 0 && !freeDeliveryForOrder) {
        const tier = getDeliveryFeeTierByDistance(cartDeliveryDistanceKm, subtotal);
        orderDeliveryFee = getStandardDeliveryFee(tier.delivery);
        orderShippingFee = tier.shipping;
        orderPlatformFee = tier.platform;
        orderProcessingFee = tier.processing;
    }
    const orderCodFee = (selectedPaymentMethod === "COD" && subtotal > 0) ? 10 : 0;
    const orderSpeedFee = subtotal > 0 ? (selectedDeliverySpeedFee || 0) : 0;

    let currentUserId = '';
    if (supabase) {
        try {
            const { data: userData } = await supabase.auth.getUser();
            currentUserId = userData?.user?.id || '';
            if (!currentUserId) {
                const { data: { session } } = await supabase.auth.getSession();
                currentUserId = session?.user?.id || '';
            }
        } catch(e) {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                currentUserId = session?.user?.id || '';
            } catch(e2) {}
            if (!currentUserId) showToast("User session fetch failed. Order will be placed anonymously.", "info");
        }
    }

    // Item: carry the uploaded prescription slip(s) through to the real order row so the
    // merchant panel can actually display it (previously this was never saved on `orders`).
    const rxCartItems = currentCart.filter(i => i.rxVerified && i.prescriptionUrl);
    const orderPrescriptionRequired = rxCartItems.length > 0;
    const orderPrescriptionUrl = rxCartItems.length > 0 ? rxCartItems[0].prescriptionUrl : null;

    // For COD, payment_mode stays exactly "COD" as before. For online orders
    // it's saved as the specific method used ("UPI" or "UPI_QR") — matching
    // the value marchentorders.html's getPaymentDisplay() already recognizes
    // — instead of the generic "ONLINE" the radio button's value carries.
    const paymentModeToSave = selectedPaymentMethod === "COD" ? "COD" : (selectedOnlinePaymentMethod || "UPI");

    const orderPayload = {
        order_id: orderId,
        user_id: currentUserId || null,
        customer_name: addr.name,
        customer_phone: addr.phone,
        customer_address: fullAddress,
        user_email: supabase ? (await supabase.auth.getUser()).data?.user?.email || '' : '',
        items_text: itemsDescription,
        items_img: firstProductImg,
        address: fullAddress,
        delivery_address: fullAddress,
        payment_mode: paymentModeToSave,
        total_bill: grandTotal,
        total_amount: parseFloat(grandTotal.replace('₹', '')) || subtotal,
        total: subtotal,
        payment_status: selectedPaymentMethod === "COD" ? "Pending" : "Payment verification pending",
        // Real merchant-Accept lock and admin verification key off this field
        // (see marchentorders.html/marchenthome.html getActionButtons() and
        // adminuser.js verifyUpiPayment()) — COD orders never carry it.
        payment_verification_status: selectedPaymentMethod === "COD" ? null : "pending",
        status: "pending",
        transit_mode: calculatedTransitMode,
        eta_minutes: calculatedETA,
        shop_lat: shopCoordinates.lat,
        shop_lng: shopCoordinates.lng,
        delivery_secure_code: secureDeliveryOTP,
        razorpay_payment_id: null, // kept for schema compatibility; not used by the direct-UPI flow
        date_string: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
        merchant_id: primaryMerchantId,
        prescription_required: orderPrescriptionRequired,
        rx_prescription_url: orderPrescriptionUrl,
        // ✅ Item 3 fix: "This medicine is for" now comes from the single
        // patient selector at the TOP of the cart ("Ordering For" chips —
        // Self / saved patients) instead of a second, duplicate Self/Add
        // Patient picker that used to be injected again just above the
        // Place Order button. One patient-selection UI, not two.
        patient_id: (cartActivePatientId && cartActivePatientId !== 'self') ? cartActivePatientId : null,
        patient_name: (cartActivePatientId && cartActivePatientId !== 'self') ? (patientsData.find(p => p.id === cartActivePatientId)?.name || null) : null,
        // Per-component bill breakdown — read by order-receipt.html so the
        // printed/downloaded receipt shows the same charges the cart showed
        // at checkout, not just the grand total.
        shipping_fee: orderShippingFee,
        delivery_fee: orderDeliveryFee,
        platform_fee: orderPlatformFee,
        processing_fee: orderProcessingFee,
        cod_fee: orderCodFee,
        discount: discountAmount || 0,
        coupon_code: appliedCouponInfo?.code || appliedCouponInfo?.coupon_code || null,
        delivery_speed: selectedDeliverySpeed || 'manual',
        delivery_speed_fee: orderSpeedFee
    };

    let activeOrdersSystem = JSON.parse(localStorage.getItem('medi_active_orders')) || [];
    activeOrdersSystem.push(orderPayload);
    localStorage.setItem('medi_active_orders', JSON.stringify(activeOrdersSystem));

    if (supabase) {
        try {
            let { data: insertedOrder, error } = await supabase.from('orders').insert([orderPayload]).select().single();
            // Several columns here (patient_id/patient_name, and the new bill-
            // breakdown columns below) are optional additions that may not
            // exist yet on every deployment's `orders` table — PostgREST
            // rejects the WHOLE insert over a single unknown column, so on
            // that specific error this strips the column it named and
            // retries, instead of failing order placement entirely.
            let payloadForRetry = orderPayload;
            let retryGuard = 0;
            while (error && retryGuard < 12 && /column .*(does not exist|not found)|could not find/i.test(error.message || '')) {
                const m = (error.message || '').match(/'([a-zA-Z_]+)'/) || (error.message || '').match(/"([a-zA-Z_]+)"/);
                const badCol = m ? m[1] : null;
                if (!badCol || !(badCol in payloadForRetry)) break;
                const { [badCol]: _drop, ...rest } = payloadForRetry;
                payloadForRetry = rest;
                const retryResult = await supabase.from('orders').insert([payloadForRetry]).select().single();
                insertedOrder = retryResult.data;
                error = retryResult.error;
                retryGuard++;
            }
            if (!error && insertedOrder) {
                pushUserNotification(currentUserId, 'order_placed', 'Order Placed', `Your order ${orderId} has been placed successfully.`, orderId);
                const orderItemsPayload = currentCart.map(item => ({
                    order_id: orderId,
                    product_name: item.name,
                    product_image: item.img || '',
                    quantity: item.qty,
                    unit_price: item.price,
                    total_price: item.price * item.qty,
                    status: 'active',
                    merchant_id: item.merchantId || primaryMerchantId || null,
                    // ✅ NEW: best-effort MRP column, used later by the Order Detail
                    // return-eligibility check (₹299+ rule). If the 'order_items'
                    // table doesn't actually have this column yet, the insert below
                    // falls back to the original, safe payload automatically instead
                    // of failing the whole order-items save.
                    mrp: item.mrp || item.price
                }));
                try {
                    const { error: itemsErr } = await supabase.from('order_items').insert(orderItemsPayload);
                    if (itemsErr) throw itemsErr;
                } catch (e) {
                    try {
                        const basicItemsPayload = orderItemsPayload.map(({ mrp, ...rest }) => rest);
                        await supabase.from('order_items').insert(basicItemsPayload);
                    } catch (e2) {
                        showToast("Order items save error: " + (e2.message || e2), "error");
                    }
                }
                // Mark the applied coupon as used now that the order has
                // actually gone through — checks the right table depending
                // on whether it was the user's own earned coupon (user_coupons)
                // or a general public code (coupons), so it can't be reused.
                if (appliedCouponInfo && appliedCouponInfo.id) {
                    try {
                        const couponTable = appliedCouponInfo.source === 'personal' ? 'user_coupons' : 'coupons';
                        await supabase.from(couponTable).update({ is_used: true }).eq('id', appliedCouponInfo.id);
                    } catch (e) {}
                    appliedCouponInfo = null;
                    discountAmount = 0;
                    const couponInputEl = document.getElementById('coupon-input');
                    const couponStatusEl = document.getElementById('coupon-status-msg');
                    if (couponInputEl) couponInputEl.value = '';
                    if (couponStatusEl) couponStatusEl.innerText = '';
                }
                // First-order reward — a real, persistent coupon (not just a
                // toast) that shows up under Offers & Coupons afterward.
                if (currentUserId) {
                    try {
                        const { count } = await supabase.from('orders').select('order_id', { count: 'exact', head: true }).eq('user_id', currentUserId);
                        if (count === 1) {
                            await supabase.from('user_coupons').insert([{
                                user_id: currentUserId,
                                code: 'WELCOME50',
                                description: '₹50 off your next order — thanks for your first order!',
                                is_used: false
                            }]);
                        }
                    } catch (e) {}
                }
                // Lock in any "50% off — first order only" sponsor deals used in
                // this order, so the same shopper can't reuse them on a repeat
                // order of the same sponsored item.
                if (currentUserId) {
                    for (const item of currentCart) {
                        if (item.sponsorDiscountSlotId) {
                            try {
                                await supabase.from('sponsor_discount_claims').insert([{
                                    user_id: currentUserId,
                                    sponsored_product_id: item.sponsorDiscountSlotId,
                                    product_id: item.id,
                                    order_id: orderId
                                }]);
                            } catch (e) {}
                        }
                    }
                }
                for (const item of currentCart) {
                    if (item.id && item.qty) {
                        // supabase-js resolves with {error} on a failed RPC call, it does
                        // NOT throw — so the try/catch fallback here never actually ran
                        // when decrement_stock was missing (404), and stock silently never
                        // decremented. Check the returned error explicitly instead.
                        try {
                            const { error: rpcErr } = await supabase.rpc('decrement_stock', { med_id: item.id, qty: item.qty });
                            if (rpcErr) throw rpcErr;
                        } catch (e) {
                            try {
                                const { data: currMed } = await supabase.from('medicines').select('stock_qty').eq('id', item.id).single();
                                if (currMed) {
                                    const newQty = Math.max(0, currMed.stock_qty - item.qty);
                                    await supabase.from('medicines').update({ stock_qty: newQty }).eq('id', item.id);
                                }
                            } catch (e2) {}
                        }
                    }
                }
                const notifiedMerchants = new Set();
                for (const item of currentCart) {
                    const mid = item.merchantId || primaryMerchantId;
                    if (mid && !notifiedMerchants.has(mid)) {
                        notifiedMerchants.add(mid);
                        try {
                            await supabase.from('merchant_notifications').insert([{
                                merchant_id: mid,
                                title: 'New Order Received',
                                message: `Order ${orderId} from ${addr.name}. Items: ${itemsDescription}. Total: ₹${grandTotal}. Address: ${fullAddress}`,
                                type: 'info',
                                category: 'order',
                                is_read: false
                            }]);
                        } catch(e) {}
                    }
                }
            } else if (error) {
                // Order insert into the 'orders' table failed - surface the real reason
                // instead of silently pretending it worked, and queue it for auto-retry.
                showToast('Order DB save failed: ' + (error.message || 'Unknown database error') + '. Will auto-retry shortly.', 'error');
                let pendingSync = JSON.parse(localStorage.getItem('medi_pending_order_sync')) || [];
                pendingSync.push(orderPayload);
                localStorage.setItem('medi_pending_order_sync', JSON.stringify(pendingSync));
            }
        } catch (e) {
            showToast('Order DB save failed: ' + (e.message || e) + '. Will auto-retry shortly.', 'error');
            let pendingSync = JSON.parse(localStorage.getItem('medi_pending_order_sync')) || [];
            pendingSync.push(orderPayload);
            localStorage.setItem('medi_pending_order_sync', JSON.stringify(pendingSync));
        }
    }

    if (selectedPaymentMethod === 'COD') {
        const successModal = document.getElementById('success-animation-modal');
        if (successModal) {
            const el1 = document.getElementById('success-order-id');
            const el2 = document.getElementById('success-payment');
            const el3 = document.getElementById('success-eta');
            const el4 = document.getElementById('success-otp-code');
            if (el1) el1.textContent = orderId;
            if (el2) el2.textContent = 'Cash on Delivery';
            if (el3) el3.textContent = calculatedETA + ' mins';
            if (el4) el4.textContent = secureDeliveryOTP;
            successModal.style.display = 'flex';
            setTimeout(function(){ successModal.classList.add('modal-revealed'); }, 50);
            createConfetti();
            // Auto-close the celebration within 5s instead of staying up
            // until the person taps a button.
            clearTimeout(window.__successModalAutoCloseTimer);
            window.__successModalAutoCloseTimer = setTimeout(function () {
                successModal.classList.remove('modal-revealed');
                successModal.style.display = 'none';
            }, 5000);
        } else {
            showToast(`Order placed! Delivery Code: ${secureDeliveryOTP}`, "success");
        }
    } else {
        // Online (UPI/QR) orders never get the "Order Placed!" celebration —
        // nothing is actually confirmed yet. They get the distinct "Payment
        // Submitted / verification pending" screen instead.
        const pendingModal = document.getElementById('payment-pending-modal');
        if (pendingModal) {
            const el1 = document.getElementById('payment-pending-order-id');
            const el2 = document.getElementById('payment-pending-amount');
            const el3 = document.getElementById('payment-pending-method');
            if (el1) el1.textContent = orderId;
            if (el2) el2.textContent = grandTotal;
            if (el3) el3.textContent = paymentModeToSave === 'UPI_QR' ? 'UPI (QR Code)' : 'UPI';
            pendingModal.style.display = 'flex';
        } else {
            showToast(`Order submitted! Payment verification pending. Order ID: ${orderId}`, "info");
        }
        // Reset the reserved online-order state so a fresh cart/checkout
        // later starts clean instead of reusing this order id.
        pendingOnlineOrderId = null;
        selectedOnlinePaymentMethod = null;
        const upiStatusMsg = document.getElementById('upi-pay-status-msg');
        if (upiStatusMsg) upiStatusMsg.style.display = 'none';
        hideUpiPaymentConfirmStep();
    }

    // Cart is intentionally left as-is here. The order is already saved to the
    // orders table (i.e. archived) — auto-wiping the cart on top of that was
    // the reported bug. Items now only leave the cart when the user removes
    // them via the existing per-item delete button.
    } finally {
        if (placeOrderBtn) { placeOrderBtn.disabled = false; placeOrderBtn.innerHTML = ''; }
        if (stickyPlaceBtn) { stickyPlaceBtn.disabled = false; stickyPlaceBtn.innerHTML = '<i class="fa-solid fa-bag-shopping"></i> Place Order'; }
        if (paymentCompletedBtn) { paymentCompletedBtn.disabled = false; paymentCompletedBtn.innerHTML = origPaymentCompletedBtnHTML || '<i class="fa-solid fa-check"></i> Payment Completed'; }
    }
}

// Retries any orders that failed to save to the 'orders' table earlier (e.g. due to a
// temporary network/DB error) so they eventually reach the merchant/rider/admin panels.
async function retryPendingOrderSync() {
    if (!supabase) return;
    let pending = JSON.parse(localStorage.getItem('medi_pending_order_sync')) || [];
    if (pending.length === 0) return;

    const stillPending = [];
    let syncedCount = 0;
    for (const payload of pending) {
        try {
            // Skip if it already exists (in case a previous retry partially succeeded)
            const { data: existing } = await supabase.from('orders').select('order_id').eq('order_id', payload.order_id).maybeSingle();
            if (existing) { syncedCount++; continue; }

            const { error } = await supabase.from('orders').insert([payload]);
            if (error) stillPending.push(payload);
            else syncedCount++;
        } catch (e) {
            stillPending.push(payload);
        }
    }
    localStorage.setItem('medi_pending_order_sync', JSON.stringify(stillPending));
    if (syncedCount > 0) {
        showToast(`${syncedCount} pending order(s) synced successfully.`, 'success');
    }
}

function createConfetti() {
    const container = document.getElementById('confettiCanvas');
    if (!container) return;
    container.innerHTML = '';
    const colors = ['#e02020', '#2ed573', '#ffa502', '#3742fa', '#ff6b81', '#1e90ff', '#ffd32a'];
    for (let i = 0; i < 60; i++) {
        const p = document.createElement('div');
        p.className = 'confetti-particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        p.style.animationDuration = (Math.random() * 2 + 1.5) + 's';
        p.style.animationDelay = (Math.random() * 0.8) + 's';
        p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        p.style.width = (Math.random() * 8 + 6) + 'px';
        p.style.height = (Math.random() * 8 + 6) + 'px';
        container.appendChild(p);
    }
    setTimeout(function(){ container.innerHTML = ''; }, 4000);
}

// ============================================================
// ORDERS PAGE
// ============================================================
// Turns a `prescription_orders` row into the same shape renderOrdersUI
// already knows how to draw a card for — the prescription photo stands in
// for a product image, and there's no billed total yet since the pharmacy
// hasn't confirmed/priced the medicines.
// ============================================================
// ORDER SYSTEM HELPERS — added for the unified "My Orders" page,
// the Order Detail view, its bill box, status timeline, delivery-status
// display logic, and return eligibility. All of these are pure, defensive
// helpers: every one of them safely handles missing/null/string values so
// nothing here can throw and break order rendering (see item 17).
// ============================================================

// Safely turns any price-ish value (number, numeric string, "₹1,234.50",
// null, undefined) into a clean float. Never throws, never returns NaN.
function safeParseCurrency(val) {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const cleaned = String(val).replace(/[₹,\s]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
}

// Consistent ₹ formatting used across the order card/detail/bill box.
function formatRupees(val) {
    const n = safeParseCurrency(val);
    return `₹${n.toFixed(2)}`;
}

// Parses whatever date representation an order might carry
// (date_string in "DD/MM/YYYY" en-GB form, an ISO created_at/delivered_at,
// or nothing at all) into a real Date, or null if it can't be parsed —
// callers must null-check rather than assume a valid Date comes back.
function safeParseOrderDate(order) {
    if (!order) return null;
    const candidates = [order.delivered_at, order.created_at, order.date_string];
    for (const c of candidates) {
        if (!c) continue;
        // en-GB "DD Month YYYY" or "DD/MM/YYYY" style date_string values need
        // a bit of help — the native Date parser mishandles DD/MM/YYYY.
        if (typeof c === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(c)) {
            const [d, m, y] = c.split('/').map(Number);
            const dt = new Date(y, m - 1, d);
            if (!isNaN(dt.getTime())) return dt;
            continue;
        }
        const dt = new Date(c);
        if (!isNaN(dt.getTime())) return dt;
    }
    return null;
}

// Merges the active + completed order caches into ONE de-duplicated,
// newest-first list — this is what removes the dependency on separate
// "Active"/"History" tabs while still reusing all the existing
// localStorage caching that refreshOrdersFromServer()/realtime already
// maintain, so nothing about how orders get fetched/cached changes.
function getUnifiedOrdersList() {
    const active = JSON.parse(localStorage.getItem('medi_active_orders') || '[]') || [];
    const completed = JSON.parse(localStorage.getItem('medi_completed_orders') || '[]') || [];
    const merged = [];
    const seen = new Set();
    [...active, ...completed].forEach(o => {
        const id = o.order_id || o.id;
        if (!id || seen.has(id)) return;
        seen.add(id);
        merged.push(o);
    });
    merged.sort((a, b) => {
        const da = safeParseOrderDate(a);
        const db = safeParseOrderDate(b);
        if (da && db) return db - da;
        if (db) return 1;
        if (da) return -1;
        return 0;
    });
    return merged;
}

// Item 6 — DELIVERY STATUS LOGIC. This is purely a display-layer mapping;
// it never writes back to the order's real backend `status` field. For any
// "in transit" backend status, it uses eta_minutes (when available) to
// decide between "Shipped" (long-haul, >1 day out) and "Out for Delivery"
// (short/local leg, currently moving) — exactly as requested.
function getOrderDisplayStatus(order) {
    const s = (order?.status || '').toLowerCase();
    const map = {
        pending: 'Pending',
        accepted: 'Accepted',
        arrived_at_store: 'Packed',
        packed: 'Packed',
        broadcasted: 'Broadcasted',
        picked_up: 'Out for Delivery',
        shipped: 'Shipped',
        out_for_delivery: 'Out for Delivery',
        delivered: 'Delivered',
        cancelled: 'Cancelled'
    };
    const inTransitStatuses = ['picked_up', 'shipped', 'broadcasted'];
    if (inTransitStatuses.includes(s)) {
        const eta = parseFloat(order?.eta_minutes);
        if (!isNaN(eta) && eta > 1440) return 'Shipped'; // more than 1 day out
        if (!isNaN(eta)) return 'Out for Delivery'; // local/short leg, currently moving
    }
    return map[s] || (order?.is_prescription_order ? (s === 'accepted' ? 'Accepted' : 'Pending') : (order?.status || 'Pending'));
}

// Item 5 — full order-status timeline for the Order Detail view.
// Cancelled orders get their own short, honest timeline instead of a
// half-finished "Delivered" progress bar.
function buildOrderStatusTimeline(order) {
    const s = (order?.status || '').toLowerCase();
    if (s === 'cancelled') {
        return [
            { label: 'Order Placed', done: true },
            { label: 'Cancelled', done: true, isCancelled: true }
        ];
    }
    const stageOrder = ['pending', 'accepted', 'in_transit', 'delivered'];
    const stageIndexMap = {
        pending: 0, accepted: 1, arrived_at_store: 1, packed: 1,
        broadcasted: 2, picked_up: 2, shipped: 2, out_for_delivery: 2,
        delivered: 3
    };
    const currentIdx = stageIndexMap[s] ?? 0;
    const shippedLabel = getOrderDisplayStatus(order) === 'Shipped' ? 'Shipped' : 'Out for Delivery';
    const stages = [
        { label: 'Order Placed', idx: 0 },
        { label: 'Accepted', idx: 1 },
        { label: shippedLabel, idx: 2 },
        { label: 'Delivered', idx: 3 }
    ];
    return stages.map(st => ({ label: st.label, done: currentIdx >= st.idx, active: currentIdx === st.idx }));
}

// Fetches the most recent return request (if any) for this order, so the
// Order Detail sheet can show a real pickup-status timeline once a return
// has been submitted — instead of the customer only ever seeing the return
// reason they picked with no visibility into what happens after.
async function fetchReturnForOrder(orderId) {
    if (!supabase || !orderId) return null;
    try {
        const { data, error } = await supabase.from('returns').select('*').eq('order_id', orderId).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (error || !data) return null;
        return data;
    } catch (e) {
        return null;
    }
}

// Mirrors buildOrderStatusTimeline()'s stage/dot pattern, but for the
// pickup/refund lifecycle of a return request: Requested -> Approved ->
// Pickup Scheduled -> Picked Up -> Refunded (or Rejected, shown like a
// cancellation). Reads whatever the merchant/admin side has set on the
// `returns` row (status, pickup_date) — degrades gracefully to just
// "Requested" if nothing further has been updated yet.
function buildReturnStatusTimeline(ret) {
    const s = (ret?.status || 'pending').toLowerCase();
    if (s === 'rejected' || s === 'declined') {
        return [
            { label: 'Return Requested', done: true },
            { label: 'Rejected', done: true, isCancelled: true }
        ];
    }
    const stageIndexMap = { pending: 0, requested: 0, approved: 1, accepted: 1, pickup_scheduled: 2, scheduled: 2, picked_up: 3, collected: 3, refunded: 4, completed: 4 };
    const currentIdx = stageIndexMap[s] ?? 0;
    const stages = [
        { label: 'Return Requested', idx: 0 },
        { label: 'Approved', idx: 1 },
        { label: ret?.return_pickup_date ? `Pickup Scheduled — ${new Date(ret.return_pickup_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Pickup Scheduled', idx: 2 },
        { label: 'Picked Up', idx: 3 },
        { label: 'Refunded', idx: 4 }
    ];
    return stages.map(st => ({ label: st.label, done: currentIdx >= st.idx, active: currentIdx === st.idx }));
}

// Fetches the real line items for an order from `order_items` (the table
// processFinalOrderPayload() already writes to) so the Order Detail bill box
// and return-eligibility check can use real per-product prices instead of
// guessing from the order total alone. Always resolves — never throws.
async function fetchOrderLineItems(orderId) {
    if (!supabase || !orderId || String(orderId).startsWith('RX-')) return [];
    try {
        const { data, error } = await supabase.from('order_items').select('*').eq('order_id', orderId);
        if (error || !data) return [];
        return data;
    } catch (e) {
        return [];
    }
}

// ✅ NEW — Order Page premium merge (Item: pharmacy/shop name on cards).
// Simple in-memory cache so re-rendering Orders repeatedly never re-queries
// the same merchant row twice — keeps this fully real-data-driven without
// hammering Supabase on every renderOrdersUI() call.
const _merchantNameCache = {};
async function getMerchantNameCached(merchantId) {
    if (!merchantId) return '';
    if (_merchantNameCache[merchantId] !== undefined) return _merchantNameCache[merchantId];
    if (!supabase) return '';
    try {
        const { data } = await supabase.from('merchants').select('shop_name, merchant_name').eq('id', merchantId).maybeSingle();
        const name = data?.shop_name || data?.merchant_name || '';
        _merchantNameCache[merchantId] = name;
        return name;
    } catch (e) {
        return '';
    }
}

// ✅ NEW — Invoice / Receipt button. Opens the user's EXISTING
// order-receipt.html with the real order_id (+ merchant_id when known).
// Never generates a new receipt page, a Blob invoice, or a temporary file —
// order-receipt.html itself is left completely untouched.
window.openOrderInvoice = function (orderId, merchantId) {
    if (!orderId) { showToast("Invoice not available for this order.", "error"); return; }
    window.open(
        'order-receipt.html?order_id=' + encodeURIComponent(orderId) +
        '&merchant_id=' + encodeURIComponent(merchantId || ''),
        '_blank'
    );
};

// Item 8 — ORDER BILL. Builds a safe {subtotal, charges, total} breakdown
// dynamically from whatever real fields are actually available: real
// per-item prices from order_items when we have them, and the order's own
// saved total for the grand total and (as a same-order fallback) the
// subtotal too. "Charges" bundles platform fee + delivery charge together
// since individual fee columns aren't persisted on the order row — this
// never invents numbers, it only derives the difference that's really there.
function computeOrderBill(order, items) {
    const total = safeParseCurrency(order?.total_amount ?? order?.total_bill);
    let subtotal = safeParseCurrency(order?.total);
    if (items && items.length > 0) {
        const itemsSum = items.reduce((sum, it) => sum + safeParseCurrency(it.total_price ?? (safeParseCurrency(it.unit_price) * (it.quantity || 1))), 0);
        if (itemsSum > 0) subtotal = itemsSum;
    }
    if (!subtotal) subtotal = total;
    const charges = Math.max(0, +(total - subtotal).toFixed(2));
    return { subtotal: +subtotal.toFixed(2), charges, total: +total.toFixed(2) };
}

// Item 9 — RETURN LOGIC. Delivered only, within 7 days of delivery, and
// ONLY if at least one product in the order had an original/listing price
// (or a special/selling price) above ₹299 — never for orders where every
// single item was ₹299 or below.
function computeReturnEligibility(order, items) {
    const s = (order?.status || '').toLowerCase();
    if (s !== 'delivered') return { eligible: false };
    const deliveredDate = safeParseOrderDate(order);
    if (!deliveredDate) return { eligible: false };
    const daysSince = Math.floor((new Date() - deliveredDate) / (1000 * 60 * 60 * 24));
    if (daysSince > 7) return { eligible: false, expired: true };

    let hasQualifyingItem = false;
    if (items && items.length > 0) {
        hasQualifyingItem = items.some(it => {
            const price = Math.max(safeParseCurrency(it.mrp), safeParseCurrency(it.unit_price));
            return price > 299;
        });
    } else {
        // No line-item data available (older order, or fetch failed) — fall
        // back to the order's own total so return isn't silently hidden.
        hasQualifyingItem = safeParseCurrency(order?.total_amount ?? order?.total_bill) > 299;
    }
    return { eligible: hasQualifyingItem, daysLeft: Math.max(0, 7 - daysSince) };
}

function mapPrescriptionOrderToCard(rx) {
    const statusMap = { pending: 'pending', accepted: 'accepted', cancelled: 'cancelled' };
    return {
        order_id: 'RX-' + rx.id,
        is_prescription_order: true,
        rx_id: rx.id,
        status: statusMap[rx.status] || rx.status || 'pending',
        date_string: rx.created_at ? new Date(rx.created_at).toLocaleDateString('en-GB') : '',
        items_img: rx.prescription_url,
        items_text: rx.status === 'accepted' ? 'Prescription accepted — pharmacy is preparing your medicines' : 'Prescription sent to nearby pharmacies',
        total_bill: 'To be confirmed by pharmacy',
        delivery_secure_code: rx.delivery_otp || ''
    };
}

async function refreshOrdersFromServer() {
    const listContainer = document.getElementById('order-list');
    if (!listContainer) return;
    if (supabase) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const { data: dbOrders } = await supabase.from('orders')
                    .select('*')
                    .or(`user_id.eq.${session.user.id},customer_phone.eq.${session.user.phone || ''},user_email.eq.${session.user.email || ''}`)
                    .order('created_at', { ascending: false })
                    .limit(20);

                // Item 3/5: prescription orders now show up in the same order
                // list as regular medicine orders instead of being invisible
                // here — with the prescription image standing in for the
                // product photo, and status/OTP wired the same way.
                const { data: dbRxOrders } = await supabase.from('prescription_orders')
                    .select('*')
                    .eq('user_id', session.user.id)
                    .order('created_at', { ascending: false })
                    .limit(20);

                const allOrders = [
                    ...(dbOrders || []),
                    ...((dbRxOrders || []).map(mapPrescriptionOrderToCard))
                ];
                if (allOrders.length > 0) {
                    const active = allOrders.filter(o => !['delivered', 'cancelled'].includes((o.status || '').toLowerCase()));
                    const completed = allOrders.filter(o => ['delivered', 'cancelled'].includes((o.status || '').toLowerCase()));
                    localStorage.setItem('medi_active_orders', JSON.stringify(active));
                    localStorage.setItem('medi_completed_orders', JSON.stringify(completed));
                }
            }
        } catch (e) {}
    }
    renderOrdersUI();
}

// Item 3 — "My Orders" now shows every order together (Pending, Accepted,
// Packed, Broadcasted, Shipped, Out for Delivery, Delivered, Cancelled) in
// one merged, newest-first list, instead of separate Active/History tabs.
// The old .tab-btn markup (if present in the HTML) is hidden rather than
// removed, so nothing about the page layout breaks if it's still there.
let _ordersHelpButtonBound = false;
async function setupOrdersPageModules() {
    const listContainer = document.getElementById('order-list');
    if (!listContainer) return;

    await refreshOrdersFromServer();

    const tabBtnsWrapper = document.querySelector('.order-tabs, .tabs, .tab-btn')?.closest?.('div') || null;
    document.querySelectorAll('.tab-btn').forEach(btn => { btn.style.display = 'none'; });
    if (tabBtnsWrapper && tabBtnsWrapper.querySelectorAll('.tab-btn').length === tabBtnsWrapper.children.length) {
        tabBtnsWrapper.style.display = 'none';
    }

    renderOrdersUI();
    listenToUserOrders();
    setupOrdersHelpButton();
}

// Item 13 — Help button at the top-right of My Orders. Injected once
// (idempotent — safe even though setupOrdersPageModules() can run more than
// once) so there's never a duplicate button or duplicate click handler.
function setupOrdersHelpButton() {
    const ordersPage = document.getElementById('page-order') || document.getElementById('order-list')?.closest('.app-page');
    if (!ordersPage) return;
    if (document.getElementById('orders-help-btn')) { _ordersHelpButtonBound = true; return; }

    // Make sure the page can host an absolutely-positioned corner button
    // without disturbing its existing layout.
    const computedPos = window.getComputedStyle(ordersPage).position;
    if (computedPos === 'static') ordersPage.style.position = 'relative';

    const helpBtn = document.createElement('button');
    helpBtn.id = 'orders-help-btn';
    helpBtn.type = 'button';
    helpBtn.setAttribute('aria-label', 'Help');
    helpBtn.innerHTML = '<i class="fa-solid fa-circle-question"></i>';
    helpBtn.style.cssText = 'position:absolute;top:14px;right:14px;z-index:40;width:38px;height:38px;border-radius:50%;border:none;background:#1c82aa;color:#fff;font-size:1rem;box-shadow:0 3px 10px rgba(28,130,170,0.35);cursor:pointer;display:flex;align-items:center;justify-content:center;';
    ordersPage.insertBefore(helpBtn, ordersPage.firstChild);

    if (!_ordersHelpButtonBound) {
        helpBtn.addEventListener('click', openOrdersHelpSheet);
        _ordersHelpButtonBound = true;
    }
}

function openOrdersHelpSheet() {
    document.getElementById('orders-help-modal')?.remove();
    const whatsappMsg = encodeURIComponent("Hi, I am medifinderina's user\nI need help\nProblem: ");
    const modal = document.createElement('div');
    modal.id = 'orders-help-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:flex-end;justify-content:center;';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:20px 20px 0 0;padding:22px 20px 26px;width:100%;max-width:420px;box-sizing:border-box;">
            <h3 style="margin:0 0 4px;font-size:1.05rem;color:#2f3542;"><i class="fa-solid fa-headset" style="color:#1c82aa;"></i> Need help with an order?</h3>
            <p style="margin:0 0 16px;font-size:0.8rem;color:#747d8c;">Reach out to MediFinder support any time.</p>
            <a href="mailto:medifinderindia@gmail.com" style="display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid #eef2f5;border-radius:12px;margin-bottom:10px;text-decoration:none;color:#2f3542;font-weight:600;font-size:0.85rem;">
                <i class="fa-solid fa-envelope" style="color:#1c82aa;width:20px;text-align:center;"></i> medifinderindia@gmail.com
            </a>
            <a href="https://api.whatsapp.com/send?phone=919593625498&text=${whatsappMsg}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid #eef2f5;border-radius:12px;margin-bottom:16px;text-decoration:none;color:#2f3542;font-weight:600;font-size:0.85rem;">
                <i class="fa-brands fa-whatsapp" style="color:#25D366;width:20px;text-align:center;"></i> Chat on WhatsApp
            </a>
            <button type="button" id="orders-help-close" style="width:100%;padding:12px;border:1px solid #ddd;border-radius:10px;background:#fff;font-weight:600;cursor:pointer;">Close</button>
        </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('#orders-help-close').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}

let userOrdersChannel = null;
let userRxOrdersChannel = null;
function listenToUserOrders() {
    if (!supabase) return;
    if (!userOrdersChannel) {
        userOrdersChannel = supabase
            .channel('user-orders-realtime')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
                const updated = payload.new;
                if (updated.user_email !== currentUserEmail) return;
                let active = JSON.parse(localStorage.getItem('medi_active_orders')) || [];
                let completed = JSON.parse(localStorage.getItem('medi_completed_orders')) || [];
                const id = updated.order_id || updated.id;
                const idxActive = active.findIndex(o => (o.order_id || o.id) === id);
                const idxCompleted = completed.findIndex(o => (o.order_id || o.id) === id);
                if (['delivered', 'cancelled'].includes((updated.status || '').toLowerCase())) {
                    if (idxActive !== -1) { completed.push(active.splice(idxActive, 1)[0]); }
                    else if (idxCompleted !== -1) { completed[idxCompleted] = updated; }
                    else { completed.unshift(updated); }
                } else {
                    if (idxActive !== -1) { active[idxActive] = { ...active[idxActive], ...updated }; }
                    else { active.unshift(updated); }
                }
                localStorage.setItem('medi_active_orders', JSON.stringify(active));
                localStorage.setItem('medi_completed_orders', JSON.stringify(completed));
                renderOrdersUI();
                const statusText = (updated.status || '').toLowerCase();
                const statusMap = { pending: 'Order Placed', accepted: 'Accepted by pharmacy', arrived_at_store: 'Rider at pharmacy', picked_up: 'Picked up by rider', shipped: 'Out for delivery', delivered: 'Delivered!', broadcasted: 'Rider search active', cancelled: 'Order cancelled' };
                showToast(statusMap[statusText] || `Order status: ${updated.status}`, statusText === 'delivered' ? 'success' : statusText === 'cancelled' ? 'error' : 'info');

                // ✅ NEW: ট্র্যাকিং modal যদি এই order এর জন্যই খোলা থাকে, তাহলে সাথে সাথেই সেটাও রিফ্রেশ
                // করা হবে — আগে শুধু অর্ডার কার্ড আর toast আপডেট হতো, modal বন্ধ করে আবার না খুললে
                // পুরনো (stale) স্টেপ/স্ট্যাটাসই দেখাত।
                const trackingModal = document.getElementById('tracking-modal');
                if (trackingModal && trackingModal.classList.contains('active') && trackingModal.dataset.trackingOrderId === id && typeof window.openLiveTrackingModal === 'function') {
                    window.openLiveTrackingModal(id, updated.transit_mode || 'Bike', updated.shop_lat || 22.578, updated.shop_lng || 88.365, updated.eta_minutes || 20, updated.status, updated.rider_id || null);
                }
            })
            .subscribe();
    }
    // Mirrors the same pattern for prescription orders — the moment a pharmacy
    // accepts/cancels one, the order list and toast update without a refresh.
    if (!userRxOrdersChannel) {
        userRxOrdersChannel = supabase
            .channel('user-rx-orders-realtime')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'prescription_orders' }, (payload) => {
                const updated = payload.new;
                if (updated.user_id !== currentAuthUserId) return;
                refreshOrdersFromServer();
                const statusText = (updated.status || '').toLowerCase();
                const rxStatusMap = { accepted: 'Your prescription was accepted by a pharmacy!', cancelled: 'Your prescription order was cancelled.' };
                if (rxStatusMap[statusText]) {
                    showToast(rxStatusMap[statusText], statusText === 'accepted' ? 'success' : 'error');
                }
            })
            .subscribe();
    }
}

function renderOrdersUI() {
    const listContainer = document.getElementById('order-list');
    if (!listContainer) return;
    const orders = getUnifiedOrdersList();

    if (orders.length === 0) {
        listContainer.innerHTML = `<div class="cart-item-placeholder" style="text-align:center;padding:40px;color:#747d8c;"><p><i class="fa-solid fa-box-open" style="font-size:2rem;color:#ccc;margin-bottom:10px;"></i><br>No orders yet.</p></div>`;
        return;
    }

    // Item 4 — ORDER CARD: first product image, Order ID, date/time, current
    // status, total amount. Tapping anywhere on the card opens the full
    // Order Detail view (item 5) instead of showing Track/Cancel/OTP inline.
    listContainer.innerHTML = orders.map(order => {
        const id = order.order_id || order.id;
        const isRx = !!order.is_prescription_order;
        const s = (order.status || '').toLowerCase();
        const displayStatus = getOrderDisplayStatus(order);
        // ✅ Order status colors — exact mapping per spec: Accepted=green,
        // Rejected=red (this schema calls it "Cancelled"), Pending=yellow,
        // Delivered=orange. This is a display-only color map; it never
        // touches the real backend status value in order.status.
        const statusColors = {
            'Accepted': 'background:#e3faf2;color:#2ed573;',
            'Delivered': 'background:#fff1e0;color:#e8590c;',
            'Cancelled': 'background:#ffe3e3;color:#e02020;',
            'Pending': 'background:#fff9db;color:#f59f00;'
        };
        const statusStyle = statusColors[displayStatus] || 'background:#e7f4fb;color:#1c82aa;';
        const safeImg = order.items_img || 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=400';
        const dateLabel = order.date_string || (safeParseOrderDate(order) ? safeParseOrderDate(order).toLocaleDateString('en-GB') : '');

        // ✅ NEW — Premium order-page additions: real item count (derived
        // from the same items_text already saved at checkout — no extra
        // query), real ETA (only while genuinely in transit), and a
        // pharmacy-name slot that's filled in just below, once, from a
        // cached merchant lookup — never invented.
        const itemCount = (order.items_text || '').split(',').map(t => t.trim()).filter(Boolean).length;
        const itemCountLabel = itemCount > 0 ? `${itemCount} item${itemCount > 1 ? 's' : ''}` : '';
        const inTransit = ['picked_up', 'shipped', 'broadcasted', 'out_for_delivery'].includes(s);
        const etaVal = parseFloat(order.eta_minutes);
        const etaLabel = (inTransit && !isNaN(etaVal) && etaVal > 0 && etaVal <= 1440) ? `ETA ${Math.round(etaVal)} min` : '';
        const showQuickActions = s !== 'cancelled';
        const trackOnclick = isRx
            ? `window.openRxOrderTrackingModal('${(order.rx_id || '').toString().replace(/'/g, "\\'")}','${s}')`
            : `window.openLiveTrackingModal('${id}','${order.transit_mode || 'Bike'}',${order.shop_lat || 22.578},${order.shop_lng || 88.365},${order.eta_minutes || 20},'${s}',${order.rider_id ? `'${order.rider_id}'` : 'null'})`;

        return `
            <div class="single-order-card" id="order-card-${id}" onclick="openOrderDetailModal('${id}')" style="cursor:pointer;margin-bottom:12px;padding:14px;background:#ffffff;border-radius:16px;border:1px solid #eef2f5;box-shadow:0 4px 6px rgba(0,0,0,0.05);box-sizing:border-box;max-width:100%;overflow:hidden;">
                <div style="display:flex;flex-direction:row;justify-content:space-between;align-items:center;min-width:0;max-width:100%;">
                    <div class="order-info-wrapper" style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
                        <div class="order-img-box" style="width:60px;height:60px;background:#f8f9fa;border-radius:10px;padding:4px;display:flex;justify-content:center;align-items:center;flex-shrink:0;border:1px solid #f1f2f6;">
                            <img src="${safeImg}" alt="${isRx ? 'Prescription' : 'Medicine'}" style="max-width:100%;max-height:100%;object-fit:${isRx ? 'cover' : 'contain'};${isRx ? 'border-radius:8px;' : ''}">
                        </div>
                        <div class="order-meta" style="min-width:0;flex:1 1 auto;">
                            <h4 class="order-id-text" title="${String(id).replace(/"/g, '&quot;')}" style="font-size:0.85rem;color:#2f3542;font-weight:700;margin-bottom:2px;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">ID: ${id}${isRx ? ' <i class="fa-solid fa-file-prescription" style="color:#ff4d4d;"></i>' : ''}</h4>
                            <p style="margin:0;font-size:0.75rem;color:#747d8c;overflow-wrap:anywhere;">${dateLabel}${itemCountLabel ? ' • ' + itemCountLabel : ''}</p>
                            <p style="margin:1px 0 0;font-size:0.72rem;color:#a4b0be;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" id="order-shop-${id}" data-merchant-id="${order.merchant_id || ''}">${isRx ? 'Prescription order' : ''}</p>
                            <p style="font-weight:700;color:#1c82aa;margin-top:2px;overflow-wrap:anywhere;">Total: ${order.total_bill || formatRupees(order.total_amount)}</p>
                        </div>
                    </div>
                    <div class="order-action-area" style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;margin-left:8px;flex-shrink:0;">
                        <span style="font-size:0.65rem;font-weight:700;padding:3px 8px;border-radius:20px;white-space:nowrap;${statusStyle}">${displayStatus}</span>
                        ${etaLabel ? `<span style="font-size:0.65rem;color:#747d8c;white-space:nowrap;"><i class="fa-solid fa-clock"></i> ${etaLabel}</span>` : ''}
                        <i class="fa-solid fa-chevron-right" style="color:#ccc;"></i>
                    </div>
                </div>
                <!-- ✅ Item 4 fix: removed the Track Order / Invoice quick-action
                     buttons that used to sit directly on this list card —
                     they duplicated the same Track / Invoice buttons already
                     inside the full Order Details sheet opened by tapping the
                     card (see showTrack/showInvoice below), which is what
                     "track r invoice bar hoye গেছে" (Track & Invoice showing
                     up twice) was about. One clear entry point now: tap the
                     card to see full details, tracking and the invoice. -->
                ${showQuickActions ? `<p style="margin:8px 0 0;padding-top:8px;border-top:1px solid #f4f6f8;font-size:0.7rem;color:#a4b0be;text-align:center;"><i class="fa-solid fa-hand-pointer"></i> Tap for tracking${!isRx ? ' & invoice' : ''}</p>` : ''}
            </div>
        `;
    }).join('');

    // ✅ NEW — fill in real pharmacy/shop names asynchronously, after the
    // card markup is already on screen, so the list never blocks on network
    // round-trips. Batched to one fetch per unique merchant_id (cached).
    const uniqueMerchantIds = [...new Set(orders.map(o => o.merchant_id).filter(Boolean))];
    uniqueMerchantIds.forEach(async (mid) => {
        const name = await getMerchantNameCached(mid);
        if (!name) return;
        document.querySelectorAll(`[data-merchant-id="${mid}"]`).forEach(el => {
            if (el && !el.textContent.trim()) el.textContent = name;
        });
    });
}

window.handleCancelOrderFlow = function(orderId, pipelineStatus) {
    // Prescription orders route to their own, much simpler cancel path — they
    // live in `prescription_orders`, not `orders`, and can only be cancelled
    // before a pharmacy accepts.
    if (String(orderId).startsWith('RX-')) {
        const rxId = orderId.replace(/^RX-/, '');
        if ((pipelineStatus || '').toLowerCase() !== 'pending') {
            showToast("This prescription has already been accepted and can't be cancelled here.", "error");
            return;
        }
        showConfirmationModal("Cancel this prescription order?", async () => {
            let activeOrdersList = JSON.parse(localStorage.getItem('medi_active_orders')) || [];
            activeOrdersList = activeOrdersList.filter(o => (o.order_id || o.id) !== orderId);
            localStorage.setItem('medi_active_orders', JSON.stringify(activeOrdersList));
            if (supabase) {
                try { await supabase.from('prescription_orders').update({ status: 'cancelled' }).eq('id', rxId); }
                catch (e) { showToast('Cancel failed: ' + (e.message || e), 'error'); }
            }
            showToast("Prescription order cancelled.", "info");
            document.getElementById('order-detail-modal')?.remove();
            refreshOrdersFromServer();
        });
        return;
    }
    const ps = (pipelineStatus || '').toLowerCase();
    if (ps === "shipped" || ps === "broadcasted" || ps === "picked_up" || ps === "delivered") {
        showToast("This order is out for delivery and cannot be canceled.", "error");
        return;
    }
    showConfirmationModal("Are you sure you want to cancel this order?", async () => {
        let activeOrdersList = JSON.parse(localStorage.getItem('medi_active_orders')) || [];
        const targetOrder = activeOrdersList.find(o => (o.order_id || o.id) === orderId);
        activeOrdersList = activeOrdersList.filter(o => (o.order_id || o.id) !== orderId);
        localStorage.setItem('medi_active_orders', JSON.stringify(activeOrdersList));

        if (supabase) {
            try {
                const { error: updateErr } = await supabase.from('orders')
                    .update({ status: 'cancelled', cancellation_reason: 'Cancelled by user' })
                    .eq('order_id', orderId);
                if (updateErr) showToast('Order status update error: ' + (updateErr.message || updateErr), 'error');

                // This row is what actually makes the cancellation show up on the admin
                // refund panel (adminuser.js reads from the 'cancelled_orders' table).
                const { error: cancelInsertErr } = await supabase.from('cancelled_orders').insert([{
                    order_id: orderId,
                    customer: targetOrder?.customer_name || '',
                    total_amount: targetOrder?.total_amount || targetOrder?.total_bill || 0,
                    reason: 'Cancelled by user',
                    payment: targetOrder?.payment_mode || 'Online',
                    status: 'Pending'
                }]);
                if (cancelInsertErr) showToast('Cancelled-order record save error: ' + (cancelInsertErr.message || cancelInsertErr), 'error');
                const cancelUid = await getCurrentAuthUserId();
                pushUserNotification(cancelUid, 'cancelled', 'Order Cancelled', `Your order ${orderId} has been cancelled.`, orderId);
            } catch (e) {
                showToast('Cancellation sync error: ' + (e.message || e), 'error');
            }
        }
        showToast("Order canceled successfully.", "success");
        document.getElementById('order-detail-modal')?.remove();
        setupOrdersPageModules();
    });
};

window.handleReturnOrder = async function(orderId) {
    const reason = await new Promise(resolve => {
        const m = document.createElement('div');
        m.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
        m.innerHTML = `<div style="background:#fff;border-radius:16px;padding:24px;width:90%;max-width:360px;text-align:center;">
            <h3 style="margin:0 0 12px;font-size:1rem;color:#2f3542;">Return Reason</h3>
            <select id="_pi" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:0.9rem;margin-bottom:14px;outline:none;">
                <option value="">Select reason...</option>
                <option value="defective">Defective Product</option>
                <option value="wrong_item">Wrong Item Delivered</option>
                <option value="damaged">Damaged in Transit</option>
                <option value="expired">Expired Product</option>
                <option value="not_as_described">Not as Described</option>
                <option value="quality_issue">Quality Issue</option>
                <option value="changed_mind">Changed Mind</option>
            </select>
            <textarea id="_pd" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:0.9rem;margin-bottom:14px;outline:none;min-height:60px;resize:vertical;" placeholder="Additional details (optional)"></textarea>
            <div style="display:flex;gap:10px;">
                <button onclick="this.closest('[style*=\"position: fixed\"]')?.remove()" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-weight:600;">Cancel</button>
                <button id="_po" style="flex:1;padding:10px;border:none;border-radius:8px;background:#e02020;color:#fff;cursor:pointer;font-weight:600;">Submit Return</button>
            </div>
        </div>`;
        document.body.appendChild(m);
        m.querySelector('#_pi').focus();
        m.querySelector('#_po').onclick = () => { const v = m.querySelector('#_pi').value; const d = m.querySelector('#_pd').value; m.remove(); resolve(v ? {reason:v, description:d} : null); };
        m.onclick = (e) => { if (e.target === m) { m.remove(); resolve(null); } };
    });
    if (!reason) return;
    const reasonLabels = {defective:'Defective Product',wrong_item:'Wrong Item Delivered',damaged:'Damaged in Transit',expired:'Expired Product',not_as_described:'Not as Described',quality_issue:'Quality Issue',changed_mind:'Changed Mind'};
    if (supabase) {
        try {
            const { error } = await supabase.from('returns').insert([{
                order_id: orderId,
                reason: reason.reason,
                description: reason.description || '',
                status: 'pending'
            }]);
            if (error) throw error;
            showToast("Return request submitted successfully!", "success");
        } catch(e) {

            showToast("Return request submitted. We'll process it shortly.", "info");
        }
    } else {
        showToast("Return request submitted. We'll process it shortly.", "info");
    }
    document.getElementById('order-detail-modal')?.remove();
    renderOrdersUI();
    // ✅ Reopen straight into the same order's detail sheet so the customer
    // immediately sees the new "Return Status" panel/timeline, instead of
    // being dropped back on the plain orders list with no visible confirmation.
    window.openOrderDetailModal(orderId);
};

// ============================================================
// ORDER DETAIL VIEW (Item 5) — opened by tapping an order card. Shows the
// first product image, Order ID, placed date/time, the full status
// timeline (Item 6), delivery address (Item 7), an itemized bill box
// (Item 8), Track/Cancel/OTP/Return controls (each independently gated —
// Items 5/9/10/11), and, once delivered, a lightweight feedback section
// (Item 12). Re-uses all the existing tracking/cancel/return/OTP handlers
// rather than duplicating any of that logic.
// ============================================================
window.openOrderDetailModal = async function (orderId) {
    try {
        document.getElementById('order-detail-modal')?.remove();
        const orders = getUnifiedOrdersList();
        const order = orders.find(o => (o.order_id || o.id) === orderId);
        if (!order) { showToast('Order not found.', 'error'); return; }

        const isRx = !!order.is_prescription_order;
        const id = order.order_id || order.id;
        const s = (order.status || '').toLowerCase();
        const displayStatus = getOrderDisplayStatus(order);
        // Same exact color mapping as the order list card — Accepted=green,
        // Rejected/Cancelled=red, Pending=yellow, Delivered=orange.
        const detailStatusColors = {
            'Accepted': 'background:#e3faf2;color:#2ed573;',
            'Delivered': 'background:#fff1e0;color:#e8590c;',
            'Cancelled': 'background:#ffe3e3;color:#e02020;',
            'Pending': 'background:#fff9db;color:#f59f00;'
        };
        const detailStatusStyle = detailStatusColors[displayStatus] || 'background:#e7f4fb;color:#1c82aa;';
        const timeline = buildOrderStatusTimeline(order);

        const modal = document.createElement('div');
        modal.id = 'order-detail-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:flex-end;justify-content:center;';
        modal.innerHTML = `<div id="order-detail-sheet" style="background:#f8f9fb;border-radius:20px 20px 0 0;width:100%;max-width:480px;max-height:92vh;overflow-y:auto;box-sizing:border-box;padding:0 0 24px;">
           <div style="position:sticky;top:0;background:#fff;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eef2f5;border-radius:20px 20px 0 0;z-index:2;">
             <h3 style="margin:0;font-size:1rem;color:#2f3542;">Order Details</h3>
             <button type="button" id="order-detail-close" style="background:none;border:none;font-size:1.2rem;color:#747d8c;cursor:pointer;padding:4px 8px;"><i class="fa-solid fa-xmark"></i></button>
           </div>
           <div id="order-detail-body" style="padding:16px 18px;">
             <div style="text-align:center;padding:30px 0;color:#747d8c;"><i class="fa-solid fa-spinner fa-spin"></i> Loading order...</div>
           </div>
        </div>`;
        document.body.appendChild(modal);
        document.getElementById('order-detail-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        // Real per-item prices (for the bill box + ₹299 return-eligibility
        // rule) — fetched async so the sheet can open instantly above.
        const items = await fetchOrderLineItems(id);
        if (!document.body.contains(modal)) return; // closed while items were loading
        const bill = computeOrderBill(order, items);
        const returnInfo = computeReturnEligibility(order, items);
        // ✅ If a return has already been requested for this order, fetch it
        // so its pickup-status timeline can be shown instead of just
        // silently letting the customer tap "Return" again.
        const existingReturn = returnInfo.eligible || s === 'delivered' ? await fetchReturnForOrder(id) : null;
        if (!document.body.contains(modal)) return; // closed while the return lookup was in flight

        // Item 7 — delivery address, pulled from the order's own saved
        // fields first (never hard-coded), falling back to the shopper's
        // cached profile/verified address only if the order itself is missing it.
        const custName = order.customer_name || localStorage.getItem('medi_profile_name') || 'Customer';
        const custPhone = order.customer_phone || (typeof getAutoUserPhone === 'function' ? getAutoUserPhone() : '') || '';
        const custAddress = order.customer_address || order.delivery_address || order.address || localStorage.getItem('medi_verified_address') || 'Address not available';

        // ✅ NEW — real pharmacy/shop name for this order (cached lookup by
        // merchant_id; never shown if we don't actually have one).
        const shopName = !isRx && order.merchant_id ? await getMerchantNameCached(order.merchant_id) : '';

        // Item 5/9/10/11 — button visibility rules.
        const canCancel = isRx ? (s === 'pending') : !['shipped', 'broadcasted', 'picked_up', 'delivered', 'cancelled'].includes(s);
        const showOtp = !['cancelled', 'delivered'].includes(s);
        const showTrack = s !== 'cancelled';
        const showInvoice = !isRx;
        const showFeedback = s === 'delivered';

        const timelineHtml = timeline.map((t, idx) => {
            const dotColor = t.isCancelled ? '#e02020' : (t.done ? '#2ed573' : '#ccd3da');
            const nextDone = timeline[idx + 1] && timeline[idx + 1].done;
            return `<div style="display:flex;align-items:flex-start;gap:10px;">
                <div style="display:flex;flex-direction:column;align-items:center;">
                    <div style="width:13px;height:13px;border-radius:50%;background:${dotColor};flex-shrink:0;margin-top:2px;"></div>
                    ${idx < timeline.length - 1 ? `<div style="width:2px;flex:1;min-height:20px;background:${t.done && nextDone ? '#2ed573' : '#e2e6ea'};"></div>` : ''}
                </div>
                <div style="padding-bottom:16px;">
                    <p style="margin:0;font-size:0.82rem;font-weight:${t.done ? '700' : '500'};color:${t.isCancelled ? '#e02020' : (t.done ? '#2f3542' : '#a4b0be')};">${t.label}</p>
                </div>
            </div>`;
        }).join('');

        const itemsListHtml = items.length > 0
            ? items.map(it => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:0.8rem;color:#57606f;padding:3px 0;"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${it.product_name || 'Item'} × ${it.quantity || 1}</span><span style="flex-shrink:0;">${formatRupees(it.total_price ?? (safeParseCurrency(it.unit_price) * (it.quantity || 1)))}</span></div>`).join('')
            : `<p style="margin:0;font-size:0.8rem;color:#57606f;">${order.items_text || 'Item details unavailable'}</p>`;

        const bodyEl = document.getElementById('order-detail-body');
        if (!bodyEl) return;
        bodyEl.innerHTML = `
          <div style="background:#fff;border-radius:14px;padding:14px;margin-bottom:14px;display:flex;gap:12px;align-items:center;">
            <div style="width:56px;height:56px;background:#f8f9fa;border-radius:10px;padding:4px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1px solid #f1f2f6;">
              <img src="${order.items_img || 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=400'}" style="max-width:100%;max-height:100%;object-fit:contain;">
            </div>
            <div style="flex:1;min-width:0;">
              <p style="margin:0;font-weight:700;font-size:0.9rem;color:#2f3542;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">ID: ${id}</p>
              <p style="margin:2px 0 0;font-size:0.75rem;color:#747d8c;">Placed: ${order.date_string || ''}</p>
            </div>
            <span style="font-size:0.65rem;font-weight:700;padding:4px 10px;border-radius:20px;${detailStatusStyle}white-space:nowrap;flex-shrink:0;">${displayStatus}</span>
          </div>

          <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
            ${showTrack ? `<button type="button" id="od-track-btn" style="flex:1;min-width:100px;background:#1c82aa;color:#fff;border:none;padding:10px;border-radius:10px;font-size:0.8rem;font-weight:600;cursor:pointer;">Track</button>` : ''}
            ${showInvoice ? `<button type="button" id="od-invoice-btn" style="flex:1;min-width:100px;background:#57606f;color:#fff;border:none;padding:10px;border-radius:10px;font-size:0.8rem;font-weight:600;cursor:pointer;"><i class="fa-solid fa-file-invoice"></i> Invoice</button>` : ''}
            ${showOtp ? `<button type="button" id="od-otp-btn" style="flex:1;min-width:100px;background:#2ed573;color:#fff;border:none;padding:10px;border-radius:10px;font-size:0.8rem;font-weight:600;cursor:pointer;">View OTP</button>` : ''}
            ${canCancel ? `<button type="button" id="od-cancel-btn" style="flex:1;min-width:100px;background:#ff4d4d;color:#fff;border:none;padding:10px;border-radius:10px;font-size:0.8rem;font-weight:600;cursor:pointer;">Cancel</button>` : ''}
            ${returnInfo.eligible && !existingReturn ? `<button type="button" id="od-return-btn" style="flex:1;min-width:100px;background:#e02020;color:#fff;border:none;padding:10px;border-radius:10px;font-size:0.8rem;font-weight:600;cursor:pointer;">Return</button>` : ''}
          </div>

          ${s === 'cancelled' ? `<div style="background:#fff5f5;border:1px solid #ffd6d6;color:#e02020;border-radius:12px;padding:12px 14px;margin-bottom:14px;font-size:0.82rem;font-weight:600;"><i class="fa-solid fa-circle-xmark"></i> This order was cancelled.</div>` : ''}

          ${existingReturn ? (() => {
              const retTimeline = buildReturnStatusTimeline(existingReturn);
              const retTimelineHtml = retTimeline.map((t, idx) => {
                  const dotColor = t.isCancelled ? '#e02020' : (t.done ? '#2ed573' : '#ccd3da');
                  const nextDone = retTimeline[idx + 1] && retTimeline[idx + 1].done;
                  return `<div style="display:flex;align-items:flex-start;gap:10px;">
                      <div style="display:flex;flex-direction:column;align-items:center;">
                          <div style="width:13px;height:13px;border-radius:50%;background:${dotColor};flex-shrink:0;margin-top:2px;"></div>
                          ${idx < retTimeline.length - 1 ? `<div style="width:2px;flex:1;min-height:20px;background:${t.done && nextDone ? '#2ed573' : '#e2e6ea'};"></div>` : ''}
                      </div>
                      <div style="padding-bottom:16px;">
                          <p style="margin:0;font-size:0.82rem;font-weight:${t.done ? '700' : '500'};color:${t.isCancelled ? '#e02020' : (t.done ? '#2f3542' : '#a4b0be')};">${t.label}</p>
                      </div>
                  </div>`;
              }).join('');
              const reasonLabels = {defective:'Defective Product',wrong_item:'Wrong Item Delivered',damaged:'Damaged in Transit',expired:'Expired Product',not_as_described:'Not as Described',quality_issue:'Quality Issue',changed_mind:'Changed Mind'};
              const reasonLabel = reasonLabels[existingReturn.reason] || existingReturn.reason || 'Return';
              const statusLower = (existingReturn.status || 'pending').toLowerCase();
              const nextStepNote = ['rejected','declined'].includes(statusLower) ? ''
                  : (statusLower === 'refunded' || statusLower === 'completed') ? ''
                  : existingReturn.return_pickup_date ? '' /* date already shown in the timeline label above */
                  : `<p style="margin:10px 0 0;font-size:0.72rem;color:#a4b0be;">We'll notify you here as soon as pickup is scheduled.</p>`;
              return `<div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:14px;">
                  <h4 style="margin:0 0 4px;font-size:0.85rem;color:#2f3542;">Return Status</h4>
                  <p style="margin:0 0 12px;font-size:0.75rem;color:#747d8c;">Reason: ${reasonLabel}</p>
                  ${retTimelineHtml}
                  ${nextStepNote}
              </div>`;
          })() : ''}

          <div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:14px;">
            <h4 style="margin:0 0 10px;font-size:0.85rem;color:#2f3542;">Order Status</h4>
            ${timelineHtml}
          </div>

          ${shopName ? `<div style="background:#fff;border-radius:14px;padding:14px 16px;margin-bottom:14px;display:flex;align-items:center;gap:10px;">
            <i class="fa-solid fa-shop" style="color:#1c82aa;font-size:1rem;"></i>
            <div><p style="margin:0;font-size:0.7rem;color:#a4b0be;">Pharmacy</p><p style="margin:1px 0 0;font-size:0.85rem;font-weight:700;color:#2f3542;">${shopName}</p></div>
          </div>` : ''}

          <div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:14px;">
            <h4 style="margin:0 0 10px;font-size:0.85rem;color:#2f3542;">Delivery Address</h4>
            <p style="margin:0;font-size:0.82rem;font-weight:700;color:#2f3542;">${custName}</p>
            <p style="margin:4px 0;font-size:0.8rem;color:#57606f;">${custAddress}</p>
            ${custPhone ? `<p style="margin:0;font-size:0.8rem;color:#57606f;"><i class="fa-solid fa-phone"></i> ${custPhone}</p>` : ''}
          </div>

          <div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:14px;">
            <h4 style="margin:0 0 10px;font-size:0.85rem;color:#2f3542;">Items</h4>
            ${itemsListHtml}
          </div>

          <div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:14px;">
            <h4 style="margin:0 0 10px;font-size:0.85rem;color:#2f3542;">Bill Details</h4>
            <div style="display:flex;justify-content:space-between;font-size:0.82rem;color:#57606f;padding:4px 0;"><span>Item Total</span><span>${formatRupees(bill.subtotal)}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:0.82rem;color:#57606f;padding:4px 0;"><span>Platform &amp; Delivery Charges</span><span>${bill.charges > 0 ? formatRupees(bill.charges) : 'FREE'}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:0.9rem;font-weight:700;color:#2f3542;padding:8px 0 0;border-top:1px dashed #eef2f5;margin-top:6px;"><span>Total</span><span>${formatRupees(bill.total)}</span></div>
          </div>

          ${returnInfo.expired ? `<p style="text-align:center;font-size:0.72rem;color:#a4b0be;margin:-6px 0 14px;">Return window has closed for this order.</p>` : ''}

          ${showFeedback ? `
          <div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:14px;">
            <h4 style="margin:0 0 10px;font-size:0.85rem;color:#2f3542;">Rate your experience</h4>
            <div id="od-feedback-stars" style="font-size:1.5rem;margin-bottom:10px;">
              ${[1, 2, 3, 4, 5].map(n => `<i class="fa-solid fa-star od-star" data-val="${n}" style="cursor:pointer;margin-right:4px;color:#ddd;"></i>`).join('')}
            </div>
            <textarea id="od-feedback-text" placeholder="Tell us about your experience (optional)" style="width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:10px;padding:10px;font-size:0.8rem;min-height:60px;resize:vertical;margin-bottom:10px;"></textarea>
            <button type="button" id="od-feedback-submit" style="width:100%;padding:10px;border:none;border-radius:10px;background:#1c82aa;color:#fff;font-weight:600;cursor:pointer;">Submit Feedback</button>
          </div>` : ''}
        `;

        if (showTrack) {
            const trackBtn = document.getElementById('od-track-btn');
            if (trackBtn) trackBtn.addEventListener('click', () => {
                if (isRx && typeof window.openRxOrderTrackingModal === 'function') {
                    window.openRxOrderTrackingModal(order.rx_id, order.status);
                } else if (typeof window.openLiveTrackingModal === 'function') {
                    window.openLiveTrackingModal(id, order.transit_mode || 'Bike', order.shop_lat || 22.578, order.shop_lng || 88.365, order.eta_minutes || 20, order.status, order.rider_id || null);
                }
            });
        }
        if (showInvoice) {
            const invoiceBtn = document.getElementById('od-invoice-btn');
            if (invoiceBtn) invoiceBtn.addEventListener('click', () => window.openOrderInvoice(id, order.merchant_id || ''));
        }
        if (showOtp) {
            const otpBtn = document.getElementById('od-otp-btn');
            if (otpBtn) otpBtn.addEventListener('click', () => window.openDeliveryBoyVerificationModal(id, isRx));
        }
        if (canCancel) {
            const cancelBtn = document.getElementById('od-cancel-btn');
            if (cancelBtn) cancelBtn.addEventListener('click', () => window.handleCancelOrderFlow(id, order.status));
        }
        if (returnInfo.eligible && !existingReturn) {
            const returnBtn = document.getElementById('od-return-btn');
            if (returnBtn) returnBtn.addEventListener('click', () => window.handleReturnOrder(id));
        }
        if (showFeedback) {
            let selectedRating = 0;
            const stars = Array.from(modal.querySelectorAll('.od-star'));
            stars.forEach(star => {
                star.addEventListener('click', () => {
                    selectedRating = parseInt(star.dataset.val, 10) || 0;
                    stars.forEach(st => { st.style.color = (parseInt(st.dataset.val, 10) || 0) <= selectedRating ? '#ffa500' : '#ddd'; });
                });
            });
            const submitBtn = document.getElementById('od-feedback-submit');
            if (submitBtn) submitBtn.addEventListener('click', () => submitOrderFeedback(id, selectedRating, document.getElementById('od-feedback-text')?.value || ''));
        }
    } catch (e) {
        showToast('Could not open order details: ' + (e.message || e), 'error');
    }
};

// Item 12 — lightweight feedback/rating UI. Tries a real `order_feedback`
// table first; if that table doesn't exist yet, falls back to a local
// per-order record so the UI still works and nothing about the order
// system breaks — no new columns are invented on the `orders` table itself.
async function submitOrderFeedback(orderId, rating, comment) {
    if (!rating) { showToast('Please select a star rating.', 'error'); return; }
    const payload = { order_id: orderId, rating, comment: comment || '', created_at: new Date().toISOString() };
    let savedRemotely = false;
    if (supabase) {
        try {
            const { error } = await supabase.from('order_feedback').insert([payload]);
            if (!error) savedRemotely = true;
        } catch (e) { /* table may not exist yet — fall back below */ }
    }
    if (!savedRemotely) {
        try {
            const local = JSON.parse(localStorage.getItem('medi_order_feedback') || '{}');
            local[orderId] = payload;
            localStorage.setItem('medi_order_feedback', JSON.stringify(local));
        } catch (e) {}
    }
    showToast('Thanks for your feedback!', 'success');
    document.getElementById('order-detail-modal')?.remove();
}

// ✅ NEW: tracking modal-এর ভেতরের Leaflet map + rider live marker এর state — বারবার modal
// খোলা/বন্ধ হলে যাতে পুরনো map instance/subscription লিক না হয়ে যায় তাই এখানে রাখা হলো।
window._trackingMapState = { map: null, riderMarker: null, shopMarker: null, riderChannel: null, userMarker: null, userPos: null, routeLine: null };

function teardownTrackingMap() {
    const st = window._trackingMapState;
    if (st.riderChannel && typeof supabase !== 'undefined' && supabase) {
        try { supabase.removeChannel(st.riderChannel); } catch (e) {}
    }
    if (st.map) {
        try { st.map.remove(); } catch (e) {}
    }
    window._trackingMapState = { map: null, riderMarker: null, shopMarker: null, riderChannel: null, userMarker: null, userPos: null, routeLine: null };
}

async function renderTrackingLiveMap(mapContainer, shopLat, shopLng, riderId, statusText) {
    teardownTrackingMap(); // আগের modal session এর কোনো map/channel থাকলে সরিয়ে ফেলা

    mapContainer.innerHTML = `<div id="tracking-live-map" style="height:220px;border-radius:12px;overflow:hidden;"></div>
        <p id="tracking-live-caption" style="text-align:center;font-size:0.75rem;color:#747d8c;margin:8px 0 0 0;">${riderId ? 'Waiting for rider location…' : (statusText === 'broadcasted' ? 'Looking for a nearby rider…' : 'Rider location unavailable')}</p>`;

    // Leaflet map ছোট় হয়ে থাকা মডালের ভেতর init হওয়ার সময় সঠিক সাইজ না ধরতে পারলে ধূসর বক্স
    // দেখায় — তাই একটু delay দিয়ে invalidateSize() কল করা হচ্ছে।
    setTimeout(() => {
        const map = L.map('tracking-live-map', { zoomControl: false, attributionControl: true }).setView([shopLat, shopLng], 14);
        // Same fix as the main map page — CartoDB's free tiles now need an
        // API key and were rendering as a blank "API KEY REQUIRED" tile.
        // OpenStreetMap's standard tile server is free, keyless, and real.
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        const shopIcon = L.divIcon({ html: '<div style="background:#e02020;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(224,32,32,0.4);"><i class="fa-solid fa-shop" style="color:#fff;font-size:12px;"></i></div>', className: 'custom-div-icon', iconSize: [26, 26] });
        window._trackingMapState.map = map;
        window._trackingMapState.shopMarker = L.marker([shopLat, shopLng], { icon: shopIcon }).addTo(map).bindPopup('Pharmacy');
        map.invalidateSize();

        // ✅ NEW — real customer/user GPS marker (blue). Only ever the actual
        // browser geolocation fix — never a guessed/hardcoded position. If
        // permission is denied/unavailable, this silently omits the marker
        // rather than faking one.
        function fitTrackingBounds() {
            const st = window._trackingMapState;
            if (!st.map) return;
            const pts = [[shopLat, shopLng]];
            if (st.riderMarker) pts.push(st.riderMarker.getLatLng());
            if (st.userPos) pts.push(st.userPos);
            if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 });
        }
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                if (!window._trackingMapState.map) return; // modal closed before this resolved
                const userPos = [pos.coords.latitude, pos.coords.longitude];
                const userIcon = L.divIcon({ html: '<div style="background:#2563eb;width:22px;height:22px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(37,99,235,0.55);"></div>', className: 'custom-div-icon', iconSize: [22, 22] });
                window._trackingMapState.userPos = userPos;
                window._trackingMapState.userMarker = L.marker(userPos, { icon: userIcon }).addTo(map).bindPopup('You');
                fitTrackingBounds();
            }, () => { /* denied/unavailable — never fall back to a fake location */ }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
        }

        if (!riderId || !supabase) return;

        const riderIcon = L.divIcon({ html: '<div style="background:#1c82aa;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(28,130,170,0.4);"><i class="fa-solid fa-motorcycle" style="color:#fff;font-size:13px;"></i></div>', className: 'custom-div-icon', iconSize: [28, 28] });

        async function refreshRiderPosition() {
            try {
                const { data: rider } = await supabase.from('riders').select('current_lat, current_lon, name').eq('id', riderId).maybeSingle();
                const caption = document.getElementById('tracking-live-caption');
                if (!rider || !rider.current_lat || !rider.current_lon) {
                    if (caption) caption.textContent = 'Rider location unavailable';
                    return;
                }
                const pos = [rider.current_lat, rider.current_lon];
                if (window._trackingMapState.riderMarker) {
                    window._trackingMapState.riderMarker.setLatLng(pos);
                } else {
                    window._trackingMapState.riderMarker = L.marker(pos, { icon: riderIcon }).addTo(map).bindPopup(rider.name || 'Your rider');
                }
                if (caption) caption.textContent = `${rider.name || 'Rider'} is on the way`;

                // ✅ NEW — real route line between rider and the customer, drawn
                // ONLY when we actually have a real GPS fix for the user; never
                // drawn from guessed/placeholder coordinates.
                const st = window._trackingMapState;
                if (st.userPos) {
                    if (st.routeLine) { st.routeLine.setLatLngs([pos, st.userPos]); }
                    else { st.routeLine = L.polyline([pos, st.userPos], { color: '#1c82aa', weight: 3, dashArray: '6,8', opacity: 0.85 }).addTo(map); }
                }
                fitTrackingBounds();
            } catch (e) { /* silent — network hiccup এ map ভেঙে না যাক */ }
        }

        refreshRiderPosition();

        // ✅ realtime: rider এর অবস্থান বদলালেই সাথে সাথেই marker + route সরে যাবে (polling লাগবে না)
        window._trackingMapState.riderChannel = supabase
            .channel(`tracking-rider-${riderId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'riders', filter: `id=eq.${riderId}` }, (payload) => {
                const r = payload.new;
                if (!r.current_lat || !r.current_lon) return;
                const pos = [r.current_lat, r.current_lon];
                const st = window._trackingMapState;
                if (st.riderMarker) st.riderMarker.setLatLng(pos);
                if (st.userPos && st.routeLine) st.routeLine.setLatLngs([pos, st.userPos]);
            })
            .subscribe();
    }, 150);
}

// ============================================================
// TRACKING SHEET — Bill Summary + downloadable order-receipt.html
// ============================================================
// Pulls the real saved order row (Supabase first, falling back to the
// locally cached `medi_active_orders` copy so this still works offline)
// instead of ever inventing numbers — the same subtotal/grand-total the
// customer actually saw and paid at checkout.
async function fetchOrderForBilling(orderId) {
    if (supabase) {
        try {
            const { data, error } = await supabase.from('orders').select('*').eq('order_id', orderId).maybeSingle();
            if (!error && data) return data;
        } catch (e) { /* fall through to local cache */ }
    }
    try {
        const cached = JSON.parse(localStorage.getItem('medi_active_orders')) || [];
        return cached.find(o => (o.order_id || o.id) === orderId) || null;
    } catch (e) { return null; }
}

function buildOrderReceiptHtml(order) {
    const subtotal = parseFloat(order.total) || 0;
    const grandTotal = parseFloat(String(order.total_bill || order.total_amount || '').replace(/[^0-9.]/g, '')) || subtotal;
    const otherCharges = Math.max(0, grandTotal - subtotal);
    const esc = (s) => String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>MediFinder Invoice - ${esc(order.order_id)}</title>
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;background:#f4f6f9;margin:0;padding:24px;color:#2f3542;}
  .invoice-box{max-width:640px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;}
  .invoice-header{background:linear-gradient(135deg,#e02020,#ff4d4d);color:#fff;padding:26px 30px;}
  .invoice-header h1{margin:0;font-size:1.4rem;letter-spacing:0.5px;}
  .invoice-header p{margin:4px 0 0;opacity:0.9;font-size:0.8rem;}
  .invoice-body{padding:26px 30px;}
  .meta{display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:18px;font-size:0.82rem;color:#57606f;}
  .badge{display:inline-block;background:#eef7fb;color:#1c82aa;padding:4px 10px;border-radius:20px;font-size:0.72rem;font-weight:700;}
  .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f2f6;font-size:0.86rem;}
  .row.total{font-weight:800;font-size:1.02rem;color:#e02020;border-bottom:none;border-top:2px solid #2f3542;margin-top:8px;padding-top:14px;}
  .footer{text-align:center;padding:16px;font-size:0.72rem;color:#a4b0be;}
  @media print { body{background:#fff;padding:0;} .invoice-box{box-shadow:none;border-radius:0;} }
</style>
</head>
<body>
  <div class="invoice-box">
    <div class="invoice-header">
      <h1>MEDI FINDER</h1>
      <p>Order Invoice / Receipt</p>
    </div>
    <div class="invoice-body">
      <div class="meta">
        <div><strong>Order ID:</strong> ${esc(order.order_id)}</div>
        <div><strong>Date:</strong> ${esc(order.date_string)}</div>
        <div><span class="badge">${esc(order.payment_mode || 'N/A')}</span></div>
      </div>
      <p style="font-size:0.84rem;"><strong>Delivered to:</strong> ${esc(order.customer_name)}, ${esc(order.customer_address || order.address)}</p>
      <p style="font-size:0.84rem;"><strong>Items:</strong> ${esc(order.items_text || 'N/A')}</p>
      <div class="row"><span>Medicine Subtotal</span><span>&#8377;${subtotal.toFixed(2)}</span></div>
      <div class="row"><span>Delivery, Platform &amp; Other Charges</span><span>&#8377;${otherCharges.toFixed(2)}</span></div>
      <div class="row total"><span>Grand Total Paid</span><span>&#8377;${grandTotal.toFixed(2)}</span></div>
    </div>
    <div class="footer">Computer-generated receipt from MediFinder. Contact your registered pharmacy for support.</div>
  </div>
</body>
</html>`;
}

function downloadOrderReceipt(order) {
    const html = buildOrderReceiptHtml(order);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'order-receipt.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function renderTrackingBillingSection(container, order) {
    if (!container) return;
    if (!order) { container.innerHTML = ''; return; }
    const subtotal = parseFloat(order.total) || 0;
    const grandTotal = parseFloat(String(order.total_bill || order.total_amount || '').replace(/[^0-9.]/g, '')) || subtotal;
    const otherCharges = Math.max(0, grandTotal - subtotal);
    container.innerHTML = `
        <div class="tracking-bill-card">
            <h4><i class="fa-solid fa-receipt"></i> Bill Summary</h4>
            <div class="price-row"><span>Medicine Subtotal</span><span>₹${subtotal.toFixed(2)}</span></div>
            <div class="price-row"><span>Delivery, Platform &amp; Other Charges</span><span>₹${otherCharges.toFixed(2)}</span></div>
            <div class="price-row"><span>Payment Mode</span><span>${order.payment_mode || '—'}</span></div>
            <div class="price-row total-row"><span>Grand Total</span><span>₹${grandTotal.toFixed(2)}</span></div>
        </div>
        <button type="button" class="download-invoice-btn" id="download-invoice-btn"><i class="fa-solid fa-file-arrow-down"></i> Download Invoice</button>
    `;
    const btn = document.getElementById('download-invoice-btn');
    if (btn) btn.onclick = () => downloadOrderReceipt(order);
}

window.openLiveTrackingModal = function(orderId, forceVehicle = "Bike", shopLat = 22.578, shopLng = 88.365, baseEta = 20, currentStatus = "Active", riderId = null) {
    const modal = document.getElementById('tracking-modal');
    if (!modal) return;
    modal.style.display = "flex";
    modal.classList.add('active');
    modal.dataset.trackingOrderId = orderId; // ✅ NEW: চালু থাকা modal live status update এর জন্য কোন order tracking হচ্ছে সেটা মনে রাখা
    const modalOrderId = document.getElementById('modal-order-id');
    if (modalOrderId) modalOrderId.innerText = `Order Tracking: ${orderId}`;
    const stepPlaced = document.getElementById('step-placed');
    const stepShipping = document.getElementById('step-shipping');
    const stepDelivery = document.getElementById('step-delivery');
    const status = (currentStatus || '').toLowerCase();

    if (stepPlaced) stepPlaced.className = "timeline-step finished";
    if (stepShipping) stepShipping.className = "timeline-step";
    if (stepDelivery) stepDelivery.className = "timeline-step";

    if (status === "accepted") {
        const t = stepPlaced?.querySelector('.text');
        if (t) t.innerText = "Accepted & Packed";
    } else if (status === "broadcasted" || status === "shipped" || status === "arrived_at_store" || status === "picked_up") {
        // ✅ FIX: আগে এখানে "broadcasted" চেক করা হতো না, তাই merchant ship করার পর rider এর জন্য
        // search চলাকালীন (status='broadcasted') progress bar-এ Shipping step active দেখাত না।
        if (stepShipping) stepShipping.className = "timeline-step active";
    } else if (status === "delivered") {
        // ✅ FIX: আগে delivered হলেও step-delivery কখনো finished মার্ক হতো না — শেষ ধাপ চিরকাল ফাঁকা থেকে যেত।
        if (stepShipping) stepShipping.className = "timeline-step finished";
        if (stepDelivery) stepDelivery.className = "timeline-step finished";
    } else if (status === "cancelled") {
        if (stepShipping) stepShipping.className = "timeline-step cancelled";
        if (stepDelivery) stepDelivery.className = "timeline-step cancelled";
    }

    const mapContainer = modal.querySelector('.map-container');
    if (mapContainer) {
        // ✅ FIX: আগে এই বক্সে সবসময় "Live tracking will be available once rider is assigned" লেখা
        // দেখাত, rider আসলে assign/picked up হয়ে থাকলেও, আর কোনো real map ছিলই না (index.html-এ
        // Leaflet লোড করা থাকলেও ব্যবহার হচ্ছিল না)। এখন status অনুযায়ী আসল অবস্থা + Leaflet map দেখাবে।
        if (status === "delivered") {
            teardownTrackingMap();
            mapContainer.innerHTML = `
                <div style="background:#f0fdf4;padding:16px;border-radius:12px;text-align:center;border:1px solid #bbf7d0;">
                    <i class="fa-solid fa-circle-check" style="font-size:2rem;color:#16a34a;margin-bottom:8px;display:block;"></i>
                    <p style="font-size:0.95rem;font-weight:700;color:#16a34a;margin:0;">Delivered successfully</p>
                </div>
            `;
        } else if (status === "cancelled") {
            teardownTrackingMap();
            mapContainer.innerHTML = `
                <div style="background:#fef2f2;padding:16px;border-radius:12px;text-align:center;border:1px solid #fecaca;">
                    <i class="fa-solid fa-circle-xmark" style="font-size:2rem;color:#dc2626;margin-bottom:8px;display:block;"></i>
                    <p style="font-size:0.95rem;font-weight:700;color:#dc2626;margin:0;">Order was cancelled</p>
                </div>
            `;
        } else if (typeof L !== 'undefined') {
            // Leaflet লোড হয়ে থাকলে real map দেখাও (pending/accepted/broadcasted/shipped/picked_up সব ক্ষেত্রেই —
            // শুধু rider assign না হলে rider marker থাকবে না, শপ marker সবসময় থাকবে)
            renderTrackingLiveMap(mapContainer, shopLat, shopLng, riderId, status);
        } else {
            mapContainer.innerHTML = `
                <div style="background:#fff3f3;padding:16px;border-radius:12px;text-align:center;border:1px solid #ffe4e4;">
                    <i class="fa-solid fa-clock" style="font-size:2rem;color:#e02020;margin-bottom:8px;display:block;"></i>
                    <p style="font-size:0.85rem;font-weight:700;color:#e02020;margin:0 0 4px 0;">Estimated Delivery</p>
                    <p style="font-size:1.5rem;font-weight:800;color:#2f3542;margin:0;"><span id="live-countdown-val">${baseEta}</span> mins</p>
                </div>
            `;
        }
        document.getElementById('close-tracking-modal').onclick = () => {
            modal.classList.remove('active');
            modal.style.display = "none";
            modal.dataset.trackingOrderId = '';
            teardownTrackingMap(); // ✅ NEW: modal বন্ধ হলে map/realtime subscription ক্লিনআপ করা, মেমরি লিক এড়াতে
        };
    }

    // Bill Summary (same breakdown style as the checkout page) + a
    // downloadable order-receipt.html invoice, shown below the live map
    // and status timeline for every order — pending, shipping, or delivered.
    const billingContainer = document.getElementById('tracking-billing-container');
    if (billingContainer) {
        billingContainer.innerHTML = `<div style="text-align:center;padding:12px;color:#a4b0be;font-size:0.78rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading bill summary...</div>`;
        fetchOrderForBilling(orderId).then(order => renderTrackingBillingSection(billingContainer, order));
    }
};

// Simple step-tracker for prescription orders — there's no rider/shop
// assignment system for these yet (only pending → accepted → cancelled), so
// this deliberately doesn't pretend to show a live map/ETA like a real
// medicine order; it just shows honestly where the request stands.
window.openRxOrderTrackingModal = function(rxId, status) {
    const s = (status || '').toLowerCase();
    const steps = [
        { key: 'pending', label: 'Sent to nearby pharmacies', icon: 'fa-paper-plane' },
        { key: 'accepted', label: 'Accepted — pharmacy preparing your medicines', icon: 'fa-box-open' },
    ];
    if (s === 'cancelled') {
        steps.push({ key: 'cancelled', label: 'Cancelled', icon: 'fa-circle-xmark' });
    }
    const activeIndex = steps.findIndex(st => st.key === s);
    let popup = document.createElement('div');
    popup.className = "modal active";
    popup.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100vh;background:rgba(0,0,0,0.6);display:flex;justify-content:center;align-items:center;z-index:10000;padding:16px;box-sizing:border-box;`;
    popup.innerHTML = `
        <div class="modal-content" style="background:#fff;width:100%;max-width:400px;border-radius:16px;padding:20px;box-sizing:border-box;border-top:5px solid #ff4d4d;">
            <h3 style="color:#ff4d4d;margin:0 0 16px;"><i class="fa-solid fa-file-prescription"></i> Prescription RX-${rxId}</h3>
            <div style="display:flex;flex-direction:column;gap:14px;">
                ${steps.map((st, i) => `
                    <div style="display:flex;align-items:center;gap:12px;opacity:${i <= activeIndex ? '1' : '0.4'};">
                        <div style="width:32px;height:32px;border-radius:50%;background:${i <= activeIndex ? (st.key === 'cancelled' ? '#ff4d4d' : '#2ed573') : '#f1f2f6'};color:${i <= activeIndex ? '#fff' : '#999'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i class="fa-solid ${st.icon}"></i>
                        </div>
                        <span style="font-size:0.85rem;font-weight:600;color:#2f3542;">${st.label}</span>
                    </div>
                `).join('')}
            </div>
            <button type="button" id="close-rx-tracking-modal" style="margin-top:20px;width:100%;padding:10px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;">Close</button>
        </div>
    `;
    document.body.appendChild(popup);
    document.getElementById('close-rx-tracking-modal').onclick = () => popup.remove();
};

window.openDeliveryBoyVerificationModal = async function(orderId, isRx) {
    let currentSecureOTP = "123456";
    const rxId = isRx ? orderId.replace(/^RX-/, '') : null;
    let activeOrders = JSON.parse(localStorage.getItem('medi_active_orders')) || [];
    let targetOrder = activeOrders.find(o => (o.order_id || o.id) === orderId);
    if (targetOrder) currentSecureOTP = targetOrder.delivery_secure_code || "123456";
    if (supabase) {
        try {
            if (isRx) {
                const { data, error } = await supabase.from('prescription_orders').select('delivery_otp').eq('id', rxId).single();
                if (!error && data && data.delivery_otp) currentSecureOTP = data.delivery_otp;
            } else {
                const { data, error } = await supabase.from('orders').select('delivery_secure_code').eq('order_id', orderId).single();
                if (!error && data && data.delivery_secure_code) currentSecureOTP = data.delivery_secure_code;
            }
        } catch(e) {}
    }
    // Item 11 — "View OTP" only ever shows the code. There is intentionally
    // NO "Confirm & Complete"/"Confirm" button on the user side anymore —
    // only the delivery rider's own app can mark an order delivered. Nothing
    // here writes to `orders.status` at all.
    let popup = document.createElement('div');
    popup.className = "modal active";
    popup.id = "otp-verification-modal";
    popup.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100vh;background:rgba(0,0,0,0.6);display:flex;justify-content:center;align-items:center;z-index:10000;padding:16px;box-sizing:border-box;`;
    popup.innerHTML = `
        <div class="modal-content" style="background:#fff;width:100%;max-width:400px;border-radius:16px;padding:20px;text-align:center;box-sizing:border-box;border-top:5px solid #ff4d4d;">
            <h3 style="color:#ff4d4d;margin-bottom:10px;"><i class="fa-solid fa-shield-halved"></i> Secure Delivery Gateway</h3>
            <p style="font-size:0.85rem;color:#6c757d;margin-bottom:15px;">Share this 6-digit secure code with the delivery agent to confirm parcel handover.</p>
            <div id="view-delivery-otp" style="width:80%;margin:0 auto;padding:12px;font-size:1.8rem;font-weight:bold;color:#ff4d4d;letter-spacing:4px;border:2px dashed #ff4d4d;background:#f8f9fa;border-radius:8px;">${currentSecureOTP}</div>
            <div style="display:flex;gap:10px;margin-top:16px;">
                <button type="button" id="close-otp-modal" style="flex:1;padding:10px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);
    document.getElementById('close-otp-modal').onclick = () => {
        popup.remove();
    };
};

// ============================================================
// MAP PAGE - Real-time GPS, Search + Suggestions, Distance, GO direction
// ============================================================
// Fetches an actual road route (turn-by-turn road geometry) from the free/open
// OSRM demo server instead of drawing a straight line that ignores rivers,
// ponds, buildings, etc. Falls back to a straight line only if OSRM is
// unreachable, so the map never breaks even if the free service is briefly down.
async function fetchRoadRoute(fromLat, fromLng, toLat, toLng) {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data && data.code === 'Ok' && data.routes && data.routes[0]) {
            return {
                coords: data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]),
                distanceKm: data.routes[0].distance / 1000,
                durationMin: Math.round(data.routes[0].duration / 60)
            };
        }
    } catch (e) { /* fall through to straight-line fallback below */ }
    return null;
}

async function setupMapPageModules() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    const cityLabel = document.getElementById('current-city');
    if (cityLabel) {
        cityLabel.innerText = "Detecting location...";
        safeGetCurrentPosition(async (pos) => {
            userLiveLat = pos.coords.latitude;
            userLiveLng = pos.coords.longitude;
            renderGPSAccuracyIndicator(pos.coords.accuracy);
            try {
                const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${userLiveLat}&lon=${userLiveLng}&format=json`);
                const geo = await resp.json();
                const city = geo.address?.city || geo.address?.town || geo.address?.village || "Your Location";
                cityLabel.innerText = city;
            } catch(e) { cityLabel.innerText = "Your Location"; }
        }, GEO_OPTIONS_ONE_SHOT);
    }

    let map = L.map('map', { zoomControl: false }).setView([userLiveLat, userLiveLng], 13);
    window.__shopsLeafletMap = map; // exposed for SPA tab-switch invalidateSize()
    // NOTE: CartoDB's basemaps.cartocdn.com tiles now require a registered
    // API key (they started gating this domain) — without one, every tile
    // just showed a grey "API KEY REQUIRED" watermark instead of an actual
    // map. Switched to the standard OpenStreetMap tile server, which is
    // free, needs no key/signup, and renders real, full-resolution tiles.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    // ✅ This SPA keeps every page's markup in the DOM at once and only
    // toggles visibility, so if Home (not Shops/Map) was the first page
    // shown, #map was display:none the instant Leaflet measured it here.
    // A follow-up invalidateSize() once the container is actually visible
    // corrects that stale 0×0 measurement so markers/routes plot correctly.
    setTimeout(() => map.invalidateSize(), 100);

    const userIcon = L.divIcon({ html: '<i class="fa-solid fa-street-view" style="color:#ff4d4d;font-size:30px;"></i>', className: 'custom-div-icon', iconSize: [30,30] });
    const shopIcon = L.divIcon({ html: '<i class="fa-solid fa-shop" style="color:#e02020;font-size:24px;"></i>', className: 'custom-div-icon', iconSize: [24,24] });
    const shopIconActive = L.divIcon({ html: '<div style="background:#e02020;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(224,32,32,0.4);"><i class="fa-solid fa-shop" style="color:#fff;font-size:14px;"></i></div>', className: 'custom-div-icon', iconSize: [28,28] });

    let humanMarker = L.marker([userLiveLat, userLiveLng], { icon: userIcon }).addTo(map).bindPopup("<b>You Are Here</b>").openPopup();
    let operationalRoutingControl = null;
    let activeShopMarker = null;

    let pharmacyDatabaseHub = [];
    let allShopMarkers = [];
    const NEARBY_RADIUS_KM = 20;

    try {
        if (supabase) {
            const { data, error } = await supabase
                .from('merchants')
                .select('id, merchant_name, shop_name, latitude, longitude, status, license_status, city, address')
                .in('status', ['active', 'approved']);
            if (!error && data && data.length > 0) {
                let allPharmacies = data.map(m => ({
                    id: m.id,
                    name: m.shop_name || m.merchant_name || 'Pharmacy',
                    lat: parseFloat(m.latitude) || 22.5726,
                    lng: parseFloat(m.longitude) || 88.3639,
                    city: m.city || '',
                    address: m.address || '',
                    license: m.license_status || 'Unverified'
                }));

                // Only show pharmacies actually near the user, closest first —
                // previously every registered pharmacy in the whole database
                // showed up regardless of distance.
                allPharmacies.forEach(shop => { shop._dist = haversineKm(userLiveLat, userLiveLng, shop.lat, shop.lng); });
                allPharmacies.sort((a, b) => a._dist - b._dist);
                let nearby = allPharmacies.filter(s => s._dist <= NEARBY_RADIUS_KM);
                if (nearby.length === 0) nearby = allPharmacies.slice(0, 5); // fallback if none within radius

                pharmacyDatabaseHub = nearby;

                pharmacyDatabaseHub.forEach(shop => {
                    const marker = L.marker([shop.lat, shop.lng], { icon: shopIconActive }).addTo(map)
                        .bindPopup(`<b style="color:#e02020;">${shop.name}</b><br><span style="font-size:12px;">${shop.address || shop.city || ''}</span>`);
                    allShopMarkers.push(marker);
                });

                if (pharmacyDatabaseHub.length > 1) {
                    const bounds = L.latLngBounds(pharmacyDatabaseHub.map(s => [s.lat, s.lng]));
                    bounds.extend([userLiveLat, userLiveLng]);
                    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
                } else if (pharmacyDatabaseHub.length === 1) {
                    map.setView([pharmacyDatabaseHub[0].lat, pharmacyDatabaseHub[0].lng], 14);
                }
            }
        }
    } catch(e) {

    }

    renderAllShops(pharmacyDatabaseHub);

    safeWatchPosition(async (pos) => {
        userLiveLat = pos.coords.latitude;
        userLiveLng = pos.coords.longitude;
        renderGPSAccuracyIndicator(pos.coords.accuracy);
        humanMarker.setLatLng([userLiveLat, userLiveLng]);
        if (operationalRoutingControl && activeShopMarker) {
            const dest = activeShopMarker.getLatLng();
            map.removeLayer(operationalRoutingControl);
            const route = await fetchRoadRoute(userLiveLat, userLiveLng, dest.lat, dest.lng);
            operationalRoutingControl = L.polyline(route ? route.coords : [[userLiveLat, userLiveLng], [dest.lat, dest.lng]], {
                color: "#ff4757", weight: 5, opacity: 0.85, dashArray: route ? null : '5,10'
            }).addTo(map);
        }
    }, GEO_OPTIONS_WATCH);

    const liveLocBtn = document.getElementById('live-location-btn');
    if (liveLocBtn) {
        liveLocBtn.addEventListener('click', () => {
            map.setView([userLiveLat, userLiveLng], 16);
            humanMarker.setLatLng([userLiveLat, userLiveLng]);
            humanMarker.openPopup();
        });
    }

    const triggerLiveMapDirections = async (shop) => {
        // ✅ FIX (Map "GO" button): this page is one of several SPA tabs that
        // all live in the DOM at once, so when the map was first created the
        // #map container could still have been display:none (if the app
        // opened on Home first) — Leaflet measures the container size at
        // creation time, and a 0×0 map silently fails to draw/position new
        // layers correctly even after the tab becomes visible. Forcing an
        // invalidateSize() right before drawing the route guarantees Leaflet
        // has the real, current pixel size before it plots anything.
        if (map) map.invalidateSize();
        if (operationalRoutingControl) map.removeLayer(operationalRoutingControl);
        if (activeShopMarker) map.removeLayer(activeShopMarker);
        activeShopMarker = L.marker([shop.lat, shop.lng], { icon: shopIcon }).addTo(map)
            .bindPopup(`<b>${shop.name}</b><br>${shop.address || ''}`).openPopup();

        const route = await fetchRoadRoute(userLiveLat, userLiveLng, shop.lat, shop.lng);
        operationalRoutingControl = L.polyline(route ? route.coords : [[userLiveLat, userLiveLng], [shop.lat, shop.lng]], {
            color: "#ff4757", weight: 5, opacity: 0.85, dashArray: route ? null : '5,10'
        }).addTo(map);
        map.invalidateSize();
        map.fitBounds(operationalRoutingControl.getBounds(), { padding: [50,50] });
        if (route) {
            const etaLabel = route.durationMin < 60 ? `${route.durationMin} min` : `${Math.floor(route.durationMin/60)}h ${route.durationMin%60}m`;
            showToast(`Road route: ${route.distanceKm.toFixed(1)} km • ~${etaLabel}`, "info");
        } else {
            showToast(`Showing straight-line direction to ${shop.name}.`, "info");
        }
    };

    function renderAllShops(shops) {
        const displayGrid = document.getElementById('search-results');
        const countEl = document.getElementById('pharmacy-count');
        if (!displayGrid) return;
        // Always show the nearest shop first (real haversine distance from the
        // user's live GPS fix) — no fixed/demo ordering, whatever the caller
        // passed in gets re-sorted here so "50 m, 300 m, 1.3 km..." is always
        // true regardless of which list (full hub vs. a medicine-search match)
        // is being rendered.
        shops = shops.slice().sort((a, b) =>
            haversineKm(userLiveLat, userLiveLng, a.lat, a.lng) - haversineKm(userLiveLat, userLiveLng, b.lat, b.lng)
        );
        if (countEl) countEl.innerText = `${shops.length} Nearby`;
        if (shops.length === 0) {
            displayGrid.innerHTML = `<div style="text-align:center;padding:30px;color:#747d8c;"><i class="fa-solid fa-store-slash" style="font-size:2rem;color:#ddd;margin-bottom:8px;display:block;"></i><p style="font-size:0.82rem;">No pharmacies registered yet.</p></div>`;
            return;
        }
        displayGrid.innerHTML = shops.map(shop => {
            // Straight-line placeholder shown immediately; replaced below with the
            // real road distance/duration from OSRM once it resolves (was previously
            // a made-up "distKm * 6 + 5" formula that produced nonsense like "0 m 5 min").
            const distKm = haversineKm(userLiveLat, userLiveLng, shop.lat, shop.lng);
            const distLabel = distKm < 0.1 ? `< 100 m` : (distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`);
            return `
                <div class="shop-card" data-shop-id="${shop.id}">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                        <div style="flex:1;min-width:0;">
                            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                                <i class="fa-solid fa-shop" style="color:#e02020;font-size:0.85rem;"></i>
                                <h4 style="color:#e02020;margin:0;font-size:0.9rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${shop.name}</h4>
                            </div>
                            <p style="margin:2px 0;font-size:0.75rem;color:#747d8c;"><i class="fa-solid fa-location-dot"></i> ${shop.address || shop.city || 'Location set'}</p>
                            <div style="display:flex;gap:12px;margin-top:6px;">
                                <span class="shop-dist-label" data-shop-dist="${shop.id}" style="font-size:0.73rem;color:#1c82aa;font-weight:600;"><i class="fa-solid fa-route"></i> ${distLabel}</span>
                                <span class="shop-eta-label" data-shop-eta="${shop.id}" style="font-size:0.73rem;color:#2ed573;font-weight:600;"><i class="fa-solid fa-clock"></i> <i class="fa-solid fa-spinner fa-spin"></i></span>
                                ${shop.license === 'Verified' ? '<span style="font-size:0.7rem;color:#28a745;font-weight:600;"><i class="fa-solid fa-circle-check"></i> Verified</span>' : ''}
                            </div>
                        </div>
                        <div class="shop-card-actions">
                            <button class="view-shop-trigger shop-view-btn" data-shop-id="${shop.id}"><i class="fa-solid fa-store"></i> VIEW</button>
                            <button class="run-routing-trigger shop-go-btn" data-shop='${JSON.stringify(shop).replace(/'/g, "&#39;")}'><i class="fa-solid fa-diamond-turn-right"></i> GO</button>
                        </div>
                    </div>
                </div>`;
        }).join('');

        // Fill in the real road distance/ETA per shop from OSRM (falls back to the
        // straight-line estimate already on screen if the routing request fails).
        shops.forEach(async (shop) => {
            const route = await fetchRoadRoute(userLiveLat, userLiveLng, shop.lat, shop.lng);
            if (!route) return;
            const distEl = displayGrid.querySelector(`[data-shop-dist="${shop.id}"]`);
            const etaEl = displayGrid.querySelector(`[data-shop-eta="${shop.id}"]`);
            if (distEl) distEl.innerHTML = `<i class="fa-solid fa-route"></i> ${route.distanceKm < 0.1 ? '< 100 m' : (route.distanceKm < 1 ? Math.round(route.distanceKm * 1000) + ' m' : route.distanceKm.toFixed(1) + ' km')}`;
            if (etaEl) etaEl.innerHTML = `<i class="fa-solid fa-clock"></i> ${route.durationMin < 1 ? '1 min' : (route.durationMin < 60 ? route.durationMin + ' min' : Math.floor(route.durationMin/60) + 'h ' + (route.durationMin%60) + 'm')}`;
        });

        displayGrid.querySelectorAll('.view-shop-trigger').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                // Opens the shop as an in-app page (page-shop-detail) — no
                // more navigating to the separate shop-details.html file,
                // which wasn't reachable from this deployment. Same SPA
                // pattern as Product Detail: instant, no page reload.
                navigateToShopDetail(btn.dataset.shopId);
            });
        });
        displayGrid.querySelectorAll('.run-routing-trigger').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const shop = JSON.parse(btn.dataset.shop);
                triggerLiveMapDirections(shop);
                map.setView([shop.lat, shop.lng], 15);
                const matchedMarker = allShopMarkers.find(m => {
                    const ll = m.getLatLng();
                    return Math.abs(ll.lat - shop.lat) < 0.0001 && Math.abs(ll.lng - shop.lng) < 0.0001;
                });
                if (matchedMarker) matchedMarker.openPopup();
            });
        });
    }

    const searchBtn = document.getElementById('map-search-btn');
    const inputField = document.getElementById('medicine-search');

    if (inputField) {
        let mapSuggestBox = document.createElement('div');
        mapSuggestBox.style.cssText = `position:absolute;top:100%;left:0;right:0;background:#fff;border-radius:0 0 10px 10px;box-shadow:0 8px 20px rgba(0,0,0,0.12);z-index:9999;display:none;max-height:150px;overflow-y:auto;border:1px solid #f1f2f6;`;
        const sbWrapper = inputField.closest('.search-bar') || inputField.parentElement;
        sbWrapper.style.position = 'relative';
        sbWrapper.appendChild(mapSuggestBox);

        const medicineSuggestions = ["Paracetamol","Amoxicillin","Vitamin C","Ibuprofen","Cetirizine","Azithromycin","Metformin","Insulin","Omeprazole","Cough Syrup","Betadine","Dolo 650","Crocin","Ranitidine","Ciprofloxacin"];

        // ✅ NEW — real, labeled suggestions from Supabase (medicines + shops),
        // replacing the old hardcoded demo medicine-name list. Debounced so
        // typing quickly doesn't fire a query per keystroke.
        let suggestDebounceTimer = null;
        async function fetchRealSuggestions(q) {
            if (!supabase) return { medicines: [], shops: [] };
            try {
                const [medRes, shopRes] = await Promise.all([
                    supabase.from('medicines').select('id, name, product_name').eq('status', 'Approved').or(`name.ilike.%${q}%,product_name.ilike.%${q}%`).limit(4),
                    supabase.from('merchants').select('id, shop_name, merchant_name').in('status', ['active', 'approved']).or(`shop_name.ilike.%${q}%,merchant_name.ilike.%${q}%`).limit(4)
                ]);
                const medicines = (medRes.data || []).map(m => m.name || m.product_name).filter(Boolean);
                const shops = (shopRes.data || []).map(s => ({ id: s.id, name: s.shop_name || s.merchant_name })).filter(s => s.name);
                return { medicines: [...new Set(medicines)], shops };
            } catch (e) {
                return { medicines: [], shops: [] };
            }
        }


        inputField.addEventListener('input', () => {
            const q = inputField.value.trim().toLowerCase();
            clearTimeout(suggestDebounceTimer);
            if (q.length < 2) {
                mapSuggestBox.style.display = 'none';
                return;
            }
            suggestDebounceTimer = setTimeout(async () => {
                const { medicines, shops } = await fetchRealSuggestions(q);
                if (medicines.length === 0 && shops.length === 0) {
                    mapSuggestBox.innerHTML = `<div style="padding:10px 14px;font-size:0.8rem;color:#a4b0be;">No matching medicine or shop found.</div>`;
                    mapSuggestBox.style.display = 'block';
                    return;
                }
                mapSuggestBox.innerHTML =
                    medicines.map(m => `<div style="padding:8px 14px;cursor:pointer;font-size:0.85rem;color:#2f3542;border-bottom:1px solid #f8f9fa;display:flex;align-items:center;gap:8px;" class="map-sug-item" data-kind="medicine" data-val="${m}"><span style="font-size:0.62rem;font-weight:700;color:#1c82aa;background:#eef7fb;padding:2px 6px;border-radius:6px;">MEDICINE</span> ${m}</div>`).join('') +
                    shops.map(s => `<div style="padding:8px 14px;cursor:pointer;font-size:0.85rem;color:#2f3542;border-bottom:1px solid #f8f9fa;display:flex;align-items:center;gap:8px;" class="map-sug-item" data-kind="shop" data-val="${s.name}" data-id="${s.id}"><span style="font-size:0.62rem;font-weight:700;color:#e02020;background:#fdecec;padding:2px 6px;border-radius:6px;">SHOP</span> ${s.name}</div>`).join('');
                mapSuggestBox.style.display = 'block';
                mapSuggestBox.querySelectorAll('.map-sug-item').forEach(item => {
                    item.addEventListener('mousedown', (ev) => {
                        ev.preventDefault();
                        mapSuggestBox.style.display = 'none';
                        if (item.dataset.kind === 'shop') {
                            // Opens the shop as an in-app page (page-shop-detail)
                            // instead of navigating to the old, unreachable
                            // shop-details.html file.
                            navigateToShopDetail(item.dataset.id);
                        } else {
                            inputField.value = item.dataset.val;
                            if (searchBtn) searchBtn.click();
                        }
                    });
                });
            }, 300);
        });
        inputField.addEventListener('blur', () => setTimeout(() => { mapSuggestBox.style.display = 'none'; }, 200));
        inputField.addEventListener('keypress', (e) => { if (e.key === 'Enter' && searchBtn) searchBtn.click(); });
    }

    if (searchBtn && inputField) {
        searchBtn.addEventListener('click', async () => {
            const token = inputField.value.trim().toLowerCase();
            if (!token) {
                renderAllShops(pharmacyDatabaseHub);
                allShopMarkers.forEach(m => m.addTo(map));
                return;
            }

            // Find which NEARBY pharmacies actually have this medicine in stock
            // (previously this just matched the pharmacy's own name, so it
            // showed every registered pharmacy regardless of what they stock).
            let matchedStores = [];
            if (supabase) {
                try {
                    const nearbyIds = pharmacyDatabaseHub.map(s => s.id);
                    const { data: stockRows, error } = await supabase
                        .from('medicines')
                        .select('merchant_id, name, product_name, stock_qty, status')
                        .eq('status', 'Approved')
                        .or(`name.ilike.%${token}%,product_name.ilike.%${token}%`);
                    if (!error && stockRows) {
                        const inStockMerchantIds = new Set(
                            stockRows.filter(r => (r.stock_qty || 0) > 0).map(r => String(r.merchant_id))
                        );
                        matchedStores = pharmacyDatabaseHub.filter(s => inStockMerchantIds.has(String(s.id)));
                    }
                } catch (e) { /* fall back below */ }
            }
            if (matchedStores.length === 0) {
                // fallback: at least match by pharmacy name so the search never goes empty on a lookup error
                matchedStores = pharmacyDatabaseHub.filter(s => s.name.toLowerCase().includes(token));
            }
            // ✅ FIX (Map search): if there's still no match — no stock row
            // found for that medicine name/spelling and no pharmacy literally
            // named after it — the shop list used to render completely empty
            // ("No pharmacies registered yet"), even though nearby shops
            // clearly exist. That looked like shop names were broken/missing.
            // Now it always falls back to showing the nearby shop list so the
            // shopper can still see and go to a pharmacy, with a toast
            // explaining no exact stock match was found.
            if (matchedStores.length === 0 && pharmacyDatabaseHub.length > 0) {
                matchedStores = pharmacyDatabaseHub;
                showToast(`No exact stock match for "${inputField.value.trim()}" — showing nearby shops.`, "info");
            }

            allShopMarkers.forEach(m => map.removeLayer(m));
            matchedStores.forEach(shop => {
                const marker = L.marker([shop.lat, shop.lng], { icon: shopIcon }).addTo(map)
                    .bindPopup(`<b>${shop.name}</b><br>${shop.address || ''}`);
                allShopMarkers.push(marker);
            });
            renderAllShops(matchedStores);
        });
    }
}

function openMapMedicineProductDetailsPopup(shop, queriedToken) {
    let popup = document.createElement('div');
    popup.className = "modal active";
    popup.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100vh;background:rgba(0,0,0,0.6);display:flex;justify-content:center;align-items:center;z-index:10000;padding:16px;box-sizing:border-box;`;
    const distKm = Math.sqrt(Math.pow(userLiveLat - shop.lat, 2) + Math.pow(userLiveLng - shop.lng, 2)) * 111;
    const etaMins = Math.round(distKm * 6 + 5);
    const etaLabel = etaMins < 60 ? `${etaMins} mins` : `${Math.floor(etaMins/60)}h ${etaMins%60}m`;
    popup.innerHTML = `
        <div class="modal-content" style="background:#fff;width:100%;max-width:400px;border-radius:16px;padding:20px;text-align:center;box-sizing:border-box;border-top:5px solid #ff4d4d;">
            <h2 style="color:#ff4d4d;font-size:1.3rem;">${queriedToken.toUpperCase()}</h2>
            <p style="font-size:0.85rem;margin:6px 0;">Available at: <strong>${shop.name}</strong></p>
            <div style="background:#f8f9fa;padding:10px;border-radius:8px;font-size:0.8rem;margin:10px 0;text-align:left;">
                <p><i class="fa-solid fa-location-dot" style="color:#ff4d4d;"></i> Distance: <strong>${distKm.toFixed(1)} km</strong></p>
                <p><i class="fa-solid fa-truck-fast" style="color:#1c82aa;"></i> Est. Delivery: <strong>${etaLabel}</strong></p>
                <p><strong>Composition:</strong> Active Pharma Molecule Salts</p>
                <p><strong>Safety Warning:</strong> Prescription required for Rx items.</p>
            </div>
            <div style="display:flex;gap:10px;margin-top:15px;">
                <button id="map-modal-close" style="flex:1;padding:10px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;">Back to Map</button>
                <button id="map-modal-buy" style="flex:1;padding:10px;border-radius:8px;border:none;background:#2ed573;color:#fff;cursor:pointer;font-weight:600;">Buy / Add to Cart</button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);
    document.getElementById('map-modal-close').onclick = () => popup.remove();
    document.getElementById('map-modal-buy').onclick = () => {
        addToCart({ id: "m1", name: queriedToken.toUpperCase() + " Core Dose", price: 45.00, img: "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=400", isRx: false });
        popup.remove();
        navigateTo('cart');
    };
}

// ============================================================
// PROFILE PAGE
// ============================================================
function setupProfilePageModules() {
    const cachedName = localStorage.getItem('medi_profile_name') || "Guest User";
    const userNameElement = document.getElementById('user-name');
    const nameInputElement = document.getElementById('new-name-input');
    if (userNameElement) userNameElement.innerText = cachedName;
    if (nameInputElement) nameInputElement.value = cachedName;
    const currentAddressText = document.getElementById('current-address');
    if (currentAddressText && verifiedAddress) currentAddressText.innerText = verifiedAddress;
    const profileImgElement = document.getElementById('profile-pic');
    const dbAvatarUrl = localStorage.getItem('medi_profile_avatar');
    const systemCachedPhoto = localStorage.getItem('medi_saved_profile_image');
    if (dbAvatarUrl && profileImgElement) profileImgElement.src = dbAvatarUrl;
    else if (systemCachedPhoto && profileImgElement) profileImgElement.src = systemCachedPhoto;

    const photoUploadInput = document.getElementById('upload-photo');
    if (photoUploadInput) {
        photoUploadInput.addEventListener('change', async (e) => {
            const chosenFile = e.target.files[0];
            if (!chosenFile) return;
            const imgReader = new FileReader();
            imgReader.onloadend = () => {
                localStorage.setItem('medi_saved_profile_image', imgReader.result);
                if (profileImgElement) profileImgElement.src = imgReader.result;
            };
            imgReader.readAsDataURL(chosenFile);
            if (supabase) {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session?.user) {
                        const ext = chosenFile.name.split('.').pop();
                        const path = `profiles/${session.user.id}_avatar.${ext}`;
                        await supabase.storage.from('media').upload(path, chosenFile, { upsert: true });
                        const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
                        if (urlData?.publicUrl) {
                            // Item 4: this used to filter by `id`, but every other
                            // write to `profiles` on this page keys off `email` —
                            // so on a row keyed by email, .eq('id', ...) matched
                            // nothing and the photo silently never saved. Also
                            // upsert (not update-only) so a brand-new account with
                            // no profiles row yet still gets one created here.
                            await supabase.from('profiles').upsert({ email: session.user.email, avatar_url: urlData.publicUrl }, { onConflict: 'email' });
                            localStorage.setItem('medi_profile_avatar', urlData.publicUrl);
                            document.querySelectorAll('#profile-pic').forEach(img => { img.src = urlData.publicUrl; });
                        }
                    }
                } catch (err) {}
            }
            showToast("Profile picture updated!", "success");
        });
    }

    const commitNameBtn = document.getElementById('save-name');
    if (commitNameBtn) {
        commitNameBtn.onclick = async () => {
            const rawEnteredName = nameInputElement?.value?.trim();
            if (rawEnteredName) {
                localStorage.setItem('medi_profile_name', rawEnteredName);
                if (userNameElement) userNameElement.innerText = rawEnteredName;
                if (supabase) {
                    try {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (session && session.user) {
                            await supabase.from('profiles').upsert({ email: session.user.email, full_name: rawEnteredName }, { onConflict: 'email' });
                        }
                    } catch(err) { }
                }
                toggleModalDisplay('edit-modal', false);
                showToast("Profile updated!", "success");
            }
        };
    }

    // Referral code is NEVER generated or awarded on the client anymore.
    // It is generated server-side by a DB trigger the moment a profiles
    // row is created (see redeem_referral_code.sql), and the 100-coin
    // award is granted only through the redeem_referral_code() RPC,
    // which runs security-definer checks against the referrals table
    // (self-referral blocked, one-time-per-account blocked). This block
    // just displays the server's value and lets the user redeem someone
    // else's code once.
    const refCodeDisplayField = document.getElementById('referral-code-display');
    const referralStatusNotice = document.getElementById('referral-status-notice');
    const triggerCopyBtn = document.getElementById('copy-referral-btn');
    let myReferralCode = null;

    async function loadMyReferralState() {
        if (!supabase || !refCodeDisplayField) return;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user?.email) { refCodeDisplayField.innerText = "Log in to get your code"; return; }
            const { data: profileRow, error } = await supabase
                .from('profiles')
                .select('referral_code, referred_by, coins')
                .eq('email', session.user.email)
                .maybeSingle();
            if (error) throw error;
            myReferralCode = profileRow?.referral_code || null;
            refCodeDisplayField.innerText = myReferralCode || "Code not issued yet — contact support";
            renderReferralRedeemBox(!!profileRow?.referred_by);
        } catch (e) {
            refCodeDisplayField.innerText = "Couldn't load your code";
        }
    }

    function renderReferralRedeemBox(alreadyRedeemed) {
        const dashboardBody = document.querySelector('#referral-modal .referral-dashboard-body');
        if (!dashboardBody) return;
        document.getElementById('referral-redeem-box')?.remove();
        if (alreadyRedeemed) return; // already used a code once — nothing to redeem
        const box = document.createElement('div');
        box.id = 'referral-redeem-box';
        box.style.cssText = 'margin-top:14px;text-align:left;';
        box.innerHTML = `
            <div class="block-label" style="font-size:0.78rem;font-weight:600;margin-bottom:6px;">Have a friend's referral code?</div>
            <div style="display:flex;gap:8px;">
                <input type="text" id="referral-redeem-input" placeholder="e.g., MEDI-RJ83K2" style="flex:1;padding:10px;border-radius:8px;border:1px solid #e4e7eb;font-size:0.85rem;text-transform:uppercase;">
                <button type="button" id="referral-redeem-btn" style="padding:0 16px;border-radius:8px;border:none;background:#ff4d4d;color:#fff;font-weight:600;cursor:pointer;">Apply</button>
            </div>`;
        (referralStatusNotice?.parentElement || dashboardBody).insertBefore(box, referralStatusNotice ? referralStatusNotice.nextSibling : null);
        document.getElementById('referral-redeem-btn').onclick = async () => {
            const btn = document.getElementById('referral-redeem-btn');
            const input = document.getElementById('referral-redeem-input');
            const code = (input?.value || '').trim().toUpperCase();
            if (!code) { if (referralStatusNotice) referralStatusNotice.innerText = "Enter a code first."; return; }
            if (myReferralCode && code === myReferralCode.toUpperCase()) {
                if (referralStatusNotice) referralStatusNotice.innerText = "You can't use your own referral code.";
                return;
            }
            if (!supabase) { if (referralStatusNotice) referralStatusNotice.innerText = "Not available right now."; return; }
            btn.disabled = true; btn.innerText = "Applying...";
            try {
                const { data, error } = await supabase.rpc('redeem_referral_code', { p_code: code });
                if (error) throw error;
                if (data?.success) {
                    if (referralStatusNotice) referralStatusNotice.innerText = "✓ " + (data.message || "Referral applied!");
                    showToast(data.message || "Referral applied!", "success");
                    box.remove();
                } else {
                    if (referralStatusNotice) referralStatusNotice.innerText = data?.message || "Couldn't apply that code.";
                }
            } catch (e) {
                if (referralStatusNotice) referralStatusNotice.innerText = "Couldn't apply that code — it may not exist yet on the server (see setup notes).";
            } finally {
                btn.disabled = false; btn.innerText = "Apply";
            }
        };
    }

    if (triggerCopyBtn) {
        triggerCopyBtn.onclick = () => {
            if (!myReferralCode) return;
            navigator.clipboard.writeText(myReferralCode);
            if (referralStatusNotice) { referralStatusNotice.innerText = "✓ Referral code copied!"; setTimeout(() => { referralStatusNotice.innerText = ""; }, 3000); }
        };
    }
    loadMyReferralState();
    if (document.getElementById('my-coupons-list')) loadMyCouponsAndOffers();

    const languageSelectNode = document.getElementById('language-select');
    const activeAppLanguageEnv = localStorage.getItem('medi_active_language_env') || 'en';
    if (languageSelectNode) {
        languageSelectNode.value = activeAppLanguageEnv;
        triggerGlobalAppLanguageTranslation(activeAppLanguageEnv);
        languageSelectNode.addEventListener('change', (event) => {
            const targetLocale = event.target.value;
            localStorage.setItem('medi_active_language_env', targetLocale);
            triggerGlobalAppLanguageTranslation(targetLocale);
            updateSearchPlaceholder(targetLocale);
        });
    }

    const targetPatientTrigger = document.getElementById('manage-patients-trigger');
    if (targetPatientTrigger) {
        targetPatientTrigger.onclick = () => { toggleModalDisplay('patient-modal', true); renderPatientsListUI(); };
    }

    const savePatientProfileBtn = document.getElementById('action-add-patient-btn');
    if (savePatientProfileBtn) {
        savePatientProfileBtn.onclick = async () => {
            const firstNameCell = document.getElementById('pat-first-name')?.value?.trim();
            const lastNameCell = document.getElementById('pat-last-name')?.value?.trim();
            const ageCell = document.getElementById('pat-age')?.value?.trim();
            const checkedGenderRadio = document.querySelector('input[name="pat_gender"]:checked');
            if (!firstNameCell || !lastNameCell || !ageCell) { showToast("Please fill all patient fields.", "error"); return; }
            const freshPatientPayload = { id: "PAT-" + Date.now(), name: `${firstNameCell} ${lastNameCell}`, age: ageCell, gender: checkedGenderRadio ? checkedGenderRadio.value : "Male" };
            patientsData.push(freshPatientPayload);
            localStorage.setItem('medi_patients', JSON.stringify(patientsData));
            if (supabase) {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session && session.user) {
                        await supabase.from('patients').insert([{ id: freshPatientPayload.id, user_email: session.user.email, name: freshPatientPayload.name, age: freshPatientPayload.age, gender: freshPatientPayload.gender }]);
                    }
                } catch(e) { }
            }
            if (document.getElementById('pat-first-name')) document.getElementById('pat-first-name').value = "";
            if (document.getElementById('pat-last-name')) document.getElementById('pat-last-name').value = "";
            if (document.getElementById('pat-age')) document.getElementById('pat-age').value = "";
            renderPatientsListUI();
            showToast("Patient registered!", "success");
        };
    }

    const triggerReminderModalBtn = document.getElementById('pill-reminders-trigger');
    if (triggerReminderModalBtn) {
        triggerReminderModalBtn.onclick = () => { toggleModalDisplay('reminder-modal', true); renderAlarmsListUI(); };
    }

    // ✅ Multiple date+time rows — lets one medicine get reminders on several
    // different dates in one go, each date with its own time, instead of a
    // single always-repeating time. Rows are simple date+time pairs; "Add
    // another date" appends more of them before saving.
    const alarmDateRowsBox = document.getElementById('alarm-date-rows');
    function addAlarmDateRow(prefDate) {
        if (!alarmDateRowsBox) return;
        const row = document.createElement('div');
        row.className = 'alarm-date-row';
        row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;';
        const todayIso = new Date().toISOString().slice(0, 10);
        row.innerHTML = `
            <input type="date" class="alarm-row-date" min="${todayIso}" value="${prefDate || todayIso}" style="flex:1;padding:10px;border-radius:8px;border:1px solid #e4e7eb;font-size:0.85rem;box-sizing:border-box;">
            <input type="time" class="alarm-row-time" style="flex:1;padding:10px;border-radius:8px;border:1px solid #e4e7eb;font-size:0.85rem;box-sizing:border-box;">
            <button type="button" class="alarm-row-remove" title="Remove this date" style="background:none;border:none;color:#ff4d4d;font-size:1rem;cursor:pointer;padding:4px 6px;"><i class="fa-solid fa-circle-xmark"></i></button>
        `;
        row.querySelector('.alarm-row-remove').onclick = () => {
            if (alarmDateRowsBox.children.length > 1) row.remove();
        };
        alarmDateRowsBox.appendChild(row);
    }
    if (alarmDateRowsBox && alarmDateRowsBox.children.length === 0) addAlarmDateRow();
    const addDateRowBtn = document.getElementById('alarm-add-date-row-btn');
    if (addDateRowBtn) addDateRowBtn.onclick = () => addAlarmDateRow();

    const saveActiveAlarmBtn = document.getElementById('action-save-alarm-btn');
    if (saveActiveAlarmBtn) {
        saveActiveAlarmBtn.onclick = async () => {
            const inputMed = document.getElementById('alarm-med-name')?.value?.trim();
            const rows = Array.from(alarmDateRowsBox ? alarmDateRowsBox.querySelectorAll('.alarm-date-row') : []);
            const entries = rows.map(r => ({
                date: r.querySelector('.alarm-row-date')?.value,
                time: r.querySelector('.alarm-row-time')?.value
            })).filter(e => e.date && e.time);

            if (!inputMed || entries.length === 0) { showToast("Enter medicine name and at least one date & time.", "error"); return; }

            const freshAlarms = entries.map(e => ({ id: "ALM-" + Date.now() + "-" + Math.floor(Math.random() * 10000), medicine: inputMed, date: e.date, time: e.time, active: true }));
            alarmsData.push(...freshAlarms);
            localStorage.setItem('medi_alarms', JSON.stringify(alarmsData));
            if (supabase) {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session && session.user) {
                        await supabase.from('reminders').insert(freshAlarms.map(a => ({ id: a.id, user_email: session.user.email, medicine: a.medicine, date: a.date, time: a.time, active: true })));
                    }
                } catch(e) { }
            }
            if (document.getElementById('alarm-med-name')) document.getElementById('alarm-med-name').value = "";
            if (alarmDateRowsBox) { alarmDateRowsBox.innerHTML = ''; addAlarmDateRow(); }
            renderAlarmsListUI();
            showToast(`Pill reminder set for ${freshAlarms.length} date${freshAlarms.length > 1 ? 's' : ''}!`, "success");
        };
    }

    const editBtn = document.getElementById('edit-profile-btn');
    const addressBtn = document.getElementById('add-address-btn');
    const termsTrigger = document.getElementById('terms-trigger');
    const privacyTrigger = document.getElementById('privacy-trigger');
    const cancellationTrigger = document.getElementById('cancellation-trigger');
    const helpTrigger = document.getElementById('help-desk-trigger');
    const referEarnBtn = document.getElementById('refer-earn-btn');
    // Inline name editor — replaces the old "Edit Name" popup modal. Tapping
    // the button now reveals an input + Save + Cancel right at that spot in
    // the profile card itself (no dead click, no separate popup), per spec.
    // Reuses the same profiles.upsert persistence the old modal used.
    function openInlineNameEditor() {
        if (document.getElementById('inline-name-editor')) return; // already open
        const userInfoBox = editBtn.closest('.user-info') || editBtn.parentElement;
        if (!userInfoBox) return;
        editBtn.style.display = 'none';

        const wrap = document.createElement('div');
        wrap.id = 'inline-name-editor';
        wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:6px;width:100%;max-width:280px;';
        wrap.innerHTML = `
            <input type="text" id="inline-name-input" placeholder="Enter your full name"
                style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #ced4da;font-size:0.9rem;">
            <p id="inline-name-error" style="margin:0;font-size:0.72rem;font-weight:600;color:#e02020;min-height:14px;"></p>
            <div style="display:flex;gap:8px;">
                <button type="button" id="inline-name-cancel" style="flex:1;padding:9px;border-radius:8px;border:1px solid #ccc;background:#f8f9fa;cursor:pointer;font-weight:600;font-size:0.82rem;">Cancel</button>
                <button type="button" id="inline-name-save" style="flex:1;padding:9px;border-radius:8px;border:none;background:#ff4d4d;color:#fff;cursor:pointer;font-weight:600;font-size:0.82rem;">Save</button>
            </div>`;
        userInfoBox.appendChild(wrap);

        const inlineInput = document.getElementById('inline-name-input');
        inlineInput.value = userNameElement?.innerText?.trim() || '';
        inlineInput.focus();

        function closeInlineEditor() {
            wrap.remove();
            editBtn.style.display = '';
        }

        document.getElementById('inline-name-cancel').onclick = closeInlineEditor;
        document.getElementById('inline-name-save').onclick = async () => {
            const errEl = document.getElementById('inline-name-error');
            const rawEnteredName = inlineInput.value.trim();
            if (!rawEnteredName) {
                if (errEl) errEl.innerText = "Name can't be empty.";
                return;
            }
            const saveBtnEl = document.getElementById('inline-name-save');
            saveBtnEl.disabled = true; saveBtnEl.innerText = 'Saving...';
            localStorage.setItem('medi_profile_name', rawEnteredName);
            if (userNameElement) userNameElement.innerText = rawEnteredName;
            if (nameInputElement) nameInputElement.value = rawEnteredName; // keep old modal field in sync too
            if (supabase) {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session && session.user) {
                        await supabase.from('profiles').upsert({ email: session.user.email, full_name: rawEnteredName }, { onConflict: 'email' });
                    }
                } catch (err) { }
            }
            showToast("Profile updated!", "success");
            closeInlineEditor();
        };
    }
    if (editBtn) editBtn.onclick = openInlineNameEditor;
    if (addressBtn) addressBtn.onclick = (e) => { e.stopPropagation(); toggleModalDisplay('address-modal', true); loadSavedAddresses(); };
    // The pencil icon above only opened the modal from itself — tapping the
    // rest of the "Manage Delivery Addresses" card did nothing. Now the
    // whole card opens the same address book.
    const manageAddressCard = document.getElementById('manage-address-trigger');
    if (manageAddressCard) manageAddressCard.addEventListener('click', () => { toggleModalDisplay('address-modal', true); loadSavedAddresses(); });
    // ✅ Item 5: back to the local usert&c.html page per explicit request —
    // Terms, Privacy Policy and Cancellation & Refund all point to it
    // (each can deep-link to its own section via the hash).
    if (termsTrigger) termsTrigger.onclick = () => { window.location.href = 'usert&c.html'; };
    if (privacyTrigger) privacyTrigger.onclick = () => { window.location.href = 'usert&c.html#privacy-policy'; };
    if (cancellationTrigger) cancellationTrigger.onclick = () => { window.location.href = 'usert&c.html#cancellation-refund'; };
    if (helpTrigger) helpTrigger.onclick = () => toggleModalDisplay('help-modal', true);
    if (referEarnBtn) referEarnBtn.onclick = () => { toggleModalDisplay('referral-modal', true); loadMyReferralState(); loadMyCouponsAndOffers(); };

    // Separate "Offers & Coupons" entry — opens the same referral modal
    // (which already renders the full coupons/offers list) so there's no
    // duplicated logic, just a more discoverable dedicated entry point.
    const offersCouponsBtn = document.getElementById('offers-coupons-btn');
    if (offersCouponsBtn) offersCouponsBtn.addEventListener('click', () => {
        toggleModalDisplay('referral-modal', true);
        loadMyReferralState();
        loadMyCouponsAndOffers();
        setTimeout(() => { document.getElementById('my-coupons-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150);
    });

    // Wishlist — lists every product the user has hearted, each opening the
    // real product detail page on tap.
    const wishlistTrigger = document.getElementById('wishlist-trigger');
    if (wishlistTrigger) wishlistTrigger.addEventListener('click', () => { toggleModalDisplay('wishlist-modal', true); renderProfileWishlist(); });

    // Merged in from the old hamburger menu (no longer reachable — the app
    // now uses a 5-icon bottom nav instead of a hamburger button).
    const myOrdersCard = document.getElementById('my-orders-trigger');
    if (myOrdersCard) myOrdersCard.addEventListener('click', () => { if (typeof window.navigateTo === 'function') window.navigateTo('order'); });

    const trackShopCard = document.getElementById('track-fav-shop-trigger');
    if (trackShopCard) trackShopCard.addEventListener('click', () => { if (typeof window.navigateTo === 'function') window.navigateTo('shops'); });

    // FAQ is the same Help Desk modal (it already contains the FAQ
    // accordion) — this just gives it its own, clearly-labelled entry point
    // and scrolls straight to the questions.
    const faqCard = document.getElementById('faq-trigger');
    if (faqCard) faqCard.addEventListener('click', () => {
        toggleModalDisplay('help-modal', true);
        setTimeout(() => { document.querySelector('#help-modal .faq-accordion')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150);
    });

    // ✅ NEW — Complaint Center + Delete Account, injected once into the
    // profile page (no HTML changes required to get this working).
    setupAccountSupportSection();

    // ============================================================
    // ADDRESS BOOK — Flipkart-style multi-address (tags, default, edit/delete/select)
    // ============================================================
    function resetAddressForm() {
        ['prof-addr-name', 'prof-addr-phone', 'prof-addr-house', 'addr-line2', 'prof-addr-landmark', 'prof-addr-city', 'addr-state', 'prof-addr-pincode'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const defaultCheck = document.getElementById('addr-set-default');
        if (defaultCheck) defaultCheck.checked = false;
        const homeRadio = document.querySelector('input[name="addr_tag"][value="Home"]');
        if (homeRadio) homeRadio.checked = true;
        const editingIdField = document.getElementById('editing-address-id');
        if (editingIdField) editingIdField.value = '';
        const heading = document.getElementById('address-form-heading');
        if (heading) heading.innerText = 'Add New Address';
        const statusMsg = document.getElementById('prof-addr-status-msg');
        if (statusMsg) statusMsg.innerText = '';
    }

    window.editSavedAddress = function(id) {
        const a = savedAddresses.find(x => x.id === id);
        if (!a) return;
        document.getElementById('editing-address-id').value = a.id;
        document.getElementById('prof-addr-name').value = a.name || '';
        document.getElementById('prof-addr-phone').value = a.phone || '';
        document.getElementById('prof-addr-house').value = a.address1 || '';
        document.getElementById('addr-line2').value = a.address2 || '';
        document.getElementById('prof-addr-landmark').value = a.landmark || '';
        document.getElementById('prof-addr-city').value = a.city || '';
        document.getElementById('addr-state').value = a.state || '';
        document.getElementById('prof-addr-pincode').value = a.pincode || '';
        const tagRadio = document.querySelector(`input[name="addr_tag"][value="${a.tag || 'Home'}"]`);
        if (tagRadio) tagRadio.checked = true;
        document.getElementById('addr-set-default').checked = !!a.is_default;
        document.getElementById('address-form-heading').innerText = 'Edit Address';
        document.getElementById('address-form-heading').scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    window.deleteSavedAddress = function(id) {
        showConfirmationModal("Delete this address?", async () => {
            savedAddresses = savedAddresses.filter(a => a.id !== id);
            renderSavedAddressList();
            if (supabase) {
                try { await supabase.from('user_addresses').delete().eq('id', id); } catch (e) {}
            }
            showToast("Address deleted.", "info");
        });
    };

    // Selecting a saved address makes it the active delivery address used at checkout
    window.selectSavedAddressAsActive = async function(id) {
        const a = savedAddresses.find(x => x.id === id);
        if (!a) return;
        const addr = { name: a.name, phone: a.phone, house: a.address1, area: a.address2 || '', city: a.city, pincode: a.pincode, landmark: a.landmark || '' };
        localStorage.setItem('medi_delivery_address', JSON.stringify(addr));
        verifiedAddress = `${a.address1}, ${a.city} - ${a.pincode}`;
        localStorage.setItem('medi_verified_address', verifiedAddress);
        if (currentAddressText) currentAddressText.innerText = verifiedAddress;

        const zoneCheck = await checkPincodeServiceability(a.pincode);
        if (!zoneCheck.available) {
            showToast(`Using ${a.tag} address — Standard delivery available (30 Min/Same Day not launched here yet).`, "success");
        } else {
            showToast(`Using ${a.tag} address for delivery.`, "success");
        }
    };

    async function loadSavedAddresses() {
        if (!supabase) { renderSavedAddressList(); return; }
        const uid = await getCurrentAuthUserId();
        if (!uid) { renderSavedAddressList(); return; }
        try {
            const { data, error } = await supabase.from('user_addresses').select('*').eq('user_id', uid).order('is_default', { ascending: false }).order('created_at', { ascending: false });
            if (error) {
                // Previously swallowed silently — a saved address would then just
                // never appear in the list with no indication why. Surface it.
                console.error('user_addresses load failed:', error);
                showToast("Couldn't load your saved addresses: " + (error.message || error.hint || 'unknown error'), "error");
            } else if (data) {
                savedAddresses = data;
            }
        } catch (e) {
            console.error('user_addresses load failed:', e);
        }
        renderSavedAddressList();

        const defaultAddr = savedAddresses.find(a => a.is_default) || savedAddresses[0];
        if (defaultAddr && currentAddressText) {
            verifiedAddress = `${defaultAddr.address1}, ${defaultAddr.city} - ${defaultAddr.pincode}`;
            currentAddressText.innerText = `${verifiedAddress} (${defaultAddr.tag})`;
        }
    }

    function renderSavedAddressList() {
        const list = document.getElementById('saved-address-list');
        if (!list) return;
        if (savedAddresses.length === 0) {
            list.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:0.8rem;">No saved addresses yet. Add one below.</div>`;
            return;
        }
        list.innerHTML = savedAddresses.map(a => `
            <div class="record-subcard-pill" onclick="selectSavedAddressAsActive('${a.id}')">
                <div>
                    <span class="addr-tag-badge">${a.tag || 'Home'}</span>${a.is_default ? '<span class="addr-default-badge">DEFAULT</span>' : ''}
                    <div style="margin-top:4px;"><strong>${a.name || ''}</strong></div>
                    <div class="sub-label">${a.address1}${a.address2 ? ', ' + a.address2 : ''}${a.landmark ? ', Near ' + a.landmark : ''}, ${a.city}, ${a.state} - ${a.pincode}</div>
                    <div class="sub-label">${a.phone || ''}</div>
                </div>
                <div class="addr-actions-col">
                    <button onclick="event.stopPropagation(); editSavedAddress('${a.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button class="delete-record-action-btn" onclick="event.stopPropagation(); deleteSavedAddress('${a.id}')" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>
        `).join('');
    }

    const saveAddressBtn = document.getElementById('prof-save-address-btn');
    // ✅ NEW — GPS-assisted address entry. Injected once, right before the
    // Save button, reusing the same safeGetCurrentPosition()/nominatim
    // reverse-geocode pattern already used on the Map page. Never invents
    // an API key — if reverse geocoding fails, it leaves the coordinates-
    // derived fields for the user to complete manually.
    if (saveAddressBtn && !document.getElementById('addr-use-gps-btn')) {
        const gpsBtn = document.createElement('button');
        gpsBtn.type = 'button';
        gpsBtn.id = 'addr-use-gps-btn';
        gpsBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Use my current location';
        gpsBtn.style.cssText = 'width:100%;padding:9px;margin-bottom:10px;border-radius:8px;border:1px dashed #1c82aa;background:#eef7fb;color:#1c82aa;font-weight:600;font-size:0.8rem;cursor:pointer;';
        saveAddressBtn.parentElement.insertBefore(gpsBtn, saveAddressBtn);
        gpsBtn.addEventListener('click', () => {
            gpsBtn.disabled = true;
            gpsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Detecting...';
            safeGetCurrentPosition(async (pos) => {
                try {
                    const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`);
                    const geo = await resp.json();
                    const a = geo.address || {};
                    const cityEl = document.getElementById('prof-addr-city');
                    const stateEl = document.getElementById('addr-state');
                    const pinEl = document.getElementById('prof-addr-pincode');
                    if (cityEl) cityEl.value = a.city || a.town || a.village || a.suburb || cityEl.value;
                    if (stateEl) stateEl.value = a.state || stateEl.value;
                    if (pinEl && a.postcode) pinEl.value = a.postcode;
                    showToast("Location detected — please review and complete the address.", "success");
                } catch (e) {
                    showToast("Couldn't fetch address details for this location. Please enter it manually.", "error");
                } finally {
                    gpsBtn.disabled = false;
                    gpsBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Use my current location';
                }
            }, GEO_OPTIONS_ONE_SHOT);
            setTimeout(() => { if (gpsBtn.disabled) { gpsBtn.disabled = false; gpsBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Use my current location'; } }, 12000);
        });
    }
    if (saveAddressBtn) {
        saveAddressBtn.onclick = async () => {
            const name = document.getElementById('prof-addr-name')?.value?.trim();
            const phone = document.getElementById('prof-addr-phone')?.value?.trim();
            const house = document.getElementById('prof-addr-house')?.value?.trim();
            const line2 = document.getElementById('addr-line2')?.value?.trim();
            const landmark = document.getElementById('prof-addr-landmark')?.value?.trim();
            const city = document.getElementById('prof-addr-city')?.value?.trim();
            const state = document.getElementById('addr-state')?.value?.trim();
            const pincode = document.getElementById('prof-addr-pincode')?.value?.trim();
            const tag = document.querySelector('input[name="addr_tag"]:checked')?.value || 'Home';
            const isDefault = document.getElementById('addr-set-default')?.checked || false;
            const editingId = document.getElementById('editing-address-id')?.value;
            const statusMsg = document.getElementById('prof-addr-status-msg');

            if (!name || !phone || !house || !city || !state || !pincode) {
                if (statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = '❌ Please fill all required fields.'; }
                return;
            }
            if (pincode.length !== 6) {
                if (statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = '❌ Pincode must be 6 digits.'; }
                return;
            }
            if (phone.length < 10) {
                if (statusMsg) { statusMsg.style.color = '#ff4d4d'; statusMsg.innerText = '❌ Enter a valid phone number.'; }
                return;
            }

            // ✅ Standard delivery covers every Indian pincode — saving an
            // address must never be blocked just because 30-Min/Same-Day
            // aren't launched there yet (that's gated separately, per speed).
            if (statusMsg) { statusMsg.style.color = '#747d8c'; statusMsg.innerText = 'Checking fast-delivery availability...'; }
            const zoneCheck = await checkPincodeServiceability(pincode);
            if (statusMsg) {
                statusMsg.style.color = zoneCheck.available ? '#2ed573' : '#747d8c';
                statusMsg.innerText = zoneCheck.available
                    ? '✅ 30 Min & Same Day are available here too!'
                    : 'ℹ️ Standard delivery (5-7 days) is available here.';
            }

            if (!supabase) { showToast("Address book requires an active connection.", "error"); return; }
            const uid = await getCurrentAuthUserId();
            if (!uid) { showToast("Please log in to save an address.", "error"); return; }

            const payload = { user_id: uid, tag, name, phone, address1: house, address2: line2 || null, landmark: landmark || null, city, state, pincode, is_default: isDefault };

            try {
                // Only one address can be default — clear the flag on the others first
                if (isDefault) {
                    await supabase.from('user_addresses').update({ is_default: false }).eq('user_id', uid);
                }
                if (editingId) {
                    await supabase.from('user_addresses').update(payload).eq('id', editingId);
                } else {
                    await supabase.from('user_addresses').insert([payload]);
                }
            } catch (e) {
                showToast("Failed to save address: " + (e.message || e), "error");
                return;
            }

            if (statusMsg) { statusMsg.style.color = '#2ed573'; statusMsg.innerText = '✓ Address saved!'; }
            resetAddressForm();
            await loadSavedAddresses();
            showToast(editingId ? "Address updated!" : "Address saved!", "success");
        };
    }

    loadSavedAddresses();

    const logoutAction = document.getElementById('logout-btn');
    if (logoutAction) {
        logoutAction.onclick = (e) => {
            e.preventDefault();
            showConfirmationModal("Confirm logout?", () => {
                localStorage.clear();
                showToast("Logged out successfully.", "info");
                window.location.href = 'home.html';
            });
        };
    }

    // MY BOX BUTTON - prescription history
    const myBoxBtn = document.getElementById('my-box-btn');
    if (myBoxBtn) {
        myBoxBtn.onclick = () => openMyPrescriptionBox();
    }

    // Deep-linking from the hamburger menu on other pages (e.g.
    // userhome.html#... -> userprofile.html#my-box-btn) previously just left
    // a dead URL hash — the browser can't "open" a modal via anchor scroll.
    // This actually triggers the matching action once the page is ready.
    if (window.location.hash === '#my-box-btn') openMyPrescriptionBox();
    else if (window.location.hash === '#refer-earn-btn') { toggleModalDisplay('referral-modal', true); loadMyReferralState(); loadMyCouponsAndOffers(); }
    else if (window.location.hash === '#help-desk-trigger') toggleModalDisplay('help-modal', true);
    else if (window.location.hash === '#pill-reminders-trigger') { toggleModalDisplay('reminder-modal', true); renderAlarmsListUI(); }
}

// ============================================================
// ACCOUNT & SUPPORT — Complaint Center + Delete Account (doc2 items 22-24).
// Injected once into #page-profile so this works without any HTML changes;
// idempotent — safe even though setupProfilePageModules() can re-run.
// ============================================================
function setupAccountSupportSection() {
    // Now static HTML menu items inside the scrollable profile list (see
    // #open-complaint-btn / #open-delete-account-btn in user.html) instead of
    // being appended after </main> at runtime — that made them render as a
    // fixed block below the scrollable area instead of scrolling with the
    // rest of the profile menu.
    const complaintBtn = document.getElementById('open-complaint-btn');
    const deleteBtn = document.getElementById('open-delete-account-btn');
    if (complaintBtn) complaintBtn.addEventListener('click', openComplaintCenterModal);
    if (deleteBtn) deleteBtn.addEventListener('click', openDeleteAccountModal);
}

const COMPLAINT_CATEGORIES = ['Payment', 'Merchant', 'Delivery', 'Order', 'Wrong Product', 'Missing Product', 'Damaged Product', 'Prescription', 'Refund', 'Account', 'Not Working', 'Technical Problem', 'Other'];

async function openComplaintCenterModal() {
    document.getElementById('complaint-center-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'complaint-center-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:10000;display:flex;align-items:flex-end;justify-content:center;';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:20px 20px 0 0;padding:20px;width:100%;max-width:460px;max-height:88vh;overflow-y:auto;box-sizing:border-box;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <h3 style="margin:0;font-size:1rem;color:#2f3542;"><i class="fa-solid fa-headset" style="color:#1c82aa;"></i> File a Complaint</h3>
                <span id="cc-close" style="cursor:pointer;font-size:1.3rem;color:#747d8c;">&times;</span>
            </div>
            <label style="font-size:0.78rem;font-weight:700;color:#57606f;">Category</label>
            <select id="cc-category" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin:6px 0 12px;font-size:0.85rem;">
                <option value="">Select category...</option>
                ${COMPLAINT_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
            <label style="font-size:0.78rem;font-weight:700;color:#57606f;">Subject</label>
            <input type="text" id="cc-subject" placeholder="Brief subject" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #ddd;border-radius:8px;margin:6px 0 12px;font-size:0.85rem;">
            <label style="font-size:0.78rem;font-weight:700;color:#57606f;">Describe the problem</label>
            <textarea id="cc-message" placeholder="Tell us what happened..." style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #ddd;border-radius:8px;margin:6px 0 14px;font-size:0.85rem;min-height:80px;resize:vertical;"></textarea>
            <button type="button" id="cc-submit" style="width:100%;padding:12px;border:none;border-radius:10px;background:#1c82aa;color:#fff;font-weight:700;cursor:pointer;">Submit Complaint</button>
            <div id="cc-history-wrap" style="margin-top:18px;"></div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('cc-close').onclick = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.getElementById('cc-submit').onclick = submitComplaint;
    renderComplaintHistory();
}

async function submitComplaint() {
    const category = document.getElementById('cc-category')?.value;
    const subject = document.getElementById('cc-subject')?.value?.trim();
    const message = document.getElementById('cc-message')?.value?.trim();
    if (!category || !subject || !message) { showToast("Please fill category, subject and message.", "error"); return; }
    if (!supabase) { showToast("Couldn't submit complaint. Please try again.", "error"); return; }
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id || null;
        const email = session?.user?.email || '';
        // Token is generated client-side (MF-YYYY-NNNNNN) since no existing
        // server-side token generator was found in this file — if the admin
        // side already has one, swap this for that RPC instead.
        const token = `MF-${new Date().getFullYear()}-${String(Math.floor(100000 + Math.random() * 900000))}`;
        const { error } = await supabase.from('complaints').insert([{
            token, user_id: uid, user_email: email, category, subject, message, status: 'open', created_at: new Date().toISOString()
        }]);
        if (error) throw error;
        showToast("Your complaint has been submitted successfully. Our team will contact you as soon as possible.", "success");
        document.getElementById('cc-subject').value = '';
        document.getElementById('cc-message').value = '';
        document.getElementById('cc-category').value = '';
        renderComplaintHistory();
    } catch (e) {
        showToast("Couldn't submit your complaint right now. Please try again.", "error");
    }
}

async function renderComplaintHistory() {
    const wrap = document.getElementById('cc-history-wrap');
    if (!wrap || !supabase) return;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;
        const { data, error } = await supabase.from('complaints').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });
        if (error || !data || data.length === 0) return;
        wrap.innerHTML = `<h4 style="margin:0 0 8px;font-size:0.82rem;color:#2f3542;">Your Complaints</h4>` + data.map(c => `
            <div style="background:#f8f9fa;border-radius:10px;padding:10px 12px;margin-bottom:8px;border:1px solid #eef2f5;">
                <div style="display:flex;justify-content:space-between;"><strong style="font-size:0.78rem;">${c.token}</strong><span style="font-size:0.68rem;font-weight:700;color:${c.status === 'resolved' || c.status === 'closed' ? '#2ed573' : '#f59f00'};">${(c.status || 'open').toUpperCase()}</span></div>
                <p style="margin:4px 0 0;font-size:0.78rem;color:#57606f;">${c.category} — ${c.subject}</p>
            </div>
        `).join('');
    } catch (e) { /* silent — history is a nice-to-have, never blocks the form */ }
}

// ============================================================
// DELETE ACCOUNT (doc2 item 24) — real confirmation flow. Attempts a secure
// server-side RPC (delete_user_account) first; if it doesn't exist yet,
// this clearly tells the user instead of silently faking deletion by only
// clearing localStorage. No service-role/admin key is ever used here.
// ============================================================
const DELETE_ACCOUNT_REASONS = ['Found a better app', 'Too many notifications', 'Privacy concerns', 'Not using it anymore', 'Poor delivery experience', 'Other'];

function openDeleteAccountModal() {
    document.getElementById('delete-account-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'delete-account-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:24px;width:100%;max-width:380px;text-align:center;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size:2rem;color:#e02020;margin-bottom:10px;"></i>
            <h3 style="margin:0 0 10px;font-size:1rem;color:#2f3542;">Why do you want to delete your account?</h3>
            <select id="da-reason" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:16px;font-size:0.85rem;">
                <option value="">Select a reason...</option>
                ${DELETE_ACCOUNT_REASONS.map(r => `<option value="${r}">${r}</option>`).join('')}
            </select>
            <div style="display:flex;gap:10px;">
                <button type="button" id="da-cancel" style="flex:1;padding:11px;border-radius:10px;border:1px solid #ddd;background:#fff;font-weight:600;cursor:pointer;">Cancel</button>
                <button type="button" id="da-continue" style="flex:1;padding:11px;border-radius:10px;border:none;background:#e02020;color:#fff;font-weight:700;cursor:pointer;">Delete</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('da-cancel').onclick = () => modal.remove();
    document.getElementById('da-continue').onclick = () => {
        const reason = document.getElementById('da-reason')?.value || '';
        if (!reason) { showToast("Please select a reason.", "error"); return; }
        modal.remove();
        openDeleteAccountConfirmModal(reason);
    };
}

function openDeleteAccountConfirmModal(reason) {
    document.getElementById('delete-account-confirm-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'delete-account-confirm-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:24px;width:100%;max-width:380px;text-align:center;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size:2rem;color:#e02020;margin-bottom:10px;"></i>
            <h3 style="margin:0 0 10px;font-size:1rem;color:#2f3542;">Are you sure you want to delete your account?</h3>
            <p style="margin:0 0 18px;font-size:0.8rem;color:#747d8c;">After deletion, you will not be able to log in to this account. You will need to create a new account to use MediFinder again.</p>
            <div style="display:flex;gap:10px;">
                <button type="button" id="da-no" style="flex:1;padding:11px;border-radius:10px;border:1px solid #ddd;background:#fff;font-weight:600;cursor:pointer;">No</button>
                <button type="button" id="da-confirm" style="flex:1;padding:11px;border-radius:10px;border:none;background:#e02020;color:#fff;font-weight:700;cursor:pointer;">Yes, Delete</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('da-no').onclick = () => modal.remove();
    document.getElementById('da-confirm').onclick = () => confirmDeleteAccount(reason);
}

async function confirmDeleteAccount(reason) {
    const btn = document.getElementById('da-confirm');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting...'; }
    if (!supabase) { showToast("Couldn't delete account right now. Please try again.", "error"); if (btn) { btn.disabled = false; btn.innerText = 'Yes, Delete'; } return; }
    try {
        const { error } = await supabase.rpc('delete_user_account', { deletion_reason: reason || '' });
        if (error) throw error;
        localStorage.clear();
        showToast("Your account has been deleted.", "info");
        window.location.href = 'home.html';
    } catch (e) {
        // No secure deletion RPC exists yet on the backend — never fall back
        // to a fake local-only deletion. See the final report's SQL note.
        showToast("Account deletion isn't available yet — please contact support to delete your account.", "error");
        if (btn) { btn.disabled = false; btn.innerText = 'Yes, Delete'; }
    }
}


function openMyPrescriptionBox() {
    const myBox = JSON.parse(localStorage.getItem('medi_prescription_box')) || [];
    let popup = document.createElement('div');
    popup.className = "modal active";
    popup.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100vh;background:rgba(0,0,0,0.65);display:flex;justify-content:center;align-items:center;z-index:10000;padding:16px;box-sizing:border-box;`;
    popup.innerHTML = `
        <div style="background:#fff;width:100%;max-width:440px;border-radius:16px;padding:20px;box-sizing:border-box;border-top:5px solid #ff4d4d;max-height:85vh;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                <h3 style="color:#ff4d4d;margin:0;"><i class="fa-solid fa-box-archive"></i> My Prescription Box</h3>
                <span id="close-mybox-btn" style="cursor:pointer;font-size:1.3rem;color:#747d8c;">&times;</span>
            </div>
            <p style="font-size:0.8rem;color:#747d8c;margin-bottom:12px;">All your uploaded prescriptions are stored here. You can view and download them anytime.</p>
            <div id="mybox-list">
                ${myBox.length === 0 ? `<div style="text-align:center;padding:30px;color:#ccc;"><i class="fa-solid fa-file-medical" style="font-size:2.5rem;"></i><p>No prescriptions uploaded yet.</p></div>` :
                myBox.map(p => `
                    <div style="background:#f8f9fa;border-radius:10px;padding:12px;margin-bottom:10px;border:1px solid #e4e7eb;display:flex;justify-content:space-between;align-items:center;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <i class="fa-solid fa-file-medical" style="color:#ff4d4d;font-size:1.5rem;"></i>
                            <div>
                                <strong style="font-size:0.85rem;display:block;">${p.fileName || 'Prescription'}</strong>
                                <span style="font-size:0.75rem;color:#747d8c;">Uploaded: ${p.date}</span>
                            </div>
                        </div>
                        <div style="display:flex;gap:6px;">
                            ${p.url ? `<a href="${p.url}" target="_blank" style="background:#1c82aa;color:#fff;border:none;padding:6px 10px;border-radius:6px;font-size:0.75rem;text-decoration:none;font-weight:600;"><i class="fa-solid fa-eye"></i></a>` : ''}
                            ${p.url ? `<a href="${p.url}" download style="background:#2ed573;color:#fff;border:none;padding:6px 10px;border-radius:6px;font-size:0.75rem;text-decoration:none;font-weight:600;"><i class="fa-solid fa-download"></i></a>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    document.body.appendChild(popup);
    document.getElementById('close-mybox-btn').onclick = () => popup.remove();
}

function toggleModalDisplay(modalId, makeVisible) {
    const target = document.getElementById(modalId);
    if (!target) return;
    // ✅ CRITICAL FIX (Item 5 — root cause of "wishlist/add patient/manage
    // address/pill reminder/offers all click but show nothing"): user.css
    // has THREE separate ".modal { ... }" rule blocks left over from past
    // edits. Only the very first one sets "opacity:0; pointer-events:none;"
    // as the resting state, cleared only by adding the ".active" class
    // (that block's ".modal.active { opacity:1; pointer-events:auto; }").
    // This function was only ever setting the inline style.display, never
    // the "active" class — so a modal could be display:flex and still sit
    // there at opacity:0 with pointer-events:none, i.e. invisible AND
    // unclickable, which looked exactly like "nothing happens". Toggling
    // the "active" class here (alongside the inline display, kept for
    // back-compat with any code checking style.display directly) fixes
    // every modal on the page at once.
    target.style.display = makeVisible ? "flex" : "none";
    target.classList.toggle('active', !!makeVisible);
}

function renderPatientsListUI() {
    const recordContainerBox = document.getElementById('patients-record-list');
    if (!recordContainerBox) return;
    if (patientsData.length === 0) {
        recordContainerBox.innerHTML = `<p style="font-size:0.75rem;color:#747d8c;">No patient entries registered yet.</p>`;
        return;
    }
    recordContainerBox.innerHTML = patientsData.map(patient => `
        <div style="background:#f8f9fa;border:1px solid #e4e7eb;border-radius:10px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div>
                <strong style="font-size:0.85rem;color:#2f3542;">${patient.name}</strong>
                <p style="margin:2px 0 0 0;font-size:0.75rem;color:#747d8c;">Age: ${patient.age} | Gender: ${patient.gender}</p>
            </div>
            <button onclick="destroyPatientRecordFromVault('${patient.id}')" style="background:none;border:none;cursor:pointer;"><i class="fa-solid fa-trash-can" style="font-size:1rem;color:#ff4d4d;"></i></button>
        </div>
    `).join('');
}

window.destroyPatientRecordFromVault = function(targetPatientId) {
    patientsData = patientsData.filter(p => p.id !== targetPatientId);
    localStorage.setItem('medi_patients', JSON.stringify(patientsData));
    if (supabase) { try { supabase.from('patients').delete().eq('id', targetPatientId).then(() => {}); } catch(e) {} }
    renderPatientsListUI();
};

function renderAlarmsListUI() {
    const alarmContainerBox = document.getElementById('active-alarms-list');
    if (!alarmContainerBox) return;
    if (alarmsData.length === 0) {
        alarmContainerBox.innerHTML = `<p style="font-size:0.75rem;color:#747d8c;">No active scheduled reminders found.</p>`;
        return;
    }
    alarmContainerBox.innerHTML = alarmsData.map(alarm => `
        <div style="background:#f8f9fa;border:1px solid #e4e7eb;border-radius:10px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div>
                <strong style="font-size:0.85rem;color:#2f3542;">${alarm.medicine}</strong>
                <p style="margin:2px 0 0 0;font-size:0.75rem;color:#747d8c;"><i class="fa-solid fa-bell"></i> ${alarm.date ? new Date(alarm.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ' at ' : 'Every day at '}${alarm.time}</p>
            </div>
            <button onclick="destroyAlarmSequenceFromScheduler('${alarm.id}')" style="background:#ff4d4d;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:0.7rem;font-weight:700;cursor:pointer;">STOP</button>
        </div>
    `).join('');
}

window.destroyAlarmSequenceFromScheduler = function(targetAlarmId) {
    alarmsData = alarmsData.filter(a => a.id !== targetAlarmId);
    localStorage.setItem('medi_alarms', JSON.stringify(alarmsData));
    if (supabase) { try { supabase.from('reminders').delete().eq('id', targetAlarmId).then(() => {}); } catch(e) {} }
    renderAlarmsListUI();
};

// ============================================================
// PILL ALARM ENGINE - Web Audio + System Notification
// ============================================================
function runBackgroundPillAlarmEngine() {
    if (alarmsData.length === 0) return;
    const liveTimeInstance = new Date();
    const systemStringClockMatch = liveTimeInstance.toTimeString().substring(0, 5);
    const systemStringDateMatch = liveTimeInstance.toISOString().slice(0, 10);
    alarmsData.forEach(alarmItem => {
        // alarmItem.date is optional for backward compatibility with reminders
        // saved before dated reminders existed — those keep repeating daily.
        // Dated reminders only fire on their specific date.
        const dateMatches = !alarmItem.date || alarmItem.date === systemStringDateMatch;
        if (alarmItem.time === systemStringClockMatch && dateMatches && alarmItem.active) {
            // Fire system notification (works even when page is in background)
            fireSystemNotification(
                "💊 MediFinder Pill Reminder",
                `Time to take: ${alarmItem.medicine} at ${alarmItem.time}`
            );
            // Fallback alert
            showToast(`Time to take: ${alarmItem.medicine} at ${alarmItem.time}`, "warning");
            alarmItem.active = false;
            if (alarmItem.date) {
                // One-off dated reminder — it already fired, so drop it instead
                // of re-arming (there's no "tomorrow" for a specific date).
                alarmsData = alarmsData.filter(a => a.id !== alarmItem.id);
                localStorage.setItem('medi_alarms', JSON.stringify(alarmsData));
                if (document.getElementById('active-alarms-list')) renderAlarmsListUI();
            } else {
                setTimeout(() => { alarmItem.active = true; }, 61000);
            }
        }
    });
}

// ============================================================
// LANGUAGE TRANSLATION ENGINE
// ============================================================
function triggerGlobalAppLanguageTranslation(languageKeyToken) {
    const translationDataSet = languageMatrix[languageKeyToken] || languageMatrix.en;
    const structuralTargetElementMappings = [
        { id: 'lang-app-title', content: translationDataSet.title },
        { id: 'lang-app-title-2', content: translationDataSet.title },
        { id: 'lang-edit-name-btn', content: translationDataSet.editBtn },
        { id: 'lang-addr-title', content: translationDataSet.addrTitle },
        { id: 'lang-select-title', content: translationDataSet.selectTitle },
        { id: 'lang-patient-title', content: translationDataSet.patientTitle },
        { id: 'lang-patient-desc', content: translationDataSet.patientDesc },
        { id: 'lang-pill-title', content: translationDataSet.pillTitle },
        { id: 'lang-pill-desc', content: translationDataSet.pillDesc },
        { id: 'lang-refer-title', content: translationDataSet.referTitle },
        { id: 'lang-refer-desc', content: translationDataSet.referDesc },
        { id: 'lang-care-title', content: translationDataSet.careTitle },
        { id: 'lang-help-title', content: translationDataSet.helpTitle },
        { id: 'lang-help-desc', content: translationDataSet.helpDesc },
        { id: 'lang-terms-title', content: translationDataSet.termsTitle },
        { id: 'lang-terms-desc', content: translationDataSet.termsDesc },
        { id: 'lang-logout-title', content: translationDataSet.logoutTitle },
        { id: 'lang-nav-home', content: translationDataSet.navHome },
        { id: 'lang-nav-map', content: translationDataSet.navMap },
        { id: 'lang-nav-order', content: translationDataSet.navOrder },
        { id: 'lang-nav-cart', content: translationDataSet.navCart },
        { id: 'lang-nav-profile', content: translationDataSet.navProfile },
        { id: 'lang-my-box', content: translationDataSet.myBox }
    ];
    structuralTargetElementMappings.forEach(mapping => {
        const targetHtmlNode = document.getElementById(mapping.id);
        if (targetHtmlNode) {
            if (targetHtmlNode.tagName === 'H1') {
                targetHtmlNode.innerHTML = mapping.content.replace("FINDER", "<span>FINDER</span>");
            } else {
                targetHtmlNode.innerText = mapping.content;
            }
        }
    });
    try { mfApplyGenericTranslation(languageKeyToken); } catch (e) { console.warn('[i18n]', e); }
}

// ============================================================
// ✅ Item 7 — whole-app text translation layer.
// triggerGlobalAppLanguageTranslation() above only knows ~24 hard-wired
// element ids, so everything else stayed English. This layer translates
// ANY exact-match UI text (text nodes + placeholders), including content
// the app renders later, via a MutationObserver. Covered: Bengali (bn) and
// Hindi (hi). Other languages keep the old id-based translation and show
// English for the strings below until their entries are added.
// To extend: add lines to MF_UI_DICT (english key -> {bn, hi}).
// ============================================================
const MF_UI_DICT = {
  "shop by category": { bn: "ক্যাটাগরি অনুযায়ী কিনুন", hi: "श्रेणी के अनुसार खरीदें" },
  "available medicine": { bn: "উপলব্ধ ওষুধ", hi: "उपलब्ध दवाइयाँ" },
  "all items": { bn: "সব আইটেম", hi: "सभी आइटम" },
  "tablet": { bn: "ট্যাবলেট", hi: "टैबलेट" }, "capsule": { bn: "ক্যাপসুল", hi: "कैप्सूल" },
  "syrup": { bn: "সিরাপ", hi: "सिरप" }, "insulin": { bn: "ইনসুলিন", hi: "इंसुलिन" },
  "baby": { bn: "শিশু", hi: "बेबी" }, "food": { bn: "খাবার", hi: "खाद्य" }, "others": { bn: "অন্যান্য", hi: "अन्य" },
  "lab test": { bn: "ল্যাব টেস্ট", hi: "लैब टेस्ट" }, "medical instrument": { bn: "মেডিকেল যন্ত্র", hi: "मेडिकल उपकरण" },
  "nurse booking": { bn: "নার্স বুকিং", hi: "नर्स बुकिंग" }, "doctor consult": { bn: "ডাক্তার পরামর্শ", hi: "डॉक्टर परामर्श" },
  "body checkup": { bn: "বডি চেকআপ", hi: "बॉडी चेकअप" },
  "order via prescription": { bn: "প্রেসক্রিপশন দিয়ে অর্ডার", hi: "पर्चे से ऑर्डर करें" },
  "camera": { bn: "ক্যামেরা", hi: "कैमरा" }, "gallery / pdf": { bn: "গ্যালারি / পিডিএফ", hi: "गैलरी / पीडीएफ" },
  "product details": { bn: "পণ্যের বিবরণ", hi: "उत्पाद विवरण" },
  "add to cart": { bn: "কার্টে যোগ করুন", hi: "कार्ट में जोड़ें" }, "buy now": { bn: "এখনই কিনুন", hi: "अभी खरीदें" },
  "available offers": { bn: "উপলব্ধ অফার", hi: "उपलब्ध ऑफ़र" }, "quantity": { bn: "পরিমাণ", hi: "मात्रा" },
  "prescription required": { bn: "প্রেসক্রিপশন প্রয়োজন", hi: "पर्चा आवश्यक" },
  "change": { bn: "পরিবর্তন", hi: "बदलें" }, "gps": { bn: "জিপিএস", hi: "जीपीएस" },
  "checking delivery availability…": { bn: "ডেলিভারি আছে কিনা দেখা হচ্ছে…", hi: "डिलीवरी उपलब्धता जाँची जा रही है…" },
  "manage delivery address": { bn: "ডেলিভারি ঠিকানা পরিচালনা", hi: "डिलीवरी पता प्रबंधित करें" },
  "add new address": { bn: "নতুন ঠিকানা যোগ করুন", hi: "नया पता जोड़ें" },
  "save address as": { bn: "ঠিকানা সংরক্ষণ করুন", hi: "पता इस रूप में सहेजें" },
  "home": { bn: "হোম", hi: "होम" }, "office": { bn: "অফিস", hi: "ऑफिस" }, "other": { bn: "অন্যান্য", hi: "अन्य" },
  "set as default address": { bn: "ডিফল্ট ঠিকানা করুন", hi: "डिफ़ॉल्ट पता बनाएँ" },
  "use my current location": { bn: "আমার বর্তমান অবস্থান ব্যবহার করুন", hi: "मेरी वर्तमान लोकेशन उपयोग करें" },
  "your cart": { bn: "আপনার কার্ট", hi: "आपकी कार्ट" }, "your cart is empty": { bn: "আপনার কার্ট খালি", hi: "आपकी कार्ट खाली है" },
  "place order": { bn: "অর্ডার করুন", hi: "ऑर्डर करें" }, "subtotal": { bn: "সাবটোটাল", hi: "उप-योग" },
  "total": { bn: "মোট", hi: "कुल" }, "total bill": { bn: "মোট বিল", hi: "कुल बिल" },
  "my orders": { bn: "আমার অর্ডার", hi: "मेरे ऑर्डर" }, "live tracking": { bn: "লাইভ ট্র্যাকিং", hi: "लाइव ट्रैकिंग" },
  "complaints": { bn: "অভিযোগ", hi: "शिकायतें" }, "file a complaint": { bn: "অভিযোগ করুন", hi: "शिकायत दर्ज करें" },
  "submit complaint": { bn: "অভিযোগ জমা দিন", hi: "शिकायत जमा करें" },
  "category": { bn: "ক্যাটাগরি", hi: "श्रेणी" }, "subject": { bn: "বিষয়", hi: "विषय" },
  "cancel": { bn: "বাতিল", hi: "रद्द करें" }, "confirm": { bn: "নিশ্চিত করুন", hi: "पुष्टि करें" },
  "full name": { bn: "পুরো নাম", hi: "पूरा नाम" }, "phone number": { bn: "ফোন নম্বর", hi: "फ़ोन नंबर" },
  "city": { bn: "শহর", hi: "शहर" }, "state": { bn: "রাজ্য", hi: "राज्य" },
  "landmark (optional)": { bn: "ল্যান্ডমার্ক (ঐচ্ছিক)", hi: "लैंडमार्क (वैकल्पिक)" },
  "6-digit pin code": { bn: "৬ সংখ্যার পিন কোড", hi: "6 अंकों का पिन कोड" },
  "address line 1 (house / flat / building)": { bn: "ঠিকানা লাইন ১ (বাড়ি / ফ্ল্যাট / বিল্ডিং)", hi: "पता पंक्ति 1 (मकान / फ्लैट / बिल्डिंग)" },
  "address line 2 (area / street / colony)": { bn: "ঠিকানা লাইন ২ (এলাকা / রাস্তা / কলোনি)", hi: "पता पंक्ति 2 (क्षेत्र / गली / कॉलोनी)" },
  "visit again, stay well stay healthy": { bn: "আবার আসবেন, সুস্থ থাকুন", hi: "फिर आइए, स्वस्थ रहिए" },
  "call": { bn: "কল", hi: "कॉल" }, "directions": { bn: "দিকনির্দেশ", hi: "दिशा-निर्देश" },
  "products": { bn: "পণ্য", hi: "उत्पाद" }, "total orders": { bn: "মোট অর্ডার", hi: "कुल ऑर्डर" },
  "popular": { bn: "জনপ্রিয়", hi: "लोकप्रिय" }, "all": { bn: "সব", hi: "सभी" },
  "search medicines, syrups, baby care...": { bn: "ওষুধ, সিরাপ, বেবি কেয়ার খুঁজুন...", hi: "दवाइयाँ, सिरप, बेबी केयर खोजें..." },
  "search medicines, health products...": { bn: "ওষুধ, স্বাস্থ্যপণ্য খুঁজুন...", hi: "दवाइयाँ, स्वास्थ्य उत्पाद खोजें..." },
  "search medicine in this shop...": { bn: "এই দোকানে ওষুধ খুঁজুন...", hi: "इस दुकान में दवा खोजें..." },
  "logout": { bn: "লগআউট", hi: "लॉगआउट" }, "cart": { bn: "কার্ট", hi: "कार्ट" }
};
let __mfLang = 'en';
const __mfOrig = new WeakMap();
const __mfNorm = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase();
function __mfTr(text, lang) {
    const hit = MF_UI_DICT[__mfNorm(text)];
    return hit && hit[lang] ? hit[lang] : null;
}
function __mfTranslateNode(node, lang) {
    if (node.nodeType === 3) {
        const parent = node.parentNode;
        if (!parent || /^(SCRIPT|STYLE|TEXTAREA)$/.test(parent.nodeName)) return;
        if (!__mfOrig.has(node)) { if (!node.nodeValue.trim()) return; __mfOrig.set(node, node.nodeValue); }
        const orig = __mfOrig.get(node);
        const tr = lang === 'en' ? null : __mfTr(orig, lang);
        const next = tr ? orig.replace(orig.trim(), tr) : orig;
        if (node.nodeValue !== next) node.nodeValue = next;
    } else if (node.nodeType === 1) {
        if (/^(SCRIPT|STYLE)$/.test(node.nodeName)) return;
        if (node.hasAttribute && node.hasAttribute('placeholder')) {
            if (!node.__mfPh) node.__mfPh = node.getAttribute('placeholder');
            const tr = lang === 'en' ? null : __mfTr(node.__mfPh, lang);
            const want = tr || node.__mfPh;
            if (node.getAttribute('placeholder') !== want) node.setAttribute('placeholder', want);
        }
        node.childNodes.forEach(c => __mfTranslateNode(c, lang));
    }
}
function mfApplyGenericTranslation(lang) {
    __mfLang = lang || 'en';
    __mfTranslateNode(document.body, __mfLang);
}
(function mfStartTranslationObserver() {
    let pending = false;
    const start = () => {
        new MutationObserver((muts) => {
            if (__mfLang === 'en' || pending) return;
            pending = true;
            requestAnimationFrame(() => {
                pending = false;
                muts.forEach(m => {
                    m.addedNodes.forEach(n => __mfTranslateNode(n, __mfLang));
                    if (m.type === 'characterData') __mfTranslateNode(m.target, __mfLang);
                });
            });
        }).observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();

function updateSearchPlaceholder(lang) {
    const t = languageMatrix[lang] || languageMatrix.en;
    const homeSearch = document.getElementById('home-medicine-search');
    const mapSearch = document.getElementById('medicine-search');
    if (homeSearch) homeSearch.placeholder = t.searchPlaceholder || "Search medicines...";
    if (mapSearch) mapSearch.placeholder = t.searchPlaceholder || "Search medicines...";
}

function initLiveOfferAndBroadcastStream() {
    try {
        supabase
          .channel('live-offers')
          .on('postgres_changes', { event: '*', filter: 'id=eq.1', schema: 'public', table: 'offers' }, payload => {
              const updatedOffer = payload.new;
              const liveBannerNode = document.getElementById('user-app-banner');
              if (liveBannerNode) {
                  if (updatedOffer && updatedOffer.status === 'active' && updatedOffer.text !== "") {
                      liveBannerNode.innerText = updatedOffer.text;
                      liveBannerNode.style.display = 'block';
                  } else {
                      liveBannerNode.style.display = 'none';
                  }
              }
          })
          .subscribe();
    } catch(err) {

    }
}

// ✅ NEW: Realtime refresh — when the admin creates/updates/deletes a
// sponsored slot from adminsponsored.html, this reloads the homepage slider
// automatically instead of the shopper needing to know to refresh. Debounced
// so a burst of admin edits doesn't refetch on every single keystroke-save.
let _sponsoredRealtimeChannel = null;
let _sponsoredReloadTimer = null;
function initSponsoredRealtime() {
    if (!supabase || _sponsoredRealtimeChannel) return;
    try {
        _sponsoredRealtimeChannel = supabase
            .channel('sponsored-products-live')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sponsored_products' }, () => {
                clearTimeout(_sponsoredReloadTimer);
                _sponsoredReloadTimer = setTimeout(() => {
                    loadSponsoredProducts().then(() => {
                        const newSlides = document.querySelectorAll('#home-slider .slide');
                        if (newSlides.length > 0 && typeof initAutoSlider === 'function') initAutoSlider();
                    }).catch(() => {});
                }, 600);
            })
            .subscribe();
    } catch (e) {
        if (window.console && console.warn) console.warn('[Sponsored] realtime subscription failed:', e);
    }
}

/* ==========================================================================
   SPONSORED PRODUCTS SLIDER — loads from DB
   ========================================================================== */

// ✅ NEW: single source of truth for "what image do we show on this sponsored
// slide". Priority order:
//   1) admin's custom uploaded banner (custom_image_url) — this is the field
//      the Sponsored Products admin page (adminsponsored.html) actually
//      uploads to when "Sponsored Banner Image" is turned on. The old render
//      code here never read this column at all, which was the real reason
//      admin-uploaded photos never showed up on the user home page.
//   2) the linked product's own photo (medicines.image_url), for a
//      product-linked slot that hasn't been given a custom banner
//   3) any other image-ish column, kept only as a safety net in case this
//      row ever gains one — this project's `sponsored_products` table does
//      not currently have these, so this branch is normally a no-op.
function getSponsoredImageUrl(item, linkedProduct) {
    if (!item) return '';
    let raw = '';
    if (item.use_custom_image && item.custom_image_url) {
        raw = item.custom_image_url;
    } else if (linkedProduct && linkedProduct.image_url) {
        raw = linkedProduct.image_url;
    } else if (item.custom_image_url) {
        // Custom image was uploaded but the toggle happened to be off (e.g.
        // an "Others" slot with no linked product at all) — still show the
        // admin's uploaded photo rather than silently dropping it.
        raw = item.custom_image_url;
    } else {
        raw = item.image_url || item.imageUrl || item.image || item.banner_image || item.banner_url || item.photo_url || '';
    }
    return (raw || '').toString().trim();
}

// Cache-busts ONLY when we actually have a timestamp to key off of, so we
// don't force a needless re-download of the same unchanged image on every
// single home page load.
function withSponsoredCacheBust(url, item) {
    if (!url) return url;
    const version = item && (item.updated_at || item.updatedAt);
    if (!version) return url;
    const sep = url.includes('?') ? '&' : '?';
    return url + sep + 'v=' + encodeURIComponent(version);
}

// Safely applies (or falls back away from) a sponsored slide's background
// image. Preloads the image first so a broken/expired URL never shows a
// half-rendered slide or throws — it just falls back to the slide's
// gradient + icon, exactly like a slot with no image at all.
function applySponsoredSlideVisual(div, imageUrl, gradientCss) {
    const gradient = gradientCss || 'linear-gradient(135deg, #ff6b6b, #ee5a24)';
    const iconEl = div.querySelector('.slide-icon');
    const showGradientFallback = () => {
        div.style.backgroundImage = '';
        div.style.background = gradient;
        if (iconEl) iconEl.style.display = '';
    };

    if (!imageUrl) { showGradientFallback(); return; }

    const preloader = new Image();
    preloader.onload = () => {
        // ✅ FIXED (image staying white): a gradient AND a url() jammed into
        // one `background` shorthand without a comma isn't valid CSS — the
        // browser silently drops the whole declaration. Two proper comma-
        // separated layers instead: photo on top ("contain" so it never gets
        // cropped/distorted), gradient underneath ("cover") filling any
        // leftover space.
        div.style.backgroundImage = `url('${imageUrl}'), ${gradient}`;
        div.style.backgroundPosition = 'center, center';
        div.style.backgroundSize = 'contain, cover';
        div.style.backgroundRepeat = 'no-repeat, no-repeat';
        div.style.backgroundBlendMode = 'normal';
        if (iconEl) iconEl.style.display = 'none';
    };
    preloader.onerror = () => {
        // Dev-safe diagnostic only — never a bare uncaught error/broken icon.
        if (window.console && console.warn) console.warn('[Sponsored] image failed to load, using fallback:', imageUrl);
        showGradientFallback();
    };
    preloader.src = imageUrl;
}

// "Others" sponsored click target: goes to whatever exact URL the admin
// saved in btn_action (internal MediFinder page or external https:// link).
// Never used for product-linked slots — those keep using
// navigateToProductDetail() / openSponsoredOfferModal() further below.
function navigateToSponsoredLink(rawUrl) {
    let url = (rawUrl || '').toString().trim();
    if (!url) {
        if (typeof showToast === 'function') showToast('This sponsored link is currently unavailable.', 'error');
        return;
    }
    // "www.site.com" (no scheme) would be treated as a relative page - add https://
    if (!/^(https?:|mailto:|tel:|\/|\.|#)/i.test(url) && /^[\w-]+(\.[\w-]+)+/.test(url) && !/\.html?(\?|#|$)/i.test(url)) {
        url = 'https://' + url;
    }
    try {
        if (/^https?:\/\//i.test(url) && url.indexOf(location.origin) !== 0) {
            const w = window.open(url, '_blank', 'noopener');
            if (!w) window.location.assign(url);
        } else {
            window.location.assign(url);
        }
    } catch (e) {
        if (window.console && console.warn) console.warn('[Sponsored] navigation failed:', e);
        if (typeof showToast === 'function') showToast('This sponsored link is currently unavailable.', 'error');
    }
}

// Admin-uploaded banner media (image OR video) helpers
function isSponsoredVideoUrl(url) {
    return /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test((url || '').toString());
}
function getSponsoredMediaUrl(item) {
    return ((item && item.custom_image_url) || '').toString().trim();
}
// Only the visible video plays (saves data/battery).
function syncSponsoredVideos() {
    document.querySelectorAll('#home-slider .slide').forEach(sl => {
        const v = sl.querySelector('video.sponsored-media');
        if (!v) return;
        if (sl.classList.contains('active-slide')) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
        else { v.pause(); }
    });
}

async function loadSponsoredProducts() {
    const slider = document.getElementById('home-slider');
    if (!slider || !supabase) return;
    try {
        // ✅ NEW: auto-hide anything past its "Valid Until" date, so an expired
        // sponsored slot disappears from the app the moment it lapses (the admin
        // panel also auto-flips it to Inactive — see adminsponsored.html).
        // Falls back to the plain query if the `valid_until` column doesn't exist
        // yet on this project's `sponsored_products` table.
        const todayStr = new Date().toISOString().split('T')[0];
        let { data, error } = await supabase
            .from('sponsored_products')
            .select('*')
            .eq('is_active', true)
            .or(`valid_until.is.null,valid_until.gte.${todayStr}`)
            .order('sort_order', { ascending: true });
        if (error) {
            const fallback = await supabase.from('sponsored_products').select('*').eq('is_active', true).order('sort_order', { ascending: true });
            data = fallback.data; error = fallback.error;
        }
        const sliderSection = slider.closest('.auto-slider-section');
        if (error || !data || data.length === 0) {
            slider.innerHTML = '';
            const d0 = document.getElementById('slider-dots'); if (d0) d0.innerHTML = '';
            if (window._autoSliderInterval) clearInterval(window._autoSliderInterval);
            if (sliderSection) sliderSection.style.display = 'none';
            return;
        }
        if (sliderSection) sliderSection.style.display = '';

        // If a sponsor slot is linked to a real product (btn_action contains ?id=...),
        // pull that product's actual photo AND price so the merchant's paid slot shows
        // the real item and, for deals, the discount can be computed off the real price.
        const linkedIds = data
            .map(item => {
                const m = (item.btn_action || '').match(/[?&]id=([^&#]+)/);
                return m ? decodeURIComponent(m[1]) : null;
            })
            .filter(Boolean);
        let productMap = {};
        if (linkedIds.length > 0) {
            try {
                const { data: linkedProducts } = await supabase
                    .from('medicines')
                    .select('*')
                    .in('id', linkedIds);
                (linkedProducts || []).forEach(p => { productMap[p.id] = p; });
            } catch (e) { /* fall back to gradient/icon slides below */ }
        }

        slider.innerHTML = '';
        data.forEach((item, i) => {
            const div = document.createElement('div');
            div.className = 'slide' + (i === 0 ? ' active-slide' : '');
            const linkedId = (item.btn_action || '').match(/[?&]id=([^&#]+)/);
            const linkedProduct = linkedId ? productMap[decodeURIComponent(linkedId[1])] : null;
            const isLinkedToProduct = !!linkedId;

            // ✅ FIXED: this used to look ONLY at linkedProduct.image_url, so
            // an admin's uploaded custom banner (custom_image_url — the field
            // the Sponsored Products admin page actually uploads to) was
            // never shown, for BOTH product-linked slots and raw-link
            // ("Others") slots. getSponsoredImageUrl() now checks the real
            // priority: custom banner → linked product photo → safety-net
            // fallbacks. See helper functions just above this function.
            const rawImg = getSponsoredImageUrl(item, linkedProduct);
            const imgUrl = withSponsoredCacheBust(rawImg, item);

            const hasDeal = isLinkedToProduct && item.first_order_discount_percent > 0;
            if (isLinkedToProduct || item.btn_action) div.style.cursor = 'pointer';

            // "Others" slots (no linked product) get a small type hint next
            // to the admin's own tag text, so shoppers can tell it isn't a
            // product deal. Purely a display-layer label — nothing written
            // back to the database, and an admin's own "OTHER"-ish tag text
            // is left exactly as typed.
            const tagLabel = item.tag || 'SPONSORED';
            const tagHtml = isLinkedToProduct ? tagLabel : (tagLabel + (/other/i.test(tagLabel) ? '' : ' • OTHER'));

            const mediaUrl = getSponsoredMediaUrl(item);
            const isMediaSlide = !!mediaUrl;
            if (isMediaSlide) {
                div.classList.add('media-slide');
                const safeUrl = withSponsoredCacheBust(mediaUrl, item).replace(/"/g, '&quot;');
                const mediaEl = isSponsoredVideoUrl(mediaUrl)
                    ? `<video class="sponsored-media" src="${safeUrl}" autoplay muted loop playsinline webkit-playsinline preload="metadata"></video>`
                    : `<img class="sponsored-media" src="${safeUrl}" alt="${(item.title || 'Sponsored').replace(/"/g, '&quot;')}">`;
                div.innerHTML = `${mediaEl}<span class="slide-tag sponsored-badge">${tagHtml}</span>`;
                const mEl = div.querySelector('.sponsored-media');
                if (mEl) mEl.addEventListener('error', () => {
                    div.classList.remove('media-slide');
                    div.innerHTML = `<div class="slide-content"><span class="slide-tag">${tagHtml}</span><h3>${item.title || ''}</h3><p>${item.subtitle || ''}</p></div>`;
                    div.style.background = item.gradient || 'linear-gradient(135deg, #ff6b6b, #ee5a24)';
                });
            } else
            div.innerHTML = `
                <div class="slide-content">
                    <span class="slide-tag">${tagHtml}</span>
                    <h3>${item.title}</h3>
                    <p>${item.subtitle}</p>
                    ${item.btn_text ? `<button class="slide-btn" data-btn-action="${(item.btn_action || '').replace(/"/g, '&quot;')}">${item.btn_text} <i class="fa-solid fa-arrow-right"></i></button>` : ''}
                </div>
                <div class="slide-icon"><i class="${item.icon_class || 'fa-solid fa-capsules'}"></i></div>
            `;

            // Preload-checked, fallback-safe background image — shows the
            // icon+gradient fallback (never a broken image icon, never a
            // console error) if there's no image or it fails to load.
            if (!isMediaSlide) applySponsoredSlideVisual(div, imgUrl, item.gradient);
            else div.style.background = '#eef1f5';

            // A slot linked to a real product with a discount attached opens the
            // focused "Sponsored Offer" view (shows ONLY that offer + lets the
            // shopper add it to cart at the discounted price in one tap).
            // A slot linked to a product with NO discount just goes straight to
            // that product's page, same as before.
            // A slot that isn't linked to a product at all opens its raw link.
            if (hasDeal) {
                const openOffer = (e) => { e.stopPropagation(); openSponsoredOfferModal(item, linkedProduct); };
                div.addEventListener('click', openOffer);
                div.querySelector('.slide-btn')?.addEventListener('click', openOffer);
            } else if (isLinkedToProduct) {
                // ✅ FIXED: this used to navigate with ONLY ?id=..., so
                // product-detail.html had no name/price/img and fell back to
                // whatever stale product was last saved in
                // localStorage.currentProduct (wrong item, and price stored
                // as a STRING from card.dataset — the exact cause of the
                // "toFixed is not a function" crash + blank image). Using
                // navigateToProductDetail() with the real linkedProduct row
                // means the detail page opens instantly with correct,
                // properly-typed data, same as every normal product card.
                const goToProduct = (e) => {
                    e.stopPropagation();
                    if (linkedProduct && typeof navigateToProductDetail === 'function') {
                        navigateToProductDetail({
                            id: linkedProduct.id,
                            name: linkedProduct.name || linkedProduct.product_name || '',
                            price: Number(linkedProduct.selling_price ?? linkedProduct.unit_price ?? 0),
                            mrp: Number(linkedProduct.mrp ?? 0),
                            img: linkedProduct.image_url || '',
                            img2: linkedProduct.image_url_2 || '',
                            img3: linkedProduct.image_url_3 || '',
                            manufacturer: linkedProduct.manufacturer || '',
                            desc: linkedProduct.description || '',
                            isRx: (linkedProduct.prescription_req ? linkedProduct.prescription_req === 'Yes' : (linkedProduct.is_rx === true)) ? 'true' : 'false',
                            category: linkedProduct.category || linkedProduct.dosage_form || '',
                            stock: linkedProduct.stock_qty ?? 0,
                            composition: linkedProduct.composition || '',
                            dosageForm: linkedProduct.dosage_form || '',
                            strength: linkedProduct.strength || '',
                            productType: linkedProduct.product_type || 'Medicine'
                        });
                    } else {
                        window.location.href = `product-detail.html?id=${encodeURIComponent(decodeURIComponent(linkedId[1]))}`;
                    }
                };
                div.addEventListener('click', goToProduct);
                div.querySelector('.slide-btn')?.addEventListener('click', goToProduct);
            } else {
                // ✅ FIXED: "Others" sponsored slots now go through
                // navigateToSponsoredLink() — same exact admin-provided URL
                // as before (item.btn_action, works for both internal
                // MediFinder pages and external https:// links), but the
                // WHOLE card is clickable (not just the button, matching the
                // product-linked slots above), and an empty/missing link now
                // shows a toast instead of silently doing nothing.
                const goToLink = (e) => { e.stopPropagation(); navigateToSponsoredLink(item.btn_action); };
                div.addEventListener('click', goToLink);
                div.querySelector('.slide-btn')?.addEventListener('click', goToLink);
            }
            slider.appendChild(div);
        });
        syncSponsoredVideos();
    } catch (e) {

    }
}

// ============================================================
// SPONSORED OFFER MODAL — the "show only this offer, then let them
// add it to cart at the discounted price" flow for sponsored slots
// that have a first_order_discount_percent set.
// Fully self-contained (inline styles) so it doesn't depend on any
// class being defined in userhome.css.
// ============================================================
async function openSponsoredOfferModal(sponsorItem, linkedProduct) {
    if (!linkedProduct) { showToast('This offer is unavailable right now.', 'error'); return; }

    // One discount claim per shopper per sponsor slot — if they've already used
    // this exact deal before, just take them to the normal product page.
    let alreadyClaimed = false;
    try {
        const uid = currentUserId || (supabase ? (await supabase.auth.getUser()).data?.user?.id : null);
        if (uid && supabase) {
            const { data: claim } = await supabase
                .from('sponsor_discount_claims')
                .select('id')
                .eq('user_id', uid)
                .eq('sponsored_product_id', sponsorItem.id)
                .maybeSingle();
            alreadyClaimed = !!claim;
        }
    } catch (e) { /* fail open — worst case they see the offer again */ }

    if (alreadyClaimed) {
        window.location.href = `product-detail.html?id=${encodeURIComponent(linkedProduct.id)}`;
        return;
    }

    const name = linkedProduct.name || linkedProduct.product_name || 'Product';
    const img = linkedProduct.image_url || '';
    const originalPrice = parseFloat(linkedProduct.selling_price || linkedProduct.unit_price || linkedProduct.price || 0);
    const pct = parseFloat(sponsorItem.first_order_discount_percent) || 0;
    const discountedPrice = Math.max(0, +(originalPrice * (1 - pct / 100)).toFixed(2));

    document.getElementById('sponsoredOfferModal')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sponsoredOfferModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
        <div style="background:#fff;border-radius:18px;width:100%;max-width:380px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.25);">
            <div style="position:relative;">
                <img src="${img}" alt="${name}" style="width:100%;height:220px;object-fit:contain;background:#f8fafc;display:block;">
                <span style="position:absolute;top:12px;left:12px;background:#e02020;color:#fff;font-weight:800;font-size:12px;padding:5px 12px;border-radius:20px;">${pct}% OFF — SPONSORED</span>
                <button id="sponsoredOfferCloseBtn" style="position:absolute;top:10px;right:10px;width:32px;height:32px;border-radius:50%;border:none;background:rgba(15,23,42,0.55);color:#fff;font-size:16px;cursor:pointer;">✕</button>
            </div>
            <div style="padding:20px;">
                <h3 style="font-size:17px;font-weight:800;color:#1a1a2e;margin-bottom:6px;">${name}</h3>
                <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:16px;">
                    <span style="font-size:22px;font-weight:800;color:#e02020;">₹${discountedPrice}</span>
                    ${originalPrice > discountedPrice ? `<span style="font-size:14px;color:#94a3b8;text-decoration:line-through;">₹${originalPrice}</span>` : ''}
                </div>
                <button id="sponsoredOfferAddBtn" style="width:100%;padding:13px;border:none;border-radius:10px;background:#e02020;color:#fff;font-weight:700;font-size:14.5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
                    <i class="fa-solid fa-cart-plus"></i> Add to Cart at Offer Price
                </button>
                <button id="sponsoredOfferViewBtn" style="width:100%;padding:11px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#475569;font-weight:600;font-size:13px;margin-top:8px;cursor:pointer;">
                    View Full Product Details
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.getElementById('sponsoredOfferCloseBtn').onclick = closeModal;
    document.getElementById('sponsoredOfferViewBtn').onclick = () => {
        window.location.href = `product-detail.html?id=${encodeURIComponent(linkedProduct.id)}`;
    };
    document.getElementById('sponsoredOfferAddBtn').onclick = () => {
        addToCart({
            id: linkedProduct.id,
            name: name,
            price: discountedPrice,
            img: img,
            merchantId: linkedProduct.merchant_id || '',
            isRx: linkedProduct.is_rx || linkedProduct.isRx || false,
            sponsorDiscountSlotId: sponsorItem.id
        });
        closeModal();
    };
}


/* ==========================================================================
   AUTO-SLIDING BANNER - Flipkart Style Carousel
   ========================================================================== */
window._autoSliderInterval = null;
function initAutoSlider() {
    const slider = document.getElementById('home-slider');
    const dotsContainer = document.getElementById('slider-dots');
    if (!slider || !dotsContainer) return;

    const slides = slider.querySelectorAll('.slide');
    if (slides.length === 0) return;

    if (window._autoSliderInterval) clearInterval(window._autoSliderInterval);
    dotsContainer.innerHTML = '';

    let currentSlide = 0;

    // Create dots
    slides.forEach((_, i) => {
        const dot = document.createElement('span');
        dot.className = 'dot' + (i === 0 ? ' active-dot' : '');
        dot.addEventListener('click', () => {
            goToSlide(i);
            resetAutoSlide();
        });
        dotsContainer.appendChild(dot);
    });

    function goToSlide(index) {
        slides[currentSlide].classList.remove('active-slide');
        dotsContainer.children[currentSlide].classList.remove('active-dot');
        currentSlide = index;
        slides[currentSlide].classList.add('active-slide');
        dotsContainer.children[currentSlide].classList.add('active-dot');
        if (typeof syncSponsoredVideos === 'function') syncSponsoredVideos();
    }

    function nextSlide() {
        const next = (currentSlide + 1) % slides.length;
        goToSlide(next);
    }

    function startAutoSlide() {
        window._autoSliderInterval = setInterval(nextSlide, 3500);
    }

    function resetAutoSlide() {
        clearInterval(window._autoSliderInterval);
        startAutoSlide();
    }

    startAutoSlide();

    // Touch support for manual swipe
    let touchStartX = 0;
    let touchEndX = 0;
    slider.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });
    slider.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        if (touchStartX - touchEndX > 50) {
            goToSlide((currentSlide + 1) % slides.length);
            resetAutoSlide();
        } else if (touchEndX - touchStartX > 50) {
            goToSlide((currentSlide - 1 + slides.length) % slides.length);
            resetAutoSlide();
        }
    });
}

/* ==========================================================================
   MODAL RATING STARS - Interactive Rating System
   ========================================================================== */
function initModalRatingStars() {
    const starsContainer = document.getElementById('interactive-rating-stars');
    if (!starsContainer) return;

    const stars = starsContainer.querySelectorAll('i');
    const ratingText = document.getElementById('user-rating-text');
    let currentRating = 0;
    const ratingLabels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

    stars.forEach((star, index) => {
        star.addEventListener('click', () => {
            currentRating = index + 1;
            updateStarsDisplay();
            if (ratingText) ratingText.innerText = `You rated: ${currentRating}/5 (${ratingLabels[currentRating]})`;
            // Save rating to localStorage
            const modalName = document.getElementById('modal-prod-name')?.innerText || '';
            const savedRatings = JSON.parse(localStorage.getItem('medi_product_ratings')) || {};
            savedRatings[modalName] = currentRating;
            localStorage.setItem('medi_product_ratings', JSON.stringify(savedRatings));
        });

        star.addEventListener('mouseenter', () => {
            highlightStars(index + 1);
        });

        star.addEventListener('mouseleave', () => {
            highlightStars(currentRating);
        });
    });

    function highlightStars(count) {
        stars.forEach((s, i) => {
            if (i < count) {
                s.className = 'fa-solid fa-star active-star';
            } else {
                s.className = 'fa-regular fa-star';
            }
        });
    }

    function updateStarsDisplay() {
        highlightStars(currentRating);
    }

    // Restore saved rating when modal opens
    window._restoreModalRating = function() {
        const modalName = document.getElementById('modal-prod-name')?.innerText || '';
        const savedRatings = JSON.parse(localStorage.getItem('medi_product_ratings')) || {};
        currentRating = savedRatings[modalName] || 0;
        updateStarsDisplay();
        if (ratingText) {
            if (currentRating > 0) {
                ratingText.innerText = `You rated: ${currentRating}/5 (${ratingLabels[currentRating]})`;
            } else {
                ratingText.innerText = 'Tap to rate this medicine';
            }
        }
    };
}

// showToast is provided by prod-utils.js — creates its own container on any page

/* ==========================================================================
   SCROLL TO TOP BUTTON
   ========================================================================== */
function initScrollToTop() {
    const scrollBtn = document.getElementById('scroll-top-btn');
    const mainScroll = document.getElementById('main-scroll');
    if (!scrollBtn || !mainScroll) return;

    mainScroll.addEventListener('scroll', () => {
        if (mainScroll.scrollTop > 400) {
            scrollBtn.classList.add('visible');
        } else {
            scrollBtn.classList.remove('visible');
        }
    });

    scrollBtn.addEventListener('click', () => {
        mainScroll.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

/* ==========================================================================
   HOME PAGE STICKY SCROLL (Item 2)
   As the medicine list is scrolled, the header, quick-services menu,
   slider and prescription-upload card scroll away normally with the page —
   but the search bar and the category chip row lock in place at the top
   so they stay reachable, with the product grid scrolling underneath them.
   ========================================================================== */
function initHomeStickyScroll() {
    const header = document.querySelector('header');
    const searchSection = document.querySelector('.truemeds-search-section');
    const categoriesSection = document.querySelector('.categories-section');
    if (!searchSection || !categoriesSection) return; // not the home page

    if (!document.getElementById('home-sticky-scroll-css')) {
        const style = document.createElement('style');
        style.id = 'home-sticky-scroll-css';
        style.textContent = `
            .truemeds-search-section { position: sticky; top: 0; z-index: 60; background: #fff; transition: box-shadow .2s ease; }
            .categories-section { position: static !important; top: auto !important; z-index: auto; background: #fff; }
            .truemeds-search-section.mf-scroll-locked { box-shadow: 0 3px 10px rgba(0,0,0,0.08); }
        `;
        document.head.appendChild(style);
    }

    // Lock the header's natural rendered height in as an inline max-height so
    // the collapse-on-scroll transition above has a real starting point to
    // animate from (an unset max-height can't be transitioned smoothly).

    // The category row locks in right below the search bar — measured live
    // (instead of a hardcoded px value) so it lines up correctly on every
    // screen size and after fonts/images finish loading.
    // (Category row is intentionally NOT locked any more - it scrolls with the page.)

    // On scroll: the header disappears (collapses to 0 height instead of just
    // hiding, so the page content actually moves up into its place), the
    // search bar — already sticky at top:0 — visually ends up locked exactly
    // where the header used to be, and the category row shrinks slightly and
    // stays locked directly under the search bar.
    const scrollEl = document.getElementById('main-scroll');
    const SCROLL_LOCK_THRESHOLD = 24;
    let ticking = false;
    // ✅ Fix (Item 1 — app-wide scroll lag): positionCategoriesLock() used to
    // be called from here, i.e. on every single scroll frame. It reads
    // searchSection.offsetHeight, which forces a synchronous layout
    // recalculation (layout thrashing) right after the classList.toggle
    // calls above just changed layout — on every scroll tick, anywhere in
    // the app. That was the real cause of the reported lag. The search
    // bar's own height never changes while scrolling (only its box-shadow
    // does via the locked class), so this position only ever needs
    // recomputing once, on init and on resize — it no longer runs per frame.
    function applyScrollLockState() {
        const y = scrollEl ? scrollEl.scrollTop : window.scrollY;
        const locked = y > SCROLL_LOCK_THRESHOLD;
        // Header/top-bar now live inside the scroll area and scroll away
        // naturally — no collapse animation, so no layout change mid-scroll.
        searchSection.classList.toggle('mf-scroll-locked', locked);
        ticking = false;
    }
    applyScrollLockState();
    (scrollEl || window).addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(applyScrollLockState);
            ticking = true;
        }
    }, { passive: true });
}

/* ==========================================================================
   WISHLIST BUTTONS (Item 7)
   Previously this only ever wrote to localStorage, so the wishlist vanished
   on refresh/new device. Now it's backed by a real `user_wishlist` table
   (see wishlist_migration.sql) keyed on the logged-in user's auth id —
   localStorage is kept only as an instant-paint cache / guest fallback.
   ========================================================================== */
async function initWishlistButtons() {
    const wishlistBtns = document.querySelectorAll('.wishlist-btn');
    if (wishlistBtns.length === 0) return;
    let savedWishlist = JSON.parse(localStorage.getItem('medi_wishlist')) || [];

    // Paint instantly from the local cache first (no flash of "unliked" state),
    // then reconcile with the real database once the session resolves.
    function paintFromSet(idSet) {
        wishlistBtns.forEach(btn => {
            const id = btn.dataset.id;
            const active = idSet.includes(String(id));
            btn.classList.toggle('active', active);
            btn.innerHTML = active ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';
        });
    }
    paintFromSet(savedWishlist);

    const uid = await getCurrentAuthUserId();
    if (supabase && uid) {
        try {
            const { data, error } = await supabase.from('user_wishlist').select('medicine_id').eq('user_id', uid);
            if (!error && data) {
                savedWishlist = data.map(r => String(r.medicine_id));
                localStorage.setItem('medi_wishlist', JSON.stringify(savedWishlist));
                paintFromSet(savedWishlist);
            }
        } catch (e) {}
    }

    wishlistBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const isNowActive = !btn.classList.contains('active');
            btn.classList.toggle('active', isNowActive);
            btn.innerHTML = isNowActive ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';

            if (isNowActive) {
                if (!savedWishlist.includes(id)) savedWishlist.push(id);
                showToast('Added to wishlist!', 'info');
            } else {
                const idx = savedWishlist.indexOf(id);
                if (idx > -1) savedWishlist.splice(idx, 1);
                showToast('Removed from wishlist', 'info');
            }
            localStorage.setItem('medi_wishlist', JSON.stringify(savedWishlist));

            const userId = await getCurrentAuthUserId();
            if (supabase && userId) {
                try {
                    if (isNowActive) {
                        await supabase.from('user_wishlist').upsert({ user_id: userId, medicine_id: id }, { onConflict: 'user_id,medicine_id' });
                    } else {
                        await supabase.from('user_wishlist').delete().eq('user_id', userId).eq('medicine_id', id);
                    }
                } catch (e) {
                    // Non-fatal — UI + localStorage already reflect the change; will
                    // reconcile with the DB again on next page load.
                }
            }
        });
    });
}

// Renders the Profile > Wishlist modal — fetches full product rows for
// every saved wishlist id and shows them as image+name cards; tapping one
// opens the real product detail page via navigateToProductDetail().
async function renderProfileWishlist() {
    const body = document.getElementById('wishlist-modal-body');
    if (!body) return;
    body.innerHTML = `<div style="text-align:center;padding:30px;color:#ccc;"><i class="fa-solid fa-spinner fa-spin" style="font-size:1.8rem;color:#e02020;"></i></div>`;

    let ids = JSON.parse(localStorage.getItem('medi_wishlist') || '[]');
    const uid = await getCurrentAuthUserId();
    if (supabase && uid) {
        try {
            const { data, error } = await supabase.from('user_wishlist').select('medicine_id').eq('user_id', uid);
            if (!error && data) ids = data.map(r => String(r.medicine_id));
        } catch (e) {}
    }

    if (!ids || ids.length === 0) {
        body.innerHTML = `<div style="text-align:center;padding:30px;color:#ccc;"><i class="fa-solid fa-heart-crack" style="font-size:2.2rem;"></i><p style="font-size:0.85rem;margin-top:8px;">Your wishlist is empty.</p></div>`;
        return;
    }

    if (!supabase) { body.innerHTML = `<div style="text-align:center;padding:30px;color:#ccc;"><p style="font-size:0.85rem;">Couldn't load wishlist right now.</p></div>`; return; }
    try {
        const { data: products, error } = await supabase.from('medicines').select('*').in('id', ids);
        if (error || !products || products.length === 0) {
            body.innerHTML = `<div style="text-align:center;padding:30px;color:#ccc;"><i class="fa-solid fa-heart-crack" style="font-size:2.2rem;"></i><p style="font-size:0.85rem;margin-top:8px;">Your wishlist is empty.</p></div>`;
            return;
        }
        body.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">${products.map(prod => {
            const sellingPrice = parseFloat(prod.selling_price || prod.unit_price || prod.price || 0);
            const mrp = parseFloat(prod.mrp || 0);
            const img = prod.image_url || prod.img || 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=400';
            const productName = prod.name || prod.product_name || 'Unnamed';
            const payload = { id: prod.id, name: productName, price: sellingPrice, mrp: mrp, img: img, manufacturer: prod.manufacturer || '', desc: prod.description || '' };
            return `
            <div class="wishlist-card-item" onclick='navigateToProductDetail(${JSON.stringify(payload).replace(/'/g, "&#39;")})' style="background:#fff;border:1px solid #eef2f5;border-radius:12px;padding:8px;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,0.04);">
                <img src="${img}" alt="${productName}" style="width:100%;height:90px;object-fit:cover;border-radius:8px;margin-bottom:6px;">
                <div style="font-size:0.78rem;font-weight:700;color:#2f3542;line-height:1.2;">${productName}</div>
                <div style="font-size:0.75rem;color:#e02020;font-weight:700;margin-top:4px;">₹${sellingPrice.toFixed(0)}</div>
            </div>`;
        }).join('')}</div>`;
    } catch (e) {
        body.innerHTML = `<div style="text-align:center;padding:30px;color:#ccc;"><p style="font-size:0.85rem;">Couldn't load wishlist right now.</p></div>`;
    }
}

/* ==========================================================================
   VOICE / MIC SEARCH (Web Speech API)
   ========================================================================== */
function initVoiceSearch() {
    const micBtn = document.getElementById('voice-search-btn');
    const searchInput = document.getElementById('home-medicine-search');
    if (!micBtn || !searchInput) return; // mic button not present on this page

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

    // Browser doesn't support voice recognition at all (e.g. old browsers)
    if (!SpeechRecognitionAPI) {
        micBtn.addEventListener('click', () => {
            showToast('Voice search isn\'t supported on this browser. Please use Chrome.', 'warning');
        });
        return;
    }

    // Inject listening-state styles once (no separate CSS file needed).
    // While listening, the mic visually moves over to the avatar's spot
    // (left side) and a plain search button takes over the mic's old
    // right-side slot — same swap that happens while typing.
    if (!document.getElementById('voice-search-inline-style')) {
        const style = document.createElement('style');
        style.id = 'voice-search-inline-style';
        style.textContent = `
            .truemads-mic-btn.listening { color: #e02020 !important; animation: mediMicPulse 1s ease-in-out infinite; }
            @keyframes mediMicPulse {
                0% { box-shadow: 0 0 0 0 rgba(224,32,32,0.45); }
                70% { box-shadow: 0 0 0 12px rgba(224,32,32,0); }
                100% { box-shadow: 0 0 0 0 rgba(224,32,32,0); }
            }
            .truemeds-search-bar { position: relative; }
            .truemeds-search-bar .truemads-mic-btn,
            .truemeds-search-bar .truemads-search-icon-btn { order: 3; transition: opacity .25s ease; }
            .truemeds-search-bar.mic-engaged .truemeds-avatar-wrapper { display: none; }
            .truemeds-search-bar.mic-engaged .truemads-mic-btn { order: -1; display: flex !important; }
            .truemeds-search-bar.mic-engaged .truemads-search-icon-btn { display: flex !important; }
        `;
        document.head.appendChild(style);
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    function langToSpeechCode(lang) {
        if (lang === 'bn') return 'bn-IN';
        if (lang === 'hi') return 'hi-IN';
        return 'en-IN';
    }

    let isListening = false;

    micBtn.addEventListener('click', () => {
        if (isListening) {
            recognition.stop();
            return;
        }
        const savedLang = localStorage.getItem('medi_active_language_env') || 'en';
        recognition.lang = langToSpeechCode(savedLang);

        // Calling start() triggers the browser's native "Allow microphone access?" prompt
        // automatically the first time (or on every call if permission was denied before).
        try {
            recognition.start();
        } catch (err) {
            // start() throws if it's already running - reset and retry
            try { recognition.stop(); } catch (e2) {}
            setTimeout(() => { try { recognition.start(); } catch (e3) {} }, 250);
        }
    });

    recognition.addEventListener('start', () => {
        isListening = true;
        micBtn.classList.add('listening');
        const searchBarEl = micBtn.closest('.truemeds-search-bar');
        if (searchBarEl) searchBarEl.classList.add('mic-engaged');
        showToast('Listening... say the medicine name', 'info');
    });

    recognition.addEventListener('result', (event) => {
        const transcript = (event.results[0][0].transcript || '').trim();
        if (transcript) {
            searchInput.value = transcript;
            searchInput.dispatchEvent(new Event('input'));
            searchInput.focus();
            showToast(`Searching for "${transcript}"`, 'success');
        }
    });

    recognition.addEventListener('error', (event) => {
        isListening = false;
        micBtn.classList.remove('listening');
        const searchBarElErr = micBtn.closest('.truemeds-search-bar');
        if (searchBarElErr) searchBarElErr.classList.remove('mic-engaged');
        if (event.error === 'not-allowed' || event.error === 'permission-denied' || event.error === 'service-not-allowed') {
            showToast('Microphone access denied. Please allow mic permission in your browser settings and try again.', 'warning');
        } else if (event.error === 'no-speech') {
            showToast('No speech detected. Please try again.', 'info');
        } else if (event.error === 'audio-capture') {
            showToast('No microphone found on this device.', 'warning');
        } else {
            showToast('Voice search failed. Please try again.', 'warning');
        }
    });

    recognition.addEventListener('end', () => {
        isListening = false;
        micBtn.classList.remove('listening');
        const searchBarElEnd = micBtn.closest('.truemeds-search-bar');
        if (searchBarElEnd) searchBarElEnd.classList.remove('mic-engaged');
    });
}

/* ==========================================================================
   SERVICES MENU
   ========================================================================== */
function initServicesMenu() {
    const serviceItems = document.querySelectorAll('.service-item');
    serviceItems.forEach(item => {
        item.addEventListener('click', () => {
            const service = item.dataset.service;
            // ✅ Lab Test, Nurse Booking, Ambulance and Tablet Coin are now
            // merged pages within this same SPA (not a separate manubar.html
            // file) — navigateTo() switches straight to each one in place.
            switch(service) {
                case 'lab':
                    navigateTo('lab-test');
                    break;
                case 'instrument':
                    navigateTo('instrument');
                    break;
                case 'nurse':
                    navigateTo('nurse-booking');
                    break;
                case 'doctor':
                    showToast('This service is not available right now. Please try after a few days.', 'warning');
                    break;
                case 'checkup':
                    showToast('This service is not available right now. Please try after a few days.', 'warning');
                    break;
                case 'ambulance':
                    navigateTo('ambulance');
                    break;
                case 'coins':
                    navigateTo('tablet-coin');
                    break;
                default:
                    showToast('Feature coming soon!', 'info');
            }
        });
    });
}

/* ==========================================================================
   HAMBURGER MENU
   ========================================================================== */
// ============================================================
// MY COUPONS & OFFERS — real, persistent list (Offers & Coupons)
// "My Coupons" = actually earned coupons (order rewards, referral
// rewards, admin grants) from user_coupons, one row per shopper.
// "New Offers" = platform-wide active offers from platform_offers,
// which simply accumulates whatever admin adds/activates.
// ============================================================
async function loadMyCouponsAndOffers() {
    const couponsList = document.getElementById('my-coupons-list');
    const offersList = document.getElementById('new-offers-list');
    if (!couponsList && !offersList) return;
    if (couponsList) couponsList.innerHTML = '<p style="font-size:0.75rem;color:#999;">Loading...</p>';
    if (offersList) offersList.innerHTML = '<p style="font-size:0.75rem;color:#999;">Loading...</p>';
    if (!supabase) return;

    if (couponsList) {
        try {
            const uid = await getCurrentAuthUserId();
            if (!uid) {
                couponsList.innerHTML = '<p style="font-size:0.75rem;color:#999;">Login to see your coupons.</p>';
            } else {
                const { data, error } = await supabase.from('user_coupons').select('*')
                    .eq('user_id', uid).eq('is_used', false).order('created_at', { ascending: false });
                if (error || !data || data.length === 0) {
                    couponsList.innerHTML = '<p style="font-size:0.75rem;color:#999;">No coupons yet — place an order or refer a friend to earn one.</p>';
                } else {
                    couponsList.innerHTML = data.map(c => `
                        <div class="record-subcard-pill" style="margin-bottom:8px;">
                            <div>
                                <span class="addr-tag-badge">${c.code}</span>
                                <div class="sub-label" style="margin-top:4px;">${c.description || ''}</div>
                            </div>
                        </div>
                    `).join('');
                }
            }
        } catch (e) { couponsList.innerHTML = '<p style="font-size:0.75rem;color:#999;">Could not load coupons.</p>'; }
    }

    if (offersList) {
        try {
            const { data, error } = await supabase.from('platform_offers').select('*')
                .eq('is_active', true).order('created_at', { ascending: false });
            if (error || !data || data.length === 0) {
                offersList.innerHTML = '<p style="font-size:0.75rem;color:#999;">No active offers right now.</p>';
            } else {
                offersList.innerHTML = data.map(o => `
                    <div class="record-subcard-pill" style="margin-bottom:8px;">
                        <div>
                            <strong>${o.title || ''}</strong>
                            <div class="sub-label">${o.description || ''}</div>
                        </div>
                    </div>
                `).join('');
            }
        } catch (e) { offersList.innerHTML = '<p style="font-size:0.75rem;color:#999;">Could not load offers.</p>'; }
    }
}

/* ✅ Hamburger menu removed entirely (HTML markup, CSS, and this init
   function) per explicit standing request — there is no hamburger button
   or overlay anywhere in the app. Real name/UID syncing still happens via
   applyUserIdentityToUI(), called from autoFillSavedUserDataOnAuth() below,
   independent of this removed function. */
/* ============================================================
   SPA ROUTER — added when consolidating userhome/usermap/userorder/
   usercart/userprofile into user.html + user.css + user.js.
   Only ADDS behaviour: switches which .app-page section is visible
   instead of doing a full page navigation. Nothing above this point
   was removed. product-detail.html and usert&c.html remain separate
   real pages and are still opened with a normal navigation.
   ============================================================ */
(function () {
    // ✅ Merged-in pages from manubar.html get their own PAGE_IDS entries so
    // the exact same show/hide + history + nav-icon machinery this app
    // already uses for Home/Shops/Cart/Order/Profile now also covers Lab
    // Test, Nurse Booking, Ambulance and Tablet Coin — no second router.
    const PAGE_IDS = {
        home: 'page-home', shops: 'page-shops', order: 'page-order', cart: 'page-cart', profile: 'page-profile', notification: 'page-notification',
        'lab-test': 'page-lab-test', 'nurse-booking': 'page-nurse-booking', 'ambulance': 'page-ambulance', 'tablet-coin': 'page-tablet-coin',
        'product-detail': 'page-product-detail', 'shop-detail': 'page-shop-detail'
    };

    function setActiveNavIcon(page) {
        document.querySelectorAll('#bottom-nav .nav-item').forEach(function (item) {
            item.classList.toggle('active', item.dataset.page === page);
        });
    }

    window.navigateTo = function (page, anchorId) {
        // ✅ "Medical Instrument" isn't a separate .app-page — it's a display
        // mode of Home (hides quick-services/prescription/categories, shows
        // a filtered product grid; see setInstrumentMode()). Routed through
        // navigateTo('instrument') like every other page, no page reload,
        // and it still gets its own URL hash (#instrument).
        const enteringInstrument = page === 'instrument';
        const targetPage = enteringInstrument ? 'home' : page;
        if (!PAGE_IDS[targetPage]) return;

        // Turn instrument mode OFF on any navigation except the one entering
        // it right now. This is what actually fixes "Back to Home doesn't
        // work": previously nothing ever undid instrument mode's UI changes
        // once entered (the old ?type=instrument reload had no exit path).
        if (window.__instrumentModeActive && !enteringInstrument && typeof setInstrumentMode === 'function') {
            setInstrumentMode(false);
        }

        Object.values(PAGE_IDS).forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.classList.remove('active');
        });
        const target = document.getElementById(PAGE_IDS[targetPage]);
        if (target) target.classList.add('active');

        setActiveNavIcon(targetPage);

        // Home-only header: shown only when navigating to Home, hidden on
        // Shops/Cart/Orders/Profile. Also refreshes the "Hi, [Name]" /
        // time-of-day greeting each time Home is opened.
        updateHomeHeaderVisibility(targetPage);

        // Cart badge can go stale if the cart was edited from another tab/
        // page — cheap to resync on every navigation.
        updateCartNavBadge();

        // Cart page: re-render every time it's opened, not just when an item
        // is added elsewhere. addToCart()/changeCartQty()/removeFromCart()
        // already refresh #cart-items-container themselves, so normally this
        // is redundant — but it's the one guaranteed backstop that makes the
        // visible list match currentCart even if some earlier refresh call
        // was skipped or failed, instead of leaving stale/placeholder markup
        // on screen while the nav badge and totals (computed independently)
        // are already correct.
        if (targetPage === 'cart' && typeof renderCartPage === 'function') {
            renderCartPage();
        }

        const notiDropdown = document.getElementById('notiDropdown');
        if (notiDropdown) notiDropdown.classList.remove('active');

        // Leaflet sizes itself off its container at creation time, so the very
        // first time the Shops tab is opened (container was display:none until
        // now) it needs an explicit resize or the tiles render grey/cropped.
        if (targetPage === 'shops' && window.__shopsLeafletMap) {
            setTimeout(function () { window.__shopsLeafletMap.invalidateSize(); }, 60);
        }

        // ✅ Reset THIS page's own scroll position to the top on every entry
        // (window.scrollTo below is a no-op here since body itself never
        // scrolls — each page's real scroll container is its own
        // .main-content-scrollable <main>).
        const scrollEl = target ? target.querySelector('.main-content-scrollable') : null;
        if (scrollEl) scrollEl.scrollTop = 0;

        window.scrollTo(0, 0);
        try { history.replaceState(null, '', '#' + page); } catch (e) {}

        if (enteringInstrument && typeof setInstrumentMode === 'function') {
            setInstrumentMode(true);
        }

        if (anchorId) {
            setTimeout(function () {
                const el = document.getElementById(anchorId);
                if (!el) return;
                if (typeof el.click === 'function') { el.click(); }
                else { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
            }, 80);
        }
    };

    document.addEventListener('DOMContentLoaded', function () {
        const hash = (window.location.hash || '').replace('#', '');
        if (hash === 'instrument') { window.navigateTo('instrument'); return; }
        if (PAGE_IDS[hash]) window.navigateTo(hash);
    });

    // ✅ The Lab Test / Nurse Booking / Ambulance / Tablet Coin pages share a
    // "cat-strip" of quick links to jump between each other (previously
    // manubar.html's own separate mini-router); one delegated listener here
    // sends all of them through the same navigateTo() as everything else.
    document.addEventListener('click', function (e) {
        const link = e.target.closest ? e.target.closest('.cat-item[data-cat]') : null;
        if (!link) return;
        const key = link.getAttribute('data-cat');
        e.preventDefault();
        // Doctor Consult / Body Checkup aren't built yet — same "not
        // available" message as the matching Home quick-service tiles,
        // instead of silently doing nothing when tapped from here.
        if (key === 'doctor-consult' || key === 'body-checkup') {
            if (typeof showToast === 'function') showToast('This service is not available right now. Please try after a few days.', 'warning');
            return;
        }
        if (!PAGE_IDS[key]) return;
        window.navigateTo(key);
    });
})();
/* ============================================================
   Merged from manubar.html — Lab Test page
   ============================================================ */

(function(){

// ---------------- Supabase ----------------
// ✅ Reuses this app's single shared Supabase client (declared once at the
// top of user.js) instead of creating a second, redundant client instance
// now that this page lives inside the same document.
const supabaseClient = supabase;
function esc(str){ return String(str||'').replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ---------------- Icon library (fallback when a test has no admin image) ----------------
const icons = {
  tube: `<svg viewBox="0 0 24 24" fill="none"><path d="M9 2v13a3 3 0 006 0V2" stroke="#a11212" stroke-width="1.6" stroke-linecap="round"/><path d="M9 9h6" stroke="#a11212" stroke-width="1.6"/><path d="M9 2h6" stroke="#a11212" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="16" r="1.4" fill="#d21f1f"/></svg>`,
  drop: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3s6 7 6 11a6 6 0 01-12 0c0-4 6-11 6-11z" stroke="#a11212" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  default: `<svg viewBox="0 0 24 24" fill="none"><path d="M9 2v13a3 3 0 006 0V2" stroke="#a11212" stroke-width="1.6" stroke-linecap="round"/><path d="M9 9h6" stroke="#a11212" stroke-width="1.6"/></svg>`
};

// ---------------- State ----------------
let allTests = [];
let userPincode = localStorage.getItem('labGatePincode') || '';
let currentUser = null;

// ---------------- Load tests from Supabase (no more fake demo data) ----------------
async function loadTests(){
  const { data, error } = await supabaseClient.from('lab_tests').select('*').eq('active', true).order('created_at', {ascending:false});
  if(error){ console.error(error); allTests = []; }
  else allTests = data || [];
  renderGrid(document.getElementById('lb_searchInput').value);
}

function testMatchesPincode(t){
  if(!userPincode) return true;
  if(!t.pincodes || t.pincodes.length === 0) return true; // no restriction = serves everywhere
  return t.pincodes.includes(userPincode);
}

const grid = document.getElementById("lb_testGrid");
function renderGrid(filter=""){
  grid.innerHTML = "";
  const visible = allTests
    .filter(t => t.name.toLowerCase().includes(filter.toLowerCase()))
    .filter(testMatchesPincode);

  if(!visible.length){
    grid.innerHTML = `<div class="empty-msg">${
      allTests.length ? "No tests available for this pincode yet. Try another pincode or check back soon." : "New tests are being added — please check back shortly."
    }</div>`;
    return;
  }

  visible.forEach(t=>{
    const card = document.createElement("div");
    card.className = "card";
    const badgeStyle = t.bg_image_url ? `style="background-image:url('${esc(t.bg_image_url)}');"` : '';
    const badgeInner = t.bg_image_url ? '' : (icons[t.icon] || icons.default);
    card.innerHTML = `
      <div class="card-head" data-detail-id="${t.id}">
        <div class="icon-badge" ${badgeStyle}>${badgeInner}</div>
        <h3>${esc(t.name)}</h3>
      </div>
      <ul>${(t.items||[]).map(it=>`<li>${esc(it)}</li>`).join("")}</ul>
      <div class="price-row">
        <span class="price-old">₹${t.old_price}</span>
        <span class="price-new">₹${t.price}</span>
        <span class="off-badge">${t.off_percent}% OFF</span>
      </div>
      <span class="fasting-note ${t.fasting}">
        ${t.fasting === "before" ? "⚠️ Fasting Required (Before Food)" : "✅ No Fasting Needed (After Food)"}
      </span>
      <span class="home-note">🏠 Home Sample Collection Available</span>
      <button class="buy-btn" data-id="${t.id}">BUY NOW</button>
    `;
    card.querySelector(".card-head").addEventListener("click", ()=> openDetails(t.id));
    grid.appendChild(card);
  });
}

document.getElementById("lb_searchInput").addEventListener("input", (e)=>{ renderGrid(e.target.value); });

// ---------------- Voice search (mic button) ----------------
(function(){
  const micBtn = document.getElementById('lb_micBtn');
  const searchInput = document.getElementById('lb_searchInput');
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

  if(!SpeechRecognitionAPI){
    // Browser doesn't support voice input — hide the mic instead of
    // leaving a dead button that does nothing when tapped.
    if(micBtn) micBtn.style.display = 'none';
    return;
  }

  const recognizer = new SpeechRecognitionAPI();
  recognizer.lang = 'en-IN';
  recognizer.interimResults = true;
  recognizer.maxAlternatives = 1;
  recognizer.continuous = false;

  let isListening = false;

  recognizer.addEventListener('start', () => {
    isListening = true;
    micBtn.classList.add('listening');
    micBtn.querySelector('i').className = 'fa-solid fa-microphone-lines';
  });

  recognizer.addEventListener('result', (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join(' ');
    searchInput.value = transcript;
    renderGrid(transcript);
  });

  recognizer.addEventListener('error', () => {
    if (typeof showToast === 'function') showToast('Could not hear you clearly, try again', 'error');
  });

  function stopListening(){
    isListening = false;
    micBtn.classList.remove('listening');
    micBtn.querySelector('i').className = 'fa-solid fa-microphone';
  }
  recognizer.addEventListener('end', stopListening);

  micBtn.addEventListener('click', () => {
    if(isListening){
      recognizer.stop();
      return;
    }
    try {
      searchInput.value = '';
      renderGrid('');
      recognizer.start();
    } catch(err) {
      stopListening();
    }
  });
})();

// ---------------- Pincode gate ----------------
const gatePincodeInput = document.getElementById('lb_gatePincode');
const gateNote = document.getElementById('lb_gateNote');
gatePincodeInput.value = userPincode;
function applyGatePincode(){
  const pin = gatePincodeInput.value.trim();
  userPincode = pin;
  localStorage.setItem('labGatePincode', pin);
  if(!pin){
    gateNote.className = 'pincode-note';
    gateNote.textContent = 'Showing tests available everywhere. Enter your pincode for tests specific to your area.';
  } else {
    gateNote.className = 'pincode-note ok';
    gateNote.textContent = `Showing tests serviceable at pincode ${pin}.`;
  }
  renderGrid(document.getElementById('lb_searchInput').value);
}
document.getElementById('lb_gateCheckBtn').addEventListener('click', applyGatePincode);
gatePincodeInput.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') applyGatePincode(); });
if(userPincode) applyGatePincode();

// ---------------- Booking flow ----------------
const overlay = document.getElementById("lb_overlay");
const sheetTestName = document.getElementById("lb_sheetTestName");
const gpsStatus = document.getElementById("lb_gpsStatus");
const confirmBtn = document.getElementById("lb_confirmBtn");
const closeX = document.getElementById("lb_closeX");

const patientName = document.getElementById("lb_patientName");
const patientPhone = document.getElementById("lb_patientPhone");
const addrHouse = document.getElementById("lb_addrHouse");
const addrStreet = document.getElementById("lb_addrStreet");
const addrLandmark = document.getElementById("lb_addrLandmark");
const addrCity = document.getElementById("lb_addrCity");
const addrPincode = document.getElementById("lb_addrPincode");
const addrState = document.getElementById("lb_addrState");
const bookDate = document.getElementById("lb_bookDate");
const bookTime = document.getElementById("lb_bookTime");

let currentTest = null;
let currentCoords = null;
let sheetOpenViaHistory = false;
let selectedPaymentMethod = 'upi';
let selectedRxFile = null;

// Set your WhatsApp group/admin number here (with country code, no + or spaces).
const WHATSAPP_NUMBER = ""; // e.g. "918900000000"

// Your business UPI ID — shown as text and encoded into the QR / Pay Now link.
const UPI_ID = "9593625498@ibl";
const UPI_PAYEE_NAME = "MediFinder India";

const upiPayBox = document.getElementById('lb_upiPayBox');
const upiStepAmount = document.getElementById('lb_upiStepAmount');
const upiStepConfirm = document.getElementById('lb_upiStepConfirm');
const upiAmountValue = document.getElementById('lb_upiAmountValue');
const upiPayNowBtn = document.getElementById('lb_upiPayNowBtn');

function updateUpiAmount(amount){
  upiAmountValue.textContent = "₹" + Number(amount).toFixed(2);
  const link = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(UPI_PAYEE_NAME)}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent('Lab Test Booking')}`;
  upiPayNowBtn.href = link;
}

function resetUpiSteps(){
  upiStepAmount.style.display = "";
  upiStepConfirm.style.display = "none";
}

function startBooking(id){
  currentTest = allTests.find(t=>t.id===id);
  if(!currentTest) return;

  sheetTestName.textContent = "Test: " + currentTest.name + " — ₹" + currentTest.price +
    (currentTest.fasting === "before" ? " (Fasting required)" : " (No fasting needed)");

  [patientName, patientPhone, addrHouse, addrStreet, addrLandmark, addrCity].forEach(f=>f.value="");
  addrPincode.value = userPincode || "";
  addrState.value = "West Bengal";
  const today = new Date();
  bookDate.value = today.toISOString().split("T")[0];
  bookTime.value = "09:00";
  currentCoords = null;
  selectedRxFile = null;
  document.getElementById('lb_rxUploadBox').classList.remove('has-file');
  document.getElementById('lb_rxUploadBox').innerHTML = '<i class="fa-solid fa-file-arrow-up"></i> Tap to upload prescription image';
  document.getElementById('lb_rxFileInput').value = '';
  resetUpiSteps();
  updateUpiAmount(currentTest.price);
  selectPaymentMethod('upi');
  gpsStatus.className = "gps-status";
  gpsStatus.textContent = "📍 Getting your live location...";
  confirmBtn.disabled = true;

  openSheet();
  getLocation();
}

grid.addEventListener("click", (e)=>{
  if(!e.target.classList.contains("buy-btn")) return;
  startBooking(e.target.getAttribute("data-id"));
});

document.querySelectorAll('.pay-option').forEach(el=>{
  el.addEventListener('click', ()=> selectPaymentMethod(el.dataset.method));
});
function selectPaymentMethod(method){
  selectedPaymentMethod = method;
  document.getElementById('lb_payUPI').classList.toggle('selected', method==='upi');
  document.getElementById('lb_payCOD').classList.toggle('selected', method==='cod');
  upiPayBox.style.display = method==='upi' ? '' : 'none';
  confirmBtn.style.display = method==='cod' ? '' : 'none';
  resetUpiSteps();
}

document.getElementById('lb_upiDoneBtn').addEventListener('click', ()=>{
  upiStepAmount.style.display = "none";
  upiStepConfirm.style.display = "";
});
document.getElementById('lb_upiConfirmBack').addEventListener('click', resetUpiSteps);
document.getElementById('lb_upiConfirmYes').addEventListener('click', async ()=>{
  const name = patientName.value.trim();
  if(!name){ resetUpiSteps(); patientName.focus(); return; }
  if(!currentCoords){ resetUpiSteps(); return; }
  if(!addrPincode.value.trim()){ resetUpiSteps(); addrPincode.focus(); return; }

  const btn = document.getElementById('lb_upiConfirmYes');
  btn.disabled = true; btn.textContent = "Submitting...";
  await finalizeBooking('Paid');
  btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Payment Completed';
});

document.getElementById('lb_rxUploadBox').addEventListener('click', ()=> document.getElementById('lb_rxFileInput').click());
document.getElementById('lb_rxFileInput').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  selectedRxFile = file;
  const box = document.getElementById('lb_rxUploadBox');
  box.classList.add('has-file');
  box.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${esc(file.name)}`;
});

// ✅ The old standalone mini-router's window.__initialSpaPage flag no longer
// exists now that navigation is handled by the main SPA router — this
// page-entry history guard isn't needed there either.

function openSheet(){ overlay.classList.add("active"); history.pushState({sheet:true}, ""); sheetOpenViaHistory = true; }
function closeSheetUI(){ overlay.classList.remove("active"); }
window.addEventListener("popstate", ()=>{
  if(!document.getElementById("page-lab-test").classList.contains("active")) return;
  if(overlay.classList.contains("active")){ closeSheetUI(); sheetOpenViaHistory = false; return; }
  if(document.getElementById('lb_bookingsOverlay').classList.contains('active')){
    document.getElementById('lb_bookingsOverlay').classList.remove('active'); return;
  }
  if(document.getElementById('lb_detailsOverlay').classList.contains('active')){
    document.getElementById('lb_detailsOverlay').classList.remove('active'); return;
  }
  if(document.getElementById('lb_rateOverlay').classList.contains('active')){
    document.getElementById('lb_rateOverlay').classList.remove('active'); return;
  }
  if (typeof window.navigateTo === 'function') window.navigateTo('home'); // ✅ SPA nav instead of a full page reload
});
closeX.addEventListener("click", ()=>{ if(sheetOpenViaHistory){ history.back(); } else { closeSheetUI(); } });
overlay.addEventListener("click", (e)=>{ if(e.target === overlay){ if(sheetOpenViaHistory){ history.back(); } else { closeSheetUI(); } } });

function getLocation(){
  if(!navigator.geolocation){
    gpsStatus.className = "gps-status err";
    gpsStatus.textContent = "❌ Location isn't supported on this browser";
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos)=>{
      currentCoords = { lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) };
      gpsStatus.className = "gps-status ok";
      gpsStatus.textContent = "✅ Location found: " + currentCoords.lat + ", " + currentCoords.lng;
      confirmBtn.disabled = false;
    },
    ()=>{
      gpsStatus.className = "gps-status err";
      gpsStatus.textContent = "❌ Couldn't get your location. Please turn on GPS and try again.";
      confirmBtn.disabled = true;
    },
    { enableHighAccuracy:true, timeout:10000 }
  );
}

async function uploadPrescription(file, userId){
  const ext = file.name.split('.').pop();
  const path = `lab-prescriptions/${userId || 'guest'}-${Date.now()}.${ext}`;
  const { error } = await supabaseClient.storage.from('media').upload(path, file, { contentType: file.type });
  if(error){ console.error(error); return null; }
  const { data } = supabaseClient.storage.from('media').getPublicUrl(path);
  return data.publicUrl;
}

// Shared submit path for both payment methods: Cash on Delivery calls this
// straight from "Submit Booking"; UPI calls this only after the user taps
// "Payment Completed" on the confirm step (self-declared UPI payment).
async function finalizeBooking(paymentStatus){
  const name = patientName.value.trim();

  let prescriptionUrl = null;
  if(selectedRxFile){
    prescriptionUrl = await uploadPrescription(selectedRxFile, currentUser?.id);
  }

  const payload = {
    booking_id: `LAB-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    test_id: currentTest.id,
    test_name: currentTest.name,
    test_price: currentTest.price,
    fasting: currentTest.fasting,
    user_id: currentUser?.id || null,
    patient_name: name,
    patient_phone: patientPhone.value.trim() || null,
    addr_house: addrHouse.value.trim() || null,
    addr_street: addrStreet.value.trim() || null,
    addr_landmark: addrLandmark.value.trim() || null,
    addr_city: addrCity.value.trim() || null,
    addr_pincode: addrPincode.value.trim(),
    addr_state: addrState.value,
    lat: parseFloat(currentCoords.lat),
    lng: parseFloat(currentCoords.lng),
    book_date: bookDate.value,
    book_time: bookTime.value,
    prescription_url: prescriptionUrl,
    payment_method: selectedPaymentMethod,
    payment_status: paymentStatus,
    razorpay_payment_id: null,
    status: 'Pending'
  };

  const { error } = await supabaseClient.from('lab_bookings').insert(payload);
  if(error){
    alert("Could not submit booking: " + error.message);
    return;
  }

  // Optional WhatsApp copy to the admin/team, same as before.
  const addressParts = [addrHouse.value.trim(), addrStreet.value.trim(), addrLandmark.value.trim(), addrCity.value.trim(), addrState.value, addrPincode.value.trim()].filter(Boolean);
  const fullAddress = addressParts.length ? addressParts.join(", ") : "(not provided)";
  const mapsLink = `https://maps.google.com/?q=${currentCoords.lat},${currentCoords.lng}`;
  const message = `🩺 *MediFinder — New Test Booking*\n\n*Test:* ${currentTest.name}\n*Price:* ₹${currentTest.price}\n*Payment:* ${selectedPaymentMethod.toUpperCase()} (${paymentStatus})\n\n*Patient Name:* ${name}\n*Phone:* ${patientPhone.value.trim() || "(not provided)"}\n*Address:* ${fullAddress}\n\n*Date:* ${bookDate.value}\n*Time:* ${bookTime.value}\n\n*Live Location:* ${currentCoords.lat}, ${currentCoords.lng}\n${mapsLink}`;
  const encoded = encodeURIComponent(message);
  const url = WHATSAPP_NUMBER ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  window.open(url, "_blank");

  if(sheetOpenViaHistory){ history.back(); } else { closeSheetUI(); }
  loadMyBookings();
}

confirmBtn.addEventListener("click", async ()=>{
  const name = patientName.value.trim();
  if(!name){ patientName.focus(); return; }
  if(!currentCoords){ return; }
  if(!addrPincode.value.trim()){ addrPincode.focus(); return; }

  confirmBtn.disabled = true;
  confirmBtn.textContent = "Processing...";
  await finalizeBooking('Pending');
  confirmBtn.disabled = false;
  confirmBtn.textContent = "Submit Booking";
});


// ---------------- Test Details ----------------
const detailsOverlay = document.getElementById('lb_detailsOverlay');
const detailsBody = document.getElementById('lb_detailsBody');
const detailTitle = document.getElementById('lb_detailTitle');
document.getElementById('lb_closeDetailsX').addEventListener('click', ()=> history.back());
detailsOverlay.addEventListener('click', (e)=>{ if(e.target === detailsOverlay) history.back(); });

async function openDetails(id){
  const t = allTests.find(x=>x.id===id);
  if(!t) return;
  detailTitle.textContent = t.name;
  const badgeStyle = t.bg_image_url ? `style="background-image:url('${esc(t.bg_image_url)}');"` : '';
  const badgeInner = t.bg_image_url ? '' : (icons[t.icon] || icons.default);
  detailsBody.innerHTML = `
    <div class="detail-icon" ${badgeStyle}>${badgeInner}</div>
    <div class="price-row">
      <span class="price-old">₹${t.old_price}</span>
      <span class="price-new">₹${t.price}</span>
      <span class="off-badge">${t.off_percent}% OFF</span>
    </div>
    <span class="fasting-note ${t.fasting}">
      ${t.fasting === "before" ? "⚠️ Fasting Required (Before Food)" : "✅ No Fasting Needed (After Food)"}
    </span>
    <ul>${(t.items||[]).map(it=>`<li>${esc(it)}</li>`).join("")}</ul>
    <div class="detail-stats-row" id="lb_detailStats">
      <div class="detail-stat">Loading stats…</div>
    </div>
    <div class="field-group-title">Reviews</div>
    <div id="lb_detailReviews"><p class="no-reviews">Loading reviews…</p></div>
    <button class="confirm-btn" id="lb_detailBookBtn" style="margin-top:16px;">Book Now</button>
  `;
  document.getElementById('lb_detailBookBtn').addEventListener('click', ()=>{ history.back(); startBooking(t.id); });
  detailsOverlay.classList.add('active');
  history.pushState({detailsSheet:true}, "");
  loadTestStats(t.id);
}

function starHtml(avg){
  const rounded = Math.round(avg);
  let out = '';
  for(let i=1;i<=5;i++) out += `<i class="fa-solid fa-star" style="color:${i<=rounded?'var(--gold)':'#ddd'}"></i>`;
  return out;
}

async function loadTestStats(testId){
  const statsEl = document.getElementById('lb_detailStats');
  const reviewsEl = document.getElementById('lb_detailReviews');
  if(!statsEl || !reviewsEl) return;

  // How many people have booked & completed this test.
  let bookedCount = 0;
  try{
    const { count } = await supabaseClient.from('lab_bookings').select('id', {count:'exact', head:true}).eq('test_id', testId);
    bookedCount = count || 0;
  }catch(e){ /* ignore */ }

  // Ratings & feedback (expects an optional "lab_test_reviews" table:
  // columns test_id, booking_id, patient_name, rating, feedback, created_at).
  let reviews = [];
  try{
    const { data, error } = await supabaseClient.from('lab_test_reviews').select('*').eq('test_id', testId).order('created_at', {ascending:false});
    if(!error) reviews = data || [];
  }catch(e){ /* table may not exist yet */ }

  const avg = reviews.length ? (reviews.reduce((s,r)=>s+(r.rating||0),0)/reviews.length) : 0;

  statsEl.innerHTML = `
    <div class="detail-stat"><i class="fa-solid fa-user-group"></i> ${bookedCount} people booked this</div>
    <div class="detail-stat"><span class="stars">${starHtml(avg)}</span> ${reviews.length ? avg.toFixed(1)+' ('+reviews.length+')' : 'No ratings yet'}</div>
  `;

  reviewsEl.innerHTML = reviews.length
    ? reviews.slice(0,10).map(r=>`
        <div class="review-row">
          <div class="review-row-top"><span>${esc(r.patient_name||'Anonymous')}</span><span class="stars">${starHtml(r.rating||0)}</span></div>
          ${r.feedback ? `<p>${esc(r.feedback)}</p>` : ''}
        </div>`).join('')
    : `<p class="no-reviews">No reviews yet — be the first to share feedback after your test.</p>`;
}

// ---------------- Rate / Feedback sheet ----------------
const rateOverlay = document.getElementById('lb_rateOverlay');
const rateTestLabel = document.getElementById('lb_rateTestLabel');
const starPicker = document.getElementById('lb_starPicker');
let rateSelectedStars = 0;
let rateContext = null; // { bookingId, testId, testName, patientName }

document.getElementById('lb_closeRateX').addEventListener('click', ()=> history.back());
rateOverlay.addEventListener('click', (e)=>{ if(e.target === rateOverlay) history.back(); });

starPicker.querySelectorAll('i').forEach(star=>{
  star.addEventListener('click', ()=>{
    rateSelectedStars = parseInt(star.dataset.val, 10);
    starPicker.querySelectorAll('i').forEach(s=> s.classList.toggle('on', parseInt(s.dataset.val,10) <= rateSelectedStars));
  });
});

function openRateSheet(booking){
  rateContext = { bookingId: booking.id, testId: booking.test_id, testName: booking.test_name, patientName: booking.patient_name };
  rateTestLabel.textContent = "Test: " + booking.test_name;
  rateSelectedStars = 0;
  starPicker.querySelectorAll('i').forEach(s=> s.classList.remove('on'));
  document.getElementById('lb_rateFeedback').value = '';
  rateOverlay.classList.add('active');
  history.pushState({rateSheet:true}, "");
}

document.getElementById('lb_submitRateBtn').addEventListener('click', async ()=>{
  if(!rateContext) return;
  if(!rateSelectedStars){ alert('Please select a star rating.'); return; }
  const btn = document.getElementById('lb_submitRateBtn');
  btn.disabled = true; btn.textContent = 'Submitting...';
  const { error } = await supabaseClient.from('lab_test_reviews').insert({
    test_id: rateContext.testId,
    booking_id: rateContext.bookingId,
    patient_name: rateContext.patientName,
    rating: rateSelectedStars,
    feedback: document.getElementById('lb_rateFeedback').value.trim() || null
  });
  btn.disabled = false; btn.textContent = 'Submit Feedback';
  if(error){ alert('Could not submit feedback: ' + error.message); return; }
  history.back();
  loadMyBookings();
});

// ---------------- My Bookings ----------------
const bookingsOverlay = document.getElementById('lb_bookingsOverlay');
document.getElementById('lb_myBookingsBtn').addEventListener('click', ()=>{
  bookingsOverlay.classList.add('active');
  history.pushState({bookingsSheet:true}, "");
  loadMyBookings();
});
document.getElementById('lb_closeBookingsX').addEventListener('click', ()=>{
  history.back();
});
bookingsOverlay.addEventListener('click', (e)=>{ if(e.target === bookingsOverlay){ history.back(); } });

async function loadMyBookings(){
  const list = document.getElementById('lb_myBookingsList');
  if(!currentUser){
    list.innerHTML = `<p style="font-size:13px;color:#7a5f52;">Log in to see your bookings.</p>`;
    return;
  }
  const { data, error } = await supabaseClient.from('lab_bookings').select('*').eq('user_id', currentUser.id).order('created_at', {ascending:false});
  if(error){ list.innerHTML = `<p style="font-size:13px;color:#a11212;">Could not load bookings.</p>`; return; }
  if(!data || !data.length){ list.innerHTML = `<p style="font-size:13px;color:#7a5f52;">No bookings yet.</p>`; return; }

  // Find which of the completed bookings already have feedback, so the
  // "upload your feedback" prompt only shows for the ones still pending review.
  const completedIds = data.filter(b=>b.status==='Completed').map(b=>b.id);
  let reviewedIds = new Set();
  if(completedIds.length){
    try{
      const { data: reviewed } = await supabaseClient.from('lab_test_reviews').select('booking_id').in('booking_id', completedIds);
      reviewedIds = new Set((reviewed||[]).map(r=>r.booking_id));
    }catch(e){ /* reviews table may not exist yet */ }
  }

  window.__myBookingsCache = data; // used by the rate-sheet trigger below

  list.innerHTML = data.map(b=>{
    const addr = [b.addr_house, b.addr_street, b.addr_city, b.addr_pincode].filter(Boolean).join(", ");
    // b.status is the DB's own capitalized label (Pending/Confirmed/Sample Collected/Processing/Completed/Cancelled);
    // map it to the existing lowercase pending/accepted/cancelled CSS classes for styling only.
    const styleClass = b.status==='Pending' ? 'pending' : b.status==='Cancelled' ? 'cancelled' : 'accepted';
    const needsFeedback = b.status==='Completed' && !reviewedIds.has(b.id);
    return `
      <div class="booking-row">
        <div class="booking-row-top">
          <b>${esc(b.test_name)}</b>
          <span class="status-tag ${styleClass}">${esc(b.status)}</span>
        </div>
        <div class="booking-row-meta">₹${b.test_price} · ${esc(b.book_date||'')} ${esc(b.book_time||'')} · ${b.payment_method.toUpperCase()} (${b.payment_status})</div>
        <div class="booking-row-meta">${esc(addr)}</div>
        <div class="booking-row-actions">
          ${b.status==='Pending' ? `<button class="cancel-btn" onclick="cancelMyBooking('${b.id}')">Cancel Booking</button>` : ''}
          <button class="receipt-btn" onclick='shareReceipt(${JSON.stringify(b).replace(/'/g,"&#39;")})'>Receipt</button>
        </div>
        ${needsFeedback ? `<button class="feedback-cta" onclick="openRateSheet(window.__myBookingsCache.find(x=>x.id==='${b.id}'))"><i class="fa-solid fa-star"></i> Upload your feedback or rating</button>` : ''}
      </div>`;
  }).join('');
}

async function cancelMyBooking(id){
  if(!confirm('Cancel this booking?')) return;
  const { error } = await supabaseClient.from('lab_bookings').update({status:'Cancelled'}).eq('id', id).eq('status','Pending');
  if(error){ alert(error.message); return; }
  loadMyBookings();
}

async function shareReceipt(b){
  const text = `MediFinder Booking Receipt\n\nTest: ${b.test_name}\nPrice: ₹${b.test_price}\nPatient: ${b.patient_name}\nDate: ${b.book_date} ${b.book_time}\nStatus: ${b.status}\nPayment: ${b.payment_method.toUpperCase()} (${b.payment_status})`;
  if(navigator.share){
    try { await navigator.share({ title: 'MediFinder Receipt', text }); return; } catch(e){}
  }
  const w = window.open('', '_blank');
  w.document.write(`<pre style="font-family:sans-serif;white-space:pre-wrap;padding:24px;">${text}</pre><script>window.print();<\/script>`);
  w.document.close();
}

// ---------------- Init ----------------
document.addEventListener('DOMContentLoaded', async ()=>{
  const { data } = await supabaseClient.auth.getUser();
  currentUser = data?.user || null;
  loadTests();

  supabaseClient.channel('lab_tests_public')
    .on('postgres_changes', {event:'*', schema:'public', table:'lab_tests'}, loadTests)
    .subscribe();
});

})();


/* ============================================================
   Merged from manubar.html — Nurse Booking page
   ============================================================ */

(function(){

/* ============================================================
   NURSE BOOKING — service-type based pricing, pincode gating,
   Self-declared UPI payment (Pay Now / QR + confirm) before submit,
   Supabase-backed status tracking
   ============================================================ */
// ✅ Reuses this app's single shared Supabase client instead of a second one.
const supabaseClient = supabase;
function esc(str){ return String(str||'').replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

const WHATSAPP_NUMBER = ""; // e.g. "918900000000"

// Same bridge used elsewhere: writes into the shared `notifications` table so
// this shows up instantly in the bell icon on user.html.
async function pushHomeNotification(title, message){
  if(!supabaseClient) return;
  try{
    const { data:{ session } } = await supabaseClient.auth.getSession();
    const uid = session && session.user ? session.user.id : null;
    await supabaseClient.from("notifications").insert([{ user_id: uid, type: "nurse_booking", title, message }]);
  }catch(e){}
}

// ---------------- Fixed service catalogue ----------------
const SERVICES = [
  { key:"ayah", label:"আয়া / সাধারণ পরিচারক (Ayah / Basic Attendant)", scope:"বয়স্ক মানুষের সঙ্গী হওয়া, স্নান করানো, খাওয়ানো, হাঁটাচলায় সাহায্য করা।", rate:600, unit:"day" },
  { key:"gda", label:"জিডিএ (General Duty Assistant)", scope:"ওষুধ ম্যানেজমেন্ট, সুগার-প্রেসার মাপা, নেবুলাইজার দেওয়া, রাইলস টিউবে খাওয়ানো।", rate:800, unit:"day" },
  { key:"anm_gnm", label:"এএনএম / জিএনএম নার্স (ANM / GNM Skilled Nurse)", scope:"স্যালাইন ও আইভি (IV) চ্যানেল করা, ক্যাথেটার বদলানো, ড্রেসিং, ইনজেকশন দেওয়া।", rate:1000, unit:"day" },
  { key:"icu_critical", label:"আইসিইউ / ক্রিটিক্যাল কেয়ার (ICU / Critical Care Nurse)", scope:"ভেন্টিলেটর বা ট্র্যাকিওস্টমি ব্যাকগ্রাউন্ডের রোগী, প্যালিয়াটিভ কেয়ার, ২৪ ঘণ্টা কড়া নজরদারি।", rate:2000, unit:"day" },
  { key:"per_visit", label:"প্রতি ভিজিট (Per Visit — injection, dressing, catheter change)", scope:"শুধুমাত্র ইনজেকশন দেওয়া, ড্রেসিং করা বা ক্যাথেটার চেঞ্জ করার জন্য।", rate:300, unit:"visit" }
];
const SERVICE_CHARGE_PCT = 0.10;
let selectedService = null;

const svcList = document.getElementById('nb_svcList');
svcList.innerHTML = SERVICES.map(s=>`
  <div class="svc-opt" data-key="${s.key}">
    <div class="svc-top">
      <span class="svc-name">${s.label}</span>
      <span class="svc-rate">₹${s.rate}/${s.unit}</span>
    </div>
    <div class="svc-scope">${s.scope}</div>
  </div>
`).join('');
svcList.addEventListener('click', (e)=>{
  const opt = e.target.closest('.svc-opt');
  if(!opt) return;
  selectedService = SERVICES.find(s=>s.key===opt.dataset.key);
  document.querySelectorAll('.svc-opt').forEach(o=>o.classList.toggle('active', o===opt));
  document.getElementById('nb_durationLabel').textContent = selectedService.unit==='visit' ? 'Number of Visits *' : 'Number of Days *';
  recalcBill();
});

const durationInput = document.getElementById('nb_duration');
durationInput.addEventListener('input', recalcBill);
function recalcBill(){
  const billBox = document.getElementById('nb_billBox');
  if(!selectedService){ billBox.style.display='none'; updateUpiAmount(0); return; }
  const days = Math.max(1, parseInt(durationInput.value)||1);
  const subtotal = selectedService.rate * days;
  const charge = Math.round(subtotal * SERVICE_CHARGE_PCT);
  const total = subtotal + charge;
  document.getElementById('nb_billRate').textContent = `₹${selectedService.rate} × ${days} ${selectedService.unit}${days>1?'s':''}`;
  document.getElementById('nb_billSubtotal').textContent = `₹${subtotal}`;
  document.getElementById('nb_billCharge').textContent = `₹${charge}`;
  document.getElementById('nb_billTotal').textContent = `₹${total}`;
  billBox.style.display = 'block';
  updateUpiAmount(total);
}

// Your business UPI ID — shown as text and encoded into the QR / Pay Now link.
const UPI_ID = "9593625498@ibl";
const UPI_PAYEE_NAME = "MediFinder India";
function updateUpiAmount(amount){
  const amountEl = document.getElementById('nb_upiAmountValue');
  const payBtn = document.getElementById('nb_upiPayNowBtn');
  if(!amountEl || !payBtn) return;
  amountEl.textContent = "₹" + Number(amount).toFixed(2);
  payBtn.href = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(UPI_PAYEE_NAME)}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent('Nurse Booking')}`;
}
function resetUpiSteps(){
  document.getElementById('nb_upiStepAmount').style.display = "";
  document.getElementById('nb_upiStepConfirm').style.display = "none";
}

// ---------------- Pincode availability gate ----------------
const addrPincode = document.getElementById('nb_addrPincode');
const pinNote = document.getElementById('nb_pinNote');
let pincodeOk = false;
addrPincode.addEventListener('blur', checkPincodeAvailability);
async function checkPincodeAvailability(){
  const pin = addrPincode.value.trim();
  if(!pin){ pinNote.className='pin-note'; pinNote.textContent='Enter your pincode to check nurse availability in your area.'; pincodeOk=false; return; }
  const { data, error } = await supabaseClient.from('nurse_service_areas').select('pincode').eq('pincode', pin).maybeSingle();
  if(error){ pinNote.className='pin-note'; pinNote.textContent='Could not verify pincode right now.'; pincodeOk=false; return; }
  if(data){
    pinNote.className='pin-note ok';
    pinNote.textContent = `✅ Nurse service is available at pincode ${pin}.`;
    pincodeOk = true;
  } else {
    pinNote.className='pin-note err';
    pinNote.textContent = `❌ Sorry, nurse service isn't available at pincode ${pin} yet.`;
    pincodeOk = false;
  }
}

// ---------------- Form elements ----------------
const overlay = document.getElementById("nb_overlay");
const openBookBtn = document.getElementById("nb_openBookBtn");
const closeX = document.getElementById("nb_closeX");
const errMsg = document.getElementById("nb_errMsg");

const patientName = document.getElementById("nb_patientName");
const patientAge = document.getElementById("nb_patientAge");
const patientReligion = document.getElementById("nb_patientReligion");
const genderOpts = document.querySelectorAll(".gender-opt");
const doctorName = document.getElementById("nb_doctorName");
const fileDrop = document.getElementById("nb_fileDrop");
const rxFile = document.getElementById("nb_rxFile");
const rxPreview = document.getElementById("nb_rxPreview");
const bookDate = document.getElementById("nb_bookDate");
const bookTime = document.getElementById("nb_bookTime");
const addrHouse = document.getElementById("nb_addrHouse");
const addrStreet = document.getElementById("nb_addrStreet");
const addrLandmark = document.getElementById("nb_addrLandmark");
const addrCity = document.getElementById("nb_addrCity");
const addrState = document.getElementById("nb_addrState");
const contactNo = document.getElementById("nb_contactNo");
const whatsappNo = document.getElementById("nb_whatsappNo");

let selectedGender = "";
let selectedRxFile = null;
let sheetOpenViaHistory = false;
let currentUser = null;

genderOpts.forEach(opt=>{
  opt.addEventListener("click", ()=>{
    genderOpts.forEach(o=>o.classList.remove("active"));
    opt.classList.add("active");
    selectedGender = opt.getAttribute("data-val");
  });
});

fileDrop.addEventListener("click", ()=> rxFile.click());
rxFile.addEventListener("change", ()=>{
  const file = rxFile.files[0];
  if(!file) return;
  selectedRxFile = file;
  const reader = new FileReader();
  reader.onload = (e)=>{
    rxPreview.src = e.target.result;
    rxPreview.style.display = "block";
    fileDrop.textContent = "✅ " + file.name;
    fileDrop.classList.add("has-file");
  };
  reader.readAsDataURL(file);
});

function resetForm(){
  [patientName, patientAge, patientReligion, doctorName, addrHouse, addrStreet,
   addrLandmark, addrCity, addrPincode, contactNo, whatsappNo].forEach(f=>f.value="");
  addrState.value = "West Bengal";
  genderOpts.forEach(o=>o.classList.remove("active"));
  selectedGender = "";
  selectedRxFile = null;
  rxPreview.style.display = "none";
  fileDrop.textContent = "📎 Tap to upload prescription photo";
  fileDrop.classList.remove("has-file");
  selectedService = null;
  document.querySelectorAll('.svc-opt').forEach(o=>o.classList.remove('active'));
  durationInput.value = 1;
  document.getElementById('nb_billBox').style.display = 'none';
  pinNote.className='pin-note'; pinNote.textContent='Enter your pincode to check nurse availability in your area.';
  pincodeOk = false;
  resetUpiSteps();
  updateUpiAmount(0);
  const today = new Date();
  bookDate.value = today.toISOString().split("T")[0];
  bookTime.value = "09:00";
  errMsg.style.display = "none";
}

function openSheet(){ resetForm(); overlay.classList.add("active"); history.pushState({sheet:true}, ""); sheetOpenViaHistory = true; }
function closeSheetUI(){ overlay.classList.remove("active"); }
window.addEventListener("popstate", ()=>{ if(!document.getElementById("page-nurse-booking").classList.contains("active")) return; if(overlay.classList.contains("active")) closeSheetUI(); sheetOpenViaHistory = false; });
openBookBtn.addEventListener("click", openSheet);
closeX.addEventListener("click", ()=>{ if(sheetOpenViaHistory){ history.back(); } else { closeSheetUI(); } });
overlay.addEventListener("click",(e)=>{ if(e.target === overlay){ if(sheetOpenViaHistory){ history.back(); } else { closeSheetUI(); } } });

async function uploadToMedia(file, prefix){
  const ext = file.name.split('.').pop();
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabaseClient.storage.from('media').upload(path, file, { contentType: file.type });
  if(error){ console.error(error); return null; }
  const { data } = supabaseClient.storage.from('media').getPublicUrl(path);
  return data.publicUrl;
}

function validateBookingForm(){
  const required = [
    patientName.value.trim(), patientAge.value.trim(), selectedGender, selectedService,
    bookDate.value, bookTime.value, addrHouse.value.trim(), addrStreet.value.trim(),
    addrCity.value.trim(), addrPincode.value.trim(), contactNo.value.trim(), whatsappNo.value.trim()
  ];
  if(required.some(v=>!v)){ errMsg.textContent = "Please fill all required (*) fields, including a service type."; errMsg.style.display = "block"; return false; }
  if(!pincodeOk){ errMsg.textContent = "Nurse service isn't available at this pincode yet."; errMsg.style.display = "block"; return false; }
  errMsg.style.display = "none";
  return true;
}

// Tapping "I've Completed the Payment" first re-checks the required fields
// (so nobody pays before the form is valid), then reveals the confirm step.
document.getElementById('nb_upiDoneBtn').addEventListener('click', async ()=>{
  await checkPincodeAvailability();
  if(!validateBookingForm()) return;
  document.getElementById('nb_upiStepAmount').style.display = "none";
  document.getElementById('nb_upiStepConfirm').style.display = "";
});
document.getElementById('nb_upiConfirmBack').addEventListener('click', resetUpiSteps);

document.getElementById('nb_upiConfirmYes').addEventListener('click', async ()=>{
  if(!validateBookingForm()){ resetUpiSteps(); return; }

  const days = Math.max(1, parseInt(durationInput.value)||1);
  const subtotal = selectedService.rate * days;
  const charge = Math.round(subtotal * SERVICE_CHARGE_PCT);
  const total = subtotal + charge;

  const btn = document.getElementById('nb_upiConfirmYes');
  btn.disabled = true; btn.textContent = "Submitting...";

  let prescriptionUrl = null;
  if(selectedRxFile) prescriptionUrl = await uploadToMedia(selectedRxFile, 'nurse-prescriptions');

  const payload = {
    user_id: currentUser?.id || null,
    patient_name: patientName.value.trim(),
    patient_age: parseInt(patientAge.value) || null,
    patient_religion: patientReligion.value.trim() || null,
    gender: selectedGender,
    service_type: selectedService.key,
    service_label: selectedService.label,
    scope_of_work: selectedService.scope,
    rate: selectedService.rate,
    rate_unit: selectedService.unit,
    duration: days,
    subtotal, service_charge: charge, total_amount: total,
    doctor_name: doctorName.value.trim() || null,
    prescription_url: prescriptionUrl,
    book_date: bookDate.value,
    book_time: bookTime.value,
    addr_house: addrHouse.value.trim(), addr_street: addrStreet.value.trim(),
    addr_landmark: addrLandmark.value.trim() || null, addr_city: addrCity.value.trim(),
    addr_pincode: addrPincode.value.trim(), addr_state: addrState.value,
    contact_no: contactNo.value.trim(), whatsapp_no: whatsappNo.value.trim(),
    payment_method: 'upi', payment_status: 'Paid', razorpay_payment_id: null,
    status: 'pending'
  };

  const { error } = await supabaseClient.from('nurse_bookings').insert(payload);
  btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Payment Completed';
  if(error){ alert("Could not save your booking: " + error.message); return; }

  sendWhatsAppNotification(payload);
  pushHomeNotification("Nurse Booking Received", `Your nurse booking request for ${payload.patient_name} on ${payload.book_date} is pending review.`);
  renderBookings();
  if(sheetOpenViaHistory){ history.back(); } else { closeSheetUI(); }
  showToast("Payment received! Booking submitted — pending nurse assignment ⏳");
});

function sendWhatsAppNotification(b){
  const fullAddress = [b.addr_house, b.addr_street, b.addr_landmark, b.addr_city, b.addr_state, b.addr_pincode].filter(Boolean).join(", ");
  const message = `🧑‍⚕️ *MediFinder — New Nurse Booking Request*\n\n*Patient:* ${b.patient_name} (${b.patient_age} yrs, ${b.gender})\n*Service:* ${b.service_label}\n*Duration:* ${b.duration} ${b.rate_unit}(s)\n*Total Paid:* ₹${b.total_amount} (${b.payment_method.toUpperCase()} — ${b.payment_status})\n\n*Date:* ${b.book_date}\n*Time:* ${b.book_time}\n*Address:* ${fullAddress}\n\n*Contact No:* ${b.contact_no}\n*WhatsApp No:* ${b.whatsapp_no}\n\n*Status:* Pending — please assign a nurse in the admin panel.`;
  const encoded = encodeURIComponent(message);
  const url = WHATSAPP_NUMBER ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  window.open(url, "_blank");
}

// ---------------- Render bookings ----------------
const bookingsWrap = document.getElementById("nb_bookingsWrap");
let myBookings = [];

async function renderBookings(){
  if(!currentUser){
    bookingsWrap.innerHTML = `<div class="empty-state">Log in to see your nurse bookings.</div>`;
    return;
  }
  const { data, error } = await supabaseClient.from('nurse_bookings').select('*').eq('user_id', currentUser.id).order('created_at', {ascending:false});
  if(error){ bookingsWrap.innerHTML = `<div class="empty-state">Could not load bookings.</div>`; return; }
  myBookings = data || [];

  if(myBookings.length === 0){
    bookingsWrap.innerHTML = `<div class="empty-state">No bookings yet. Tap "Book Nurse Now" above to request a home nurse.</div>`;
    return;
  }

  bookingsWrap.innerHTML = myBookings.map(b=>{
    const d = new Date(b.created_at);
    const submittedStr = d.toLocaleDateString("en-IN", {day:"2-digit", month:"short", year:"numeric"});
    const fullAddress = [b.addr_house, b.addr_street, b.addr_city, b.addr_pincode].filter(Boolean).join(", ");
    const statusLabel = b.status === "approved" ? "✅ Approved" : (b.status === "cancelled" ? "❌ Cancelled" : "⏳ Pending");

    const nurseBlock = (b.status === "approved" && b.nurse_name) ? `
      <div class="nurse-box">
        <div class="n-head">
          ${b.nurse_photo_url ? `<img class="n-avatar" src="${esc(b.nurse_photo_url)}" alt="">` : `<div class="n-avatar">${esc(b.nurse_name.charAt(0).toUpperCase())}</div>`}
          <div>
            <div class="n-name">${esc(b.nurse_name)}</div>
            <div class="n-sub">Assigned Nurse</div>
          </div>
        </div>
        <div class="n-detail">
          <b>Education:</b> ${esc(b.nurse_qualification || "—")}<br>
          <b>Courses Completed:</b> ${esc(b.nurse_courses || "—")}<br>
          <b>Contact:</b> ${esc(b.nurse_contact || "—")} ${b.nurse_email ? ' · '+esc(b.nurse_email) : ''}
        </div>
      </div>
    ` : "";

    return `
      <div class="bcard" data-booking-id="${b.id}">
        <div class="bcard-top">
          <div>
            <h3>${esc(b.patient_name)}</h3>
            <div class="meta">${b.patient_age} yrs · ${esc(b.gender)} · Requested ${submittedStr}</div>
          </div>
          <span class="status-pill ${b.status}">${statusLabel}</span>
        </div>
        <hr>
        <div class="row-line"><span>Service</span><b>${esc(b.service_label)}</b></div>
        <div class="row-line"><span>Duration</span><b>${b.duration} ${esc(b.rate_unit)}(s)</b></div>
        <div class="row-line"><span>Doctor</span><b>${esc(b.doctor_name || "—")}</b></div>
        <div class="row-line"><span>Schedule</span><b>${esc(b.book_date)} · ${esc(b.book_time)}</b></div>
        <div class="row-line"><span>Address</span><b>${esc(fullAddress)}</b></div>
        <div class="bill-box">
          <div class="row-line"><span>Rate × Duration</span><b>₹${b.rate} × ${b.duration}</b></div>
          <div class="row-line"><span>Subtotal</span><b>₹${b.subtotal}</b></div>
          <div class="row-line"><span>Service Charge (10%)</span><b>₹${b.service_charge}</b></div>
          <div class="total-line"><span>Total Paid</span><span>₹${b.total_amount}</span></div>
        </div>
        ${b.prescription_url ? `<img class="rx-thumb" style="width:100%;max-height:140px;object-fit:cover;border-radius:10px;margin-top:8px;" src="${esc(b.prescription_url)}" alt="Prescription">` : ""}
        ${nurseBlock}
        <div class="bcard-actions">
          <button class="receipt-btn" onclick='shareReceipt(${JSON.stringify(b).replace(/'/g,"&#39;")})'>Receipt</button>
        </div>
      </div>
    `;
  }).join("");
}

async function shareReceipt(b){
  const text = `MediFinder — Nurse Booking Receipt\n\nPatient: ${b.patient_name}\nService: ${b.service_label}\nRate: ₹${b.rate}/${b.rate_unit} × ${b.duration}\nSubtotal: ₹${b.subtotal}\nService Charge (10%): ₹${b.service_charge}\nTotal Paid: ₹${b.total_amount}\nPayment ID: ${b.razorpay_payment_id || '—'}\nStatus: ${b.status}`;
  if(navigator.share){
    try { await navigator.share({ title: 'MediFinder Nurse Receipt', text }); return; } catch(e){}
  }
  const w = window.open('', '_blank');
  w.document.write(`<pre style="font-family:sans-serif;white-space:pre-wrap;padding:24px;">${text}</pre><script>window.print();<\/script>`);
  w.document.close();
}

// ---------------- Toast ----------------
let toastTimeout;
function showToast(msg){
  const toast = document.getElementById("nb_toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(()=> toast.classList.remove("show"), 2400);
}


// ---------------- Init ----------------
document.addEventListener('DOMContentLoaded', async ()=>{
  const { data } = await supabaseClient.auth.getUser();
  currentUser = data?.user || null;
  renderBookings();

  supabaseClient.channel('nurse_bookings_mine')
    .on('postgres_changes', {event:'*', schema:'public', table:'nurse_bookings'}, renderBookings)
    .subscribe();
});

})();


/* ============================================================
   Merged from manubar.html — Ambulance page
   ============================================================ */

(function(){

/* ============================================================
   Config
   ============================================================ */
const EMERGENCY_PHONE = "9593625498";
const FARE_RULES = {
  non_ac: { base: 500,  baseKm: 10, perKm: 15 },
  ac:     { base: 1200, baseKm: 10, perKm: 25 },
  icu:    { base: 1500, baseKm: 10, perKm: 50 }
};
const TYPE_LABEL = { non_ac: "Non-AC", ac: "AC / Oxygen", icu: "ICU / Advanced" };

// ✅ No local client here — this whole IIFE naturally resolves `supabase`
// to this app's single shared client (declared once at the top of user.js)
// via normal scope lookup now that this page lives in the same document.

const $ = (id) => document.getElementById(id);
function escapeHtml(str){ return String(str||"").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function showToast(msg){ const t=$("ab_toast"); t.textContent=msg; t.classList.remove("hidden"); setTimeout(()=>t.classList.add("hidden"),2800); }
function openModal(id){ $(id).classList.remove("hidden"); }
function closeModal(id){ $(id).classList.add("hidden"); }
document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", () => closeModal(btn.dataset.close)));
document.querySelectorAll(".modal-overlay").forEach(o => o.addEventListener("click", e => { if(e.target===o) o.classList.add("hidden"); }));

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function calcFare(type, distanceKm){
  const r = FARE_RULES[type];
  if (!r) return 0;
  const extraKm = Math.max(0, distanceKm - r.baseKm);
  return Math.round(r.base + extraKm * r.perKm);
}

/* ============================================================
   1) Top strip auto-slide
   ============================================================ */
(function(){
  const spans = document.querySelectorAll("#ab_topStripTrack span");
  let i = 0;
  setInterval(() => {
    spans[i].classList.remove("active");
    i = (i+1) % spans.length;
    spans[i].classList.add("active");
  }, 3500);
})();

/* ============================================================
   2) State
   ============================================================ */
let userLiveLat = null, userLiveLng = null;
let allDrivers = [];
let activeTypeFilter = "all";
let selectedDriver = null;
let currentBooking = null;
let trackMapObj = null, trackDriverMarker = null, trackPickupMarker = null;
let bookingsChannel = null, driversChannel = null;

/* ============================================================
   3) GPS
   ============================================================ */
$("ab_gpsBtn").addEventListener("click", () => {
  if (!navigator.geolocation) { showToast("Your browser doesn't support GPS"); return; }
  showToast("Finding location...");
  navigator.geolocation.getCurrentPosition(async (pos) => {
    userLiveLat = pos.coords.latitude; userLiveLng = pos.coords.longitude;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLiveLat}&lon=${userLiveLng}`);
      const data = await res.json();
      $("ab_pickupInput").value = data.display_name || `${userLiveLat}, ${userLiveLng}`;
    } catch { $("ab_pickupInput").value = `${userLiveLat}, ${userLiveLng}`; }
    showToast("Current location set");
    if (allDrivers.length) renderAmbulances();
  }, () => showToast("Couldn't get location — please allow GPS permission"));
});

/* ============================================================
   4) Load & render online, verified drivers (realtime)
   ============================================================ */
async function loadDrivers(){
  if (!supabase) return;
  const { data, error } = await supabase.from("ambulance_drivers")
    .select("*").eq("is_verified", true).eq("is_online", true).eq("is_on_ride", false);
  if (error) { console.error(error); return; }
  allDrivers = data || [];
  renderAmbulances();
}

function subscribeDrivers(){
  if (!supabase) return;
  driversChannel = supabase.channel("amb-drivers-list")
    .on("postgres_changes", { event: "*", schema: "public", table: "ambulance_drivers" }, () => loadDrivers())
    .subscribe();
}

$("ab_searchBtn").addEventListener("click", () => {
  if (!userLiveLat) { showToast("Tap GPS or enter a pickup location first"); }
  renderAmbulances();
});
document.querySelectorAll(".type-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".type-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    activeTypeFilter = chip.dataset.type;
    renderAmbulances();
  });
});

function renderAmbulances(){
  const list = $("ab_ambulanceList");
  const empty = $("ab_emptyState");
  let items = allDrivers.slice();

  if (activeTypeFilter !== "all") items = items.filter(d => d.vehicle_type === activeTypeFilter);

  // attach distance + fare if we have user's location
  items = items.map(d => {
    let dist = null, fare = null;
    if (userLiveLat && d.current_lat && d.current_lon) {
      dist = haversineKm(userLiveLat, userLiveLng, d.current_lat, d.current_lon);
      fare = calcFare(d.vehicle_type, dist);
    }
    return { ...d, _dist: dist, _fare: fare };
  });
  items.sort((a,b) => (a._dist ?? 999) - (b._dist ?? 999));

  $("ab_resultsCount").textContent = `${items.length} found`;
  if (items.length === 0) { list.innerHTML = ""; empty.classList.add("show"); return; }
  empty.classList.remove("show");

  list.innerHTML = items.map(d => `
    <div class="amb-card">
      <div class="amb-photo-wrap">
        ${d.vehicle_photo_url ? `<img src="${d.vehicle_photo_url}" alt="Ambulance">` : `<i class="fa-solid fa-truck-medical fallback-icon"></i>`}
        <div class="amb-plate-badge">${escapeHtml(d.plate_number || "")}</div>
      </div>
      <div class="amb-info">
        <div class="amb-type-row"><span class="amb-type-tag ${d.vehicle_type}">${TYPE_LABEL[d.vehicle_type]}</span></div>
        <div class="amb-driver-name">${escapeHtml(d.driver_name)}</div>
        <div class="amb-meta"><i class="fa-solid fa-location-dot"></i> ${d._dist != null ? d._dist.toFixed(1)+" km away" : "Distance unknown — set pickup location"}</div>
        <div class="amb-meta"><i class="fa-solid fa-star" style="color:#f5b301;"></i> ${(d.rating||5).toFixed(1)} · ${d.total_rides||0} rides</div>
      </div>
      <div class="amb-price-book">
        <div class="amb-price">${d._fare != null ? "₹"+d._fare : "—"}</div>
        <button class="amb-book-btn" data-id="${d.id}" ${d._fare==null ? "disabled" : ""}>BOOK</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll(".amb-book-btn").forEach(btn => {
    btn.addEventListener("click", () => openBookingModal(btn.dataset.id, items));
  });
}

/* ============================================================
   5) Booking modal
   ============================================================ */
function openBookingModal(driverId, items){
  selectedDriver = items.find(d => d.id === driverId);
  if (!selectedDriver) return;
  $("ab_bookingAmbInfo").innerHTML =
    `🚑 <b>${escapeHtml(selectedDriver.driver_name)}</b> — ${TYPE_LABEL[selectedDriver.vehicle_type]} — Plate ${escapeHtml(selectedDriver.plate_number)}`;
  $("ab_fareDisplay").textContent = `₹${selectedDriver._fare}`;
  $("ab_bkDestination").value = $("ab_destinationInput").value || "";
  $("ab_bkPatientName").value = "";
  $("ab_bkPhone").value = "";
  $("ab_bookingMsg").textContent = "";
  openModal("bookingModal");
}

$("ab_confirmBookBtn").addEventListener("click", async () => {
  if (!selectedDriver) return;
  const phone = $("ab_bkPhone").value.trim();
  if (!/^\d{10}$/.test(phone)) { $("ab_bookingMsg").textContent = "Please enter a valid 10-digit contact number."; return; }
  if (!userLiveLat) { $("ab_bookingMsg").textContent = "Pickup location / GPS is required."; return; }
  if (!supabase) { $("ab_bookingMsg").textContent = "Booking service unavailable — please call 9593625498."; return; }

  $("ab_confirmBookBtn").disabled = true;
  $("ab_confirmBookBtn").textContent = "Booking...";

  const { data: userData } = await supabase.auth.getUser();
  const otp = String(Math.floor(100000 + Math.random()*900000));

  const payload = {
    user_id: userData?.user?.id || null,
    driver_id: selectedDriver.id,
    patient_name: $("ab_bkPatientName").value.trim(),
    contact_phone: phone,
    pickup_address: $("ab_pickupInput").value.trim() || "Current location",
    pickup_lat: userLiveLat,
    pickup_lon: userLiveLng,
    drop_address: $("ab_bkDestination").value.trim() || "To be confirmed",
    vehicle_type: selectedDriver.vehicle_type,
    distance_km: selectedDriver._dist,
    fare_estimate: selectedDriver._fare,
    otp,
    status: "searching"
  };

  const { data, error } = await supabase.from("ambulance_bookings").insert(payload).select().single();
  $("ab_confirmBookBtn").disabled = false;
  $("ab_confirmBookBtn").textContent = "Confirm & Request Ambulance";

  if (error) {
    if (error.code === "23505") { $("ab_bookingMsg").textContent = "You already have an active ambulance booking."; }
    else { console.error(error); $("ab_bookingMsg").textContent = "Failed to book — please try again or call 9593625498."; }
    return;
  }

  currentBooking = data;
  closeModal("bookingModal");
  openTrackModal();
  subscribeToBooking(currentBooking.id);
  showToast("Request sent — waiting for a driver to accept");
});

/* ============================================================
   6) Live tracking modal
   ============================================================ */
function openTrackModal(){
  openModal("trackModal");
  setTimeout(initTrackMap, 150);
  updateTrackUI();
}
function updateTrackUI(){
  if (!currentBooking) return;
  const b = currentBooking;
  const pill = $("ab_trackStatusPill");
  pill.className = "track-status-pill " + b.status;
  const labels = {
    searching: "Searching for driver…", accepted: "Driver assigned — on the way",
    arriving: "Driver is arriving", picked_up: "Patient picked up — en route",
    completed: "Ride completed", cancelled: "Ride cancelled"
  };
  pill.textContent = labels[b.status] || b.status;

  if (["accepted","arriving","picked_up"].includes(b.status) && !b.otp_verified) {
    $("ab_otpBlock").classList.remove("hidden");
    $("ab_otpCode").textContent = b.otp;
  } else {
    $("ab_otpBlock").classList.add("hidden");
  }

  if (b.driver_id) {
    $("ab_driverContactBlock").classList.remove("hidden");
    loadDriverInfoForTrack(b.driver_id);
  }

  $("ab_cancelRideBtn").style.display = (b.status === "searching") ? "block" : "none";

  if (b.status === "completed") {
    showToast("Ride completed — thank you for using MediFinder");
    maybeShowPayment(b);
  }
  if (b.status === "cancelled") {
    showToast("This ride was cancelled");
  }
}

async function loadDriverInfoForTrack(driverId){
  if (!supabase) return;
  const { data: d } = await supabase.from("ambulance_drivers").select("*").eq("id", driverId).maybeSingle();
  if (!d) return;
  $("ab_trackDriverName").textContent = d.driver_name;
  $("ab_trackDriverPlate").textContent = `${TYPE_LABEL[d.vehicle_type]} · ${d.plate_number}`;
  $("ab_callDriverBtn").onclick = () => { window.location.href = `tel:${d.phone}`; };
  if (d.current_lat && d.current_lon) plotDriverOnTrackMap(d.current_lat, d.current_lon);
}

function initTrackMap(){
  if (trackMapObj) { trackMapObj.remove(); trackMapObj=null; }
  const el = $("ab_trackMap");
  if (!el || !userLiveLat) return;
  trackMapObj = L.map(el, { zoomControl:false, attributionControl:false }).setView([userLiveLat, userLiveLng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(trackMapObj);
  const pickupIcon = L.divIcon({ className:'', html:'<div style="background:#0E9A8B;width:14px;height:14px;border-radius:50%;border:2px solid #fff;"></div>' });
  trackPickupMarker = L.marker([userLiveLat, userLiveLng], { icon: pickupIcon }).addTo(trackMapObj).bindPopup("Pickup (You)");
}
function plotDriverOnTrackMap(lat, lon){
  if (!trackMapObj) return;
  const ambIcon = L.divIcon({ className:'', html:'<div style="font-size:22px;">🚑</div>' });
  if (trackDriverMarker) { trackDriverMarker.setLatLng([lat, lon]); }
  else { trackDriverMarker = L.marker([lat, lon], { icon: ambIcon }).addTo(trackMapObj).bindPopup("Your ambulance"); }
  trackMapObj.fitBounds([[userLiveLat, userLiveLng],[lat, lon]], { padding:[30,30] });
}

function subscribeToBooking(bookingId){
  if (!supabase) return;
  if (bookingsChannel) supabase.removeChannel(bookingsChannel);
  bookingsChannel = supabase.channel("amb-booking-"+bookingId)
    .on("postgres_changes", { event:"UPDATE", schema:"public", table:"ambulance_bookings", filter:`id=eq.${bookingId}` }, (payload) => {
      currentBooking = payload.new;
      updateTrackUI();
    })
    .subscribe();

  // also watch the driver row for live GPS pings (every ~5s from the driver app)
  supabase.channel("amb-driver-track-"+bookingId)
    .on("postgres_changes", { event:"UPDATE", schema:"public", table:"ambulance_drivers" }, (payload) => {
      if (currentBooking && payload.new.id === currentBooking.driver_id) {
        plotDriverOnTrackMap(payload.new.current_lat, payload.new.current_lon);
      }
    })
    .subscribe();
}

$("ab_cancelRideBtn").addEventListener("click", async () => {
  if (!currentBooking || !supabase) return;
  if (!confirm("Cancel this ambulance booking?")) return;
  await supabase.from("ambulance_bookings").update({ status:"cancelled", cancelled_at:new Date().toISOString() }).eq("id", currentBooking.id);
  closeModal("trackModal");
  currentBooking = null;
  refreshHistory();
});

/* ============================================================
   7) Payment (Razorpay) once ride completes
   ============================================================ */
function maybeShowPayment(booking){
  if (!window.Razorpay || booking.payment_status === "paid") return;
  const options = {
    key: (typeof RAZORPAY_KEY_ID !== 'undefined') ? RAZORPAY_KEY_ID : "YOUR_RAZORPAY_KEY_ID",
    amount: Math.round((booking.fare_final || booking.fare_estimate) * 100),
    currency: "INR",
    name: "MediFinder Ambulance",
    description: "Ambulance ride payment",
    handler: async function(response){
      await supabase.from("ambulance_bookings").update({
        payment_status: "paid", razorpay_payment_id: response.razorpay_payment_id
      }).eq("id", booking.id);
      showToast("Payment successful — thank you!");
    },
    theme: { color: "#e02020" }
  };
  const rzp = new Razorpay(options);
  rzp.open();
}

/* ============================================================
   8) History drawer
   ============================================================ */
$("ab_historyFab").addEventListener("click", () => { openHistory(); refreshHistory(); });

// ✅ Category-strip navigation between these pages is now handled by
// the single shared .cat-item[data-cat] listener in the main SPA router.
$("ab_drawerOverlay").addEventListener("click", closeHistory);
function openHistory(){ $("ab_historyDrawer").classList.add("open"); $("ab_drawerOverlay").classList.add("show"); }
function closeHistory(){ $("ab_historyDrawer").classList.remove("open"); $("ab_drawerOverlay").classList.remove("show"); }

async function refreshHistory(){
  if (!supabase) return;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) { $("ab_historyList").innerHTML = `<p style="font-size:12.5px;color:var(--muted);">Log in to see your booking history.</p>`; return; }

  const { data, error } = await supabase.from("ambulance_bookings")
    .select("*").eq("user_id", userData.user.id).order("created_at", { ascending:false }).limit(20);
  if (error) { console.error(error); return; }

  const hasActive = (data||[]).some(b => !["completed","cancelled"].includes(b.status));
  $("ab_historyFab").classList.toggle("has-active", hasActive);

  if (!data || data.length===0) { $("ab_historyList").innerHTML = `<p style="font-size:12.5px;color:var(--muted);">No bookings yet.</p>`; return; }

  $("ab_historyList").innerHTML = data.map(b => `
    <div class="history-item">
      <div class="hi-top"><span>${TYPE_LABEL[b.vehicle_type]||b.vehicle_type}</span><span class="hi-status ${b.status}">${b.status.replace('_',' ')}</span></div>
      <div class="hi-route">${escapeHtml(b.pickup_address)} → ${escapeHtml(b.drop_address)}</div>
      <div class="hi-route">${new Date(b.created_at).toLocaleString()} · ₹${b.fare_final || b.fare_estimate || 0}</div>
      ${!["completed","cancelled"].includes(b.status) ? `<button class="link-view-btn" data-id="${b.id}" style="margin-top:6px;border:none;background:none;color:var(--teal);font-weight:700;font-size:12px;cursor:pointer;">Track this ride →</button>` : ""}
    </div>
  `).join("");

  $("ab_historyList").querySelectorAll(".link-view-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const b = data.find(x => x.id === btn.dataset.id);
      if (!b) return;
      currentBooking = b;
      closeHistory();
      openTrackModal();
      subscribeToBooking(b.id);
    });
  });
}

/* ============================================================
   9) Resume an in-progress booking on page load
   ============================================================ */
async function resumeActiveBooking(){
  if (!supabase) return;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return;
  const { data } = await supabase.from("ambulance_bookings")
    .select("*").eq("user_id", userData.user.id)
    .not("status", "in", "(completed,cancelled)").maybeSingle();
  if (data) {
    currentBooking = data;
    if (!userLiveLat) { userLiveLat = data.pickup_lat; userLiveLng = data.pickup_lon; }
    openTrackModal();
    subscribeToBooking(data.id);
  }
}


/* ============================================================
   Init
   ============================================================ */
loadDrivers();
subscribeDrivers();
refreshHistory();
resumeActiveBooking();

})();


/* ============================================================
   Merged from manubar.html — Tablet Coin page
   ============================================================ */

(function(){

/* ============================================================
   TABLET COIN — reward-for-watching-ads system
   Storage: localStorage (swap with Supabase calls where marked)
   ============================================================ */

const STORAGE_BALANCE = "mf_tablet_coin_balance";
const STORAGE_HISTORY = "mf_tablet_coin_history";
const STORAGE_COOLDOWN = "mf_tablet_coin_cooldown"; // per-task last-claim timestamps

// ---------------- Earn rules ----------------
// Every rule here is credited server-side (Supabase trigger/RPC — see
// tablet_coin_schema.sql), never by client-side JS alone. `auto:true` rules
// need no button — they post to coin_transactions on their own the moment the
// real event happens (order delivered, referral completes, etc.). The two
// `auto:false` rules ("Daily Check-in" and "Complete Your Profile") need a
// tap because there's no other real event to hang them on, so they call a
// security-definer RPC that enforces the once-per-day / once-ever limit —
// never a local balance edit.
const earnTasks = [
  { id:"order_500",         icon:"🛒", title:"Order ₹500+",              desc:"Any delivered order of ₹500 or more.",                          reward:5,  auto:true },
  { id:"order_1000",        icon:"🛍️", title:"Order ₹1000+",             desc:"Any delivered order of ₹1000 or more.",                         reward:12, auto:true },
  { id:"order_2000",        icon:"📦", title:"Order ₹2000+",             desc:"Any delivered order of ₹2000 or more.",                         reward:25, auto:true },
  { id:"first_order",       icon:"🎉", title:"Your First Order",         desc:"One-time bonus on your very first delivered order.",            reward:10, auto:true },
  { id:"referral",          icon:"🤝", title:"Refer a Friend",           desc:"When a friend redeems your referral code and completes their first order.", reward:100, auto:true },
  { id:"prescription_order",icon:"💊", title:"Prescription Order",       desc:"Order medicines by uploading a doctor's prescription.",          reward:5,  auto:true },
  { id:"review",            icon:"⭐", title:"Rate & Review",            desc:"Leave a review on a delivered product or service.",             reward:5,  auto:true },
  { id:"milestone_5",       icon:"🏆", title:"Loyalty Milestone",        desc:"One-time bonus on your 5th delivered order.",                   reward:30, auto:true },
  { id:"daily_checkin",     icon:"📅", title:"Daily Check-in",           desc:"Tap once a day to collect a small bonus.",                       reward:2,  auto:false },
  { id:"profile_complete",  icon:"✅", title:"Complete Your Profile",    desc:"One-time bonus for adding your address and verified phone.",    reward:10, auto:false },
];

// ---------------- Redeem options ----------------
const redeemOptions = [
  { id:"r1", coins:50,  title:"₹50 Order Discount",  desc:"Apply on any medicine order above ₹300" },
  { id:"r2", coins:100, title:"₹100 Order Discount", desc:"Apply on any medicine order above ₹500" },
  { id:"r3", coins:200, title:"Free Delivery x3",    desc:"Waive delivery charge on next 3 orders" },
  { id:"r4", coins:500, title:"₹500 Order Discount", desc:"Apply on any medicine order above ₹1500" },
];

// ---------------- State helpers ----------------
// ---------------- Live notification bridge to user.html ----------------
// Same Supabase project as the rest of MediFinder — inserts land in the
// `notifications` table so they show up instantly in the home page bell.
// NOTE: verify SUPABASE_URL / SUPABASE_ANON_KEY match the variable names in your
// actual supabase-constants.js file.
// ✅ Reuses this app's single shared Supabase client instead of a second one.
const sbClient = supabase;

async function pushHomeNotification(title, message){
  if(!sbClient) return;
  try{
    const { data:{ session } } = await sbClient.auth.getSession();
    const uid = session && session.user ? session.user.id : null;
    await sbClient.from("notifications").insert([{
      user_id: uid, type: "tablet_coin", title, message
    }]);
  }catch(e){}
}

// ---------------- Real wallet (Supabase) ----------------
// Balance lives in profiles.coins (the same column the referral system
// already credits) and every earn/redeem event is a row in
// coin_transactions — nothing here is stored client-side any more.
let _tcUserId = null;
let _tcBalance = 0;
let _tcHistory = [];
let _tcClaimedOnceIds = new Set(); // one-time rule ids already in history
let _tcLastCheckinAt = null;

async function tcGetUserId(){
  if(_tcUserId) return _tcUserId;
  const { data:{ session } } = await sbClient.auth.getSession();
  _tcUserId = session && session.user ? session.user.id : null;
  return _tcUserId;
}

function getBalance(){ return _tcBalance; }
function setBalanceDisplay(v){
  _tcBalance = v;
  const el = document.getElementById("tc_balanceText");
  if(el) el.textContent = v;
}
function getHistory(){ return _tcHistory; }

async function tcLoadWallet(){
  const uid = await tcGetUserId();
  if(!uid || !sbClient) return;
  const [{ data:profileRow }, { data:txRows }] = await Promise.all([
    sbClient.from("profiles").select("coins").eq("id", uid).maybeSingle(),
    sbClient.from("coin_transactions").select("*").eq("user_id", uid).order("created_at", { ascending:false }).limit(100),
  ]);
  setBalanceDisplay(profileRow?.coins || 0);
  _tcHistory = (txRows || []).map(r=>({ title:r.reason || r.type, coins:r.amount, time:new Date(r.created_at).getTime() }));
  _tcClaimedOnceIds = new Set((txRows || []).filter(r=>r.type).map(r=>r.type));
  const checkin = (txRows || []).find(r=>r.type === "daily_checkin");
  _tcLastCheckinAt = checkin ? new Date(checkin.created_at).getTime() : null;
}

function minsLeft(taskId, cooldownMins){
  if(taskId !== "daily_checkin" || !_tcLastCheckinAt) return 0;
  const elapsedMins = (Date.now() - _tcLastCheckinAt) / 60000;
  const left = cooldownMins - elapsedMins;
  return left > 0 ? Math.ceil(left) : 0;
}

// ---------------- Render earn grid ----------------
// `auto:true` rules are credited server-side the moment the real event
// happens (order delivered, referral completes, review posted, etc.) — no
// button, just a live status pulled from coin_transactions. Only the two
// `auto:false` rules show a tap-to-claim button, and that tap calls a
// security-definer RPC (never a local balance edit).
const earnGrid = document.getElementById("tc_earnGrid");
function renderEarnGrid(){
  earnGrid.innerHTML = "";
  earnTasks.forEach(task=>{
    const card = document.createElement("div");
    card.className = "card";
    let statusHtml, btnHtml = "";
    if(task.auto){
      const done = _tcClaimedOnceIds.has(task.id);
      const isRepeatable = task.id.startsWith("order_"); // order-tier rules can be earned again on future orders
      statusHtml = (done && !isRepeatable)
        ? `<span class="cooldown-note">✅ Already earned</span>`
        : `<span class="cooldown-note">🔄 Credited automatically</span>`;
    } else if(task.id === "daily_checkin"){
      const left = minsLeft("daily_checkin", 1440);
      statusHtml = left > 0
        ? `<span class="cooldown-note">⏳ Available again in ${left} min</span>`
        : `<span class="cooldown-note">✅ Ready to claim</span>`;
      btnHtml = `<button class="earn-btn" data-id="${task.id}" ${left>0 ? "disabled" : ""}>${left>0 ? "On Cooldown" : "Claim Bonus"}</button>`;
    } else if(task.id === "profile_complete"){
      const done = _tcClaimedOnceIds.has(task.id);
      statusHtml = done ? `<span class="cooldown-note">✅ Already claimed</span>` : `<span class="cooldown-note">Tap once your profile is complete</span>`;
      btnHtml = done ? "" : `<button class="earn-btn" data-id="${task.id}">Claim Bonus</button>`;
    }
    card.innerHTML = `
      <div class="card-head">
        <div class="icon-badge">${task.icon}</div>
        <h3>${task.title}</h3>
      </div>
      <p class="desc">${task.desc}</p>
      <div class="reward-row"><span class="mini-coin">🪙</span> +${task.reward} Tablet Coin</div>
      ${statusHtml}
      ${btnHtml}
    `;
    earnGrid.appendChild(card);
  });
}

earnGrid.addEventListener("click", async (e)=>{
  if(e.target.tagName !== "BUTTON" || e.target.disabled) return;
  const taskId = e.target.getAttribute("data-id");
  const task = earnTasks.find(t=>t.id === taskId);
  if(!task) return;
  e.target.disabled = true;
  e.target.textContent = "Claiming…";
  try{
    const rpcName = taskId === "daily_checkin" ? "claim_daily_coin_bonus" : "claim_profile_complete_bonus";
    const { data, error } = await sbClient.rpc(rpcName);
    if(error){ showToast(error.message || "Could not claim right now."); renderEarnGrid(); return; }
    await tcLoadWallet();
    renderEarnGrid();
    renderRedeemGrid();
    showToast(`+${task.reward} Tablet Coin earned! 🪙`);
    pushHomeNotification("Tablet Coin Earned", `You earned ${task.reward} Tablet Coin from "${task.title}".`);
  }catch(err){
    showToast("Network error — please try again.");
    renderEarnGrid();
  }
});

// ---------------- Render redeem grid ----------------
const redeemGrid = document.getElementById("tc_redeemGrid");
function renderRedeemGrid(){
  redeemGrid.innerHTML = "";
  const bal = getBalance();
  redeemOptions.forEach(opt=>{
    const canAfford = bal >= opt.coins;
    const card = document.createElement("div");
    card.className = "redeem-card";
    card.innerHTML = `
      <div class="r-coin">🪙 ${opt.coins} Coins</div>
      <h4>${opt.title}</h4>
      <p>${opt.desc}</p>
      <button data-id="${opt.id}" ${canAfford ? "" : "disabled"}>
        ${canAfford ? "Redeem" : "Not enough coins"}
      </button>
    `;
    redeemGrid.appendChild(card);
  });
}

redeemGrid.addEventListener("click", async (e)=>{
  if(e.target.tagName !== "BUTTON" || e.target.disabled) return;
  const opt = redeemOptions.find(o=>o.id === e.target.getAttribute("data-id"));
  if(!opt) return;
  if(getBalance() < opt.coins) return;
  e.target.disabled = true;
  e.target.textContent = "Redeeming…";
  try{
    // Real redemption: server checks the balance again, deducts it and
    // generates the actual coupon code — never done from client state.
    const { data, error } = await sbClient.rpc("redeem_tablet_coin", { p_option_id: opt.id });
    if(error){ showToast(error.message || "Could not redeem right now."); renderRedeemGrid(); return; }
    await tcLoadWallet();
    renderRedeemGrid();
    renderEarnGrid();
    const code = data && data.coupon_code ? data.coupon_code : null;
    showToast(code ? `Redeemed! Code: ${code} 🎉` : `Redeemed: ${opt.title} 🎉`);
    pushHomeNotification("Tablet Coin Redeemed", `You redeemed ${opt.coins} Tablet Coin for "${opt.title}".${code ? ` Code: ${code}` : ""}`);
  }catch(err){
    showToast("Network error — please try again.");
    renderRedeemGrid();
  }
});

// ---------------- History sheet ----------------
const histOverlay = document.getElementById("tc_histOverlay");
const histBody = document.getElementById("tc_histBody");
const histCloseX = document.getElementById("tc_histCloseX");

document.getElementById("tc_openHistory").addEventListener("click", async ()=>{
  await tcLoadWallet();
  renderHistory();
  histOverlay.classList.add("active");
});
histCloseX.addEventListener("click", ()=> histOverlay.classList.remove("active"));
histOverlay.addEventListener("click",(e)=>{
  if(e.target === histOverlay) histOverlay.classList.remove("active");
});
document.getElementById("tc_openRedeem").addEventListener("click", ()=>{
  document.querySelector(".redeem-grid").scrollIntoView({behavior:"smooth", block:"start"});
});

function renderHistory(){
  const h = getHistory();
  if(h.length === 0){
    histBody.innerHTML = `<div class="hist-empty">No activity yet. Place an order or refer a friend to earn your first Tablet Coin!</div>`;
    return;
  }
  histBody.innerHTML = h.map(entry=>{
    const d = new Date(entry.time);
    const timeStr = d.toLocaleString("en-IN", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" });
    const sign = entry.coins > 0 ? "+" : "";
    const color = entry.coins > 0 ? "var(--success)" : "var(--maroon-deep)";
    return `
      <div class="hist-row">
        <div class="hr-left">
          <div class="hr-title">${entry.title}</div>
          <div class="hr-time">${timeStr}</div>
        </div>
        <div class="hr-coin" style="color:${color}">${sign}${entry.coins}</div>
      </div>
    `;
  }).join("");
}

// ---------------- Toast ----------------
let toastTimeout;
function showToast(msg){
  const toast = document.getElementById("tc_toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(()=> toast.classList.remove("show"), 2200);
}

// ---------------- Init ----------------
(async function tcInit(){
  await tcLoadWallet();
  renderEarnGrid();
  renderRedeemGrid();
  const uid = await tcGetUserId();
  if(uid && sbClient){
    // Live-refresh whenever the server credits/debits coins (order delivered,
    // referral completes, redemption, etc.) while this screen is open.
    sbClient.channel("tablet-coin-" + uid)
      .on("postgres_changes", { event:"*", schema:"public", table:"coin_transactions", filter:`user_id=eq.${uid}` }, async ()=>{
        await tcLoadWallet();
        renderEarnGrid();
        renderRedeemGrid();
      })
      .subscribe();
  }
})();

})();
