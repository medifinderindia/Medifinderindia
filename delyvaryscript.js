// ==========================================
// 1. Global Configuration & Supabase Initialization
// URL & key loaded from supabase-constants.js
// ==========================================
const supabaseClient = (typeof supabase !== 'undefined' && typeof SUPABASE_URL !== 'undefined')
    ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

            // ✅ NEW: Google দিয়ে লগইন করলে Google প্রোফাইল পিকচার অটোমেটিক অ্যাভাটার হিসেবে বসবে —
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
                const badge = document.getElementById('noti-badge');
                if (badge) { const c = parseInt(badge.textContent) || 0; badge.textContent = c + 1; badge.style.display = 'inline-flex'; }
                showToast(`🔔 ${n.title || 'Notification'}: ${n.message || ''}`, 'info');
            })
            .subscribe();
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
    
    let centerLat = 22.5726, centerLon = 88.3639; // fallback — real coords set by GPS
    try {
        const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 }));
        centerLat = pos.coords.latitude;
        centerLon = pos.coords.longitude;
    } catch(e) {}

    if (sessionOrder) {
        activeOrderData = JSON.parse(sessionOrder);
        const pLat = activeOrderData.pharmacy_lat || 22.5726; // fallback — real coords set by GPS
        const pLon = activeOrderData.pharmacy_lon || 88.3639; // fallback — real coords set by GPS
        const uLat = activeOrderData.user_lat || 22.5850;
        const uLon = activeOrderData.user_lon || 88.4000;
        centerLat = (pLat + uLat) / 2;
        centerLon = (pLon + uLon) / 2;
        
        const paymentVal = document.getElementById("paymentStatusValue");
        if (paymentVal) {
            paymentVal.innerText = activeOrderData.payment_status ? activeOrderData.payment_status.toUpperCase() : "ONLINE PAID";
        }

        updateMapVehiclePill(activeOrderData.vehicle_type || 'bike');
    }

    map = L.map('zomatoRealMap').setView([centerLat, centerLon], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        attribution: 'MediFinder Express Tracking' 
    }).addTo(map);

    if (sessionOrder) {
        renderMapMarkers(activeOrderData);
        loadAcceptedOrderDetails(activeOrderData);
        if (document.getElementById("orderCount")) {
            document.getElementById("orderCount").innerText = "1";
        }
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

function renderMapMarkers(order) {
    const pLat = order.pharmacy_lat || 22.5726; // fallback — real coords set by GPS
    const pLon = order.pharmacy_lon || 88.3639; // fallback — real coords set by GPS
    const uLat = order.user_lat || 22.5850;
    const uLon = order.user_lon || 88.4000;
    const rLat = (pLat + uLat) / 2;
    const rLon = (pLon + uLon) / 2;

    const shopIcon = L.icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/4320/4320355.png', iconSize: [35, 35] });
    const riderIcon = L.icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/2972/2972185.png', iconSize: [40, 40] });
    const userIcon = L.icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/1216/1216844.png', iconSize: [35, 35] });

    L.marker([pLat, pLon], {icon: shopIcon}).addTo(map).bindPopup(`<b>${order.pharmacy_name || 'Pharmacy'}</b>`);
    L.marker([rLat, rLon], {icon: riderIcon}).addTo(map).bindPopup(`<b>You (Rider)</b>`);
    L.marker([uLat, uLon], {icon: userIcon}).addTo(map).bindPopup(`<b>${order.user_name || 'Customer'}</b>`);

    L.polyline([[pLat, pLon], [rLat, rLon], [uLat, uLon]], {color: '#e63946', weight: 4, dashArray: '5, 10'}).addTo(map);
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
            }
        })
        .subscribe();
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
    container.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#999;"><i class="fas fa-inbox" style="font-size:3rem;margin-bottom:12px;display:block;color:#ddd;"></i><p style="font-size:0.9rem;font-weight:600;">No orders available</p><p style="font-size:0.78rem;">New delivery requests will appear here</p></div>`;

    // ✅ পেজ লোড হওয়ার সাথে সাথেই বর্তমান broadcasted অর্ডারগুলো একবার লোড করা (অন-ডিউটি থাকলে)
    fetchPendingOrdersSnapshot();

    window._ordersChannel = supabaseClient
        .channel('public:orders')
        // ❌ FIX: আগে এখানে INSERT + status==='pending' শুনে সাথে সাথেই order দেখিয়ে দিত —
        // মানে merchant broadcast করার আগেই rider order দেখে ফেলত। এই listener পুরোপুরি
        // বাদ দেওয়া হলো। এখন order শুধু merchant broadcast করলেই (status → 'broadcasted')
        // rider এর কাছে live আসবে, নিচের UPDATE listener দিয়ে।
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
            if (payload.new.status === 'broadcasted' && !payload.new.rider_id) {
                if (!isOnDuty) return;
                if (!document.getElementById(`order-${payload.new.order_id}`) && !isOrderRejectedByMe(payload.new.order_id)) {
                    renderAvailableOrder(payload.new);
                    fireNewOrderNotification(payload.new); // 🔴 merchant broadcast করার সাথে সাথেই notification
                }
            } else if (payload.new.status !== 'broadcasted') {
                const card = document.getElementById(`order-${payload.new.order_id}`);
                if (card) card.remove();
                checkIfOrdersEmpty();
            }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, (payload) => {
            const card = document.getElementById(`order-${payload.old.order_id}`);
            if (card) card.remove();
            checkIfOrdersEmpty();
        })
        .subscribe();
}

function renderAvailableOrder(order) {
    const container = document.getElementById("ordersContainer");
    if (!container) return;
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
                <button class="btn-accept" onclick="acceptOrder('${order.order_id}', '${encodeURIComponent(JSON.stringify(order))}')">Accept Request</button>
            </div>
        </div>`;
    container.insertAdjacentHTML('beforeend', cardHtml);
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

        const updatePayload = { status: 'accepted' };
        if (riderBigIntId) updatePayload.rider_id = riderBigIntId;

        const { error } = await supabaseClient
            .from('orders')
            .update(updatePayload)
            .eq('order_id', orderId);

        if (error) throw error;

        orderObj.status = 'accepted';
        orderObj.rider_id = riderBigIntId || riderUuid;
        localStorage.setItem("active_delivery_order", JSON.stringify(orderObj));
        showToast("Order Accepted Successfully!", "success");
        window.location.href = "delyvaryorder.html";
    } catch (error) {

        showToast("Failed to accept order or already assigned to another rider.", "error");
    }
}

function loadAcceptedOrderDetails(order) {
    const container = document.getElementById("activeOrdersContainer");
    if (!container) return;
    
    container.innerHTML = `
        <div class="order-card-premium" id="card-${order.order_id}" style="background: #fff; padding: 20px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <span style="font-weight: 700; color:#333;">ID: #${order.order_id}</span>
                <div class="timer-badge" id="liveTimerBox" onclick="openOtpModal()" style="cursor:pointer; background:#fff2f2; padding:6px 12px; border-radius:20px; color:#e63946;">
                    <i class="fa-solid fa-clock"></i> <span id="timerText">25:00 Mins</span>
                </div>
            </div>
            <div class="delivery-steps" style="border-left: 2px dashed #ddd; padding-left: 15px; margin-bottom: 15px; text-align:left;">
                <p><strong>Pickup:</strong> ${order.pharmacy_name || 'Pharmacy Hub'}</p>
                <p><strong>Deliver To:</strong> ${order.user_name || 'Customer Address'}</p>
                <p style="margin-top: 5px;"><strong>Phone:</strong> ${order.user_phone || 'N/A'}</p>
            </div>
            <!-- ✅ NEW: পিকআপ স্ট্যাটাস টগল স্টেপ — কাস্টমারের কাছে যাওয়ার আগে ফার্মেসিতে আগে পৌঁছাতে/প্যাক করতে হবে -->
            <div id="statusStepBar" style="margin-bottom: 15px;"></div>
            <div style="display: flex; justify-content: space-between; align-items: center; background: #f9f9f9; padding: 12px; border-radius: 10px; gap: 8px; flex-wrap: wrap;">
                <div><span>Earnings: </span><strong style="color: #2ec4b6; font-size: 18px;">₹${order.delivery_charge || 45}</strong></div>
                <div style="display: flex; gap: 8px;">
                    <a href="tel:${order.user_phone || ''}" class="btn-call-user"><i class="fa-solid fa-phone"></i> Call Customer</a>
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
        await supabaseClient.from('orders').update({ status: 'arrived_at_store' }).eq('order_id', activeOrderData.order_id);
        activeOrderData.status = 'arrived_at_store';
        localStorage.setItem("active_delivery_order", JSON.stringify(activeOrderData));
        renderDeliveryStatusStep(activeOrderData);
        showToast("Status updated: Arrived at Pharmacy. Please collect & pack the medicines.", "success");
    } catch (err) {

        showToast("Failed to update status. Please check your connection and try again.", "error");
    }
}

async function markOrderPickedUp() {
    if (!supabaseClient) return;
    try {
        await supabaseClient.from('orders').update({ status: 'picked_up' }).eq('order_id', activeOrderData.order_id);
        activeOrderData.status = 'picked_up';
        localStorage.setItem("active_delivery_order", JSON.stringify(activeOrderData));
        renderDeliveryStatusStep(activeOrderData);
        showToast("Status updated: Order Picked Up. You can now head to the customer's location.", "success");
    } catch (err) {

        showToast("Failed to update status. Please check your connection and try again.", "error");
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
        let currentRiderEmail = localStorage.getItem('userEmail');
        if (currentRiderEmail) {
            await supabaseClient.from('riders').update({ duty_status: isOnDuty ? 'online' : 'offline' }).eq('email', currentRiderEmail);
        }
    } catch (err) {
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
        const currentRiderEmail = localStorage.getItem('userEmail');
        if (!currentRiderEmail) return;
        await supabaseClient
            .from('riders')
            .update({
                duty_status: isOnDuty ? 'online' : 'offline',
                last_active_at: new Date().toISOString()
            })
            .eq('email', currentRiderEmail);
    } catch (err) {
        // নীরবে ফেইল হবে — UI ব্লক করার দরকার নেই
    }
}

// প্রতি ৬০ সেকেন্ডে "heartbeat" পাঠানো হয় (শুধু duty অন থাকলে), যাতে অ্যাডমিন প্যানেল
// বুঝতে পারে রাইডার এখনও সত্যিকারের অ্যাক্টিভ আছে কিনা (ট্যাব বন্ধ/ক্র্যাশ হলে stale হয়ে যাবে)।
function startDutyHeartbeat() {
    if (window._dutyHeartbeatInterval) clearInterval(window._dutyHeartbeatInterval);
    window._dutyHeartbeatInterval = setInterval(async () => {
        if (!supabaseClient || !isOnDuty) return;
        try {
            const currentRiderEmail = localStorage.getItem('userEmail');
            if (!currentRiderEmail) return;
            await supabaseClient
                .from('riders')
                .update({ duty_status: 'online', last_active_at: new Date().toISOString() })
                .eq('email', currentRiderEmail);
        } catch (err) {
            // silent
        }
    }, 60000);
}

// ব্রাউজার ট্যাব/অ্যাপ বন্ধ হওয়ার সময় (রাইডার ম্যানুয়ালি অফ-ডিউটি না করলেও) best-effort
// ভাবে duty_status = offline সেট করার চেষ্টা করা হয়, যাতে অ্যাডমিন প্যানেল real-time মিথ্যা
// "online" না দেখায়। fetch keepalive ব্যবহার করা হচ্ছে কারণ unload এর সময় সাধারণ async কল
// শেষ হওয়ার আগেই ব্রাউজার ট্যাব বন্ধ করে দিতে পারে।
window.addEventListener("pagehide", () => {
    try {
        const currentRiderEmail = localStorage.getItem('userEmail');
        if (!currentRiderEmail || typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_KEY === 'undefined') return;
        const url = `${SUPABASE_URL}/rest/v1/riders?email=eq.${encodeURIComponent(currentRiderEmail)}`;
        fetch(url, {
            method: "PATCH",
            keepalive: true,
            headers: {
                "Content-Type": "application/json",
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Prefer": "return=minimal"
            },
            body: JSON.stringify({ duty_status: "offline" })
        });
    } catch (err) {
        // silent — best effort only
    }
});

async function fetchPendingOrdersSnapshot() {
    if (!supabaseClient) return;
    if (!isOnDuty) return;
    const container = document.getElementById("ordersContainer");
    if (!container) return;
    try {
        const { data, error } = await supabaseClient
            .from('orders')
            .select('*')
            .eq('status', 'broadcasted'); // ✅ FIX: শুধু broadcasted, 'pending' না — merchant broadcast না করলে rider দেখবে না
        if (error) throw error;
        if (data && data.length > 0) {
            data.forEach(order => {
                if (!document.getElementById(`order-${order.order_id}`) && !isOrderRejectedByMe(order.order_id)) {
                    renderAvailableOrder(order);
                }
            });
        }
    } catch (err) {
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
    }, 5000);
}

function stopLiveLocationTracking() {
    if (liveLocationInterval) {
        clearInterval(liveLocationInterval);
        liveLocationInterval = null;
    }
}

async function broadcastRiderLocation(lat, lon) {
    if (!supabaseClient) return;
    try {
        // riders টেবিলে লাইভ লোকেশন আপডেট (এডমিন/ট্র্যাকিং প্যানেলের জন্য, সবসময় অন-ডিউটিতে)
        let currentRiderEmail = localStorage.getItem('userEmail');
        if (currentRiderEmail) {
            await supabaseClient
                .from('riders')
                .update({ current_lat: lat, current_lon: lon, location_updated_at: new Date() })
                .eq('email', currentRiderEmail);
        }

        // সক্রিয় অর্ডার থাকলে orders টেবিলেও লাইভ পজিশন আপডেট (কাস্টমার/ফার্মেসি লাইভ দেখতে পারবে)
        const sessionOrder = localStorage.getItem("active_delivery_order");
        if (sessionOrder) {
            let order;
            try { order = JSON.parse(sessionOrder); } catch(e) { return; }
            await supabaseClient
                .from('orders')
                .update({ rider_lat: lat, rider_lon: lon, location_updated_at: new Date() })
                .eq('order_id', order.order_id);

            updateLiveRiderMarkerOnMap(lat, lon);
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
    if (enteredOtp === correctOtp) {
        clearInterval(countdownTimer);
        otpFormContent.style.display = "none";
        successCheckmark.style.display = "block";

        // Mark order as Delivered
        try {
            await supabaseClient.from('orders').update({ 
                status: 'delivered', 
                payment_status: 'Paid',
                updated_at: new Date().toISOString()
            }).eq('order_id', activeOrderData.order_id);
        } catch (err) {
            showToast("Order delivered DB update error: " + (err.message || err), "error");
        }

        try {
            let walletRiderId = null;
            try {
                const { data: { session: walletSession } } = await supabaseClient.auth.getSession();
                if (walletSession?.user?.id) {
                    const { data: r } = await supabaseClient.from('riders').select('id').eq('auth_user_id', walletSession.user.id).maybeSingle();
                    if (r) walletRiderId = r.id;
                }
            } catch(e) {
                showToast("Wallet rider ID fetch error: " + (e.message || e), "error");
            }
            if (!walletRiderId) {
                showToast("Could not determine rider ID for wallet. Earnings may not be recorded.", "error");
            }
            await supabaseClient.from('riders_wallet').insert([{ 
                rider_id: walletRiderId,
                order_id: activeOrderData.order_id, 
                amount_earned: activeOrderData.delivery_charge || 45, 
                status: 'success', created_at: new Date() 
            }]);
        } catch (err) {
            showToast("Wallet insert error: " + (err.message || err), "error");
        }

        let localHistory = JSON.parse(localStorage.getItem("completed_history")) || [];
        localHistory.push({
            order_id: activeOrderData.order_id,
            amount: activeOrderData.delivery_charge || 45,
            time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        });
        localStorage.setItem("completed_history", JSON.stringify(localHistory));
        
        let todayEarned = parseFloat(localStorage.getItem("today_earnings")) || 0;
        todayEarned += (activeOrderData.delivery_charge || 45);
        localStorage.setItem("today_earnings", todayEarned);

        localStorage.removeItem("active_delivery_order"); 

        setTimeout(() => {
            closeOtpModal();
            showToast("Delivery Completed successfully! Payout added to Earning Wallet.", "success");
            window.location.href = "delyvaryearning.html";
        }, 2200);
    } else {
        showToast("Incorrect OTP Code! Please provide a valid transaction security code.", "error");
        otpInput.value = "";
        otpInput.focus();
    }
}

// ==========================================
// 6. Metrics and Earnings Layout Controls
// ==========================================
async function loadEarningsFromDB() {
    if (!supabaseClient) return;    try {
        if (!currentRiderId) return;
        const { data: walletEntries } = await supabaseClient.from('riders_wallet')
            .select('amount_earned, created_at, order_id')
            .eq('rider_id', currentRiderId)
            .order('created_at', { ascending: false });
        if (walletEntries && walletEntries.length > 0) {
            const today = new Date().toDateString();
            const yesterday = new Date(Date.now() - 86400000).toDateString();
            const todayEarnings = walletEntries
                .filter(e => new Date(e.created_at).toDateString() === today)
                .reduce((sum, e) => sum + (parseFloat(e.amount_earned) || 0), 0);
            // ✅ NEW: গতকালের আয়ও হিসাব করা হলো, যাতে "vs yesterday" ট্রেন্ড ব্যাজটা আসল ডাটা দেখাতে পারে
            const yesterdayEarnings = walletEntries
                .filter(e => new Date(e.created_at).toDateString() === yesterday)
                .reduce((sum, e) => sum + (parseFloat(e.amount_earned) || 0), 0);
            localStorage.setItem('today_earnings', todayEarnings.toString());
            localStorage.setItem('yesterday_earnings', yesterdayEarnings.toString());
            localStorage.setItem('completed_history', JSON.stringify(walletEntries.slice(0, 20).map(e => ({
                amount: e.amount_earned,
                date: new Date(e.created_at).toLocaleDateString('en-GB'),
                orderId: e.order_id || ''
            }))));
        }
    } catch (e) {
        showToast("Earnings load error: " + (e.message || e), "error");
    }
}

async function initEarningsPage() {
    await loadEarningsFromDB();
    await loadActiveHoursFromDB();
    const todayEarned = localStorage.getItem("today_earnings") || 0;
    const todayTotalEarnings = document.getElementById("todayTotalEarnings");
    if (todayTotalEarnings) todayTotalEarnings.innerText = `₹${todayEarned}`;

    const historyCount = document.querySelector(".history-count");
    const earningList = document.getElementById("earning-history-list");
    const localHistory = JSON.parse(localStorage.getItem("completed_history")) || [];

    if (localHistory.length === 0) {
        if(historyCount) historyCount.innerText = "0 Orders";
        if(earningList) earningList.innerHTML = `<p style="text-align:center; color:#64748b; padding:20px; width:100%;">No payment logs recorded in history today.</p>`;
    } else {
        if(historyCount) historyCount.innerText = `${localHistory.length} Orders`;
        if(earningList) {
            earningList.innerHTML = "";
            localHistory.reverse().forEach(item => {
                earningList.insertAdjacentHTML('beforeend', `
                    <div class="history-item">
                        <div class="item-left-content">
                            <div class="delivery-success-icon"><i class="fa-solid fa-circle-check" style="color:#10b981;"></i></div>
                            <div class="item-details">
                                <h4>Order #${item.orderId || item.order_id}</h4>
                                <p><i class="fa-regular fa-clock"></i> Completed at ${item.time || item.date}</p>
                            </div>
                        </div>
                        <div class="payout-amount-badge"><span class="payout-indicator">+₹${item.amount}</span></div>
                    </div>`);
            });
        }
    }
    updateGraphTrend();
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

async function handlePayoutRequest() {
    if (!supabaseClient) return;
    const todayTotalEarnings = document.getElementById("todayTotalEarnings");
    const payoutRequestBtn = document.getElementById("payoutRequestBtn");
    if (!todayTotalEarnings || !payoutRequestBtn) return;
    const earningsText = todayTotalEarnings.innerText;
    const totalAmount = parseFloat(earningsText.replace("₹", "")) || 0;

    if (totalAmount <= 0) {
        showToast("No earnings to withdraw. Complete deliveries first.", "error");
        return;
    }

    if (payoutRequestBtn) { payoutRequestBtn.disabled = true; payoutRequestBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; }

    try {
        let riderUuid = currentRiderId;
        let riderBigIntId = null;
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session?.user?.id) {
                riderUuid = session.user.id;
                const { data: r } = await supabaseClient.from('riders').select('id').eq('auth_user_id', riderUuid).maybeSingle();
                if (r) riderBigIntId = r.id;
            }
        } catch(e) {
            showToast("Payout session fetch error: " + (e.message || e), "error");
        }

        const { error } = await supabaseClient.from('admin_payout_requests').insert([{
            rider_id: riderBigIntId, total_payout_amount: totalAmount,
            active_duty_hours: Math.floor(riderActiveMinutes / 60).toString(), 
            request_status: 'pending', requested_at: new Date()
        }]);

        if (error) throw error;

        // Reset local earnings
        localStorage.setItem("today_earnings", "0");
        localStorage.setItem("completed_history", JSON.stringify([]));
        
        showToast(`Payout of ₹${totalAmount} requested! Admin will review shortly.`, "success");
        initEarningsPage();
    } catch (err) {

        showToast("Payout request failed. Please try again.", "error");
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
        const { data } = await supabaseClient.from('riders_wallet')
            .select('created_at')
            .eq('rider_id', currentRiderId)
            .gte('created_at', today);
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
            .eq('email', user.email)
            .maybeSingle();

        // rider যদি আগে থেকেই কাস্টম অ্যাভাটার সেট করে থাকে, সেটা ওভাররাইট করা হবে না
        if (existingRider && existingRider.avatar_url) {
            localStorage.setItem("rider_avatar", existingRider.avatar_url);
            return;
        }

        localStorage.setItem("rider_avatar", googlePic);
        await supabaseClient.from('riders').upsert({ email: user.email, avatar_url: googlePic }, { onConflict: 'email' });
    } catch (err) {
        // silent — avatar auto-fill is a nice-to-have, not critical
    }
}

async function saveRiderProfileToDatabase() {
    if (!supabaseClient) return;
    let currentRiderEmail = localStorage.getItem('userEmail');
    if (!currentRiderEmail) return;

    try {
        const { error } = await supabaseClient
            .from("riders")
            .upsert({
                email: currentRiderEmail,
                full_name: document.getElementById("profileDisplayName") ? document.getElementById("profileDisplayName").innerText : "",
                vehicle_plate: document.getElementById("vehiclePlateInput") ? document.getElementById("vehiclePlateInput").value : "",
                license_number: document.getElementById("licenseStringInput") ? document.getElementById("licenseStringInput").value : "",
                vehicle_type: document.getElementById("vehicleTypeSelector") ? document.getElementById("vehicleTypeSelector").value : "bike",
                bank_account: document.getElementById("bankAccountInput") ? document.getElementById("bankAccountInput").value : "",
                ifsc_code: document.getElementById("bankifscinput") ? document.getElementById("bankifscinput").value : "",
                upi_id: document.getElementById("upiIdInput") ? document.getElementById("upiIdInput").value : "",
                avatar_url: localStorage.getItem("rider_avatar") || "" 
            }, { onConflict: 'email' });

        if (error) throw error;

    } catch (dbErr) {
        showToast("Profile save failed: " + (dbErr.message || dbErr), "error");
    }
}

function verifyAndSubmitFinancials() {
    const bankAccountInput = document.getElementById("bankAccountInput");
    const upiIdInput = document.getElementById("upiIdInput");
    const bankifscinput = document.getElementById("bankifscinput");
    if (!bankAccountInput || !upiIdInput || !bankifscinput) return;
    const bankAccount = bankAccountInput.value.trim();
    const upiId = upiIdInput.value.trim();
    const ifsc = bankifscinput.value.trim();

    if (bankAccount === "" || upiId === "" || ifsc === "") {
        showToast("Please fill all bank details!", "error");
        return;
    }
    
    saveRiderProfileToDatabase();

    // ✅ NEW: ব্যাংক ডিটেইলস সাবমিট করার সাথে সাথেই "Pending Review" স্টেটে সেট করা হলো,
    // যাতে Vehicle/License এর মতোই Bank & Payment ও Unverified → Pending → Verified ফ্লো অনুসরণ করে।
    markBankDetailsPendingReview();

    showToast("Financial configurations saved!", "success");
    closeSubPage('payoutConfigPage'); 
}

async function markBankDetailsPendingReview() {
    if (!supabaseClient) return;
    try {
        const currentRiderEmail = localStorage.getItem('userEmail');
        if (!currentRiderEmail) return;
        await supabaseClient
            .from('riders')
            .update({ bank_verified: false, bank_rejection_reason: '' })
            .eq('email', currentRiderEmail);
    } catch (err) {
        // silent — non-critical status flag
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

async function sendKycToAdmin(type, payloadData) {
    if (!supabaseClient) return;
    try {
        const riderId = parseInt(currentRiderId) || 0;
        const nameEl = document.getElementById("profileDisplayName");
        const name = nameEl ? nameEl.innerText : '';
        
        const { data: existingData } = await supabaseClient
            .from('rider_kyc')
            .select('id, license_no, license_img, plate_no, plate_img, vehicle_img')
            .eq('rider_id', riderId)
            .maybeSingle();

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
                vehicle_img: ''
            };
            if (type === 'Vehicle_Plate') {
                insertPayload.plate_no = payloadData.plate || '';
                insertPayload.plate_img = payloadData.plate_img || '';
                insertPayload.vehicle_img = payloadData.plate_img || '';
            } else if (type === 'Driver_License' || type === 'License') {
                insertPayload.license_no = payloadData.license_no || '';
                insertPayload.license_img = payloadData.license_img || '';
            }
            query = supabaseClient.from('rider_kyc').insert([insertPayload]);
        }

        const { error } = await query;
        if (error) throw error;

        await supabaseClient.from('riders').update({ is_verified: false }).eq('id', riderId);
    } catch (err) {
        showToast("KYC submission error: " + (err.message || err), "error");
    }
}

async function runOnlinePlateValidationCheck() {
    const vehiclePlateInput = document.getElementById("vehiclePlateInput");
    const fileInput = document.getElementById("plateImageInput");
    if (!vehiclePlateInput) return;
    const plateInput = vehiclePlateInput.value.trim();
    const typeInput = document.getElementById("vehicleTypeSelector") ? document.getElementById("vehicleTypeSelector").value : "bike";

    if (plateInput === "") { showToast("Plate empty.", "error"); return; }
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showToast("Please upload vehicle plate image.", "error");
        return;
    }

    try {
        const file = fileInput.files[0];
        const filePath = `rider_docs/${currentRiderId || 'rider'}_plate_${Date.now()}_${file.name}`;
        
        showToast("Uploading plate image...", "info");
        const { error: uploadError } = await supabaseClient.storage
            .from('media')
            .upload(filePath, file);

        if (uploadError) {
            showToast("Plate upload failed: " + uploadError.message, "error");
            return;
        }

        const { data: urlData } = supabaseClient.storage.from('media').getPublicUrl(filePath);
        const publicUrl = urlData?.publicUrl || '';

        await sendKycToAdmin('Vehicle_Plate', { plate: plateInput, vehicle_type: typeInput, plate_img: publicUrl });
        await saveRiderProfileToDatabase();
        showToast("Vehicle plate documents submitted for KYC review!", "success");
        closeSubPage('vehicleSetupPage');
        await loadCurrentRiderProfileStatus();
    } catch (err) {
        showToast("Error saving vehicle documents: " + err.message, "error");
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
        closeSubPage('licensePage');
        await loadCurrentRiderProfileStatus();
    } catch (err) {
        showToast("Error saving license documents: " + err.message, "error");
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

function toggleNotifications() { const notiDropdown = document.getElementById('notiDropdown'); if (notiDropdown) notiDropdown.classList.toggle('hidden'); }

async function loadDeliveryNotifications() {
    const badge = document.getElementById('noti-badge');
    const dropdownBody = document.getElementById('notiDropdown');
    if (!badge || !supabaseClient) return;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.user) return;
        const numericRiderId = localStorage.getItem("riderId") || localStorage.getItem("rider_id");
        if (!numericRiderId) return;
        const { data } = await supabaseClient.from('rider_notifications')
            .select('id, title, message, created_at')
            .or(`rider_id.eq.${parseInt(numericRiderId)},rider_id.is.null`)
            .eq('is_read', false)
            .order('created_at', { ascending: false })
            .limit(5);
        if (data && data.length > 0) {
            badge.textContent = data.length;
            badge.style.display = 'inline-flex';
            if (dropdownBody) {
                const itemsHtml = data.map(n => `<div class="noti-item unread"><p><strong>${escapeHtml(n.title) || 'Notification'}</strong></p><p>${escapeHtml(n.message) || ''}</p><span>${timeAgo(n.created_at)}</span></div>`).join('');
                dropdownBody.innerHTML = `<div class="dropdown-header"><i class="fa-solid fa-bell"></i> Notifications</div>${itemsHtml}`;
            }
            await supabaseClient.from('rider_notifications').update({ is_read: true }).eq('rider_id', parseInt(numericRiderId)).eq('is_read', false);
        }
    } catch (e) {
        showToast("Notifications load error: " + (e.message || e), "error");
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

async function loadCurrentRiderProfileStatus() {
    if (window.location.pathname.includes('index.html')) return; 

    try {
        let currentRiderEmail = localStorage.getItem('userEmail');
        let currentSession = null;
        
        if (supabaseClient.auth && typeof supabaseClient.auth.getSession === 'function') {
            const { data: { session: s } } = await supabaseClient.auth.getSession();
            currentSession = s;
            if (s && s.user) currentRiderEmail = s.user.email;
        }
        
        if (!currentRiderEmail) return;

        const { data, error } = await supabaseClient
            .from('riders')
            .select('*')
            .eq('email', currentRiderEmail)
            .maybeSingle();

        if (error || !data) return;

        const riderProfile = data;
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

        const { data: kycData } = await supabaseClient
            .from('rider_kyc')
            .select('verified, rejection_reason')
            .eq('rider_id', rId)
            .maybeSingle();

        if (kycData) {
            hasKyc = true;
            kycVerified = kycData.verified;
            kycReason = kycData.rejection_reason || "";
        }

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
                document.getElementById("vehicleStatusTag").innerText = "Unverified";
                document.getElementById("vehicleStatusTag").style.background = "#e2e8f0";
                document.getElementById("vehicleStatusTag").style.color = "#64748b";
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
                document.getElementById("licenseStatusTag").style.background = "#e2e8f0";
                document.getElementById("licenseStatusTag").style.color = "#64748b";
            }
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

        if (document.getElementById('profileDisplayName') && riderProfile.full_name) {
            document.getElementById('profileDisplayName').innerText = riderProfile.full_name;
        }
        if (document.getElementById('profileDisplayUsername')) {
            const displayName = riderProfile.username || (currentSession?.user?.email ? '@' + currentSession.user.email.split('@')[0] : '@rider');
            document.getElementById('profileDisplayUsername').innerText = displayName;
        }
        if (document.getElementById('vehicleTypeSelector') && riderProfile.vehicle_type) {
            document.getElementById('vehicleTypeSelector').value = riderProfile.vehicle_type;
        }
        if (document.getElementById('vehiclePlateInput') && riderProfile.vehicle_plate) {
            document.getElementById('vehiclePlateInput').value = riderProfile.vehicle_plate;
        }
        if (document.getElementById('licenseStringInput') && riderProfile.license_number) {
            document.getElementById('licenseStringInput').value = riderProfile.license_number;
        }
        if (document.getElementById('bankAccountInput') && riderProfile.bank_account) {
            document.getElementById('bankAccountInput').value = riderProfile.bank_account;
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

    } catch (e) { 
        showToast("Profile status load error: " + (e.message || e), "error");
    }
}

async function loadCurrentMerchantStatus() {

}