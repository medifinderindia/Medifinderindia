/* =========================================================
   MediFinder Admin — SPA logic (no external libraries)
   Data is in-memory mock data; every control mutates STATE/DATA
   and re-renders, so the whole dashboard is click-through-able.
   ========================================================= */
"use strict";

/* ---------------------------------------------------------
   0. SUPABASE CONNECTION + ADMIN LOGIN GATE
   (same client-creation pattern as user.js / rider.js / marchent.js —
   see supabase-constants.js for SUPABASE_URL / SUPABASE_KEY)
   --------------------------------------------------------- */
const supabase = (typeof SUPABASE_URL !== "undefined" && typeof SUPABASE_KEY !== "undefined" && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

function todayStr(){ return new Date().toISOString().slice(0,10); }

// Admin.html-e ar nijer login form nei. Session/admin na thakle home.html-er
// 3-step admin verification-e pathiye dey.
function showAdminLoginGate(message){
  try{ localStorage.removeItem('admin_auth_in_progress'); }catch(e){}
  window.location.replace("home.html");
}

async function verifyIsAdmin(){
  if(!supabase) return false;
  const { data, error } = await supabase.rpc('is_admin');
  return !error && data === true;
}

/* ---------------------------------------------------------
   0b. LIVE DATA LOADERS — Orders, Users, Merchants/KYC, Riders,
   Prescriptions, Payouts, Refunds, Products, Coupons, Zones,
   Ads, Tickets, Reviews — all wired to real Supabase tables.
   (Nurses/Labs/Ambulance/Admins/Audit-Log/Notifications live
   further down in section 0c. Doctors + Home Care remain
   local-only demo data — no Supabase table for either.)
   --------------------------------------------------------- */
function fmtDateTime(iso){
  if(!iso) return "—";
  const d = new Date(iso);
  if(isNaN(d)) return "—";
  const pad = n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadOnDutyRidersLite(){
  if(!supabase) return [];
  const { data, error } = await supabase.from('riders').select('id, full_name, phone').eq('duty_status','online');
  if(error || !data) return [];
  return data.map(r=>({ id:r.id, name:r.full_name || ('Rider #'+r.id), phone:r.phone || "" }));
}

async function loadRiderNameMap(){
  if(!supabase) return {};
  const { data, error } = await supabase.from('riders').select('id, full_name');
  if(error || !data) return {};
  const map = {};
  data.forEach(r=>{ map[r.id] = r.full_name || ('Rider #'+r.id); });
  return map;
}

async function loadUsersFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('profiles').select('*').or('role.eq.user,role.is.null').order('created_at', { ascending:false }).limit(500);
  if(error){ toast("Could not load users: "+error.message, "danger"); return; }
  const orderCounts = {};
  DATA.orders.forEach(o=>{ if(o._userId) orderCounts[o._userId] = (orderCounts[o._userId]||0)+1; });
  DATA.users = (data || []).map(u=>({
    id: u.id,
    name: u.full_name || "Customer",
    phone: u.phone || "—",
    email: u.email || "—",
    orders: orderCounts[u.id] || 0,
    joined: (u.created_at||"").slice(0,10),
    status: u.status || "active",
    verified: true, // real identity check happens at signup (OTP/Google) — no separate admin verification step exists
    addr: [u.address, u.city].filter(Boolean).join(", ") || "—",
  }));
}

async function loadTicketsFromDB(){
  if(!supabase) return;
  const merchantNames = {}; DATA.merchants.forEach(m=>{ merchantNames[m.id] = m.name; });
  const riderNames = await loadRiderNameMap();
  const [c, mc, rc] = await Promise.all([
    supabase.from('complaints').select('*').order('created_at', { ascending:false }).limit(100),
    supabase.from('merchant_complaints').select('*').order('created_at', { ascending:false }).limit(100),
    supabase.from('rider_complaints').select('*').order('created_at', { ascending:false }).limit(100),
  ]);
  const rows = [];
  (c.data||[]).forEach(t=>rows.push({ id:t.id, _table:'complaints', from:"Customer", name:t.user_email||"Customer", subject:t.subject, priority:"medium", status:t.status==='closed'?'closed':(t.status==='open'?'open':'pending'), date:fmtDateTime(t.created_at) }));
  (mc.data||[]).forEach(t=>rows.push({ id:t.id, _table:'merchant_complaints', from:"Merchant", name:merchantNames[t.merchant_id]||("Shop #"+t.merchant_id), subject:t.subject, priority:t.priority||"medium", status:t.status==='closed'?'closed':(t.status==='open'?'open':'pending'), date:fmtDateTime(t.created_at) }));
  (rc.data||[]).forEach(t=>rows.push({ id:t.id, _table:'rider_complaints', from:"Rider", name:riderNames[t.rider_id]||("Rider #"+t.rider_id), subject:t.subject, priority:"medium", status:t.status==='closed'?'closed':(t.status==='open'?'open':'pending'), date:fmtDateTime(t.created_at) }));
  rows.sort((a,b)=> b.date.localeCompare(a.date));
  DATA.tickets = rows;
}

async function loadReviewsFromDB(){
  if(!supabase) return;
  const medNames = {}; DATA.products.forEach(p=>{ medNames[p.id] = p.name; });
  const [pr, lr] = await Promise.all([
    supabase.from('product_reviews').select('*').order('created_at', { ascending:false }).limit(150),
    supabase.from('lab_test_reviews').select('*').order('created_at', { ascending:false }).limit(150),
  ]);
  const rows = [];
  (pr.data||[]).forEach(r=>rows.push({ id:r.id, _table:'product_reviews', type:"Product", subject:medNames[r.medicine_id]||("Medicine #"+r.medicine_id), rating:Math.round(r.rating), comment:r.review_text||"", reported:false }));
  (lr.data||[]).forEach(r=>rows.push({ id:r.id, _table:'lab_test_reviews', type:"Lab Test", subject:r.patient_name||"Lab test", rating:Math.round(r.rating), comment:r.feedback||"", reported:false }));
  DATA.reviews = rows;
}

async function loadCouponsFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('coupons').select('*').eq('is_active', true).order('created_at', { ascending:false }).limit(300);
  if(error){ toast("Could not load coupons: "+error.message, "danger"); return; }
  const merchantNames = {};
  DATA.merchants.forEach(m=>{ merchantNames[m.id] = m.name; });
  DATA.coupons = (data || []).map(c=>({
    id: c.id,
    code: c.code,
    type: (c.discount_type||"").toLowerCase()==="percentage" ? "percent" : "fixed",
    value: Number(c.discount_value ?? c.discount ?? 0),
    minOrder: Number(c.min_order_amount ?? c.min_order ?? 0),
    maxDiscount: Number(c.max_discount_amount ?? c.max_discount ?? 0),
    expiry: (c.end_date || c.expiry || "").slice(0,10) || "—",
    usage: c.used_count || 0,
    limit: c.max_uses || c.usage_limit || 0,
    scope: c.merchant_id ? ((merchantNames[c.merchant_id] || ("Shop #"+c.merchant_id))+" only") : "All users",
  }));
}

async function loadAdsFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('sponsored_products').select('*').order('sort_order', { ascending:true });
  if(error){ toast("Could not load sponsored banners: "+error.message, "danger"); return; }
  const productNames = {}; DATA.products.forEach(p=>{ productNames[p.id] = p.name; });
  DATA.ads = (data || []).map(a=>{
    const expired = a.valid_until && new Date(a.valid_until) < new Date(todayStr());
    const m = (a.btn_action||"").match(/[?&]id=([^&#]+)/);
    const linkedId = m ? decodeURIComponent(m[1]) : null;
    return {
      id: a.id,
      name: a.title || "Untitled banner",
      subtitle: a.subtitle || "",
      tag: a.tag || "",
      btnText: a.btn_text || "Shop Now",
      btnAction: a.btn_action || "",
      _linkedProductId: linkedId,
      linkedProduct: linkedId ? (productNames[linkedId] || ("Product #"+linkedId)) : "",
      discount: a.first_order_discount_percent || 0,
      imageUrl: a.use_custom_image ? (a.custom_image_url||"") : "",
      end: a.valid_until || "",
      status: !a.is_active ? "Paused" : expired ? "Expired" : "Running",
    };
  });
}

async function loadZonesFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('service_zones').select('*').order('created_at', { ascending:false }).limit(300);
  if(error){ toast("Could not load zones: "+error.message, "danger"); return; }
  DATA.zones = (data || []).map(z=>({
    id: z.id,
    name: z.name || z.city || "Zone",
    baseFee: Number(z.base_fee||0),
    perKm: Number(z.per_km_fee||0),
    express: Number(z.express_fee||0),
    riders: z.riders || 0,
    zoneMerchants: z.merchants || 0,
    status: z.is_active===false ? "paused" : "active",
  }));
}

async function loadProductsFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('medicines').select('*').order('created_at', { ascending:false }).limit(500);
  if(error){ toast("Could not load products: "+error.message, "danger"); return; }
  const merchantNames = {};
  DATA.merchants.forEach(m=>{ merchantNames[m.id] = m.name; });
  DATA.products = (data || []).map(m=>({
    id: m.id,
    name: m.product_name || m.name || "Unnamed product",
    category: m.category || "Medicine",
    brand: m.brand_name || "—",
    price: Number(m.selling_price ?? m.mrp ?? m.unit_price ?? 0),
    stock: m.stock_qty || 0,
    rx: !!m.is_rx,
    merchant: merchantNames[m.merchant_id] || "—",
    _merchantId: m.merchant_id,
    visible: m.is_visible !== false,
    approval: (m.status||"Pending").toLowerCase(),
  }));
  DATA.categories = [...new Set(DATA.products.map(p=>p.category).filter(Boolean))].sort();
  DATA.brands = [...new Set(DATA.products.map(p=>p.brand).filter(b=>b && b!=="—"))].sort();
}


async function loadMerchantsFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('merchants').select('*').order('created_at', { ascending:false });
  if(error){ toast("Could not load merchants: "+error.message, "danger"); return; }
  const stats = {};
  DATA.orders.forEach(o=>{
    if(o._merchantId == null) return;
    const s = stats[o._merchantId] || (stats[o._merchantId] = { orders:0, earnings:0 });
    s.orders++;
    if(o.status === "delivered") s.earnings += (o.total || 0);
  });
  DATA.merchants = (data || []).map(m=>{
    const s = stats[m.id] || { orders:0, earnings:0 };
    return {
      id: m.id,
      name: m.shop_name || m.merchant_name || "Unnamed shop",
      owner: m.owner_name || "—",
      phone: m.phone || "—",
      email: m.email || "—",
      address: m.address || m.resolved_address || "—",
      city: m.city || "—",
      pincode: m.pincode || "—",
      joined: (m.created_at || "").slice(0,10),
      orders: s.orders,
      earnings: s.earnings,
      rating: null,
      commission: null,
      license: m.license_status || "unverified",
      status: m.status || "pending",
      kycReason: m.kyc_rejection_reason || "",
    };
  });
}

async function loadOrdersFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending:false }).limit(300);
  if(error){ toast("Could not load orders: "+error.message, "danger"); return; }
  const riderNames = await loadRiderNameMap();
  DATA.orders = (data || []).map(o=>({
    id: o.order_id || o.id,
    _merchantId: o.merchant_id,
    _userId: o.user_id,
    customer: o.customer_name || o.user_name || "Customer",
    merchant: o.pharmacy_name || "—",
    rider: o.rider_id ? (riderNames[o.rider_id] || ("Rider #"+o.rider_id)) : "—",
    items: Array.isArray(o.items) ? o.items.length : 0,
    total: Number(o.total_amount ?? o.total ?? o.final_amount ?? 0),
    payment: String(o.payment_mode || o.payment_method || "").toLowerCase() === "cod" ? "COD" : "Online",
    status: o.status || "pending",
    date: fmtDateTime(o.created_at),
  }));
}

async function loadRidersFromDB(){
  if(!supabase) return;
  const { data:riders, error } = await supabase.from('riders').select('*').order('created_at', { ascending:false });
  if(error){ toast("Could not load riders: "+error.message, "danger"); return; }
  const { data:kycRows } = await supabase.from('rider_kyc_application').select('rider_id, status, rejection_reason');
  const kycByRider = {};
  (kycRows || []).forEach(k=>{ kycByRider[k.rider_id] = k; });
  DATA.riders = (riders || []).map((r)=>{
    const kyc = kycByRider[r.id];
    let status;
    if(kyc && kyc.status === 'pending') status = 'pending';
    else if(r.is_verified) status = 'active';
    else status = 'suspended';
    // Real GPS → 0-100% position within India's rough bounding box (same
    // projection used for ambulance_drivers) — no random/index-based fallback.
    let mapX = null, mapY = null;
    const lat = r.current_lat != null ? Number(r.current_lat) : null;
    const lon = r.current_lon != null ? Number(r.current_lon) : null;
    if(lat != null && lon != null && !isNaN(lat) && !isNaN(lon)){
      mapX = Math.min(100, Math.max(0, ((lon - 68) / (98 - 68)) * 100));
      mapY = Math.min(100, Math.max(0, ((38 - lat) / (38 - 6)) * 100));
    }
    return {
      id: r.id,
      name: r.full_name || r.name || ('Rider #'+r.id),
      phone: r.phone || "—",
      vehicle: (r.vehicle_type||"").replace(/\b\w/g,c=>c.toUpperCase()) || "—",
      status,
      online: r.duty_status === 'online',
      rating: r.rating || 0,
      deliveries: r.total_deliveries || 0,
      zone: "—",
      hasOrder: !!r.has_active_order,
      kycReason: (kyc && kyc.rejection_reason) || "",
      lat, lon,
      mapX: mapX != null ? mapX : 50, mapY: mapY != null ? mapY : 50,
      _hasLocation: mapX != null,
      locationUpdatedAt: r.location_updated_at || null,
      zoneDistanceKm: 0,
    };
  });
}

async function loadPrescriptionsFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('prescription_orders').select('*').order('created_at', { ascending:false }).limit(200);
  if(error){ toast("Could not load prescriptions: "+error.message, "danger"); return; }
  const merchantNames = {};
  DATA.merchants.forEach(m=>{ merchantNames[m.id] = m.name; });
  DATA.prescriptions = (data || []).map(r=>({
    id: r.id,
    customer: r.user_name || "Customer",
    uploadedAt: fmtDateTime(r.created_at),
    items: Array.isArray(r.medicines) && r.medicines.length ? r.medicines.map(x=>x.name||x).join(", ") : "(pharmacy to read from image)",
    status: r.status || "pending",
    reviewer: r.accepted_by ? (merchantNames[r.accepted_by] || ("Pharmacy #"+r.accepted_by)) : "—",
    imageUrl: r.prescription_url || "",
  }));
}

function loadTransactionsFromDB(){
  // No separate payment-gateway ledger table exists in the schema — orders IS
  // the real source of truth for payments, so transactions are derived from it.
  const statusMap = { delivered:"success", cancelled:"failed", failed:"failed" };
  DATA.transactions = DATA.orders.map(o=>({
    id: "TXN-"+String(o.id).slice(-8),
    order: o.id,
    type: "Order Payment",
    amount: o.total,
    method: o.payment,
    status: statusMap[o.status] || "pending",
    date: o.date,
  }));
}

async function loadMerchantPayoutsFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('merchant_payouts').select('*').order('created_at', { ascending:false }).limit(200);
  if(error){ toast("Could not load merchant payouts: "+error.message, "danger"); return; }
  const merchantNames = {};
  DATA.merchants.forEach(m=>{ merchantNames[String(m.id)] = m.name; });
  DATA.merchantPayouts = (data || []).map(p=>({
    id: p.id,
    merchant: merchantNames[p.shop_id] || ("Shop #"+p.shop_id),
    period: (p.created_at||"").slice(0,10),
    amount: Number(p.amount||0),
    status: (p.status||"Pending").toLowerCase()==="paid" ? "paid" : "processing",
  }));
}

async function loadRiderPayoutsFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('admin_payout_requests').select('*').order('requested_at', { ascending:false }).limit(200);
  if(error){ toast("Could not load rider payouts: "+error.message, "danger"); return; }
  const riderNames = await loadRiderNameMap();
  DATA.riderPayouts = (data || []).map(p=>{
    const s = (p.request_status||"pending").toLowerCase();
    return {
      id: p.id,
      rider: riderNames[p.rider_id] || ("Rider #"+p.rider_id),
      period: (p.requested_at||"").slice(0,10),
      amount: Number(p.total_payout_amount||p.amount||0),
      status: ["completed","paid","done","success"].includes(s) ? "paid" : "processing",
    };
  });
}

async function loadRefundsFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('cancelled_orders').select('*').order('created_at', { ascending:false }).limit(200);
  if(error){ toast("Could not load refunds: "+error.message, "danger"); return; }
  DATA.refunds = (data || []).filter(r=>String(r.payment||"").toLowerCase()!=="cod").map(r=>({
    id: r.id,
    order: r.order_id,
    customer: r.customer || r.user_email || "Customer",
    amount: Number(r.refund_amount || r.total_amount || r.amount || 0),
    reason: r.reason || "—",
    status: (r.status||"Pending").toLowerCase()==="refunded" ? "processed" : "pending",
  }));
}

/* ---------------------------------------------------------
   0c. LIVE DATA LOADERS — Healthcare Services (Nurses, Labs,
   Ambulance) + Admin Management + Audit Log + Notification History.
   These map to the REAL tables in Supabase. A few UI columns
   (marked below) have no matching column in the real schema —
   those are shown as "—" instead of invented numbers, and are
   noted in comments so you know what would need a schema change
   to actually track.
   --------------------------------------------------------- */
async function loadSampleCollectorNameMap(){
  if(!supabase) return {};
  const { data, error } = await supabase.from('sample_collectors').select('id, full_name');
  if(error || !data) return {};
  const map = {};
  data.forEach(c=>{ map[c.id] = c.full_name || ('Collector #'+c.id); });
  return map;
}

async function loadAmbulanceDriverNameMap(){
  if(!supabase) return {};
  const { data, error } = await supabase.from('ambulance_drivers').select('id, driver_name');
  if(error || !data) return {};
  const map = {};
  data.forEach(d=>{ map[d.id] = d.driver_name || ('Driver #'+d.id); });
  return map;
}

async function loadNursesFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('nurses').select('*').order('created_at', { ascending:false });
  if(error){ toast("Could not load nurses: "+error.message, "danger"); return; }
  DATA.nurses = (data || []).map(n=>({
    id: n.id,
    name: n.name || "Nurse",
    type: "—", // not tracked per-nurse in schema (specialty comes from nurse_bookings.service_type per booking)
    degree: n.qualification || "—",
    whatsapp: n.whatsapp_no || n.contact_no || "—",
    serviceArea: "—", // nurse_service_areas is a global pincode list, not per-nurse
    rate: "—", // rate is set per booking (nurse_bookings.rate), not on the nurse profile
    status: "Listed",
    photo: n.photo_url ? `<img src="${esc(n.photo_url)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover">` : "",
    qualification: n.qualification || "—",
  }));
}

async function loadNurseBookingsFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('nurse_bookings').select('*').order('created_at', { ascending:false }).limit(200);
  if(error){ toast("Could not load nurse bookings: "+error.message, "danger"); return; }
  const statusMap = { pending:"new", approved:"assigned", cancelled:"cancelled" };
  DATA.nurseBookings = (data || []).map(b=>({
    id: "NBK-"+String(b.id).slice(0,8),
    _rawId: b.id,
    customer: b.patient_name || "Customer",
    nurse: b.nurse_name || "Unassigned",
    type: b.service_label || b.service_type || "—",
    date: b.book_date ? `${b.book_date} ${b.book_time||""}`.trim() : fmtDateTime(b.created_at),
    payment: /razorpay|online/i.test(b.payment_method||"") ? "Online" : "COD",
    status: statusMap[b.status] || b.status || "new",
  }));
}

async function loadLabTestsFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('lab_tests').select('*').order('created_at', { ascending:false });
  if(error){ toast("Could not load lab tests: "+error.message, "danger"); return; }
  DATA.labs = (data || []).map(t=>({
    id: t.id,
    name: t.test_name || t.name || "Test",
    test: t.category || "—",
    includedTests: Array.isArray(t.items) && t.items.length ? t.items.join(", ") : "—",
    oldPrice: Number(t.mrp || t.old_price || 0),
    price: Number(t.offer_price || t.price || 0),
    discount: t.off_percent != null ? t.off_percent : (t.mrp && t.price ? Math.round(100 - (t.price/t.mrp*100)) : 0),
    sample: t.home_collection ? "Home Collection" : "Lab Visit",
    serviceArea: Array.isArray(t.pincodes) && t.pincodes.length ? t.pincodes.join(", ") : "All areas",
    fasting: !!t.fasting_required,
    status: t.active ? "active" : "hidden",
  }));
}

async function loadLabBookingsFromDB(){
  if(!supabase) return;
  const collectorMap = await loadSampleCollectorNameMap();
  const { data, error } = await supabase.from('lab_bookings').select('*').order('created_at', { ascending:false }).limit(200);
  if(error){ toast("Could not load lab bookings: "+error.message, "danger"); return; }
  const statusMap = { Pending:"new", Confirmed:"accepted", "Sample Collected":"accepted", Processing:"accepted", Completed:"completed", Cancelled:"cancelled" };
  DATA.labBookings = (data || []).map(b=>({
    id: b.booking_id || ("LBK-"+String(b.id).slice(0,8)),
    _rawId: b.id,
    customer: b.patient_name || "Customer",
    test: b.test_name || "—",
    provider: b.collector_id ? (collectorMap[b.collector_id] || "Assigned Collector") : "Unassigned",
    date: (b.booking_date || b.book_date) ? `${b.booking_date||b.book_date} ${b.booking_time||b.book_time||""}`.trim() : fmtDateTime(b.created_at),
    payment: /cash/i.test(b.payment_mode||"") ? "COD" : "Online",
    status: statusMap[b.status] || "new",
  }));
}

async function loadAmbulanceDriversFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('ambulance_drivers').select('*').order('created_at', { ascending:false });
  if(error){ toast("Could not load ambulance drivers: "+error.message, "danger"); return; }
  DATA.ambulanceDrivers = (data || []).map(d=>({
    id: d.id,
    name: d.driver_name || "Driver",
    provider: ({non_ac:"Non-AC Ambulance", ac:"AC Ambulance", icu:"ICU Ambulance"})[d.vehicle_type] || d.vehicle_type || "—",
    phone: d.phone || "—",
    license: d.is_verified ? "verified" : "pending",
    status: d.is_on_ride ? "on-duty" : (d.is_online ? "available" : "off-duty"),
  }));
  // Also feed the fleet-overview tab from the same real drivers (there is no
  // separate "ambulance company" table in the schema — each row here IS one unit)
  DATA.ambulances = (data || []).map(d=>{
    // Normalize lat/lon to a 0-100% map position within India's rough bounding box.
    let mapX = null, mapY = null;
    if(d.current_lat != null && d.current_lon != null){
      mapX = Math.min(100, Math.max(0, ((d.current_lon - 68) / (98 - 68)) * 100));
      mapY = Math.min(100, Math.max(0, ((38 - d.current_lat) / (38 - 6)) * 100));
    }
    return {
      id: d.id,
      provider: d.driver_name || "Driver",
      type: ({non_ac:"Non-AC", ac:"AC", icu:"ICU Support"})[d.vehicle_type] || d.vehicle_type || "—",
      rating: d.rating != null ? Number(d.rating).toFixed(1) : "—",
      loc: d.pincode || "—",
      status: d.is_on_ride ? "busy" : (d.is_online ? "available" : "offline"),
      mapX: mapX != null ? mapX : 50,
      mapY: mapY != null ? mapY : 50,
      _hasLocation: mapX != null,
    };
  });
}

async function loadAmbulanceBookingsFromDB(){
  if(!supabase) return;
  const driverMap = await loadAmbulanceDriverNameMap();
  const { data, error } = await supabase.from('ambulance_bookings').select('*').order('created_at', { ascending:false }).limit(200);
  if(error){ toast("Could not load ambulance bookings: "+error.message, "danger"); return; }
  const statusMap = { searching:"new", accepted:"on-route", arriving:"on-route", picked_up:"on-route", completed:"completed", cancelled:"cancelled" };
  DATA.ambulanceBookings = (data || []).map(b=>({
    id: "ABK-"+String(b.id).slice(0,8),
    _rawId: b.id,
    customer: b.patient_name || "Customer",
    provider: b.driver_id ? (driverMap[b.driver_id] || "Assigned Driver") : "Unassigned",
    type: ({non_ac:"Non-AC", ac:"AC", icu:"ICU Support"})[b.vehicle_type] || b.vehicle_type || "—",
    date: fmtDateTime(b.created_at),
    payment: b.payment_status === "paid" ? "Online" : "COD",
    status: statusMap[b.status] || "new",
  }));
}

async function loadAdminsFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('admins').select('*').order('created_at', { ascending:true });
  if(error){ toast("Could not load admins: "+error.message, "danger"); return; }
  DATA.admins = (data || []).map(a=>({
    id: a.id,
    name: a.name || a.email,
    role: a.role || "Support Admin",
    email: a.email,
    lastLogin: a.last_login ? fmtDateTime(a.last_login) : "—",
    twofa: !!a.twofa_enabled,
  }));
}

async function loadAuditLogFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('admin_audit_log').select('*').order('created_at', { ascending:false }).limit(100);
  if(error){ toast("Could not load audit log: "+error.message, "danger"); return; }
  DATA.auditLog = (data || []).map(a=>({
    who: a.admin_email || "Admin",
    action: a.action,
    when: fmtDateTime(a.created_at),
  }));
}

async function logAdminAction(action){
  DATA.auditLog.unshift({ who: "Admin", action, when: "just now" });
  if(!supabase) return;
  const { data:{ user } = {} } = await supabase.auth.getUser();
  await supabase.from('admin_audit_log').insert({ admin_email: user?.email || 'medifinderindia@gmail.com', action });
}

async function loadNotificationBroadcastsFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('admin_notification_broadcasts').select('*').order('sent_at', { ascending:false }).limit(50);
  if(error){ toast("Could not load notification history: "+error.message, "danger"); return; }
  DATA.notificationsHistory = (data || []).map(n=>({
    id: "NTF-"+String(n.id).slice(0,8),
    audience: n.audience,
    title: n.title,
    sentAt: fmtDateTime(n.sent_at),
    opens: "—", // no open/read tracking exists for broadcasts yet — shown honestly instead of a fake %
  }));
}

function computeWeeklyOrdersFromDB(){
  const days = [];
  const labels = [];
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  for(let i=6;i>=0;i--){
    const d = new Date();
    d.setDate(d.getDate()-i);
    days.push(d.toISOString().slice(0,10));
    labels.push(dayNames[d.getDay()]);
  }
  const counts = days.map(dateStr => DATA.orders.filter(o => (o.created_at||o.date||"").slice(0,10) === dateStr).length);
  DATA.weekOrders = counts;
  DATA.weekLabels = labels;
}

async function computeSystemHealthLive(){
  const health = [];
  if(!supabase){
    health.push({name:"Supabase Connection", status:"down", meta:"SUPABASE_URL/KEY not configured on this page"});
    DATA.systemHealth = health;
    return;
  }
  const t0 = performance.now();
  const { error: pingErr } = await supabase.from('orders').select('id', { count:'exact', head:true });
  const latency = Math.round(performance.now() - t0);
  health.push({ name:"Supabase Connection", status: pingErr ? "down" : "operational", meta: pingErr ? pingErr.message : "Reachable" });
  health.push({ name:"Database", status: pingErr ? "down" : "operational", meta: `Read latency ${latency}ms` });
  let channelCount = 0;
  try{ channelCount = supabase.getChannels().length; }catch(e){}
  health.push({ name:"Realtime Channels", status: channelCount>0 ? "operational" : "degraded", meta: `${channelCount} channel(s) subscribed` });
  health.push({ name:"Last Full Sync", status:"operational", meta: _lastSyncAt ? fmtDateTime(_lastSyncAt) : "Not yet synced" });
  health.push({ name:"Payment Gateway (Razorpay)", status:"not-monitored", meta:"No server-side health check wired up yet — verify in Razorpay dashboard" });
  health.push({ name:"Push Notification Delivery", status:"not-monitored", meta:"No open/delivery tracking wired up yet" });
  health.push({ name:"Storage (uploads)", status:"not-monitored", meta:"No storage health check wired up yet" });
  health.push({ name:"Backups", status:"not-monitored", meta:"Managed by Supabase — check Project Settings → Backups" });
  DATA.systemHealth = health;
}

async function refreshLiveData(){
  await loadOrdersFromDB();
  await loadUsersFromDB(); // needs DATA.orders loaded first (order-count per customer)
  await loadMerchantsFromDB(); // needs DATA.orders (for per-merchant order/earnings stats) loaded first
  await loadRidersFromDB();
  await loadPrescriptionsFromDB(); // needs DATA.merchants loaded first (accepted-by name lookup)
  loadTransactionsFromDB(); // needs DATA.orders loaded first (synchronous — derived, not fetched)
  await loadMerchantPayoutsFromDB(); // needs DATA.merchants loaded first (name lookup)
  await loadRiderPayoutsFromDB();
  await loadRefundsFromDB();
  await loadProductsFromDB(); // needs DATA.merchants loaded first (shop-name lookup)
  await loadCouponsFromDB();
  await loadZonesFromDB();
  await loadAdsFromDB();
  await loadTicketsFromDB(); // needs DATA.merchants loaded first (shop-name lookup)
  await loadReviewsFromDB(); // needs DATA.products loaded first (medicine-name lookup)
  await loadNursesFromDB();
  await loadNurseBookingsFromDB();
  await loadLabTestsFromDB();
  await loadLabBookingsFromDB();
  await loadAmbulanceDriversFromDB(); // also derives DATA.ambulances (fleet overview)
  await loadAmbulanceBookingsFromDB();
  await loadAdminsFromDB();
  await loadAuditLogFromDB();
  await loadNotificationBroadcastsFromDB();
  computeWeeklyOrdersFromDB(); // needs DATA.orders loaded first
  deriveActivityFeed(); // needs DATA.orders loaded first
  await computeSystemHealthLive();
  _lastSyncAt = new Date().toISOString();
  render();
}

function deriveActivityFeed(){
  // DATA.orders is already sorted newest-first by loadOrdersFromDB()'s query
  DATA.activityFeed = DATA.orders.slice(0,8).map(o=>({
    ic: o.status==="cancelled" ? "◐" : "▤",
    text: o.status==="delivered" ? `Order ${o.id} delivered`
        : o.status==="cancelled" ? `Order ${o.id} cancelled`
        : `Order ${o.id} — ${o.status}`,
    sub: `${o.merchant} · ${o.date}`,
  }));
}

function subscribeLiveData(){
  if(!supabase) return;
  supabase.channel('admin-users-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'profiles' }, ()=>{ loadUsersFromDB().then(render); })
    .subscribe();
  supabase.channel('admin-orders-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'orders' }, ()=>{ loadOrdersFromDB().then(()=>{ loadMerchantsFromDB().then(()=>{ loadTransactionsFromDB(); render(); }); }); })
    .subscribe();
  supabase.channel('admin-merchants-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'merchants' }, ()=>{ loadMerchantsFromDB().then(render); })
    .subscribe();
  supabase.channel('admin-riders-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'riders' }, ()=>{ loadRidersFromDB().then(render); })
    .subscribe();
  supabase.channel('admin-rider-kyc-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'rider_kyc_application' }, ()=>{ loadRidersFromDB().then(render); })
    .subscribe();
  supabase.channel('admin-prescriptions-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'prescription_orders' }, ()=>{ loadPrescriptionsFromDB().then(render); })
    .subscribe();
  supabase.channel('admin-merchant-payouts-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'merchant_payouts' }, ()=>{ loadMerchantPayoutsFromDB().then(render); })
    .subscribe();
  supabase.channel('admin-rider-payouts-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'admin_payout_requests' }, ()=>{ loadRiderPayoutsFromDB().then(render); })
    .subscribe();
  supabase.channel('admin-refunds-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'cancelled_orders' }, ()=>{ loadRefundsFromDB().then(render); })
    .subscribe();
  supabase.channel('admin-products-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'medicines' }, ()=>{ loadProductsFromDB().then(render); })
    .subscribe();
  supabase.channel('admin-coupons-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'coupons' }, ()=>{ loadCouponsFromDB().then(render); })
    .subscribe();
  supabase.channel('admin-zones-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'service_zones' }, ()=>{ loadZonesFromDB().then(render); })
    .subscribe();
  supabase.channel('admin-ads-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'sponsored_products' }, ()=>{ loadAdsFromDB().then(render); })
    .subscribe();
  ['complaints','merchant_complaints','rider_complaints'].forEach(t=>{
    supabase.channel('admin-tickets-'+t)
      .on('postgres_changes', { event:'*', schema:'public', table:t }, ()=>{ loadTicketsFromDB().then(render); })
      .subscribe();
  });
  ['product_reviews','lab_test_reviews'].forEach(t=>{
    supabase.channel('admin-reviews-'+t)
      .on('postgres_changes', { event:'*', schema:'public', table:t }, ()=>{ loadReviewsFromDB().then(render); })
      .subscribe();
  });
  supabase.channel('admin-nurses-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'nurses' }, ()=>{ loadNursesFromDB().then(render); })
    .subscribe();
  supabase.channel('admin-nurse-bookings-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'nurse_bookings' }, ()=>{ loadNurseBookingsFromDB().then(render); })
    .subscribe();
  supabase.channel('admin-lab-tests-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'lab_tests' }, ()=>{ loadLabTestsFromDB().then(render); })
    .subscribe();
  supabase.channel('admin-lab-bookings-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'lab_bookings' }, ()=>{ loadLabBookingsFromDB().then(render); })
    .subscribe();
  supabase.channel('admin-ambulance-drivers-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'ambulance_drivers' }, ()=>{ loadAmbulanceDriversFromDB().then(render); })
    .subscribe();
  supabase.channel('admin-ambulance-bookings-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'ambulance_bookings' }, ()=>{ loadAmbulanceBookingsFromDB().then(render); })
    .subscribe();
  supabase.channel('admin-admins-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'admins' }, ()=>{ loadAdminsFromDB().then(render); })
    .subscribe();
  supabase.channel('admin-audit-log-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'admin_audit_log' }, ()=>{ loadAuditLogFromDB().then(render); })
    .subscribe();
  supabase.channel('admin-notif-broadcasts-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'admin_notification_broadcasts' }, ()=>{ loadNotificationBroadcastsFromDB().then(render); })
    .subscribe();
}

async function bootAdminDashboard(){
  await refreshLiveData();
  subscribeLiveData();
}

/* ---------------------------------------------------------
   1. MOCK DATA
   (Orders + Merchants above are now overwritten with real data by
   loadOrdersFromDB()/loadMerchantsFromDB() before first render —
   everything else below is still original static mock data)
   --------------------------------------------------------- */
const DATA = {
  users: [
    // Loaded live from Supabase (public.profiles, role='user') by loadUsersFromDB() — see bottom of file.
  ],
  merchants: [
    // Loaded live from Supabase (public.merchants) by loadMerchantsFromDB() — see bottom of file.
  ],
  riders: [
    // Loaded live from Supabase (public.riders + public.rider_kyc_application) by loadRidersFromDB() — see bottom of file.
  ],
  orders: [
    // Loaded live from Supabase (public.orders) by loadOrdersFromDB() — see bottom of file.
  ],
  products: [
    // Loaded live from Supabase (public.medicines) by loadProductsFromDB() — see bottom of file.
  ],
  categories: [], // derived from real medicines.category values once loaded (no separate categories table exists)
  brands: [], // derived from real medicines.brand_name values once loaded
  prescriptions: [
    // Loaded live from Supabase (public.prescription_orders) by loadPrescriptionsFromDB() — see bottom of file.
  ],
  transactions: [
    // Derived live from real orders (no separate payment-gateway log table exists) by loadTransactionsFromDB() — see bottom of file.
  ],
  merchantPayouts: [
    // Loaded live from Supabase (public.merchant_payouts) by loadMerchantPayoutsFromDB() — see bottom of file.
  ],
  riderPayouts: [
    // Loaded live from Supabase (public.admin_payout_requests) by loadRiderPayoutsFromDB() — see bottom of file.
  ],
  refunds: [
    // Loaded live from Supabase (public.cancelled_orders) by loadRefundsFromDB() — see bottom of file.
  ],
  coupons: [
    // Loaded live from Supabase (public.coupons) by loadCouponsFromDB() — see bottom of file.
  ],
  zones: [
    // Loaded live from Supabase (public.service_zones) by loadZonesFromDB() — see bottom of file.
  ],
  tickets: [
    // Loaded live from Supabase (complaints + merchant_complaints + rider_complaints) by loadTicketsFromDB() — see bottom of file.
  ],
  reviews: [
    // Loaded live from Supabase (product_reviews + lab_test_reviews) by loadReviewsFromDB() — see bottom of file.
  ],
  notificationsHistory: [
    // Loaded live from Supabase (public.admin_notification_broadcasts) by loadNotificationBroadcastsFromDB() — see bottom of file.
  ],
  ads: [
    // Loaded live from Supabase (public.sponsored_products) by loadAdsFromDB() — see bottom of file.
  ],
  // Doctors + Home Care: intentionally left as local-only demo data — no
  // Supabase table exists for either and none was requested to be created.
  doctors: [
    {id:"DOC-01", name:"Dr. Afsana Karim", spec:"General Physician", fee:600, status:"available", rating:4.7},
    {id:"DOC-02", name:"Dr. Imran Kabir", spec:"Cardiologist", fee:1200, status:"busy", rating:4.9},
    {id:"DOC-03", name:"Dr. Sabrina Yasmin", spec:"Pediatrician", fee:800, status:"available", rating:4.6},
  ],
  homecare: [
    {id:"HMC-01", name:"Physiotherapy at Home", provider:"CarePlus", rate:"৳900/session", status:"available"},
    {id:"HMC-02", name:"Elder Care Attendant", provider:"CarePlus", rate:"৳1500/day", status:"available"},
  ],
  nurses: [
    // Loaded live from Supabase (public.nurses) by loadNursesFromDB() — see bottom of file.
  ],
  labs: [
    // Loaded live from Supabase (public.lab_tests) by loadLabTestsFromDB() — see bottom of file.
  ],
  ambulances: [
    // Loaded live from Supabase (public.ambulance_drivers) by loadAmbulanceDriversFromDB() — see bottom of file.
    // (no separate "ambulance company" table exists — each row IS one driver/unit)
  ],
  ambulanceDrivers: [
    // Loaded live from Supabase (public.ambulance_drivers) by loadAmbulanceDriversFromDB() — see bottom of file.
  ],
  activityFeed: [
    // Derived live from real orders by refreshLiveData() — see bottom of file.
  ],
  labBookings: [
    // Loaded live from Supabase (public.lab_bookings) by loadLabBookingsFromDB() — see bottom of file.
  ],
  nurseBookings: [
    // Loaded live from Supabase (public.nurse_bookings) by loadNurseBookingsFromDB() — see bottom of file.
  ],
  ambulanceBookings: [
    // Loaded live from Supabase (public.ambulance_bookings) by loadAmbulanceBookingsFromDB() — see bottom of file.
  ],
  systemHealth: [
    // Computed live (real latency/connectivity checks) by computeSystemHealthLive() — see bottom of file.
  ],
  auditLog: [
    // Loaded live from Supabase (public.admin_audit_log) by loadAuditLogFromDB() — see bottom of file.
  ],
  admins: [
    // Loaded live from Supabase (public.admins) by loadAdminsFromDB() — see bottom of file.
  ],
  weekOrders: [0,0,0,0,0,0,0],
  weekLabels: ["","","","","","",""],
};
let _lastSyncAt = null;

let SEQ = 9200;
const nextId = (prefix) => `${prefix}-${SEQ++}`;

/* ---------------------------------------------------------
   2. STATE
   --------------------------------------------------------- */
const STATE = {
  view: "dashboard",
  sidebarCollapsed: false,
  drawerOpen: false,
  viewState: {}, // per-view: {tab, search, sortKey, sortDir}
  settings: {
    platformName: "MediFinder",
    commission: 12,
    codFee: 10,
    processingFee: 2,
    tax: 5,
    cancellationPolicy: "Free cancellation before the order is picked up by a rider.",
    refundPolicy: "Refunds are processed to the original payment method within 5–7 business days.",
  },
  emergency: {
    pauseOrders:false, pauseDelivery:false, paymentMaintenance:false, platformMaintenance:false,
    suspendedZone:"", suspendedMerchant:"", suspendedRider:"",
  },
};
function vs(viewId, defaults){
  if(!STATE.viewState[viewId]) STATE.viewState[viewId] = {...defaults};
  return STATE.viewState[viewId];
}

/* ---------------------------------------------------------
   3. NAV CONFIG
   --------------------------------------------------------- */
const NAV = [
  {group:"", items:[
    {id:"dashboard", icon:"▣", label:"Dashboard"},
  ]},
  {group:"Operations", items:[
    {id:"users", icon:"◍", label:"Users",
      children:[{key:"all",label:"All Customers"},{key:"new",label:"New"},{key:"regular",label:"Regular"},{key:"vip",label:"VIP"},{key:"inactive",label:"Inactive"}]},
    {id:"merchants", icon:"⌂", label:"Merchants",
      children:[{key:"all",label:"All Merchants"},{key:"pending",label:"Pending Verification"},{key:"suspended",label:"Suspended"},{key:"kyc",label:"Merchant KYC"}]},
    {id:"products", icon:"⬡", label:"Medicines", count:()=>DATA.products.filter(p=>p.approval==="pending").length,
      children:[{key:"products",label:"Products"},{key:"pending",label:"Pending Approval"},{key:"categories",label:"Categories"},{key:"brands",label:"Brands"}]},
    {id:"orders", icon:"▤", label:"Orders", count:()=>DATA.orders.filter(o=>["pending","confirmed"].includes(o.status)).length,
      children:[{key:"all",label:"All Orders"},{key:"pending",label:"Pending"},{key:"active",label:"Active"},{key:"delivered",label:"Delivered"},{key:"cancelled",label:"Cancelled"}]},
    {id:"riders", icon:"➔", label:"Riders",
      children:[{key:"all",label:"All Riders"},{key:"pending",label:"Pending KYC"},{key:"live",label:"Live Riders"}]},
    {id:"fleet", icon:"🗺", label:"Live Fleet"},
    {id:"delivery", icon:"⌁", label:"Service Zones"},
    {id:"deliveryanalytics", icon:"▥", label:"Delivery Analytics"},
  ]},
  {group:"Money", items:[
    {id:"finance", icon:"৳", label:"Finance",
      children:[{key:"transactions",label:"Transactions"},{key:"merchant-payouts",label:"Merchant Payouts"},{key:"rider-payouts",label:"Rider Payouts"},{key:"refunds",label:"Refunds"},{key:"ledger",label:"Settlement Ledger"}]},
  ]},
  {group:"Catalogue", items:[
    {id:"prescriptions", icon:"▦", label:"Prescriptions", count:()=>DATA.prescriptions.filter(p=>p.status==="pending").length},
  ]},
  {group:"Healthcare", items:[
    {id:"healthcare", icon:"✚", label:"Lab / Nursing / Ambulance",
      children:[{key:"labs",label:"Lab Tests"},{key:"lab-bookings",label:"Lab Bookings"},{key:"nurses",label:"Nurse Directory"},{key:"nurse-bookings",label:"Nursing Bookings"},{key:"ambulance",label:"Ambulance"},{key:"ambulance-drivers",label:"Ambulance Drivers"},{key:"ambulance-bookings",label:"Ambulance Bookings"},{key:"ambulance-fleet",label:"Ambulance Fleet Map"},{key:"doctors",label:"Doctors"},{key:"homecare",label:"Home Care"}]},
  ]},
  {group:"Growth", items:[
    {id:"coupons", icon:"◈", label:"Sponsored & Offers",
      children:[{key:"coupons",label:"Coupons"},{key:"sponsored",label:"Sponsored Ads"}]},
    {id:"notifications", icon:"◔", label:"Notifications"},
  ]},
  {group:"Support", items:[
    {id:"support", icon:"◐", label:"Complaints", count:()=>DATA.tickets.filter(t=>t.status==="open").length},
    {id:"reviews", icon:"☆", label:"Reviews & Ratings"},
  ]},
  {group:"Insights", items:[
    {id:"reports", icon:"▥", label:"Analytics"},
  ]},
  {group:"System", items:[
    {id:"adminroles", icon:"⚿", label:"Security & Audit"},
    {id:"syshealth", icon:"❤", label:"System Health"},
    {id:"emergency", icon:"🆘", label:"Emergency Control"},
    {id:"settings", icon:"⚙", label:"Settings"},
  ]},
];
const BOTTOM_NAV = ["dashboard","orders","users","support"];
const NAV_FLAT = NAV.flatMap(g=>g.items);
function navItem(id){ return NAV_FLAT.find(i=>i.id===id); }

/* ---------------------------------------------------------
   4. GENERIC HELPERS
   --------------------------------------------------------- */
const $ = (sel,root=document)=>root.querySelector(sel);
const $$ = (sel,root=document)=>Array.from(root.querySelectorAll(sel));
const esc = (s)=> String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = (n)=> "৳" + Number(n||0).toLocaleString("en-IN");
const fmtDate = (s)=> s;

function toast(msg, kind="default"){
  const stack = $("#toastStack");
  const el = document.createElement("div");
  el.className = "toast" + (kind!=="default" ? " "+kind : "");
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(()=>{ el.style.opacity="0"; el.style.transition="opacity .25s"; setTimeout(()=>el.remove(),250); }, 2600);
}

function badge(text, tone="gray"){ return `<span class="badge ${tone}"><span class="dot"></span>${esc(text)}</span>`; }

const STATUS_TONE = {
  active:"green", available:"green", approved:"green", delivered:"green", paid:"green", success:"green", running:"green", Running:"green", online:"green", verified:"green", "on-duty":"green", accepted:"green", assigned:"green",
  pending:"gold", processing:"gold", Scheduled:"gold", scheduled:"gold", busy:"gold", booked:"gold", "on-route":"gold", new:"gold",
  blocked:"red", suspended:"red", rejected:"red", cancelled:"red", failed:"red", red:"red", Expired:"red", expired:"red", high:"red", open:"red",
  confirmed:"blue", out_for_delivery:"blue", refunded:"blue", medium:"blue", closed:"gray", "off-duty":"gray", hidden:"gray", shipped:"blue", picked_up:"blue", broadcasted:"gold",
};
function statusBadge(status){
  const label = String(status).replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
  return badge(label, STATUS_TONE[status] || "gray");
}

function initials(name){ return String(name).trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase(); }

function sortRows(rows, key, dir){
  if(!key) return rows;
  return [...rows].sort((a,b)=>{
    let av=a[key], bv=b[key];
    if(typeof av === "string") av=av.toLowerCase();
    if(typeof bv === "string") bv=bv.toLowerCase();
    if(av<bv) return dir==="asc"?-1:1;
    if(av>bv) return dir==="asc"?1:-1;
    return 0;
  });
}

function renderTable(viewId, columns, rows, opts={}){
  const state = vs(viewId, {sortKey:null, sortDir:"asc"});
  const sorted = sortRows(rows, state.sortKey, state.sortDir);
  const head = columns.map(c=>{
    const arrow = state.sortKey===c.key ? `<span class="arrow">${state.sortDir==="asc"?"▲":"▼"}</span>` : "";
    return `<th ${c.sortable!==false ? `data-sort-th="${viewId}" data-key="${c.key}"`:""}>${esc(c.label)}${c.sortable!==false?arrow:""}</th>`;
  }).join("");
  const body = sorted.length ? sorted.map(row=>{
    return `<tr>${columns.map(c=>`<td>${c.render ? c.render(row) : esc(row[c.key])}</td>`).join("")}</tr>`;
  }).join("") : `<tr><td colspan="${columns.length}"><div class="empty"><div class="ic">▢</div><h4>Nothing here yet</h4><p>${esc(opts.emptyText||"No records match this view.")}</p></div></td></tr>`;
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function toolbarSearch(viewId, placeholder){
  const state = vs(viewId, {search:""});
  return `<div class="search-box"><span class="ic">⌕</span><input type="text" placeholder="${esc(placeholder||"Search...")}" value="${esc(state.search)}" data-live-search="${viewId}" style="width:230px"></div>`;
}
function toolbarTabs(viewId, tabs){
  const state = vs(viewId, {tab:tabs[0].key});
  return `<div class="tabs">${tabs.map(t=>`<div class="tab ${state.tab===t.key?"active":""}" data-tab="${viewId}" data-key="${t.key}">${esc(t.label)}</div>`).join("")}</div>`;
}

/* Modal system */
function openModal(title, bodyHtml, footHtml){
  const root = $("#modalRoot");
  root.innerHTML = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal">
        <div class="modal-head"><h3>${esc(title)}</h3><button class="modal-close" data-close-modal>✕</button></div>
        <div class="modal-body">${bodyHtml}</div>
        ${footHtml ? `<div class="modal-foot">${footHtml}</div>` : ""}
      </div>
    </div>`;
  requestAnimationFrame(()=> $("#modalOverlay").classList.add("open"));
}
function closeModal(){
  const ov = $("#modalOverlay");
  if(!ov) return;
  ov.classList.remove("open");
  setTimeout(()=>{ $("#modalRoot").innerHTML=""; }, 120);
}

/* Simple SVG bar chart */
function svgBarChart(values, labels, opts={}){
  const w = opts.width || 640, h = opts.height || 200, pad = 28;
  const max = Math.max(...values) * 1.15;
  const bw = (w - pad*2) / values.length - 10;
  const bars = values.map((v,i)=>{
    const bh = (v/max) * (h - pad*2);
    const x = pad + i*((w-pad*2)/values.length) + 5;
    const y = h - pad - bh;
    return `<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="4"></rect>
            <text x="${(x+bw/2).toFixed(1)}" y="${h-8}" text-anchor="middle">${esc(labels[i])}</text>
            <text x="${(x+bw/2).toFixed(1)}" y="${(y-6).toFixed(1)}" text-anchor="middle">${v}</text>`;
  }).join("");
  return `<div class="chart-wrap"><svg class="bar-chart" viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${bars}</svg></div>`;
}

/* ---------------------------------------------------------
   5. VIEW RENDERERS
   --------------------------------------------------------- */
const VIEWS = {};

/* ---- Dashboard ---- */
const QUICK_ACTIONS = [
  {ic:"⌂", label:"Verify pending merchants", nav:"merchants"},
  {ic:"➔", label:"Approve rider KYC", nav:"riders"},
  {ic:"▦", label:"Review prescriptions", nav:"prescriptions"},
  {ic:"৳", label:"Process refunds", nav:"finance"},
  {ic:"◐", label:"Open complaints", nav:"support"},
  {ic:"🆘", label:"Emergency control", nav:"emergency"},
];
VIEWS.dashboard = () => {
  const todayOrders = DATA.orders.filter(o=>o.date.startsWith(todayStr()));
  const revenue = DATA.orders.filter(o=>o.status!=="cancelled"&&o.status!=="failed").reduce((s,o)=>s+o.total,0);
  const pending = DATA.orders.filter(o=>o.status==="pending").length;
  const liveRiders = DATA.riders.filter(r=>r.online).length;
  const activeZones = DATA.zones.filter(z=>z.status==="active").length;
  const alerts = [
    ...DATA.systemHealth.filter(h=>h.status==="degraded"||h.status==="down").map(h=>({ic:"❤",text:`${h.name} is ${h.status}`,sub:h.meta})),
    ...DATA.merchants.filter(m=>m.status==="pending").map(m=>({ic:"⌂",text:`${m.name} awaiting KYC approval`,sub:m.city})),
    ...DATA.riders.filter(r=>r.status==="pending").map(r=>({ic:"➔",text:`${r.name} awaiting rider KYC approval`,sub:r.zone})),
    ...DATA.tickets.filter(t=>t.priority==="high"&&t.status!=="closed").map(t=>({ic:"◐",text:`High priority: ${t.subject}`,sub:`${t.from} · ${t.name}`})),
  ].slice(0,6);
  const recentRegistrations = [
    ...DATA.users.slice(0,3).map(u=>({who:u.name, role:"Customer", when:u.joined})),
    ...DATA.merchants.filter(m=>m.status==="pending").map(m=>({who:m.name, role:"Merchant", when:"—"})),
    ...DATA.riders.filter(r=>r.status==="pending").map(r=>({who:r.name, role:"Rider", when:"—"})),
  ].slice(0,6);
  return `
  <div class="view-head"><h1>Business Overview</h1><p>Live snapshot of orders, revenue and platform activity across MediFinder.</p></div>
  <div class="stat-grid">
    <div class="stat-card"><div class="lbl">Total Users</div><div class="val">${DATA.users.length*187}</div><div class="delta up">▲ 4.2% this week</div></div>
    <div class="stat-card"><div class="lbl">Total Merchants</div><div class="val">${DATA.merchants.length}</div><div class="delta up">▲ 2 pending review</div></div>
    <div class="stat-card"><div class="lbl">Total Riders</div><div class="val">${DATA.riders.length*64}</div><div class="delta up">${liveRiders*41} online now</div></div>
    <div class="stat-card"><div class="lbl">Today's Orders</div><div class="val">${todayOrders.length*38}</div><div class="delta up">▲ 8.1% vs yesterday</div></div>
    <div class="stat-card"><div class="lbl">Pending Orders</div><div class="val">${pending}</div><div class="delta down">Needs attention</div></div>
    <div class="stat-card"><div class="lbl">Today's Revenue</div><div class="val">${money(revenue)}</div><div class="delta up">▲ 6.4% vs yesterday</div></div>
    <div class="stat-card"><div class="lbl">Platform Earnings</div><div class="val">${money(Math.round(revenue*0.12))}</div></div>
    <div class="stat-card"><div class="lbl">Active Service Zones</div><div class="val">${activeZones}</div></div>
    <div class="stat-card"><div class="lbl">Last-Hour Orders</div><div class="val">${DATA.orders.slice(0,3).length}</div></div>
  </div>
  <div class="card">
    <div class="card-head"><h3>Quick actions</h3></div>
    <div class="card-body">
      <div class="quick-actions-grid">
        ${QUICK_ACTIONS.map(a=>`<div class="qa-btn" data-nav="${a.nav}"><span class="qa-ic">${a.ic}</span>${esc(a.label)}</div>`).join("")}
      </div>
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h3>Orders — last 7 days</h3><span class="sub">All zones combined</span>
      <div class="live-pill" style="margin-left:auto"><span class="blip"></span>${liveRiders} riders live</div>
    </div>
    <div class="card-body">
      ${svgBarChart(DATA.weekOrders, DATA.weekLabels)}
      <div class="legend"><span><span class="sw" style="background:var(--brand)"></span>Orders placed</span></div>
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h3>Recent activity</h3><span class="sub">New order / status-change feed</span>
      <button class="btn sm" style="margin-left:auto" data-act="simulate-order">+ Simulate new order</button>
    </div>
    <div class="card-body">
      ${DATA.activityFeed.slice(0,8).map(a=>`<div class="alert-item"><span class="al-ic">${a.ic}</span><div><div>${esc(a.text)}</div><div class="al-sub">${esc(a.sub||"")}</div></div></div>`).join("")}
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h3>Live alerts</h3></div>
    <div class="card-body">
      ${alerts.length ? alerts.map(a=>`<div class="alert-item"><span class="al-ic">${a.ic}</span><div><div>${esc(a.text)}</div><div class="al-sub">${esc(a.sub)}</div></div></div>`).join("") : `<div class="empty"><div class="ic">▢</div><h4>All clear</h4><p>No active alerts right now.</p></div>`}
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h3>Recent orders</h3><span class="sub">Newest first</span></div>
    <div class="card-body pad0">
      ${renderTable("dash-orders",[
        {key:"id",label:"Order",render:r=>`<span class="id-cell">${r.id}</span>`},
        {key:"customer",label:"Customer"},
        {key:"merchant",label:"Pharmacy"},
        {key:"total",label:"Total",render:r=>money(r.total)},
        {key:"status",label:"Status",render:r=>statusBadge(r.status)},
        {key:"date",label:"Placed"},
      ], DATA.orders.slice(0,6))}
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h3>Recent registrations</h3></div>
    <div class="card-body pad0">
      ${renderTable("dash-regs",[
        {key:"who",label:"Name"},{key:"role",label:"Role",render:r=>badge(r.role,"blue")},{key:"when",label:"Joined"},
      ], recentRegistrations)}
    </div>
  </div>`;
};

/* ---- Orders ---- */
const ORDER_TABS = [{key:"all",label:"All Orders"},{key:"pending",label:"Pending"},{key:"active",label:"Active"},{key:"delivered",label:"Delivered"},{key:"cancelled",label:"Cancelled"}];
const ACTIVE_STATUSES = ["accepted","broadcasted","shipped","picked_up"];
function ordersForTab(tab){
  if(tab==="all") return DATA.orders;
  if(tab==="pending") return DATA.orders.filter(o=>o.status==="pending");
  if(tab==="active") return DATA.orders.filter(o=>ACTIVE_STATUSES.includes(o.status));
  if(tab==="delivered") return DATA.orders.filter(o=>o.status==="delivered");
  if(tab==="cancelled") return DATA.orders.filter(o=>["cancelled","failed","refunded","rejected"].includes(o.status));
  return DATA.orders;
}
VIEWS.orders = () => {
  const state = vs("orders", {tab:"all", search:""});
  let rows = ordersForTab(state.tab);
  if(state.search) rows = rows.filter(o=>(o.id+o.customer+o.merchant).toLowerCase().includes(state.search.toLowerCase()));
  return `
  <div class="view-head"><h1>Order Management</h1><p>Customer → Pharmacy → Rider → Items → Payment → Delivery, in one control panel.</p></div>
  ${toolbarTabs("orders", ORDER_TABS)}
  <div class="view-toolbar">${toolbarSearch("orders","Search order, customer or pharmacy")}</div>
  <div class="card"><div class="card-body pad0" id="tablewrap-orders">
    ${renderTable("orders",[
      {key:"id",label:"Order"},
      {key:"customer",label:"Customer"},
      {key:"merchant",label:"Pharmacy"},
      {key:"rider",label:"Rider"},
      {key:"items",label:"Items"},
      {key:"total",label:"Total",render:r=>money(r.total)},
      {key:"payment",label:"Payment",render:r=>badge(r.payment, r.payment==="COD"?"gold":"blue")},
      {key:"status",label:"Status",render:r=>statusBadge(r.status)},
      {key:"date",label:"Placed"},
      {key:"_actions",label:"",sortable:false,render:r=>`<div class="actions-cell">
          <button class="btn sm" data-act="order-view" data-id="${r.id}">View</button>
          ${r.status!=="delivered"&&r.status!=="cancelled" ? `<button class="btn sm" data-act="order-assign" data-id="${r.id}">Assign rider</button>` : ""}
        </div>`},
    ], rows, {emptyText:"No orders in this filter."})}
  </div></div>`;
};

/* ---- Users ---- */
const USER_SEG_TABS=[{key:"all",label:"All Customers"},{key:"new",label:"New"},{key:"regular",label:"Regular"},{key:"vip",label:"VIP"},{key:"inactive",label:"Inactive"}];
function userSegment(u){
  if(u.status!=="active") return "inactive";
  if(u.orders>=15) return "vip";
  if(u.orders>=4) return "regular";
  return "new";
}
VIEWS.users = () => {
  const state = vs("users", {tab:"all", search:""});
  let rows = DATA.users;
  if(state.tab!=="all") rows = rows.filter(u=>userSegment(u)===state.tab);
  if(state.search) rows = rows.filter(u=>(u.name+u.phone+u.email).toLowerCase().includes(state.search.toLowerCase()));
  return `
  <div class="view-head"><h1>User Management</h1><p>Search users, review order history and saved addresses, segment customers, or block an account.</p></div>
  ${toolbarTabs("users", USER_SEG_TABS)}
  <div class="view-toolbar">${toolbarSearch("users","Search name, phone or email")}
    <button class="btn" data-act="user-bulk-message" data-seg="${state.tab}">✉ Message this segment</button></div>
  <div class="card"><div class="card-body pad0" id="tablewrap-users">
    ${renderTable("users",[
      {key:"name",label:"User",render:r=>`<div class="row-flex"><div class="avatar">${initials(r.name)}</div><div><div class="cell-strong">${esc(r.name)}</div><div class="cell-sub">${esc(r.addr)}</div></div></div>`},
      {key:"phone",label:"Phone"},
      {key:"orders",label:"Orders"},
      {key:"joined",label:"Joined"},
      {key:"segment",label:"Segment",sortable:false,render:r=>badge(userSegment(r)[0].toUpperCase()+userSegment(r).slice(1), userSegment(r)==="vip"?"gold":userSegment(r)==="inactive"?"red":"blue")},
      {key:"verified",label:"Verified",render:r=>r.verified?badge("Verified","green"):badge("Unverified","gold")},
      {key:"status",label:"Status",render:r=>statusBadge(r.status)},
      {key:"_actions",label:"",sortable:false,render:r=>`<div class="actions-cell">
          <button class="btn sm" data-act="user-history" data-id="${r.id}">History</button>
          <button class="btn sm ${r.status==='active'?'danger':''}" data-act="user-toggle" data-id="${r.id}">${r.status==='active'?'Block':'Unblock'}</button>
        </div>`},
    ], rows, {emptyText:"No users match your search."})}
  </div></div>`;
};

/* ---- Merchants ---- */
const MERCHANT_TABS=[{key:"all",label:"All Merchants"},{key:"pending",label:"Pending Verification"},{key:"suspended",label:"Suspended"},{key:"kyc",label:"Merchant KYC"}];
VIEWS.merchants = () => {
  const state = vs("merchants",{tab:"all", search:""});
  if(state.tab==="kyc") return viewMerchantKyc();
  let rows = DATA.merchants;
  if(state.tab==="pending") rows = rows.filter(m=>m.status==="pending");
  if(state.tab==="suspended") rows = rows.filter(m=>m.status==="suspended");
  if(state.search) rows = rows.filter(m=>(m.name+m.owner+m.city).toLowerCase().includes(state.search.toLowerCase()));
  return `
  <div class="view-head"><h1>Merchant / Pharmacy Management</h1><p>Shop &amp; owner details, contact, address, pincode, join date and licence status.</p></div>
  ${toolbarTabs("merchants", MERCHANT_TABS)}
  <div class="view-toolbar">${toolbarSearch("merchants","Search pharmacy, owner or city")}</div>
  <div class="card"><div class="card-body pad0" id="tablewrap-merchants">
    ${renderTable("merchants",[
      {key:"name",label:"Pharmacy",render:r=>`<div class="row-flex"><div class="avatar">${initials(r.name)}</div><div><div class="cell-strong">${esc(r.name)}</div><div class="cell-sub">${esc(r.owner)} · ${esc(r.phone)}</div></div></div>`},
      {key:"address",label:"Address",render:r=>`${esc(r.address)}<div class="cell-sub">${esc(r.city)} · ${esc(r.pincode)}</div>`},
      {key:"email",label:"Email"},
      {key:"joined",label:"Joined"},
      {key:"orders",label:"Orders"},
      {key:"earnings",label:"Earnings",render:r=>money(r.earnings)},
      {key:"commission",label:"Commission",render:r=>r.commission+"%"},
      {key:"rating",label:"Rating",render:r=>r.rating?`★ ${r.rating}`:"—"},
      {key:"license",label:"Licence",render:r=>statusBadge(r.license)},
      {key:"status",label:"Status",render:r=>statusBadge(r.status)},
      {key:"_actions",label:"",sortable:false,render:r=>`<div class="actions-cell">
          ${r.status==="pending" ? `<button class="btn sm primary" data-act="merchant-approve" data-id="${r.id}">Approve</button><button class="btn sm danger" data-act="merchant-reject" data-id="${r.id}">Reject</button>` :
            r.status==="suspended" ? `<button class="btn sm primary" data-act="merchant-activate" data-id="${r.id}">Activate</button>` :
            `<button class="btn sm danger" data-act="merchant-suspend" data-id="${r.id}">Suspend</button>`}
          <button class="btn sm" data-act="merchant-notify" data-id="${r.id}">Notify</button>
        </div>`},
    ], rows, {emptyText:"No merchants in this filter."})}
  </div></div>`;
};
const KYC_TABS = [{key:"pending",label:"Pending"},{key:"verified",label:"Verified"},{key:"rejected",label:"Rejected"}];
function viewMerchantKyc(){
  const state = vs("merchantkyc",{tab:"pending"});
  const map = {pending:"pending", verified:"active", rejected:"suspended"};
  const rows = DATA.merchants.filter(m=>m.status===map[state.tab]);
  return `
  <div class="view-head"><h1>Merchant KYC</h1><p>Verify drug licence &amp; owner details, or reject with a reason (merchant is notified automatically).</p></div>
  ${toolbarTabs("merchants", MERCHANT_TABS)}
  ${toolbarTabs("merchantkyc", KYC_TABS)}
  <div class="card"><div class="card-body pad0" id="tablewrap-merchantkyc">
    ${renderTable("merchantkyc",[
      {key:"name",label:"Pharmacy",render:r=>`<div class="cell-strong">${esc(r.name)}</div><div class="cell-sub">${esc(r.owner)}</div>`},
      {key:"license",label:"Licence Status",render:r=>statusBadge(r.license)},
      {key:"pincode",label:"Pincode"},
      {key:"kycReason",label:"Reject Reason",render:r=>r.kycReason?esc(r.kycReason):"—"},
      {key:"_actions",label:"",sortable:false,render:r=>state.tab==="pending" ? `<div class="actions-cell">
          <button class="btn sm primary" data-act="merchant-approve" data-id="${r.id}">Verify</button>
          <button class="btn sm danger" data-act="merchant-reject" data-id="${r.id}">Reject</button>
        </div>` : `<button class="btn sm" data-act="merchant-notify" data-id="${r.id}">Notify</button>`},
    ], rows, {emptyText:"Nothing in this KYC filter."})}
  </div></div>`;
}

/* ---- Riders ---- */
const RIDER_TABS=[{key:"all",label:"All Riders"},{key:"pending",label:"Pending KYC"},{key:"live",label:"Live Riders"}];
VIEWS.riders = () => {
  const state = vs("riders",{tab:"all", search:""});
  let rows = DATA.riders;
  if(state.tab==="pending") rows = rows.filter(r=>r.status==="pending");
  if(state.tab==="live") rows = rows.filter(r=>r.online);
  if(state.search) rows = rows.filter(r=>(r.name+r.phone+r.zone).toLowerCase().includes(state.search.toLowerCase()));
  const withLoc = rows.filter(r=>r._hasLocation);
  const body = state.tab==="live" ? `
    <div class="card"><div class="card-body">
      <div id="ridersLiveMiniMap" style="height:220px;border-radius:10px;overflow:hidden"></div>
      <div class="hint">${withLoc.length} of ${rows.length} online riders are currently sharing live GPS.</div>
    </div></div>` : "";
  return `
  <div class="view-head"><h1>Rider Management</h1><p>KYC approvals, live location, current order and delivery performance.</p></div>
  ${toolbarTabs("riders", RIDER_TABS)}
  <div class="view-toolbar">${toolbarSearch("riders","Search rider, phone or zone")}</div>
  ${body}
  <div class="card"><div class="card-body pad0" id="tablewrap-riders">
    ${renderTable("riders",[
      {key:"name",label:"Rider",render:r=>`<div class="row-flex"><div class="avatar">${initials(r.name)}</div><div><div class="cell-strong">${esc(r.name)}</div><div class="cell-sub">${esc(r.vehicle)} · ${esc(r.zone)}</div></div></div>`},
      {key:"phone",label:"Phone"},
      {key:"deliveries",label:"Deliveries"},
      {key:"rating",label:"Rating",render:r=>r.rating?`★ ${r.rating}`:"—"},
      {key:"online",label:"Online",render:r=>r.online?badge("Online","green"):badge("Offline","gray")},
      {key:"status",label:"Status",render:r=>statusBadge(r.status)},
      {key:"_actions",label:"",sortable:false,render:r=>`<div class="actions-cell">
          ${r.status==="pending" ? `<button class="btn sm primary" data-act="rider-approve" data-id="${r.id}">Approve</button><button class="btn sm danger" data-act="rider-reject" data-id="${r.id}">Reject</button>` :
            r.status==="suspended" ? `<button class="btn sm primary" data-act="rider-activate" data-id="${r.id}">Activate</button>` :
            `<button class="btn sm danger" data-act="rider-suspend" data-id="${r.id}">Suspend</button>`}
        </div>`},
    ], rows, {emptyText:"No riders in this filter."})}
  </div></div>`;
};

/* ---- Products ---- */
const PRODUCT_TABS=[{key:"products",label:"Products"},{key:"pending",label:"Pending Approval"},{key:"categories",label:"Categories"},{key:"brands",label:"Brands"}];
VIEWS.products = () => {
  const state = vs("products",{tab:"products", search:""});
  if(state.tab==="categories"){
    return `
    <div class="view-head"><h1>Product / Medicine Management</h1><p>Organize the catalogue by category, brand and prescription requirement.</p></div>
    ${toolbarTabs("products", PRODUCT_TABS)}
    <div class="card"><div class="card-body">
      <div class="row-flex" style="flex-wrap:wrap; gap:10px">
        ${DATA.categories.map(c=>`<span class="badge blue" style="font-size:12.5px; padding:7px 13px">${esc(c)} <span class="cell-sub" style="margin-left:6px">${DATA.products.filter(p=>p.category===c).length} items</span></span>`).join("")}
      </div>
    </div></div>`;
  }
  if(state.tab==="brands"){
    return `
    <div class="view-head"><h1>Product / Medicine Management</h1><p>Organize the catalogue by category, brand and prescription requirement.</p></div>
    ${toolbarTabs("products", PRODUCT_TABS)}
    <div class="card"><div class="card-body">
      <div class="row-flex" style="flex-wrap:wrap; gap:10px">
        ${DATA.brands.map(b=>`<span class="badge gold" style="font-size:12.5px; padding:7px 13px">${esc(b)} <span class="cell-sub" style="margin-left:6px">${DATA.products.filter(p=>p.brand===b).length} items</span></span>`).join("")}
      </div>
    </div></div>`;
  }
  if(state.tab==="pending"){
    const pend = DATA.products.filter(p=>p.approval==="pending");
    return `
    <div class="view-head"><h1>Product / Medicine Management</h1><p>New medicines submitted by merchants, waiting for admin approval before going live.</p></div>
    ${toolbarTabs("products", PRODUCT_TABS)}
    <div class="card"><div class="card-body pad0" id="tablewrap-products-pending">
      ${renderTable("products-pending",[
        {key:"name",label:"Product",render:r=>`<div class="cell-strong">${esc(r.name)}</div><div class="cell-sub">${esc(r.id)}</div>`},
        {key:"merchant",label:"Merchant"},{key:"category",label:"Category"},{key:"price",label:"MRP / Price",render:r=>money(r.price)},
        {key:"rx",label:"Rx",render:r=>r.rx?badge("Required","gold"):badge("OTC","gray")},
        {key:"_actions",label:"",sortable:false,render:r=>`<div class="actions-cell">
            <button class="btn sm primary" data-act="product-approve" data-id="${r.id}">Approve</button>
            <button class="btn sm danger" data-act="product-reject" data-id="${r.id}">Reject</button>
          </div>`},
      ], pend, {emptyText:"No medicines waiting for approval."})}
    </div></div>`;
  }
  let rows = DATA.products;
  if(state.search) rows = rows.filter(p=>(p.name+p.category+p.brand).toLowerCase().includes(state.search.toLowerCase()));
  return `
  <div class="view-head"><h1>Product / Medicine Management</h1><p>Organize the catalogue by category, brand and prescription requirement.</p></div>
  ${toolbarTabs("products", PRODUCT_TABS)}
  <div class="view-toolbar">${toolbarSearch("products","Search product, category or brand")}<button class="btn primary" style="margin-left:auto" data-act="product-add">+ Add product</button></div>
  <div class="card"><div class="card-body pad0" id="tablewrap-products">
    ${renderTable("products",[
      {key:"name",label:"Product",render:r=>`<div class="cell-strong">${esc(r.name)}</div><div class="cell-sub">${esc(r.id)}</div>`},
      {key:"category",label:"Category"},
      {key:"brand",label:"Brand"},
      {key:"price",label:"Price",render:r=>money(r.price)},
      {key:"stock",label:"Stock",render:r=>r.stock===0?badge("Out of stock","red"):r.stock},
      {key:"rx",label:"Rx",render:r=>r.rx?badge("Required","gold"):badge("OTC","gray")},
      {key:"approval",label:"Approval",render:r=>statusBadge(r.approval)},
      {key:"visible",label:"Visible",render:r=>`<label class="toggle"><input type="checkbox" ${r.visible?"checked":""} data-act="product-visible" data-id="${r.id}"><span class="track"></span></label>`},
      {key:"_actions",label:"",sortable:false,render:r=>`<div class="actions-cell"><button class="btn sm" data-act="product-edit" data-id="${r.id}">Edit</button></div>`},
    ], rows, {emptyText:"No products match your search."})}
  </div></div>`;
};

/* ---- Prescriptions ----
   Real prescription_orders has no admin approve/reject concept — a merchant
   accepts a pending Rx request (first to tap wins, via accept_prescription_order).
   Admin's real role here is oversight: view the uploaded image + who accepted it,
   and cancel a stuck/abusive pending request. */
const RX_TABS=[{key:"all",label:"All"},{key:"pending",label:"Pending"},{key:"accepted",label:"Accepted"},{key:"cancelled",label:"Cancelled"}];
VIEWS.prescriptions = () => {
  const state = vs("prescriptions",{tab:"pending"});
  let rows = state.tab==="all" ? DATA.prescriptions : DATA.prescriptions.filter(p=>p.status===state.tab);
  return `
  <div class="view-head"><h1>Prescription Requests</h1><p>Pharmacies accept these directly — this is an oversight view. You can cancel a stuck pending request.</p></div>
  ${toolbarTabs("prescriptions", RX_TABS)}
  <div class="card"><div class="card-body pad0" id="tablewrap-prescriptions">
    ${renderTable("prescriptions",[
      {key:"id",label:"Rx ID",render:r=>String(r.id).slice(0,8)},
      {key:"customer",label:"Customer"},
      {key:"items",label:"Items"},
      {key:"uploadedAt",label:"Uploaded"},
      {key:"reviewer",label:"Accepted by"},
      {key:"status",label:"Status",render:r=>statusBadge(r.status)},
      {key:"_actions",label:"",sortable:false,render:r=>`<div class="actions-cell">
          <button class="btn sm" data-act="rx-view" data-id="${r.id}">View</button>
          ${r.status==="pending" ? `<button class="btn sm danger" data-act="rx-cancel" data-id="${r.id}">Cancel</button>` : ``}
        </div>`},
    ], rows, {emptyText:"Nothing in this filter."})}
  </div></div>`;
};

/* ---- Finance ---- */
const FIN_TABS=[{key:"transactions",label:"Transactions"},{key:"merchant-payouts",label:"Merchant Payouts"},{key:"rider-payouts",label:"Rider Payouts"},{key:"refunds",label:"Refunds"},{key:"ledger",label:"Settlement Ledger"}];
VIEWS.finance = () => {
  const state = vs("finance",{tab:"transactions"});
  const gmv = DATA.orders.reduce((s,o)=>s+o.total,0);
  const platformFee = Math.round(gmv*0.12);
  let table;
  if(state.tab==="transactions"){
    table = renderTable("finance",[
      {key:"id",label:"Txn ID"},{key:"order",label:"Order"},{key:"type",label:"Type"},
      {key:"amount",label:"Amount",render:r=>money(r.amount)},{key:"method",label:"Method"},
      {key:"status",label:"Status",render:r=>statusBadge(r.status)},{key:"date",label:"Date"},
    ], DATA.transactions);
  } else if(state.tab==="merchant-payouts"){
    table = renderTable("finance",[
      {key:"id",label:"Payout ID"},{key:"merchant",label:"Merchant"},{key:"period",label:"Period"},
      {key:"amount",label:"Amount",render:r=>money(r.amount)},{key:"status",label:"Status",render:r=>statusBadge(r.status)},
      {key:"_actions",label:"",sortable:false,render:r=>r.status!=="paid"?`<button class="btn sm primary" data-act="payout-mark" data-kind="merchant" data-id="${r.id}">Mark paid</button>`:""},
    ], DATA.merchantPayouts);
  } else if(state.tab==="rider-payouts"){
    table = renderTable("finance",[
      {key:"id",label:"Payout ID"},{key:"rider",label:"Rider"},{key:"period",label:"Period"},
      {key:"amount",label:"Amount",render:r=>money(r.amount)},{key:"status",label:"Status",render:r=>statusBadge(r.status)},
      {key:"_actions",label:"",sortable:false,render:r=>r.status!=="paid"?`<button class="btn sm primary" data-act="payout-mark" data-kind="rider" data-id="${r.id}">Mark paid</button>`:""},
    ], DATA.riderPayouts);
  } else if(state.tab==="refunds"){
    table = renderTable("finance",[
      {key:"id",label:"Refund ID"},{key:"order",label:"Order"},{key:"customer",label:"Customer"},
      {key:"amount",label:"Amount",render:r=>money(r.amount)},{key:"reason",label:"Reason"},
      {key:"status",label:"Status",render:r=>statusBadge(r.status)},
      {key:"_actions",label:"",sortable:false,render:r=>r.status==="pending"?`<button class="btn sm primary" data-act="refund-process" data-id="${r.id}">Process</button>`:""},
    ], DATA.refunds);
  } else {
    const ledgerRows = [
      ...DATA.transactions.map(t=>({date:t.date, ref:t.id, kind:t.type, party:t.order, amount:t.amount, status:t.status})),
      ...DATA.merchantPayouts.map(p=>({date:p.period, ref:p.id, kind:"Merchant Payout", party:p.merchant, amount:-p.amount, status:p.status})),
      ...DATA.riderPayouts.map(p=>({date:p.period, ref:p.id, kind:"Rider Payout", party:p.rider, amount:-p.amount, status:p.status})),
      ...DATA.refunds.map(r=>({date:"—", ref:r.id, kind:"Refund", party:r.customer, amount:-r.amount, status:r.status})),
    ];
    table = renderTable("finance",[
      {key:"date",label:"Date / Period"},{key:"ref",label:"Reference"},{key:"kind",label:"Entry Type"},{key:"party",label:"Merchant / Rider / Order"},
      {key:"amount",label:"Amount",render:r=>money(r.amount)},{key:"status",label:"Status",render:r=>statusBadge(r.status)},
    ], ledgerRows, {emptyText:"No ledger entries yet."});
  }
  return `
  <div class="view-head"><h1>Finance & Payments</h1><p>GMV, platform earnings, payouts, refunds and settlement in one place.</p></div>
  <div class="stat-grid">
    <div class="stat-card"><div class="lbl">Total GMV</div><div class="val">${money(gmv)}</div></div>
    <div class="stat-card"><div class="lbl">Platform Earnings</div><div class="val">${money(platformFee)}</div></div>
    <div class="stat-card"><div class="lbl">COD Collected</div><div class="val">${money(DATA.orders.filter(o=>o.payment==="COD").reduce((s,o)=>s+o.total,0))}</div></div>
    <div class="stat-card"><div class="lbl">Pending Refunds</div><div class="val">${DATA.refunds.filter(r=>r.status==="pending").length}</div></div>
  </div>
  ${toolbarTabs("finance", FIN_TABS)}
  ${state.tab==="ledger" ? `<div class="view-toolbar"><button class="btn" data-act="ledger-export">⬇ Export ledger</button></div>` : ""}
  <div class="card"><div class="card-body pad0" id="tablewrap-finance">${table}</div></div>`;
};

/* ---- Sponsored & Offers (Coupons + Sponsored Ads share one nav item) ---- */
const PROMO_TABS = [{key:"coupons",label:"Coupons"},{key:"sponsored",label:"Sponsored Ads"}];
VIEWS.coupons = () => {
  const state = vs("coupons",{tab:"coupons"});
  return state.tab==="sponsored" ? VIEWS.sponsored() : viewCouponsTable();
};
function promoAnalyticsGrid(){
  const totalRedemptions = DATA.coupons.reduce((s,c)=>s+c.usage,0);
  const totalLimit = DATA.coupons.reduce((s,c)=>s+c.limit,0) || 1;
  const runningAds = DATA.ads.filter(a=>a.status==="Running").length;
  const estSpend = DATA.ads.reduce((s,a)=>s+a.price,0);
  return `
  <div class="stat-grid">
    <div class="stat-card"><div class="lbl">Active Coupons</div><div class="val">${DATA.coupons.length}</div></div>
    <div class="stat-card"><div class="lbl">Coupon Redemptions</div><div class="val">${totalRedemptions}</div><div class="delta up">${Math.round(totalRedemptions/totalLimit*100)}% of limit used</div></div>
    <div class="stat-card"><div class="lbl">Sponsored Campaigns Running</div><div class="val">${runningAds}</div></div>
    <div class="stat-card"><div class="lbl">Promotion ROI (est.)</div><div class="val">${estSpend?Math.round((totalRedemptions*180)/estSpend*100)+"%":"—"}</div></div>
  </div>`;
}
function viewCouponsTable(){ return `
  <div class="view-head"><h1>Sponsored & Offers</h1><p>Discount codes, minimum order and expiry rules, plus sponsored product placements.</p></div>
  ${toolbarTabs("coupons", PROMO_TABS)}
  ${promoAnalyticsGrid()}
  <div class="view-toolbar"><button class="btn primary" data-act="coupon-add">+ Create coupon</button></div>
  <div class="card"><div class="card-body pad0" id="tablewrap-coupons">
    ${renderTable("coupons",[
      {key:"code",label:"Code",render:r=>`<span class="cell-strong mono">${esc(r.code)}</span>`},
      {key:"value",label:"Discount",render:r=>r.type==="percent"?`${r.value}% (max ${money(r.maxDiscount)})`:money(r.value)},
      {key:"minOrder",label:"Min. Order",render:r=>money(r.minOrder)},
      {key:"scope",label:"Scope"},
      {key:"usage",label:"Usage",render:r=>`${r.usage}/${r.limit}`},
      {key:"expiry",label:"Expires"},
      {key:"_actions",label:"",sortable:false,render:r=>`<button class="btn sm danger" data-act="coupon-delete" data-code="${r.code}">Deactivate</button>`},
    ], DATA.coupons, {emptyText:"No coupons yet."})}
  </div></div>`;
}

/* ---- Sponsored Banners ----
   Real sponsored_products is a homepage-banner table (title/subtitle/tag/
   icon-or-image/button/expiry). user.js already has the full real display +
   click-through logic built: it reads a linked product's id out of
   btn_action via the pattern [?&]id=... and, if found, fetches that
   medicine and (a) uses its own photo as a fallback image, (b) sends the
   shopper straight to that product's page on tap — or, if
   first_order_discount_percent is set, opens a one-tap discounted-offer
   modal instead. This form writes exactly what that code expects. */
VIEWS.sponsored = () => `
  <div class="view-head"><h1>Sponsored Banners</h1><p>Homepage promo banners shown to customers — link one to a real product to make it tappable straight to that product's page.</p></div>
  <div class="view-toolbar"><button class="btn gold" data-act="ad-add">★ New banner</button></div>
  <div class="card"><div class="card-body pad0" id="tablewrap-sponsored">
    ${renderTable("sponsored",[
      {key:"name",label:"Banner",render:r=>`${esc(r.name)}<div class="cell-sub">${esc(r.subtitle||"")}</div>`},
      {key:"linkedProduct",label:"Linked product",render:r=>r.linkedProduct?`${esc(r.linkedProduct)}${r.discount?` · ${r.discount}% off`:""}`:"—"},
      {key:"imageUrl",label:"Image",render:r=>r.imageUrl?(adIsVideoUrl(r.imageUrl)?`<video src="${esc(r.imageUrl)}" muted playsinline preload="metadata" style="width:44px;height:44px;object-fit:cover;border-radius:6px"></video>`:`<img src="${esc(r.imageUrl)}" style="width:44px;height:44px;object-fit:cover;border-radius:6px">`):"—"},
      {key:"end",label:"Valid until",render:r=>r.end||"No expiry"},
      {key:"status",label:"Status",render:r=>statusBadge(r.status)},
      {key:"_actions",label:"",sortable:false,render:r=>`<div class="actions-cell">
        <button class="btn sm" data-act="ad-edit" data-id="${r.id}">Edit</button>
        ${r.status==="Running"?`<button class="btn sm" data-act="ad-pause" data-id="${r.id}">Pause</button>`:`<button class="btn sm primary" data-act="ad-run" data-id="${r.id}">${r.status==="Expired"?"Reactivate":"Run now"}</button>`}
        <button class="btn sm danger" data-act="ad-delete" data-id="${r.id}">Delete</button>
      </div>`},
    ], DATA.ads, {emptyText:"No sponsored banners yet."})}
  </div></div>`;

let AD_UPLOADED_FILE = null;
function adIsVideoUrl(u){ return /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(u||""); }
function adMediaPreview(url, forceVideo){
  return (forceVideo || adIsVideoUrl(url))
    ? `<video src="${esc(url)}" muted playsinline controls style="max-width:100%;max-height:140px;border-radius:8px"></video>`
    : `<img src="${esc(url)}" style="max-width:100%;max-height:140px;border-radius:8px">`;
}
function adFormModal(existing){
  AD_UPLOADED_FILE = null;
  const body = `
    <div class="field"><label>Title</label><input id="adName" value="${existing?esc(existing.name):""}" placeholder="e.g. Summer Health Sale"></div>
    <div class="field"><label>Subtitle</label><input id="adSubtitle" value="${existing?esc(existing.subtitle||""):""}" placeholder="e.g. Up to 30% off vitamins"></div>
    <div class="field-row">
      <div class="field"><label>Tag</label><input id="adTag" value="${existing?esc(existing.tag||""):""}" placeholder="e.g. LIMITED TIME"></div>
      <div class="field"><label>Valid until</label><input type="date" id="adEnd" value="${existing?esc(existing.end||""):""}"></div>
    </div>
    <div class="field"><label>Link to a real product (optional)</label>
      <div class="row-flex">
        <input id="adProductSearch" placeholder="Search product by name" style="flex:1">
      </div>
      <div id="adFetchResult">${existing&&existing._linkedProductId?`<div class="fetch-result"><div class="row"><span>Linked</span><span class="cell-strong">${esc(existing.linkedProduct)}</span></div></div>`:""}</div>
      <input type="hidden" id="adProductId" value="${existing&&existing._linkedProductId?existing._linkedProductId:""}">
      <div class="hint">Tapping the banner will take shoppers straight to this product. Leave empty for a plain link/banner.</div>
    </div>
    <div class="field"><label>First-order discount % (optional)</label><input id="adDiscount" type="number" min="0" max="100" value="${existing&&existing.discount?existing.discount:""}" placeholder="e.g. 20"></div>
    <div class="field-row">
      <div class="field"><label>Button text</label><input id="adBtnText" value="${existing?esc(existing.btnText||"Shop Now"):"Shop Now"}"></div>
      <div class="field"><label>Or a custom link (used only if no product is linked)</label><input id="adBtnAction" value="${existing&&!existing._linkedProductId?esc(existing.btnAction||""):""}" placeholder="e.g. https://..."></div>
    </div>
    <div class="field"><label>Banner image or video</label>
      <div class="upload-box" id="adUploadBox">${existing&&existing.imageUrl?adMediaPreview(existing.imageUrl):"Click to upload an image or video"}</div>
      <input type="file" id="adFileInput" accept="image/*,video/mp4,video/webm,video/quicktime" style="display:none">
      <div class="hint">Image or short video (max 30 MB). Best size: 1080×600 (wide banner). Tapping it opens the linked product / link above.</div>
    </div>`;
  const foot = `<button class="btn" data-close-modal>Cancel</button><button class="btn gold" data-act="ad-save" data-id="${existing?existing.id:""}">Save banner</button>`;
  openModal(existing?`Edit — ${existing.name}`:"New sponsored banner", body, foot);

  $("#adUploadBox").addEventListener("click", ()=> $("#adFileInput").click());
  $("#adFileInput").addEventListener("change", (e)=>{
    const f = e.target.files[0]; if(!f) return;
    if(f.size > 30*1024*1024){ toast("File too large (max 30 MB)","danger"); e.target.value=""; return; }
    AD_UPLOADED_FILE = f;
    $("#adUploadBox").innerHTML = adMediaPreview(URL.createObjectURL(f), f.type.startsWith("video/"));
  });
  $("#adProductSearch").addEventListener("input", (e)=>{
    const q = e.target.value.trim().toLowerCase();
    const box = $("#adFetchResult");
    if(q.length<2){ box.innerHTML=""; return; }
    const matches = DATA.products.filter(p=>p.name.toLowerCase().includes(q)).slice(0,6);
    box.innerHTML = matches.map(p=>`<div class="fetch-result" data-pick-product="${p.id}" style="cursor:pointer">
      <div class="row"><span class="cell-strong">${esc(p.name)}</span><span>${money(p.price)}</span></div>
      <div class="cell-sub">${esc(p.merchant)}</div>
    </div>`).join("") || `<div class="fetch-result" style="color:var(--danger)">No product found.</div>`;
    $$("[data-pick-product]", box).forEach(el=>el.addEventListener("click", ()=>{
      const p = DATA.products.find(x=>String(x.id)===el.dataset.pickProduct);
      if(!p) return;
      $("#adProductId").value = p.id;
      box.innerHTML = `<div class="fetch-result"><div class="row"><span>Linked</span><span class="cell-strong">${esc(p.name)}</span></div></div>`;
      $("#adProductSearch").value = p.name;
    }));
  });
}

/* ---- Delivery Zones ---- */
VIEWS.delivery = () => `
  <div class="view-head"><h1>Service Zones</h1><p>PIN/district-wise zones — base fee, per-km rate, express charge and rider/merchant coverage.</p></div>
  <div class="stat-grid">
    <div class="stat-card"><div class="lbl">Active Zones</div><div class="val">${DATA.zones.filter(z=>z.status==='active').length}</div></div>
    <div class="stat-card"><div class="lbl">Paused / Suspended</div><div class="val">${DATA.zones.filter(z=>z.status!=='active').length}</div></div>
    <div class="stat-card"><div class="lbl">Total Zones</div><div class="val">${DATA.zones.length}</div></div>
  </div>
  <div class="view-toolbar"><button class="btn primary" data-act="zone-add">+ Add zone</button></div>
  <div class="card"><div class="card-body pad0" id="tablewrap-delivery">
    ${renderTable("delivery",[
      {key:"name",label:"Zone"},
      {key:"baseFee",label:"Base Fee",render:r=>money(r.baseFee)},
      {key:"perKm",label:"Per KM",render:r=>money(r.perKm)},
      {key:"express",label:"Express Fee",render:r=>money(r.express)},
      {key:"riders",label:"Riders",render:r=>r.riders},
      {key:"merchants",label:"Merchants",render:r=>DATA.merchants.filter(x=>x.city===r.name).length},
      {key:"orders",label:"Orders",render:r=>DATA.orders.filter(o=>DATA.merchants.find(m=>m.name===o.merchant)?.city===r.name).length},
      {key:"status",label:"Status",render:r=>`<label class="toggle"><input type="checkbox" ${r.status==='active'?"checked":""} data-act="zone-toggle" data-name="${r.name}"><span class="track"></span></label>`},
    ], DATA.zones)}
  </div></div>`;

/* ---- Delivery Analytics ---- */
VIEWS.deliveryanalytics = () => {
  const today = DATA.orders.filter(o=>o.date.startsWith(todayStr()));
  const lastHour = DATA.orders.slice(0,4);
  const avgDeliveryMin = 34;
  return `
  <div class="view-head"><h1>Delivery Analytics</h1><p>Live operational metrics across riders, merchants, orders and zones.</p></div>
  <div class="view-toolbar"><button class="btn" data-act="analytics-refresh">↻ Refresh now</button><span class="cell-sub" style="margin-left:8px">Last updated: ${STATE.lastAnalyticsRefresh||"just now"}</span></div>
  <div class="stat-grid">
    <div class="stat-card"><div class="lbl">Active Riders</div><div class="val">${DATA.riders.filter(r=>r.online).length}</div></div>
    <div class="stat-card"><div class="lbl">Active Merchants</div><div class="val">${DATA.merchants.filter(m=>m.status==="active").length}</div></div>
    <div class="stat-card"><div class="lbl">Today's Orders</div><div class="val">${today.length}</div></div>
    <div class="stat-card"><div class="lbl">Today's Delivered</div><div class="val">${today.filter(o=>o.status==="delivered").length}</div></div>
    <div class="stat-card"><div class="lbl">Rider Earnings (Today)</div><div class="val">${money(DATA.riderPayouts.reduce((s,p)=>s+p.amount,0))}</div></div>
    <div class="stat-card"><div class="lbl">Last 1-Hour Orders</div><div class="val">${lastHour.length}</div></div>
    <div class="stat-card"><div class="lbl">Active Zones</div><div class="val">${DATA.zones.filter(z=>z.status==="active").length}</div></div>
    <div class="stat-card"><div class="lbl">Total Zones</div><div class="val">${DATA.zones.length}</div></div>
    <div class="stat-card"><div class="lbl">Avg. Delivery Time</div><div class="val">${avgDeliveryMin} min</div></div>
  </div>
  <div class="card"><div class="card-head"><h3>Orders — last 7 days</h3></div><div class="card-body">
    ${svgBarChart(DATA.weekOrders, DATA.weekLabels)}
  </div></div>`;
};

/* ---- Live Fleet Tracking ---- */
function fleetStatusOf(r){
  const zone = DATA.zones.find(z=>z.name===r.zone);
  if(zone && zone.status!=="active") return "zone-suspended";
  if(!r.online) return "offline";
  if(r.hasOrder) return "active-order";
  return "idle";
}
const FLEET_LABEL = {"active-order":"Active — With Order", idle:"Idle", "zone-suspended":"Zone Suspended", offline:"Offline"};
VIEWS.fleet = () => {
  const state = vs("fleet",{zoneFilter:"all"});
  let visible = DATA.riders.filter(r=>r.online || fleetStatusOf(r)==="zone-suspended");
  if(state.zoneFilter==="approved") visible = visible.filter(r=>(DATA.zones.find(z=>z.name===r.zone)||{}).status==="active");
  if(state.zoneFilter==="suspended") visible = visible.filter(r=>(DATA.zones.find(z=>z.name===r.zone)||{}).status!=="active");
  const counts = {"active-order":0, idle:0, "zone-suspended":0};
  visible.forEach(r=>{ const s=fleetStatusOf(r); if(counts[s]!==undefined) counts[s]++; });
  return `
  <div class="view-head"><h1>Live Fleet Tracking</h1><p>Real-time rider positions, matched to their service zone — active, idle, on-route or zone-suspended.</p></div>
  <div class="stat-grid">
    <div class="stat-card"><div class="lbl">Online Riders</div><div class="val">${visible.length}</div></div>
    <div class="stat-card"><div class="lbl">Active With Order</div><div class="val">${counts["active-order"]}</div></div>
    <div class="stat-card"><div class="lbl">Idle</div><div class="val">${counts.idle}</div></div>
    <div class="stat-card"><div class="lbl">Zone Suspended</div><div class="val">${counts["zone-suspended"]}</div></div>
  </div>
  <div class="view-toolbar">
    <select data-act="fleet-zone-filter">
      <option value="all" ${state.zoneFilter==="all"?"selected":""}>All zones</option>
      <option value="approved" ${state.zoneFilter==="approved"?"selected":""}>Approved zones only</option>
      <option value="suspended" ${state.zoneFilter==="suspended"?"selected":""}>Suspended zones only</option>
    </select>
    <button class="btn" style="margin-left:auto" data-act="fleet-refresh">↻ Refresh map</button>
  </div>
  <div class="card">
    <div class="card-head"><h3>Fleet map</h3><span class="sub">Live GPS positions — updated from each rider's device</span></div>
    <div class="card-body">
      <div class="fleet-legend">
        <span><i style="background:var(--brand)"></i>Active — With Order</span>
        <span><i style="background:var(--gold)"></i>Idle</span>
        <span><i style="background:var(--blue)"></i>On Route</span>
        <span><i style="background:var(--danger)"></i>Zone Suspended</span>
      </div>
      <div id="fleetLeafletMap" style="height:380px;border-radius:10px;overflow:hidden"></div>
      ${visible.filter(r=>!r._hasLocation).length ? `<div class="hint" style="margin-top:8px">${visible.filter(r=>!r._hasLocation).length} online rider(s) have no GPS fix yet and aren't plotted.</div>` : ""}
    </div>
  </div>
  <div class="card"><div class="card-head"><h3>Fleet list</h3></div><div class="card-body">
    <div class="fleet-side-list">
      ${visible.map(r=>{
        const s = fleetStatusOf(r);
        const dotColor = s==="active-order"?"var(--brand)":s==="idle"?"var(--gold)":s==="zone-suspended"?"var(--danger)":"var(--blue)";
        return `<div class="fleet-row">
          <span class="dot-status" style="background:${dotColor}"></span>
          <div class="avatar">${initials(r.name)}</div>
          <div style="flex:1"><div class="cell-strong">${esc(r.name)} <span class="cell-sub">${esc(r.id)}</span></div><div class="cell-sub">${esc(r.zone)} (${r.zoneDistanceKm} km) · ${esc(r.vehicle)}</div></div>
          ${statusBadge(r.status)}
        </div>`;
      }).join("") || `<div class="empty"><div class="ic">▢</div><h4>No riders online</h4><p>Riders will appear here once they go online.</p></div>`}
    </div>
  </div></div>`;
};
/* ---- System Health ---- */
const HEALTH_TONE = {operational:"green", degraded:"gold", down:"red"};
VIEWS.syshealth = () => `
  <div class="view-head"><h1>System Health</h1><p>Live status of Supabase, payments, delivery API, notifications and storage.</p></div>
  <div class="view-toolbar"><button class="btn primary" data-act="health-check">↻ Run diagnostic</button></div>
  <div class="card"><div class="card-body">
    <div class="health-grid">
      ${DATA.systemHealth.map(h=>`
        <div class="health-card">
          <div class="hc-top"><span class="hc-name">${esc(h.name)}</span>${badge(h.status[0].toUpperCase()+h.status.slice(1), HEALTH_TONE[h.status]||"gray")}</div>
          <div class="hc-meta">${esc(h.meta)}</div>
        </div>`).join("")}
    </div>
  </div></div>`;

/* ---- Emergency Control ---- */
VIEWS.emergency = () => { const e = STATE.emergency; return `
  <div class="view-head"><h1>Emergency Control Center</h1><p>Platform-wide kill switches — use only when necessary, every toggle is logged.</p></div>
  <div class="emergency-panel">
    <div class="emergency-row">
      <div><div class="er-title">Pause new orders</div><div class="er-sub">Customers can browse but not place new orders</div></div>
      <label class="toggle"><input type="checkbox" ${e.pauseOrders?"checked":""} data-act="emg-toggle" data-key="pauseOrders"><span class="track"></span></label>
    </div>
    <div class="emergency-row">
      <div><div class="er-title">Pause delivery dispatch</div><div class="er-sub">Existing orders held, no new rider assignment</div></div>
      <label class="toggle"><input type="checkbox" ${e.pauseDelivery?"checked":""} data-act="emg-toggle" data-key="pauseDelivery"><span class="track"></span></label>
    </div>
    <div class="emergency-row">
      <div><div class="er-title">Suspend a specific zone</div><div class="er-sub">Blocks new orders in that zone only</div></div>
      <select data-act="emg-select" data-key="suspendedZone"><option value="">— None —</option>${DATA.zones.map(z=>`<option value="${esc(z.name)}" ${e.suspendedZone===z.name?"selected":""}>${esc(z.name)}</option>`).join("")}</select>
    </div>
    <div class="emergency-row">
      <div><div class="er-title">Suspend a specific pharmacy</div><div class="er-sub">Removes it from search + stops new orders</div></div>
      <select data-act="emg-select" data-key="suspendedMerchant"><option value="">— None —</option>${DATA.merchants.map(m=>`<option value="${esc(m.name)}" ${e.suspendedMerchant===m.name?"selected":""}>${esc(m.name)}</option>`).join("")}</select>
    </div>
    <div class="emergency-row">
      <div><div class="er-title">Suspend a specific rider</div><div class="er-sub">Rider is taken offline immediately</div></div>
      <select data-act="emg-select" data-key="suspendedRider"><option value="">— None —</option>${DATA.riders.map(r=>`<option value="${esc(r.name)}" ${e.suspendedRider===r.name?"selected":""}>${esc(r.name)}</option>`).join("")}</select>
    </div>
    <div class="emergency-row">
      <div><div class="er-title">Payment maintenance mode</div><div class="er-sub">Falls back to Cash on Delivery only</div></div>
      <label class="toggle"><input type="checkbox" ${e.paymentMaintenance?"checked":""} data-act="emg-toggle" data-key="paymentMaintenance"><span class="track"></span></label>
    </div>
    <div class="emergency-row">
      <div><div class="er-title">Platform maintenance mode</div><div class="er-sub">Shows a maintenance screen to all users</div></div>
      <label class="toggle"><input type="checkbox" ${e.platformMaintenance?"checked":""} data-act="emg-toggle" data-key="platformMaintenance"><span class="track"></span></label>
    </div>
  </div>`;
};

/* ---- Healthcare Services ---- */
const HC_TABS=[{key:"labs",label:"Lab Tests"},{key:"lab-bookings",label:"Lab Bookings"},{key:"nurses",label:"Nurse Directory"},{key:"nurse-bookings",label:"Nursing Bookings"},{key:"ambulance",label:"Ambulance"},{key:"ambulance-drivers",label:"Ambulance Drivers"},{key:"ambulance-bookings",label:"Ambulance Bookings"},{key:"ambulance-fleet",label:"Ambulance Fleet Map"},{key:"doctors",label:"Doctors"},{key:"homecare",label:"Home Care"}];
function bookingActions(r, prefix){
  if(r.status==="cancelled"||r.status==="completed") return "";
  return `<div class="actions-cell">
    ${r.status==="new" ? `<button class="btn sm primary" data-act="${prefix}-accept" data-id="${r.id}">Accept</button>` : ""}
    <button class="btn sm danger" data-act="${prefix}-cancel" data-id="${r.id}">Cancel</button>
  </div>`;
}
function ambulanceFleetMap(){
  return `
  <div class="fleet-legend">
    <span><i style="background:var(--brand)"></i>Available</span>
    <span><i style="background:var(--gold)"></i>Busy</span>
  </div>
  <div class="fleet-map">
    ${DATA.ambulances.filter(a=>a._hasLocation).map(a=>`<div class="fleet-pin ${a.status==='available'?'active-order':'idle'}" style="left:${a.mapX}%; top:${a.mapY}%">
      <span class="fleet-pin-tip">${esc(a.provider)} · ${esc(a.type)} · ${esc(a.loc)}</span>
    </div>`).join("") || `<div class="hint" style="padding:20px">No drivers currently sharing live location.</div>`}
  </div>`;
}
VIEWS.healthcare = () => {
  const state = vs("healthcare",{tab:"labs"});
  let table, addBtn = true;
  if(state.tab==="doctors") table = renderTable("healthcare",[
    {key:"name",label:"Doctor"},{key:"spec",label:"Specialization"},{key:"fee",label:"Fee",render:r=>money(r.fee)},
    {key:"rating",label:"Rating",render:r=>`★ ${r.rating}`},{key:"status",label:"Availability",render:r=>statusBadge(r.status)},
  ], DATA.doctors);
  else if(state.tab==="nurses") table = renderTable("healthcare",[
    {key:"name",label:"Nurse",render:r=>`<div class="row-flex"><div class="avatar">${r.photo||initials(r.name)}</div><div><div class="cell-strong">${esc(r.name)}</div><div class="cell-sub">${esc(r.qualification)}</div></div></div>`},
    {key:"type",label:"Service"},{key:"degree",label:"Degree / Certificate"},
    {key:"whatsapp",label:"WhatsApp"},{key:"serviceArea",label:"Service Area (Pincode)"},
    {key:"rate",label:"Charge"},{key:"status",label:"Status",render:r=>statusBadge(r.status)},
  ], DATA.nurses);
  else if(state.tab==="nurse-bookings"){ addBtn=false; table = renderTable("healthcare",[
    {key:"id",label:"Booking"},{key:"customer",label:"Customer"},{key:"nurse",label:"Nurse"},{key:"type",label:"Service"},
    {key:"date",label:"Date"},{key:"payment",label:"Payment",render:r=>badge(r.payment,r.payment==="COD"?"gold":"blue")},
    {key:"status",label:"Status",render:r=>statusBadge(r.status)},
    {key:"_actions",label:"",sortable:false,render:r=>bookingActions(r,"nbk")},
  ], DATA.nurseBookings, {emptyText:"No nursing bookings yet."}); }
  else if(state.tab==="labs") table = renderTable("healthcare",[
    {key:"name",label:"Lab Partner",render:r=>`<div class="cell-strong">${esc(r.name)}</div><div class="cell-sub">${esc(r.test)}</div>`},
    {key:"includedTests",label:"Included Tests"},
    {key:"price",label:"Price",render:r=>`${money(r.price)} <span class="cell-sub" style="text-decoration:line-through">${money(r.oldPrice)}</span> <span class="badge green">${r.discount}% off</span>`},
    {key:"serviceArea",label:"Service Area"},
    {key:"fasting",label:"Fasting",render:r=>r.fasting?badge("Required","gold"):badge("Not required","gray")},
    {key:"sample",label:"Sample"},
    {key:"status",label:"Status",render:r=>statusBadge(r.status)},
    {key:"_actions",label:"",sortable:false,render:r=>`<button class="btn sm ${r.status==='active'?'danger':'primary'}" data-act="lab-toggle-visibility" data-id="${r.id}">${r.status==='active'?'Hide':'Activate'}</button>`},
  ], DATA.labs);
  else if(state.tab==="lab-bookings"){ addBtn=false; table = renderTable("healthcare",[
    {key:"id",label:"Booking"},{key:"customer",label:"Customer"},{key:"test",label:"Test"},{key:"provider",label:"Lab"},
    {key:"date",label:"Date"},{key:"payment",label:"Payment",render:r=>badge(r.payment,r.payment==="COD"?"gold":"blue")},
    {key:"status",label:"Status",render:r=>statusBadge(r.status)},
    {key:"_actions",label:"",sortable:false,render:r=>bookingActions(r,"lbk")},
  ], DATA.labBookings, {emptyText:"No lab bookings yet."}); }
  else if(state.tab==="ambulance") table = renderTable("healthcare",[
    {key:"provider",label:"Driver"},{key:"type",label:"Type"},{key:"rating",label:"Rating",render:r=>`★ ${r.rating}`},{key:"loc",label:"Pincode"},{key:"status",label:"Status",render:r=>statusBadge(r.status)},
  ], DATA.ambulances);
  else if(state.tab==="ambulance-drivers"){ addBtn=false; table = renderTable("healthcare",[
    {key:"name",label:"Driver"},{key:"provider",label:"Provider"},{key:"phone",label:"Phone"},
    {key:"license",label:"Licence",render:r=>statusBadge(r.license)},{key:"status",label:"Status",render:r=>statusBadge(r.status)},
  ], DATA.ambulanceDrivers, {emptyText:"No ambulance drivers yet."}); }
  else if(state.tab==="ambulance-bookings"){ addBtn=false; table = renderTable("healthcare",[
    {key:"id",label:"Booking"},{key:"customer",label:"Customer"},{key:"provider",label:"Provider"},{key:"type",label:"Type"},
    {key:"date",label:"Date"},{key:"payment",label:"Payment",render:r=>badge(r.payment,r.payment==="COD"?"gold":"blue")},
    {key:"status",label:"Status",render:r=>statusBadge(r.status)},
    {key:"_actions",label:"",sortable:false,render:r=>bookingActions(r,"abk")},
  ], DATA.ambulanceBookings, {emptyText:"No ambulance bookings yet."}); }
  else if(state.tab==="ambulance-fleet"){ addBtn=false; }
  else table = renderTable("healthcare",[
    {key:"name",label:"Service"},{key:"provider",label:"Provider"},{key:"rate",label:"Rate"},{key:"status",label:"Status",render:r=>statusBadge(r.status)},
  ], DATA.homecare);
  return `
  <div class="view-head"><h1>Lab, Nursing &amp; Ambulance</h1><p>Catalogues, directories and live bookings for lab tests, home nursing and ambulance services.</p></div>
  ${toolbarTabs("healthcare", HC_TABS)}
  ${addBtn ? `<div class="view-toolbar"><button class="btn primary" data-act="hc-add" data-kind="${state.tab}">+ Add ${state.tab==="labs"?"lab test":state.tab.slice(0,-1)}</button></div>` : ""}
  <div class="card"><div class="card-body ${state.tab==='ambulance-fleet'?'':'pad0'}" id="tablewrap-healthcare">${state.tab==='ambulance-fleet' ? ambulanceFleetMap() : table}</div></div>`;
};

/* ---- Support ---- */
VIEWS.support = () => `
  <div class="view-head"><h1>Support & Complaints</h1><p>Tickets from customers, merchants and riders in one queue.</p></div>
  <div class="card"><div class="card-body pad0" id="tablewrap-support">
    ${renderTable("support",[
      {key:"id",label:"Ticket"},{key:"from",label:"From"},{key:"name",label:"Name"},{key:"subject",label:"Subject"},
      {key:"priority",label:"Priority",render:r=>statusBadge(r.priority)},{key:"status",label:"Status",render:r=>statusBadge(r.status)},{key:"date",label:"Opened"},
      {key:"_actions",label:"",sortable:false,render:r=>r.status!=="closed"?`<button class="btn sm primary" data-act="ticket-reply" data-id="${r.id}">Reply & close</button>`:""},
    ], DATA.tickets)}
  </div></div>`;

/* ---- Reviews ---- */
VIEWS.reviews = () => `
  <div class="view-head"><h1>Reviews & Ratings</h1><p>Moderate product, pharmacy and rider reviews; hide anything reported.</p></div>
  <div class="card"><div class="card-body pad0" id="tablewrap-reviews">
    ${renderTable("reviews",[
      {key:"type",label:"Type",render:r=>badge(r.type,"blue")},{key:"subject",label:"About"},
      {key:"rating",label:"Rating",render:r=>"★".repeat(r.rating)+"☆".repeat(5-r.rating)},
      {key:"comment",label:"Comment"},
      {key:"reported",label:"Reported",render:r=>r.reported?badge("Reported","red"):badge("Clean","green")},
      {key:"_actions",label:"",sortable:false,render:r=>`<button class="btn sm danger" data-act="review-hide" data-id="${r.id}">Hide</button>`},
    ], DATA.reviews)}
  </div></div>`;

/* ---- Notifications ---- */
VIEWS.notifications = () => `
  <div class="view-head"><h1>Notifications</h1><p>Send push notifications to users, merchants or riders.</p></div>
  <div class="card"><div class="card-head"><h3>Compose notification</h3></div>
    <div class="card-body">
      <div class="field-row">
        <div class="field"><label>Audience</label><select id="ntfAudience"><option>All Users</option><option>Merchants</option><option>Riders</option></select></div>
        <div class="field"><label>Schedule</label><select id="ntfSchedule"><option>Send now</option><option>Schedule later</option></select></div>
      </div>
      <div class="field"><label>Title</label><input id="ntfTitle" placeholder="e.g. Monsoon health tips inside"></div>
      <div class="field"><label>Message</label><textarea id="ntfBody" placeholder="Write the notification body..."></textarea></div>
      <button class="btn primary" data-act="ntf-send">Send notification</button>
    </div>
  </div>
  <div class="card"><div class="card-head"><h3>Sent history</h3></div><div class="card-body pad0" id="tablewrap-notifications">
    ${renderTable("notifications",[
      {key:"title",label:"Title"},{key:"audience",label:"Audience",render:r=>badge(r.audience,"blue")},
      {key:"sentAt",label:"Sent"},{key:"opens",label:"Open rate"},
    ], DATA.notificationsHistory)}
  </div></div>`;

/* ---- Reports ---- */
VIEWS.reports = () => {
  const catCounts = DATA.categories.map(c=>DATA.products.filter(p=>p.category===c).length);
  const topPharmacy = [...DATA.merchants].sort((a,b)=>b.orders-a.orders);
  return `
  <div class="view-head"><h1>Reports & Analytics</h1><p>Sales, growth and performance trends across the platform.</p></div>
  <div class="card"><div class="card-head"><h3>Orders — last 7 days</h3></div><div class="card-body">${svgBarChart(DATA.weekOrders, DATA.weekLabels)}</div></div>
  <div class="card"><div class="card-head"><h3>Products by category</h3></div><div class="card-body">${svgBarChart(catCounts, DATA.categories)}</div></div>
  <div class="card"><div class="card-head"><h3>Top pharmacies by orders</h3></div><div class="card-body pad0">
    ${renderTable("reports-top",[
      {key:"name",label:"Pharmacy"},{key:"orders",label:"Orders"},{key:"earnings",label:"Earnings",render:r=>money(r.earnings)},{key:"rating",label:"Rating",render:r=>r.rating?`★ ${r.rating}`:"—"},
    ], topPharmacy)}
  </div></div>
  <div class="stat-grid">
    <div class="stat-card"><div class="lbl">Cancellation Rate</div><div class="val">${((DATA.orders.filter(o=>o.status==="cancelled").length/DATA.orders.length)*100).toFixed(1)}%</div></div>
    <div class="stat-card"><div class="lbl">Avg. Delivery Time</div><div class="val">34 min</div></div>
    <div class="stat-card"><div class="lbl">User Growth (MoM)</div><div class="val">+9.8%</div></div>
    <div class="stat-card"><div class="lbl">Merchant Growth (MoM)</div><div class="val">+3</div></div>
  </div>`;
};

/* ---- Admin & Permissions ---- */
const PERM_MODULES = ["Orders","Finance","Merchants","Riders","Settings"];
VIEWS.adminroles = () => `
  <div class="view-head"><h1>Security &amp; Audit</h1><p>Role-based access, admin accounts, 2FA and the full audit trail of admin actions.</p></div>
  <div class="view-toolbar"><button class="btn primary" data-act="admin-add">+ Invite admin</button></div>
  <div class="card"><div class="card-head"><h3>Admin accounts</h3></div><div class="card-body pad0" id="tablewrap-adminroles">
    ${renderTable("adminroles",[
      {key:"name",label:"Admin"},{key:"role",label:"Role",render:r=>badge(r.role,"blue")},{key:"email",label:"Email"},
      {key:"lastLogin",label:"Last login"},
      {key:"twofa",label:"2FA",render:r=>r.twofa?badge("Enabled","green"):badge("Disabled","gold")},
    ], DATA.admins)}
  </div></div>
  <div class="card"><div class="card-head"><h3>Role permissions</h3><span class="sub">Super Admin has full access by default</span></div>
    <div class="card-body">
      <div class="roles-grid">
        <div class="rh">Module</div><div class="rh">Super</div><div class="rh">Operations</div><div class="rh">Finance</div><div class="rh">Support</div><div class="rh">Read-only</div>
        ${PERM_MODULES.map(m=>`<div class="rl">${m}</div><div class="rc">✔</div><div class="rc">${m==="Finance"?"—":"✔"}</div><div class="rc">${m==="Finance"||m==="Orders"?"✔":"—"}</div><div class="rc">${m==="Orders"?"View":"—"}</div><div class="rc">View</div>`).join("")}
      </div>
    </div>
  </div>
  <div class="card"><div class="card-head"><h3>Audit log</h3></div><div class="card-body pad0">
    ${renderTable("audit",[{key:"who",label:"Admin"},{key:"action",label:"Action"},{key:"when",label:"When"}], DATA.auditLog, {})}
  </div></div>`;

/* ---- Settings ---- */
VIEWS.settings = () => { const s = STATE.settings; return `
  <div class="view-head"><h1>Platform Settings</h1><p>Fees, commission, tax and policies applied across MediFinder.</p></div>
  <div class="card"><div class="card-head"><h3>General</h3></div><div class="card-body">
    <div class="field-row">
      <div class="field"><label>Platform name</label><input id="setName" value="${esc(s.platformName)}"></div>
      <div class="field"><label>Platform commission (%)</label><input id="setCommission" type="number" value="${s.commission}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>COD fee (৳)</label><input id="setCod" type="number" value="${s.codFee}"></div>
      <div class="field"><label>Processing fee (%)</label><input id="setProcessing" type="number" value="${s.processingFee}"></div>
    </div>
    <div class="field"><label>Tax / VAT (%)</label><input id="setTax" type="number" value="${s.tax}" style="max-width:160px"></div>
  </div></div>
  <div class="card"><div class="card-head"><h3>Policies</h3></div><div class="card-body">
    <div class="field"><label>Cancellation policy</label><textarea id="setCancel">${esc(s.cancellationPolicy)}</textarea></div>
    <div class="field"><label>Refund policy</label><textarea id="setRefund">${esc(s.refundPolicy)}</textarea></div>
  </div></div>
  <div class="card"><div class="card-head"><h3>Security</h3></div><div class="card-body">
    <div class="row-flex" style="justify-content:space-between; padding:6px 0">
      <div><div class="cell-strong">Require 2FA for all admins</div><div class="cell-sub">Applies at next login</div></div>
      <label class="toggle"><input type="checkbox" checked><span class="track"></span></label>
    </div>
  </div></div>
  <button class="btn primary" data-act="settings-save">Save settings</button>`;
};

/* ---------------------------------------------------------
   6. ACTIONS (event delegation targets)
   --------------------------------------------------------- */
const Actions = {
  "simulate-order": ()=>{
    const merchant = DATA.merchants[Math.floor(Math.random()*DATA.merchants.length)];
    const customer = DATA.users[Math.floor(Math.random()*DATA.users.length)];
    const total = 150 + Math.floor(Math.random()*900);
    const order = {id:nextId("ORD"), customer:customer.name, merchant:merchant.name, total, status:"pending", payment:Math.random()>0.5?"COD":"Online", date:"2026-09-22 now"};
    DATA.orders.unshift(order);
    DATA.activityFeed.unshift({ic:"▤", text:`New order ${order.id} placed`, sub:`${merchant.name} · ${money(total)}`});
    render(); toast(`New order ${order.id} received — dashboard updated`);
  },
  "user-toggle": async (el)=>{ const u=DATA.users.find(x=>x.id===el.dataset.id); if(!u) return;
    const next = u.status==="active" ? "blocked" : "active";
    const { error } = await supabase.from('profiles').update({ status:next }).eq('id', u.id);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    u.status = next; render(); toast(`${u.name} ${next==="active"?"unblocked":"blocked"}`);
  },
  "user-history": (el)=>{ const u=DATA.users.find(x=>x.id===el.dataset.id); if(!u) return;
    openModal(`${u.name} — order history`, `
      <div class="field"><label>Saved address</label><div class="cell-sub">${esc(u.addr)}</div></div>
      ${renderTable("hist",[{key:"id",label:"Order"},{key:"total",label:"Total",render:r=>money(r.total)},{key:"status",label:"Status",render:r=>statusBadge(r.status)},{key:"date",label:"Date"}], DATA.orders.filter(o=>o._userId===u.id), {emptyText:"No orders yet."})}
    `, `<button class="btn" data-close-modal>Close</button>`);
  },

  "user-bulk-message": (el)=>{ const seg=el.dataset.seg;
    const count = seg==="all" ? DATA.users.length : DATA.users.filter(u=>userSegment(u)===seg).length;
    openModal(`Message ${seg==="all"?"all customers":seg+" segment"}`, `
      <div class="field"><div class="hint">Will be sent to ${count} customer(s).</div></div>
      <div class="field"><label>Message</label><textarea id="uBulkMsg" placeholder="Type your message..."></textarea></div>`,
      `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-act="user-bulk-message-send" data-seg="${seg}">Send</button>`);
  },
  "user-bulk-message-send": async (el)=>{ const msg=$("#uBulkMsg").value.trim(); if(!msg){ toast("Message is required","danger"); return; }
    const seg=el.dataset.seg;
    if(seg==="all"){
      const { error } = await supabase.from('notifications').insert({ user_id:null, type:'admin_broadcast', title:'Message from MediFinder', message:msg });
      if(error){ toast("Failed: "+error.message,"danger"); return; }
    } else {
      const targets = DATA.users.filter(u=>userSegment(u)===seg);
      if(!targets.length){ toast("No customers in this segment","danger"); return; }
      const rows = targets.map(u=>({ user_id:u.id, type:'admin_broadcast', title:'Message from MediFinder', message:msg }));
      const { error } = await supabase.from('notifications').insert(rows);
      if(error){ toast("Failed: "+error.message,"danger"); return; }
    }
    closeModal(); toast(`Sent to ${count(seg)} customer(s)`);
    function count(s){ return s==="all" ? DATA.users.length : DATA.users.filter(u=>userSegment(u)===s).length; }
  },

  "merchant-approve": async (el)=>{ const m=DATA.merchants.find(x=>x.id===Number(el.dataset.id)); if(!m) return;
    const { error } = await supabase.rpc('approve_merchant_license', { merchant_id_input: m.id });
    if(error){ toast("Approve failed: "+error.message,"danger"); return; }
    await supabase.from('merchants').update({ kyc_status:'approved', kyc_rejection_reason:'' }).eq('id', m.id);
    await supabase.from('merchant_notifications').insert({ merchant_id:m.id, title:'Shop verified', message:'Your shop & drug licence have been verified. You are now live on MediFinder.', type:'success', category:'kyc' });
    m.status="active"; m.license="verified"; m.kycReason=""; render(); toast("Merchant approved / KYC verified");
  },
  "merchant-reject": (el)=>{ const m=DATA.merchants.find(x=>x.id===Number(el.dataset.id)); if(!m) return;
    openModal(`Reject — ${m.name}`, `
      <div class="field"><div class="hint">The merchant will be notified with this reason.</div></div>
      <div class="field"><label>Rejection reason</label><textarea id="mRejectReason" placeholder="e.g. Expired drug licence document"></textarea></div>`,
      `<button class="btn" data-close-modal>Cancel</button><button class="btn danger" data-act="merchant-reject-confirm" data-id="${m.id}">Reject &amp; notify</button>`);
  },
  "merchant-reject-confirm": async (el)=>{ const m=DATA.merchants.find(x=>x.id===Number(el.dataset.id)); if(!m) return;
    const reason = $("#mRejectReason").value.trim() || "Not specified";
    const { error } = await supabase.from('merchants').update({ status:'suspended', license_status:'unverified', kyc_status:'rejected', kyc_rejection_reason:reason }).eq('id', m.id);
    if(error){ toast("Reject failed: "+error.message,"danger"); return; }
    await supabase.from('merchant_kyc').update({ verified:false, status:'rejected', rejection_reason:reason }).eq('merchant_id', m.id);
    await supabase.from('merchant_notifications').insert({ merchant_id:m.id, title:'KYC rejected', message:reason, type:'error', category:'kyc' });
    m.status="suspended"; m.license="rejected"; m.kycReason=reason;
    await logAdminAction(`Rejected KYC for ${m.name} — ${reason}`);
    closeModal(); render(); toast("Merchant rejected & notified","danger");
  },
  "merchant-suspend": async (el)=>{ const m=DATA.merchants.find(x=>x.id===Number(el.dataset.id)); if(!m) return;
    const { error } = await supabase.from('merchants').update({ status:'suspended' }).eq('id', m.id);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    setStatus(DATA.merchants,Number(el.dataset.id),"suspended"); toast("Merchant suspended","danger");
  },
  "merchant-activate": async (el)=>{ const m=DATA.merchants.find(x=>x.id===Number(el.dataset.id)); if(!m) return;
    const { error } = await supabase.from('merchants').update({ status:'active', license_status:'verified' }).eq('id', m.id);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    m.status="active"; m.license="verified"; render(); toast("Merchant activated");
  },
  "merchant-notify": (el)=>{ const m=DATA.merchants.find(x=>x.id===Number(el.dataset.id)); if(!m) return;
    openModal(`Notify — ${m.name}`, `
      <div class="field"><label>Message</label><textarea id="mNotifyMsg" placeholder="e.g. Please update your bank settlement details"></textarea></div>`,
      `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-act="merchant-notify-confirm" data-id="${m.id}">Send</button>`);
  },
  "merchant-notify-confirm": async (el)=>{ const m=DATA.merchants.find(x=>x.id===Number(el.dataset.id)); if(!m) return;
    const msg = $("#mNotifyMsg").value.trim(); if(!msg){ toast("Message is required","danger"); return; }
    const { error } = await supabase.from('merchant_notifications').insert({ merchant_id:m.id, title:'Message from MediFinder Admin', message:msg, type:'info', category:'general' });
    if(error){ toast("Failed to send: "+error.message,"danger"); return; }
    closeModal(); render(); toast(`Notification sent to ${m.name}`);
  },

  "rider-approve": async (el)=>{ const rid=Number(el.dataset.id);
    const { error } = await supabase.from('rider_kyc_application').upsert({ rider_id:rid, status:'approved', rejection_reason:'', reviewed_at:new Date().toISOString() }, { onConflict:'rider_id' });
    if(error){ toast("Approve failed: "+error.message,"danger"); return; }
    setStatus(DATA.riders,rid,"active"); toast("Rider KYC approved");
  },
  "rider-reject": (el)=>{ const r=DATA.riders.find(x=>x.id===Number(el.dataset.id)); if(!r) return;
    openModal(`Reject KYC — ${r.name}`, `
      <div class="field"><div class="hint">The rider will need to resubmit their documents.</div></div>
      <div class="field"><label>Rejection reason</label><textarea id="rRejectReason" placeholder="e.g. Blurry license photo"></textarea></div>`,
      `<button class="btn" data-close-modal>Cancel</button><button class="btn danger" data-act="rider-reject-confirm" data-id="${r.id}">Reject</button>`);
  },
  "rider-reject-confirm": async (el)=>{ const rid=Number(el.dataset.id); const r=DATA.riders.find(x=>x.id===rid); if(!r) return;
    const reason = $("#rRejectReason").value.trim() || "Not specified";
    const { error } = await supabase.from('rider_kyc_application').upsert({ rider_id:rid, status:'rejected', rejection_reason:reason, reviewed_at:new Date().toISOString() }, { onConflict:'rider_id' });
    if(error){ toast("Reject failed: "+error.message,"danger"); return; }
    r.status="suspended"; r.kycReason=reason; closeModal(); render(); toast("Rider application rejected","danger");
  },
  "rider-suspend": async (el)=>{ const rid=Number(el.dataset.id);
    const { error } = await supabase.from('rider_kyc_application').upsert({ rider_id:rid, status:'rejected', rejection_reason:'Suspended by admin', reviewed_at:new Date().toISOString() }, { onConflict:'rider_id' });
    if(error){ toast("Suspend failed: "+error.message,"danger"); return; }
    setStatus(DATA.riders,rid,"suspended"); toast("Rider suspended","danger");
  },
  "rider-activate": async (el)=>{ const rid=Number(el.dataset.id);
    const { error } = await supabase.from('rider_kyc_application').upsert({ rider_id:rid, status:'approved', rejection_reason:'', reviewed_at:new Date().toISOString() }, { onConflict:'rider_id' });
    if(error){ toast("Activate failed: "+error.message,"danger"); return; }
    setStatus(DATA.riders,rid,"active"); toast("Rider activated");
  },

  "order-view": (el)=>{ const o=DATA.orders.find(x=>x.id===el.dataset.id);
    const timeline = ["pending","accepted","shipped","picked_up","delivered"];
    const idx = timeline.indexOf(o.status==="broadcasted"?"shipped":o.status);
    openModal(`Order ${o.id}`, `
      <div class="field-row">
        <div><div class="hint">Customer</div><div class="cell-strong">${esc(o.customer)}</div></div>
        <div><div class="hint">Pharmacy</div><div class="cell-strong">${esc(o.merchant)}</div></div>
      </div>
      <div class="field-row" style="margin-top:10px">
        <div><div class="hint">Rider</div><div class="cell-strong">${esc(o.rider)}</div></div>
        <div><div class="hint">Payment</div><div class="cell-strong">${esc(o.payment)} · ${money(o.total)}</div></div>
      </div>
      <div style="margin-top:16px">
        ${idx>=0 ? timeline.map((s,i)=>`<div class="row-flex" style="padding:5px 0"><span style="color:${i<=idx?'var(--brand)':'var(--ink-faint)'}">${i<=idx?"●":"○"}</span><span style="margin-left:8px; ${i<=idx?'font-weight:600':''}">${s.replace(/_/g," ")}</span></div>`).join("") : `<div class="cell-sub">Status: ${o.status}</div>`}
      </div>`, `<button class="btn" data-close-modal>Close</button>`);
  },
  "order-assign": async (el)=>{ const o=DATA.orders.find(x=>x.id===el.dataset.id);
    const available = await loadOnDutyRidersLite();
    if(!available.length){ toast("No on-duty rider available right now","danger"); return; }
    openModal(`Assign rider — ${o.id}`, `
      <div class="field"><label>Choose rider</label><select id="assignRider">${available.map(r=>`<option value="${r.id}">${esc(r.name)} · ${esc(r.phone||"")}</option>`).join("")}</select></div>`,
      `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-act="order-assign-save" data-id="${o.id}">Assign</button>`);
  },
  "order-assign-save": async (el)=>{ const o=DATA.orders.find(x=>x.id===el.dataset.id); if(!o) return;
    const riderId = $("#assignRider").value; const riderOpt = $("#assignRider").selectedOptions[0];
    const { error } = await supabase.from('orders').update({ rider_id: Number(riderId) }).eq('order_id', o.id);
    if(error){ toast("Failed to assign rider: "+error.message,"danger"); return; }
    o.rider = riderOpt ? riderOpt.textContent.split(" · ")[0] : o.rider;
    closeModal(); render(); toast("Rider assigned");
  },

  "product-add": ()=> openModal("Add product", `
      <div class="field"><label>Product name</label><input id="pName"></div>
      <div class="field-row">
        <div class="field"><label>Category</label><input id="pCat" list="pCatList" placeholder="e.g. Pain Relief"><datalist id="pCatList">${DATA.categories.map(c=>`<option value="${esc(c)}">`).join("")}</datalist></div>
        <div class="field"><label>Brand</label><input id="pBrand" list="pBrandList" placeholder="e.g. Square"><datalist id="pBrandList">${DATA.brands.map(b=>`<option value="${esc(b)}">`).join("")}</datalist></div>
      </div>
      <div class="field"><label>Merchant (shop)</label><select id="pMerchant">${DATA.merchants.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select></div>
      <div class="field-row">
        <div class="field"><label>Price (৳)</label><input id="pPrice" type="number"></div>
        <div class="field"><label>Stock</label><input id="pStock" type="number"></div>
      </div>
      <div class="field"><label><input type="checkbox" id="pRx" style="width:auto; margin-right:6px">Prescription required</label></div>`,
      `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-act="product-save">Add product</button>`),
  "product-save": async ()=>{ const name=$("#pName").value.trim(); if(!name){ toast("Product name required","danger"); return; }
    const merchantId = Number($("#pMerchant").value);
    const { error } = await supabase.from('medicines').insert({
      product_name:name, name, category:$("#pCat").value||"Medicine", brand_name:$("#pBrand").value||null,
      merchant_id: merchantId, selling_price:+$("#pPrice").value||0, mrp:+$("#pPrice").value||0,
      stock_qty:+$("#pStock").value||0, is_rx:$("#pRx").checked, status:"Approved", admin_approved:true, is_visible:true,
    });
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    closeModal(); await loadProductsFromDB(); render(); toast("Product added");
  },
  "product-edit": (el)=>{ const p=DATA.products.find(x=>x.id===Number(el.dataset.id)); if(!p) return;
    openModal(`Edit ${p.name}`, `
      <div class="field-row"><div class="field"><label>Price (৳)</label><input id="epPrice" type="number" value="${p.price}"></div><div class="field"><label>Stock</label><input id="epStock" type="number" value="${p.stock}"></div></div>`,
      `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-act="product-edit-save" data-id="${p.id}">Save</button>`);
  },
  "product-edit-save": async (el)=>{ const p=DATA.products.find(x=>x.id===Number(el.dataset.id)); if(!p) return;
    const price=+$("#epPrice").value||p.price, stock=+$("#epStock").value||0;
    const { error } = await supabase.from('medicines').update({ selling_price:price, mrp:price, stock_qty:stock }).eq('id', p.id);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    p.price=price; p.stock=stock; closeModal(); render(); toast("Product updated");
  },
  "product-visible": async (el)=>{ const p=DATA.products.find(x=>x.id===Number(el.dataset.id)); if(!p) return;
    const next = !p.visible;
    const { error } = await supabase.from('medicines').update({ is_visible:next }).eq('id', p.id);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    p.visible=next; toast(p.visible?"Product visible to customers":"Product hidden");
  },
  "product-approve": async (el)=>{ const p=DATA.products.find(x=>x.id===Number(el.dataset.id)); if(!p) return;
    const { error } = await supabase.from('medicines').update({ status:'Approved', admin_approved:true, is_visible:true }).eq('id', p.id);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    p.approval="approved"; p.visible=true; render(); toast("Medicine approved & live");
  },
  "product-reject": async (el)=>{ const p=DATA.products.find(x=>x.id===Number(el.dataset.id)); if(!p) return;
    const { error } = await supabase.from('medicines').update({ status:'Rejected', admin_approved:false, is_visible:false }).eq('id', p.id);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    p.approval="rejected"; p.visible=false; render(); toast("Medicine rejected","danger");
  },

  "rx-view": (el)=>{ const r=DATA.prescriptions.find(x=>x.id===el.dataset.id); if(!r) return;
    openModal(`Prescription ${String(r.id).slice(0,8)}`, `
      ${r.imageUrl ? `<img src="${esc(r.imageUrl)}" style="max-width:100%; border-radius:8px" alt="Prescription">` : `<div class="upload-box" style="cursor:default">No image on this request</div>`}
      <div class="field" style="margin-top:12px"><div class="hint">Customer</div><div class="cell-strong">${esc(r.customer)}</div></div>
      <div class="field"><div class="hint">Items</div><div class="cell-strong">${esc(r.items)}</div></div>
      <div class="field"><div class="hint">Accepted by</div><div class="cell-strong">${esc(r.reviewer)}</div></div>`,
      `<button class="btn" data-close-modal>Close</button>`);
  },
  "rx-cancel": async (el)=>{ const r=DATA.prescriptions.find(x=>x.id===el.dataset.id); if(!r) return;
    const { error } = await supabase.from('prescription_orders').update({ status:'cancelled' }).eq('id', r.id);
    if(error){ toast("Cancel failed: "+error.message,"danger"); return; }
    r.status="cancelled"; render(); toast("Prescription request cancelled","danger");
  },

  "payout-mark": async (el)=>{
    const isMerchant = el.dataset.kind==="merchant";
    const arr = isMerchant ? DATA.merchantPayouts : DATA.riderPayouts;
    const p=arr.find(x=>x.id===el.dataset.id); if(!p) return;
    const { error } = isMerchant
      ? await supabase.from('merchant_payouts').update({ status:'Paid', paid_at:new Date().toISOString() }).eq('id', p.id)
      : await supabase.from('admin_payout_requests').update({ request_status:'completed', processed_at:new Date().toISOString() }).eq('id', p.id);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    p.status="paid"; render(); toast("Marked as paid");
  },
  "refund-process": async (el)=>{ const r=DATA.refunds.find(x=>x.id===el.dataset.id); if(!r) return;
    const { error } = await supabase.from('cancelled_orders').update({ status:'Refunded', refund_amount:r.amount, refunded_at:new Date().toISOString() }).eq('id', r.id);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    r.status="processed"; render(); toast("Refund processed");
  },

  "coupon-add": ()=> openModal("Create coupon", `
      <div class="field-row"><div class="field"><label>Code</label><input id="cCode" placeholder="e.g. SAVE20"></div>
      <div class="field"><label>Type</label><select id="cType"><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></select></div></div>
      <div class="field-row"><div class="field"><label>Value</label><input id="cValue" type="number"></div>
      <div class="field"><label>Max discount (৳)</label><input id="cMax" type="number"></div></div>
      <div class="field-row"><div class="field"><label>Min order (৳)</label><input id="cMin" type="number"></div>
      <div class="field"><label>Usage limit</label><input id="cLimit" type="number" value="500"></div></div>
      <div class="field"><label>Expiry date</label><input id="cExpiry" type="date"></div>`,
      `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-act="coupon-save">Create</button>`),
  "coupon-save": async ()=>{ const code=$("#cCode").value.trim().toUpperCase(); if(!code){ toast("Coupon code required","danger"); return; }
    const type=$("#cType").value, value=+$("#cValue").value||0, maxD=+$("#cMax").value||0, minO=+$("#cMin").value||0, limit=+$("#cLimit").value||100, expiry=$("#cExpiry").value||null;
    const { error } = await supabase.from('coupons').insert({
      code, discount_type: type==="percent"?"percentage":"fixed", discount_value:value, max_discount_amount:maxD,
      min_order_amount:minO, max_uses:limit, end_date: expiry ? new Date(expiry).toISOString() : null, is_active:true,
    });
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    closeModal(); await loadCouponsFromDB(); render(); toast("Coupon created");
  },
  "coupon-delete": async (el)=>{ const c=DATA.coupons.find(x=>x.code===el.dataset.code); if(!c) return;
    const { error } = await supabase.from('coupons').update({ is_active:false }).eq('id', c.id);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    DATA.coupons = DATA.coupons.filter(x=>x.code!==el.dataset.code); render(); toast("Coupon deactivated","danger");
  },

  "ad-add": ()=> adFormModal(),
  "ad-edit": (el)=>{ const a=DATA.ads.find(x=>x.id===Number(el.dataset.id)); if(a) adFormModal(a); },
  "ad-save": async (el)=>{
    const name = $("#adName").value.trim();
    if(!name){ toast("Title is required","danger"); return; }
    const editId = el.dataset.id ? Number(el.dataset.id) : null;
    const linkedProductId = $("#adProductId").value || null;
    const customLink = $("#adBtnAction").value.trim();
    const btnAction = linkedProductId ? `product-detail.html?id=${encodeURIComponent(linkedProductId)}` : customLink;

    let useCustomImage = false, customImageUrl = null;
    if(AD_UPLOADED_FILE){
      const path = `sponsored_banners/${Date.now()}_${AD_UPLOADED_FILE.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
      const { error: upErr } = await supabase.storage.from('media').upload(path, AD_UPLOADED_FILE, { contentType: AD_UPLOADED_FILE.type });
      if(upErr){ toast("Upload failed: "+upErr.message,"danger"); return; }
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
      customImageUrl = urlData.publicUrl; useCustomImage = true;
    } else if(editId){
      const existing = DATA.ads.find(x=>x.id===editId);
      if(existing && existing.imageUrl){ customImageUrl = existing.imageUrl; useCustomImage = true; }
    }

    const payload = {
      title:name, subtitle:$("#adSubtitle").value||"", tag:$("#adTag").value||"",
      btn_text:$("#adBtnText").value||"Shop Now", btn_action:btnAction||"",
      first_order_discount_percent: +$("#adDiscount").value || 0,
      valid_until: $("#adEnd").value || null,
      use_custom_image: useCustomImage, custom_image_url: customImageUrl,
    };
    const { error } = editId
      ? await supabase.from('sponsored_products').update(payload).eq('id', editId)
      : await supabase.from('sponsored_products').insert({ ...payload, is_active:true });
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    closeModal(); await loadAdsFromDB(); render(); toast(editId?"Sponsored banner updated":"Sponsored banner created");
  },
  "ad-pause": async (el)=>{ const id=Number(el.dataset.id);
    const { error } = await supabase.from('sponsored_products').update({ is_active:false }).eq('id', id);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    setStatus(DATA.ads,id,"Paused"); toast("Banner paused");
  },
  "ad-run": async (el)=>{ const id=Number(el.dataset.id);
    const { error } = await supabase.from('sponsored_products').update({ is_active:true }).eq('id', id);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    setStatus(DATA.ads,id,"Running"); toast("Banner running");
  },
  "ad-delete": async (el)=>{ const id=Number(el.dataset.id);
    const { error } = await supabase.from('sponsored_products').delete().eq('id', id);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    DATA.ads = DATA.ads.filter(a=>a.id!==id); render(); toast("Banner deleted","danger");
  },

  "zone-add": ()=> promptAdd("New delivery zone", "Zone name", async (v)=>{
    const { error } = await supabase.from('service_zones').insert({ name:v, base_fee:30, per_km_fee:8, express_fee:20, is_active:true });
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    await loadZonesFromDB(); render(); toast("Zone added");
  }),
  "zone-toggle": async (el)=>{ const z=DATA.zones.find(x=>x.name===el.dataset.name); if(!z) return;
    const next = z.status==="active" ? "paused" : "active";
    const { error } = await supabase.from('service_zones').update({ is_active: next==="active" }).eq('id', z.id);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    z.status = next; toast(`${z.name} ${z.status}`);
  },

  "hc-add": (el)=>{ const kind=el.dataset.kind;
    // NOTE: "doctors" and "homecare" are intentionally left as local-only demo
    // data — no real Supabase table exists for them and none was requested.
    const map = {doctors:["Doctor name","spec"], nurses:["Nurse name","type"], labs:["Lab / partner name","test"], ambulance:["Provider name","type"], homecare:["Service name","provider"]};
    promptAdd(`Add to ${kind}`, map[kind][0], async (v)=>{
      if(kind==="doctors") DATA.doctors.push({id:nextId("DOC"),name:v,spec:"General Physician",fee:500,status:"available",rating:4.5});
      if(kind==="homecare") DATA.homecare.push({id:nextId("HMC"),name:v,provider:"CarePlus",rate:"৳900/session",status:"available"});
      if(kind==="nurses"){
        const { error } = await supabase.from('nurses').insert({ name:v });
        if(error){ toast("Failed to add nurse: "+error.message,"danger"); return; }
        await loadNursesFromDB(); await logAdminAction(`Added nurse ${v}`); render(); toast("Nurse added"); return;
      }
      if(kind==="labs"){
        const testCode = "LAB-"+Date.now();
        const { error } = await supabase.from('lab_tests').insert({ test_code:testCode, test_name:v, name:v, active:true });
        if(error){ toast("Failed to add lab test: "+error.message,"danger"); return; }
        await loadLabTestsFromDB(); await logAdminAction(`Added lab test ${v}`); render(); toast("Lab test added"); return;
      }
      if(kind==="ambulance"){ toast("Ambulance units are added by drivers signing up via the Ambulance Partner app, not from here.","danger"); return; }
      render(); toast("Added");
    });
  },
  "lab-toggle-visibility": async (el)=>{ const l=DATA.labs.find(x=>x.id===el.dataset.id); if(!l) return;
    const next = l.status==="active" ? "hidden" : "active";
    const { error } = await supabase.from('lab_tests').update({ active: next==="active" }).eq('id', l.id);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    l.status = next; render(); toast(l.status==="active"?"Lab test activated":"Lab test hidden");
  },

  "lbk-accept": async (el)=>{ const b=DATA.labBookings.find(x=>x.id===el.dataset.id); if(!b) return;
    const { error } = await supabase.from('lab_bookings').update({ status:"Confirmed" }).eq('id', b._rawId);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    await loadLabBookingsFromDB(); render(); toast("Lab booking accepted"); },
  "lbk-cancel": async (el)=>{ const b=DATA.labBookings.find(x=>x.id===el.dataset.id); if(!b) return;
    const { error } = await supabase.from('lab_bookings').update({ status:"Cancelled" }).eq('id', b._rawId);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    await loadLabBookingsFromDB(); render(); toast("Lab booking cancelled","danger"); },
  "nbk-accept": async (el)=>{ const b=DATA.nurseBookings.find(x=>x.id===el.dataset.id); if(!b) return;
    const { error } = await supabase.from('nurse_bookings').update({ status:"approved" }).eq('id', b._rawId);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    await loadNurseBookingsFromDB(); render(); toast("Nurse assigned to booking"); },
  "nbk-cancel": async (el)=>{ const b=DATA.nurseBookings.find(x=>x.id===el.dataset.id); if(!b) return;
    const { error } = await supabase.from('nurse_bookings').update({ status:"cancelled" }).eq('id', b._rawId);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    await loadNurseBookingsFromDB(); render(); toast("Nursing booking cancelled","danger"); },
  "abk-accept": async (el)=>{ const b=DATA.ambulanceBookings.find(x=>x.id===el.dataset.id); if(!b) return;
    const { error } = await supabase.from('ambulance_bookings').update({ status:"accepted" }).eq('id', b._rawId);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    await loadAmbulanceBookingsFromDB(); render(); toast("Ambulance dispatched"); },
  "abk-cancel": async (el)=>{ const b=DATA.ambulanceBookings.find(x=>x.id===el.dataset.id); if(!b) return;
    const { error } = await supabase.from('ambulance_bookings').update({ status:"cancelled" }).eq('id', b._rawId);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    await loadAmbulanceBookingsFromDB(); render(); toast("Ambulance booking cancelled","danger"); },

  "fleet-focus": (el)=>{ const r=DATA.riders.find(x=>x.id===Number(el.dataset.id)); if(!r) return;
    openModal(`Rider — ${r.name}`, `
      <div class="field"><div class="hint">${esc(r.id)} · ${esc(FLEET_LABEL[fleetStatusOf(r)]||"")}</div></div>
      <div class="field-row">
        <div class="field"><label>Vehicle</label><input value="${esc(r.vehicle)}" disabled></div>
        <div class="field"><label>Contact</label><input value="${esc(r.phone)}" disabled></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Service Zone</label><input value="${esc(r.zone)}" disabled></div>
        <div class="field"><label>Zone Distance</label><input value="${r.zoneDistanceKm} km" disabled></div>
      </div>
      <div class="field"><label>Deliveries completed</label><input value="${r.deliveries}" disabled></div>`,
      `<button class="btn" data-close-modal>Close</button>`);
  },

  "fleet-zone-filter": (el)=>{ vs("fleet",{zoneFilter:"all"}).zoneFilter = el.value; render(); },
  "fleet-refresh": ()=>{ loadRidersFromDB().then(render); toast("Fleet map refreshed"); },
  "analytics-refresh": ()=>{ STATE.lastAnalyticsRefresh = "just now"; render(); toast("Delivery analytics refreshed"); },

  "health-check": async ()=>{ await computeSystemHealthLive(); render(); toast("Diagnostic complete"); },

  "ledger-export": ()=>{ toast("Ledger export queued — you'll get a download link shortly"); },

  "emg-toggle": async (el)=>{ const key=el.dataset.key; STATE.emergency[key]=!STATE.emergency[key];
    toast(`${key.replace(/([A-Z])/g," $1").replace(/^./,c=>c.toUpperCase())} ${STATE.emergency[key]?"activated":"deactivated"}`, STATE.emergency[key]?"danger":"default");
    await logAdminAction(`${STATE.emergency[key]?"Enabled":"Disabled"} ${key}`); render();
  },
  "emg-select": async (el)=>{ STATE.emergency[el.dataset.key]=el.value;
    toast(el.value ? `Suspended: ${el.value}` : "Cleared", el.value?"danger":"default");
    await logAdminAction(`Set ${el.dataset.key} = ${el.value||"none"}`); render();
  },

  "ticket-reply": (el)=>{ const t=DATA.tickets.find(x=>String(x.id)===el.dataset.id);
    openModal(`Reply — ${t.subject}`, `<div class="field"><div class="hint">${esc(t.name)} · ${esc(t.subject)}</div></div><div class="field"><label>Reply</label><textarea id="tReply" placeholder="Type your reply..."></textarea></div>`,
      `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-act="ticket-close" data-id="${t.id}">Send & close</button>`);
  },
  "ticket-close": async (el)=>{ const t=DATA.tickets.find(x=>String(x.id)===el.dataset.id); if(!t) return;
    const { error } = await supabase.from(t._table).update({ status:'closed' }).eq('id', t.id);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    t.status="closed"; closeModal(); render(); toast("Ticket closed");
  },

  "review-hide": async (el)=>{ const r=DATA.reviews.find(x=>String(x.id)===el.dataset.id); if(!r) return;
    const { error } = await supabase.from(r._table).delete().eq('id', r.id);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    DATA.reviews = DATA.reviews.filter(x=>x!==r); render(); toast("Review hidden","danger");
  },

  "ntf-send": async ()=>{ const title=$("#ntfTitle").value.trim(); if(!title){ toast("Title is required","danger"); return; }
    const audience = $("#ntfAudience").value;
    const { error } = await supabase.from('admin_notification_broadcasts').insert({ audience, title });
    if(error){ toast("Failed to send: "+error.message,"danger"); return; }
    await loadNotificationBroadcastsFromDB(); await logAdminAction(`Sent notification "${title}" to ${audience}`);
    $("#ntfTitle").value=""; $("#ntfBody").value=""; render(); toast("Notification sent");
  },

  "admin-add": ()=> openModal("Invite admin", `
      <div class="field"><label>Name</label><input id="aName"></div>
      <div class="field"><label>Email</label><input id="aEmail"></div>
      <div class="field"><label>Role</label><select id="aRole"><option>Operations Admin</option><option>Finance Admin</option><option>Support Admin</option><option>Read-only Admin</option></select></div>`,
      `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-act="admin-save">Send invite</button>`),
  "admin-save": async ()=>{ const name=$("#aName").value.trim(); if(!name){ toast("Name required","danger"); return; }
    const email = $("#aEmail").value.trim();
    if(!email){ toast("Email required","danger"); return; }
    const { error } = await supabase.from('admins').insert({ name, role:$("#aRole").value, email });
    if(error){ toast("Failed to add admin: "+error.message,"danger"); return; }
    await loadAdminsFromDB(); await logAdminAction(`Added admin ${name} (${email})`);
    closeModal(); render(); toast("Admin added");
  },

  "settings-save": ()=>{
    const s=STATE.settings;
    s.platformName=$("#setName").value; s.commission=+$("#setCommission").value; s.codFee=+$("#setCod").value;
    s.processingFee=+$("#setProcessing").value; s.tax=+$("#setTax").value;
    s.cancellationPolicy=$("#setCancel").value; s.refundPolicy=$("#setRefund").value;
    toast("Settings saved");
  },
};

function setStatus(arr,id,status){ const item=arr.find(x=>x.id===id); if(item) item.status=status; render(); }
function promptAdd(title, label, onSave){
  openModal(title, `<div class="field"><label>${esc(label)}</label><input id="promptVal"></div>`,
    `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="promptSaveBtn">Save</button>`);
  $("#promptSaveBtn").addEventListener("click", ()=>{ const v=$("#promptVal").value.trim(); if(!v){ toast("This field is required","danger"); return; } closeModal(); onSave(v); });
}

/* ---------------------------------------------------------
   7. RENDER / ROUTER
   --------------------------------------------------------- */
function renderSidebar(){
  const html = NAV.map(g=>`
    <div class="nav-group">
      ${g.group ? `<div class="nav-group-title">${esc(g.group)}</div>` : ""}
      ${g.items.map(item=>`
        <div class="nav-item ${STATE.view===item.id?"active":""}" data-nav="${item.id}">
          <span class="ic">${item.icon}</span><span class="lbl">${esc(item.label)}</span>
          ${item.count && item.count()>0 ? `<span class="count">${item.count()}</span>` : ""}
        </div>
        ${item.children && STATE.view===item.id ? `<div class="nav-children">
          ${item.children.map(c=>`<div class="nav-child ${vs(item.id,{tab:item.children[0].key}).tab===c.key?"active":""}" data-nav-child="${item.id}" data-key="${c.key}">${esc(c.label)}</div>`).join("")}
        </div>` : ""}
      `).join("")}
    </div>`).join("");
  $("#sidebarScroll").innerHTML = html;
}
function renderBottomNav(){
  $("#bottomNav").innerHTML = BOTTOM_NAV.map(id=>{
    const item = navItem(id);
    return `<div class="bn-item ${STATE.view===id?"active":""}" data-nav="${id}"><span class="ic">${item.icon}</span>${item.label}</div>`;
  }).join("") + `<div class="bn-item" data-open-drawer><span class="ic">☰</span>More</div>`;
}
let _fleetMapInstance = null;
let _ridersMiniMapInstance = null;
const FLEET_MAP_COLOR = {"active-order":"#e02020", idle:"#d4a017", "zone-suspended":"#c0392b", offline:"#2563eb"};

function renderRidersLiveMiniMap(){
  const el = document.getElementById("ridersLiveMiniMap");
  if(!el || typeof L === "undefined") return;
  const rows = DATA.riders.filter(r=>r.online && r._hasLocation);
  _ridersMiniMapInstance = L.map(el, { attributionControl:false }).setView([22.9734,78.6569], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18}).addTo(_ridersMiniMapInstance);
  const pts = [];
  rows.forEach(r=>{
    L.circleMarker([r.lat, r.lon], {radius:7, color:"#e02020", fillColor:"#e02020", fillOpacity:0.85, weight:2})
      .addTo(_ridersMiniMapInstance)
      .bindPopup(`<b>${esc(r.name)}</b><br>${esc(r.vehicle)} · ${esc(r.phone)}`);
    pts.push([r.lat, r.lon]);
  });
  if(pts.length > 1) _ridersMiniMapInstance.fitBounds(pts, {padding:[24,24]});
  else if(pts.length === 1) _ridersMiniMapInstance.setView(pts[0], 13);
}

function renderFleetLeafletMap(){
  const el = document.getElementById("fleetLeafletMap");
  if(!el || typeof L === "undefined") return;
  const state = vs("fleet",{zoneFilter:"all"});
  let visible = DATA.riders.filter(r=>r.online || fleetStatusOf(r)==="zone-suspended");
  if(state.zoneFilter==="approved") visible = visible.filter(r=>(DATA.zones.find(z=>z.name===r.zone)||{}).status==="active");
  if(state.zoneFilter==="suspended") visible = visible.filter(r=>(DATA.zones.find(z=>z.name===r.zone)||{}).status!=="active");
  visible = visible.filter(r=>r._hasLocation);
  _fleetMapInstance = L.map(el, { attributionControl:false }).setView([22.9734,78.6569], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18}).addTo(_fleetMapInstance);
  const pts = [];
  visible.forEach(r=>{
    const s = fleetStatusOf(r);
    const color = FLEET_MAP_COLOR[s] || "#666";
    L.circleMarker([r.lat, r.lon], {radius:8, color, fillColor:color, fillOpacity:0.85, weight:2})
      .addTo(_fleetMapInstance)
      .bindPopup(`<b>${esc(r.id)} · ${esc(r.name)}</b><br>${esc(FLEET_LABEL[s]||s)} · ${esc(r.zone)}`)
      .on("click", ()=> Actions["fleet-focus"]({dataset:{id:String(r.id)}}));
    pts.push([r.lat, r.lon]);
  });
  if(pts.length > 1) _fleetMapInstance.fitBounds(pts, {padding:[30,30]});
  else if(pts.length === 1) _fleetMapInstance.setView(pts[0], 13);
}

function render(){
  const item = navItem(STATE.view);
  $("#topbarTitle").textContent = item ? item.label : "Dashboard";
  $("#content").innerHTML = (VIEWS[STATE.view] || VIEWS.dashboard)();
  renderSidebar();
  renderBottomNav();
  if(STATE.view === "riders" && vs("riders",{tab:"all"}).tab === "live") renderRidersLiveMiniMap();
  if(STATE.view === "fleet") renderFleetLeafletMap();
}

function setView(id, childKey){
  STATE.view = id;
  const item = navItem(id);
  if(item && item.children){ vs(id, {tab:item.children[0].key}).tab = childKey || vs(id,{}).tab || item.children[0].key; }
  STATE.drawerOpen = false;
  $("#sidebar").classList.remove("open");
  $("#drawerOverlay").classList.remove("open");
  render();
  $("#content").scrollTop = 0;
}

/* ---------------------------------------------------------
   8. EVENT WIRING (delegation)
   --------------------------------------------------------- */
document.addEventListener("click", (e)=>{
  const navEl = e.target.closest("[data-nav]");
  if(navEl){ setView(navEl.dataset.nav); return; }

  const childEl = e.target.closest("[data-nav-child]");
  if(childEl){
    const id = childEl.dataset.navChild, key = childEl.dataset.key;
    vs(id, {}).tab = key;
    // also sync equivalent view-level tab state used inside the view's own toolbarTabs
    render(); return;
  }

  const tabEl = e.target.closest("[data-tab]");
  if(tabEl){ vs(tabEl.dataset.tab, {}).tab = tabEl.dataset.key; render(); return; }

  const sortEl = e.target.closest("[data-sort-th]");
  if(sortEl){
    const viewId = sortEl.dataset.sortTh, key = sortEl.dataset.key;
    const st = vs(viewId, {sortKey:null, sortDir:"asc"});
    st.sortDir = (st.sortKey===key && st.sortDir==="asc") ? "desc" : "asc";
    st.sortKey = key;
    render(); return;
  }

  const closeEl = e.target.closest("[data-close-modal]");
  if(closeEl || e.target.id==="modalOverlay"){ closeModal(); return; }

  const actEl = e.target.closest("[data-act]");
  if(actEl && Actions[actEl.dataset.act]){ Actions[actEl.dataset.act](actEl); return; }

  if(e.target.closest("[data-act='product-visible']")) return; // handled by change listener

  if(e.target.id==="hamburgerBtn"){ $("#sidebar").classList.add("open"); $("#drawerOverlay").classList.add("open"); return; }
  if(e.target.closest("[data-open-drawer]")){ $("#sidebar").classList.add("open"); $("#drawerOverlay").classList.add("open"); return; }
  if(e.target.id==="drawerOverlay"){ $("#sidebar").classList.remove("open"); $("#drawerOverlay").classList.remove("open"); return; }
  if(e.target.id==="collapseBtn"){ STATE.sidebarCollapsed=!STATE.sidebarCollapsed; $("#appShell").classList.toggle("collapsed", STATE.sidebarCollapsed); return; }
});

document.addEventListener("change", (e)=>{
  const t = e.target;
  if(t.matches("[data-act='product-visible']")){ Actions["product-visible"](t); return; }
  if(t.matches("[data-act='zone-toggle']")){ Actions["zone-toggle"](t); return; }
  if(t.matches("[data-act='emg-toggle']")){ Actions["emg-toggle"](t); return; }
  if(t.matches("[data-act='emg-select']")){ Actions["emg-select"](t); return; }
  if(t.matches("[data-act='fleet-zone-filter']")){ Actions["fleet-zone-filter"](t); return; }
});

document.addEventListener("input", (e)=>{
  const t = e.target;
  if(t.matches("[data-live-search]")){
    const viewId = t.dataset.liveSearch;
    vs(viewId, {search:""}).search = t.value;
    const wrap = document.getElementById("tablewrap-"+viewId);
    // Re-render only the current view body to keep focus on inputs elsewhere is not critical here since
    // search input itself would lose focus on full re-render; so re-render whole view but restore focus.
    const caret = t.selectionStart;
    render();
    const again = document.querySelector(`[data-live-search="${viewId}"]`);
    if(again){ again.focus(); again.setSelectionRange(caret, caret); }
  }
});

document.addEventListener("keydown", (e)=>{
  if(e.key==="Escape") closeModal();
});

/* ---------------------------------------------------------
   8b. GLOBAL SEARCH
   --------------------------------------------------------- */
function globalSearchResults(q){
  q = q.trim().toLowerCase();
  if(!q) return [];
  const out = [];
  DATA.orders.filter(o=>(o.id+o.customer+o.merchant).toLowerCase().includes(q)).slice(0,4)
    .forEach(o=>out.push({group:"Orders", nav:"orders", ic:"▤", title:o.id, sub:`${o.customer} · ${o.merchant}`}));
  DATA.users.filter(u=>(u.id+u.name+u.phone).toLowerCase().includes(q)).slice(0,4)
    .forEach(u=>out.push({group:"Users", nav:"users", ic:"◍", title:u.name, sub:`${u.id} · ${u.phone}`}));
  DATA.merchants.filter(m=>(m.id+m.name+m.owner).toLowerCase().includes(q)).slice(0,4)
    .forEach(m=>out.push({group:"Merchants", nav:"merchants", ic:"⌂", title:m.name, sub:`${m.id} · ${m.owner}`}));
  DATA.riders.filter(r=>(r.id+r.name+r.phone).toLowerCase().includes(q)).slice(0,4)
    .forEach(r=>out.push({group:"Riders", nav:"riders", ic:"➔", title:r.name, sub:`${r.id} · ${r.zone}`}));
  DATA.products.filter(p=>(p.id+p.name+p.brand).toLowerCase().includes(q)).slice(0,4)
    .forEach(p=>out.push({group:"Medicines", nav:"products", ic:"⬡", title:p.name, sub:`${p.id} · ${p.merchant}`}));
  return out;
}
function renderGlobalSearch(q){
  const box = $("#globalSearchResults");
  if(!box) return;
  const results = globalSearchResults(q);
  if(!q.trim()){ box.classList.remove("open"); box.innerHTML=""; return; }
  if(!results.length){ box.innerHTML = `<div class="gsr-empty">No matches for "${esc(q)}"</div>`; box.classList.add("open"); return; }
  let lastGroup = null, html = "";
  results.forEach(r=>{
    if(r.group!==lastGroup){ html += `<div class="gsr-group-label">${esc(r.group)}</div>`; lastGroup = r.group; }
    html += `<div class="gsr-item" data-search-nav="${r.nav}"><div class="gsr-ic">${r.ic}</div><div class="gsr-main"><div class="gsr-title">${esc(r.title)}</div><div class="gsr-sub">${esc(r.sub)}</div></div></div>`;
  });
  box.innerHTML = html;
  box.classList.add("open");
}
document.addEventListener("input", (e)=>{ if(e.target.id==="globalSearch") renderGlobalSearch(e.target.value); });
document.addEventListener("click", (e)=>{
  const gsItem = e.target.closest("[data-search-nav]");
  if(gsItem){ setView(gsItem.dataset.searchNav); $("#globalSearch").value=""; $("#globalSearchResults").classList.remove("open"); return; }
  if(!e.target.closest("#globalSearchWrap")){ const box=$("#globalSearchResults"); if(box) box.classList.remove("open"); }
});

/* ---------------------------------------------------------
   9. INIT
   --------------------------------------------------------- */
async function init(){
  render(); // paint the static-mock dashboard immediately so the UI isn't blank while auth/data load
  if(!supabase){ return; } // supabase-js/constants not loaded on this page — stays fully mock
  const { data:{ session } } = await supabase.auth.getSession();
  if(session){
    // Home page-er 3-step admin login-er por session ekhane already ache — abar login chaibe na.
    const { data: isAdmin, error: rpcError } = await supabase.rpc('is_admin');
    if(!rpcError && isAdmin === true){
      localStorage.removeItem('admin_auth_in_progress');
      bootAdminDashboard();
      return;
    }
    if(rpcError){
      // Network/transient error: session sign-out korbo na, shudhu retry message dekhabo
      showAdminLoginGate("Could not verify admin access. Check your connection and retry.");
      return;
    }
    await supabase.auth.signOut();
    showAdminLoginGate("This account is not an admin account.");
    return;
  }
  showAdminLoginGate();
}
init();
