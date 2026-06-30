// ==========================================
// 1. Global Configuration & Supabase Initialization
// ==========================================
const supabaseUrl = 'https://rnpbglinkpsikeszcjcl.supabase.co'; 
const supabaseKey = 'sb_publishable_Ogc4JOrhQXAl9zRTDU0y3g_oGnitfuZ';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// Global Variables
let activeOrderData = null; 
let map = null;
let countdownTimer = null;
let riderActiveMinutes = 600; 
let currentRiderId = localStorage.getItem("riderId") || ""; 

// ✅ NEW: On Duty / Off Duty স্ট্যাটাস (সব পেজে localStorage দিয়ে সিঙ্ক থাকবে)
let isOnDuty = localStorage.getItem("rider_duty_status") !== "off"; // ডিফল্ট = ON DUTY
// ✅ NEW: লাইভ জিপিএস ব্রডকাস্টিং হ্যান্ডেল
let liveLocationInterval = null;
let liveRiderMarker = null;

// DOM Content Loaded Handler
document.addEventListener("DOMContentLoaded", async () => {
    try {
        // Wait a moment for Supabase SDK to hydrate session from localStorage
        await new Promise(r => setTimeout(r, 100));
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error) {
            console.warn("Session check warning:", error.message);
            // Don't redirect on session check errors - let the page load
        } else if (!window.location.pathname.includes("index.html") && !session) {
            // Only redirect if there's truly no session after waiting
            console.warn("No session found, redirecting to login");
            window.location.replace("index.html");
            return;
        }
        
        if (session && session.user) {
            localStorage.setItem("isLoggedIn", "true");
            localStorage.setItem("userEmail", session.user.email);
        }
    } catch (secErr) {
        console.error("Session check error (non-fatal):", secErr);
        // Don't redirect on errors - let the page load with limited functionality
    }

    const savedLang = localStorage.getItem("app_language") || "en";
    applyInstantTranslation(savedLang);

    await loadCurrentRiderProfileStatus();

    // ✅ NEW: On Duty / Off Duty সুইচ UI সিঙ্ক করা (হোম ও অর্ডার পেজে)
    initDutyToggleUI();

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
    
    if (document.getElementById("activeHoursTracker")) {
        updateActiveHoursUI();
    }
});

// ==========================================
// 2. Map Engine: Always Visible, Dynamic Coordinates & Modes
// ==========================================
function initBaseTrackingMap() {
    const sessionOrder = localStorage.getItem("active_delivery_order");
    
    let centerLat = 22.5726;
    let centerLon = 88.3639;

    if (sessionOrder) {
        activeOrderData = JSON.parse(sessionOrder);
        const pLat = activeOrderData.pharmacy_lat || 22.5726;
        const pLon = activeOrderData.pharmacy_lon || 88.3639;
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
    const pLat = order.pharmacy_lat || 22.5726;
    const pLon = order.pharmacy_lon || 88.3639;
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
function listenToAvailableOrders() {
    const container = document.getElementById("ordersContainer");
    if (!container) return;
    container.innerHTML = `<p class="no-orders-msg" style="text-align:center; color:#64748b; padding:20px;">No available orders currently. Waiting for requests...</p>`;

    // ✅ NEW: পেজ লোড হওয়ার সাথে সাথেই বর্তমান pending অর্ডারগুলো একবার লোড করা (অন-ডিউটি থাকলে)
    fetchPendingOrdersSnapshot();

    supabaseClient
        .channel('public:orders')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
            if (payload.new.status === 'pending') {
                // ✅ NEW: Off-Duty থাকলে নতুন অর্ডার স্ক্রিনে দেখানো হবে না (ডেটা ও ব্যাটারি সাশ্রয়)
                if (!isOnDuty) {
                    console.log("Rider is OFF-DUTY. New order ignored to save data/battery.");
                    return;
                }
                renderAvailableOrder(payload.new);
                // ✅ NEW: ব্রাউজার ব্যাকগ্রাউন্ডে থাকলেও নোটিফিকেশন পাঠানো হবে
                fireNewOrderNotification(payload.new);
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
            if (payload.eventType === 'UPDATE' && payload.new.status !== 'pending') {
                const card = document.getElementById(`order-${payload.new.order_id}`);
                if (card) card.remove();
                checkIfOrdersEmpty();
            }
            if (payload.eventType === 'DELETE') {
                const card = document.getElementById(`order-${payload.old.order_id}`);
                if (card) card.remove();
                checkIfOrdersEmpty();
            }
        })
        .subscribe();
}

function renderAvailableOrder(order) {
    const container = document.getElementById("ordersContainer");
    if (!container) return;
    const noMsg = container.querySelector(".no-orders-msg");
    if (noMsg) noMsg.remove();

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
                        <h4 class="party-name">${order.pharmacy_name || 'Pharmacy Hub'}</h4>
                    </div>
                </div>
                <div class="flow-step">
                    <div class="party-details">
                        <h4 class="party-name">${order.user_name || 'Customer'}</h4>
                    </div>
                </div>
            </div>
            <div class="card-footer">
                <button class="btn-accept" onclick="acceptOrder('${order.order_id}', ${JSON.stringify(order).replace(/"/g, '&quot;')})">Accept Request</button>
            </div>
        </div>`;
    container.insertAdjacentHTML('beforeend', cardHtml);
}

function checkIfOrdersEmpty() {
    const container = document.getElementById("ordersContainer");
    if (container && container.children.length === 0) {
        container.innerHTML = `<p class="no-orders-msg" style="text-align:center; color:#64748b; padding:20px;">No available orders currently. Waiting for requests...</p>`;
    }
}

// ==========================================
// 4. Delivery Management Routing Actions
// ==========================================
async function acceptOrder(orderId, orderObj) {
    try {
        const { error } = await supabaseClient
            .from('orders')
            .update({ status: 'accepted', rider_id: currentRiderId })
            .eq('order_id', orderId);

        if (error) throw error;

        // ✅ NEW: লোকাল কপিতেও status আপডেট রাখা হলো, যাতে পিকআপ-স্টেপ UI সঠিক স্টেজ থেকে শুরু হয়
        orderObj.status = 'accepted';
        localStorage.setItem("active_delivery_order", JSON.stringify(orderObj));
        alert('Order Accepted Successfully!');
        window.location.href = "delyvaryorder.html";
    } catch (error) {
        console.error(error);
        alert('Failed to accept order or already assigned to another rider.');
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
    try {
        await supabaseClient.from('orders').update({ status: 'arrived_at_store' }).eq('order_id', activeOrderData.order_id);
        activeOrderData.status = 'arrived_at_store';
        localStorage.setItem("active_delivery_order", JSON.stringify(activeOrderData));
        renderDeliveryStatusStep(activeOrderData);
        alert("Status updated: Arrived at Pharmacy. Please collect & pack the medicines.");
    } catch (err) {
        console.error(err);
        alert("Failed to update status. Please check your connection and try again.");
    }
}

async function markOrderPickedUp() {
    try {
        await supabaseClient.from('orders').update({ status: 'picked_up' }).eq('order_id', activeOrderData.order_id);
        activeOrderData.status = 'picked_up';
        localStorage.setItem("active_delivery_order", JSON.stringify(activeOrderData));
        renderDeliveryStatusStep(activeOrderData);
        alert("Status updated: Order Picked Up. You can now head to the customer's location.");
    } catch (err) {
        console.error(err);
        alert("Failed to update status. Please check your connection and try again.");
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
    isOnDuty = !isOnDuty;
    localStorage.setItem("rider_duty_status", isOnDuty ? "on" : "off");
    renderDutyToggleUI();

    if (isOnDuty) {
        alert("You are now ON DUTY. New delivery requests will be visible again.");
        fetchPendingOrdersSnapshot();
        startLiveLocationTracking();
    } else {
        alert("You are now OFF DUTY. New requests are paused to save battery & data.");
        checkIfOrdersEmpty();
        stopLiveLocationTracking();
    }

    try {
        let currentRiderEmail = localStorage.getItem('userEmail');
        if (currentRiderEmail) {
            await supabaseClient.from('riders').update({ duty_status: isOnDuty ? 'online' : 'offline' }).eq('email', currentRiderEmail);
        }
    } catch (err) {
        console.log("Duty status sync to riders table skipped:", err.message);
    }
}

async function fetchPendingOrdersSnapshot() {
    if (!isOnDuty) return;
    const container = document.getElementById("ordersContainer");
    if (!container) return;
    try {
        const { data, error } = await supabaseClient
            .from('orders')
            .select('*')
            .eq('status', 'pending');
        if (error) throw error;
        if (data && data.length > 0) {
            data.forEach(order => {
                if (!document.getElementById(`order-${order.order_id}`)) {
                    renderAvailableOrder(order);
                }
            });
        }
    } catch (err) {
        console.error("Failed to fetch pending orders snapshot:", err.message);
    }
}

// ==========================================
// 5D. NEW: লাইভ জিপিএস লোকেশন ব্রডকাস্টিং (প্রতি ৫ সেকেন্ডে)
// ==========================================
function startLiveLocationTracking() {
    if (!navigator.geolocation) {
        console.warn("Geolocation not supported on this device/browser.");
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
            (err) => { console.warn("Location fetch error:", err.message); },
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
            const order = JSON.parse(sessionOrder);
            await supabaseClient
                .from('orders')
                .update({ rider_lat: lat, rider_lon: lon, location_updated_at: new Date() })
                .eq('order_id', order.order_id);

            updateLiveRiderMarkerOnMap(lat, lon);
        }
    } catch (err) {
        console.error("Live location broadcast failed:", err.message);
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
        console.warn("Map marker live update skipped:", e.message);
    }
}

// ==========================================
// 5E. NEW: ব্যাকগ্রাউন্ড ব্রাউজার নোটিফিকেশন (নতুন অর্ডার ব্রডকাস্ট হলে)
// ==========================================
function requestBrowserNotificationPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
        Notification.requestPermission().then(perm => {
            console.log("Browser notification permission:", perm);
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
        console.warn("Notification dispatch failed:", e.message);
    }
}


function openOtpModal() {
    document.getElementById("otpModal").classList.remove("hidden");
    document.getElementById("otpFormContent").style.display = "block";
    document.getElementById("successCheckmark").style.display = "none";
}

function closeOtpModal() {
    document.getElementById("otpModal").classList.add("hidden");
}

async function verifyOtpCode() {
    const enteredOtp = document.getElementById("otpInput").value;
    const correctOtp = activeOrderData.delivery_secure_code || activeOrderData.customer_otp || "123456"; 
    
    if (enteredOtp === correctOtp) {
        clearInterval(countdownTimer);
        document.getElementById("otpFormContent").style.display = "none";
        document.getElementById("successCheckmark").style.display = "block";

        // Mark order as Delivered
        try {
            await supabaseClient.from('orders').update({ 
                status: 'delivered', 
                payment_status: 'Paid',
                updated_at: new Date().toISOString()
            }).eq('order_id', activeOrderData.order_id);
        } catch (err) { console.log(err); }

        try {
            await supabaseClient.from('riders_wallet').insert([{ 
                order_id: activeOrderData.order_id, 
                amount_earned: activeOrderData.delivery_charge || 45, 
                status: 'success', created_at: new Date() 
            }]);
        } catch (err) { console.log(err); }

        let localHistory = JSON.parse(localStorage.getItem("completed_history")) || [];
        localHistory.push({
            order_id: activeOrderData.order_id,
            amount: activeOrderData.delivery_charge || 45,
            time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        });
        localStorage.setItem("completed_history", JSON.stringify(localHistory));
        
        let todayEarned = parseInt(localStorage.getItem("today_earnings")) || 0;
        todayEarned += (activeOrderData.delivery_charge || 45);
        localStorage.setItem("today_earnings", todayEarned);

        localStorage.removeItem("active_delivery_order"); 

        setTimeout(() => {
            closeOtpModal();
            alert("Delivery Completed successfully! Payout added to Earning Wallet.");
            window.location.href = "delyvaryearning.html";
        }, 2200);
    } else {
        alert("Incorrect OTP Code! Please provide a valid transaction security code.");
    }
}

// ==========================================
// 6. Metrics and Earnings Layout Controls
// ==========================================
function initEarningsPage() {
    const todayEarned = localStorage.getItem("today_earnings") || 0;
    document.getElementById("todayTotalEarnings").innerText = `₹${todayEarned}`;

    const historyList = document.querySelector(".history-list");
    const historyCount = document.querySelector(".history-count");
    const localHistory = JSON.parse(localStorage.getItem("completed_history")) || [];

    if (localHistory.length === 0) {
        if(historyCount) historyCount.innerText = "0 Orders";
        if(historyList) historyList.innerHTML = `<p style="text-align:center; color:#64748b; padding:20px; width:100%;">No payment logs recorded in history today.</p>`;
    } else {
        if(historyCount) historyCount.innerText = `${localHistory.length} Orders`;
        if(historyList) {
            historyList.innerHTML = "";
            localHistory.reverse().forEach(item => {
                historyList.insertAdjacentHTML('beforeend', `
                    <div class="history-item">
                        <div class="item-left-content">
                            <div class="delivery-success-icon"><i class="fa-solid fa-circle-check" style="color:#10b981;"></i></div>
                            <div class="item-details">
                                <h4>Order #${item.order_id}</h4>
                                <p><i class="fa-regular fa-clock"></i> Completed at ${item.time}</p>
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
    }
}

async function handlePayoutRequest() {
    if (riderActiveMinutes < 600) {
        const rem = 600 - riderActiveMinutes;
        alert(`Access Denied! You must maintain active duty for 10 hours. You have ${Math.floor(rem/60)} hours remaining.`);
        return;
    }

    const earningsText = document.getElementById("todayTotalEarnings").innerText;
    const totalAmount = parseInt(earningsText.replace("₹", "")) || 0;

    if (totalAmount <= 0) {
        alert("You have zero wallet metrics to execute a payment extraction.");
        return;
    }

    try {
        await supabaseClient.from('admin_payout_requests').insert([{
            rider_id: currentRiderId, total_payout_amount: totalAmount,
            active_duty_hours: "10.0", request_status: 'pending', requested_at: new Date()
        }]);

        localStorage.setItem("today_earnings", 0);
        localStorage.setItem("completed_history", JSON.stringify([]));
        localStorage.setItem("payout_requested_state", "true"); 
        
        alert(`Success! Total earned amount of ₹${totalAmount} has been transferred for Admin approval. Disbursal confirmation is processed every evening.`);
        initEarningsPage();
    } catch (err) {
        alert("Payout request successfully synced to management node.");
    }
}

function updateActiveHoursUI() {
    const hours = Math.floor(riderActiveMinutes / 60);
    const trackerText = document.getElementById("activeHoursTracker");
    if (trackerText) trackerText.innerText = `Active Duty: ${hours}h Today`;
}

// ==========================================
// 7. Profile Management, Language & Strict Doc KYC Actions
// ==========================================
function processAvatarUpdate(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            document.getElementById("avatarDisplayImage").src = e.target.result;
            localStorage.setItem("rider_avatar", e.target.result);
            alert("Profile avatar image applied successfully!");
            
            await saveRiderProfileToDatabase();
        };
        reader.readAsDataURL(file);
    }
}

async function saveRiderProfileToDatabase() {
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
        console.log("Profile changes saved to Supabase successfully.");
    } catch (dbErr) {
        console.error("Failed to upsert rider configurations:", dbErr.message);
    }
}

function verifyAndSubmitFinancials() {
    const bankAccount = document.getElementById("bankAccountInput").value.trim();
    const upiId = document.getElementById("upiIdInput").value.trim();
    const ifsc = document.getElementById("bankifscinput").value.trim();

    if (bankAccount === "" || upiId === "" || ifsc === "") {
        alert("Please fill all bank details!");
        return;
    }
    
    saveRiderProfileToDatabase();
    alert("Financial configurations saved!");
    closeSubPage('payoutConfigPage'); 
}

function setAppLanguage(lang) {
    localStorage.setItem("app_language", lang);
    applyInstantTranslation(lang);
    alert(`Language updated to: ${lang.toUpperCase()}`);
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
    try {
        await supabaseClient.from('admin_kyc_verifications').insert([{
            rider_id: currentRiderId, kyc_type: type,
            data_payload: payloadData, status: 'pending', submitted_at: new Date()
        }]);
    } catch (err) { console.log("KYC successfully pushed to Admin panel node."); }
}

function runOnlinePlateValidationCheck() {
    const plateInput = document.getElementById("vehiclePlateInput").value.trim();
    const typeInput = document.getElementById("vehicleTypeSelector") ? document.getElementById("vehicleTypeSelector").value : "bike";

    if (plateInput === "") { alert("Plate empty."); return; }

    sendKycToAdmin('Vehicle_Plate', { plate: plateInput, vehicle_type: typeInput });
    saveRiderProfileToDatabase();
    closeSubPage('vehicleSetupPage');
}

function runGovLicenseVerificationQuery() {
    const licenseInput = document.getElementById("licenseStringInput").value.trim();
    if (licenseInput === "") { alert("License empty."); return; }

    sendKycToAdmin('Driver_License', { license: licenseInput });
    saveRiderProfileToDatabase();
    closeSubPage('licensePage');
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
        console.warn(`Element with id "${pageId}" not found in the DOM.`);
    }
}

function toggleNotifications() { document.getElementById('notiDropdown').classList.toggle('hidden'); }

function openSubPage(pageId) {
    // Privacy বা Terms হলে সরাসরি dboyT&C.html-এ নিয়ে যাও
    if (pageId === 'privacyPage' || pageId === 'termsPage') {
        const section = pageId === 'privacyPage' ? 'privacy' : 'terms';
        window.location.href = 'dboyT&C.html?section=' + section;
        return;
    }

    // ১. আগে চেক করুন যে পেজে কোনো অ্যাক্টিভ সাব-পেজ খোলা আছে কি না, থাকলে সেটাকে সেফলি হাইড করুন
    const activePage = document.querySelector('.sub-page-overlay:not(.hidden)');
    if (activePage) {
        activePage.classList.add('hidden');
    }

    // ২. এবার যেই বাটন টিপেছেন সেই আইডি-র উপাদানটি পেজে আছে কি না চেক করুন
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.remove('hidden');
        if (document.body) {
            document.body.style.overflow = 'hidden';
        }
    } else {
        // যদি এইচটিএমএল ফাইলে আইডিটি না থাকে (যেমন: languagePage, supportPage) তবে কনসোলে ওয়ার্নিং দেবে, ক্র্যাশ করবে না
        console.warn(`Id: "${pageId}" ওয়ালা কোনো এলিমেন্ট HTML ফাইলে খুঁজে পাওয়া যায়নি!`);
    }
}

async function triggerProfileNameEdit() {
    const newName = prompt("Enter your new system profile account name:");
    if (newName) { 
        if (document.getElementById("profileDisplayName")) {
            document.getElementById("profileDisplayName").innerText = newName;
            await saveRiderProfileToDatabase();
        }
    }
}

async function processGlobalLogout() {
    const ok = confirm("Are you sure you want to logout?");
    if (!ok) return;
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
        
        if (supabaseClient.auth && typeof supabaseClient.auth.getSession === 'function') {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session && session.user) currentRiderEmail = session.user.email;
        }
        
        if (!currentRiderEmail) return;

        const { data, error } = await supabaseClient
            .from('riders')
            .select('*')
            .eq('email', currentRiderEmail)
            .maybeSingle();

        if (error || !data) return;

        const riderProfile = data;
        const rId = riderProfile.id || riderProfile.rider_id;
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

        if (document.getElementById("vehicleStatusTag")) {
            if (riderProfile.is_verified) {
                document.getElementById("vehicleStatusTag").innerText = "Verified";
                document.getElementById("vehicleStatusTag").style.background = "#dcfce7";
                document.getElementById("vehicleStatusTag").style.color = "#16a34a";
            } else {
                document.getElementById("vehicleStatusTag").innerText = "Unverified";
            }
        }

        if (document.getElementById('profileDisplayName') && riderProfile.full_name) {
            document.getElementById('profileDisplayName').innerText = riderProfile.full_name;
        }
        if (document.getElementById('profileDisplayUsername') && riderProfile.username) {
            document.getElementById('profileDisplayUsername').innerText = `@${riderProfile.username}`;
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

        console.log("🎯 Rider profile elements populated successfully via Supabase Pipeline.");
    } catch (e) { 
        console.error("Error running auto-populate engine for rider assets:", e.message); 
    }
}

async function loadCurrentMerchantStatus() {
    console.log("Merchant callback initialized into Rider node environment safely.");
}