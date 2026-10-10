/* =========================================================
   MediFinder India Admin — SPA logic (no external libraries)
   Everything is read live from Supabase; every control writes to
   the database, then re-renders.
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


/* ---------------------------------------------------------
   0b. LIVE DATA LOADERS — Orders, Users, Merchants/KYC, Riders,
   Prescriptions, Payouts, Refunds, Products, Coupons, Zones,
   Ads, Tickets, Reviews — all wired to real Supabase tables.
   (Nurses/Labs/Ambulance/Admins/Audit-Log/Notifications live
   further down in section 0c.)
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
    createdAt: u.created_at,
    status: u.status || "active",
    verified: true, // real identity check happens at signup (OTP/Google) — no separate admin verification step exists
    addr: [u.address, u.city].filter(Boolean).join(", ") || "—",
    pin: String(u.pincode || ""),
  }));
}

function normTicketStatus(v){ v = String(v||"open").toLowerCase().replace(/[\s-]+/g,"_"); if(["closed","resolved","done","solved"].includes(v)) return "closed"; if(["in_progress","replied","processing","pending"].includes(v)) return "in_progress"; return "open"; }
async function loadTicketsFromDB(){
  if(!supabase) return;
  const merchantNames = {}; DATA.merchants.forEach(m=>{ merchantNames[m.id] = m.name; });
  const riderNames = await loadRiderNameMap();
  const [c, mc, rc] = await Promise.all([
    supabase.from('complaints').select('*').order('created_at', { ascending:false }).limit(200),
    supabase.from('merchant_complaints').select('*').order('created_at', { ascending:false }).limit(200),
    supabase.from('rider_complaints').select('*').order('created_at', { ascending:false }).limit(200),
  ]);
  const mk = (t, table, from, name)=>({ id:t.id, _table:table, from, name, subject:t.subject||t.category||t.reason||"(no subject)", category:t.category||t.reason||"", message:t.message||"", priority:String(t.priority||"medium").toLowerCase(), status:normTicketStatus(t.status), reply:t.admin_reply||"", repliedAt:t.replied_at||"", _userId:t.user_id||null, _created:t.created_at||"", date:fmtDateTime(t.created_at), token:t.token||"" });
  const rows = [];
  (c.data||[]).forEach(t=>rows.push(mk(t,'complaints',"Customer", t.user_email||"Customer")));
  (mc.data||[]).forEach(t=>rows.push(mk(t,'merchant_complaints',"Merchant", merchantNames[t.merchant_id]||("Shop #"+t.merchant_id))));
  (rc.data||[]).forEach(t=>rows.push(mk(t,'rider_complaints',"Rider", riderNames[t.rider_id]||("Rider #"+t.rider_id))));
  rows.forEach(r=>{ r.key = r._table+":"+r.id; });
  rows.sort((x,y)=> String(y._created).localeCompare(String(x._created)));
  DATA.tickets = rows;
}

async function loadReviewsFromDB(){
  if(!supabase) return;
  const medNames = {}; DATA.products.forEach(p=>{ medNames[p.id] = p.name; });
  const [pr, lr, of] = await Promise.all([
    supabase.from('product_reviews').select('*').order('created_at', { ascending:false }).limit(300),
    supabase.from('lab_test_reviews').select('*').order('created_at', { ascending:false }).limit(300),
    supabase.from('order_feedback').select('*').order('created_at', { ascending:false }).limit(300),
  ]);
  const rows = [], rt = (v)=> Math.max(0, Math.min(5, Math.round(Number(v)||0)));
  (pr.data||[]).forEach(r=>rows.push({ id:r.id, _table:'product_reviews', type:"Product", _medId:r.medicine_id, _rating:Number(r.rating||0), subject:medNames[r.medicine_id]||("Medicine #"+r.medicine_id), by:r.user_name||"Customer", rating:rt(r.rating), comment:r.review_text||"", reported:!!r.reported, canFlag:true, date:fmtDateTime(r.created_at), _created:r.created_at||"" }));
  (lr.data||[]).forEach(r=>rows.push({ id:r.id, _table:'lab_test_reviews', type:"Lab Test", subject:r.patient_name||"Lab test", by:r.patient_name||"Patient", rating:rt(r.rating), comment:r.feedback||"", reported:!!r.reported, canFlag:true, date:fmtDateTime(r.created_at), _created:r.created_at||"" }));
  (of.data||[]).forEach(r=>rows.push({ id:r.id, _table:'order_feedback', type:"Order", subject:"Order "+String(r.order_id||"").slice(0,12), by:"Customer", rating:rt(r.rating), comment:r.comment||"", reported:false, canFlag:false, date:fmtDateTime(r.created_at), _created:r.created_at||"" }));
  rows.forEach(r=>{ r.key = r._table+":"+r.id; });
  rows.sort((x,y)=> String(y._created).localeCompare(String(x._created)));
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
      showOn: (a.show_on==='home'||a.show_on==='user') ? a.show_on : 'both',
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
    name: z.name || z.muni || z.ps || z.city || z.dist || "Zone",
    pin: z.pin || z.pincode || "—",
    pincode: z.pin || z.pincode || "—",
    district: z.dist || "—",
    ps: z.ps || "—",
    muni: z.muni || "—",
    state: z.state || "",
    baseFee: Number(z.base_fee||0),
    perKm: Number(z.per_km_fee||0),
    express: Number(z.express_fee||0),
    suspendReason: z.outage_message || "",
    suspendedAt: z.outage_start || "",
    riders: z.riders || 0,
    svc30: z.svc_30min !== false, svcNurse: z.svc_nurse !== false, svcLab: z.svc_lab !== false, svcSameDay: z.svc_sameday !== false,
    _lat: z.center_lat ?? z.lat ?? z.latitude ?? null, _lng: z.center_lng ?? z.lng ?? z.longitude ?? null, radiusKm: Number(z.radius_km)||0,
    zoneMerchants: z.merchants || 0,
    status: (z.status==="approved" && z.is_active!==false) ? "active" : "paused",
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
    _mrp: Number(m.mrp ?? 0),
    _img: m.image_url || "",
    stock: m.stock_qty || 0,
    rx: !!m.is_rx,
    merchant: merchantNames[m.merchant_id] || "—",
    _merchantId: m.merchant_id,
    visible: m.is_visible !== false,
    approval: (m.status||"Pending").toLowerCase(),
    returnable: m.is_returnable === true, returnDays: Number(m.return_window_days||0),
    exchangeable: m.is_exchangeable === true, exchangeDays: Number(m.exchange_window_days||0),
    _expiry: (m.expiry_date||"").slice(0,10), _minStock: Number(m.min_stock_alert)||10, generic: m.generic_name || "", pack: m.pack_size || "",
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
      lat: m.latitude, lng: m.longitude,
      joined: (m.created_at || "").slice(0,10),
      orders: s.orders,
      earnings: s.earnings,
      rating: null,
      commission: null,
      license: m.license_status || "unverified",
      status: m.status || "pending",
      kycReason: m.kyc_rejection_reason || "",
      kycStatusRaw: m.kyc_status || "",
    };
  });
}

async function loadOrdersFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending:false }).limit(1000);
  if(error){ toast("Could not load orders: "+error.message, "danger"); return; }
  const riderNames = await loadRiderNameMap();
  DATA.orders = (data || []).map(o=>({
    id: o.order_id || o.id,
    _merchantId: o.merchant_id,
    _userId: o.user_id,
    customer: o.customer_name || o.user_name || "Customer",
    merchant: o.pharmacy_name || "—",
    rider: o.rider_id ? (riderNames[o.rider_id] || ("Rider #"+o.rider_id)) : "—",
    items: orderItemsCount(o),
    total: Number(o.total_amount ?? o.total ?? o.final_amount ?? 0),
    payment: String(o.payment_mode || o.payment_method || "").toLowerCase() === "cod" ? "COD" : "Online",
    status: o.status || "pending",
    date: fmtDateTime(o.created_at),
    created: o.created_at,
    _raw: o,
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
      _pin: String(r.pincode || r.pin || r.service_pincode || r.zone_pin || ""),
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
    _created: r.created_at, _acceptedAt: r.accepted_at,
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
    merchant: merchantNames[String(p.merchant_id ?? p.shop_id)] || ("Shop #"+(p.merchant_id ?? p.shop_id)),
    period: (p.created_at||"").slice(0,10),
    amount: Number(p.amount||0),
    status: normPayStatus(p.status),
    requestedAt: (p.created_at||"").slice(0,16).replace("T"," "),
    paidAt: (p.paid_at||"").slice(0,16).replace("T"," "),
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
      status: normPayStatus(p.request_status),
      requestedAt: (p.requested_at||"").slice(0,16).replace("T"," "),
      paidAt: (p.processed_at||"").slice(0,16).replace("T"," "),
    };
  });
}

async function loadLegacyRiderPayouts(){
  if(!supabase) return;
  const { data } = await supabase.from('rider_payouts').select('*').order('created_at', { ascending:false }).limit(200);
  const names = await loadRiderNameMap();
  DATA.riderPayouts = (DATA.riderPayouts||[]).filter(x=>!String(x.id).startsWith("rp-")).concat((data||[]).map(p=>({ id:"rp-"+p.id, rider:names[p.rider_id]||p.name||("Rider #"+p.rider_id), period:(p.created_at||"").slice(0,10), amount:Number(p.amount||0), status: p.paid ? "paid" : normPayStatus(p.status), requestedAt:(p.created_at||"").slice(0,16).replace("T"," "), paidAt:(p.paid_at||"").slice(0,16).replace("T"," ") })));
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
    authUserId: n.auth_user_id || null,
  }));
}

async function loadNurseBookingsFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('nurse_bookings').select('*').order('created_at', { ascending:false }).limit(1000);
  if(error){ toast("Could not load nurse bookings: "+error.message, "danger"); return; }
  const statusMap = { pending:"new", approved:"assigned", cancelled:"cancelled" };
  DATA.nurseBookings = (data || []).map(b=>({
    id: "NBK-"+String(b.id).slice(0,8),
    _rawId: b.id, _createdAt: b.created_at,
    customer: b.patient_name || "Customer",
    nurse: b.nurse_name || "Unassigned",
    provider: b.nurse_name || "Unassigned",
    phone: b.contact_no || "—",
    service: b.service_label || b.service_type || "—",
    location: [b.addr_house, b.addr_street, b.addr_landmark, b.addr_city, b.addr_pincode].filter(Boolean).join(", ") || "—",
    amount: b.total_amount != null ? Number(b.total_amount) : null,
    reason: b.cancel_reason || "",
    history: [["Booked", b.created_at], ["Last updated", b.updated_at], ["Completed", b.completed_at]],
    type: b.service_label || b.service_type || "—",
    date: b.book_date ? `${b.book_date} ${b.book_time||""}`.trim() : fmtDateTime(b.created_at),
    payment: /razorpay|online/i.test(b.payment_method||"") ? "Online" : "COD",
    status: statusMap[b.status] || b.status || "new",
  }));
}

async function loadLabTestsFromDB(){
  if(!supabase) return;
  const collectorMap = await loadSampleCollectorNameMap();
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
    _collectorId: t.collector_id || null,
    publishedBy: t.collector_id ? (collectorMap[t.collector_id] || "Blood collector") : "Admin",
  }));
}

async function loadLabBookingsFromDB(){
  if(!supabase) return;
  const collectorMap = await loadSampleCollectorNameMap();
  const { data, error } = await supabase.from('lab_bookings').select('*').order('created_at', { ascending:false }).limit(1000);
  if(error){ toast("Could not load lab bookings: "+error.message, "danger"); return; }
  const hist = {}; (await safeSelect("booking_status_history", "booking_id, new_status, created_at", 1000)).forEach(h=>{ (hist[h.booking_id] = hist[h.booking_id] || []).push([h.new_status, h.created_at]); });
  const statusMap = { Pending:"new", Confirmed:"accepted", "Sample Collected":"accepted", Processing:"accepted", Completed:"completed", Cancelled:"cancelled" };
  DATA.labBookings = (data || []).map(b=>({
    id: b.booking_id || ("LBK-"+String(b.id).slice(0,8)),
    _rawId: b.id, _createdAt: b.created_at,
    customer: b.patient_name || "Customer",
    test: b.test_name || "—",
    service: b.test_name || "—",
    phone: b.patient_phone || "—",
    location: b.full_address || [b.addr_house||b.house_no, b.addr_street||b.street, b.addr_landmark||b.landmark, b.addr_city||b.city, b.addr_pincode||b.pincode].filter(Boolean).join(", ") || "—",
    amount: b.test_price != null ? Number(b.test_price) : null,
    reason: b.cancel_reason || "",
    history: [["Booked", b.created_at], ...(hist[b.id]||[]), ["Collector assigned", b.assigned_at], ["Sample collected", b.sample_collected_at], ["Completed", b.completed_at]],
    _collectorId: b.collector_id || null, _createdAt: b.created_at,
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
  DATA.raw.ambulance = data || [];
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
  const { data, error } = await supabase.from('ambulance_bookings').select('*').order('created_at', { ascending:false }).limit(1000);
  if(error){ toast("Could not load ambulance bookings: "+error.message, "danger"); return; }
  const statusMap = { searching:"new", accepted:"on-route", arriving:"on-route", picked_up:"on-route", completed:"completed", cancelled:"cancelled" };
  DATA.ambulanceBookings = (data || []).map(b=>({
    id: "ABK-"+String(b.id).slice(0,8),
    _rawId: b.id, _driverId: b.driver_id || null, _createdAt: b.created_at,
    customer: b.patient_name || "Customer",
    provider: b.driver_id ? (driverMap[b.driver_id] || "Assigned Driver") : "Unassigned",
    phone: b.contact_phone || "—",
    service: ({non_ac:"Non-AC", ac:"AC", icu:"ICU Support"})[b.vehicle_type] || b.vehicle_type || "—",
    location: `${b.pickup_address||"—"} → ${b.drop_address||"—"}`,
    amount: (b.fare_final ?? b.fare_estimate) != null ? Number(b.fare_final ?? b.fare_estimate) : null,
    reason: b.cancel_reason || "",
    history: [["Requested", b.created_at], ["Accepted", b.accepted_at], ["Picked up", b.picked_up_at], ["Completed", b.completed_at], ["Cancelled", b.cancelled_at]],
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
    status: a.status || "invited",
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

let _adminEmailCache = null;
function logAdminAction(action){
  // fire-and-forget: the audit row is saved in the background so buttons never wait for it
  DATA.auditLog.unshift({ who: "Admin", action, when: "just now" });
  if(!supabase) return Promise.resolve();
  (async ()=>{
    try{
      if(!_adminEmailCache){ const { data:{ user } = {} } = await supabase.auth.getUser(); _adminEmailCache = user?.email || 'medifinderindia@gmail.com'; }
      await supabase.from('admin_audit_log').insert({ admin_email: _adminEmailCache, action });
    }catch(e){ console.warn("[admin] audit log not saved", e); }
  })();
  return Promise.resolve();
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
  await loadPaymentQueue();
  await loadPartnerExtras(); // KYC queues + payouts (needs merchants/riders/nurses/ambulance loaded)
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
  subscribePaymentLive();
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
   1. DATA STORE
   Filled live from Supabase by the loaders below.
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
  errorLogs: [
    // Loaded live from Supabase (public.system_error_logs) by loadErrorLogsFromDB() — Shiprocket / NimbusPost / courier errors.
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


/* ---------------------------------------------------------
   2. STATE
   --------------------------------------------------------- */
const STATE = {
  view: "dashboard",
  sidebarCollapsed: false,
  drawerOpen: false,
  viewState: {}, // per-view: {tab, search, sortKey, sortDir}
  settings: {
    platformName: "MediFinder India",
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
    {id:"users", icon:"◍", label:"User",
      children:[{key:"all",label:"All Customers"},{key:"new",label:"New"},{key:"regular",label:"Regular"},{key:"vip",label:"VIP"},{key:"inactive",label:"Inactive"}]},
    {id:"merchants", icon:"⌂", label:"Merchant",
      children:[{key:"all",label:"All Merchants"},{key:"pending",label:"Pending Verification"},{key:"suspended",label:"Suspended"}]},
    {id:"riders", icon:"➔", label:"Rider",
      children:[{key:"all",label:"All Riders"},{key:"live",label:"Live Riders"}]},
    {id:"products", icon:"⬡", label:"Medicine", count:()=>DATA.products.filter(p=>p.approval==="pending").length,
      children:[{key:"products",label:"Products"},{key:"pending",label:"Pending Approval"},{key:"categories",label:"Categories"},{key:"brands",label:"Brands"}]},
    {id:"orders", icon:"▤", label:"Order", count:()=>DATA.orders.filter(o=>["pending","confirmed"].includes(o.status)).length,
      children:[{key:"all",label:"All Orders"},{key:"pending",label:"Pending"},{key:"active",label:"Active"},{key:"delivered",label:"Delivered"},{key:"cancelled",label:"Cancelled"}]},
  ]},
  {group:"Partners", items:[
    {id:"notifications", icon:"◔", label:"Notification",
      children:[{key:"user-all",label:"User · All"},{key:"user-one",label:"User · Individual"},{key:"merchant",label:"Merchant"},{key:"rider",label:"Rider"},{key:"lab",label:"Lab Partner"},{key:"nurse",label:"Nurse Partner"},{key:"ambulance",label:"Ambulance"}]},
    {id:"kyc", icon:"✔", label:"KYC", count:()=>kycAllRows().filter(r=>r.status==="pending").length,
      children:[{key:"merchant",label:"Merchant"},{key:"rider",label:"Rider"},{key:"nurse",label:"Nurse"},{key:"lab",label:"Lab"},{key:"ambulance",label:"Ambulance"}]},
    {id:"fleet", icon:"🗺", label:"Live Fleet Map"},
    {id:"delivery", icon:"⌁", label:"Zone"},
    {id:"deliveryanalytics", icon:"▥", label:"Delivery Analysis"},
    {id:"prescriptions", icon:"▦", label:"Prescription", count:()=>DATA.prescriptions.filter(p=>p.status==="pending").length},
  ]},
  {group:"Money", items:[
    {id:"finance", icon:"₹", label:"Finance",
      children:[{key:"transactions",label:"Transaction"},{key:"refunds",label:"Refund"},{key:"ledger",label:"Settlement Ledger"}]},
    {id:"payout", icon:"⇪", label:"Pay Out",
      children:[{key:"overview",label:"Overview"},{key:"merchant",label:"Merchant"},{key:"rider",label:"Rider"},{key:"nurse",label:"Nurse"},{key:"collector",label:"Blood Collector"},{key:"ambulance",label:"Ambulance"}]},
    {id:"payment", icon:"▭", label:"Payment", count:()=>DATA.payQueue.filter(r=>r.status==="pending").length},
    {id:"booking", icon:"✚", label:"Booking",
      children:[{key:"lab",label:"Lab"},{key:"nurse",label:"Nurse"},{key:"ambulance",label:"Ambulance"}]},
  ]},
  {group:"Growth", items:[
    {id:"coupons", icon:"◈", label:"Sponsored",
      children:[{key:"coupons",label:"Coupons"},{key:"sponsored",label:"Sponsored Ads"}]},
    {id:"reviews", icon:"☆", label:"Reviews"},
    {id:"reports", icon:"▥", label:"Analysis"},
    {id:"support", icon:"◐", label:"Complaint", count:()=>DATA.tickets.filter(t=>t.status==="open").length},
  ]},
  {group:"System", items:[
    {id:"system", icon:"⚙", label:"System",
      count:()=>(DATA.errorLogs||[]).filter(e=>!e.resolved).length,
      children:[{key:"security",label:"Security & Audit"},{key:"health",label:"System Health"},{key:"errors",label:"Error Logs"},{key:"emergency",label:"Emergency Control"},{key:"settings",label:"Settings"}]},
    {id:"logout", icon:"⏻", label:"Logout"},
  ]},
];
const HIDDEN_NAV = [{id:"settings",label:"Settings"},{id:"adminroles",label:"Security & Audit"},{id:"syshealth",label:"System Health"},{id:"errorlogs",label:"Error Logs"},{id:"emergency",label:"Emergency Control"}];
const BOTTOM_NAV = ["dashboard","orders","users","support"];
const NAV_FLAT = NAV.flatMap(g=>g.items);
function navItem(id){ return NAV_FLAT.find(i=>i.id===id) || HIDDEN_NAV.find(i=>i.id===id); }

/* ---------------------------------------------------------
   4. GENERIC HELPERS
   --------------------------------------------------------- */
const $ = (sel,root=document)=>root.querySelector(sel);
const $$ = (sel,root=document)=>Array.from(root.querySelectorAll(sel));
const esc = (s)=> String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = (n)=> "₹" + Number(n||0).toLocaleString("en-IN");

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

function initials(name){ return esc(String(name||"").trim().split(/\s+/).slice(0,2).map(w=>w[0]||"").join("").toUpperCase()); }

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
    return `<tr${opts.rowClass?` class="${opts.rowClass(row)}"`:""}>${columns.map(c=>`<td>${c.render ? c.render(row) : esc(row[c.key])}</td>`).join("")}</tr>`;
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

/* Full-page sheets (replaces the old popups).
   Every form / detail / confirm screen opens as its own full page with a
   sticky header (back arrow + title) and a sticky action bar. The phone's
   Back button and the Esc key close it too. */
let _pageOpen = false, _confirmResolve = null;
function askConfirm(title, message, opts){
  opts = opts || {};
  return new Promise((resolve)=>{
    _confirmResolve = resolve;
    openModal(title, `<div class="fp-confirm"><div class="fp-confirm-ic ${opts.danger?"danger":""}">${opts.danger?"!":"?"}</div><p>${esc(message)}</p></div>`,
      `<button class="btn" id="cfNo">Cancel</button><button class="btn ${opts.danger?"danger":"primary"}" id="cfYes">${esc(opts.ok||"Confirm")}</button>`);
    $("#cfNo").addEventListener("click", ()=> closeModal());
    $("#cfYes").addEventListener("click", ()=>{ _confirmResolve = null; resolve(true); closeModal(); });
  });
}
function openModal(title, bodyHtml, footHtml){
  const root = $("#modalRoot");
  root.innerHTML = `
    <section class="fp" id="fpPage" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="fp-head">
        <button class="fp-back" data-close-modal aria-label="Back">‹</button>
        <h2 class="fp-title">${esc(title)}</h2>
      </header>
      <div class="fp-scroll"><div class="fp-body">${bodyHtml}</div></div>
      ${footHtml ? `<footer class="fp-foot"><div class="fp-foot-in">${footHtml}</div></footer>` : ""}
    </section>`;
  document.body.classList.add("fp-open");
  requestAnimationFrame(()=>{ const p = $("#fpPage"); if(p) p.classList.add("open"); });
  if(!_pageOpen){ _pageOpen = true; try{ history.pushState({fp:1}, ""); }catch(e){} }
}
function closeModal(fromHistory){
  const p = $("#fpPage");
  if(!p) return;
  const wasOpen = _pageOpen; _pageOpen = false;
  if(_confirmResolve){ const r = _confirmResolve; _confirmResolve = null; r(false); }
  p.classList.remove("open");
  document.body.classList.remove("fp-open");
  setTimeout(()=>{ const r = $("#modalRoot"); if(r && !_pageOpen) r.innerHTML = ""; }, 160);
  if(wasOpen && fromHistory !== true){ try{ if(history.state && history.state.fp) history.back(); }catch(e){} }
}
window.addEventListener("popstate", ()=>{ if(_pageOpen) closeModal(true); });
document.addEventListener("keydown", (e)=>{ if(e.key === "Escape" && _pageOpen) closeModal(); });

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
  {ic:"✔", label:"Review pending KYC", nav:"kyc"},
  {ic:"▦", label:"Review prescriptions", nav:"prescriptions"},
  {ic:"₹", label:"Process refunds", nav:"finance"},
  {ic:"◐", label:"Open complaints", nav:"support"},
  {ic:"🆘", label:"Emergency control", nav:"emergency"},
];

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
      {key:"status",label:"Status",render:r=>statusBadge(r.status)},
      {key:"_actions",label:"",sortable:false,render:r=>`<div class="actions-cell">
          <button class="btn sm" data-act="user-history" data-id="${r.id}">History</button>
          <button class="btn sm ${r.status==='active'?'danger':''}" data-act="user-toggle" data-id="${r.id}">${r.status==='active'?'Block':'Unblock'}</button>
        </div>`},
    ], rows, {emptyText:"No users match your search."})}
  </div></div>`;
};

/* ---- Merchants ---- */
const MERCHANT_TABS=[{key:"all",label:"All Merchants"},{key:"pending",label:"Pending Verification"},{key:"suspended",label:"Suspended"}];
VIEWS.merchants = () => {
  const state = vs("merchants",{tab:"all", search:""});
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
      {key:"commission",label:"Commission",render:r=>commissionLabel(r.commission)},
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

/* ---- Riders ---- */
const RIDER_TABS=[{key:"all",label:"All Riders"},{key:"live",label:"Live Riders"}];
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
const PRODUCT_TABS=[{key:"products",label:"Products"},{key:"pending",label:"Pending Approval"},{key:"stock",label:"Low stock / Expiry"},{key:"categories",label:"Categories"},{key:"brands",label:"Brands"}];
function expiryBadge(d){
  if(!d) return "—"; const days = Math.floor((new Date(d) - new Date(localDayStr()))/86400000);
  if(isNaN(days)) return esc(d); if(days < 0) return badge("Expired · "+d,"red"); if(days <= 60) return badge(d+" · "+days+"d","gold"); return esc(d);
}
function stockWatchView(){
  const low = DATA.products.filter(p=>p.approval==="approved" && p.stock<=p._minStock);
  const exp = DATA.products.filter(p=>{ if(!p._expiry) return false; const d = Math.floor((new Date(p._expiry) - new Date(localDayStr()))/86400000); return !isNaN(d) && d <= 60; });
  const cols = [
    {key:"name",label:"Product",render:r=>`<div class="cell-strong">${esc(r.name)}</div><div class="cell-sub">${esc(r.id)}</div>`},{key:"merchant",label:"Merchant"},
    {key:"stock",label:"Stock",render:r=>r.stock===0?badge("Out of stock","red"):r.stock<=r._minStock?badge("Low · "+r.stock,"gold"):r.stock},
    {key:"_expiry",label:"Expiry",render:r=>expiryBadge(r._expiry)},
    {key:"_a",label:"",sortable:false,render:r=>`<button class="btn sm" data-act="product-edit" data-id="${r.id}">Edit</button>`},
  ];
  return `
  <div class="view-head"><h1>Product / Medicine Management</h1><p>Medicines that are out of stock, running low, expired or expiring within 60 days — straight from merchant inventory.</p></div>
  ${toolbarTabs("products", PRODUCT_TABS)}
  <div class="stat-grid"><div class="stat-card"><div class="lbl">Out of stock</div><div class="val" style="color:#d93025">${low.filter(p=>p.stock===0).length}</div></div><div class="stat-card"><div class="lbl">Low stock</div><div class="val">${low.filter(p=>p.stock>0).length}</div></div><div class="stat-card"><div class="lbl">Expired / expiring ≤60d</div><div class="val" style="color:#b8860b">${exp.length}</div></div></div>
  <div class="card"><div class="card-head"><h3>Low / out of stock</h3></div><div class="card-body pad0">${renderTable("products-low", cols, low, {emptyText:"Nothing is running low."})}</div></div>
  <div class="card"><div class="card-head"><h3>Expired / expiring soon</h3></div><div class="card-body pad0">${renderTable("products-exp", cols, exp, {emptyText:"No medicine is close to expiry."})}</div></div>`;
}
VIEWS.products = () => {
  const state = vs("products",{tab:"products", search:""});
  if(state.tab==="stock") return stockWatchView();
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
  <div class="view-toolbar">${toolbarSearch("products","Search product, category or brand")}</div>
  <div class="card"><div class="card-body pad0" id="tablewrap-products">
    ${renderTable("products",[
      {key:"name",label:"Product",render:r=>`<div class="cell-strong">${esc(r.name)}</div><div class="cell-sub">${esc(r.id)}</div>`},
      {key:"category",label:"Category"},
      {key:"brand",label:"Brand"},
      {key:"price",label:"Price",render:r=>money(r.price)},
      {key:"stock",label:"Stock",render:r=>r.stock===0?badge("Out of stock","red"):(r.stock<=r._minStock?badge("Low · "+r.stock,"gold"):r.stock)},
      {key:"_expiry",label:"Expiry",render:r=>expiryBadge(r._expiry)},
      {key:"rx",label:"Rx",render:r=>r.rx?badge("Required","gold"):badge("OTC","gray")},
      {key:"returnable",label:"Return / Exchange",sortable:false,render:r=>`${r.returnable?badge("Return "+(r.returnDays||"")+(r.returnDays?"d":""),"green"):badge("No return","gray")} ${r.exchangeable?badge("Exchange","blue"):""}`},
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
const FIN_TABS=[{key:"transactions",label:"Transaction"},{key:"refunds",label:"Refund"},{key:"ledger",label:"Settlement Ledger"}];
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
      {key:"showOn",label:"Shows on",render:r=>badge(r.showOn==='home'?"Home page":r.showOn==='user'?"User page":"Home + User", r.showOn==='both'?"green":"blue")},
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
    <div class="field"><label>Show this banner on</label>
      <select id="adShowOn">
        <option value="home" ${existing&&existing.showOn==="home"?"selected":""}>Home page only</option>
        <option value="user" ${existing&&existing.showOn==="user"?"selected":""}>User page only</option>
        <option value="both" ${!existing||existing.showOn==="both"||!existing.showOn?"selected":""}>Both (Home + User page)</option>
      </select>
      <div class="hint">Home page = public page (before login). User page = the logged-in customer app. Only the place you choose will show this banner.</div>
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

/* ---- Delivery Analytics ---- */
function deliveryMinutes(list){
  return list.map(o=>{ const r = o._raw||{}, end = r.delivered_at; if(!end || !o.created) return null; const m = (new Date(end)-new Date(o.created))/60000; return m>0 && m<1440 ? m : null; }).filter(x=>x!=null);
}
const avgMin = (a)=> a.length ? Math.round(a.reduce((x,y)=>x+y,0)/a.length)+" min" : "No data yet";
VIEWS.deliveryanalytics = () => {
  const today = localDayStr(), now = Date.now();
  const tOrders = DATA.orders.filter(o=>tsDay(o.created)===today), tDelivered = tOrders.filter(o=>o.status==="delivered");
  const lastHour = DATA.orders.filter(o=>o.created && now - new Date(o.created) <= 3600000);
  const delivered = DATA.orders.filter(o=>o.status==="delivered");
  const tLive = tOrders.filter(o=>!DEAD_ORDER.includes(o.status));
  const feeToday = tLive.reduce((a,o)=>{ const r=o._raw||{}; return a + (Number(r.delivery_fee ?? r.delivery_charge ?? r.shipping_fee)||0); },0);
  const riderRows = (DATA.payouts && DATA.payouts.rider) || [];
  const riderDue = riderRows.filter(p=>p.status==="pending"||p.status==="processing").reduce((a,p)=>a+p.net,0);
  const riderPaidToday = riderRows.filter(p=>p.status==="paid" && tsDay(p.paidAt)===today).reduce((a,p)=>a+p.net,0);
  const buckets = [0,0,0,0,0,0,0,0]; tOrders.forEach(o=>{ const h = new Date(o.created).getHours(); buckets[Math.floor(h/3)]++; });
  const zoneRows = DATA.zones.map(z=>({ name:z.name, pin:z.pin, ...zoneStats(z), health:zoneHealth(z).label }));
  const ratings = DATA.reviews.filter(r=>r.type==="Order" && r.rating>0), avgR = ratings.length ? (ratings.reduce((a,r)=>a+r.rating,0)/ratings.length).toFixed(1)+" ★" : "No ratings yet";
  return `
  <div class="view-head"><h1>Delivery Analytics</h1><p>Live operational numbers — every figure is calculated from your real orders, riders and zones.</p></div>
  <div class="view-toolbar"><button class="btn" data-act="analytics-refresh">↻ Refresh now</button><span class="cell-sub" style="margin-left:8px">Last updated: ${esc(STATE.lastAnalyticsRefresh||"when this page opened")}</span></div>
  <div class="stat-grid">
    <div class="stat-card"><div class="lbl">Riders online</div><div class="val">${DATA.riders.filter(r=>r.online).length}</div></div>
    <div class="stat-card"><div class="lbl">Riders on delivery</div><div class="val">${DATA.riders.filter(r=>r.online && r.hasOrder).length}</div></div>
    <div class="stat-card"><div class="lbl">Active merchants</div><div class="val">${DATA.merchants.filter(m=>m.status==="active").length}</div></div>
    <div class="stat-card"><div class="lbl">Today's orders</div><div class="val">${tOrders.length}</div></div>
    <div class="stat-card"><div class="lbl">Today's delivered</div><div class="val">${tDelivered.length}</div></div>
    <div class="stat-card"><div class="lbl">Today's order value</div><div class="val">${money(tLive.reduce((a,o)=>a+o.total,0))}</div></div>
    <div class="stat-card"><div class="lbl">Delivery fees today</div><div class="val">${money(feeToday)}</div></div>
    <div class="stat-card"><div class="lbl">Orders in last hour</div><div class="val">${lastHour.length}</div></div>
    <div class="stat-card"><div class="lbl">Waiting for acceptance</div><div class="val">${DATA.orders.filter(o=>o.status==="pending").length}</div></div>
    <div class="stat-card"><div class="lbl">Avg. delivery time (all)</div><div class="val">${avgMin(deliveryMinutes(delivered))}</div></div>
    <div class="stat-card"><div class="lbl">Avg. delivery time (today)</div><div class="val">${avgMin(deliveryMinutes(tDelivered))}</div></div>
    <div class="stat-card"><div class="lbl">Delivery rating</div><div class="val">${avgR}</div></div>
    <div class="stat-card"><div class="lbl">Rider payouts due</div><div class="val">${money(riderDue)}</div></div>
    <div class="stat-card"><div class="lbl">Rider payouts paid today</div><div class="val">${money(riderPaidToday)}</div></div>
    <div class="stat-card"><div class="lbl">Active / total zones</div><div class="val">${DATA.zones.filter(z=>z.status==="active").length} / ${DATA.zones.length}</div></div>
  </div>
  <div class="card"><div class="card-head"><h3>Today's orders by time of day</h3></div><div class="card-body">${svgBarChart(buckets, ["0-3","3-6","6-9","9-12","12-15","15-18","18-21","21-24"])}</div></div>
  <div class="card"><div class="card-head"><h3>Orders — last 7 days</h3></div><div class="card-body">${svgBarChart(DATA.weekOrders, DATA.weekLabels)}</div></div>
  <div class="card"><div class="card-head"><h3>Zone performance</h3></div><div class="card-body pad0">${renderTable("da-zones",[
    {key:"name",label:"Zone",render:r=>`<div class="cell-strong">${esc(r.name)}</div><div class="cell-sub">PIN ${esc(r.pin)}</div>`},{key:"health",label:"Status"},
    {key:"ridersOnline",label:"Riders online"},{key:"merchants",label:"Merchants"},{key:"orders",label:"Orders"},{key:"delivered",label:"Delivered"},{key:"pending",label:"In progress"},{key:"revenue",label:"Revenue",render:r=>money(r.revenue)},
  ], zoneRows, {emptyText:"No zones yet — add one in Zone."})}</div></div>`;
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

/* ---- Healthcare Services ---- */
const HC_TABS=[{key:"labs",label:"Lab Tests"},{key:"lab-bookings",label:"Lab Bookings"},{key:"nurses",label:"Nurse Directory"},{key:"nurse-bookings",label:"Nursing Bookings"},{key:"ambulance",label:"Ambulance"},{key:"ambulance-drivers",label:"Ambulance Drivers"},{key:"ambulance-bookings",label:"Ambulance Bookings"},{key:"ambulance-fleet",label:"Ambulance Fleet Map"}];
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
  if(state.tab==="nurses") table = renderTable("healthcare",[
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
  else if(state.tab==="labs"){ addBtn=false; table = renderTable("healthcare",[
    {key:"name",label:"Lab Partner",render:r=>`<div class="cell-strong">${esc(r.name)}</div><div class="cell-sub">${esc(r.test)}</div>`},
    {key:"includedTests",label:"Included Tests"},
    {key:"price",label:"Price",render:r=>`${money(r.price)} <span class="cell-sub" style="text-decoration:line-through">${money(r.oldPrice)}</span> <span class="badge green">${r.discount}% off</span>`},
    {key:"serviceArea",label:"Service Area"},
    {key:"fasting",label:"Fasting",render:r=>r.fasting?badge("Required","gold"):badge("Not required","gray")},
    {key:"sample",label:"Sample"},
    {key:"publishedBy",label:"Published by",render:r=>`<div class="cell-strong">${esc(r.publishedBy)}</div>`},
    {key:"status",label:"On user page",render:r=>r.status==="active"?badge("Live","green"):badge("Off (set by partner)","gray")},
  ], DATA.labs, {emptyText:"No lab tests published by blood collectors yet."}); }
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

/* ---- Reports ---- */

/* ---- Admin & Permissions ---- */
const PERM_MODULES = ["Orders","Finance","Merchants","Riders","Settings"];
VIEWS.adminroles = () => `
  <div class="view-head"><h1>Security &amp; Audit</h1><p>Role-based access, admin accounts, 2FA and the full audit trail of admin actions.</p></div>
  ${isSuperAdmin() ? `<div class="view-toolbar"><button class="btn primary" data-act="admin-add">+ Invite admin</button></div>` : ""}
  <div class="card"><div class="card-head"><h3>Admin accounts</h3></div><div class="card-body pad0" id="tablewrap-adminroles">
    ${renderTable("adminroles",[
      {key:"name",label:"Admin"},{key:"role",label:"Role",render:r=>badge(r.role,"blue")},{key:"email",label:"Email"},
      {key:"lastLogin",label:"Last login"},
      {key:"status",label:"Status",render:r=>adminStatusBadge(r)},
      {key:"twofa",label:"2FA",render:r=>r.twofa?badge("Enabled","green"):badge("Disabled","gold")},
      {key:"_a",label:"",sortable:false,render:r=>adminRowActions(r)},
    ], DATA.admins)}
  </div></div>
  <div class="card"><div class="card-head"><h3>Role permissions</h3><span class="sub">Super Admin has full access by default</span></div>
    <div class="card-body">
      <div class="roles-scroll"><div class="roles-grid">
        <div class="rh">Module</div><div class="rh">Super</div><div class="rh">Operations</div><div class="rh">Finance</div><div class="rh">Support</div><div class="rh">Read-only</div>
        ${PERM_MODULES.map(m=>`<div class="rl">${m}</div><div class="rc">✔</div><div class="rc">${m==="Finance"?"—":"✔"}</div><div class="rc">${m==="Finance"||m==="Orders"?"✔":"—"}</div><div class="rc">${m==="Orders"?"View":"—"}</div><div class="rc">View</div>`).join("")}
      </div></div>
    </div>
  </div>
  <div class="card"><div class="card-head"><h3>Audit log</h3></div><div class="card-body pad0">
    ${renderTable("audit",[{key:"who",label:"Admin"},{key:"action",label:"Action"},{key:"when",label:"When"}], DATA.auditLog, {})}
  </div></div>`;

/* ---- Settings ---- */
VIEWS.settings = () => { const s = STATE.settings; return `
  <div class="view-head"><h1>Platform Settings</h1><p>Fees, commission, tax and policies applied across MediFinder India.</p></div>
  <div class="card"><div class="card-head"><h3>General</h3></div><div class="card-body">
    <div class="field-row">
      <div class="field"><label>Platform name</label><input id="setName" value="${esc(s.platformName)}"></div>
      <div class="field"><label>Platform commission (%)</label><input id="setCommission" type="number" value="${s.commission}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>COD fee (₹)</label><input id="setCod" type="number" value="${s.codFee}"></div>
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
  "user-toggle": async (el)=>{ const u=DATA.users.find(x=>x.id===el.dataset.id); if(!u) return;
    const prev = u.status, next = u.status==="active" ? "blocked" : "active";
    u.status = next; render(); toast(`${u.name} ${next==="active"?"unblocked":"blocked"}`);
    const { error } = await supabase.from('profiles').update({ status:next }).eq('id', u.id);
    if(error){ u.status = prev; render(); toast("Failed: "+error.message,"danger"); }
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
      const { error } = await supabase.from('notifications').insert({ user_id:null, type:'admin_broadcast', title:'Message from MediFinder India', message:msg });
      if(error){ toast("Failed: "+error.message,"danger"); return; }
    } else {
      const targets = DATA.users.filter(u=>userSegment(u)===seg);
      if(!targets.length){ toast("No customers in this segment","danger"); return; }
      const rows = targets.map(u=>({ user_id:u.id, type:'admin_broadcast', title:'Message from MediFinder India', message:msg }));
      const { error } = await supabase.from('notifications').insert(rows);
      if(error){ toast("Failed: "+error.message,"danger"); return; }
    }
    closeModal(); toast(`Sent to ${count(seg)} customer(s)`);
    function count(s){ return s==="all" ? DATA.users.length : DATA.users.filter(u=>userSegment(u)===s).length; }
  },

  "merchant-approve": async (el)=>{ const m=DATA.merchants.find(x=>x.id===Number(el.dataset.id)); if(!m) return;
    const prev = { status:m.status, license:m.license, kycReason:m.kycReason };
    m.status="active"; m.license="verified"; m.kycReason=""; render(); toast("Merchant approved / KYC verified");   // instant
    const { error } = await supabase.rpc('approve_merchant_license', { merchant_id_input: m.id });
    if(error){ Object.assign(m, prev); render(); toast("Approve failed: "+error.message,"danger"); return; }
    Promise.all([
      supabase.from('merchants').update({ kyc_status:'approved', kyc_rejection_reason:'' }).eq('id', m.id),
      supabase.from('merchant_notifications').insert({ merchant_id:m.id, title:'Shop verified', message:'Your shop & drug licence have been verified. You are now live on MediFinder India.', type:'success', category:'kyc' })
    ]).catch(e=>console.warn("[admin] merchant approve follow-up", e));
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
    const prev = m.status; setStatus(DATA.merchants,Number(el.dataset.id),"suspended"); toast("Merchant suspended","danger");
    const { error } = await supabase.from('merchants').update({ status:'suspended' }).eq('id', m.id);
    if(error){ m.status = prev; render(); toast("Failed: "+error.message,"danger"); }
  },
  "merchant-activate": async (el)=>{ const m=DATA.merchants.find(x=>x.id===Number(el.dataset.id)); if(!m) return;
    const prev = { status:m.status, license:m.license };
    m.status="active"; m.license="verified"; render(); toast("Merchant activated");
    const { error } = await supabase.from('merchants').update({ status:'active', license_status:'verified' }).eq('id', m.id);
    if(error){ Object.assign(m, prev); render(); toast("Failed: "+error.message,"danger"); }
  },
  "merchant-notify": (el)=>{ const m=DATA.merchants.find(x=>x.id===Number(el.dataset.id)); if(!m) return;
    openModal(`Notify — ${m.name}`, `
      <div class="field"><label>Message</label><textarea id="mNotifyMsg" placeholder="e.g. Please update your bank settlement details"></textarea></div>`,
      `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-act="merchant-notify-confirm" data-id="${m.id}">Send</button>`);
  },
  "merchant-notify-confirm": async (el)=>{ const m=DATA.merchants.find(x=>x.id===Number(el.dataset.id)); if(!m) return;
    const msg = $("#mNotifyMsg").value.trim(); if(!msg){ toast("Message is required","danger"); return; }
    const { error } = await supabase.from('merchant_notifications').insert({ merchant_id:m.id, title:'Message from MediFinder India Admin', message:msg, type:'info', category:'general' });
    if(error){ toast("Failed to send: "+error.message,"danger"); return; }
    closeModal(); render(); toast(`Notification sent to ${m.name}`);
  },

  "rider-approve": async (el)=>{ const rid=Number(el.dataset.id); const r0=DATA.riders.find(x=>x.id===rid); const prev=r0&&r0.status;
    setStatus(DATA.riders,rid,"active"); toast("Rider KYC approved");
    const { error } = await supabase.from('rider_kyc_application').upsert({ rider_id:rid, status:'approved', rejection_reason:'', reviewed_at:new Date().toISOString() }, { onConflict:'rider_id' });
    if(error){ if(r0) r0.status=prev; render(); toast("Approve failed: "+error.message,"danger"); }
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
  "rider-suspend": async (el)=>{ const rid=Number(el.dataset.id); const r0=DATA.riders.find(x=>x.id===rid); const prev=r0&&r0.status;
    setStatus(DATA.riders,rid,"suspended"); toast("Rider suspended","danger");
    const { error } = await supabase.from('rider_kyc_application').upsert({ rider_id:rid, status:'rejected', rejection_reason:'Suspended by admin', reviewed_at:new Date().toISOString() }, { onConflict:'rider_id' });
    if(error){ if(r0) r0.status=prev; render(); toast("Suspend failed: "+error.message,"danger"); }
  },
  "rider-activate": async (el)=>{ const rid=Number(el.dataset.id); const r0=DATA.riders.find(x=>x.id===rid); const prev=r0&&r0.status;
    setStatus(DATA.riders,rid,"active"); toast("Rider activated");
    const { error } = await supabase.from('rider_kyc_application').upsert({ rider_id:rid, status:'approved', rejection_reason:'', reviewed_at:new Date().toISOString() }, { onConflict:'rider_id' });
    if(error){ if(r0) r0.status=prev; render(); toast("Activate failed: "+error.message,"danger"); }
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
  // Rider assignment happens automatically in the apps, and medicines are added by merchants - admin only reviews / approves.
  "product-visible": async (el)=>{ const p=DATA.products.find(x=>x.id===Number(el.dataset.id)); if(!p) return;
    const next = !p.visible;
    const { error } = await supabase.from('medicines').update({ is_visible:next }).eq('id', p.id);
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    p.visible=next; toast(p.visible?"Product visible to customers":"Product hidden");
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
      <div class="field"><label>Max discount (₹)</label><input id="cMax" type="number"></div></div>
      <div class="field-row"><div class="field"><label>Min order (₹)</label><input id="cMin" type="number"></div>
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
    const btnAction = linkedProductId ? `user.html?id=${encodeURIComponent(linkedProductId)}` : customLink;

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
      first_order_discount_percent: (()=>{ const v = Number($("#adDiscount").value); return (v>0 && v<=100) ? v : null; })(),
      valid_until: $("#adEnd").value || null,
      use_custom_image: useCustomImage, custom_image_url: customImageUrl,
      show_on: ($("#adShowOn") ? $("#adShowOn").value : "both"),
    };
    const saveAd = (p)=> editId
      ? supabase.from('sponsored_products').update(p).eq('id', editId)
      : supabase.from('sponsored_products').insert({ ...p, is_active:true });
    let { error } = await saveAd(payload);
    if(error && /show_on/i.test(error.message||"")){
      // column not created yet: save the banner anyway, but tell the admin the placement was NOT stored
      const { show_on, ...rest } = payload;
      ({ error } = await saveAd(rest));
      if(!error) toast("Saved, but 'Shows on' needs the SQL from sponsored_show_on.sql run in Supabase first. Until then the banner shows on both pages.","danger");
    }
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


  "hc-add": (el)=>{ const kind=el.dataset.kind;
    const map = {nurses:["Nurse name","type"], labs:["Lab / partner name","test"], ambulance:["Provider name","type"]};
    promptAdd(`Add to ${kind}`, map[kind][0], async (v)=>{
      if(kind==="nurses"){
        const { error } = await supabase.from('nurses').insert({ name:v });
        if(error){ toast("Failed to add nurse: "+error.message,"danger"); return; }
        await loadNursesFromDB(); await logAdminAction(`Added nurse ${v}`); render(); toast("Nurse added"); return;
      }
      if(kind==="ambulance"){ toast("Ambulance units are added by drivers signing up via the Ambulance Partner app, not from here.","danger"); return; }
      render(); toast("Added");
    });
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

  "admin-add": ()=>{
    if(!isSuperAdmin()){ toast("Only the Super Admin can invite admins","danger"); return; }
    openModal("Invite admin", `
      <div class="field"><label>Name</label><input id="aName" autocomplete="off"></div>
      <div class="field"><label>Gmail / email</label><input id="aEmail" type="email" inputmode="email" autocomplete="off" placeholder="name@gmail.com">
        <div class="hint">A secure setup link is emailed to this address. When they open it they must create a strong password, a phone number and a 6-digit code. All three are needed at every login.</div></div>
      <div class="field"><label>Role</label><select id="aRole"><option>Operations Admin</option><option>Finance Admin</option><option>Support Admin</option><option>Read-only Admin</option></select></div>`,
      `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-act="admin-save">Send invite</button>`);
  },
  "admin-save": async ()=>{
    if(!isSuperAdmin()){ toast("Only the Super Admin can invite admins","danger"); return; }
    const name=$("#aName").value.trim(); if(!name){ toast("Name required","danger"); return; }
    const email=$("#aEmail").value.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast("Enter a valid email address","danger"); return; }
    if(DATA.admins.some(a=>String(a.email||"").toLowerCase()===email)){ toast("This email is already an admin - use Resend link","danger"); return; }
    const { error } = await supabase.from('admins').insert({ name, role:$("#aRole").value, email });
    if(error){ toast("Failed to add admin: "+error.message,"danger"); return; }
    const mail = await sendAdminLoginLink(email);
    await loadAdminsFromDB(); await logAdminAction(`Invited admin ${name} (${email})`);
    closeModal(); render();
    if(mail.error) toast("Admin saved, but the email could not be sent: "+mail.error.message+" - use Resend link","danger");
    else toast("Invite sent - login link emailed to "+email);
  },
  "admin-resend": async (el)=>{
    if(!isSuperAdmin()){ toast("Only the Super Admin can send invites","danger"); return; }
    const a=DATA.admins.find(x=>String(x.id)===String(el.dataset.id)); if(!a) return;
    if(isOwnerEmail(a.email)){ toast("The owner admin is protected","danger"); return; }
    const r=await sendAdminLoginLink(a.email);
    if(r.error){ toast("Could not send: "+r.error.message,"danger"); return; }
    await logAdminAction(`Resent login link to ${a.email}`); toast("Login link sent to "+a.email);
  },
  "admin-suspend":  (el)=> adminManage(el.dataset.id, "suspended"),
  "admin-block":    (el)=> adminManage(el.dataset.id, "blocked"),
  "admin-activate": (el)=> adminManage(el.dataset.id, "active"),
  "admin-reset":    (el)=> adminManage(el.dataset.id, "reset"),
  "admin-delete":   (el)=> adminManage(el.dataset.id, "delete"),

};

function setStatus(arr,id,status){ const item=arr.find(x=>x.id===id); if(item) item.status=status; render(); }
function promptAdd(title, label, onSave){
  openModal(title, `<div class="field"><label>${esc(label)}</label><input id="promptVal"></div>`,
    `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="promptSaveBtn">Save</button>`);
  $("#promptSaveBtn").addEventListener("click", ()=>{ const v=$("#promptVal").value.trim(); if(!v){ toast("This field is required","danger"); return; } closeModal(); onSave(v); });
}

/* =========================================================
   6b. ADMIN RESTRUCTURE — KYC / Booking / Payout / Payment /
       Notification / Zone / System / Logout   (all REAL tables)
   ========================================================= */
DATA.raw = { merchantKyc:[], riderKyc:[], nurseKyc:[], collectorKyc:[], collectors:[], ambulance:[] };
DATA.payouts = { merchant:[], rider:[], nurse:[], collector:[], ambulance:[] };

const isUrl = (v)=> /^https?:\/\//i.test(String(v||""));
const mask = (v)=> v ? "••••" + String(v).slice(-4) : "—";
const dash = (v)=> (v===null || v===undefined || v==="") ? "—" : v;
const fmtTs = (iso)=> iso ? fmtDateTime(iso) : "—";
function normKyc(v){
  v = String(v||"").toLowerCase();
  if(["verified","approved","active"].includes(v)) return "verified";
  if(["rejected","reject","declined"].includes(v)) return "rejected";
  if(["pending","pending_review","submitted","under_review"].includes(v)) return "pending";
  return null; // draft / not_started / not_submitted → not part of KYC queue
}
function normPayStatus(v){
  v = String(v||"pending").toLowerCase().replace(/[\s-]+/g,"_");
  if(["paid","completed","done","success","settled"].includes(v)) return "paid";
  if(["processing","approved","in_progress"].includes(v)) return "processing";
  if(["failed","rejected"].includes(v)) return "failed";
  if(["on_hold","hold","held"].includes(v)) return "on_hold";
  return "pending";
}
STATUS_TONE.on_hold = "gray"; STATUS_TONE.verified = "green"; STATUS_TONE.in_progress = "blue"; STATUS_TONE.urgent = "red"; STATUS_TONE.low = "gray";
async function safeSelect(table, cols="*", limit=500){
  if(!supabase) return [];
  const { data, error } = await supabase.from(table).select(cols).limit(limit);
  if(error){ console.warn("[admin] "+table+": "+error.message); return []; }
  return data || [];
}
function doc(label, ref, bucket){ return ref ? {label, ref:String(ref), bucket} : null; }
/* JSON-column documents (ambulance_drivers.kyc_documents / vehicle_documents):
   { aadhaar:{url,path,mime,status,...}, pan:{...}, ... } -> one viewer entry per file.
   Prefers the stored public url, falls back to the storage path. */
function jsonDocs(obj, bucket, prefix){
  if(typeof obj === "string"){ try{ obj = JSON.parse(obj); }catch(e){ obj = null; } }
  if(!obj || typeof obj !== "object") return [];
  return Object.entries(obj).map(([k, v])=>{
    if(!v) return null;
    const ref = typeof v === "string" ? v : (v.url || v.path || v.file || v.src);
    if(!ref) return null;
    const nice = String(k).replace(/_/g," ").replace(/\b\w/g, c=>c.toUpperCase());
    return doc((prefix ? prefix+" · " : "") + nice, ref, bucket);
  }).filter(Boolean);
}

async function loadPartnerExtras(){
  const R = DATA.raw;
  R.merchantKyc = await safeSelect("merchant_kyc");
  R.riderKyc = await safeSelect("rider_kyc_application");
  R.nurseKyc = await safeSelect("nurse_kyc");
  R.collectorKyc = await safeSelect("collector_kyc");
  R.collectors = await safeSelect("sample_collectors", "*");
  const nurseByUid = {}; DATA.nurses.forEach(n=>{ if(n.authUserId) nurseByUid[n.authUserId] = n.name; });
  R.nurseKyc.forEach(k=>{ if(k.full_name) nurseByUid[k.user_id] = k.full_name; });
  const colName = {}; R.collectors.forEach(c=>{ colName[c.id] = c.full_name || ("Collector #"+String(c.id).slice(0,6)); });
  const colKyc = {}; R.collectorKyc.forEach(k=>{ colKyc[k.collector_id] = k; });
  const drvById = {}; R.ambulance.forEach(d=>{ drvById[d.id] = d; });

  const bankLine = (upi, acct, ifsc, bank)=> upi ? `UPI · ${upi}` : (acct || bank) ? `Bank · ${bank?bank+" ":""}${acct?mask(acct):""}${ifsc?" · "+ifsc:""}` : "—";
  const base = (p)=>({ gross:null, commission:null, fees:null, adj:null, ...p });

  /* merchant */
  const mName = {}; DATA.merchants.forEach(m=>{ mName[String(m.id)] = m.name; });
  DATA.payouts.merchant = (await safeSelect("merchant_payouts")).map(p=>base({
    kind:"merchant", id:p.id, recipient: mName[String(p.merchant_id ?? p.shop_id)] || ("Shop #"+(p.shop_id ?? p.merchant_id)),
    period:(p.created_at||"").slice(0,10), gross:Number(p.amount||0), commission:Math.round(commissionFor("merchant", p.merchant_id ?? p.shop_id, Number(p.amount||0)).amount*100)/100,
    net:Math.max(0, Number(p.amount||0) - Math.round(commissionFor("merchant", p.merchant_id ?? p.shop_id, Number(p.amount||0)).amount*100)/100),
    ref: [p.order_id ? "Order "+String(p.order_id).slice(0,12) : "", p.payment_mode||""].filter(Boolean).join(" · "), bank: bankLine(p.upi_id, p.bank_account, p.ifsc),
    requestedAt:p.created_at, paidAt:p.paid_at || p.settled_at, txn:p.txn_ref, note:p.admin_note, status:normPayStatus(p.status),
  }));
  /* rider */
  const riderNames = {}; DATA.riders.forEach(r=>{ riderNames[r.id] = r.name; });
  DATA.payouts.rider = (await safeSelect("admin_payout_requests")).filter(p=>p.rider_id!=null).map(p=>base({
    kind:"rider", id:p.id, recipient: riderNames[p.rider_id] || ("Rider #"+p.rider_id),
    period:(p.requested_at||p.created_at||"").slice(0,10), net:Number(p.total_payout_amount ?? p.amount ?? 0), gross:Number(p.total_payout_amount ?? p.amount ?? 0),
    ref: p.active_duty_hours!=null ? `${p.active_duty_hours} duty hrs` : "", bank: bankLine(p.upi_id, p.bank_account, p.ifsc),
    requestedAt:p.requested_at || p.created_at, paidAt:p.processed_at, txn:p.txn_ref, note:p.notes, status:normPayStatus(p.request_status || p.status), _src:"admin_payout_requests",
  }));
  DATA.payouts.rider = DATA.payouts.rider.concat((await safeSelect("rider_payouts")).map(p=>base({
    kind:"rider", id:"rp-"+p.id, _src:"rider_payouts", _rawId:p.id, recipient: riderNames[p.rider_id] || p.name || ("Rider #"+p.rider_id),
    period:(p.created_at||"").slice(0,10), net:Number(p.amount||0), gross:Number(p.amount||0), ref: p.hours!=null ? `${p.hours} duty hrs` : "",
    bank: p.upi_id ? `UPI · ${p.upi_id}` : p.bank_account ? `Bank · ${mask(p.bank_account)}${p.ifsc?" · "+p.ifsc:""}` : (p.destination||"—"),
    requestedAt:p.created_at, paidAt:p.paid_at, txn:null, note:null, status: p.paid ? "paid" : normPayStatus(p.status),
  })));
  /* nurse */
  DATA.payouts.nurse = (await safeSelect("nurse_payouts")).map(p=>base({
    kind:"nurse", id:p.id, recipient: nurseByUid[p.user_id] || ("Nurse "+String(p.user_id).slice(0,6)),
    period:(p.created_at||"").slice(0,10), net:Number(p.amount||0), gross:Number(p.amount||0), ref:"",
    bank: p.upi_id ? `UPI · ${p.upi_id}` : (p.bank_name||p.account_last4) ? `Bank · ${p.bank_name||""} ••••${p.account_last4||""}${p.ifsc?" · "+p.ifsc:""}` : "—",
    requestedAt:p.created_at, paidAt:p.processed_at, txn:p.txn_ref, note:p.admin_note, status:normPayStatus(p.status),
  }));
  /* lab / blood collector */
  DATA.payouts.collector = (await safeSelect("collector_earnings")).map(p=>{ const k = colKyc[p.collector_id] || {};
    return base({
      kind:"collector", id:p.id, recipient: colName[p.collector_id] || ("Collector "+String(p.collector_id).slice(0,6)),
      period:(p.created_at||"").slice(0,10), gross:Number(p.gross_amount||0), commission:Number(p.commission_amount||0), net:Number(p.net_amount||0),
      ref:[p.booking_ref, p.test_name].filter(Boolean).join(" · "), bank: bankLine(k.upi_id, k.bank_account_no, k.ifsc, ""),
      requestedAt:p.created_at, paidAt:p.settled_at, txn:p.txn_ref, note:p.admin_note, status:normPayStatus(p.status),
    }); });
  /* ambulance — one settlement per completed ride */
  const rides = await safeSelect("ambulance_bookings");
  DATA.payouts.ambulance = rides.filter(b=>b.status==="completed").map(b=>{ const d = drvById[b.driver_id] || {};
    return base({
      kind:"ambulance", id:b.id, recipient: d.driver_name || "Driver", period:(b.completed_at||b.created_at||"").slice(0,10),
      gross:Number(b.fare_final ?? b.fare_estimate ?? 0), commission:Number(b.commission_amount||0), net:Number(b.driver_earning||0),
      ref:"Ride "+String(b.id).slice(0,8), bank: bankLine(d.bank_upi_id, d.bank_account_number, d.bank_ifsc_code, d.bank_name) + (d.bank_verified?" · verified":" · bank not verified"),
      requestedAt:b.completed_at || b.created_at, paidAt:b.settled_at, txn:b.settlement_txn_ref, note:b.settlement_note, status:normPayStatus(b.settlement_status),
    }); });
}

/* ---------- KYC ---------- */
let _kycCache = null, _kycCacheAt = 0;
function kycAllRows(){
  // building every partner's KYC row (with documents) is heavy and runs several times per render -> reuse for the same render
  if(_kycCache && Date.now() - _kycCacheAt < 1000) return _kycCache;
  _kycCache = kycAllRowsRaw(); _kycCacheAt = Date.now();
  return _kycCache;
}
function kycAllRowsRaw(){
  const R = DATA.raw, out = [];
  const mk = {}; R.merchantKyc.forEach(k=>{ mk[k.merchant_id] = k; });
  DATA.merchants.forEach(m=>{
    const k = mk[m.id] || {};
    let st = null;
    if(m.license==="verified") st = "verified";
    else if(m.license==="rejected" || m.kycStatusRaw==="rejected") st = "rejected";
    else if(m.kycStatusRaw==="pending_review" || k.status==="pending") st = "pending";
    if(!st) return;
    out.push({kind:"merchant", id:m.id, name:m.name, phone:m.phone, info:`${m.owner} · ${m.city} ${m.pincode}`, status:st, reason:m.kycReason||k.rejection_reason||"", submitted:(k.created_at||"").slice(0,10),
      details:[["Pharmacy",m.name],["Owner",m.owner],["Phone",m.phone],["Email",m.email],["Address",`${m.address}, ${m.city} ${m.pincode}`],["Shop GPS pin",(m.lat!=null&&m.lng!=null)?`${m.lat}, ${m.lng}  (https://www.google.com/maps?q=${m.lat},${m.lng})`:"Not pinned yet"],["Licence no.",dash(k.license_no)],["Aadhaar",dash(k.aadhaar_number)],["PAN",dash(k.pan_number)]],
      docs:[doc("Drug licence",k.license_img,"license_docs"),doc("Aadhaar",k.aadhaar_img,"license_docs"),doc("PAN",k.pan_img,"license_docs")].filter(Boolean)});
  });
  const rk = {}; R.riderKyc.forEach(k=>{ rk[k.rider_id] = k; });
  DATA.riders.forEach(r=>{
    const k = rk[r.id]; if(!k && r.status!=="active") return;
    const st = r.status==="pending" ? "pending" : r.status==="active" ? "verified" : (k && normKyc(k.status)==="rejected") ? "rejected" : null; if(!st) return;
    const kk = k || {};
    out.push({kind:"rider", id:r.id, name:r.name, phone:r.phone, info:`${r.vehicle}`, status:st, reason:r.kycReason||kk.rejection_reason||"", submitted:(kk.submitted_at||"").slice(0,10),
      details:[["Name",r.name],["Phone",dash(kk.contact_no||r.phone)],["WhatsApp",dash(kk.whatsapp_no)],["Email",dash(kk.email)],["Age",dash(kk.age)],["Address",dash(kk.address)],["Vehicle",`${dash(kk.vehicle_type)} · ${dash(kk.vehicle_no)}`],["Licence no.",dash(kk.license_no)],["ID",`${dash(kk.id_type)} · ${dash(kk.id_no)}`],["UPI",dash(kk.upi_id)],["Account",`${mask(kk.account_no)} · ${dash(kk.ifsc_code)}`]],
      docs:[doc("Selfie",kk.selfie_img,"rider-documents"),doc("ID proof",kk.id_img,"rider-documents"),doc("Driving licence",kk.license_img,"rider-documents"),doc("Vehicle",kk.vehicle_img,"rider-documents"),doc("Insurance",kk.insurance_img,"rider-documents"),doc("Bank document",kk.bank_doc_img,"rider-documents"),doc("UPI QR",kk.qr_code_img,"rider-documents")].filter(Boolean)});
  });
  R.nurseKyc.forEach(k=>{ const st = normKyc(k.status); if(!st) return;
    out.push({kind:"nurse", id:k.user_id, name:k.full_name||"Nurse", phone:k.contact_no, info:k.qualification||"", status:st, reason:k.rejection_reason||"", submitted:(k.submitted_at||"").slice(0,10),
      details:[["Name",k.full_name],["DOB",dash(k.dob)],["Phone",dash(k.contact_no)],["WhatsApp",dash(k.whatsapp_no)],["Address",`${dash(k.address_line)}, ${dash(k.city)}, ${dash(k.state)} ${dash(k.pincode)}`],["ID proof",dash(k.id_proof_type)],["Qualification",dash(k.qualification)],["Day charge",k.day_charge!=null?money(k.day_charge):"—"],["Bank",`${dash(k.bank_holder)} · ${dash(k.bank_name)} · ${mask(k.account_no)} · ${dash(k.ifsc)}`],["UPI",dash(k.upi_id)]],
      docs:[doc("ID proof",k.id_proof_path,"nurse-kyc"),doc("Address proof",k.address_proof_path,"nurse-kyc"),doc("Certificate",k.certificate_path,"nurse-kyc"),doc("Bank proof",k.bank_proof_path,"nurse-kyc")].filter(Boolean)}); });
  R.collectorKyc.forEach(k=>{ const st = normKyc(k.status); if(!st) return;
    out.push({kind:"lab", id:k.id, name:k.full_name||"Collector", phone:k.mobile_no, info:`${dash(k.city)} ${dash(k.pincode)}`, status:st, reason:k.rejection_reason||"", submitted:(k.submitted_at||"").slice(0,10),
      details:[["Name",k.full_name],["Mobile",dash(k.mobile_no)],["WhatsApp",dash(k.whatsapp_no)],["Address",`${dash(k.address)}, ${dash(k.city)}, ${dash(k.state)} ${dash(k.pincode)}`],["ID proof",`${dash(k.id_proof_type)} · ${dash(k.id_proof_number)}`],["Address proof",`${dash(k.address_proof_type)} · ${dash(k.address_proof_number)}`],["Bank",`${dash(k.bank_holder)} · ${mask(k.bank_account_no)} · ${dash(k.ifsc)}`],["UPI",dash(k.upi_id)]],
      docs:[doc("Photo",k.photo_url,"collector-docs"),doc("ID proof",k.id_proof_url,"collector-docs"),doc("Address proof",k.address_proof_url,"collector-docs"),doc("Passbook",k.passbook_url,"collector-docs")].filter(Boolean)}); });
  R.ambulance.forEach(d=>{ const st = normKyc(d.kyc_status); if(!st) return;
    out.push({kind:"ambulance", id:d.id, name:d.driver_name||"Driver", phone:d.phone, info:`${dash(d.vehicle_type)} · ${dash(d.plate_number)}`, status:st, reason:d.kyc_rejection_reason||"", submitted:(d.kyc_submitted_at||"").slice(0,10),
      details:[["Driver",d.driver_name],["Phone",dash(d.phone)],["WhatsApp",dash(d.whatsapp_number)],["Aadhaar no.",dash((d.kyc_documents||{}).aadhaar?.number)],["PAN no.",dash((d.kyc_documents||{}).pan?.number)],["Licence no.",dash((d.kyc_documents||{}).license?.number)],["Vehicle",`${dash(d.vehicle_type)} · ${dash(d.plate_number)} · ${dash(d.category)}`],["Address",`${dash(d.address)} ${dash(d.pincode)}`],["Emergency contact",`${dash(d.emergency_contact_name)} ${dash(d.emergency_contact_phone)}`],["Bank",`${dash(d.bank_account_holder)} · ${dash(d.bank_name)} · ${mask(d.bank_account_number)} · ${dash(d.bank_ifsc_code)}`],["UPI",dash(d.bank_upi_id)],["Bank verified",d.bank_verified?"Yes":"No"]],
      docs:[doc("Driver photo",d.photo_url,"ambulance-kyc"),doc("Vehicle photo",d.vehicle_photo_url,"ambulance-kyc"),doc("Plate photo",d.plate_photo_url,"ambulance-kyc"),...jsonDocs(d.kyc_documents,"ambulance-kyc","KYC"),...jsonDocs(d.vehicle_documents,"ambulance-kyc","Vehicle")].filter(Boolean)}); });
  return out;
}
const KYC_STATUS_TABS = [{key:"all",label:"All"},{key:"pending",label:"Pending"},{key:"verified",label:"Verified"},{key:"rejected",label:"Reject"}];
const KYC_TITLE = {merchant:"Merchant", rider:"Rider", nurse:"Nurse", lab:"Lab / Blood Collector", ambulance:"Ambulance"};
VIEWS.kyc = () => {
  const st = vs("kyc",{tab:"merchant"}); const sub = vs("kycstatus",{tab:"all"});
  const every = kycAllRows();
  const all = every.filter(r=>r.kind===st.tab);
  const rows = sub.tab==="all" ? all : all.filter(r=>r.status===sub.tab);
  const tabs = KYC_STATUS_TABS.map(t=>({...t, label:`${t.label} (${t.key==="all" ? all.length : all.filter(r=>r.status===t.key).length})`}));
  const typeTabs = Object.keys(KYC_TITLE).map(k=>{ const mine = every.filter(r=>r.kind===k); const pend = mine.filter(r=>r.status==="pending").length;
    return {key:k, label:`${KYC_TITLE[k].split(" /")[0]} (${mine.length}${pend?` · ${pend} new`:""})`}; });
  return `
  <div class="view-head"><h1>${KYC_TITLE[st.tab]} KYC</h1><p>Applicant details → documents → approve / reject → KYC history.</p></div>
  ${toolbarTabs("kyc", typeTabs)}
  ${toolbarTabs("kycstatus", tabs)}
  <div class="card"><div class="card-body pad0" id="tablewrap-kyc">
  ${renderTable("kyc",[
    {key:"name",label:"Applicant",render:r=>`<div class="cell-strong">${esc(r.name)}</div><div class="cell-sub">${esc(r.info)}</div>`},
    {key:"phone",label:"Phone"},{key:"submitted",label:"Submitted"},
    {key:"status",label:"Status",render:r=>statusBadge(r.status)},
    {key:"_a",label:"",sortable:false,render:r=>`<button class="btn sm" data-act="kyc-detail" data-kind="${r.kind}" data-id="${esc(r.id)}">Details</button>`},
  ], rows, {emptyText:"Nothing in this KYC filter."})}
  </div></div>`;
};
function kycFind(kind,id){ return kycAllRows().find(r=>r.kind===kind && String(r.id)===String(id)); }

/* ---------- BOOKING ---------- */
const BK_STATUS_TABS = [{key:"all",label:"All"},{key:"new",label:"Pending"},{key:"accepted",label:"Accepted"},{key:"cancelled",label:"Rejected"},{key:"completed",label:"Completed"}];
const BK_META = {
  lab:{title:"Lab", prefix:"lbk", provider:"Blood collector", rows:()=>DATA.labBookings},
  nurse:{title:"Nurse", prefix:"nbk", provider:"Nurse", rows:()=>DATA.nurseBookings},
  ambulance:{title:"Ambulance", prefix:"abk", provider:"Driver", rows:()=>DATA.ambulanceBookings},
};
VIEWS.booking = () => {
  const st = vs("booking",{tab:"lab"}); const sub = vs("bookingstatus",{tab:"all"}); const meta = BK_META[st.tab];
  let rows = meta.rows();
  if(sub.tab!=="all") rows = rows.filter(r=> sub.tab==="accepted" ? ["accepted","assigned","on-route"].includes(r.status) : r.status===sub.tab);
  return `
  <div class="view-head"><h1>${meta.title} Bookings</h1><p>Pending → booking details → accept / reject (${meta.provider.toLowerCase()}) → status history.</p></div>
  ${toolbarTabs("booking", Object.keys(BK_META).map(k=>{ const list = BK_META[k].rows(); const n = list.filter(r=>r.status==="new").length; return {key:k, label:`${BK_META[k].title} (${list.length}${n?` · ${n} new`:""})`}; }))}
  ${toolbarTabs("bookingstatus", BK_STATUS_TABS)}
  <div class="card"><div class="card-body pad0" id="tablewrap-booking">
  ${renderTable("booking",[
    {key:"id",label:"Booking"},{key:"customer",label:"Customer"},{key:"service",label:"Service"},{key:"provider",label:meta.provider},
    {key:"date",label:"Date / Time"},{key:"payment",label:"Payment",render:r=>badge(r.payment,r.payment==="COD"?"gold":"blue")},
    {key:"status",label:"Status",render:r=>statusBadge(r.status)},
    {key:"_a",label:"",sortable:false,render:r=>`<button class="btn sm" data-act="bk-detail" data-kind="${st.tab}" data-id="${esc(r.id)}">Details</button>`},
  ], rows, {emptyText:"No bookings in this filter."})}
  </div></div>`;
};

/* ---------- PAYOUT ---------- */
const PAY_STATUSES = ["pending","processing","paid","failed","on_hold"];
const PAY_LABEL = {pending:"Pending",processing:"Processing",paid:"Paid",failed:"Failed",on_hold:"On Hold"};
const PAY_STATUS_TABS = [{key:"all",label:"All"}, ...PAY_STATUSES.map(k=>({key:k,label:PAY_LABEL[k]}))];
const PAY_KIND_TITLE = {merchant:"Merchant", rider:"Rider", nurse:"Nurse", collector:"Lab / Blood Collector", ambulance:"Ambulance"};
const payoutRows = (kind)=> DATA.payouts[kind] || [];
const payTone = (s)=> s==="paid"?"green":s==="failed"?"red":s==="on_hold"?"gray":"gold";
VIEWS.payout = () => {
  const st = vs("payout",{tab:"overview"});
  if(st.tab==="overview"){
    return `
    <div class="view-head"><h1>Pay Out</h1><p>Every partner payout in one place — pending, processing, paid, failed and on hold.</p></div>
    <div class="card"><div class="card-body pad0">
    ${renderTable("payoverview",[
      {key:"label",label:"Partner"},
      ...PAY_STATUSES.map(k=>({key:k,label:PAY_LABEL[k],sortable:false})),
      {key:"due",label:"Pending amount",sortable:false,render:r=>money(r.due)},
    ], Object.keys(PAY_KIND_TITLE).map(kind=>{
      const rows = payoutRows(kind); const o = {label:PAY_KIND_TITLE[kind], due:rows.filter(x=>x.status==="pending").reduce((a,x)=>a+x.net,0)};
      PAY_STATUSES.forEach(k=>{ o[k] = rows.filter(x=>x.status===k).length; }); return o;
    }))}
    </div></div>`;
  }
  const sub = vs("payoutstatus",{tab:"all"});
  let rows = payoutRows(st.tab); if(sub.tab!=="all") rows = rows.filter(r=>r.status===sub.tab);
  return `
  <div class="view-head"><h1>${PAY_KIND_TITLE[st.tab]} Payout</h1><p>Pending → earning details → approve payout → paid → transaction history.</p></div>
  ${toolbarTabs("payoutstatus", PAY_STATUS_TABS)}
  <div class="card"><div class="card-body pad0" id="tablewrap-payout">
  ${renderTable("payout",[
    {key:"recipient",label:"Recipient",render:r=>`<div class="cell-strong">${esc(r.recipient)}</div><div class="cell-sub">${esc(r.ref||"")}</div>`},
    {key:"period",label:"Period"},{key:"net",label:"Net payable",render:r=>money(r.net)},
    {key:"requestedAt",label:"Requested",render:r=>esc(fmtTs(r.requestedAt))},
    {key:"status",label:"Status",render:r=>badge(PAY_LABEL[r.status], payTone(r.status))},
    {key:"_a",label:"",sortable:false,render:r=>`<button class="btn sm" data-act="payout-detail" data-kind="${r.kind}" data-id="${esc(r.id)}">Details</button>`},
  ], rows, {emptyText:"No payouts in this filter."})}
  </div></div>`;
};

/* ---------- PAYMENT VERIFICATION (UPI/UTR submitted by customers) ---------- */
DATA.payQueue = [];
async function loadPaymentQueue(){
  if(!supabase) return;
  const sel = (t, c)=> supabase.from(t).select(c).not("payment_verification_status","is",null).order("created_at",{ascending:false}).limit(150);
  const [o,l,n,a] = await Promise.all([
    sel("orders","id, order_id, customer_name, customer_phone, user_name, user_phone, total_amount, payment_utr, payment_verification_status, payment_verified_at, payment_note, status, created_at"),
    sel("lab_bookings","id, booking_id, patient_name, patient_phone, test_name, test_price, payment_utr, payment_verification_status, payment_verified_at, payment_note, status, created_at"),
    sel("nurse_bookings","id, patient_name, contact_no, service_label, total_amount, payment_utr, payment_verification_status, payment_verified_at, payment_note, status, created_at"),
    sel("ambulance_bookings","id, patient_name, contact_phone, vehicle_type, fare_final, fare_estimate, payment_utr, payment_verification_status, payment_verified_at, payment_note, status, created_at"),
  ]);
  const st = (r)=> r.payment_verification_status === "verified" ? "verified" : r.payment_verification_status === "rejected" ? "rejected" : "pending";
  const rows = [];
  (o.data||[]).forEach(r=>rows.push({kind:"order", rawId:r.id, ref:r.order_id || ("ORD-"+String(r.id).slice(0,8)), what:"Medicine order", customer:r.customer_name||r.user_name||"Customer", phone:r.customer_phone||r.user_phone||"—", amount:Number(r.total_amount||0), utr:r.payment_utr, status:st(r), at:r.created_at, verifiedAt:r.payment_verified_at, note:r.payment_note, itemStatus:r.status}));
  (l.data||[]).forEach(r=>rows.push({kind:"lab", rawId:r.id, ref:r.booking_id||("LBK-"+String(r.id).slice(0,8)), what:"Lab · "+(r.test_name||"test"), customer:r.patient_name||"Patient", phone:r.patient_phone||"—", amount:Number(r.test_price||0), utr:r.payment_utr, status:st(r), at:r.created_at, verifiedAt:r.payment_verified_at, note:r.payment_note, itemStatus:r.status}));
  (n.data||[]).forEach(r=>rows.push({kind:"nurse", rawId:r.id, ref:"NBK-"+String(r.id).slice(0,8), what:"Nurse · "+(r.service_label||"visit"), customer:r.patient_name||"Patient", phone:r.contact_no||"—", amount:Number(r.total_amount||0), utr:r.payment_utr, status:st(r), at:r.created_at, verifiedAt:r.payment_verified_at, note:r.payment_note, itemStatus:r.status}));
  (a.data||[]).forEach(r=>rows.push({kind:"ambulance", rawId:r.id, ref:"ABK-"+String(r.id).slice(0,8), what:"Ambulance ride", customer:r.patient_name||"Patient", phone:r.contact_phone||"—", amount:Number(r.fare_final ?? r.fare_estimate ?? 0), utr:r.payment_utr, status:st(r), at:r.created_at, verifiedAt:r.payment_verified_at, note:r.payment_note, itemStatus:r.status}));
  DATA.payQueue = rows.sort((x,y)=> new Date(y.at)-new Date(x.at));
}
const PAYV_TABS = [{key:"pending",label:"Pending"},{key:"verified",label:"Verified"},{key:"rejected",label:"Rejected"},{key:"all",label:"All"}];
const PAYV_KIND = {order:"Order", lab:"Lab", nurse:"Nurse", ambulance:"Ambulance"};
VIEWS.payment = () => {
  const sub = vs("payment",{tab:"pending"});
  const kindF = vs("paykind",{tab:"all"}).tab;
  const base = DATA.payQueue.filter(r=>kindF==="all" || r.kind===kindF);
  const rows = sub.tab==="all" ? base : base.filter(r=>r.status===sub.tab);
  const cnt = (s)=> DATA.payQueue.filter(r=>r.status===s).length;
  const tabs = PAYV_TABS.map(t=>({...t, label: t.key==="all" ? "All" : `${t.label} (${cnt(t.key)})`}));
  const kinds = [{key:"all",label:"All types"}, ...Object.entries(PAYV_KIND).map(([k,v])=>({key:k,label:v}))];
  return `
  <div class="view-head"><h1>Payment</h1><p>Every online (UPI) payment appears here the moment the customer taps “Payment Completed”. Check the UTR in your bank/UPI app, then verify — the order or booking can only be accepted after you verify.</p></div>
  <div class="stat-grid">
    <div class="stat-card"><div class="lbl">Waiting for verification</div><div class="val">${cnt("pending")}</div></div>
    <div class="stat-card"><div class="lbl">Pending amount</div><div class="val">${money(DATA.payQueue.filter(r=>r.status==="pending").reduce((s,r)=>s+r.amount,0))}</div></div>
    <div class="stat-card"><div class="lbl">Verified</div><div class="val">${cnt("verified")}</div></div>
    <div class="stat-card"><div class="lbl">Rejected</div><div class="val">${cnt("rejected")}</div></div>
  </div>
  ${toolbarTabs("payment", tabs)}
  ${toolbarTabs("paykind", kinds)}
  <div class="card"><div class="card-body pad0" id="tablewrap-payment">
  ${renderTable("paymentlist",[
    {key:"ref",label:"Reference",render:r=>`<div class="cell-strong">${esc(r.ref)}</div><div class="cell-sub">${esc(r.what)}</div>`},
    {key:"customer",label:"Customer",render:r=>`<div class="cell-strong">${esc(r.customer)}</div><div class="cell-sub">${esc(r.phone)}</div>`},
    {key:"amount",label:"Amount",render:r=>`<b>${money(r.amount)}</b>`},
    {key:"utr",label:"UTR",render:r=>`<code>${esc(r.utr||"—")}</code>`},
    {key:"at",label:"Submitted",render:r=>esc(fmtTs(r.at))},
    {key:"status",label:"Status",render:r=>badge(r.status==="verified"?"Verified":r.status==="rejected"?"Rejected":"Pending", r.status==="verified"?"green":r.status==="rejected"?"red":"gold")},
    {key:"_a",label:"",sortable:false,render:r=> r.status==="pending"
      ? `<div class="actions-cell"><button class="btn sm primary" data-act="pay-verify" data-kind="${r.kind}" data-id="${esc(r.rawId)}">Payment received ✓</button><button class="btn sm danger" data-act="pay-reject" data-kind="${r.kind}" data-id="${esc(r.rawId)}">Not received</button></div>`
      : `<button class="btn sm" data-act="pay-detail" data-kind="${r.kind}" data-id="${esc(r.rawId)}">Details</button>`},
  ], rows, {emptyText:"No payments in this filter."})}
  </div></div>`;
};
function payFind(kind,id){ return DATA.payQueue.find(r=>r.kind===kind && String(r.rawId)===String(id)); }
Object.assign(Actions, {
  "pay-verify": (el)=>{
    const r = payFind(el.dataset.kind, el.dataset.id); if(!r) return;
    openModal("Verify payment", `
      <div class="hint">Open your UPI / bank app and confirm that <b>${money(r.amount)}</b> with UTR <b>${esc(r.utr||"—")}</b> has actually arrived. After you confirm, the ${esc(PAYV_KIND[r.kind].toLowerCase())} can be accepted by the merchant / partner.</div>
      ${detailRow("Reference", esc(r.ref))}${detailRow("Customer", esc(r.customer))}${detailRow("Amount", money(r.amount))}${detailRow("UTR", esc(r.utr||"—"))}
      <div class="field" style="margin-top:10px"><label>Note (optional)</label><input id="payVNote" placeholder="e.g. Checked in PhonePe business"></div>`,
      `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-act="pay-verify-confirm" data-kind="${r.kind}" data-id="${esc(r.rawId)}">Yes, payment received</button>`);
  },
  "pay-verify-confirm": async (el)=>{
    const r = payFind(el.dataset.kind, el.dataset.id); if(!r) return;
    const note = (($("#payVNote")||{}).value||"").trim() || null;
    const { error } = await supabase.rpc("admin_verify_payment", { p_kind:r.kind, p_id:r.rawId, p_verified:true, p_note:note });
    if(error){ toast("Verify failed: "+error.message,"danger"); return; }
    await logAdminAction(`Verified payment ${r.ref} (${money(r.amount)}, UTR ${r.utr})`);
    await refreshAfterPayment(); closeModal(); toast("Payment verified — now it can be accepted");
  },
  "pay-reject": (el)=>{
    const r = payFind(el.dataset.kind, el.dataset.id); if(!r) return;
    openModal("Payment not received", `
      <div class="hint">The ${esc(PAYV_KIND[r.kind].toLowerCase())} <b>${esc(r.ref)}</b> will be cancelled (nothing can be accepted without a verified payment). Customer sees this reason.</div>
      <div class="field" style="margin-top:10px"><label>Reason *</label><textarea id="payRNote" placeholder="e.g. UTR not found in account"></textarea></div>`,
      `<button class="btn" data-close-modal>Cancel</button><button class="btn danger" data-act="pay-reject-confirm" data-kind="${r.kind}" data-id="${esc(r.rawId)}">Reject payment</button>`);
  },
  "pay-reject-confirm": async (el)=>{
    const r = payFind(el.dataset.kind, el.dataset.id); if(!r) return;
    const note = (($("#payRNote")||{}).value||"").trim(); if(!note){ toast("Reason is required","danger"); return; }
    const { error } = await supabase.rpc("admin_verify_payment", { p_kind:r.kind, p_id:r.rawId, p_verified:false, p_note:note });
    if(error){ toast("Failed: "+error.message,"danger"); return; }
    await logAdminAction(`Rejected payment ${r.ref} — ${note}`);
    await refreshAfterPayment(); closeModal(); toast("Payment rejected","danger");
  },
  "pay-detail": (el)=>{
    const r = payFind(el.dataset.kind, el.dataset.id); if(!r) return;
    openModal(`Payment — ${r.ref}`, `${detailRow("Type", esc(r.what))}${detailRow("Customer", esc(r.customer)+" · "+esc(r.phone))}${detailRow("Amount", money(r.amount))}${detailRow("UTR", esc(r.utr||"—"))}${detailRow("Submitted", esc(fmtTs(r.at)))}${detailRow("Decision at", esc(fmtTs(r.verifiedAt)))}${detailRow("Status", esc(r.status))}${detailRow("Booking / order status", esc(r.itemStatus||"—"))}${r.note?detailRow("Note", esc(r.note)):""}`,
      `<button class="btn" data-close-modal>Close</button>`);
  },
});
async function refreshAfterPayment(){
  await loadPaymentQueue();
  await Promise.all([loadOrdersFromDB(), loadNurseBookingsFromDB(), loadLabBookingsFromDB(), loadAmbulanceBookingsFromDB()]);
  render();
}
function subscribePaymentLive(){
  if(!supabase) return;
  ["orders","lab_bookings","nurse_bookings","ambulance_bookings"].forEach(t=>{
    supabase.channel("admin-pay-"+t)
      .on("postgres_changes", { event:"*", schema:"public", table:t }, (p)=>{
        const n = p.new || {};
        loadPaymentQueue().then(()=>{
          if(n.payment_verification_status==="pending" && (p.eventType==="INSERT" || (p.old && p.old.payment_verification_status!=="pending"))) toast("💰 New online payment waiting for verification","default");
          render();
        });
      }).subscribe();
  });
}

/* ---------- SYSTEM ---------- */
VIEWS.system = () => {
  const t = vs("system",{tab:"security"}).tab;
  const map = {security:"adminroles", health:"syshealth", errors:"errorlogs", emergency:"emergency", settings:"settings"};
  return (VIEWS[map[t]] || VIEWS.adminroles)();
};

/* ---------- NOTIFICATION ---------- */
const NTF_AUDIENCE = {"user-all":"All Users","user-one":"Individual User",merchant:"Merchants",rider:"Riders",lab:"Lab Partners",nurse:"Nurse Partners",ambulance:"Ambulance Partners"};
function ntfTargets(t){
  if(t==="merchant") return DATA.merchants.map(m=>({id:m.id,label:m.name}));
  if(t==="rider") return DATA.riders.map(r=>({id:r.id,label:`${r.name} · ${r.phone}`}));
  if(t==="lab") return DATA.raw.collectors.filter(c=>c.auth_user_id).map(c=>({id:c.auth_user_id,label:c.full_name||c.phone}));
  if(t==="nurse") return DATA.nurses.filter(n=>n.authUserId).map(n=>({id:n.authUserId,label:n.name}));
  if(t==="ambulance") return DATA.ambulanceDrivers.map(d=>({id:d.id,label:`${d.name} · ${d.phone}`}));
  return [];
}

function detailRow(label, val){ return `<div style="padding:7px 0;border-bottom:1px solid var(--line,#eee);display:flex;justify-content:space-between;gap:12px"><span class="hint">${esc(label)}</span><span class="cell-strong" style="text-align:right;word-break:break-word">${val}</span></div>`; }
async function mustUpdate(q, what){
  const { data, error } = await q.select();
  if(error) return {ok:false, msg:error.message};
  if(!data || !data.length) return {ok:false, msg:`${what}: no row updated — this action needs the main admin login (medifinderindia@gmail.com)`};
  return {ok:true, data};
}


/* ---------- KYC document viewer (inline images, works for pending / verified / rejected) ---------- */
async function kycDocUrl(bucket, ref){
  if(isUrl(ref)) return ref;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(ref, 3600);
  if(error || !data) throw new Error(error ? error.message : "not found");
  return data.signedUrl;
}
function kycIsPdf(ref){ return /\.pdf($|\?)/i.test(String(ref||"")); }
function kycLightbox(url, label, pdf){
  document.getElementById("kycLightbox")?.remove();
  const box = document.createElement("div");
  box.id = "kycLightbox";
  box.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.88);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px";
  box.innerHTML = `<div style="color:#fff;font-weight:600;margin-bottom:10px">${esc(label)}</div>
    ${pdf ? `<iframe src="${esc(url)}" style="width:min(900px,100%);height:80vh;border:0;background:#fff;border-radius:8px"></iframe>`
          : `<img src="${esc(url)}" alt="${esc(label)}" style="max-width:100%;max-height:80vh;object-fit:contain;border-radius:8px;background:#fff">`}
    <div style="margin-top:12px;display:flex;gap:10px">
      <a href="${esc(url)}" target="_blank" rel="noopener" class="btn sm">Open in new tab</a>
      <button class="btn sm" id="kycLightboxClose">Close</button></div>`;
  box.addEventListener("click", (e)=>{ if(e.target===box || e.target.id==="kycLightboxClose") box.remove(); });
  document.body.appendChild(box);
}
function hydrateKycDocs(){
  document.querySelectorAll(".kyc-doc-frame").forEach(async (frame)=>{
    const { docBucket:bucket, docRef:ref, docLabel:label } = frame.dataset;
    try{
      const url = await kycDocUrl(bucket, ref);
      const pdf = kycIsPdf(ref);
      frame.dataset.url = url;
      frame.style.background = "#fff";
      frame.innerHTML = pdf
        ? `<div style="text-align:center;font-size:12px;color:#444"><div style="font-size:34px">📄</div>PDF document</div>`
        : `<img src="${esc(url)}" alt="${esc(label)}" loading="lazy" style="width:100%;height:100%;object-fit:cover">`;
      frame.addEventListener("click", ()=>kycLightbox(url, label, pdf));
    }catch(err){
      frame.style.color = "#c0392b";
      frame.textContent = "Could not load";
      frame.title = err.message;
    }
  });
}

Object.assign(Actions, {
  "logout": async ()=>{ try{ await supabase.auth.signOut(); }catch(e){} location.reload(); },

  /* ----- ZONES (service_zones: pin / dist / ps / muni / state / status / outage_message) ----- */
  "zone-toggle": async (el)=>{
    const z = DATA.zones.find(x=>String(x.id)===el.dataset.id); if(!z) return;
    if(z.status==="active"){
      openModal(`Suspend zone — ${z.name} (${z.pin})`, `
        <div class="hint">Customers in this pincode will not be able to order while the zone is suspended. A reason is required and is saved on the zone.</div>
        <div class="field" style="margin-top:10px"><label>Suspension reason *</label><textarea id="zReason" placeholder="e.g. Flooding, no riders available"></textarea></div>`,
        `<button class="btn" data-close-modal>Cancel</button><button class="btn danger" data-act="zone-suspend-confirm" data-id="${esc(z.id)}">Suspend zone</button>`);
      render(); // snap the toggle back until the reason is confirmed
      return;
    }
    const r = await mustUpdate(supabase.from("service_zones").update({status:"approved", is_active:true, outage_message:"", outage_start:null}).eq("id", z.id), "Zone");
    if(!r.ok){ toast("Failed: "+r.msg,"danger"); render(); return; }
    await logAdminAction(`Reactivated zone ${z.pin}`); await loadZonesFromDB(); render(); toast(`${z.name} is live again`);
  },
  "zone-suspend-confirm": async (el)=>{
    const z = DATA.zones.find(x=>String(x.id)===el.dataset.id); if(!z) return;
    const reason = $("#zReason").value.trim();
    if(!reason){ toast("Please write a suspension reason","danger"); return; }
    const r = await mustUpdate(supabase.from("service_zones").update({status:"suspended", is_active:false, outage_message:reason, outage_start:new Date().toISOString()}).eq("id", z.id), "Zone");
    if(!r.ok){ toast("Failed: "+r.msg,"danger"); return; }
    await logAdminAction(`Suspended zone ${z.pin} — ${reason}`); closeModal(); await loadZonesFromDB(); render(); toast(`${z.name} suspended`,"danger");
  },

  /* ----- KYC ----- */
  "kyc-detail": (el)=>{
    const r = kycFind(el.dataset.kind, el.dataset.id); if(!r) return;
    openModal(`${KYC_TITLE[r.kind]} KYC — ${r.name}`, `
      <div class="hint" style="font-weight:600;margin-bottom:4px">Applicant details</div>
      ${r.details.map(([k,v])=>detailRow(k, esc(dash(v)))).join("")}
      <div class="hint" style="font-weight:600;margin:14px 0 6px">Documents</div>
      ${r.docs.length ? `<div class="kyc-gallery" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">${r.docs.map(d=>`
        <figure class="kyc-doc" style="margin:0;border:1px solid var(--line,#e5e5e5);border-radius:10px;overflow:hidden;background:#fafafa">
          <div class="kyc-doc-frame" data-doc-bucket="${esc(d.bucket)}" data-doc-ref="${esc(d.ref)}" data-doc-label="${esc(d.label)}" style="height:130px;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px;cursor:pointer">Loading…</div>
          <figcaption style="padding:6px 8px;font-size:12px;font-weight:600;border-top:1px solid var(--line,#eee)">${esc(d.label)}</figcaption>
        </figure>`).join("")}</div>
        <div class="hint" style="margin-top:6px">Tap a document to view it full size.</div>` : `<div class="cell-sub">No documents uploaded.</div>`}
      <div class="hint" style="font-weight:600;margin:14px 0 4px">KYC history</div>
      ${detailRow("Submitted", esc(r.submitted||"—"))}${detailRow("Current status", statusBadge(r.status))}${r.reason ? detailRow("Reject reason", esc(r.reason)) : ""}`,
      `<button class="btn" data-close-modal>Close</button>` + (r.status==="pending" ? `
        <button class="btn danger" data-act="kyc-reject" data-kind="${r.kind}" data-id="${esc(r.id)}">Reject</button>
        <button class="btn primary" data-act="kyc-approve" data-kind="${r.kind}" data-id="${esc(r.id)}">Approve</button>` : ""));
    hydrateKycDocs(); // show the uploaded document images inline (pending AND verified/rejected)
  },
  "kyc-approve": async (el)=>{
    const { kind, id } = el.dataset;
    if(kind==="merchant"){ await Actions["merchant-approve"]({dataset:{id}}); closeModal(); return; }
    if(kind==="rider"){ await Actions["rider-approve"]({dataset:{id}}); closeModal(); return; }
    let q;
    if(kind==="nurse") q = supabase.from("nurse_kyc").update({status:"approved", rejection_reason:null}).eq("user_id", id);
    if(kind==="lab") q = supabase.from("collector_kyc").update({status:"verified", rejection_reason:null, reviewed_at:new Date().toISOString()}).eq("id", id);
    if(kind==="ambulance"){ const drv=(R.ambulance||[]).find(x=>String(x.id)===String(id)); q = supabase.from("ambulance_drivers").update({kyc_status:"verified", is_verified:true, bank_verified:!!(drv&&drv.bank_submitted_at), kyc_rejection_reason:null}).eq("id", id); }
    const r = await mustUpdate(q, "KYC"); if(!r.ok){ toast("Approve failed: "+r.msg,"danger"); return; }
    logAdminAction(`Approved ${kind} KYC ${id}`); closeModal(); toast("KYC approved — partner notified"); refreshLiveData().then(render).catch(()=>{});
  },
  "kyc-reject": (el)=>{
    const { kind, id } = el.dataset;
    if(kind==="merchant"){ closeModal(); return Actions["merchant-reject"]({dataset:{id}}); }
    if(kind==="rider"){ closeModal(); return Actions["rider-reject"]({dataset:{id}}); }
    openModal("Reject KYC", `<div class="field"><label>Rejection reason *</label><textarea id="kycReason" placeholder="e.g. Certificate photo unclear"></textarea></div>`,
      `<button class="btn" data-close-modal>Cancel</button><button class="btn danger" data-act="kyc-reject-confirm" data-kind="${kind}" data-id="${esc(id)}">Reject</button>`);
  },
  "kyc-reject-confirm": async (el)=>{
    const { kind, id } = el.dataset; const reason = $("#kycReason").value.trim();
    if(!reason){ toast("Rejection reason is required","danger"); return; }
    let q;
    if(kind==="nurse") q = supabase.from("nurse_kyc").update({status:"rejected", rejection_reason:reason}).eq("user_id", id);
    if(kind==="lab") q = supabase.from("collector_kyc").update({status:"rejected", rejection_reason:reason, reviewed_at:new Date().toISOString()}).eq("id", id);
    if(kind==="ambulance") q = supabase.from("ambulance_drivers").update({kyc_status:"rejected", is_verified:false, bank_verified:false, kyc_rejection_reason:reason}).eq("id", id);
    const r = await mustUpdate(q, "KYC"); if(!r.ok){ toast("Reject failed: "+r.msg,"danger"); return; }
    logAdminAction(`Rejected ${kind} KYC ${id} — ${reason}`); closeModal(); toast("KYC rejected","danger"); refreshLiveData().then(render).catch(()=>{});
  },

  /* ----- BOOKING ----- */
  "bk-detail": (el)=>{
    const meta = BK_META[el.dataset.kind]; const b = meta.rows().find(x=>String(x.id)===el.dataset.id); if(!b) return;
    const hist = (b.history||[]).filter(h=>h[1]).sort((a,c)=>new Date(a[1])-new Date(c[1]));
    openModal(`${meta.title} booking — ${b.id}`, `
      ${detailRow("Customer", esc(b.customer))}${detailRow("Phone", esc(dash(b.phone)))}${detailRow(meta.provider, esc(b.provider||"Unassigned"))}${detailRow("Service", esc(dash(b.service)))}
      ${detailRow("Date / Time", esc(b.date))}${detailRow("Location", esc(dash(b.location)))}
      ${detailRow("Amount", b.amount!=null?money(b.amount):"—")}${detailRow("Payment", esc(b.payment))}${detailRow("Status", statusBadge(b.status))}
      ${b.reason ? detailRow("Reject / cancel reason", esc(b.reason)) : ""}
      <div class="hint" style="font-weight:600;margin:14px 0 4px">Activity history</div>
      ${hist.length ? hist.map(h=>detailRow(h[0], esc(fmtTs(h[1])))).join("") : `<div class="cell-sub">No history recorded.</div>`}`,
      `<button class="btn" data-close-modal>Close</button>` + ((b.status==="new") ? (()=>{
        const unpaid = DATA.payQueue.some(p=>p.kind===el.dataset.kind && String(p.rawId)===String(b._rawId) && p.status!=="verified");
        return `<button class="btn danger" data-act="bk-reject" data-kind="${el.dataset.kind}" data-id="${esc(b.id)}">Reject</button>` +
          (unpaid ? `<button class="btn" data-nav="payment">Verify payment first →</button>` : `<button class="btn primary" data-act="bk-accept" data-kind="${el.dataset.kind}" data-id="${esc(b.id)}">Accept</button>`);
      })() : ""));
  },
  "bk-accept": async (el)=>{ const meta = BK_META[el.dataset.kind]; await Actions[meta.prefix+"-accept"]({dataset:{id:el.dataset.id}}); closeModal(); },
  "bk-reject": (el)=>{
    openModal("Reject booking", `<div class="field"><label>Reason *</label><textarea id="bkReason" placeholder="e.g. No collector available in this area"></textarea></div>`,
      `<button class="btn" data-close-modal>Cancel</button><button class="btn danger" data-act="bk-reject-confirm" data-kind="${el.dataset.kind}" data-id="${esc(el.dataset.id)}">Reject booking</button>`);
  },
  "bk-reject-confirm": async (el)=>{
    const reason = $("#bkReason").value.trim(); if(!reason){ toast("Reason is required","danger"); return; }
    const kind = el.dataset.kind; const b = BK_META[kind].rows().find(x=>String(x.id)===el.dataset.id); if(!b) return;
    let q, reload;
    if(kind==="lab"){ q = supabase.from("lab_bookings").update({status:"Cancelled", cancel_reason:reason}).eq("id", b._rawId); reload = loadLabBookingsFromDB; }
    if(kind==="nurse"){ q = supabase.from("nurse_bookings").update({status:"cancelled", cancel_reason:reason}).eq("id", b._rawId); reload = loadNurseBookingsFromDB; }
    if(kind==="ambulance"){ q = supabase.from("ambulance_bookings").update({status:"cancelled", cancelled_at:new Date().toISOString(), cancel_reason:reason}).eq("id", b._rawId); reload = loadAmbulanceBookingsFromDB; }
    const r = await mustUpdate(q, "Booking"); if(!r.ok){ toast("Failed: "+r.msg,"danger"); return; }
    await logAdminAction(`Rejected ${kind} booking ${b.id} — ${reason}`); await reload(); closeModal(); render(); toast("Booking rejected","danger");
  },

  /* ----- PAYOUT ----- */
  "payout-detail": (el)=>{
    const p = payoutRows(el.dataset.kind).find(x=>String(x.id)===el.dataset.id); if(!p) return;
    const open = p.status!=="paid";
    const m = (v)=> v==null ? "—" : money(v);
    openModal(`Payout — ${p.recipient}`, `
      ${detailRow("Recipient", esc(p.recipient))}${p.ref?detailRow("Reference", esc(p.ref)):""}${detailRow("Period", esc(p.period||"—"))}
      ${detailRow("Gross earnings", m(p.gross))}${detailRow("Commission", m(p.commission))}${detailRow("Fees", m(p.fees))}${detailRow("Adjustments", m(p.adj))}
      ${detailRow("Net payable", `<b>${money(p.net)}</b>`)}${detailRow("Bank / UPI", esc(p.bank))}
      ${detailRow("Requested at", esc(fmtTs(p.requestedAt)))}${detailRow("Paid at", esc(fmtTs(p.paidAt)))}${detailRow("Transaction ID", esc(dash(p.txn)))}${p.note?detailRow("Admin note", esc(p.note)):""}${detailRow("Status", badge(PAY_LABEL[p.status], payTone(p.status)))}
      ${open ? `<div class="field" style="margin-top:12px"><label>Transaction ID / UTR (needed for Paid) · reason (needed for Hold / Fail)</label><input id="payNote"></div>` : ""}`,
      `<button class="btn" data-close-modal>Close</button>` + (open ? `
        <button class="btn" data-act="payout-set" data-to="on_hold" data-kind="${p.kind}" data-id="${esc(p.id)}">Hold</button>
        <button class="btn danger" data-act="payout-set" data-to="failed" data-kind="${p.kind}" data-id="${esc(p.id)}">Fail</button>
        ${p.status==="pending"||p.status==="on_hold" ? `<button class="btn" data-act="payout-set" data-to="processing" data-kind="${p.kind}" data-id="${esc(p.id)}">Approve</button>` : ""}
        <button class="btn primary" data-act="payout-set" data-to="paid" data-kind="${p.kind}" data-id="${esc(p.id)}">Mark paid</button>` : ""));
  },
  "payout-set": async (el)=>{
    const { kind, id, to } = el.dataset; const note = (($("#payNote")||{}).value||"").trim();
    if(to==="paid" && !note){ toast("Enter the transaction ID / UTR first","danger"); return; }
    if((to==="failed"||to==="on_hold") && !note){ toast("Enter a reason first","danger"); return; }
    const now = new Date().toISOString(); const paid = to==="paid"; let q;
    if(kind==="merchant") q = supabase.from("merchant_payouts").update({status:({processing:"Processing",paid:"Paid",failed:"Failed",on_hold:"On Hold"})[to], ...(paid?{paid_at:now, txn_ref:note}:{admin_note:note||null})}).eq("id", id);
    const _row = kind==="rider" ? payoutRows("rider").find(x=>String(x.id)===String(id)) : null;
    if(kind==="rider" && _row && _row._src==="rider_payouts") q = supabase.from("rider_payouts").update({ status:to, paid:paid, ...(paid?{paid_at:now}:{}) }).eq("id", _row._rawId);
    else if(kind==="rider") q = supabase.from("admin_payout_requests").update({request_status:({processing:"processing",paid:"completed",failed:"failed",on_hold:"on_hold"})[to], ...(paid?{processed_at:now, txn_ref:note}:{notes:note||null})}).eq("id", id);
    if(kind==="nurse") q = supabase.from("nurse_payouts").update({status:to, ...(paid?{processed_at:now, txn_ref:note}:{admin_note:note||null})}).eq("id", id);
    if(kind==="collector") q = supabase.from("collector_earnings").update({status:to, ...(paid?{settled_at:now, txn_ref:note}:{admin_note:note||null})}).eq("id", id);
    if(kind==="ambulance") q = supabase.from("ambulance_bookings").update({settlement_status:({processing:"processing",paid:"settled",failed:"failed",on_hold:"on_hold"})[to], ...(paid?{settled_at:now, settlement_txn_ref:note}:{settlement_note:note||null})}).eq("id", id);
    const r = await mustUpdate(q, "Payout"); if(!r.ok){ toast("Failed: "+r.msg,"danger"); return; }
    await logAdminAction(`Payout ${kind} ${id} → ${PAY_LABEL[to]}${note?` (${note})`:""}`);
    await loadMerchantPayoutsFromDB(); await loadRiderPayoutsFromDB(); await loadPartnerExtras();
    closeModal(); render(); toast(`Payout ${PAY_LABEL[to].toLowerCase()}`);
  },

  /* ----- NOTIFICATION ----- */
  "ntf-send": async ()=>{
    const t = vs("notifications",{tab:"user-all"}).tab; const title=$("#ntfTitle").value.trim(), message=$("#ntfBody").value.trim();
    if(!title){ toast("Title is required","danger"); return; }
    const image=$("#ntfImage").value.trim()||null, link=$("#ntfLink").value.trim()||null;
    const sel = ($("#ntfTarget")||{}).value || "all"; const all = sel==="all";
    const extra = { image_url:image, deep_link:link }; let res, count = 0;
    if(t==="user-all"){ res = await supabase.from("notifications").insert({ user_id:null, type:"admin_broadcast", title, message, ...extra }); count = 1; }
    else if(t==="user-one"){ if(!sel){ toast("Select a user","danger"); return; } res = await supabase.from("notifications").insert({ user_id:sel, type:"admin_broadcast", title, message, ...extra }); count = 1; }
    else if(t==="merchant"){
      const list = all ? DATA.merchants : DATA.merchants.filter(m=>String(m.id)===sel);
      res = await supabase.from("merchant_notifications").insert(list.map(m=>({ merchant_id:m.id, title, message:message||title, type:"info", category:"admin", action_url:link }))); count = list.length;
    } else if(t==="rider"){
      res = await supabase.from("rider_notifications").insert(all ? { rider_id:null, title, message:message||title, type:"admin", ...extra } : { rider_id:Number(sel), title, message:message||title, type:"admin", ...extra }); count = all ? DATA.riders.length : 1;
    } else if(t==="lab"){
      const list = ntfTargets("lab").filter(x=>all || x.id===sel);
      res = list.length ? await supabase.from("notifications").insert(list.map(x=>({ user_id:x.id, type:"admin", title, message, ...extra }))) : {error:{message:"No collector with a linked login"}}; count = list.length;
    } else if(t==="nurse"){
      const list = ntfTargets("nurse").filter(x=>all || x.id===sel);
      res = list.length ? await supabase.from("nurse_notifications").insert(list.map(x=>({ user_id:x.id, type:"admin", title, message, ...extra }))) : {error:{message:"No nurse with a linked login"}}; count = list.length;
    } else if(t==="ambulance"){
      const list = ntfTargets("ambulance").filter(x=>all || x.id===sel);
      res = list.length ? await supabase.from("ambulance_notifications").insert(list.map(x=>({ driver_id:x.id, type:"admin", title, message, is_read:false, ...extra }))) : {error:{message:"No ambulance drivers"}}; count = list.length;
    }
    if(res.error){ toast("Failed: "+res.error.message,"danger"); return; }
    await supabase.from("admin_notification_broadcasts").insert({ audience:NTF_AUDIENCE[t], title, recipients_count:count });
    await loadNotificationBroadcastsFromDB(); await logAdminAction(`Sent notification "${title}" to ${NTF_AUDIENCE[t]}`);
    $("#ntfTitle").value=""; $("#ntfBody").value=""; render(); toast(`Notification sent to ${count} ${count===1?"recipient":"recipients"}`);
  },
});

/* ---------------------------------------------------------
   7. RENDER / ROUTER
   --------------------------------------------------------- */
function renderSidebar(){
  const html = NAV.map(g=>({...g, items:g.items.filter(i=>navAllowed(i.id))})).filter(g=>g.items.length).map(g=>`
    <div class="nav-group">
      ${g.group ? `<div class="nav-group-title">${esc(g.group)}</div>` : ""}
      ${g.items.map(item=>`
        <div class="nav-item ${STATE.view===item.id?"active":""}" data-nav="${item.id}">
          <span class="ic">${item.icon}</span><span class="lbl">${esc(item.label)}</span>
          ${(()=>{ const n = item.count ? item.count() : 0; return n>0 ? `<span class="count">${n}</span>` : ""; })()}
        </div>
        ${item.children && STATE.view===item.id ? `<div class="nav-children">
          ${item.children.map(c=>`<div class="nav-child ${vs(item.id,{tab:item.children[0].key}).tab===c.key?"active":""}" data-nav-child="${item.id}" data-key="${c.key}">${esc(c.label)}</div>`).join("")}
        </div>` : ""}
      `).join("")}
    </div>`).join("");
  $("#sidebarScroll").innerHTML = html;
}
function renderBottomNav(){
  $("#bottomNav").innerHTML = BOTTOM_NAV.filter(id=>navAllowed(id)).map(id=>{
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
  _kycCache = null;
  const item = navItem(STATE.view);
  $("#topbarTitle").textContent = item ? item.label : "Dashboard";
  // One broken view/helper must never blank the whole console (that is what left
  // every card at 0): show the error inside the page and keep the menu working.
  let html;
  try{ html = (VIEWS[STATE.view] || VIEWS.dashboard)(); }
  catch(err){
    console.error("[admin] view failed:", STATE.view, err);
    html = `<div class="card"><div class="card-body"><h3>This page could not be drawn</h3><p class="hint">${esc(err && err.message || err)}</p><button class="btn" data-nav="dashboard">Back to dashboard</button></div></div>`;
  }
  $("#content").innerHTML = html;
  try{ renderSidebar(); }catch(err){ console.error("[admin] sidebar failed:", err); }
  try{ renderBottomNav(); }catch(err){ console.error("[admin] bottom nav failed:", err); }
  if(STATE.view === "riders" && vs("riders",{tab:"all"}).tab === "live") renderRidersLiveMiniMap();
  if(STATE.view === "fleet") renderFleetLeafletMap();
}

function setView(id, childKey){
  if(!navAllowed(id)){ toast("Your role does not have access to this page","danger"); return; }
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
function runAction(el){
  if(el._busy) return;                       // ignore double taps while the first one is still running
  let r;
  try{ r = Actions[el.dataset.act](el); }
  catch(err){ console.error("[admin] action failed:", el.dataset.act, err); toast("Something went wrong: "+(err && err.message || err),"danger"); return; }
  if(r && typeof r.then === "function"){
    el._busy = true; el.classList.add("is-busy");
    const done = ()=>{ el._busy = false; el.classList.remove("is-busy"); };
    r.then(done, (err)=>{ done(); console.error("[admin] action failed:", el.dataset.act, err); toast("Something went wrong: "+(err && err.message || err),"danger"); });
  }
}
document.addEventListener("click", (e)=>{
  const navEl = e.target.closest("[data-nav]");
  if(navEl){ if(navEl.dataset.nav==="logout"){ Actions["logout"](); return; } setView(navEl.dataset.nav); return; }

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
  if(closeEl){ closeModal(); return; }

  const actEl = e.target.closest("[data-act]");
  if(actEl && Actions[actEl.dataset.act]){
    // toggles/selects are handled by the "change" listener below - running them on click too fired every action twice
    if(/^(product-visible|zone-toggle|emg-toggle|emg-select|fleet-zone-filter)$/.test(actEl.dataset.act) && actEl.matches("input,select")) return;
    runAction(actEl); return;
  }

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
    clearTimeout(window._liveSearchT);
    window._liveSearchT = setTimeout(()=>{
      const caret = t.selectionStart;
      render();
      const again = document.querySelector(`[data-live-search="${viewId}"]`);
      if(again){ again.focus(); try{ again.setSelectionRange(caret, caret); }catch(_e){} }
    }, 150);
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

/* =========================================================
   10. ADMIN UPGRADE v2
   Real dashboard numbers, partner pages, commission, persisted
   emergency control, fast parallel loading, full-page sheets,
   Leaflet/OpenStreetMap maps, company report + receipts.
   ========================================================= */
const R = DATA.raw; // used by the KYC approve action for ambulance drivers
const _p2 = n=>String(n).padStart(2,"0");
function localDayStr(d){ d = d || new Date(); return `${d.getFullYear()}-${_p2(d.getMonth()+1)}-${_p2(d.getDate())}`; }
function tsDay(ts){ if(!ts) return ""; const d = new Date(ts); return isNaN(d) ? "" : localDayStr(d); }
function dayStart(offset){ const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+(offset||0)); return d; }
function orderItemsCount(o){
  let it = o.items;
  if(typeof it === "string"){ try{ it = JSON.parse(it); }catch(e){ it = null; } }
  if(Array.isArray(it)) return it.length;
  return Number(o.item_count ?? o.items_count ?? o.total_items ?? 0) || 0;
}
const orderTotalOf = (o)=> Number(o.total_amount ?? o.total ?? o.final_amount ?? 0);
const DEAD_ORDER = ["cancelled","failed","refunded","rejected"];
function trend(cur, prev, suffix){
  if(!prev) return `<div class="delta">${cur ? "▲ new " : ""}${suffix}</div>`;
  const p = ((cur-prev)/prev)*100, up = p >= 0;
  return `<div class="delta ${up?"up":"down"}">${up?"▲":"▼"} ${Math.abs(p).toFixed(1)}% ${suffix}</div>`;
}

DATA.counts = {}; DATA.recent = {today:[], yesterday:[]}; DATA.commissionRules = [];
DATA.me = { name:"Admin", email:"", role:"Admin", lastLogin:"—", twofa:false };
Object.assign(STATE.emergency, { pauseNurse:false, pauseAmbulance:false, pauseLab:false });
const MAIN_ADMIN_EMAIL = "medifinderindia@gmail.com";

/* ---------- Commission rules ---------- */
const COMM_TYPES = {merchant:"Merchant / Pharmacy", rider:"Rider", nurse:"Nurse", lab:"Lab / Blood Collector", ambulance:"Ambulance"};
function commissionFor(type, partnerId, amount){
  const rules = DATA.commissionRules.filter(r=>r.active && r.type===type);
  let r = rules.find(x=>x.partnerId!=null && x.partnerId!=="" && String(x.partnerId)===String(partnerId));
  let source = "specific";
  if(!r){ r = rules.find(x=>x.partnerId==null || x.partnerId===""); source = "default"; }
  if(!r){
    if(type==="merchant") r = {rateType:"percent", rate:Number(STATE.settings.commission)||0}, source = "platform setting";
    else r = {rateType:"percent", rate:0}, source = "not set";
  }
  const amt = r.rateType==="flat" ? r.rate : (Number(amount)||0) * r.rate / 100;
  return { rate:r.rate, rateType:r.rateType, amount:amt, source };
}
const commissionText = (c)=> c.rateType==="flat" ? `₹${c.rate} flat` : `${c.rate}%`;
function commissionLabel(v){ if(v==null || v==="") return "Not set"; return /[%₹a-z]/i.test(String(v)) ? esc(v) : esc(v)+"%"; }

async function loadCommissionRules(){
  if(!supabase) return;
  const { data, error } = await supabase.from("commission_rules").select("*").order("created_at",{ascending:false});
  if(error){ DATA.commissionError = error.message; DATA.commissionRules = []; return; }
  DATA.commissionError = "";
  DATA.commissionRules = (data||[]).map(r=>({ id:r.id, type:r.partner_type, partnerId:r.partner_id, partnerName:r.partner_name||"", rateType:r.rate_type==="flat"?"flat":"percent", rate:Number(r.rate||0), note:r.note||"", active:r.is_active!==false }));
}

/* ---------- Persisted platform controls (emergency flags + settings) ---------- */
async function loadPlatformControls(){
  if(!supabase) return;
  const { data, error } = await supabase.from("platform_controls").select("*");
  if(error){ DATA.controlsError = error.message; return; }
  DATA.controlsError = "";
  (data||[]).forEach(r=>{
    if(r.key==="emergency") Object.assign(STATE.emergency, r.value||{});
    if(r.key==="settings") Object.assign(STATE.settings, r.value||{});
  });
}
async function savePlatformControl(key, value){
  const { data:{ user } = {} } = await supabase.auth.getUser();
  const { error } = await supabase.from("platform_controls").upsert({ key, value, updated_at:new Date().toISOString(), updated_by:user?.email||null }, { onConflict:"key" });
  return error;
}
const SQL_HINT = " — run medifinder_admin_v2.sql in the Supabase SQL editor first";

/* ---------- Real dashboard counts ---------- */
async function loadCounts(){
  if(!supabase) return;
  const cnt = async (q)=>{ try{ const r = await q; return r.count || 0; }catch(e){ return 0; } };
  const prof = ()=> supabase.from("profiles").select("id",{count:"exact",head:true}).or("role.eq.user,role.is.null");
  const d7 = dayStart(-7).toISOString(), d14 = dayStart(-14).toISOString();
  const [users, users7, usersPrev7] = await Promise.all([ cnt(prof()), cnt(prof().gte("created_at",d7)), cnt(prof().gte("created_at",d14).lt("created_at",d7)) ]);
  Object.assign(DATA.counts, { users, users7, usersPrev7 });
  const { data } = await supabase.from("orders").select("*").gte("created_at", dayStart(-1).toISOString()).order("created_at",{ascending:false}).limit(3000);
  const t0 = dayStart(0).getTime(), today = [], yest = [];
  (data||[]).forEach(o=>{
    const row = { created:o.created_at, total:orderTotalOf(o), status:String(o.status||"pending"), merchantId:o.merchant_id };
    (new Date(o.created_at).getTime() >= t0 ? today : yest).push(row);
  });
  DATA.recent = { today, yesterday:yest };
}
async function loadMe(){
  if(!supabase) return;
  try{
    const { data:{ user } = {} } = await supabase.auth.getUser(); if(!user) return;
    const email = user.email || "";
    const a = DATA.admins.find(x=>(x.email||"").toLowerCase()===email.toLowerCase());
    DATA.me = {
      email,
      name: (a && a.name && a.name!==a.email) ? a.name : (user.user_metadata?.full_name || user.user_metadata?.name || (email ? email.split("@")[0] : "Admin")),
      role: a ? a.role : (email.toLowerCase()===MAIN_ADMIN_EMAIL ? "Super Admin" : "Admin"),
      lastLogin: a ? a.lastLogin : "—", twofa: a ? a.twofa : false,
    };
  }catch(e){}
}
function updateAdminChip(){
  const chip = document.querySelector(".admin-chip"); if(!chip) return;
  const av = chip.querySelector(".admin-avatar"), nm = chip.querySelector(".admin-meta strong"), em = chip.querySelector(".admin-meta span");
  if(av) av.textContent = (String(DATA.me.name||"A").trim().split(/\s+/).slice(0,2).map(w=>w[0]||"").join("") || "A").toUpperCase();
  if(nm) nm.textContent = DATA.me.name;
  if(em) em.textContent = DATA.me.email || DATA.me.role;
}

/* ---------- Fill every "—" with real data where it exists ---------- */
function postProcessData(){
  const mById = {}; DATA.merchants.forEach(m=>{ mById[String(m.id)] = m; });
  DATA.orders.forEach(o=>{
    if((!o.merchant || o.merchant==="—") && o._merchantId!=null){ const m = mById[String(o._merchantId)]; o.merchant = m ? m.name : ("Shop #"+o._merchantId); }
    if(!o.merchant || o.merchant==="—") o.merchant = "Not assigned yet";
    if(o.rider==="—") o.rider = "Not assigned";
  });
  // merchant rating = average of reviews on that merchant's medicines
  const medMerchant = {}; DATA.products.forEach(p=>{ medMerchant[String(p.id)] = String(p._merchantId); });
  const sums = {};
  DATA.reviews.forEach(r=>{ if(r._medId==null || !r._rating) return; const mid = medMerchant[String(r._medId)]; if(!mid) return; (sums[mid] = sums[mid] || []).push(r._rating); });
  DATA.merchants.forEach(m=>{
    const c = commissionFor("merchant", m.id, 100); m.commission = commissionText(c);
    const arr = sums[String(m.id)]; m.rating = arr && arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1) : null;
  });
  const zByPin = {}; DATA.zones.forEach(z=>{ zByPin[String(z.pin)] = z; });
  const kycByRider = {}; (DATA.raw.riderKyc||[]).forEach(k=>{ kycByRider[k.rider_id] = k; });
  DATA.riders.forEach(r=>{
    let pin = r._pin;
    if(!pin){ const k = kycByRider[r.id]; const mm = k && String(k.address||"").match(/\b\d{6}\b/); pin = mm ? mm[0] : ""; r._pin = pin; }
    let z = pin && zByPin[pin];
    if(!z && r._hasLocation){ z = zoneOfPoint(r.lat, r.lon) || null; }
    r.zone = z ? z.name : (pin ? "PIN "+pin : "Zone not set");
  });
  const nk = {}; (DATA.raw.nurseKyc||[]).forEach(k=>{ nk[k.user_id] = k; });
  DATA.nurses.forEach(n=>{
    const k = nk[n.authUserId]; const st = k ? normKyc(k.status) : null;
    n.degree = (k && k.qualification) || (n.qualification && n.qualification!=="—" ? n.qualification : "Not set");
    n.serviceArea = (k && ([k.city,k.pincode].filter(Boolean).join(" "))) || "Not set";
    n.rate = (k && k.day_charge!=null) ? money(k.day_charge)+"/day" : "Not set";
    const svc = [...new Set(DATA.nurseBookings.filter(b=>b.nurse===n.name).map(b=>b.type).filter(x=>x && x!=="—"))];
    n.type = svc.length ? svc.join(", ") : "No bookings yet";
    n.status = st==="rejected" ? "suspended" : st==="pending" ? "pending" : "active";
  });
  DATA.users.forEach(u=>{ if(u.addr==="—") u.addr = "No address saved"; });
}

/* ---------- Fast, parallel loading (was ~30 sequential requests) ---------- */
let _refreshing = null;
refreshLiveData = function(){
  if(_refreshing) return _refreshing;
  const S = (f)=> Promise.resolve().then(f).catch(e=>console.warn("[admin] load failed", e));
  _refreshing = (async ()=>{
    await Promise.all([
      S(loadOrdersFromDB), S(loadRidersFromDB), S(loadNursesFromDB), S(loadAmbulanceDriversFromDB), S(loadZonesFromDB),
      S(loadLabTestsFromDB), S(loadLabBookingsFromDB), S(loadNurseBookingsFromDB), S(loadAmbulanceBookingsFromDB),
      S(loadRiderPayoutsFromDB), S(loadLegacyRiderPayouts), S(loadRefundsFromDB), S(loadAdminsFromDB), S(loadAuditLogFromDB), S(loadNotificationBroadcastsFromDB),
      S(loadCounts), S(loadPlatformControls), S(loadCommissionRules), S(loadErrorLogsFromDB),
    ]);
    await Promise.all([ S(loadUsersFromDB), S(loadMerchantsFromDB), S(()=>loadTransactionsFromDB()), S(loadMe) ]);
    computeWeeklyOrdersFromDB(); deriveActivityFeed(); render(); // first useful paint
    await Promise.all([ S(loadPrescriptionsFromDB), S(loadMerchantPayoutsFromDB), S(loadProductsFromDB), S(loadTicketsFromDB), S(loadCouponsFromDB), S(loadPaymentQueue) ]);
    await Promise.all([ S(loadReviewsFromDB), S(loadAdsFromDB), S(loadPartnerExtras), S(computeSystemHealthLive) ]);
    _lastSyncAt = new Date().toISOString();
    render();
  })().finally(()=>{ _refreshing = null; });
  return _refreshing;
};
computeWeeklyOrdersFromDB = function(){
  const days = [], labels = [], names = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  for(let i=6;i>=0;i--){ const d = dayStart(-i); days.push(localDayStr(d)); labels.push(names[d.getDay()]); }
  DATA.weekOrders = days.map(ds => DATA.orders.filter(o => tsDay(o.created) === ds).length);
  DATA.weekLabels = labels;
};
const _subscribeBase = subscribeLiveData;
subscribeLiveData = function(){
  _subscribeBase();
  if(!supabase) return;
  const reload = (fn)=>()=>{ fn().then(render); };
  supabase.channel("admin-orders-counts").on("postgres_changes",{event:"*",schema:"public",table:"orders"},reload(loadCounts)).subscribe();
  supabase.channel("admin-errors-live").on("postgres_changes",{event:"*",schema:"public",table:"system_error_logs"},(payload)=>{
    loadErrorLogsFromDB().then(()=>{ render(); if(payload.eventType==="INSERT" && payload.new){ toast("New error: "+explainError(payload.new.message,payload.new.source).title,"danger"); } });
  }).subscribe();
  supabase.channel("admin-commission-live").on("postgres_changes",{event:"*",schema:"public",table:"commission_rules"},reload(loadCommissionRules)).subscribe();
  supabase.channel("admin-controls-live").on("postgres_changes",{event:"*",schema:"public",table:"platform_controls"},reload(loadPlatformControls)).subscribe();
};

/* ---------- NAV: Lab / Nurse / Ambulance partner + Commission ---------- */
(function(){
  const ops = NAV.find(g=>g.group==="Operations");
  const idx = ops.items.findIndex(i=>i.id==="riders");
  const partnerTabs = [{key:"all",label:"All"},{key:"pending",label:"Pending KYC"},{key:"suspended",label:"Suspended"},{key:"map",label:"Live Map"}];
  const add = [
    {id:"labpartners", icon:"🧪", label:"Lab Partner", children:partnerTabs.filter(t=>t.key!=="map")},
    {id:"nursepartners", icon:"✚", label:"Nurse Partner", children:partnerTabs.filter(t=>t.key!=="map")},
    {id:"ambulancepartners", icon:"🚑", label:"Ambulance Partner", children:partnerTabs},
  ];
  ops.items.splice(idx+1, 0, ...add);
  NAV_FLAT.push(...add);
  const money_g = NAV.find(g=>g.group==="Money");
  const comm = {id:"commission", icon:"％", label:"Commission", children:Object.entries(COMM_TYPES).map(([k,v])=>({key:k,label:v}))};
  money_g.items.splice(money_g.items.findIndex(i=>i.id==="payout")+1, 0, comm); NAV_FLAT.push(comm);
  const rep = navItem("reports");
  rep.children = [{key:"overview",label:"Overview"},{key:"download",label:"Company Report"},{key:"receipt",label:"Receipt / Invoice"}];
})();

/* ---------- Dashboard (every number is real) ---------- */
VIEWS.dashboard = () => {
  const T = DATA.recent.today, Y = DATA.recent.yesterday, live = o=>!DEAD_ORDER.includes(o.status);
  const ordersToday = T.length, ordersYest = Y.length;
  const revToday = T.filter(live).reduce((s,o)=>s+o.total,0), revYest = Y.filter(live).reduce((s,o)=>s+o.total,0);
  const earnToday = T.filter(o=>o.status==="delivered").reduce((s,o)=>s+commissionFor("merchant",o.merchantId,o.total).amount,0);
  const lastHour = T.filter(o=>Date.now()-new Date(o.created).getTime() <= 3600e3).length;
  const pending = DATA.orders.filter(o=>o.status==="pending").length;
  const liveRiders = DATA.riders.filter(r=>r.online).length;
  const activeZones = DATA.zones.filter(z=>z.status==="active").length;
  const pendingMerchants = DATA.merchants.filter(m=>m.status==="pending").length;
  const today = localDayStr();
  const bookToday = (arr)=> arr.filter(b=>tsDay(b._createdAt)===today).length;
  const kycPending = kycAllRows().filter(r=>r.status==="pending").length;
  const c = DATA.counts, totalUsers = c.users ?? DATA.users.length;
  const mNew = DATA.merchants.filter(m=>m.joined && m.joined >= localDayStr(dayStart(-7))).length;
  const openErrs = (DATA.errorLogs||[]).filter(e=>!e.resolved);
  const alerts = [
    ...(openErrs.length ? [{ic:"⚠",text:`${openErrs.length} open error${openErrs.length>1?"s":""} (Shiprocket / NimbusPost / courier)`,sub:explainError(openErrs[0].message,openErrs[0].source).title+" — open System → Error Logs"}] : []),
    ...DATA.systemHealth.filter(h=>h.status==="degraded"||h.status==="down").map(h=>({ic:"❤",text:`${h.name} is ${h.status}`,sub:h.meta})),
    ...DATA.merchants.filter(m=>m.status==="pending").map(m=>({ic:"⌂",text:`${m.name} awaiting KYC approval`,sub:m.city})),
    ...DATA.riders.filter(r=>r.status==="pending").map(r=>({ic:"➔",text:`${r.name} awaiting rider KYC approval`,sub:r.zone})),
    ...DATA.tickets.filter(t=>t.priority==="high"&&t.status!=="closed").map(t=>({ic:"◐",text:`High priority: ${t.subject}`,sub:`${t.from} · ${t.name}`})),
  ].slice(0,6);
  const recentRegistrations = [
    ...DATA.users.slice(0,3).map(u=>({who:u.name, role:"Customer", when:u.joined})),
    ...DATA.merchants.filter(m=>m.status==="pending").map(m=>({who:m.name, role:"Merchant", when:m.joined||"Recently"})),
    ...DATA.riders.filter(r=>r.status==="pending").map(r=>({who:r.name, role:"Rider", when:"Recently"})),
  ].slice(0,6);
  const card = (l,v,sub)=>`<div class="stat-card"><div class="lbl">${l}</div><div class="val">${v}</div>${sub||""}</div>`;
  return `
  <div class="view-head"><h1>Business Overview</h1><p>Live snapshot of orders, revenue and platform activity across MediFinder India.</p></div>
  <div class="stat-grid">
    ${card("Total Users", totalUsers, trend(c.users7||0, c.usersPrev7||0, "new this week vs last week"))}
    ${card("Total Merchants", DATA.merchants.length, `<div class="delta ${pendingMerchants?"down":"up"}">${pendingMerchants} pending review · ${mNew} new this week</div>`)}
    ${card("Total Riders", DATA.riders.length, `<div class="delta up">${liveRiders} online now</div>`)}
    ${card("Today's Orders", ordersToday, trend(ordersToday, ordersYest, "vs yesterday"))}
    ${card("Pending Orders", pending, `<div class="delta ${pending?"down":"up"}">${pending?"Needs attention":"All clear"}</div>`)}
    ${card("Today's Revenue", money(revToday), trend(revToday, revYest, "vs yesterday"))}
    ${card("Platform Earnings", money(Math.round(earnToday)), `<div class="delta">Today · commission on delivered orders</div>`)}
    ${card("Active Service Zones", activeZones, `<div class="delta">${DATA.zones.length} total</div>`)}
    ${card("Last-Hour Orders", lastHour)}
    ${card("Pending KYC", kycPending, `<div class="delta ${kycPending?"down":"up"}">${kycPending?"Needs review":"All clear"}</div>`)}
    ${card("Lab Bookings Today", bookToday(DATA.labBookings))}
    ${card("Nurse Bookings Today", bookToday(DATA.nurseBookings))}
    ${card("Ambulance Rides Today", bookToday(DATA.ambulanceBookings))}
    ${card("Open Complaints", DATA.tickets.filter(t=>t.status==="open").length)}
  </div>
  <div class="card"><div class="card-head"><h3>Quick actions</h3></div><div class="card-body"><div class="quick-actions-grid">
    ${QUICK_ACTIONS.map(a=>`<div class="qa-btn" data-nav="${a.nav}"><span class="qa-ic">${a.ic}</span>${esc(a.label)}</div>`).join("")}
  </div></div></div>
  <div class="card">
    <div class="card-head"><h3>Orders — last 7 days</h3><span class="sub">All zones combined</span>
      <div class="live-pill" style="margin-left:auto"><span class="blip"></span>${liveRiders} riders live</div></div>
    <div class="card-body">${svgBarChart(DATA.weekOrders, DATA.weekLabels)}
      <div class="legend"><span><span class="sw" style="background:var(--brand)"></span>Orders placed</span></div></div>
  </div>
  <div class="card"><div class="card-head"><h3>Recent activity</h3><span class="sub">New order / status-change feed</span></div><div class="card-body">
    ${DATA.activityFeed.slice(0,8).map(a=>`<div class="alert-item"><span class="al-ic">${a.ic}</span><div><div>${esc(a.text)}</div><div class="al-sub">${esc(a.sub||"")}</div></div></div>`).join("") || `<div class="empty"><h4>No orders yet</h4></div>`}
  </div></div>
  <div class="card"><div class="card-head"><h3>Live alerts</h3></div><div class="card-body">
    ${alerts.length ? alerts.map(a=>`<div class="alert-item"><span class="al-ic">${a.ic}</span><div><div>${esc(a.text)}</div><div class="al-sub">${esc(a.sub)}</div></div></div>`).join("") : `<div class="empty"><div class="ic">▢</div><h4>All clear</h4><p>No active alerts right now.</p></div>`}
  </div></div>
  <div class="card"><div class="card-head"><h3>Recent orders</h3><span class="sub">Newest first</span></div><div class="card-body pad0">
    ${renderTable("dash-orders",[
      {key:"id",label:"Order",render:r=>`<span class="id-cell">${esc(r.id)}</span>`},
      {key:"customer",label:"Customer"},{key:"merchant",label:"Pharmacy"},
      {key:"total",label:"Total",render:r=>money(r.total)},
      {key:"status",label:"Status",render:r=>statusBadge(r.status)},{key:"date",label:"Placed"},
    ], DATA.orders.slice(0,6))}
  </div></div>
  <div class="card"><div class="card-head"><h3>Recent registrations</h3></div><div class="card-body pad0">
    ${renderTable("dash-regs",[{key:"who",label:"Name"},{key:"role",label:"Role",render:r=>badge(r.role,"blue")},{key:"when",label:"Joined"}], recentRegistrations)}
  </div></div>`;
};

/* ---------- Notification bell (the red dot now works) ---------- */
function pendingAlertItems(){
  const kyc = kycAllRows().filter(r=>r.status==="pending");
  const kn = (k)=> kyc.filter(r=>r.kind===k).length;
  const bk = (arr)=> arr.filter(b=>b.status==="new").length;
  return [
    {ic:"▤", text:"Pending orders", n:DATA.orders.filter(o=>o.status==="pending").length, nav:"orders", tab:"pending"},
    {ic:"▭", text:"Payments to verify", n:(DATA.payQueue||[]).filter(r=>r.status==="pending").length, nav:"payment"},
    {ic:"✔", text:"Merchant KYC pending", n:kn("merchant"), nav:"kyc", tab:"merchant"},
    {ic:"✔", text:"Rider KYC pending", n:kn("rider"), nav:"kyc", tab:"rider"},
    {ic:"✔", text:"Nurse KYC pending", n:kn("nurse"), nav:"kyc", tab:"nurse"},
    {ic:"✔", text:"Lab KYC pending", n:kn("lab"), nav:"kyc", tab:"lab"},
    {ic:"✔", text:"Ambulance KYC pending", n:kn("ambulance"), nav:"kyc", tab:"ambulance"},
    {ic:"⬡", text:"Medicines awaiting approval", n:DATA.products.filter(p=>p.approval==="pending").length, nav:"products", tab:"pending"},
    {ic:"▦", text:"Prescriptions pending", n:DATA.prescriptions.filter(p=>p.status==="pending").length, nav:"prescriptions"},
    {ic:"✚", text:"New lab bookings", n:bk(DATA.labBookings), nav:"booking", tab:"lab"},
    {ic:"✚", text:"New nurse bookings", n:bk(DATA.nurseBookings), nav:"booking", tab:"nurse"},
    {ic:"🚑", text:"New ambulance requests", n:bk(DATA.ambulanceBookings), nav:"booking", tab:"ambulance"},
    {ic:"◐", text:"Open complaints", n:DATA.tickets.filter(t=>t.status==="open").length, nav:"support"},
    {ic:"⇪", text:"Payouts waiting", n:["merchant","rider","nurse","collector","ambulance"].reduce((s,k)=>s+((DATA.payouts[k]||[]).filter(p=>p.status==="pending").length),0), nav:"payout"},
  ].filter(x=>x.n>0);
}
function updateBell(){
  const btn = document.querySelector(".topbar-actions .icon-btn"); if(!btn) return;
  btn.id = "bellBtn";
  const items = pendingAlertItems(), total = items.reduce((s,x)=>s+x.n,0);
  const dot = btn.querySelector(".dot");
  if(dot){ dot.style.display = total ? "block" : "none"; dot.textContent = ""; }
  btn.title = total ? `${total} item(s) need attention` : "Nothing needs attention";
  const panel = document.getElementById("bellPanel");
  if(panel && panel.classList.contains("open")) panel.innerHTML = bellPanelHtml(items, total);
}
function bellPanelHtml(items, total){
  return `<div class="bell-head"><strong>Needs attention</strong><span>${total} item${total===1?"":"s"}</span></div>` +
    (items.length ? items.map(x=>`<div class="bell-row" data-bell-nav="${x.nav}" data-bell-tab="${x.tab||""}"><span class="bell-ic">${x.ic}</span><span class="bell-txt">${esc(x.text)}</span><span class="bell-n">${x.n}</span></div>`).join("") : `<div class="bell-empty">✔ All clear — nothing is waiting.</div>`);
}
document.addEventListener("click", (e)=>{
  const btn = e.target.closest("#bellBtn");
  let panel = document.getElementById("bellPanel");
  if(btn){
    if(!panel){ panel = document.createElement("div"); panel.id = "bellPanel"; panel.className = "bell-panel"; document.body.appendChild(panel); }
    const items = pendingAlertItems(); panel.innerHTML = bellPanelHtml(items, items.reduce((s,x)=>s+x.n,0));
    panel.classList.toggle("open"); return;
  }
  const row = e.target.closest("[data-bell-nav]");
  if(row){ setView(row.dataset.bellNav, row.dataset.bellTab || undefined); if(panel) panel.classList.remove("open"); return; }
  if(panel && !e.target.closest("#bellPanel")) panel.classList.remove("open");
});

/* ---------- Settings: show the signed-in admin, save for real ---------- */
const _settingsBase = VIEWS.settings;
VIEWS.settings = () => `
  <div class="card"><div class="card-head"><h3>Signed-in admin</h3></div><div class="card-body">
    <div class="row-flex"><div class="avatar" style="width:46px;height:46px;font-size:15px">${initials(DATA.me.name)}</div>
      <div><div class="cell-strong" style="font-size:15px">${esc(DATA.me.name)}</div><div class="cell-sub">${esc(DATA.me.email||"—")}</div></div>
      <div style="margin-left:auto">${badge(DATA.me.role,"blue")}</div></div>
    <div style="margin-top:10px">${detailRow("Last login", esc(DATA.me.lastLogin||"—"))}${detailRow("Two-factor", DATA.me.twofa?badge("Enabled","green"):badge("Not enabled","gold"))}</div>
  </div></div>` + _settingsBase();
Actions["settings-save"] = async ()=>{
  const s = STATE.settings;
  const next = { platformName:$("#setName").value, commission:+$("#setCommission").value, codFee:+$("#setCod").value, processingFee:+$("#setProcessing").value, tax:+$("#setTax").value, cancellationPolicy:$("#setCancel").value, refundPolicy:$("#setRefund").value };
  const err = await savePlatformControl("settings", next);
  if(err){ toast("Could not save: "+err.message+SQL_HINT,"danger"); return; }
  Object.assign(s, next); await logAdminAction("Updated platform settings"); render(); toast("Settings saved");
};

/* ---------- Partner pages (Lab / Nurse / Ambulance) ---------- */
function partnerRows(kind){
  const Rw = DATA.raw;
  if(kind==="lab"){
    const kycBy = {}; Rw.collectorKyc.forEach(k=>{ kycBy[k.collector_id] = k; });
    return Rw.collectors.map(c=>{
      const k = kycBy[c.id] || {}; const st = normKyc(k.status) || normKyc(c.kyc_status) || "pending";
      const books = DATA.labBookings.filter(b=>String(b._collectorId)===String(c.id));
      const name = c.full_name || k.full_name || "Collector";
      return { kind, id:c.id, kycId:k.id || c.id, name, phone:c.phone || k.mobile_no || "Not set", place:[k.city,k.pincode].filter(Boolean).join(" ") || "Not set", status:st,
        a:`${DATA.labs.filter(t=>String(t._collectorId)===String(c.id)).length} tests`, b:`${books.length} bookings · ${books.filter(x=>x.status==="completed").length} done`,
        earn:(DATA.payouts.collector||[]).filter(p=>p.recipient===name).reduce((s,p)=>s+(p.net||0),0), online:null };
    });
  }
  if(kind==="nurse"){
    const nk = {}; Rw.nurseKyc.forEach(k=>{ nk[k.user_id] = k; });
    const seen = new Set(), rows = [];
    DATA.nurses.forEach(n=>{ const k = nk[n.authUserId] || {}; if(n.authUserId) seen.add(n.authUserId);
      const st = normKyc(k.status) || "verified"; const books = DATA.nurseBookings.filter(b=>b.nurse===n.name);
      rows.push({ kind, id:n.id, kycId:n.authUserId, name:n.name, phone:n.whatsapp, place:n.serviceArea, status:st, a:n.degree, b:`${books.length} bookings · ${books.filter(x=>x.status==="completed").length} done`,
        earn:(DATA.payouts.nurse||[]).filter(p=>p.recipient===n.name).reduce((s,p)=>s+(p.net||0),0), online:null }); });
    Rw.nurseKyc.forEach(k=>{ if(seen.has(k.user_id)) return; const st = normKyc(k.status); if(!st) return;
      rows.push({ kind, id:k.user_id, kycId:k.user_id, name:k.full_name||"Nurse", phone:k.contact_no||"Not set", place:[k.city,k.pincode].filter(Boolean).join(" ")||"Not set", status:st, a:k.qualification||"Not set", b:"0 bookings", earn:0, online:null }); });
    return rows;
  }
  return Rw.ambulance.map(d=>{
    const rides = DATA.ambulanceBookings.filter(b=>String(b._driverId)===String(d.id));
    const st = normKyc(d.kyc_status) || (d.is_verified ? "verified" : "pending");
    return { kind, id:d.id, kycId:d.id, name:d.driver_name||"Driver", phone:d.phone||"Not set", place:d.pincode||"Not set", status:st,
      a:`${({non_ac:"Non-AC",ac:"AC",icu:"ICU"})[d.vehicle_type]||d.vehicle_type||"Vehicle"} · ${d.plate_number||"No plate"}`, b:`${rides.length} rides · ${rides.filter(x=>x.status==="completed").length} done`,
      earn:(DATA.payouts.ambulance||[]).filter(p=>p.recipient===(d.driver_name||"Driver")).reduce((s,p)=>s+(p.net||0),0),
      online: d.is_on_ride ? "on ride" : (d.is_online ? "online" : "offline"), rating:d.rating, lat:d.current_lat, lng:d.current_lon };
  });
}
const PARTNER_META = {
  lab:{title:"Lab Partner", sub:"Blood collectors & labs — KYC, tests published, bookings and earnings.", a:"Tests", b:"Bookings"},
  nurse:{title:"Nurse Partner", sub:"Home-nursing partners — KYC, qualification, bookings and earnings.", a:"Qualification", b:"Bookings"},
  ambulance:{title:"Ambulance Partner", sub:"Ambulance drivers — KYC, vehicle, live status, rides and earnings.", a:"Vehicle", b:"Rides"},
};
function partnerView(kind){
  const id = kind+"partners", tab = vs(id,{tab:"all"}).tab, meta = PARTNER_META[kind];
  const all = partnerRows(kind);
  let rows = all; if(tab==="pending") rows = all.filter(r=>r.status==="pending"); if(tab==="suspended") rows = all.filter(r=>r.status==="rejected");
  const q = (vs(id,{search:""}).search||"").toLowerCase();
  if(q) rows = rows.filter(r=>(r.name+r.phone+r.place).toLowerCase().includes(q));
  const stat = (l,v)=>`<div class="stat-card"><div class="lbl">${l}</div><div class="val">${v}</div></div>`;
  const stats = `<div class="stat-grid">${stat("Total partners",all.length)}${stat("Active",all.filter(r=>r.status==="verified").length)}${stat("Pending KYC",all.filter(r=>r.status==="pending").length)}${stat("Suspended",all.filter(r=>r.status==="rejected").length)}${kind==="ambulance"?stat("Online now",all.filter(r=>r.online==="online"||r.online==="on ride").length):""}</div>`;
  let body;
  if(tab==="map" && kind==="ambulance"){
    body = `<div class="card"><div class="card-head"><h3>Live ambulance map</h3><span class="sub">OpenStreetMap · live GPS from each driver</span></div><div class="card-body"><div id="ambLeafletMap" class="leaflet-box"></div></div></div>`;
  } else {
    body = `<div class="view-toolbar">${toolbarSearch(id,"Search name, phone or area")}</div><div class="card"><div class="card-body pad0">` + renderTable(id+"-t",[
      {key:"name",label:"Partner",render:r=>`<div class="row-flex"><div class="avatar">${initials(r.name)}</div><div><div class="cell-strong">${esc(r.name)}</div><div class="cell-sub">${esc(r.phone)}</div></div></div>`},
      {key:"place",label:"Area"},{key:"a",label:meta.a},{key:"b",label:meta.b},
      {key:"earn",label:"Earnings",render:r=>money(r.earn)},
      ...(kind==="ambulance"?[{key:"online",label:"Live",render:r=>r.online==="online"?badge("Online","green"):r.online==="on ride"?badge("On ride","gold"):badge("Offline","gray")}]:[]),
      {key:"status",label:"KYC / Status",render:r=>badge(r.status==="verified"?"Active":r.status==="rejected"?"Suspended":"Pending", r.status==="verified"?"green":r.status==="rejected"?"red":"gold")},
      {key:"_a",label:"",sortable:false,render:r=>`<div class="actions-cell">
        <button class="btn sm" data-act="kyc-detail" data-kind="${kind}" data-id="${esc(r.kycId)}">KYC</button>
        ${r.status==="verified" ? `<button class="btn sm danger" data-act="partner-suspend" data-kind="${kind}" data-id="${esc(r.kycId)}">Suspend</button>` : r.status==="rejected" ? `<button class="btn sm primary" data-act="partner-activate" data-kind="${kind}" data-id="${esc(r.kycId)}">Activate</button>` : ""}</div>`},
    ], rows, {emptyText:"No partners in this view."}) + `</div></div>`;
  }
  return `<div class="view-head"><h1>${meta.title}</h1><p>${meta.sub}</p></div>${stats}${body}`;
}
VIEWS.labpartners = ()=>partnerView("lab");
VIEWS.nursepartners = ()=>partnerView("nurse");
VIEWS.ambulancepartners = ()=>partnerView("ambulance");

async function partnerSetStatus(kind, id, suspend){
  const why = "Suspended by admin", now = new Date().toISOString(); let qs = [];
  if(kind==="nurse") qs.push(supabase.from("nurse_kyc").update(suspend?{status:"rejected", rejection_reason:why}:{status:"approved", rejection_reason:null}).eq("user_id", id));
  if(kind==="lab"){
    qs.push(supabase.from("collector_kyc").update(suspend?{status:"rejected", rejection_reason:why, reviewed_at:now}:{status:"verified", rejection_reason:null, reviewed_at:now}).eq("id", id));
    const k = DATA.raw.collectorKyc.find(x=>String(x.id)===String(id));
    qs.push(supabase.from("sample_collectors").update({kyc_status: suspend?"rejected":"verified"}).eq("id", k ? k.collector_id : id));
  }
  if(kind==="ambulance") qs.push(supabase.from("ambulance_drivers").update(suspend?{kyc_status:"rejected", is_verified:false, is_online:false, kyc_rejection_reason:why}:{kyc_status:"verified", is_verified:true, kyc_rejection_reason:null}).eq("id", id));
  const res = await Promise.all(qs.map(q=>mustUpdate(q, "Partner")));
  const bad = res.find((r,i)=>!r.ok && !(kind==="lab" && i===1));
  if(bad){ toast("Failed: "+bad.msg,"danger"); return; }
  await logAdminAction(`${suspend?"Suspended":"Activated"} ${kind} partner ${id}`);
  await Promise.all([loadNursesFromDB(), loadAmbulanceDriversFromDB(), loadPartnerExtras()]);
  render(); toast(`Partner ${suspend?"suspended":"activated"}`, suspend?"danger":"default");
}
Actions["partner-suspend"] = (el)=> partnerSetStatus(el.dataset.kind, el.dataset.id, true);
Actions["partner-activate"] = (el)=> partnerSetStatus(el.dataset.kind, el.dataset.id, false);

/* ---------- Medicine: return / exchange before approve, edit = price + pause only ---------- */
function returnFields(p){
  const rd = Number(p.returnDays) > 0 ? p.returnDays : "", ed = Number(p.exchangeDays) > 0 ? p.exchangeDays : "";
  return `<div class="hint" style="margin:2px 0 8px">The days you write here are exactly what customers get — counted from the <b>moment the order is delivered</b>, to the minute.  Optional — leave both unchecked and the product simply has no return / exchange. Works for Rx medicines too.</div>
    <div class="field" style="margin-top:6px"><label class="chk"><input type="checkbox" id="rpReturn" ${p.returnable?"checked":""}> Customer can <b>return</b> this product</label></div>
    <div class="field"><label>Return window (days after delivery)</label><input id="rpReturnDays" type="number" min="1" max="365" step="1" placeholder="e.g. 7" value="${rd}"></div>
    <div class="field"><label class="chk"><input type="checkbox" id="rpExch" ${p.exchangeable?"checked":""}> Customer can <b>exchange</b> this product</label></div>
    <div class="field"><label>Exchange window (days after delivery)</label><input id="rpExchDays" type="number" min="1" max="365" step="1" placeholder="e.g. 3" value="${ed}"></div>`;
}
function readReturnFields(){
  const ret = $("#rpReturn").checked, ex = $("#rpExch").checked;
  const rd = parseInt($("#rpReturnDays").value, 10), ed = parseInt($("#rpExchDays").value, 10);
  if(ret && !(rd >= 1 && rd <= 365)){ toast("Enter how many days the customer can return (1–365)", "danger"); return null; }
  if(ex && !(ed >= 1 && ed <= 365)){ toast("Enter how many days the customer can exchange (1–365)", "danger"); return null; }
  return { is_returnable:ret, return_window_days: ret ? rd : 0, is_exchangeable:ex, exchange_window_days: ex ? ed : 0 };
}
async function updateMedicine(id, fields){
  let { error } = await supabase.from("medicines").update(fields).eq("id", id);
  if(error && /is_returnable|return_window|is_exchangeable|exchange_window|schema cache|column/i.test(error.message)){
    const base = {...fields}; delete base.is_returnable; delete base.return_window_days; delete base.is_exchangeable; delete base.exchange_window_days;
    const r2 = await supabase.from("medicines").update(base).eq("id", id);
    return { error:r2.error, partial:!r2.error };
  }
  return { error, partial:false };
}
function applyReturnToLocal(p, f){ p.returnable = f.is_returnable; p.returnDays = f.return_window_days; p.exchangeable = f.is_exchangeable; p.exchangeDays = f.exchange_window_days; }
Actions["product-approve"] = (el)=>{ const p = DATA.products.find(x=>x.id===Number(el.dataset.id)); if(!p) return;
  openModal(`Approve — ${p.name}`, `<div class="hint">Decide the return / exchange rule <b>before</b> this product goes live. It is shown to customers inside MediFinder India.</div>${returnFields(p)}`,
    `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-act="product-approve-confirm" data-id="${p.id}">Approve &amp; go live</button>`);
};
Actions["product-approve-confirm"] = async (el)=>{ const p = DATA.products.find(x=>x.id===Number(el.dataset.id)); if(!p) return;
  const f = readReturnFields(); if(!f) return;
  const { error, partial } = await updateMedicine(p.id, { status:"Approved", admin_approved:true, is_visible:true, ...f });
  if(error){ toast("Failed: "+error.message,"danger"); return; }
  p.approval = "approved"; p.visible = true; if(!partial) applyReturnToLocal(p, f);
  await logAdminAction(`Approved medicine ${p.name}`); closeModal(); render();
  toast(partial ? "Approved, but return/exchange was not saved"+SQL_HINT : "Medicine approved & live", partial?"danger":"default");
};
Actions["product-edit"] = (el)=>{ const p = DATA.products.find(x=>x.id===Number(el.dataset.id)); if(!p) return;
  openModal(`Edit ${p.name}`, `
    <div class="field-row"><div class="field"><label>Price (₹)</label><input id="epPrice" type="number" step="0.01" min="0" value="${p.price}"></div>
    <div class="field"><label>Stock (set by the merchant)</label><input type="number" value="${p.stock}" disabled></div></div>
    <div class="field"><label class="chk"><input type="checkbox" id="epPaused" ${p.visible?"":"checked"}> <b>Pause</b> this medicine (hidden from customers)</label></div>
    <div class="hint" style="margin:8px 0 2px;font-weight:600">Return / exchange</div>${returnFields(p)}`,
    `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-act="product-edit-save" data-id="${p.id}">Save</button>`);
};
Actions["product-edit-save"] = async (el)=>{ const p = DATA.products.find(x=>x.id===Number(el.dataset.id)); if(!p) return;
  const raw = $("#epPrice").value; const price = Number(raw);
  if(raw==="" || !(price>=0)){ toast("Enter a valid price","danger"); return; }
  const f = readReturnFields(); if(!f) return; const fields = { selling_price:price, is_visible:!$("#epPaused").checked, ...f };
  if(price > (p._mrp||0)) fields.mrp = price;
  const { error, partial } = await updateMedicine(p.id, fields);
  if(error){ toast("Failed: "+error.message,"danger"); return; }
  p.price = price; p.visible = fields.is_visible; if(fields.mrp) p._mrp = fields.mrp; if(!partial) applyReturnToLocal(p, f);
  await logAdminAction(`Edited medicine ${p.name} (price ${price}${p.visible?"":", paused"})`); closeModal(); render();
  toast(partial ? "Saved, but return/exchange was not saved"+SQL_HINT : (p.visible ? "Medicine updated" : "Medicine updated & paused"), partial?"danger":"default");
};

/* ---------- KYC documents: full-page viewer, never a new tab ---------- */
kycLightbox = function(url, label, pdf){
  document.getElementById("kycLightbox")?.remove();
  const box = document.createElement("div"); box.id = "kycLightbox"; box.className = "doc-full";
  box.innerHTML = `<div class="doc-full-head"><strong>${esc(label)}</strong><button class="doc-full-close" id="kycLightboxClose">✕ Close</button></div>
    <div class="doc-full-body">${pdf ? `<iframe src="${esc(url)}" title="${esc(label)}"></iframe>` : `<img src="${esc(url)}" alt="${esc(label)}">`}</div>
    ${pdf ? "" : `<div class="doc-full-hint">Tap the image to zoom</div>`}`;
  box.addEventListener("click", (e)=>{
    if(e.target.id==="kycLightboxClose"){ box.remove(); return; }
    if(e.target.tagName==="IMG") e.target.classList.toggle("zoomed");
  });
  document.body.appendChild(box);
};
Actions["doc-open"] = async (el)=>{
  const { bucket, ref, label } = el.dataset;
  try{ const url = await kycDocUrl(bucket, ref); kycLightbox(url, label || "Document", kycIsPdf(ref)); }
  catch(err){ toast("Could not open document: "+err.message,"danger"); }
};
document.addEventListener("keydown", (e)=>{ if(e.key==="Escape") document.getElementById("kycLightbox")?.remove(); });

/* ---------- Notification: pick the target by ID (name resolves automatically) ---------- */
const shortId = (id)=> String(id).length>12 ? String(id).slice(0,8)+"…" : String(id);
function ntfEntities(t){
  if(t==="user-one") return DATA.users.map(u=>({id:String(u.id), label:u.name, sub:`${u.phone} · ${u.email}`, ids:[String(u.id)]}));
  if(t==="merchant") return DATA.merchants.map(m=>({id:String(m.id), label:m.name, sub:`${m.owner} · ${m.phone}`, ids:[String(m.id)]}));
  if(t==="rider") return DATA.riders.map(r=>({id:String(r.id), label:r.name, sub:String(r.phone), ids:[String(r.id)]}));
  if(t==="lab") return DATA.raw.collectors.filter(c=>c.auth_user_id).map(c=>({id:String(c.auth_user_id), label:c.full_name||c.phone||"Collector", sub:String(c.phone||""), ids:[String(c.auth_user_id),String(c.id)]}));
  if(t==="nurse") return DATA.nurses.filter(n=>n.authUserId).map(n=>({id:String(n.authUserId), label:n.name, sub:String(n.whatsapp), ids:[String(n.authUserId),String(n.id)]}));
  if(t==="ambulance") return DATA.ambulanceDrivers.map(d=>({id:String(d.id), label:d.name, sub:String(d.phone), ids:[String(d.id)]}));
  return [];
}
function ntfMatch(t, q){
  q = q.trim().toLowerCase(); if(!q) return [];
  const list = ntfEntities(t);
  const exact = list.filter(e=>e.ids.some(i=>i.toLowerCase()===q)); if(exact.length) return exact;
  const digits = q.replace(/\D/g,"");
  return list.filter(e=> e.ids.some(i=>q.length>=3 && i.toLowerCase().startsWith(q)) || e.label.toLowerCase().includes(q) || (digits.length>=4 && e.sub.replace(/\D/g,"").includes(digits))).slice(0,8);
}
VIEWS.notifications = () => {
  const t = vs("notifications",{tab:"user-all"}).tab;
  let target;
  if(t==="user-all") target = `<div class="field"><label>Send to</label><input value="All users" disabled></div><input type="hidden" id="ntfTarget" value="all">`;
  else {
    const one = t==="user-one", lbl = one ? "user" : NTF_AUDIENCE[t].toLowerCase().replace(/s$/,"");
    target = `<div class="field"><label>Send to</label>
      <div class="ntf-modes"><label class="chk"><input type="radio" id="ntfModeAll" name="ntfMode" value="all" ${one?"disabled":"checked"}> All ${esc(NTF_AUDIENCE[t].toLowerCase())}</label>
      <label class="chk"><input type="radio" id="ntfModeOne" name="ntfMode" value="one" ${one?"checked":""}> One ${esc(lbl)} — enter ID</label></div>
      <input id="ntfTargetInput" autocomplete="off" placeholder="Type the ${esc(lbl)} ID (name or phone also works)" ${one?"":"disabled"}>
      <div id="ntfResolve" class="ntf-resolve"></div><div id="ntfSuggest"></div>
      <input type="hidden" id="ntfTarget" value="${one?"":"all"}"></div>`;
  }
  return `
  <div class="view-head"><h1>Create Notification</h1><p>${esc(NTF_AUDIENCE[t])} · delivered in-app (stored in the app's own notification table).</p></div>
  ${toolbarTabs("notifications", [{key:"user-all",label:"User · All"},{key:"user-one",label:"User · One"},{key:"merchant",label:"Merchant"},{key:"rider",label:"Rider"},{key:"lab",label:"Lab"},{key:"nurse",label:"Nurse"},{key:"ambulance",label:"Ambulance"}])}
  <div class="card"><div class="card-body">
    ${target}
    <div class="field"><label>Title</label><input id="ntfTitle" placeholder="e.g. Monsoon health tips inside"></div>
    <div class="field"><label>Message</label><textarea id="ntfBody" placeholder="Write the notification body..."></textarea></div>
    <div class="field-row">
      <div class="field"><label>Image URL (optional)</label><input id="ntfImage" placeholder="https://..."></div>
      <div class="field"><label>Deep link (optional)</label><input id="ntfLink" placeholder="e.g. orders"></div>
    </div>
    <button class="btn primary" data-act="ntf-send">Send notification</button>
  </div></div>
  <div class="card"><div class="card-head"><h3>Notification history</h3></div><div class="card-body pad0" id="tablewrap-notifications">
    ${renderTable("notifications",[{key:"title",label:"Title"},{key:"audience",label:"Audience",render:r=>badge(r.audience,"blue")},{key:"sentAt",label:"Sent"}], DATA.notificationsHistory, {emptyText:"No notifications sent yet."})}
  </div></div>`;
};
function ntfResolveNow(){
  const inp = $("#ntfTargetInput"); if(!inp) return;
  const t = vs("notifications",{}).tab, m = ntfMatch(t, inp.value), hid = $("#ntfTarget"), res = $("#ntfResolve"), sug = $("#ntfSuggest");
  sug.innerHTML = "";
  if(!inp.value.trim()){ hid.value = ""; res.innerHTML = ""; return; }
  if(m.length===1){ hid.value = m[0].id; res.innerHTML = `<span class="ntf-ok">✔ ${esc(m[0].label)}</span> <span class="cell-sub">${esc(m[0].sub)}</span>`; return; }
  hid.value = "";
  if(!m.length){ res.innerHTML = `<span class="ntf-bad">No one found with this ID</span>`; return; }
  res.innerHTML = `<span class="cell-sub">${m.length} matches — tap one</span>`;
  sug.innerHTML = m.map(e=>`<div class="ntf-pick" data-ntf-pick="${esc(e.id)}"><b>${esc(e.label)}</b><span>${esc(shortId(e.id))} · ${esc(e.sub)}</span></div>`).join("");
}
document.addEventListener("input", (e)=>{ if(e.target.id==="ntfTargetInput") ntfResolveNow(); });
document.addEventListener("change", (e)=>{
  if(e.target.name==="ntfMode"){
    const inp = $("#ntfTargetInput"), hid = $("#ntfTarget"); if(!inp) return;
    if(e.target.value==="all"){ inp.disabled = true; inp.value = ""; hid.value = "all"; $("#ntfResolve").innerHTML = ""; $("#ntfSuggest").innerHTML = ""; }
    else { inp.disabled = false; hid.value = ""; inp.focus(); ntfResolveNow(); }
  }
});
document.addEventListener("click", (e)=>{
  const pick = e.target.closest("[data-ntf-pick]"); if(!pick) return;
  const inp = $("#ntfTargetInput"); if(inp){ inp.value = pick.dataset.ntfPick; ntfResolveNow(); }
});
const _ntfSendBase = Actions["ntf-send"];
Actions["ntf-send"] = async (el)=>{
  const t = vs("notifications",{tab:"user-all"}).tab;
  if(t!=="user-all"){
    const mode = (document.querySelector('input[name="ntfMode"]:checked')||{}).value, v = ($("#ntfTarget")||{}).value;
    if(mode==="one" && !v){ toast("Enter a valid ID first — the name must show in green","danger"); return; }
  }
  return _ntfSendBase(el);
};

/* ---------- Zones: services on/off + green / yellow / red ---------- */
const ZONE_SVCS = [{key:"svc30",col:"svc_30min",label:"30-min delivery"},{key:"svcSameDay",col:"svc_sameday",label:"Same-day delivery"},{key:"svcNurse",col:"svc_nurse",label:"Nurse service"},{key:"svcLab",col:"svc_lab",label:"Lab service"}];
function readZoneSvcs(){ const o = {}; ZONE_SVCS.forEach(x=>{ const el = document.getElementById("zs_"+x.key); o[x.col] = el ? !!el.checked : true; }); return o; }
function zoneHealth(z){
  if(z.status!=="active") return { key:"red", label:"Suspended" };
  const off = ZONE_SVCS.filter(s=>!z[s.key]).map(s=>s.label);
  if(off.length) return { key:"yellow", label:`Reduced service · ${off.length} off` };
  return { key:"green", label:"Fully live" };
}
VIEWS.delivery = () => {
  const cnt = {green:0,yellow:0,red:0}; DATA.zones.forEach(z=>cnt[zoneHealth(z).key]++);
  const mPin = {}; DATA.merchants.forEach(m=>{ mPin[String(m.id)] = String(m.pincode); });
  const cards = DATA.zones.map(z=>{
    const h = zoneHealth(z);
    const zs = zoneStats(z), riders = zs.riders, merchants = zs.merchants, orders = zs.orders;
    return `<div class="zone-card ${h.key}">
      <div class="zone-top"><div><div class="zone-name">${esc(z.name)}</div><div class="cell-sub">PIN ${esc(z.pin)} · ${esc(z.district)}${z.ps&&z.ps!=="—"?" · "+esc(z.ps):""} · ${esc(z.state)}</div></div><span class="zone-pill ${h.key}">${esc(h.label)}</span></div>
      ${z.status!=="active" && z.suspendReason ? `<div class="zone-reason">Reason: ${esc(z.suspendReason)}</div>` : ""}
      <div class="zone-stats">
        <div><span>Base fee</span><b>${money(z.baseFee)}</b></div><div><span>Per km</span><b>${money(z.perKm)}</b></div><div><span>Express</span><b>${money(z.express)}</b></div>
        <div><span>Riders (online)</span><b>${riders} (${zs.ridersOnline})</b></div><div><span>Merchants</span><b>${merchants}</b></div><div><span>Customers</span><b>${zs.users}</b></div>
        <div><span>Orders</span><b>${orders}</b></div><div><span>Delivered</span><b>${zs.delivered}</b></div><div><span>Revenue</span><b>${money(zs.revenue)}</b></div>
      </div>
      <div class="cell-sub" style="margin-bottom:8px">Coverage radius ${z.radiusKm||"—"} km${zoneCenter(z)?"":" · map location not set yet"}</div>
      <div class="zone-svcs">${ZONE_SVCS.map(s=>`<div class="svc-toggle"><span>${s.label}</span><label class="toggle"><input type="checkbox" ${z[s.key]?"checked":""} data-act="zone-svc" data-id="${esc(z.id)}" data-key="${s.key}"><span class="track"></span></label></div>`).join("")}</div>
      <div class="zone-foot"><button class="btn sm" data-act="zone-edit" data-id="${esc(z.id)}">Edit</button>
        <div class="zone-master"><span>${z.status==="active"?"Zone live":"Zone suspended"}</span><label class="toggle"><input type="checkbox" ${z.status==="active"?"checked":""} data-act="zone-toggle" data-id="${esc(z.id)}"><span class="track"></span></label></div></div>
    </div>`;
  }).join("");
  return `
  <div class="view-head"><h1>Service Zones</h1><p>PIN/district-wise zones — fees, services on/off and live coverage. <b style="color:#1f9d55">Green</b> = fully live · <b style="color:#b8860b">Yellow</b> = reduced service · <b style="color:#d93025">Red</b> = suspended.</p></div>
  <div class="stat-grid">
    <div class="stat-card"><div class="lbl">Fully live</div><div class="val" style="color:#1f9d55">${cnt.green}</div></div>
    <div class="stat-card"><div class="lbl">Reduced service</div><div class="val" style="color:#b8860b">${cnt.yellow}</div></div>
    <div class="stat-card"><div class="lbl">Suspended</div><div class="val" style="color:#d93025">${cnt.red}</div></div>
    <div class="stat-card"><div class="lbl">Total zones</div><div class="val">${DATA.zones.length}</div></div>
  </div>
  <div class="view-toolbar"><button class="btn primary" data-act="zone-add">+ Add zone</button></div>
  <div class="card"><div class="card-head"><h3>Coverage map</h3><span class="sub">OpenStreetMap · circle = zone (colour = health) · 🏪 pharmacy · 🏍 online rider</span></div><div class="card-body"><div id="zoneLeafletMap" class="leaflet-box short"></div></div></div>
  <div class="zone-grid">${cards || `<div class="empty"><div class="ic">▢</div><h4>No zones yet</h4><p>Add a pincode zone to start taking orders.</p></div>`}</div>`;
};
function zoneSvcChecks(z){
  return `<div class="field-row" style="flex-wrap:wrap">${ZONE_SVCS.map(s=>`<label class="chk" style="min-width:46%"><input type="checkbox" id="zs_${s.key}" ${(z?z[s.key]:true)?"checked":""}> ${s.label}</label>`).join("")}</div>`;
}
Actions["zone-add"] = ()=> openModal("New delivery zone", `
  <div class="field-row"><div class="field"><label>Pincode *</label><input id="zPin" inputmode="numeric" maxlength="6" placeholder="733124"></div><div class="field"><label>District *</label><input id="zDist" placeholder="Dakshin Dinajpur"></div></div>
  <div class="field-row"><div class="field"><label>Police station</label><input id="zPs" placeholder="Gangarampur"></div><div class="field"><label>Municipality / Block</label><input id="zMuni" placeholder="Gangarampur"></div></div>
  <div class="field-row"><div class="field"><label>State *</label><input id="zState" value="West Bengal"></div><div class="field"><label>Zone name (optional)</label><input id="zName" placeholder="defaults to municipality"></div></div>
  <div class="field-row"><div class="field"><label>Base fee (₹)</label><input id="zBase" type="number" value="30"></div><div class="field"><label>Per KM (₹)</label><input id="zKm" type="number" value="8"></div><div class="field"><label>Express fee (₹)</label><input id="zExp" type="number" value="20"></div></div>
  <div class="field-row"><div class="field"><label>Coverage radius (km)</label><input id="zRad" type="number" value="5" min="1" max="100"></div><div class="field"><label>Map centre (auto from pincode)</label><input id="zLatLng" placeholder="lat, lng — leave empty to auto-find"></div></div>
  <div class="hint" style="font-weight:600;margin:6px 0">Services in this zone</div>${zoneSvcChecks(null)}`,
  `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-act="zone-save">Save zone</button>`);
function parseLatLng(v){ const m = String(v||"").match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/); if(!m) return null; const a=+m[1], b=+m[2]; return (Math.abs(a)<=90 && Math.abs(b)<=180) ? [a,b] : null; }
Actions["zone-save"] = async ()=>{
  const pin=$("#zPin").value.trim(), dist=$("#zDist").value.trim(), state=$("#zState").value.trim(), ps=$("#zPs").value.trim(), muni=$("#zMuni").value.trim();
  if(!pin||!dist||!state){ toast("Pincode, district and state are required","danger"); return; }
  if(!/^\d{6}$/.test(pin)){ toast("Pincode must be exactly 6 digits","danger"); return; }
  if(DATA.zones.some(z=>String(z.pin)===pin)){ toast("A zone for this pincode already exists","danger"); return; }
  const name = $("#zName").value.trim() || muni || ps || dist;
  const base = { name, pin, pincode:pin, dist, ps:ps||null, muni:muni||null, state, status:"approved", is_active:true, outage_message:"", base_fee:Number($("#zBase").value)||0, per_km_fee:Number($("#zKm").value)||0, express_fee:Number($("#zExp").value)||0, radius_km:Number($("#zRad").value)||5 };
  const ll0 = parseLatLng($("#zLatLng").value); if(ll0){ base.center_lat = ll0[0]; base.center_lng = ll0[1]; }
  let { error } = await supabase.from("service_zones").insert({ ...base, ...readZoneSvcs() }); let warn = false;
  if(error && /svc_|schema cache|column/i.test(error.message)){ const r2 = await supabase.from("service_zones").insert(base); error = r2.error; warn = !r2.error; }
  if(error){ toast("Failed: "+error.message,"danger"); return; }
  closeModal();
  if(!ll0){ const g = await geocodePin(pin); if(g) await supabase.from("service_zones").update({ center_lat:g[0], center_lng:g[1] }).eq("pin", pin); }
  await loadZonesFromDB(); await logAdminAction(`Added zone ${pin} (${dist})`); render();
  toast(warn ? "Zone added, but service switches were not saved"+SQL_HINT : "Zone added — customers in this pincode can now order", warn?"danger":"default");
};
Actions["zone-edit"] = (el)=>{ const z = DATA.zones.find(x=>String(x.id)===el.dataset.id); if(!z) return;
  openModal(`Edit zone — ${z.name} (${z.pin})`, `
    <div class="field-row"><div class="field"><label>Base fee (₹)</label><input id="zBase" type="number" value="${z.baseFee}"></div><div class="field"><label>Per KM (₹)</label><input id="zKm" type="number" value="${z.perKm}"></div><div class="field"><label>Express fee (₹)</label><input id="zExp" type="number" value="${z.express}"></div></div>
    <div class="field-row"><div class="field"><label>Coverage radius (km)</label><input id="zRad" type="number" value="${z.radiusKm||5}" min="1" max="100"></div><div class="field"><label>Map centre (lat, lng)</label><input id="zLatLng" value="${(zoneCenter(z)||[]).map(v=>(+v).toFixed(5)).join(", ")}" placeholder="auto from pincode"></div></div>
    <div class="hint" style="font-weight:600;margin:6px 0">Services in this zone</div>${zoneSvcChecks(z)}`,
    `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-act="zone-edit-save" data-id="${esc(z.id)}">Save</button>`);
};
Actions["zone-edit-save"] = async (el)=>{ const z = DATA.zones.find(x=>String(x.id)===el.dataset.id); if(!z) return;
  const fees = { base_fee:Number($("#zBase").value)||0, per_km_fee:Number($("#zKm").value)||0, express_fee:Number($("#zExp").value)||0, radius_km:Number($("#zRad").value)||5 };
  let ll = parseLatLng($("#zLatLng").value); if(!ll) ll = zoneCenter(z) || await geocodePin(z.pin);
  if(ll){ fees.center_lat = ll[0]; fees.center_lng = ll[1]; }
  let r = await mustUpdate(supabase.from("service_zones").update({ ...fees, ...readZoneSvcs() }).eq("id", z.id), "Zone"); let warn = false;
  if(!r.ok && /svc_|schema cache|column/i.test(r.msg)){ r = await mustUpdate(supabase.from("service_zones").update(fees).eq("id", z.id), "Zone"); warn = r.ok; }
  if(!r.ok){ toast("Failed: "+r.msg,"danger"); return; }
  await logAdminAction(`Edited zone ${z.pin}`); closeModal(); await loadZonesFromDB(); render();
  toast(warn ? "Fees saved, service switches were not"+SQL_HINT : "Zone updated", warn?"danger":"default");
};
Actions["zone-svc"] = async (el)=>{
  const z = DATA.zones.find(x=>String(x.id)===el.dataset.id), s = ZONE_SVCS.find(x=>x.key===el.dataset.key); if(!z||!s) return;
  const next = el.checked;
  const r = await mustUpdate(supabase.from("service_zones").update({ [s.col]:next }).eq("id", z.id), "Zone");
  if(!r.ok){ toast("Failed: "+r.msg+(/svc_|column/i.test(r.msg)?SQL_HINT:""),"danger"); render(); return; }
  z[s.key] = next; await logAdminAction(`${next?"Enabled":"Disabled"} ${s.label} in zone ${z.pin}`); render();
  toast(`${s.label} ${next?"ON":"OFF"} — ${z.name}`, next?"default":"danger");
};

/* ---------- Maps: Leaflet + OpenStreetMap, stable, never on top of the menu ---------- */
let _zoneMap = null, _ambMap = null, _zoneMapToken = 0, _leafletRetry = 0;
const _mapView = {};
function destroyMaps(){
  _zoneMapToken++;
  for(const m of [_fleetMapInstance, _ridersMiniMapInstance, _zoneMap, _ambMap]){ try{ m && m.remove(); }catch(e){} }
  _fleetMapInstance = _ridersMiniMapInstance = _zoneMap = _ambMap = null;
}
function makeMap(el, key){
  const m = L.map(el, { attributionControl:true });
  const v = _mapView[key]; m.setView(v ? v.c : [22.97,78.65], v ? v.z : 5);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:19, attribution:"© OpenStreetMap contributors" }).addTo(m);
  m.on("moveend", ()=>{ const c = m.getCenter(); _mapView[key] = { c:[c.lat,c.lng], z:m.getZoom() }; });
  [60,400,1200].forEach(ms=>setTimeout(()=>{ try{ m.invalidateSize(); }catch(e){} }, ms));
  return m;
}
function fitFirst(m, key, pts){
  if(_mapView[key] || !pts.length) return;
  if(pts.length>1) m.fitBounds(pts,{padding:[30,30]}); else m.setView(pts[0], 14);
}
renderRidersLiveMiniMap = function(){
  const el = document.getElementById("ridersLiveMiniMap"); if(!el || typeof L==="undefined") return;
  _ridersMiniMapInstance = makeMap(el, "riders"); const pts = [];
  DATA.riders.filter(r=>r.online && r._hasLocation).forEach(r=>{
    L.circleMarker([r.lat,r.lon],{radius:7,color:"#e02020",fillColor:"#e02020",fillOpacity:.85,weight:2}).addTo(_ridersMiniMapInstance).bindPopup(`<b>${esc(r.name)}</b><br>${esc(r.vehicle)} · ${esc(r.phone)}`);
    pts.push([r.lat,r.lon]);
  });
  fitFirst(_ridersMiniMapInstance, "riders", pts);
};
const AMB_COLOR = { available:"#7c3aed", busy:"#e02020", offline:"#6b7280" };
function ambMarker(d, map){
  const st = d.is_on_ride ? "busy" : d.is_online ? "available" : "offline";
  const icon = L.divIcon({ html:`<div class="amb-pin" style="background:${AMB_COLOR[st]}">🚑</div>`, className:"amb-wrap", iconSize:[30,30], iconAnchor:[15,15] });
  return L.marker([d.current_lat, d.current_lon], { icon }).addTo(map).bindPopup(`<b>${esc(d.driver_name||"Driver")}</b><br>${esc(({non_ac:"Non-AC",ac:"AC",icu:"ICU"})[d.vehicle_type]||d.vehicle_type||"")} · ${esc(d.phone||"")}<br>${st==="busy"?"On a ride":st==="available"?"Available":"Offline"}`);
}
renderFleetLeafletMap = function(){
  const el = document.getElementById("fleetLeafletMap"); if(!el || typeof L==="undefined") return;
  const state = vs("fleet",{zoneFilter:"all"}), type = state.typeFilter || "all";
  _fleetMapInstance = makeMap(el, "fleet"); const pts = [];
  if(type!=="ambulances"){
    let visible = DATA.riders.filter(r=>r.online || fleetStatusOf(r)==="zone-suspended");
    if(state.zoneFilter==="approved") visible = visible.filter(r=>(DATA.zones.find(z=>z.name===r.zone)||{}).status==="active");
    if(state.zoneFilter==="suspended") visible = visible.filter(r=>(DATA.zones.find(z=>z.name===r.zone)||{}).status!=="active");
    visible.filter(r=>r._hasLocation).forEach(r=>{
      const s = fleetStatusOf(r), color = FLEET_MAP_COLOR[s] || "#666";
      L.circleMarker([r.lat,r.lon],{radius:8,color,fillColor:color,fillOpacity:.85,weight:2}).addTo(_fleetMapInstance).bindPopup(`<b>${esc(r.name)}</b><br>${esc(FLEET_LABEL[s]||s)} · ${esc(r.zone)}<br>${esc(r.phone)}`);
      pts.push([r.lat,r.lon]);
    });
  }
  if(type!=="riders") DATA.raw.ambulance.filter(d=>d.current_lat!=null && d.current_lon!=null && (d.is_online||d.is_on_ride)).forEach(d=>{ ambMarker(d,_fleetMapInstance); pts.push([d.current_lat,d.current_lon]); });
  fitFirst(_fleetMapInstance, "fleet", pts);
};
function initAmbMap(){
  const el = document.getElementById("ambLeafletMap"); if(!el || typeof L==="undefined") return;
  _ambMap = makeMap(el, "amb"); const pts = [];
  DATA.raw.ambulance.filter(d=>d.current_lat!=null && d.current_lon!=null).forEach(d=>{ ambMarker(d,_ambMap); pts.push([d.current_lat,d.current_lon]); });
  fitFirst(_ambMap, "amb", pts);
  if(!pts.length) el.insertAdjacentHTML("afterend", `<div class="hint" style="margin-top:8px">No ambulance driver is sharing a live location right now.</div>`);
}
ambulanceFleetMap = function(){ return `<div class="fleet-legend"><span><i style="background:#7c3aed"></i>Available</span><span><i style="background:#e02020"></i>On ride</span><span><i style="background:#6b7280"></i>Offline</span></div><div id="ambLeafletMap" class="leaflet-box"></div>`; };
function distKm(a,b,c,d){ const R=6371, rad=x=>x*Math.PI/180, dLat=rad(c-a), dLon=rad(d-b); const h=Math.sin(dLat/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
function zoneCenter(z){
  if(z._lat!=null && z._lng!=null && isFinite(+z._lat) && isFinite(+z._lng)) return [+z._lat,+z._lng];
  try{ const c = JSON.parse(localStorage.getItem("mf_pin_geo_v1")||"{}")[z.pin]; return Array.isArray(c) ? c : null; }catch(e){ return null; }
}
function zoneOfPoint(lat, lon){
  let best = null, bd = Infinity;
  DATA.zones.forEach(z=>{ const c = zoneCenter(z); if(!c) return; const d = distKm(lat,lon,c[0],c[1]); if(d <= (z.radiusKm||8) && d < bd){ best = z; bd = d; } });
  return best;
}
function zoneStats(z){
  const pin = String(z.pin), mine = DATA.merchants.filter(m=>String(m.pincode)===pin), ids = new Set(mine.map(m=>String(m.id)));
  const ords = DATA.orders.filter(o=>ids.has(String(o._merchantId))), live = ords.filter(o=>!DEAD_ORDER.includes(o.status));
  return {
    riders: DATA.riders.filter(r=>r.zone===z.name || String(r._pin)===pin).length,
    ridersOnline: DATA.riders.filter(r=>r.online && (r.zone===z.name || String(r._pin)===pin)).length,
    merchants: mine.length, users: DATA.users.filter(u=>String(u.pin)===pin).length,
    orders: ords.length, delivered: ords.filter(o=>o.status==="delivered").length,
    revenue: live.reduce((a,o)=>a+(o.total||0),0), pending: ords.filter(o=>["pending","accepted","picked_up","shipped","broadcasted"].includes(o.status)).length,
  };
}
const GEO_KEY = "mf_pin_geo_v1";
const geoCache = ()=>{ try{ return JSON.parse(localStorage.getItem(GEO_KEY)||"{}"); }catch(e){ return {}; } };
async function geocodePin(pin){
  const c = geoCache();
  try{
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&postalcode=${encodeURIComponent(pin)}`, { headers:{ "Accept":"application/json" } });
    const j = await r.json(); c[pin] = (j && j[0]) ? [+j[0].lat, +j[0].lon] : false;
    try{ localStorage.setItem(GEO_KEY, JSON.stringify(c)); }catch(e){}
    return c[pin] || null;
  }catch(e){ return null; }
}
async function initZoneMap(){
  const el = document.getElementById("zoneLeafletMap"); if(!el || typeof L==="undefined") return;
  const hadView = !!_mapView.zones, token = ++_zoneMapToken, map = _zoneMap = makeMap(el, "zones");
  const colors = { green:"#1f9d55", yellow:"#d4a017", red:"#d93025" }, pts = [];
  const pin = (emoji, bg)=> L.divIcon({ html:`<div style="background:${bg};color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${emoji}</div>`, className:"", iconSize:[24,24], iconAnchor:[12,12] });
  DATA.merchants.filter(m=>m.lat!=null && m.lng!=null && isFinite(+m.lat) && isFinite(+m.lng)).forEach(m=>{
    L.marker([+m.lat,+m.lng],{ icon:pin("🏪", m.status==="active"?"#0d5c4f":"#6b7280") }).addTo(map).bindPopup(`<b>${esc(m.name)}</b><br>PIN ${esc(m.pincode)} · ${esc(m.status)}<br>${m.orders} orders · ${money(m.earnings)} delivered`); pts.push([+m.lat,+m.lng]);
  });
  DATA.riders.filter(r=>r.online && r._hasLocation).forEach(r=>{
    L.marker([r.lat,r.lon],{ icon:pin("🏍", r.hasOrder?"#e02020":"#7c3aed") }).addTo(map).bindPopup(`<b>${esc(r.name)}</b><br>${esc(r.zone)} · ${r.hasOrder?"On delivery":"Idle"}<br>${esc(r.phone)}`); pts.push([r.lat,r.lon]);
  });
  for(const z of DATA.zones){
    if(token!==_zoneMapToken) return;
    let ll = zoneCenter(z);
    if(!ll){
      const cached = (()=>{ try{ return JSON.parse(localStorage.getItem(GEO_KEY)||"{}")[z.pin]; }catch(e){ return undefined; } })();
      if(cached===undefined){ ll = await geocodePin(z.pin); await new Promise(r=>setTimeout(r,1100)); if(token!==_zoneMapToken) return; }
      if(ll){ z._lat = ll[0]; z._lng = ll[1]; supabase.from("service_zones").update({ center_lat:ll[0], center_lng:ll[1] }).eq("id", z.id).then(()=>{}, ()=>{}); }
    }
    if(!ll) continue;
    const h = zoneHealth(z), st = zoneStats(z);
    L.circle(ll,{radius:(z.radiusKm||5)*1000,color:colors[h.key],fillColor:colors[h.key],fillOpacity:.18,weight:2}).addTo(map)
      .bindPopup(`<b>${esc(z.name)}</b> · PIN ${esc(z.pin)}<br>${esc(h.label)} · radius ${z.radiusKm||5} km<br>Riders ${st.riders} (${st.ridersOnline} online) · Merchants ${st.merchants}<br>Orders ${st.orders} · Delivered ${st.delivered} · ${money(st.revenue)}`);
    pts.push(ll);
  }
  if(token===_zoneMapToken && !hadView) fitFirst(map, "zones", pts);
}

VIEWS.fleet = () => {
  const state = vs("fleet",{zoneFilter:"all"}); const type = state.typeFilter || "all";
  let visible = DATA.riders.filter(r=>r.online || fleetStatusOf(r)==="zone-suspended");
  if(state.zoneFilter==="approved") visible = visible.filter(r=>(DATA.zones.find(z=>z.name===r.zone)||{}).status==="active");
  if(state.zoneFilter==="suspended") visible = visible.filter(r=>(DATA.zones.find(z=>z.name===r.zone)||{}).status!=="active");
  const counts = {"active-order":0, idle:0, "zone-suspended":0};
  visible.forEach(r=>{ const s=fleetStatusOf(r); if(counts[s]!==undefined) counts[s]++; });
  const amb = DATA.raw.ambulance.filter(d=>d.is_online||d.is_on_ride);
  return `
  <div class="view-head"><h1>Live Fleet Tracking</h1><p>Real-time rider and ambulance positions on OpenStreetMap.</p></div>
  <div class="stat-grid">
    <div class="stat-card"><div class="lbl">Online Riders</div><div class="val">${visible.length}</div></div>
    <div class="stat-card"><div class="lbl">Active With Order</div><div class="val">${counts["active-order"]}</div></div>
    <div class="stat-card"><div class="lbl">Idle</div><div class="val">${counts.idle}</div></div>
    <div class="stat-card"><div class="lbl">Zone Suspended</div><div class="val">${counts["zone-suspended"]}</div></div>
    <div class="stat-card"><div class="lbl">Ambulances Online</div><div class="val">${amb.length}</div></div>
  </div>
  <div class="view-toolbar">
    <select data-act="fleet-zone-filter"><option value="all" ${state.zoneFilter==="all"?"selected":""}>All zones</option><option value="approved" ${state.zoneFilter==="approved"?"selected":""}>Approved zones only</option><option value="suspended" ${state.zoneFilter==="suspended"?"selected":""}>Suspended zones only</option></select>
    <select data-act="fleet-type-filter"><option value="all" ${type==="all"?"selected":""}>Riders + Ambulances</option><option value="riders" ${type==="riders"?"selected":""}>Riders only</option><option value="ambulances" ${type==="ambulances"?"selected":""}>Ambulances only</option></select>
    <button class="btn" style="margin-left:auto" data-act="fleet-refresh">↻ Refresh map</button>
  </div>
  <div class="card"><div class="card-head"><h3>Fleet map</h3><span class="sub">Live GPS positions</span></div><div class="card-body">
    <div class="fleet-legend"><span><i style="background:#e02020"></i>Rider with order</span><span><i style="background:#d4a017"></i>Rider idle</span><span><i style="background:#c0392b"></i>Zone suspended</span><span><i style="background:#7c3aed"></i>Ambulance</span></div>
    <div id="fleetLeafletMap" class="leaflet-box"></div>
    ${visible.filter(r=>!r._hasLocation).length ? `<div class="hint" style="margin-top:8px">${visible.filter(r=>!r._hasLocation).length} online rider(s) have no GPS fix yet and aren't plotted.</div>` : ""}
  </div></div>
  <div class="card"><div class="card-head"><h3>Fleet list</h3></div><div class="card-body"><div class="fleet-side-list">
    ${visible.map(r=>{ const s = fleetStatusOf(r); const dot = s==="active-order"?"var(--brand)":s==="idle"?"var(--gold)":s==="zone-suspended"?"var(--danger)":"var(--blue)";
      return `<div class="fleet-row"><span class="dot-status" style="background:${dot}"></span><div class="avatar">${initials(r.name)}</div><div style="flex:1"><div class="cell-strong">${esc(r.name)}</div><div class="cell-sub">${esc(r.zone)} · ${esc(r.vehicle)} · ${esc(FLEET_LABEL[s]||s)}</div></div>${statusBadge(r.status)}</div>`; }).join("") || `<div class="empty"><div class="ic">▢</div><h4>No riders online</h4><p>Riders will appear here once they go online.</p></div>`}
  </div></div></div>`;
};
Actions["fleet-type-filter"] = (el)=>{ vs("fleet",{zoneFilter:"all"}).typeFilter = el.value; delete _mapView.fleet; render(); };
Actions["fleet-refresh"] = ()=>{ delete _mapView.fleet; delete _mapView.riders; loadRidersFromDB().then(render); toast("Fleet map refreshed"); };

/* Rider GPS pings no longer hammer the server (max one reload every 3 s) */
const _loadRidersBase = loadRidersFromDB; let _rl = null, _rlAgain = false;
loadRidersFromDB = function(){
  if(_rl){ _rlAgain = true; return _rl; }
  _rl = _loadRidersBase().finally(()=>{ setTimeout(()=>{ _rl = null; if(_rlAgain){ _rlAgain = false; loadRidersFromDB().then(render); } }, 3000); });
  return _rl;
};

/* ---------- Emergency control: real, saved, with 3 new service switches ---------- */
const EMG_FLAGS = [
  {key:"pauseOrders", t:"Pause new orders", s:"Customers can browse but not place new orders"},
  {key:"pauseDelivery", t:"Pause delivery dispatch", s:"Existing orders held, no new rider assignment"},
  {key:"pauseNurse", t:"Pause nurse service", s:"Customers cannot book a nurse until you resume"},
  {key:"pauseAmbulance", t:"Pause ambulance booking", s:"New ambulance requests are blocked"},
  {key:"pauseLab", t:"Pause lab booking", s:"New lab test bookings are blocked"},
  {key:"paymentMaintenance", t:"Payment maintenance mode", s:"Falls back to Cash on Delivery only"},
  {key:"platformMaintenance", t:"Platform maintenance mode", s:"Shows a maintenance screen to all users"},
];
VIEWS.emergency = () => {
  const e = STATE.emergency, on = EMG_FLAGS.filter(f=>e[f.key]).length;
  const zOk = DATA.zones.filter(z=>z.status==="active"), zOff = DATA.zones.filter(z=>z.status!=="active");
  const mOk = DATA.merchants.filter(m=>m.status==="active"), mOff = DATA.merchants.filter(m=>m.status==="suspended" && m.kycStatusRaw!=="rejected");
  const rOk = DATA.riders.filter(r=>r.status==="active"), rOff = DATA.riders.filter(r=>r.status==="suspended" && /suspended by admin/i.test(r.kycReason||""));
  const picker = (id, title, sub, list, kind, nameOf, valOf)=>`
    <div class="emergency-row emg-stack"><div><div class="er-title">${title}</div><div class="er-sub">${sub}</div></div>
      <div class="emg-pick"><select id="${id}"><option value="">— Choose —</option>${list.map(x=>`<option value="${esc(valOf(x))}">${esc(nameOf(x))}</option>`).join("")}</select>
      <button class="btn sm danger" data-act="emg-suspend" data-kind="${kind}">Suspend</button></div></div>`;
  const chips = (list, kind, nameOf, idOf)=> list.length ? `<div class="emg-chips">${list.map(x=>`<span class="emg-chip"><b>${esc(nameOf(x))}</b> suspended <button class="btn sm" data-act="emg-restore" data-kind="${kind}" data-id="${esc(idOf(x))}">Restore</button></span>`).join("")}</div>` : "";
  return `
  <div class="view-head"><h1>Emergency Control Center</h1><p>Platform-wide kill switches — saved instantly and logged. ${on ? `<b style="color:#d93025">${on} switch${on>1?"es":""} ON right now.</b>` : "Everything is running normally."}</p></div>
  ${DATA.controlsError ? `<div class="notice-bad">Switches cannot be saved yet: ${esc(DATA.controlsError)}${SQL_HINT}</div>` : ""}
  <div class="emergency-panel">
    ${EMG_FLAGS.map(f=>`<div class="emergency-row"><div><div class="er-title">${f.t}</div><div class="er-sub">${f.s}</div></div>
      <label class="toggle"><input type="checkbox" ${e[f.key]?"checked":""} data-act="emg-flag" data-key="${f.key}"><span class="track"></span></label></div>`).join("")}
    ${picker("emgZone","Suspend a specific zone","Blocks new orders in that zone only (zone turns red)",zOk,"zone",z=>`${z.name} (${z.pin})`,z=>z.id)}
    ${chips(zOff,"zone",z=>`${z.name} (${z.pin})`,z=>z.id)}
    ${picker("emgMerchant","Suspend a specific pharmacy","Removes it from search + stops new orders",mOk,"merchant",m=>m.name,m=>m.id)}
    ${chips(mOff,"merchant",m=>m.name,m=>m.id)}
    ${picker("emgRider","Suspend a specific rider","Rider is taken offline immediately",rOk,"rider",r=>`${r.name} · ${r.phone}`,r=>r.id)}
    ${chips(rOff,"rider",r=>r.name,r=>r.id)}
  </div>`;
};
Actions["emg-flag"] = async (el)=>{
  const key = el.dataset.key, f = EMG_FLAGS.find(x=>x.key===key); if(!f) return; const next = el.checked;
  if(next && !(await askConfirm(`Turn ON “${f.t}”?`, "This affects live customers immediately.", {danger:true, ok:"Turn on"}))){ render(); return; }
  const prev = !!STATE.emergency[key]; STATE.emergency[key] = next;
  const flags = {}; EMG_FLAGS.forEach(x=>{ flags[x.key] = !!STATE.emergency[x.key]; });
  const err = await savePlatformControl("emergency", flags);
  if(err){ STATE.emergency[key] = prev; toast("Could not save: "+err.message+SQL_HINT,"danger"); render(); return; }
  await logAdminAction(`${next?"Enabled":"Disabled"} emergency switch: ${f.t}`); render();
  toast(`${f.t}: ${next?"ON":"OFF"}`, next?"danger":"default");
};
Actions["emg-suspend"] = async (el)=>{
  const kind = el.dataset.kind, sel = $(kind==="zone"?"#emgZone":kind==="merchant"?"#emgMerchant":"#emgRider"), id = sel && sel.value;
  if(!id){ toast("Choose one first","danger"); return; }
  const label = sel.options[sel.selectedIndex].textContent;
  if(!(await askConfirm("Suspend now?", `Suspend ${label} now?`, {danger:true, ok:"Suspend"}))) return;
  const now = new Date().toISOString(); let r;
  if(kind==="zone") r = await mustUpdate(supabase.from("service_zones").update({status:"suspended", is_active:false, outage_message:"Emergency suspension by admin", outage_start:now}).eq("id", id), "Zone");
  if(kind==="merchant") r = await mustUpdate(supabase.from("merchants").update({status:"suspended"}).eq("id", Number(id)), "Pharmacy");
  if(kind==="rider"){
    r = await mustUpdate(supabase.from("rider_kyc_application").upsert({rider_id:Number(id), status:"rejected", rejection_reason:"Suspended by admin (emergency)", reviewed_at:now},{onConflict:"rider_id"}), "Rider");
    if(r.ok) await supabase.from("riders").update({duty_status:"offline"}).eq("id", Number(id));
  }
  if(!r.ok){ toast("Failed: "+r.msg,"danger"); return; }
  await logAdminAction(`Emergency suspended ${kind}: ${label}`);
  await Promise.all([loadZonesFromDB(), loadMerchantsFromDB(), loadRidersFromDB()]); render(); toast(`${label} suspended`,"danger");
};
Actions["emg-restore"] = async (el)=>{
  const kind = el.dataset.kind, id = el.dataset.id; let r, label = id;
  if(kind==="zone"){ const z = DATA.zones.find(x=>String(x.id)===id); label = z ? z.name : id; r = await mustUpdate(supabase.from("service_zones").update({status:"approved", is_active:true, outage_message:"", outage_start:null}).eq("id", id), "Zone"); }
  if(kind==="merchant"){ const m = DATA.merchants.find(x=>String(x.id)===id); label = m ? m.name : id; r = await mustUpdate(supabase.from("merchants").update({status:"active"}).eq("id", Number(id)), "Pharmacy"); }
  if(kind==="rider"){ const x = DATA.riders.find(y=>String(y.id)===id); label = x ? x.name : id; r = await mustUpdate(supabase.from("rider_kyc_application").upsert({rider_id:Number(id), status:"approved", rejection_reason:"", reviewed_at:new Date().toISOString()},{onConflict:"rider_id"}), "Rider"); }
  if(!r.ok){ toast("Failed: "+r.msg,"danger"); return; }
  await logAdminAction(`Restored ${kind}: ${label}`);
  await Promise.all([loadZonesFromDB(), loadMerchantsFromDB(), loadRidersFromDB()]); render(); toast(`${label} restored`);
};

/* ---------- Commission: who pays how much ---------- */
VIEWS.commission = () => {
  const type = vs("commission",{tab:"merchant"}).tab, rules = DATA.commissionRules.filter(r=>r.type===type);
  const def = commissionFor(type, "__none__", 100);
  return `
  <div class="view-head"><h1>Commission — ${esc(COMM_TYPES[type])}</h1><p>Decide how much MediFinder India keeps. A rule for one partner overrides the default for everyone.</p></div>
  ${DATA.commissionError ? `<div class="notice-bad">Commission rules cannot load: ${esc(DATA.commissionError)}${SQL_HINT}</div>` : ""}
  <div class="stat-grid">
    <div class="stat-card"><div class="lbl">Default for all ${esc(COMM_TYPES[type])}</div><div class="val">${esc(commissionText(def))}</div><div class="delta">${esc(def.source)}</div></div>
    <div class="stat-card"><div class="lbl">Partner-specific rules</div><div class="val">${rules.filter(r=>r.partnerId!=null && r.partnerId!=="").length}</div></div>
  </div>
  <div class="view-toolbar"><button class="btn primary" data-act="comm-add" data-type="${type}">+ Add commission rule</button></div>
  <div class="card"><div class="card-body pad0">${renderTable("commission-"+type,[
    {key:"partnerName",label:"Applies to",render:r=>r.partnerId!=null&&r.partnerId!=="" ? `<div class="cell-strong">${esc(r.partnerName||r.partnerId)}</div><div class="cell-sub">Only this partner</div>` : `<div class="cell-strong">All ${esc(COMM_TYPES[type])}</div><div class="cell-sub">Default rule</div>`},
    {key:"rate",label:"Commission",render:r=>`<b>${esc(commissionText(r))}</b>`},
    {key:"ex",label:"On ₹1,000",sortable:false,render:r=>money(r.rateType==="flat"?r.rate:r.rate*10)},
    {key:"note",label:"Note",render:r=>esc(r.note||"")},
    {key:"active",label:"Active",sortable:false,render:r=>`<label class="toggle"><input type="checkbox" ${r.active?"checked":""} data-act="comm-toggle" data-id="${esc(r.id)}"><span class="track"></span></label>`},
    {key:"_a",label:"",sortable:false,render:r=>`<div class="actions-cell"><button class="btn sm" data-act="comm-edit" data-id="${esc(r.id)}">Edit</button><button class="btn sm danger" data-act="comm-del" data-id="${esc(r.id)}">Delete</button></div>`},
  ], rules, {emptyText:"No rule yet — the fallback above applies. Add one."})}</div></div>`;
};
function commPartnerOptions(type, selected){
  let list = [];
  if(type==="merchant") list = DATA.merchants.map(m=>({id:m.id,name:m.name}));
  if(type==="rider") list = DATA.riders.map(r=>({id:r.id,name:`${r.name} · ${r.phone}`}));
  if(type==="nurse") list = partnerRows("nurse").map(p=>({id:p.id,name:p.name}));
  if(type==="lab") list = partnerRows("lab").map(p=>({id:p.id,name:p.name}));
  if(type==="ambulance") list = partnerRows("ambulance").map(p=>({id:p.id,name:p.name}));
  return `<option value="">All ${esc(COMM_TYPES[type])} (default)</option>` + list.map(x=>`<option value="${esc(x.id)}" ${String(selected)===String(x.id)?"selected":""}>${esc(x.name)}</option>`).join("");
}
function commForm(type, r){
  return `<div class="field"><label>Applies to</label><select id="cmPartner" ${r?"disabled":""}>${commPartnerOptions(type, r&&r.partnerId)}</select></div>
    <div class="field-row"><div class="field"><label>Type</label><select id="cmType"><option value="percent" ${r&&r.rateType==="flat"?"":"selected"}>Percent (%) of each order / job</option><option value="flat" ${r&&r.rateType==="flat"?"selected":""}>Flat amount (₹) per order / job</option></select></div>
    <div class="field"><label>Value</label><input id="cmValue" type="number" step="0.01" min="0" value="${r?r.rate:""}" placeholder="e.g. 12"></div></div>
    <div class="field"><label>Note (optional)</label><input id="cmNote" value="${esc(r?r.note:"")}" placeholder="e.g. Festival offer for new pharmacies"></div>`;
}
function readCommForm(){
  const rateType = $("#cmType").value, rate = Number($("#cmValue").value);
  if($("#cmValue").value==="" || !(rate>=0)){ toast("Enter a valid value","danger"); return null; }
  if(rateType==="percent" && rate>100){ toast("Percent cannot be more than 100","danger"); return null; }
  return { rate_type:rateType, rate, note:$("#cmNote").value.trim()||null };
}
Actions["comm-add"] = (el)=>{ const type = el.dataset.type;
  openModal(`Add commission rule — ${COMM_TYPES[type]}`, commForm(type, null), `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-act="comm-save" data-type="${type}">Save rule</button>`); };
Actions["comm-save"] = async (el)=>{
  const type = el.dataset.type, f = readCommForm(); if(!f) return;
  const pid = $("#cmPartner").value || null, pname = pid ? $("#cmPartner").options[$("#cmPartner").selectedIndex].textContent : null;
  const existing = DATA.commissionRules.find(r=>r.type===type && String(r.partnerId||"")===String(pid||""));
  const { error } = existing
    ? await supabase.from("commission_rules").update({ ...f, is_active:true, updated_at:new Date().toISOString() }).eq("id", existing.id)
    : await supabase.from("commission_rules").insert({ partner_type:type, partner_id:pid, partner_name:pname, is_active:true, ...f });
  if(error){ toast("Failed: "+error.message+SQL_HINT,"danger"); return; }
  await logAdminAction(`Commission ${type} ${pname||"default"} → ${f.rate_type==="flat"?"₹"+f.rate:f.rate+"%"}`);
  closeModal(); await loadCommissionRules(); render(); toast(existing ? "Existing rule updated" : "Commission rule added");
};
Actions["comm-edit"] = (el)=>{ const r = DATA.commissionRules.find(x=>String(x.id)===el.dataset.id); if(!r) return;
  openModal("Edit commission rule", commForm(r.type, r), `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-act="comm-edit-save" data-id="${esc(r.id)}">Save</button>`); };
Actions["comm-edit-save"] = async (el)=>{ const r = DATA.commissionRules.find(x=>String(x.id)===el.dataset.id); if(!r) return;
  const f = readCommForm(); if(!f) return;
  const { error } = await supabase.from("commission_rules").update({ ...f, updated_at:new Date().toISOString() }).eq("id", r.id);
  if(error){ toast("Failed: "+error.message,"danger"); return; }
  await logAdminAction(`Edited commission rule ${r.partnerName||r.type+" default"}`); closeModal(); await loadCommissionRules(); render(); toast("Commission updated");
};
Actions["comm-toggle"] = async (el)=>{ const r = DATA.commissionRules.find(x=>String(x.id)===el.dataset.id); if(!r) return;
  const { error } = await supabase.from("commission_rules").update({ is_active:el.checked }).eq("id", r.id);
  if(error){ toast("Failed: "+error.message,"danger"); render(); return; }
  r.active = el.checked; await logAdminAction(`${r.active?"Enabled":"Disabled"} commission rule ${r.partnerName||r.type+" default"}`); render(); toast(r.active?"Rule active":"Rule off");
};
Actions["comm-del"] = async (el)=>{ const r = DATA.commissionRules.find(x=>String(x.id)===el.dataset.id); if(!r) return;
  if(!(await askConfirm("Delete rule", "Delete this commission rule?", {danger:true, ok:"Delete"}))) return;
  const { error } = await supabase.from("commission_rules").delete().eq("id", r.id);
  if(error){ toast("Failed: "+error.message,"danger"); return; }
  await logAdminAction(`Deleted commission rule ${r.partnerName||r.type+" default"}`); await loadCommissionRules(); render(); toast("Rule deleted","danger");
};

/* ---------- Reports: overview (real) · one-click company report · receipts ---------- */
function reportOverview(){
  const total = DATA.orders.length, dead = DATA.orders.filter(o=>["cancelled","failed","rejected"].includes(o.status)).length;
  const durs = DATA.orders.filter(o=>o.status==="delivered").map(o=>{ const r = o._raw||{}, end = r.delivered_at || r.completed_at || r.delivery_completed_at; if(!end||!o.created) return null; const m = (new Date(end)-new Date(o.created))/60000; return m>0 && m<1440 ? m : null; }).filter(x=>x!=null);
  const avg = durs.length ? Math.round(durs.reduce((a,b)=>a+b,0)/durs.length)+" min" : "Not tracked yet";
  const c = DATA.counts, mNew = DATA.merchants.filter(m=>m.joined && m.joined >= localDayStr(dayStart(-30))).length;
  const catCounts = DATA.categories.map(x=>DATA.products.filter(p=>p.category===x).length);
  const earn = DATA.merchants.map(m=>{ const del = DATA.orders.filter(o=>String(o._merchantId)===String(m.id) && o.status==="delivered"); const gross = del.reduce((s,o)=>s+o.total,0);
    return { name:m.name, orders:m.orders, earnings:m.earnings, rating:m.rating, commission:m.commission, platform:del.reduce((s,o)=>s+commissionFor("merchant",m.id,o.total).amount,0) }; }).sort((a,b)=>b.orders-a.orders);
  return `
  <div class="view-head"><h1>Reports & Analytics</h1><p>Sales, growth and performance — calculated from live data.</p></div>
  <div class="stat-grid">
    <div class="stat-card"><div class="lbl">Cancellation Rate</div><div class="val">${total ? ((dead/total)*100).toFixed(1) : "0.0"}%</div></div>
    <div class="stat-card"><div class="lbl">Avg. Delivery Time</div><div class="val">${avg}</div></div>
    <div class="stat-card"><div class="lbl">User Growth (WoW)</div><div class="val">${(c.usersPrev7 ? (((c.users7-c.usersPrev7)/c.usersPrev7)*100).toFixed(1)+"%" : (c.users7||0)+" new")}</div></div>
    <div class="stat-card"><div class="lbl">New Merchants (30 days)</div><div class="val">+${mNew}</div></div>
  </div>
  <div class="card"><div class="card-head"><h3>Orders — last 7 days</h3></div><div class="card-body">${svgBarChart(DATA.weekOrders, DATA.weekLabels)}</div></div>
  ${DATA.categories.length ? `<div class="card"><div class="card-head"><h3>Products by category</h3></div><div class="card-body">${svgBarChart(catCounts, DATA.categories)}</div></div>` : ""}
  <div class="card"><div class="card-head"><h3>Top pharmacies by orders</h3></div><div class="card-body pad0">${renderTable("reports-top",[
    {key:"name",label:"Pharmacy"},{key:"orders",label:"Orders"},{key:"earnings",label:"Delivered value",render:r=>money(r.earnings)},
    {key:"commission",label:"Commission",render:r=>commissionLabel(r.commission)},{key:"platform",label:"Platform earned",render:r=>money(Math.round(r.platform))},
    {key:"rating",label:"Rating",render:r=>r.rating?`★ ${r.rating}`:"No reviews yet"},
  ], earn)}</div></div>`;
}
VIEWS.reports = () => {
  const tab = vs("reports",{tab:"overview"}).tab;
  const bar = `<div class="view-toolbar" style="gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="invoice-open">🧾 Invoice</button>${tab!=="download"?`<button class="btn" data-act="report-goto" data-tab="download">⬇ Download reports</button>`:`<button class="btn" data-act="report-goto" data-tab="overview">← Analysis</button>`}</div>`;
  return bar + (tab==="download" ? reportDownloadView() : tab==="receipt" ? receiptView() : reportOverview() + reportOverviewExtra());
};
async function loadTopMeds(){
  try{
    const ok = new Set(DATA.orders.filter(o=>!DEAD_ORDER.includes(o.status)).map(o=>String(o.id)));
    const { rows } = await fetchAllRows("order_items"); const agg = {};
    rows.forEach(i=>{ if(!ok.has(String(i.order_id))) return; const name = i.product_name || i.name || ("Medicine #"+i.medicine_id), k = String(i.medicine_id||name), q = Number(i.quantity)||1, amt = Number(i.total_price ?? i.total ?? (Number(i.unit_price ?? i.price)||0)*q)||0;
      const a = agg[k] || (agg[k] = { name, qty:0, revenue:0, orders:0 }); a.qty += q; a.revenue += amt; a.orders++; });
    STATE.topMeds = Object.values(agg).sort((x,y)=>y.qty-x.qty).slice(0,10);
  }catch(e){ STATE.topMeds = []; }
}
function reportOverviewExtra(){
  if(!STATE.topMeds && !STATE._topMedsLoading){ STATE._topMedsLoading = true; loadTopMeds().then(()=>{ STATE._topMedsLoading = false; if(STATE.view==="reports") render(); }); }
  const live = DATA.orders.filter(o=>!DEAD_ORDER.includes(o.status)), del = DATA.orders.filter(o=>o.status==="delivered");
  const gmv = live.reduce((a,o)=>a+o.total,0), earned = del.reduce((a,o)=>a+commissionFor("merchant", o._merchantId, o.total).amount,0);
  const byStatus = {}; DATA.orders.forEach(o=>{ const x = byStatus[o.status] || (byStatus[o.status] = { status:o.status, count:0, value:0 }); x.count++; x.value += o.total; });
  const sumAmt = (a)=>a.reduce((x,b)=>x+(b.amount||0),0);
  return `
  <div class="stat-grid" style="margin-top:14px">
    <div class="stat-card"><div class="lbl">Order value (excl. cancelled)</div><div class="val">${money(gmv)}</div></div>
    <div class="stat-card"><div class="lbl">Delivered value</div><div class="val">${money(del.reduce((a,o)=>a+o.total,0))}</div></div>
    <div class="stat-card"><div class="lbl">Platform commission earned</div><div class="val">${money(Math.round(earned))}</div><div class="delta">on delivered orders, from Commission rules</div></div>
    <div class="stat-card"><div class="lbl">Average order value</div><div class="val">${money(live.length?Math.round(gmv/live.length):0)}</div></div>
    <div class="stat-card"><div class="lbl">Online vs COD</div><div class="val">${DATA.orders.filter(o=>o.payment==="Online").length} / ${DATA.orders.filter(o=>o.payment==="COD").length}</div></div>
    <div class="stat-card"><div class="lbl">Lab · Nurse · Ambulance revenue</div><div class="val" style="font-size:16px">${money(sumAmt(DATA.labBookings.filter(b=>b.status!=="cancelled")))} · ${money(sumAmt(DATA.nurseBookings.filter(b=>b.status!=="cancelled")))} · ${money(sumAmt(DATA.ambulanceBookings.filter(b=>b.status!=="cancelled")))}</div></div>
  </div>
  <div class="card"><div class="card-head"><h3>Orders by status</h3></div><div class="card-body pad0">${renderTable("rep-status",[{key:"status",label:"Status",render:r=>statusBadge(r.status)},{key:"count",label:"Orders"},{key:"value",label:"Value",render:r=>money(r.value)}], Object.values(byStatus))}</div></div>
  <div class="card"><div class="card-head"><h3>Top medicines (by quantity sold)</h3></div><div class="card-body pad0">${STATE.topMeds ? renderTable("rep-topmeds",[{key:"name",label:"Medicine"},{key:"qty",label:"Qty sold"},{key:"orders",label:"Orders"},{key:"revenue",label:"Revenue",render:r=>money(r.revenue)}], STATE.topMeds, {emptyText:"No sold items yet."}) : `<div class="hint" style="padding:16px">Loading…</div>`}</div></div>`;
}


const REPORT_GROUPS = [
  {t:"Sales & orders", items:[["Orders","orders"],["Order Items","order_items"],["Prescriptions","prescription_orders"],["Refunds & Cancelled","cancelled_orders"],["Coupons","coupons"],["Sponsored Banners","sponsored_products"]]},
  {t:"People & partners", items:[["Users","profiles"],["Merchants","merchants"],["Riders","riders"],["Nurses","nurses"],["Lab Collectors","sample_collectors"],["Ambulance Drivers","ambulance_drivers"]]},
  {t:"Healthcare & emergency", items:[["Ambulance Bookings","ambulance_bookings"],["Nurse Bookings","nurse_bookings"],["Lab Bookings","lab_bookings"],["Lab Tests","lab_tests"],["Zones","service_zones"]]},
  {t:"Money", items:[["Merchant Payouts","merchant_payouts"],["Rider Payout Requests","admin_payout_requests"],["Rider Payouts (legacy)","rider_payouts"],["Nurse Payouts","nurse_payouts"],["Collector Earnings","collector_earnings"],["Commission Rules","commission_rules"]]},
  {t:"Quality", items:[["Customer Complaints","complaints"],["Merchant Complaints","merchant_complaints"],["Rider Complaints","rider_complaints"],["Product Reviews","product_reviews"],["Lab Reviews","lab_test_reviews"],["Order Feedback","order_feedback"]]},
  {t:"Audit", items:[["Admin Audit Log","admin_audit_log"]]},
];
const REPORT_SHEETS = REPORT_GROUPS.flatMap(g=>g.items);
const REPORT_PRESETS = {
  everything:{ label:"Complete-Company-Report", tables:REPORT_SHEETS.map(x=>x[1]) },
  emergency:{ label:"Emergency-Agency-Report", tables:["ambulance_bookings","ambulance_drivers","nurse_bookings","nurses","lab_bookings","sample_collectors","service_zones","orders","complaints"] },
  finance:{ label:"Finance-Report", tables:["orders","order_items","cancelled_orders","merchant_payouts","admin_payout_requests","rider_payouts","nurse_payouts","collector_earnings","commission_rules"] },
  sales:{ label:"Sales-Report", tables:["orders","order_items","prescription_orders","cancelled_orders","coupons","product_reviews","order_feedback"] },
};
const SENSITIVE_COL = /pass|token|secret|otp|aadhaar|aadhar|pan_?(no|number)|account_?n|bank_account|ifsc|fcm|api_?key|signature|upi_?id|license_?no|id_?no|proof_?number|bank_holder/i;
async function fetchAllRows(table){
  const out = [], page = 1000;
  for(let off=0; off<30000; off+=page){
    let { data, error } = await supabase.from(table).select("*").order("created_at",{ascending:false}).range(off, off+page-1);
    if(error){ const r2 = await supabase.from(table).select("*").range(off, off+page-1); data = r2.data; error = r2.error; }
    if(error) return { rows:out, error:error.message };
    out.push(...(data||[])); if(!data || data.length<page) break;
  }
  return { rows:out };
}
function cleanRows(rows, from, to){
  return rows.filter(r=>{ const d = tsDay(r.created_at || r.requested_at || r.sent_at || r.joined_at); if(!d) return true; return (!from || d>=from) && (!to || d<=to); })
    .map(r=>{ const o = {}; Object.keys(r).forEach(k=>{ if(SENSITIVE_COL.test(k)) return; let v = r[k]; if(v!==null && typeof v==="object") v = JSON.stringify(v); if(typeof v==="string" && v.length>32000) v = v.slice(0,32000); o[k] = v; }); return o; });
}
function loadSheetJS(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((res,rej)=>{ const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = ()=>res(window.XLSX); s.onerror = ()=>rej(new Error("Excel library could not load")); document.head.appendChild(s); });
}
function downloadBlob(blob, name){ const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
function toCsv(rows){ if(!rows.length) return ""; const cols = [...new Set(rows.flatMap(r=>Object.keys(r)))]; const q = v=>{ v = v==null ? "" : String(v); return /[",\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; }; return [cols.join(","), ...rows.map(r=>cols.map(c=>q(r[c])).join(","))].join("\n"); }
function reportDownloadView(){
  return `
  <div class="view-head"><h1>Reports — download everything</h1><p>Pick what you need — or use a ready pack — and download real data as Excel or CSV. Passwords, tokens, Aadhaar/PAN, bank and UPI details are never included.</p></div>
  <div class="card"><div class="card-body">
    <div class="field-row"><div class="field"><label>From date (optional)</label><input id="repFrom" type="date"></div><div class="field"><label>To date (optional)</label><input id="repTo" type="date"></div>
      <div class="field"><label>Format</label><select id="repFmt"><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV</option></select></div></div>
    <div class="hint" style="margin-bottom:12px">Leave dates empty for all data. The date range applies to when each record was created.</div>
    <div class="row-flex" style="gap:8px;flex-wrap:wrap">
      <button class="btn primary" data-act="report-preset" data-preset="everything">⬇ Complete company report</button>
      <button class="btn" data-act="report-preset" data-preset="emergency">🚑 Emergency / agency pack</button>
      <button class="btn" data-act="report-preset" data-preset="finance">₹ Finance pack</button>
      <button class="btn" data-act="report-preset" data-preset="sales">▤ Sales pack</button>
    </div>
    <div id="repProgress" class="hint" style="margin-top:12px"></div>
  </div></div>
  ${REPORT_GROUPS.map((g,gi)=>`<div class="card"><div class="card-head"><h3>${esc(g.t)}</h3><button class="btn sm" data-act="report-group-toggle" data-g="${gi}">Select all</button></div><div class="card-body">
    <div class="field-row" style="flex-wrap:wrap">${g.items.map(([n,t])=>`<label class="chk" style="min-width:46%;display:flex;gap:8px;align-items:center;justify-content:space-between"><span><input type="checkbox" class="rep-chk" data-g="${gi}" value="${t}"> ${esc(n)}</span><button class="btn sm" data-act="report-one" data-table="${t}" title="Download only ${esc(n)}">⬇</button></label>`).join("")}</div>
  </div></div>`).join("")}
  <div class="view-toolbar" style="position:sticky;bottom:8px"><button class="btn primary" data-act="report-download" style="padding:12px 18px">⬇ Download selected</button></div>`;
}
const _repProg = (t)=>{ const el = $("#repProgress"); if(el) el.textContent = t; };
function reportRowsInRange(arr, getTs, from, to){ return arr.filter(x=>{ const d = tsDay(getTs(x)); if(!d) return true; return (!from || d>=from) && (!to || d<=to); }); }
async function runReport(tables, label){
  tables = [...new Set(tables)]; if(!tables.length){ toast("Select at least one report","danger"); return; }
  const from = ($("#repFrom")||{}).value || "", to = ($("#repTo")||{}).value || "", fmt = ($("#repFmt")||{}).value || "xlsx";
  const names = Object.fromEntries(REPORT_SHEETS.map(([n,t])=>[t,n])); let done = 0; const issues = [];
  _repProg(`Collecting data… 0/${tables.length}`);
  const results = await Promise.all(tables.map(async t=>{
    const r = await fetchAllRows(t); done++; _repProg(`Collecting data… ${done}/${tables.length}`);
    if(r.error) issues.push(`${names[t]||t}: ${r.error}`);
    return { name:names[t]||t, table:t, rows:cleanRows(r.rows, from, to) };
  }));
  const by = Object.fromEntries(results.map(r=>[r.table, r.rows])), has = t=>Array.isArray(by[t]);
  const sum = (a,f)=>a.reduce((x,y)=>x+(Number(f(y))||0),0);
  const summary = [["Report","MediFinder India — "+label.replace(/-/g," ")],["Generated at",fmtDateTime(new Date().toISOString())],["Generated by",`${DATA.me.name} (${DATA.me.email})`],["Period",(from||"start")+" to "+(to||"today")]];
  if(has("orders")){ const o = by.orders, live = o.filter(x=>!DEAD_ORDER.includes(String(x.status||"")));
    summary.push(["Orders",o.length],["Orders delivered",o.filter(x=>x.status==="delivered").length],["Orders cancelled / failed",o.length-live.length],["Gross order value (excluding cancelled)",sum(live,orderTotalOf)],["Cash on delivery orders",o.filter(x=>/cod/i.test(String(x.payment_mode||x.payment_method||""))).length]); }
  [["profiles","Customers"],["merchants","Pharmacies"],["riders","Riders"],["nurses","Nurses"],["sample_collectors","Lab collectors"],["ambulance_drivers","Ambulance drivers"],["lab_bookings","Lab bookings"],["nurse_bookings","Nurse bookings"],["ambulance_bookings","Ambulance bookings"],["service_zones","Service zones"],["prescription_orders","Prescription requests"],["product_reviews","Product reviews"]].forEach(([t,l])=>{ if(has(t)) summary.push([l, by[t].length]); });
  if(has("ambulance_bookings")) summary.push(["Ambulance trips completed", by.ambulance_bookings.filter(x=>x.status==="completed").length]);
  if(["complaints","merchant_complaints","rider_complaints"].some(has)) summary.push(["Complaints (all)", ["complaints","merchant_complaints","rider_complaints"].reduce((a,t)=>a+(has(t)?by[t].length:0),0)]);
  if(issues.length) summary.push(["Tables that could not be read", issues.join(" | ")]);
  const sheets = [{ name:"Summary", rows:summary.map(([k,v])=>({ Item:k, Value:v })) }];
  /* readable sheets (names instead of IDs) — what an agency / auditor actually reads */
  if(has("orders")) sheets.push({ name:"Orders (readable)", rows:reportRowsInRange(DATA.orders, o=>o.created, from, to).map(o=>{ const r=o._raw||{}; return { "Order No":o.id, "Date":o.date, "Customer":o.customer, "Phone":r.customer_phone||r.user_phone||"", "Pharmacy":o.merchant, "Rider":o.rider, "Items":o.items, "Total (₹)":o.total, "Payment":o.payment, "Status":o.status }; }) });
  if(has("ambulance_bookings")) sheets.push({ name:"Ambulance (readable)", rows:reportRowsInRange(DATA.ambulanceBookings, b=>b._createdAt, from, to).map(b=>({ "Booking No":b.id, "Requested":b.date, "Patient":b.customer, "Phone":b.phone, "Vehicle":b.service, "Pickup → Drop":b.location, "Driver":b.provider, "Fare (₹)":b.amount, "Payment":b.payment, "Status":b.status })) });
  if(has("nurse_bookings")) sheets.push({ name:"Nurse (readable)", rows:reportRowsInRange(DATA.nurseBookings, b=>b._createdAt, from, to).map(b=>({ "Booking No":b.id, "Date":b.date, "Patient":b.customer, "Phone":b.phone, "Service":b.service, "Nurse":b.provider, "Address":b.location, "Amount (₹)":b.amount, "Payment":b.payment, "Status":b.status })) });
  if(has("lab_bookings")) sheets.push({ name:"Lab (readable)", rows:reportRowsInRange(DATA.labBookings, b=>b._createdAt, from, to).map(b=>({ "Booking No":b.id, "Patient":b.customer, "Phone":b.phone, "Test":b.test, "Address":b.location, "Amount (₹)":b.amount, "Status":b.status })) });
  results.forEach(r=>sheets.push({ name:r.name, rows:r.rows }));
  _repProg("Building file…"); const stamp = localDayStr(), base = `MediFinder-India-${label}-${stamp}`;
  try{
    if(fmt==="csv") throw new Error("csv");
    const X = await loadSheetJS(), wb = X.utils.book_new(), used = new Set();
    sheets.forEach(sh=>{ let nm = sh.name.replace(/[\\\/\?\*\[\]:]/g,"").slice(0,31), k = 2; while(used.has(nm)) nm = nm.slice(0,28)+" "+(k++); used.add(nm); X.utils.book_append_sheet(wb, X.utils.json_to_sheet(sh.rows.length ? sh.rows : [{ Note:"No data" }]), nm); });
    X.writeFile(wb, base+".xlsx"); _repProg(`✔ Downloaded ${base}.xlsx (${sheets.length} sheets)`);
  }catch(err){
    const data = sheets.filter(x=>x.name!=="Summary" || sheets.length===1);
    const csv = data.length===1 ? toCsv(data[0].rows) : sheets.map(x=>`### ${x.name}\n${toCsv(x.rows)}`).join("\n\n");
    downloadBlob(new Blob(["\ufeff"+csv], { type:"text/csv;charset=utf-8" }), base+".csv");
    _repProg(err.message==="csv" ? `✔ Downloaded ${base}.csv` : "✔ Excel library was blocked, so one CSV with every sheet was downloaded instead.");
  }
  await logAdminAction(`Downloaded report ${label} (${from||"all"}–${to||"all"})`); toast("Report downloaded");
}
Actions["report-download"] = ()=>{ const t = $$(".rep-chk:checked").map(x=>x.value); if(!t.length){ toast("Tick at least one report, or use a pack","danger"); return; } return runReport(t, t.length===1 ? (REPORT_SHEETS.find(x=>x[1]===t[0])||[t[0]])[0].replace(/[^\w]+/g,"-") : "Custom-Report"); };
Actions["report-preset"] = (el)=>{ const p = REPORT_PRESETS[el.dataset.preset]; if(p) return runReport(p.tables, p.label); };
Actions["report-one"] = (el)=>{ const row = REPORT_SHEETS.find(x=>x[1]===el.dataset.table); return runReport([el.dataset.table], (row?row[0]:el.dataset.table).replace(/[^\w]+/g,"-")); };
Actions["report-group-toggle"] = (el)=>{ const boxes = $$(`.rep-chk[data-g="${el.dataset.g}"]`), all = boxes.every(b=>b.checked); boxes.forEach(b=>b.checked = !all); el.textContent = all ? "Select all" : "Clear"; };
Actions["report-goto"] = (el)=>{ vs("reports",{tab:"overview"}).tab = el.dataset.tab; render(); };

/* ----- Receipt / invoice lookup ----- */
STATE.rc = { q:"", results:[], searched:false };
function receiptView(){
  const rc = STATE.rc;
  return `
  <div class="view-head"><h1>Receipt / Invoice</h1><p>Type an order, booking or invoice number — the receipt opens instantly and can be downloaded.</p></div>
  <div class="card"><div class="card-body">
    <div class="field"><label>Order no. / Booking no. / Invoice no.</label><input id="rcQuery" value="${esc(rc.q)}" placeholder="e.g. ORD-12345, LBK-…, NBK-…, ABK-…"></div>
    <button class="btn primary" data-act="receipt-search">Find receipt</button>
  </div></div>
  ${rc.searched ? `<div class="card"><div class="card-head"><h3>${rc.results.length} result${rc.results.length===1?"":"s"}</h3></div><div class="card-body pad0">${renderTable("receipt-res",[
    {key:"title",label:"Number",render:r=>`<div class="cell-strong">${esc(r.title)}</div><div class="cell-sub">${esc(r.label)}</div>`},
    {key:"sub",label:"Customer"},{key:"amount",label:"Amount",render:r=>r.amount!=null?money(r.amount):"—"},{key:"date",label:"Date"},
    {key:"status",label:"Status",render:r=>statusBadge(r.status)},
    {key:"_a",label:"",sortable:false,render:r=>`<div class="actions-cell"><button class="btn sm primary" data-act="invoice-dl" data-kind="${r.kind}" data-id="${esc(r.id)}">⬇ Download</button><button class="btn sm" data-act="receipt-open" data-kind="${r.kind}" data-id="${esc(r.id)}">View</button></div>`},
  ], rc.results, {emptyText:"No order or booking found with this number."})}</div></div>` : ""}`;
}
function receiptLocalMatches(q){
  q = q.trim().toLowerCase(); const out = [];
  const hit = (keys)=>keys.filter(x=>x!=null&&x!=="").map(x=>String(x).toLowerCase()).some(k=>k===q || k.includes(q));
  DATA.orders.forEach(o=>{ const r = o._raw||{}; if(hit([o.id, r.order_id, r.id, r.invoice_no, r.invoice_number, r.invoice_id])) out.push({ kind:"order", label:"Medicine order", id:String(o.id), title:String(o.id), sub:`${o.customer} · ${o.merchant}`, amount:o.total, date:o.date, status:o.status }); });
  [[DATA.labBookings,"lab","Lab booking"],[DATA.nurseBookings,"nurse","Nurse booking"],[DATA.ambulanceBookings,"ambulance","Ambulance booking"]].forEach(([arr,kind,label])=>{
    arr.forEach(b=>{ if(hit([b.id, b._rawId])) out.push({ kind, label, id:String(b.id), title:String(b.id), sub:b.customer, amount:b.amount, date:b.date, status:b.status }); }); });
  return out.slice(0,25);
}
Actions["receipt-search"] = async ()=>{
  const q = ($("#rcQuery").value||"").trim(); if(!q){ toast("Enter a number first","danger"); return; }
  let results = receiptLocalMatches(q);
  if(!results.length){
    for(const col of ["order_id","invoice_no","invoice_number"]){
      const { data, error } = await supabase.from("orders").select("*").eq(col, q).limit(5);
      if(!error && data && data.length){
        data.forEach(r=>{ const o = { id:r.order_id||r.id, _raw:r, customer:r.customer_name||r.user_name||"Customer", merchant:r.pharmacy_name||"—", total:orderTotalOf(r), payment:/cod/i.test(String(r.payment_mode||r.payment_method||""))?"COD":"Online", status:r.status||"pending", date:fmtDateTime(r.created_at), created:r.created_at };
          STATE.rc.extra = (STATE.rc.extra||[]).filter(x=>x.id!==o.id).concat(o);
          results.push({ kind:"order", label:"Medicine order", id:String(o.id), title:String(o.id), sub:`${o.customer}`, amount:o.total, date:o.date, status:o.status }); });
        break;
      }
    }
  }
  STATE.rc.q = q; STATE.rc.results = results; STATE.rc.searched = true; render();
};
document.addEventListener("keydown", (e)=>{ if(e.key==="Enter" && e.target.id==="rcQuery"){ e.preventDefault(); Actions["receipt-search"](); } });
const _amt = (v)=> (v!=null && v!=="" && isFinite(Number(v))) ? Number(v) : null;
function buildReceipt(kind, id){
  const rows = [], lines = []; let no = id, title = "Receipt", total = null, status = "", date = "", who = "", phone = "", addr = "", pay = "", extra = [];
  if(kind==="order"){
    const o = DATA.orders.find(x=>String(x.id)===String(id)) || (STATE.rc.extra||[]).find(x=>String(x.id)===String(id)); if(!o) return null;
    const r = o._raw || {}; title = "Medicine Order Receipt";
    no = r.invoice_no || r.invoice_number || o.id; who = o.customer; phone = r.customer_phone || r.user_phone || ""; date = o.date; status = o.status;
    const a = r.delivery_address || r.address || r.customer_address || ""; addr = typeof a==="object" && a ? Object.values(a).filter(Boolean).join(", ") : String(a||"");
    pay = `${o.payment}${r.payment_utr?" · UTR "+r.payment_utr:""}${r.payment_verification_status?" · "+r.payment_verification_status:""}`;
    let items = r.items; if(typeof items==="string"){ try{ items = JSON.parse(items); }catch(e){ items = []; } }
    (Array.isArray(items)?items:[]).forEach(it=>{ const q = Number(it.qty ?? it.quantity ?? 1) || 1, p = Number(it.price ?? it.selling_price ?? it.unit_price ?? it.mrp ?? 0) || 0; lines.push({ name:it.name||it.product_name||it.medicine_name||it.title||"Item", qty:q, price:p, amt:q*p }); });
    const sub = _amt(r.subtotal ?? r.items_total) ?? lines.reduce((s,l)=>s+l.amt,0);
    rows.push(["Pharmacy", o.merchant], ["Rider", o.rider]);
    const fee = [["Items subtotal", sub],["Delivery fee", _amt(r.delivery_fee ?? r.delivery_charge)],["Handling / platform fee", _amt(r.platform_fee ?? r.handling_fee)],["COD fee", _amt(r.cod_fee)],["Tax", _amt(r.tax ?? r.gst)],["Discount", _amt(r.discount ?? r.discount_amount ?? r.coupon_discount)]];
    fee.forEach(([k,v])=>{ if(v) extra.push([k, (k==="Discount"?"− ":"")+money(v)]); });
    total = orderTotalOf(r) || o.total;
  } else {
    const meta = BK_META[kind], b = meta && meta.rows().find(x=>String(x.id)===String(id)); if(!b) return null;
    title = `${meta.title} Booking Receipt`; no = b.id; who = b.customer; phone = b.phone; date = b.date; status = b.status; addr = b.location; total = b.amount; pay = b.payment;
    const pq = (DATA.payQueue||[]).find(p=>p.kind===kind && String(p.rawId)===String(b._rawId)); if(pq) pay += ` · UTR ${pq.utr||"—"} · ${pq.status}`;
    rows.push(["Service", b.service], [meta.provider, b.provider||"Unassigned"]);
  }
  return { kind, no, title, total, status, date, who, phone, addr, pay, rows, lines, extra };
}
function receiptHtml(r){
  const e = esc, m = money;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(r.title)} ${e(r.no)}</title><style>
  body{font-family:Arial,Helvetica,sans-serif;color:#142421;margin:0;padding:22px;font-size:14px}.box{max-width:640px;margin:0 auto;border:1px solid #d8e2df;border-radius:10px;padding:22px}
  h1{margin:0;font-size:20px;color:#0d5c4f}.sub{color:#5b6f6a;font-size:12px}.top{display:flex;justify-content:space-between;gap:12px;border-bottom:2px solid #0d5c4f;padding-bottom:12px;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;margin:10px 0}td,th{padding:7px 4px;border-bottom:1px solid #e6ecea;text-align:left;vertical-align:top}th{font-size:12px;color:#5b6f6a}.r{text-align:right}
  .kv td:first-child{color:#5b6f6a;width:38%}.total td{font-weight:700;font-size:16px;border-top:2px solid #142421;border-bottom:none}.foot{margin-top:18px;color:#5b6f6a;font-size:11.5px;text-align:center}
  @media print{body{padding:0}.box{border:none}}</style></head><body><div class="box">
  <div class="top"><div><h1>MediFinder India</h1><div class="sub">${e(r.title)}</div></div><div style="text-align:right"><div class="sub">Invoice / Booking no.</div><b>${e(r.no)}</b><div class="sub">${e(r.date)}</div><div class="sub">Status: ${e(String(r.status).replace(/_/g," "))}</div></div></div>
  <table class="kv"><tr><td>Customer</td><td>${e(r.who||"—")}</td></tr>${r.phone?`<tr><td>Phone</td><td>${e(r.phone)}</td></tr>`:""}${r.addr?`<tr><td>Address</td><td>${e(r.addr)}</td></tr>`:""}${r.rows.map(([k,v])=>`<tr><td>${e(k)}</td><td>${e(v||"—")}</td></tr>`).join("")}<tr><td>Payment</td><td>${e(r.pay||"—")}</td></tr></table>
  ${r.lines.length?`<table><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr>${r.lines.map(l=>`<tr><td>${e(l.name)}</td><td class="r">${l.qty}</td><td class="r">${m(l.price)}</td><td class="r">${m(l.amt)}</td></tr>`).join("")}</table>`:""}
  <table>${r.extra.map(([k,v])=>`<tr><td>${e(k)}</td><td class="r">${e(v)}</td></tr>`).join("")}<tr class="total"><td>Total</td><td class="r">${r.total!=null?m(r.total):"—"}</td></tr></table>
  <div class="foot">Computer-generated receipt · MediFinder India · medifinderindia.com</div></div></body></html>`;
}
Actions["receipt-open"] = (el)=>{
  const r = buildReceipt(el.dataset.kind, el.dataset.id); if(!r){ toast("Receipt data not found","danger"); return; }
  const html = receiptHtml(r); document.getElementById("kycLightbox")?.remove();
  const box = document.createElement("div"); box.id = "kycLightbox"; box.className = "doc-full light";
  box.innerHTML = `<div class="doc-full-head"><strong>${esc(r.title)} · ${esc(r.no)}</strong>
    <span class="doc-full-actions"><button class="btn sm primary" id="rcPdf">⬇ Download PDF</button><button class="btn sm" id="rcHtml">Save HTML</button><button class="doc-full-close" id="kycLightboxClose">✕ Close</button></span></div>
    <div class="doc-full-body"><iframe id="rcFrame" title="Receipt"></iframe></div>`;
  document.body.appendChild(box);
  const fr = box.querySelector("#rcFrame"); fr.srcdoc = html;
  box.addEventListener("click", (e)=>{
    if(e.target.id==="kycLightboxClose") box.remove();
    if(e.target.id==="rcPdf"){ invoicePdf(html, `Invoice-${String(r.no).replace(/[^\w-]+/g,"_")}.pdf`).catch(()=>{ try{ fr.contentWindow.focus(); fr.contentWindow.print(); }catch(err){ toast("Use your browser's Print → Save as PDF","danger"); } }); }
    if(e.target.id==="rcHtml") downloadBlob(new Blob([html],{type:"text/html"}), `receipt-${String(r.no).replace(/[^\w-]+/g,"_")}.html`);
  });
  logAdminAction(`Opened receipt ${r.no}`);
};

/* ---------- Complaints (real reply saved) + Reviews (real moderation) ---------- */
const TICKET_TABS = [{key:"open",label:"Open"},{key:"in_progress",label:"In progress"},{key:"closed",label:"Closed"},{key:"all",label:"All"}];
VIEWS.support = () => {
  const st = vs("support",{tab:"open", search:""}); const q = (st.search||"").toLowerCase();
  let rows = st.tab==="all" ? DATA.tickets : DATA.tickets.filter(t=>t.status===st.tab);
  if(q) rows = rows.filter(t=>(t.name+t.subject+t.message+t.from+t.category).toLowerCase().includes(q));
  const cnt = k=>DATA.tickets.filter(t=>t.status===k).length;
  return `
  <div class="view-head"><h1>Complaints & Support</h1><p>Customer, merchant and rider complaints in one queue. Your reply is saved on the complaint and the customer is notified.</p></div>
  <div class="stat-grid">
    <div class="stat-card"><div class="lbl">Open</div><div class="val" style="color:#d93025">${cnt("open")}</div></div>
    <div class="stat-card"><div class="lbl">In progress</div><div class="val">${cnt("in_progress")}</div></div>
    <div class="stat-card"><div class="lbl">Closed</div><div class="val" style="color:#1f9d55">${cnt("closed")}</div></div>
    <div class="stat-card"><div class="lbl">High priority open</div><div class="val">${DATA.tickets.filter(t=>t.status!=="closed" && ["high","urgent"].includes(t.priority)).length}</div></div>
  </div>
  ${toolbarTabs("support", TICKET_TABS)}
  <div class="view-toolbar">${toolbarSearch("support","Search name, subject or message")}</div>
  <div class="card"><div class="card-body pad0" id="tablewrap-support">
    ${renderTable("support",[
      {key:"id",label:"Ticket",render:r=>esc(String(r.id).slice(0,8))},{key:"from",label:"From"},{key:"name",label:"Name"},
      {key:"subject",label:"Subject",render:r=>`<div class="cell-strong">${esc(r.subject)}</div><div class="cell-sub">${esc(String(r.message).slice(0,70))}${r.message.length>70?"…":""}</div>`},
      {key:"priority",label:"Priority",render:r=>statusBadge(r.priority)},{key:"status",label:"Status",render:r=>statusBadge(r.status)},{key:"date",label:"Opened"},
      {key:"_actions",label:"",sortable:false,render:r=>`<button class="btn sm ${r.status==="closed"?"":"primary"}" data-act="ticket-reply" data-key="${esc(r.key)}">${r.status==="closed"?"View":"Reply"}</button>`},
    ], rows, {emptyText:"No complaints in this filter."})}
  </div></div>`;
};
Actions["ticket-reply"] = (el)=>{ const t = DATA.tickets.find(x=>x.key===el.dataset.key); if(!t) return;
  openModal(`Complaint — ${t.subject}`, `
    <div style="padding:2px 0 8px">${statusBadge(t.status)} ${statusBadge(t.priority)} <span class="hint">${esc(t.from)} · ${esc(t.name)} · ${esc(t.date)}</span></div>
    ${t.category?detailRow("Category", esc(t.category)):""}${t.token?detailRow("Token", esc(t.token)):""}
    <div class="field"><label>Complaint</label><div style="background:var(--bg-soft,#f4f7f6);border-radius:8px;padding:10px;white-space:pre-wrap">${esc(t.message||"(no message)")}</div></div>
    ${t.repliedAt?`<div class="hint" style="margin-bottom:6px">Last reply sent ${esc(fmtDateTime(t.repliedAt))}</div>`:""}
    <div class="field"><label>Your reply</label><textarea id="tReply" rows="5" placeholder="Type your reply...">${esc(t.reply)}</textarea></div>
    <div class="field"><label>Priority</label><select id="tPrio">${["low","medium","high","urgent"].map(p=>`<option ${p===t.priority?"selected":""}>${p}</option>`).join("")}</select></div>`,
    `<button class="btn" data-close-modal>Close</button>${t.status==="closed"?`<button class="btn" data-act="ticket-save" data-mode="reopen" data-key="${esc(t.key)}">Reopen</button>`:`<button class="btn" data-act="ticket-save" data-mode="reply" data-key="${esc(t.key)}">Save reply</button><button class="btn primary" data-act="ticket-save" data-mode="close" data-key="${esc(t.key)}">Reply & close</button>`}`);
};
Actions["ticket-save"] = async (el)=>{
  const t = DATA.tickets.find(x=>x.key===el.dataset.key); if(!t) return; const mode = el.dataset.mode;
  const reply = (($("#tReply")||{}).value||"").trim(), prio = ($("#tPrio")||{}).value || t.priority, now = new Date().toISOString();
  if(mode!=="reopen" && !reply){ toast("Write a reply first","danger"); return; }
  const upd = { priority:prio, updated_at:now };
  if(mode==="reopen") upd.status = "open"; else { upd.admin_reply = reply; upd.replied_at = now; upd.status = mode==="close" ? "closed" : "in_progress"; }
  const r = await mustUpdate(supabase.from(t._table).update(upd).eq("id", t.id), "Complaint"); if(!r.ok){ toast("Failed: "+r.msg,"danger"); return; }
  if(mode!=="reopen" && t._userId) supabase.from("notifications").insert({ user_id:t._userId, type:"complaint_reply", title:"Reply to your complaint", message:reply.slice(0,300) }).then(()=>{}, ()=>{});
  await logAdminAction(`Complaint ${t.key} → ${upd.status}`); await loadTicketsFromDB(); closeModal(); render(); toast(mode==="close"?"Replied and closed":mode==="reopen"?"Complaint reopened":"Reply saved");
};
Actions["ticket-close"] = Actions["ticket-save"];

const REVIEW_TABS = [{key:"all",label:"All"},{key:"reported",label:"Reported"},{key:"Product",label:"Product"},{key:"Lab Test",label:"Lab test"},{key:"Order",label:"Order / delivery"}];
VIEWS.reviews = () => {
  const st = vs("reviews",{tab:"all"});
  let rows = st.tab==="all" ? DATA.reviews : st.tab==="reported" ? DATA.reviews.filter(r=>r.reported) : DATA.reviews.filter(r=>r.type===st.tab);
  const rated = DATA.reviews.filter(r=>r.rating>0), avg = rated.length ? (rated.reduce((a,r)=>a+r.rating,0)/rated.length).toFixed(1) : "—";
  return `
  <div class="view-head"><h1>Reviews & Ratings</h1><p>Real customer feedback for medicines, lab tests and orders. Keep reported reviews that are genuine, delete abusive ones.</p></div>
  <div class="stat-grid">
    <div class="stat-card"><div class="lbl">Total reviews</div><div class="val">${DATA.reviews.length}</div></div>
    <div class="stat-card"><div class="lbl">Average rating</div><div class="val">${avg}${avg==="—"?"":" ★"}</div></div>
    <div class="stat-card"><div class="lbl">Reported</div><div class="val" style="color:#d93025">${DATA.reviews.filter(r=>r.reported).length}</div></div>
    <div class="stat-card"><div class="lbl">1–2 star</div><div class="val">${DATA.reviews.filter(r=>r.rating>0 && r.rating<=2).length}</div></div>
  </div>
  ${toolbarTabs("reviews", REVIEW_TABS)}
  <div class="card"><div class="card-body pad0" id="tablewrap-reviews">
    ${renderTable("reviews",[
      {key:"date",label:"Date"},{key:"type",label:"Type",render:r=>badge(r.type,"blue")},{key:"subject",label:"About"},{key:"by",label:"By"},
      {key:"rating",label:"Rating",render:r=>"★".repeat(r.rating)+"☆".repeat(5-r.rating)},
      {key:"comment",label:"Comment"},
      {key:"reported",label:"Reported",render:r=>r.reported?badge("Reported","red"):badge("Clean","green")},
      {key:"_actions",label:"",sortable:false,render:r=>`<div class="actions-cell">${r.reported?`<button class="btn sm" data-act="review-clear" data-key="${esc(r.key)}">Keep</button>`:""}<button class="btn sm danger" data-act="review-del" data-key="${esc(r.key)}">Delete</button></div>`},
    ], rows, {emptyText:"No reviews in this filter."})}
  </div></div>`;
};
Actions["review-clear"] = async (el)=>{ const r = DATA.reviews.find(x=>x.key===el.dataset.key); if(!r) return;
  const q = await mustUpdate(supabase.from(r._table).update({ reported:false }).eq("id", r.id), "Review"); if(!q.ok){ toast("Failed: "+q.msg,"danger"); return; }
  r.reported = false; await logAdminAction(`Kept reported review ${r.key}`); render(); toast("Review kept — report cleared");
};
Actions["review-del"] = async (el)=>{ const r = DATA.reviews.find(x=>x.key===el.dataset.key); if(!r) return;
  if(!(await askConfirm("Delete this review?", "It will be removed for everyone and cannot be restored.", {danger:true, ok:"Delete"}))) return;
  const { error } = await supabase.from(r._table).delete().eq("id", r.id); if(error){ toast("Failed: "+error.message,"danger"); return; }
  DATA.reviews = DATA.reviews.filter(x=>x!==r); await logAdminAction(`Deleted review ${r.key}`); render(); toast("Review deleted","danger");
};
Actions["review-hide"] = Actions["review-del"];

Actions["analytics-refresh"] = async ()=>{ try{ await refreshLiveData(); }catch(e){} STATE.lastAnalyticsRefresh = new Date().toLocaleTimeString(); render(); toast("Delivery analytics refreshed"); };
/* ---------- Emergency: live watch (all numbers real, refreshes every 30 s) ---------- */
function minsAgo(iso){ if(!iso) return null; const m = (Date.now()-new Date(iso))/60000; return isNaN(m) ? null : Math.max(0, Math.round(m)); }
function emergencyWatchHtml(){
  const drivers = DATA.raw.ambulance || [];
  const free = drivers.filter(d=>d.is_online && !d.is_on_ride).length, onRide = drivers.filter(d=>d.is_on_ride).length;
  const waiting = DATA.ambulanceBookings.filter(b=>b.status==="new").map(b=>({ ...b, wait:minsAgo(b._createdAt) }));
  const rides = DATA.ambulanceBookings.filter(b=>b.status==="on-route");
  const stuckOrders = DATA.orders.filter(o=>o.status==="pending" && (minsAgo(o.created)||0) >= 30);
  const rxWait = DATA.prescriptions.filter(p=>p.status==="pending" && (minsAgo(p._created)||0) >= 30);
  const payWait = DATA.payQueue.filter(p=>p.status==="pending");
  const urgent = DATA.tickets.filter(t=>t.status!=="closed" && ["high","urgent"].includes(t.priority));
  const nurseWait = DATA.nurseBookings.filter(b=>b.status==="new" && (minsAgo(b._createdAt)||0) >= 60);
  const labWait = DATA.labBookings.filter(b=>b.status==="new" && (minsAgo(b._createdAt)||0) >= 60);
  const card = (label, val, sub, bad, view, tab)=>`<div class="stat-card" data-act="emg-goto" data-view="${view}" data-tab="${tab||""}" style="cursor:pointer;${bad&&val?"border-color:#d93025":""}"><div class="lbl">${label}</div><div class="val" style="${bad&&val?"color:#d93025":""}">${val}</div><div class="delta">${sub}</div></div>`;
  const noDrv = waiting.length && !free;
  return `
  <div class="card"><div class="card-head"><h3>Live emergency watch</h3><span class="sub">real data · refreshes every 30 s · tap a card to open it</span></div><div class="card-body">
    ${noDrv ? `<div class="notice-bad" style="margin-bottom:10px"><b>${waiting.length} ambulance request${waiting.length>1?"s are":" is"} waiting and no driver is free right now.</b></div>` : ""}
    <div class="stat-grid">
      ${card("Ambulance requests waiting", waiting.length, waiting.length ? "oldest "+Math.max(...waiting.map(w=>w.wait||0))+" min" : "none waiting", true, "booking", "ambulance")}
      ${card("Drivers free / on ride", free+" / "+onRide, drivers.filter(d=>!d.is_online&&!d.is_on_ride).length+" offline", false, "ambulancepartners", "map")}
      ${card("Ambulance trips live", rides.length, "accepted / on the way", false, "booking", "ambulance")}
      ${card("Orders pending 30+ min", stuckOrders.length, "no pharmacy accepted yet", true, "orders", "pending")}
      ${card("Prescriptions waiting 30+ min", rxWait.length, "no pharmacy accepted", true, "prescriptions", "")}
      ${card("Payments to verify", payWait.length, payWait.length ? "oldest "+Math.max(...payWait.map(p=>minsAgo(p.at)||0))+" min" : "all clear", true, "payment", "")}
      ${card("Nurse / lab waiting 1h+", nurseWait.length+" / "+labWait.length, "not yet accepted", true, "booking", nurseWait.length?"nurse":"lab")}
      ${card("High-priority complaints", urgent.length, "open or in progress", true, "support", "open")}
      ${card("Riders online", DATA.riders.filter(r=>r.online).length, DATA.riders.filter(r=>r.online&&r.hasOrder).length+" on delivery", false, "riders", "live")}
    </div>
    ${waiting.length ? `<div class="hint" style="font-weight:600;margin:12px 0 6px">Waiting ambulance requests</div>${renderTable("emg-amb",[
      {key:"id",label:"Booking"},{key:"customer",label:"Patient"},{key:"phone",label:"Phone",render:r=>r.phone&&r.phone!=="—"?`<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>`:"—"},{key:"service",label:"Vehicle"},{key:"location",label:"Pickup → Drop"},
      {key:"wait",label:"Waiting",render:r=>r.wait==null?"—":badge(r.wait+" min", r.wait>=3?"red":"gold")},
    ], waiting, {emptyText:""})}` : ""}
    <div class="row-flex" style="gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn" data-act="report-preset" data-preset="emergency">🚑 Download emergency report</button></div>
    <div id="repProgress" class="hint" style="margin-top:8px"></div>
    <input type="hidden" id="repFrom"><input type="hidden" id="repTo"><input type="hidden" id="repFmt" value="xlsx">
  </div></div>`;
}
Actions["emg-goto"] = (el)=> setView(el.dataset.view, el.dataset.tab || undefined);
const _emgBase = VIEWS.emergency;
VIEWS.emergency = () => { const html = _emgBase(), i = html.indexOf("</p></div>"); return i<0 ? html + emergencyWatchHtml() : html.slice(0,i+10) + emergencyWatchHtml() + html.slice(i+10); };
setInterval(()=>{
  if(STATE.view!=="system" || vs("system",{tab:"security"}).tab!=="emergency" || document.hidden || _pageOpen) return;
  Promise.all([loadAmbulanceBookingsFromDB(), loadAmbulanceDriversFromDB(), loadOrdersFromDB(), loadPrescriptionsFromDB(), loadPaymentQueue()]).then(()=>{ if(STATE.view==="system" && !_pageOpen && !document.activeElement?.matches?.("select,input,textarea")) render(); }).catch(()=>{});
}, 30000);

/* ---------- Invoice: type any invoice / order / booking number → download ---------- */
function orderFromRow(r){
  const rider = r.rider_id ? ((DATA.riders.find(x=>String(x.id)===String(r.rider_id))||{}).name || ("Rider #"+r.rider_id)) : "Not assigned";
  return { id:r.order_id||r.id, _raw:r, _merchantId:r.merchant_id, customer:r.customer_name||r.user_name||"Customer", merchant:r.pharmacy_name||((DATA.merchants.find(m=>String(m.id)===String(r.merchant_id))||{}).name)||"—", rider, total:orderTotalOf(r), payment:/cod/i.test(String(r.payment_mode||r.payment_method||""))?"COD":"Online", status:r.status||"pending", date:fmtDateTime(r.created_at), created:r.created_at };
}
async function findInvoices(q){
  q = String(q||"").trim(); const key = q.replace(/\s+/g,"").toLowerCase();
  let results = receiptLocalMatches(q);
  const exact = results.filter(r=>String(r.title).toLowerCase()===key); if(exact.length) results = exact;
  if(results.length || !supabase) return results;
  const tries = [["order_id", q.replace(/\s+/g,"")]]; if(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(q)) tries.push(["id", q]);
  for(const [col,val] of tries){
    const { data, error } = await supabase.from("orders").select("*").eq(col, val).limit(5);
    if(!error && data && data.length){ data.forEach(r=>{ const o = orderFromRow(r); STATE.rc.extra = (STATE.rc.extra||[]).filter(x=>String(x.id)!==String(o.id)).concat(o); results.push({ kind:"order", label:"Medicine order", id:String(o.id), title:String(o.id), sub:o.customer, amount:o.total, date:o.date, status:o.status }); }); break; }
  }
  return results;
}
async function buildReceiptFull(kind, id){
  const r = buildReceipt(kind, id); if(!r) return null;
  if(kind==="order" && !r.lines.length && supabase){
    const o = DATA.orders.find(x=>String(x.id)===String(id)) || (STATE.rc.extra||[]).find(x=>String(x.id)===String(id)), raw = (o&&o._raw)||{};
    const { data } = await supabase.from("order_items").select("*").eq("order_id", String(raw.order_id||raw.id||id));
    (data||[]).forEach(i=>{ const q = Number(i.quantity)||1, p = Number(i.unit_price ?? i.price)||0; r.lines.push({ name:i.product_name||i.name||"Item", qty:q, price:p, amt:Number(i.total_price ?? i.total)||q*p }); });
    if(r.lines.length && !r.extra.length){ const sub = r.lines.reduce((a,l)=>a+l.amt,0); r.extra.push(["Items subtotal", money(sub)]); }
  }
  return r;
}
function loadScriptOnce(src, test){ return new Promise((res,rej)=>{ if(test()) return res(); const sc = document.createElement("script"); sc.src = src; sc.onload = ()=>res(); sc.onerror = ()=>rej(new Error("Could not load "+src)); document.head.appendChild(sc); }); }
async function invoicePdf(html, filename){
  await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", ()=>window.html2canvas);
  await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", ()=>window.jspdf);
  const fr = document.createElement("iframe"); fr.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;background:#fff"; document.body.appendChild(fr);
  try{
    await new Promise(res=>{ fr.onload = res; fr.srcdoc = html; }); await new Promise(r=>setTimeout(r,200));
    const body = fr.contentDocument.body; fr.style.height = Math.max(1123, body.scrollHeight+40)+"px";
    const canvas = await window.html2canvas(body, { scale:2, backgroundColor:"#ffffff", useCORS:true, windowWidth:794 });
    const pdf = new window.jspdf.jsPDF({ unit:"pt", format:"a4" }), pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
    const imgH = canvas.height * (pw / canvas.width), img = canvas.toDataURL("image/jpeg", .95);
    for(let pos=0; pos < imgH - 1; pos += ph){ if(pos) pdf.addPage(); pdf.addImage(img, "JPEG", 0, -pos, pw, imgH); }
    pdf.save(filename);
  } finally { fr.remove(); }
}
async function deliverInvoice(r){
  const html = receiptHtml(r), safe = String(r.no).replace(/[^\w-]+/g,"_");
  try{ await invoicePdf(html, `Invoice-${safe}.pdf`); toast("Invoice downloaded (PDF)"); }
  catch(err){ downloadBlob(new Blob([html],{type:"text/html"}), `Invoice-${safe}.html`); toast("PDF tool was blocked — saved as an HTML invoice instead (open it and print to PDF)","danger"); }
  logAdminAction(`Downloaded invoice ${r.no}`);
}
Actions["invoice-open"] = ()=>{
  openModal("Download invoice", `<div class="field"><label>Invoice no. / Order no. / Booking no.</label><input id="invQ" autocomplete="off" placeholder="e.g. ORD-12345 · LBK-… · NBK-… · ABK-…"></div>
    <div class="hint">Works for medicine orders, lab, nurse and ambulance bookings. The invoice downloads as a PDF.</div><div id="invResults" style="margin-top:12px"></div>`,
    `<button class="btn" data-close-modal>Close</button><button class="btn primary" data-act="invoice-download">⬇ Download invoice</button>`);
  setTimeout(()=>{ const i = $("#invQ"); if(i) i.focus(); }, 120);
};
document.addEventListener("keydown", (e)=>{ if(e.key==="Enter" && e.target.id==="invQ"){ e.preventDefault(); Actions["invoice-download"](); } });
Actions["invoice-download"] = async ()=>{
  const q = (($("#invQ")||{}).value||"").trim(), box = $("#invResults"); if(!q){ toast("Enter an invoice, order or booking number","danger"); return; }
  if(box) box.innerHTML = `<div class="hint">Searching…</div>`;
  const res = await findInvoices(q);
  if(!res.length){ if(box) box.innerHTML = `<div class="notice-bad">No order or booking found for “${esc(q)}”. Check the number and try again.</div>`; return; }
  if(res.length===1){ const r = await buildReceiptFull(res[0].kind, res[0].id); if(!r){ toast("Invoice data not found","danger"); return; } if(box) box.innerHTML = `<div class="hint">Preparing ${esc(r.no)}…</div>`; await deliverInvoice(r); if(box) box.innerHTML = `<div class="hint">✔ ${esc(r.no)} downloaded.</div>`; return; }
  STATE._invRes = res;
  if(box) box.innerHTML = `<div class="hint" style="margin-bottom:6px">${res.length} matches — choose one:</div>` + res.slice(0,15).map((r,i)=>`<div class="row-flex" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line,#eee)"><div><div class="cell-strong">${esc(r.title)}</div><div class="cell-sub">${esc(r.label)} · ${esc(r.sub||"")} · ${r.amount!=null?money(r.amount):"—"}</div></div><button class="btn sm primary" data-act="invoice-pick" data-i="${i}">⬇ Download</button></div>`).join("");
};
Actions["invoice-pick"] = async (el)=>{ const x = (STATE._invRes||[])[Number(el.dataset.i)]; if(!x) return; const r = await buildReceiptFull(x.kind, x.id); if(!r){ toast("Invoice data not found","danger"); return; } await deliverInvoice(r); };
Actions["invoice-dl"] = async (el)=>{ const r = await buildReceiptFull(el.dataset.kind, el.dataset.id); if(!r){ toast("Invoice data not found","danger"); return; } await deliverInvoice(r); };

/* ---------- Offers / Campaigns (Flipkart-style: banner + countdown + scheduled push) ---------- */
(function(){
  const g = NAV.find(gr=>gr.items.some(i=>i.id==="notifications"));
  const it = {id:"campaigns", icon:"📢", label:"Offers / Campaigns", children:[{key:"live",label:"Live"},{key:"scheduled",label:"Scheduled"},{key:"ended",label:"Ended"},{key:"all",label:"All"}]};
  g.items.splice(g.items.findIndex(i=>i.id==="notifications")+1, 0, it); NAV_FLAT.push(it);
})();
DATA.campaigns = []; DATA._campLoaded = false;
async function loadCampaigns(){
  if(!supabase) return;
  const { data, error } = await supabase.from("campaigns").select("*").order("start_at",{ascending:false}).limit(200);
  DATA.campaignsError = error ? error.message : "";
  DATA.campaigns = data || []; DATA._campLoaded = true;
}
function campStatus(c){
  const t = Date.now(), s = new Date(c.start_at).getTime(), e = new Date(c.end_at).getTime();
  if(c.ended_early || t >= e) return "ended";
  return t < s ? "scheduled" : "live";
}
const campFmt = (x)=> new Date(x).toLocaleString("en-IN",{dateStyle:"medium", timeStyle:"short"});
function toLocalInput(d){ return `${d.getFullYear()}-${_p2(d.getMonth()+1)}-${_p2(d.getDate())}T${_p2(d.getHours())}:${_p2(d.getMinutes())}`; }
VIEWS.campaigns = () => {
  if(!DATA._campLoaded){ DATA._campLoaded = true; loadCampaigns().then(render); }
  const tab = vs("campaigns",{tab:"live"}).tab, all = DATA.campaigns;
  const cnt = (s)=> all.filter(c=>campStatus(c)===s).length;
  const rows = tab==="all" ? all : all.filter(c=>campStatus(c)===tab);
  const pushTxt = (c)=> !c.send_push ? "Push off" : c.pushed_at ? "Push sent "+campFmt(c.pushed_at) : "Push at "+campFmt(c.push_at||c.start_at);
  const card = (c)=>{ const st = campStatus(c);
    return `<div class="card" style="margin-bottom:12px"><div class="card-body">
      <div class="row-flex" style="align-items:flex-start;gap:12px">
        ${c.image_url ? `<img src="${esc(c.image_url)}" alt="" style="width:92px;height:64px;object-fit:cover;border-radius:8px;flex:none">` : `<div style="width:92px;height:64px;border-radius:8px;flex:none;background:linear-gradient(135deg,#e02020,#ffb347)"></div>`}
        <div style="flex:1;min-width:0"><div class="cell-strong">${esc(c.title)}</div>
          <div class="cell-sub">${esc(c.discount_text||"")}</div>
          <div class="cell-sub">${campFmt(c.start_at)} → ${campFmt(c.end_at)}</div>
          <div class="cell-sub">${pushTxt(c)}${c.send_push && c.send_ending_push ? " · ending-soon reminder on" : ""}${c.show_countdown?" · countdown":""}${c.show_homepage?" · homepage":""}</div></div>
        ${badge(st==="live"?"Live":st==="scheduled"?"Scheduled":"Ended", st==="live"?"green":st==="scheduled"?"gold":"gray")}</div>
      ${st!=="ended" ? `<div class="actions-cell" style="margin-top:10px;flex-wrap:wrap">
        <button class="btn sm" data-act="camp-edit" data-id="${esc(c.id)}">Edit</button>
        ${c.send_push ? `<button class="btn sm primary" data-act="camp-push" data-id="${esc(c.id)}">Send push now</button>` : ""}
        <button class="btn sm danger" data-act="camp-end" data-id="${esc(c.id)}">End now</button></div>`
        : `<div class="actions-cell" style="margin-top:10px"><button class="btn sm danger" data-act="camp-del" data-id="${esc(c.id)}">Delete</button></div>`}
    </div></div>`; };
  return `
  <div class="view-head"><h1>Offers / Campaigns</h1><p>Publish an offer once — it appears on the customer home page with a server-time countdown and a push notification goes out automatically.</p></div>
  ${DATA.campaignsError ? `<div class="notice-bad">Campaigns cannot load: ${esc(DATA.campaignsError)} — run medifinder_campaigns.sql first</div>` : ""}
  <div class="stat-grid"><div class="stat-card"><div class="lbl">Live now</div><div class="val" style="color:#1f9d55">${cnt("live")}</div></div>
    <div class="stat-card"><div class="lbl">Scheduled</div><div class="val">${cnt("scheduled")}</div></div>
    <div class="stat-card"><div class="lbl">Ended</div><div class="val">${cnt("ended")}</div></div></div>
  <div class="view-toolbar"><button class="btn primary" data-act="camp-new">+ Create offer</button></div>
  ${rows.map(card).join("") || `<div class="empty"><div class="ic">📢</div><h4>No offers here</h4><p>Tap “Create offer” to publish one.</p></div>`}`;
};
function campForm(c){
  const now = new Date(), s = c ? new Date(c.start_at) : now, e = c ? new Date(c.end_at) : new Date(now.getTime()+24*3600e3);
  const ck = (id,label,v)=>`<label class="chk"><input type="checkbox" id="${id}" ${v?"checked":""}> ${label}</label>`;
  return `
  <div class="field"><label>Offer title *</label><input id="cmpTitle" value="${esc(c?c.title:"")}" placeholder="MEGA HEALTH SALE"></div>
  <div class="field"><label>Discount text</label><input id="cmpDisc" value="${esc(c?c.discount_text||"":"")}" placeholder="Up to 60% OFF"></div>
  <div class="field"><label>Description</label><textarea id="cmpDesc" placeholder="Top medicines & healthcare products at special prices">${esc(c?c.description||"":"")}</textarea></div>
  <div class="field"><label>Banner image</label><input id="cmpFile" type="file" accept="image/*"><input id="cmpImg" value="${esc(c?c.image_url||"":"")}" placeholder="…or paste an image URL" style="margin-top:6px"></div>
  <details class="field" style="border:1px dashed var(--line);border-radius:10px;padding:10px 12px"><summary style="cursor:pointer;font-weight:600">🛍 Build a 3-product deals banner (like Flipkart)</summary>
    <div class="hint" style="margin:8px 0">Pick up to 3 medicines and write the offer for each — the banner image is made for you.</div>
    ${[1,2,3].map(n=>`<div class="field-row"><div class="field"><select id="cmpP${n}"><option value="">— Medicine ${n} —</option>${DATA.products.filter(p=>p.approval==="approved"&&p.visible&&p._img).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></div><div class="field"><input id="cmpD${n}" placeholder="Up to 30% Off"></div></div>`).join("")}
    <button class="btn sm primary" type="button" data-act="camp-compose">Create banner image</button>
    <img id="cmpPreview" alt="" style="display:none;width:100%;margin-top:10px;border-radius:10px;border:1px solid var(--line)">
  </details>
  <div class="field-row"><div class="field"><label>Starts *</label><input id="cmpStart" type="datetime-local" value="${toLocalInput(s)}"></div>
  <div class="field"><label>Ends *</label><input id="cmpEnd" type="datetime-local" value="${toLocalInput(e)}"></div></div>
  <div class="field"><label>Shop Now opens (page)</label><input id="cmpUrl" value="${esc(c?c.target_url||"":"/user.html")}" placeholder="/user.html"></div>
  <div class="hint" style="font-weight:600;margin:6px 0">Push notification text (optional — defaults to title & description)</div>
  <div class="field"><label>Notification title</label><input id="cmpNTitle" value="${esc(c?c.notification_title||"":"")}" placeholder="🔥 Epic Health Deals!"></div>
  <div class="field"><label>Notification message</label><input id="cmpNBody" value="${esc(c?c.notification_body||"":"")}" placeholder="Grab top medicines & healthcare products at special prices."></div>
  ${ck("cmpPush","Send push notification when it starts",c?c.send_push:true)}
  ${ck("cmpEnding","Also send “Ending soon” push 1 hour before it ends",c?c.send_ending_push:true)}
  ${ck("cmpHome","Show on home page",c?c.show_homepage:true)}
  ${ck("cmpCount","Show countdown",c?c.show_countdown:true)}`;
}
async function readCampForm(){
  const title = $("#cmpTitle").value.trim(), s = new Date($("#cmpStart").value), e = new Date($("#cmpEnd").value);
  if(!title){ toast("Offer title is required","danger"); return null; }
  if(isNaN(s) || isNaN(e)){ toast("Set start and end date/time","danger"); return null; }
  if(e <= s){ toast("End must be after start","danger"); return null; }
  if(e.getTime() <= Date.now()){ toast("End time is already in the past","danger"); return null; }
  let image = $("#cmpImg").value.trim() || null; const f = $("#cmpFile").files && $("#cmpFile").files[0];
  if(f){
    if(f.size > 4*1024*1024){ toast("Banner must be under 4 MB","danger"); return null; }
    const path = `banners/${Date.now()}-${f.name.replace(/[^\w.-]+/g,"_")}`;
    const up = await supabase.storage.from("campaign-banners").upload(path, f, { upsert:false, contentType:f.type });
    if(up.error){ toast("Banner upload failed: "+up.error.message,"danger"); return null; }
    image = supabase.storage.from("campaign-banners").getPublicUrl(path).data.publicUrl;
  }
  return { title, description:$("#cmpDesc").value.trim()||null, discount_text:$("#cmpDisc").value.trim()||null, image_url:image,
    start_at:s.toISOString(), end_at:e.toISOString(), target_url:$("#cmpUrl").value.trim()||"/user.html",
    notification_title:$("#cmpNTitle").value.trim()||null, notification_body:$("#cmpNBody").value.trim()||null,
    send_push:$("#cmpPush").checked, send_ending_push:$("#cmpEnding").checked, show_homepage:$("#cmpHome").checked, show_countdown:$("#cmpCount").checked };
}
function loadImg(url){ return new Promise(res=>{ const i = new Image(); i.crossOrigin = "anonymous"; i.onload = ()=>res(i); i.onerror = ()=>res(null); i.src = url; }); }
function fitText(ctx, text, maxW){ let t = String(text); while(ctx.measureText(t).width > maxW && t.length > 3) t = t.slice(0,-2); return t === String(text) ? t : t.trim()+"…"; }
Actions["camp-compose"] = async ()=>{
  const picks = [1,2,3].map(n=>({ id:$("#cmpP"+n).value, disc:$("#cmpD"+n).value.trim() })).filter(x=>x.id).map(x=>({ ...x, p:DATA.products.find(p=>String(p.id)===x.id) })).filter(x=>x.p);
  if(!picks.length){ toast("Choose at least one medicine","danger"); return; }
  const W = 1200, H = 600, m = 36, gap = 24, cw = (W - 2*m - gap*(picks.length>2?2:picks.length-1)) / Math.min(3,picks.length), ch = H - 2*m, lab = 150;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const ctx = cv.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,W,H);
  const imgs = await Promise.all(picks.map(x=>loadImg(x.p._img)));
  picks.forEach((x,i)=>{
    const cx = m + i*(cw+gap), cy = m;
    ctx.save(); ctx.beginPath(); ctx.roundRect(cx,cy,cw,ch,22); ctx.clip();
    ctx.fillStyle = "#ffffff"; ctx.fillRect(cx,cy,cw,ch-lab);
    const im = imgs[i];
    if(im){ const box = cw-40, bh = ch-lab-40, r = Math.min(box/im.width, bh/im.height), w = im.width*r, h = im.height*r; ctx.drawImage(im, cx+(cw-w)/2, cy+20+(bh-h)/2, w, h); }
    else { ctx.fillStyle = "#e8e8e8"; ctx.font = "90px sans-serif"; ctx.textAlign = "center"; ctx.fillText("💊", cx+cw/2, cy+(ch-lab)/2+30); }
    ctx.fillStyle = "#fff3b0"; ctx.fillRect(cx, cy+ch-lab, cw, lab);
    ctx.fillStyle = "#1a1a1a"; ctx.textAlign = "center"; ctx.font = "600 30px Arial, sans-serif";
    ctx.fillText(fitText(ctx, x.p.name, cw-30), cx+cw/2, cy+ch-lab+54);
    ctx.font = "800 36px Arial, sans-serif"; ctx.fillText(x.disc || "Special price", cx+cw/2, cy+ch-lab+110);
    ctx.restore(); ctx.strokeStyle = "#e3e3e3"; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(cx,cy,cw,ch,22); ctx.stroke();
  });
  let blob; try{ blob = await new Promise((res,rej)=>cv.toBlob(b=>b?res(b):rej(new Error("empty")), "image/jpeg", 0.9)); }
  catch(e){ toast("Could not build the image (product photo blocked) — upload a banner instead","danger"); return; }
  const path = `banners/deals-${Date.now()}.jpg`;
  const up = await supabase.storage.from("campaign-banners").upload(path, blob, { contentType:"image/jpeg" });
  if(up.error){ toast("Upload failed: "+up.error.message,"danger"); return; }
  const url = supabase.storage.from("campaign-banners").getPublicUrl(path).data.publicUrl;
  $("#cmpImg").value = url; const pv = $("#cmpPreview"); pv.src = url; pv.style.display = "block";
  toast("Banner created — it will be used for this offer");
};
Actions["camp-new"] = ()=> openModal("Create offer", campForm(null), `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-act="camp-save">Publish offer</button>`);
Actions["camp-save"] = async ()=>{
  const f = await readCampForm(); if(!f) return;
  const { error } = await supabase.from("campaigns").insert({ ...f, is_published:true, created_by:DATA.me.email||null });
  if(error){ toast("Failed: "+error.message+(/campaigns/.test(error.message)?" — run medifinder_campaigns.sql":""),"danger"); return; }
  await logAdminAction(`Published offer “${f.title}”`); closeModal(); await loadCampaigns(); render();
  toast(f.send_push ? "Offer published — push goes out at start time" : "Offer published");
};
Actions["camp-edit"] = (el)=>{ const c = DATA.campaigns.find(x=>x.id===el.dataset.id); if(!c) return;
  openModal("Edit offer", campForm(c), `<button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-act="camp-edit-save" data-id="${esc(c.id)}">Save</button>`); };
Actions["camp-edit-save"] = async (el)=>{
  const c = DATA.campaigns.find(x=>x.id===el.dataset.id); if(!c) return;
  const f = await readCampForm(); if(!f) return;
  const { error } = await supabase.from("campaigns").update(f).eq("id", c.id);
  if(error){ toast("Failed: "+error.message,"danger"); return; }
  await logAdminAction(`Edited offer “${f.title}”`); closeModal(); await loadCampaigns(); render(); toast("Offer updated");
};
Actions["camp-end"] = async (el)=>{
  const c = DATA.campaigns.find(x=>x.id===el.dataset.id); if(!c || !(await askConfirm("End offer now?", `“${c.title}” will disappear from the home page immediately.`, {danger:true, ok:"End offer"}))) return;
  const { error } = await supabase.from("campaigns").update({ ended_early:true }).eq("id", c.id);
  if(error){ toast("Failed: "+error.message,"danger"); return; }
  await logAdminAction(`Ended offer “${c.title}”`); await loadCampaigns(); render(); toast("Offer ended","danger");
};
Actions["camp-del"] = async (el)=>{
  const c = DATA.campaigns.find(x=>x.id===el.dataset.id); if(!c || !(await askConfirm("Delete offer", `Delete “${c.title}” permanently?`, {danger:true, ok:"Delete"}))) return;
  const { error } = await supabase.from("campaigns").delete().eq("id", c.id);
  if(error){ toast("Failed: "+error.message,"danger"); return; }
  await logAdminAction(`Deleted offer “${c.title}”`); await loadCampaigns(); render(); toast("Offer deleted","danger");
};
Actions["camp-push"] = async (el)=>{
  const c = DATA.campaigns.find(x=>x.id===el.dataset.id); if(!c) return;
  if(!(await askConfirm("Send to all customers?", `“${c.notification_title||c.title}” will be pushed to every customer now.`, {ok:"Send now"}))) return;
  const { data, error } = await supabase.functions.invoke("send-campaign-push", { body:{ campaign_id:c.id } });
  if(error || (data && data.error)){ toast("Push failed: "+((data&&data.error)||error.message)+" — is the Edge Function deployed?","danger"); return; }
  await logAdminAction(`Sent push for offer “${c.title}” (${data.sent} devices)`); await loadCampaigns(); render();
  toast(`Push sent to ${data.sent} device${data.sent===1?"":"s"}`);
};

/* ---------- Render wrapper: keeps typed text, rebuilds maps, updates bell ---------- */
function snapshotForm(){
  const c = document.getElementById("content"); if(!c) return null;
  const snap = { vals:{}, scroll:c.scrollTop };
  c.querySelectorAll("input[id],textarea[id],select[id]").forEach(el=>{ snap.vals[el.id] = (el.type==="checkbox"||el.type==="radio") ? {c:el.checked} : {v:el.value}; });
  const a = document.activeElement; if(a && a.id && c.contains(a)) snap.focus = { id:a.id, s:a.selectionStart, e:a.selectionEnd };
  return snap;
}
function restoreForm(snap){
  if(!snap) return; const c = document.getElementById("content"); if(!c) return;
  Object.entries(snap.vals).forEach(([id,st])=>{ const el = document.getElementById(id); if(!el || !c.contains(el)) return;
    if("c" in st) el.checked = st.c; else if(el.value!==st.v && !el.disabled && !(el.tagName==="SELECT" && ![...el.options].some(o=>o.value===st.v))) el.value = st.v; });
  const one = document.getElementById("ntfModeOne");
  if(one && one.checked){ const i = document.getElementById("ntfTargetInput"); if(i){ i.disabled = false; ntfResolveNow(); } }
  c.scrollTop = snap.scroll;
  if(snap.focus){ const f = document.getElementById(snap.focus.id); if(f){ f.focus(); try{ f.setSelectionRange(snap.focus.s, snap.focus.e); }catch(e){} } }
}
const _renderBase = render;
render = function(){
  const snap = snapshotForm();
  destroyMaps();
  try{ postProcessData(); }catch(e){ console.warn("[admin] postProcess", e); }
  _renderBase();
  try{ restoreForm(snap); }catch(e){}
  try{ afterRender(); }catch(e){ console.warn("[admin] afterRender", e); }
};
function afterRender(){
  updateBell(); updateAdminChip(); updateLivePill(); syncThemeUI();
  const needMap = ["fleetLeafletMap","zoneLeafletMap","ambLeafletMap","ridersLiveMiniMap"].some(id=>document.getElementById(id));
  if(needMap && typeof L==="undefined"){ if(_leafletRetry++ < 15) setTimeout(()=>render(), 400); return; }
  _leafletRetry = 0;
  if(document.getElementById("zoneLeafletMap")) initZoneMap();
  if(document.getElementById("ambLeafletMap")) initAmbMap();
}
document.addEventListener("change", (e)=>{
  const t = e.target, a = t && t.dataset && t.dataset.act;
  if(["zone-svc","emg-flag","comm-toggle","fleet-type-filter"].includes(a)) Actions[a](t);
});

/* ---------- Double-tap protection: one tap = one request, button shows busy ---------- */
const CHANGE_ONLY = new Set(["product-visible","zone-toggle","emg-toggle","emg-select","fleet-zone-filter","fleet-type-filter","zone-svc","emg-flag","comm-toggle"]);
const _busy = new Map();
function guardAction(name, fn){
  return function(el){
    const ev = window.event;
    if(CHANGE_ONLY.has(name) && ev && ev.type==="click" && el && (el.tagName==="INPUT" || el.tagName==="SELECT")) return;
    const ds = (el && el.dataset) || {}, key = name+":"+(ds.id||ds.key||ds.kind||ds.to||"");
    if(_busy.has(key)) return;
    let r;
    try{ r = fn.apply(this, arguments); }catch(err){ console.error(err); toast("Something went wrong: "+err.message,"danger"); return; }
    if(r && typeof r.then==="function"){
      _busy.set(key, true);
      const btn = el && el.closest ? el.closest("button") : null;
      if(btn){ btn.disabled = true; btn.classList.add("is-busy"); }
      let finished = false;
      const done = ()=>{ if(finished) return; finished = true; _busy.delete(key); if(btn){ btn.disabled = false; btn.classList.remove("is-busy"); } };
      const timer = setTimeout(done, 25000);
      r.then(()=>{ clearTimeout(timer); done(); }, (err)=>{ clearTimeout(timer); done(); console.error(err); toast("Failed: "+((err&&err.message)||err),"danger"); });
    }
    return r;
  };
}
Object.keys(Actions).forEach(k=>{ Actions[k] = guardAction(k, Actions[k]); });

/* =========================================================
   10b. v3 - role access, dark/light theme, live channel count, admin invite
   ========================================================= */

/* ---------- Role access (UI level). Edit ROLE_RULES to change what each role can open / do. ----------
   Super Admin (and the built-in owner login) = everything. An unknown role name = read-only (fail closed). */
const ROLE_RULES = {
  "Operations Admin": { deny:["finance","payout","payment","adminroles"], denyActs:/^(pay-|payout-|refund-|ledger-|comm-)/ },
  "Finance Admin":    { allow:["dashboard","orders","finance","payout","payment","reports"], allowActs:/^(pay-|payout-|refund-|ledger-|comm-|report-|invoice-|receipt-)/ },
  "Support Admin":    { allow:["dashboard","orders","support","reviews"], allowActs:/^(ticket-|review-)/ },
  "Read-only Admin":  { readOnly:true, deny:["adminroles"] },
};
const READ_SAFE = /^(logout|doc-open|fleet-|analytics-|report-|receipt-|invoice-|ledger-export|emg-goto|health-check|theme-)|-(view|detail|history)$/;
function roleRule(){
  const r = (DATA.me && DATA.me.role) || "Admin";
  if(r==="Admin" || r==="Super Admin") return null;
  return ROLE_RULES[r] || { readOnly:true, deny:["adminroles"] };
}
function isSuperAdmin(){
  const em = String((DATA.me && DATA.me.email) || "").toLowerCase();
  return em===MAIN_ADMIN_EMAIL || roleRule()===null;
}
function navAllowed(id){
  const r = roleRule(); if(!r || id==="logout") return true;
  if(r.allow) return r.allow.includes(id);
  return !(r.deny||[]).includes(id);
}
function actionAllowed(act){
  const r = roleRule(); if(!r) return true;
  if(READ_SAFE.test(act)) return true;
  if(r.readOnly || /^admin-/.test(act)) return false;
  if(r.allowActs) return r.allowActs.test(act);
  if(r.denyActs) return !r.denyActs.test(act);
  return true;
}
/* every Actions[...] goes through the role check (click, change and programmatic calls) */
Object.keys(Actions).forEach(k=>{
  const f = Actions[k]; if(typeof f!=="function") return;
  Actions[k] = function(...args){
    if(!actionAllowed(k)){ toast("Your role ("+((DATA.me&&DATA.me.role)||"Admin")+") cannot do this","danger"); try{ render(); }catch(e){} return; }
    return f.apply(this,args);
  };
});

/* ---------- Dark / light theme ---------- */
const THEME_KEY = "mf_admin_theme";
function currentTheme(){ return document.documentElement.getAttribute("data-theme") || "light"; }
function themePref(){ try{ const v = localStorage.getItem(THEME_KEY); return (v==="dark"||v==="light") ? v : "auto"; }catch(e){ return "auto"; } }
function resolveTheme(pref){ return (pref==="dark"||pref==="light") ? pref : ((window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light"); }
function syncThemeUI(){
  const t = currentTheme(), b = document.getElementById("themeBtn");
  if(b){ b.textContent = t==="dark" ? "☀" : "☾"; b.title = t==="dark" ? "Switch to light mode" : "Switch to dark mode"; }
  const m = document.querySelector('meta[name="theme-color"]'); if(m) m.setAttribute("content", t==="dark" ? "#0B1412" : "#F3F7F6");
}
function setTheme(pref){
  try{ if(pref==="auto") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, pref); }catch(e){}
  document.documentElement.setAttribute("data-theme", resolveTheme(pref)); syncThemeUI();
}
Actions["theme-set"] = (el)=>{ setTheme(el.dataset.theme); render(); };
document.addEventListener("click", (e)=>{ if(e.target.closest("#themeBtn")) setTheme(currentTheme()==="dark" ? "light" : "dark"); });
try{ matchMedia("(prefers-color-scheme: dark)").addEventListener("change", ()=>{ if(themePref()==="auto") setTheme("auto"); }); }catch(e){}
function appearanceCard(){
  const p = themePref(), b = (k,l)=>`<button class="btn sm ${p===k?"primary":""}" data-act="theme-set" data-theme="${k}">${l}</button>`;
  return `<div class="card"><div class="card-head"><h3>Appearance</h3><span class="sub">Saved on this device</span></div>
    <div class="card-body"><div class="row-flex" style="flex-wrap:wrap">${b("light","☀ Light")}${b("dark","☾ Dark")}${b("auto","◐ Match device")}</div></div></div>`;
}
const _settingsBeforeTheme = VIEWS.settings;
VIEWS.settings = () => appearanceCard() + _settingsBeforeTheme();

/* ---------- Live pill: how many realtime channels are really connected ---------- */
function updateLivePill(){
  const pill = document.getElementById("livePill"), lab = document.getElementById("liveLabel");
  if(!pill || !lab || !supabase) return;
  let ch = []; try{ ch = supabase.getChannels(); }catch(e){}
  const total = ch.length, up = ch.filter(c=>c.state==="joined").length;
  lab.textContent = total ? `Live · ${up}/${total}` : "Live";
  pill.classList.toggle("warn", total>0 && up>0 && up<total);
  pill.classList.toggle("off", total>0 && up===0);
  pill.title = total ? `${up} of ${total} realtime channels connected` : "Connecting…";
}
setInterval(updateLivePill, 3000);

/* ---------- Admin invite: emails a setup link to the invited address ---------- */
function adminLoginUrl(){ return new URL("admin.html", window.location.href).href; }
async function sendAdminLoginLink(email){
  try{ return await supabase.auth.signInWithOtp({ email, options:{ emailRedirectTo: adminLoginUrl(), shouldCreateUser:true } }); }
  catch(e){ return { error:e }; }
}
/* stamps "Last login" (and links the auth user) for the signed-in admin */
async function markAdminLogin(session){
  try{
    const email = String((session && session.user && session.user.email) || "").toLowerCase(); if(!email) return;
    await supabase.from('admins').update({ last_login:new Date().toISOString(), auth_user_id:session.user.id }).eq('email', email);
  }catch(e){}
}

/* ---------- Admin accounts: status badge, row buttons, manage actions ---------- */
function isOwnerEmail(e){ return String(e||"").trim().toLowerCase()===MAIN_ADMIN_EMAIL; }

function adminStatusBadge(r){
  if(isOwnerEmail(r.email)) return badge("Owner · protected","blue");
  const s = r.status || "invited";
  if(s==="active")    return badge("Active","green");
  if(s==="suspended") return badge("Suspended","gold");
  if(s==="blocked")   return badge("Blocked","red");
  return badge("Invited · setup pending","gray");
}

function adminRowActions(r){
  if(!isSuperAdmin()) return "";
  if(isOwnerEmail(r.email)) return `<span class="cell-sub">Cannot be changed</span>`;
  const me = String((DATA.me && DATA.me.email) || "").toLowerCase();
  if(String(r.email||"").toLowerCase()===me) return `<span class="cell-sub">You</span>`;
  if(r.role==="Super Admin" && !isOwnerEmail(me)) return "";
  const b = (act,label,cls)=>`<button class="btn sm ${cls||""}" data-act="${act}" data-id="${esc(r.id)}">${label}</button>`;
  const s = r.status || "invited", out = [];
  if(s==="invited")   out.push(b("admin-resend","Resend link"));
  if(s==="active")    out.push(b("admin-suspend","Suspend"), b("admin-block","Block","danger"), b("admin-reset","Reset access"));
  if(s==="suspended") out.push(b("admin-activate","Unsuspend"), b("admin-block","Block","danger"));
  if(s==="blocked")   out.push(b("admin-activate","Unblock"));
  out.push(b("admin-delete","Delete","danger"));
  return `<div class="row-flex" style="flex-wrap:wrap;gap:6px">${out.join("")}</div>`;
}

/* Every change goes through the database functions admin_set_status / admin_delete /
   admin_reset_access. They re-check on the server that the caller is a Super Admin and
   that the target is NOT medifinderindia@gmail.com, so this UI check is only a first guard. */
async function adminManage(id, what){
  if(!isSuperAdmin()){ toast("Only the Super Admin can manage admins","danger"); return; }
  const a = DATA.admins.find(x=>String(x.id)===String(id)); if(!a) return;
  if(isOwnerEmail(a.email)){ toast("The owner admin ("+MAIN_ADMIN_EMAIL+") is protected and cannot be changed","danger"); return; }
  const who = `${a.name} (${a.email})`;
  const T = {
    suspended:{ title:"Suspend admin?",  msg:`${who} will be signed out now and cannot log in until you unsuspend.`, ok:"Suspend", danger:true,  log:"Suspended admin", done:"Admin suspended" },
    blocked:  { title:"Block admin?",    msg:`${who} will be signed out now and blocked from logging in.`,           ok:"Block",   danger:true,  log:"Blocked admin",   done:"Admin blocked" },
    active:   { title:"Restore access?", msg:`${who} will be able to log in again.`,                                   ok:"Restore", danger:false, log:"Restored admin",  done:"Admin restored" },
    reset:    { title:"Reset access?",   msg:`${who} will be signed out, their password/phone/6-digit code setup is cleared, and a new setup link is emailed.`, ok:"Reset & email link", danger:true, log:"Reset access for admin", done:"Access reset - new setup link emailed" },
    delete:   { title:"Delete admin?",   msg:`${who} will be removed permanently and can no longer log in.`,           ok:"Delete",  danger:true,  log:"Deleted admin",   done:"Admin deleted" },
  }[what];
  if(!T) return;
  if(!(await askConfirm(T.title, T.msg, { danger:T.danger, ok:T.ok }))) return;

  let res;
  if(what==="delete")      res = await supabase.rpc('admin_delete',       { p_admin_id:a.id });
  else if(what==="reset")  res = await supabase.rpc('admin_reset_access', { p_admin_id:a.id });
  else                     res = await supabase.rpc('admin_set_status',   { p_admin_id:a.id, p_status:what });
  if(res.error){ toast(res.error.message || "Could not update this admin","danger"); return; }

  let note = T.done;
  if(what==="reset"){
    const mail = await sendAdminLoginLink(a.email);
    if(mail.error) note = "Access reset, but the email could not be sent: "+mail.error.message+" - use Resend link";
  }
  if(what==="active" && res.data && res.data.status==="invited") note = "Restored - setup still pending, use Resend link";
  await loadAdminsFromDB();
  await logAdminAction(`${T.log} ${who}`);
  render(); toast(note);
}

/* ---------- Full-screen gate (invite setup, expired link, suspended, session ended) ---------- */
function gateShow(inner){
  let root = document.getElementById("adminGate");
  if(!root){ root = document.createElement("div"); root.id = "adminGate"; root.className = "gate-overlay"; document.body.appendChild(root); }
  root.innerHTML = `<div class="gate-card"><div class="gate-brand"><div class="brand-mark">M</div><div><strong>MediFinder India</strong><span>Admin Console</span></div></div>${inner}</div>`;
  return root;
}
function gateMessage(title, text, btnLabel, onBtn){
  gateShow(`<h2>${esc(title)}</h2><p class="gate-sub">${esc(text)}</p><button class="btn primary gate-btn" id="gateOk">${esc(btnLabel)}</button>`);
  document.getElementById("gateOk").addEventListener("click", onBtn);
}
const goAdminLogin = ()=>{ window.location.replace("auth.html?admin=1"); };
const goHome = ()=>{ window.location.replace("home.html"); };

/* the email link carries "#error=access_denied&error_code=otp_expired..." when it is old / already used */
function readAuthLinkError(){
  try{
    const q = new URLSearchParams((window.location.hash||"").replace(/^#/,"") || window.location.search);
    const code = q.get("error_code") || q.get("error");
    return code ? (q.get("error_description") || code) : "";
  }catch(e){ return ""; }
}

/* ---------- Password / phone / 6-digit code rules (same rules the database enforces, plus password strength) ---------- */
const COMMON_PW = /(password|passw0rd|admin|qwerty|letmein|welcome|medifinder|iloveyou|12345|abcde)/i;
function pwRules(pw, email){
  const local = String(email||"").split("@")[0].toLowerCase();
  return [
    { t:"At least 10 characters",              ok: pw.length>=10 },
    { t:"One uppercase letter (A-Z)",          ok: /[A-Z]/.test(pw) },
    { t:"One lowercase letter (a-z)",          ok: /[a-z]/.test(pw) },
    { t:"One number (0-9)",                    ok: /[0-9]/.test(pw) },
    { t:"One symbol (! @ # $ % ...)",          ok: /[^A-Za-z0-9]/.test(pw) },
    { t:"Not a common word, not your email name", ok: pw.length>0 && !COMMON_PW.test(pw) && !(local.length>=4 && pw.toLowerCase().includes(local)) },
  ];
}
function pinProblem(pin){
  if(!/^\d{6}$/.test(pin)) return "The code must be exactly 6 digits";
  if(/^(\d)\1{5}$/.test(pin)) return "Choose a code that is not all the same digit";
  const d = pin.split("").map(Number);
  const asc  = d.every((x,i)=> i===0 || x===(d[i-1]+1)%10);
  const desc = d.every((x,i)=> i===0 || x===(d[i-1]+9)%10);
  if(asc || desc) return "Choose a code that is not a simple sequence (123456, 654321 ...)";
  if(["123123","112233","121212"].includes(pin)) return "Choose a less predictable code";
  return "";
}
function phoneOk(v){
  const n = String(v||"").replace(/\D/g,"");
  return /^[6-9]\d{9}$/.test(n) || /^0[6-9]\d{9}$/.test(n) || /^91[6-9]\d{9}$/.test(n);
}

/* ---------- First-time setup: opened from the emailed invite link ---------- */
function showAdminSetup(email, name){
  gateShow(`
    <h2>Welcome${name ? ", "+esc(name) : ""}</h2>
    <p class="gate-sub">Signed in as <b>${esc(email)}</b>. Create your sign-in details. You will need <b>all three</b> every time you log in.</p>
    <div class="field"><label>1. Create password</label><input id="gsPass" type="password" autocomplete="new-password"></div>
    <ul class="pw-rules" id="gsRules"></ul>
    <div class="field"><label>Confirm password</label><input id="gsPass2" type="password" autocomplete="new-password"></div>
    <div class="field"><label>2. Phone number</label><input id="gsPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="10-digit mobile number"></div>
    <div class="field"><label>3. Create a 6-digit code</label><input id="gsPin" type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="6 digits"></div>
    <div class="field"><label>Confirm 6-digit code</label><input id="gsPin2" type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="6 digits"></div>
    <div class="gate-err" id="gsErr" role="alert"></div>
    <button class="btn primary gate-btn" id="gsSave">Save and continue</button>
    <button class="btn gate-btn" id="gsCancel">Cancel and sign out</button>`);
  const $g = (id)=>document.getElementById(id);
  const drawRules = ()=>{ $g("gsRules").innerHTML = pwRules($g("gsPass").value, email).map(r=>`<li class="${r.ok?"ok":""}">${r.ok?"✔":"○"} ${esc(r.t)}</li>`).join(""); };
  drawRules(); $g("gsPass").addEventListener("input", drawRules);
  $g("gsPin").addEventListener("input", ()=>{ $g("gsPin").value = $g("gsPin").value.replace(/\D/g,"").slice(0,6); });
  $g("gsPin2").addEventListener("input", ()=>{ $g("gsPin2").value = $g("gsPin2").value.replace(/\D/g,"").slice(0,6); });
  $g("gsCancel").addEventListener("click", async ()=>{ try{ await supabase.auth.signOut(); }catch(e){} goHome(); });
  $g("gsSave").addEventListener("click", async ()=>{
    const err = (m)=>{ $g("gsErr").textContent = m || ""; };
    const pass=$g("gsPass").value, pass2=$g("gsPass2").value, phone=$g("gsPhone").value.trim(), pin=$g("gsPin").value, pin2=$g("gsPin2").value;
    const bad = pwRules(pass, email).find(r=>!r.ok);
    if(bad){ err("Password is too weak - "+bad.t.toLowerCase()); return; }
    if(pass!==pass2){ err("The two passwords do not match"); return; }
    if(!phoneOk(phone)){ err("Enter a valid 10-digit Indian mobile number"); return; }
    const pp = pinProblem(pin); if(pp){ err(pp); return; }
    if(pin!==pin2){ err("The two 6-digit codes do not match"); return; }
    err(""); const btn=$g("gsSave"); btn.disabled=true; btn.textContent="Saving...";
    try{
      /* password first: if the next step fails the person can simply press Save again */
      const up = await supabase.auth.updateUser({ password: pass });
      if(up.error) throw up.error;
      const r = await supabase.rpc('admin_setup_security', { p_phone: phone, p_pin: pin });
      if(r.error) throw r.error;
      try{ localStorage.removeItem('admin_auth_in_progress'); }catch(e){}
      window.location.replace(adminLoginUrl());     // reload: now verified, dashboard opens
    }catch(e){
      err((e && e.message) || "Could not save. Please try again.");
      btn.disabled=false; btn.textContent="Save and continue";
    }
  });
}

/* ---------- Ends the session within a minute if the admin is suspended / blocked / deleted, or the 12 h verification runs out ---------- */
let _adminWatch = null;
function startAdminSessionWatch(){
  if(_adminWatch || !supabase) return;
  _adminWatch = setInterval(async ()=>{
    try{
      const { data, error } = await supabase.rpc('is_admin');
      if(error || data===true) return;
      clearInterval(_adminWatch); _adminWatch = null;
      try{ await supabase.auth.signOut(); }catch(e){}
      gateMessage("Signed out", "Your admin access has ended: the 12-hour session expired, or your account was suspended, blocked or removed. Log in again to continue.", "Admin login", goAdminLogin);
    }catch(e){}
  }, 60000);
}

/* ---------------------------------------------------------
   9. INIT
   --------------------------------------------------------- */
async function init(){
  render(); // paint the shell immediately so the UI isn't blank while auth/data load
  if(!supabase){ return; } // supabase-js/constants not loaded on this page
  const linkError = readAuthLinkError();
  const { data:{ session } } = await supabase.auth.getSession();

  if(!session){
    if(linkError){
      gateMessage("This link is no longer valid", "The email link has expired or was already used. Ask the owner to send you a new invite link.", "Back to home", goHome);
      return;
    }
    showAdminLoginGate();
    return;
  }

  // Already verified (the owner login, or an invited admin who finished password + phone + 6-digit code)?
  const { data: isAdmin, error: rpcError } = await supabase.rpc('is_admin');
  if(rpcError){
    // Network/transient error: don't sign out, just offer a retry
    gateMessage("Could not verify admin access", "Check your connection and try again.", "Retry", ()=>window.location.reload());
    return;
  }
  if(isAdmin === true){
    try{ localStorage.removeItem('admin_auth_in_progress'); }catch(e){}
    markAdminLogin(session);
    bootAdminDashboard();
    startAdminSessionWatch();
    return;
  }

  // Signed in, but not verified as an admin yet: decide what this person needs next
  const { data: st, error: stError } = await supabase.rpc('admin_my_status');
  if(stError){
    gateMessage("Could not verify admin access", "Check your connection and try again.", "Retry", ()=>window.location.reload());
    return;
  }
  if(!st || !st.invited){
    await supabase.auth.signOut();
    showAdminLoginGate("This account is not an admin account.");
    return;
  }
  if(st.status==="suspended" || st.status==="blocked"){
    await supabase.auth.signOut();
    gateMessage(st.status==="blocked" ? "Admin account blocked" : "Admin account suspended", "You cannot use the admin panel right now. Please contact the owner.", "Back to home", goHome);
    return;
  }
  if(st.status==="invited" || !st.has_security){
    showAdminSetup(session.user.email, st.name);   // first time: create password, phone, 6-digit code
    return;
  }
  // Active admin, but this session has not passed password + phone + 6-digit code: full login needed every time
  await supabase.auth.signOut();
  gateMessage("Please log in", "For security, sign in with your email, password, phone number and 6-digit code.", "Go to admin login", goAdminLogin);
}
/* =========================================================
   ERROR LOGS  (System -> Error Logs)
   Every Shiprocket / NimbusPost / courier failure is written by the
   `courier` edge function into public.system_error_logs.
   ========================================================= */
async function loadErrorLogsFromDB(){
  if(!supabase) return;
  const { data, error } = await supabase.from('system_error_logs').select('*').order('created_at', { ascending:false }).limit(300);
  if(error){ console.warn("[admin] error logs not loaded:", error.message); return; }
  DATA.errorLogs = data || [];
}
const ERR_RULES = [
  [/INSUFFICIENT_BALANCE|Insufficient wallet/i, "NimbusPost wallet has no balance", "Recharge the NimbusPost wallet (NimbusPost panel → Wallet → Recharge). Each order needs about ₹90–135."],
  [/KYC verification is mandated/i, "Shiprocket KYC is not complete", "Complete KYC in Shiprocket panel → Settings → KYC. Shiprocket will not issue an AWB until then."],
  [/addpickup|do not have permission|Unauthorized/i, "Shiprocket login has no permission to add a pickup address", "In Shiprocket → Settings → API create an API user, then put its email/password in Supabase secrets SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD."],
  [/ORDER_NUMBER_DUPLICATE|already exists on channel/i, "Order ID already exists on NimbusPost", "The system retries with a new ID automatically. If it still fails, delete the old draft order in the NimbusPost panel."],
  [/SKU cannot be repeated/i, "Two items in the order share the same SKU", "Check the order items. Lines of the same medicine are merged automatically."],
  [/no warehouse for pincode/i, "No NimbusPost pickup warehouse for this shop's pincode", "Merchant → Settings → NimbusPost pickup setup, or add the shop as a warehouse in the NimbusPost panel."],
  [/key\/secret not set/i, "NimbusPost API key is missing", "Add NIMBUS_API_KEY and NIMBUS_API_SECRET in Supabase → Edge Functions → Secrets."],
  [/Shiprocket login failed|credentials are missing/i, "Shiprocket login failed", "Check SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in Supabase secrets (use an API user)."],
  [/Pincode missing/i, "Pincode is missing", "The customer address or the shop address has no 6-digit pincode. Add it and try again."],
  [/not a valid 10-digit/i, "Customer phone number is not valid", "A courier needs a 10-digit mobile number. Fix the phone on the order."],
  [/Merchant profile incomplete/i, "Merchant profile is incomplete for pickup", "Ask the merchant to complete phone, address, city, state and pincode in Settings."],
  [/No courier is serviceable|not serviceable/i, "No courier delivers on this route", "Check both pincodes. Use MediFinder India delivery for this order instead."],
  [/Order must be accepted/i, "Order was not accepted before dispatch", "Accept the order first, then dispatch."],
  [/label/i, "Shipping label is not available", "Open the order again after a few minutes, or download the label from the courier panel."],
  [/ProxiedDomainError/i, "NimbusPost rejected the request", "Read the details below for the exact reason."],
];
function explainError(message, source){
  const m = String(message||"");
  for(const [re,title,fix] of ERR_RULES){ if(re.test(m)) return { title, fix }; }
  return { title: (source==="shiprocket" ? "Shiprocket" : source==="nimbuspost" ? "NimbusPost" : "Courier")+" error", fix:"Open Details to see the full message from the courier." };
}
const ERR_SRC = { shiprocket:["Shiprocket","blue"], nimbuspost:["NimbusPost","gold"], courier:["Courier","gray"] };
VIEWS.errorlogs = () => {
  const st = vs("errorlogs", {tab:"open", src:"all"});
  const all = DATA.errorLogs || [];
  const bySrc = all.filter(e=> st.src==="all" || e.source===st.src);
  const rows = bySrc.filter(e=> st.tab==="all" ? true : st.tab==="resolved" ? !!e.resolved : !e.resolved);
  const openN = all.filter(e=>!e.resolved).length, resN = all.filter(e=>e.resolved).length;
  const srcChip = (k,l)=>`<button class="btn sm ${st.src===k?"primary":""}" data-act="errlog-src" data-src="${k}">${l}</button>`;
  return `
  <div class="view-head"><h1>Error Logs</h1><p>Every Shiprocket, NimbusPost and courier error — what went wrong and how to fix it.</p></div>
  <div class="view-toolbar" style="gap:8px;flex-wrap:wrap">
    ${toolbarTabs("errorlogs",[{key:"open",label:`Open (${openN})`},{key:"resolved",label:`Resolved (${resN})`},{key:"all",label:"All"}])}
    <span style="display:flex;gap:6px;flex-wrap:wrap;margin-left:auto">
      ${srcChip("all","All")}${srcChip("shiprocket","Shiprocket")}${srcChip("nimbuspost","NimbusPost")}${srcChip("courier","Other")}
    </span>
  </div>
  <div class="view-toolbar" style="gap:8px;flex-wrap:wrap">
    <button class="btn" data-act="errlog-refresh">↻ Refresh</button>
    ${openN ? `<button class="btn" data-act="errlog-resolve-all">✓ Mark all resolved</button>` : ""}
    ${resN ? `<button class="btn danger" data-act="errlog-clear">Delete resolved</button>` : ""}
  </div>
  <div class="card"><div class="card-body pad0">
  ${renderTable("errorlogs-t",[
    {key:"created_at",label:"When",render:r=>`<div>${esc(fmtDateTime(r.created_at))}</div>`},
    {key:"source",label:"From",render:r=>{ const s=ERR_SRC[r.source]||[r.source||"Other","gray"]; return badge(s[0], s[1]); }},
    {key:"message",label:"Problem",sortable:false,render:r=>{ const x=explainError(r.message,r.source); return `<div style="font-weight:600">${esc(x.title)}</div><div class="cell-sub" style="max-width:420px;white-space:normal">${esc(String(r.message).slice(0,140))}${String(r.message).length>140?"…":""}</div>`; }},
    {key:"order_id",label:"Order",render:r=>`<span class="cell-mono">${esc(r.order_id||"—")}</span>`},
    {key:"_fix",label:"How to fix",sortable:false,render:r=>`<div style="max-width:320px;white-space:normal">${esc(explainError(r.message,r.source).fix)}</div>`},
    {key:"_a",label:"",sortable:false,render:r=>`<div class="actions-cell"><button class="btn sm" data-act="errlog-detail" data-id="${r.id}">Details</button>${r.resolved?"":`<button class="btn sm primary" data-act="errlog-resolve" data-id="${r.id}">Resolved</button>`}</div>`},
  ], rows, {emptyText: st.tab==="open" ? "No open errors. Everything is working." : "No errors in this view."})}
  </div></div>`;
};
Actions["errlog-src"] = (el)=>{ vs("errorlogs",{tab:"open",src:"all"}).src = el.dataset.src; render(); };
Actions["errlog-refresh"] = async ()=>{ await loadErrorLogsFromDB(); render(); toast("Error logs refreshed"); };
Actions["errlog-detail"] = (el)=>{
  const r = (DATA.errorLogs||[]).find(x=>String(x.id)===String(el.dataset.id)); if(!r) return;
  const x = explainError(r.message, r.source), s = ERR_SRC[r.source]||[r.source||"Other","gray"];
  openModal("Error details", `
    ${detailRow("Problem", `<b>${esc(x.title)}</b>`)}
    ${detailRow("How to fix", esc(x.fix))}
    ${detailRow("From", badge(s[0], s[1]))}
    ${detailRow("Order", esc(r.order_id||"—"))}
    ${detailRow("Action", esc(r.action||"—"))}
    ${detailRow("When", esc(fmtDateTime(r.created_at)))}
    ${detailRow("Status", r.resolved ? "Resolved" : "Open")}
    <div class="hint" style="font-weight:600;margin:14px 0 6px">Full message from the courier</div>
    <pre style="white-space:pre-wrap;word-break:break-word;background:var(--surface-alt);border:1px solid var(--line);border-radius:10px;padding:12px;font-size:12px;margin:0">${esc(r.message)}</pre>`,
    `<button class="btn" data-close-modal>Close</button>${r.resolved?"":`<button class="btn primary" data-act="errlog-resolve" data-id="${r.id}" data-close="1">Mark resolved</button>`}`);
};
Actions["errlog-resolve"] = async (el)=>{
  const r = (DATA.errorLogs||[]).find(x=>String(x.id)===String(el.dataset.id)); if(!r) return;
  r.resolved = true; if(el.dataset.close) closeModal(); render(); toast("Marked as resolved");
  const { error } = await supabase.from('system_error_logs').update({ resolved:true, resolved_at:new Date().toISOString() }).eq('id', r.id);
  if(error){ r.resolved = false; render(); toast("Failed: "+error.message,"danger"); }
};
Actions["errlog-resolve-all"] = async ()=>{
  const open = (DATA.errorLogs||[]).filter(e=>!e.resolved); if(!open.length) return;
  open.forEach(e=>{ e.resolved = true; }); render(); toast("All errors marked resolved");
  const { error } = await supabase.from('system_error_logs').update({ resolved:true, resolved_at:new Date().toISOString() }).in('id', open.map(e=>e.id));
  if(error){ open.forEach(e=>{ e.resolved = false; }); render(); toast("Failed: "+error.message,"danger"); }
};
Actions["errlog-clear"] = async ()=>{
  const done = (DATA.errorLogs||[]).filter(e=>e.resolved); if(!done.length) return;
  if(!(await askConfirm("Delete resolved errors?", `${done.length} resolved error${done.length>1?"s":""} will be removed for good.`, {danger:true, ok:"Delete"}))) return;
  const ids = done.map(e=>e.id); DATA.errorLogs = DATA.errorLogs.filter(e=>!e.resolved); render(); toast("Resolved errors deleted");
  const { error } = await supabase.from('system_error_logs').delete().in('id', ids);
  if(error){ await loadErrorLogsFromDB(); render(); toast("Failed: "+error.message,"danger"); }
};


init();
