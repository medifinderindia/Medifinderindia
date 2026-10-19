console.log("marchent.js v15 loaded");
/* ===== Light / Dark theme manager (saved in localStorage 'mf_theme') ===== */
(function () {
  'use strict';
  var KEY = 'mf_theme', root = document.documentElement;
  function get() { try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; } }
  function sync() {
    var t = get(), n = document.querySelectorAll('[data-theme-opt]');
    for (var i = 0; i < n.length; i++) {
      var on = n[i].getAttribute('data-theme-opt') === t;
      if (n[i].classList.contains('active') !== on) n[i].classList.toggle('active', on);
      n[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
  function paint() { var t = get(); root.setAttribute('data-theme', t); root.style.colorScheme = t; sync(); }
  function set(t) { try { localStorage.setItem(KEY, t === 'dark' ? 'dark' : 'light'); } catch (e) {} paint(); }
  window.MFTheme = { get: get, set: set };
  paint();
  window.addEventListener('storage', function (e) { if (e.key === KEY) paint(); });
  document.addEventListener('click', function (e) {
    var o = e.target && e.target.closest && e.target.closest('[data-theme-opt]');
    if (o) set(o.getAttribute('data-theme-opt'));
  });
  document.addEventListener('DOMContentLoaded', function () {
    sync();
    if (!window.MutationObserver) return;
    var q = false;
    new MutationObserver(function () { if (q) return; q = true; (window.requestAnimationFrame || setTimeout)(function () { q = false; sync(); }); })
      .observe(document.body, { childList: true, subtree: true });
  });
})();
/* ===== end theme manager ===== */

(function () {
  'use strict';

  const ICONS = {
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-6h4v6"/>',
    orders: '<path d="M4 7l8-4 8 4-8 4-8-4z"/><path d="M4 7v10l8 4 8-4V7"/><path d="M12 11v10"/>',
    rx: '<path d="M9 2h6v4H9z"/><path d="M7 6h10v16H7z"/><path d="M9 11h6M9 15h4"/>',
    inventory: '<path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 8v9l9 5 9-5V8"/><path d="M12 13v9"/>',
    tag: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7" cy="7" r="1.5"/>',
    truck: '<path d="M2 8h11v8H2z"/><path d="M13 11h4l4 3v2h-8z"/><circle cx="6" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    wallet: '<path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3"/><path d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H6a2 2 0 0 1 0-4"/><circle cx="16.5" cy="14" r="1.3"/>',
    chart: '<path d="M4 20V10M11 20V4M18 20v-7"/><path d="M2 20h20"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.8 1c0 1.6-2.3 1.8-2.3 3.4"/><path d="M12 17.2v.1"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>',
    phone: '<path d="M6 3h4l1 5-2.5 1.5a12 12 0 0 0 6 6L16 13l5 1v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/>',
    chevronR: '<path d="M9 6l6 6-6 6"/>',
    chevronL: '<path d="M15 6l-6 6 6 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    edit: '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    check: '<path d="M4 12l6 6L20 6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    store: '<path d="M3 9l1-5h16l1 5"/><path d="M4 9v10h16V9"/><path d="M9 19v-6h6v6"/>',
    pin: '<path d="M12 21s7-7.4 7-12a7 7 0 1 0-14 0c0 4.6 7 12 7 12z"/><circle cx="12" cy="9" r="2.3"/>',
    file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
    bank: '<path d="M3 10l9-6 9 6"/><path d="M5 10v9M10 10v9M14 10v9M19 10v9"/><path d="M3 21h18"/>',
    camera: '<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13.5" r="3.3"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    box: '<path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 8v9l9 5 9-5V8"/>',
    star: '<path d="M12 3l2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 17l-5.6 3.1 1.4-6.3L3 9.5l6.4-.6z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    doc2: '<path d="M8 3h6l5 5v13H8z"/><path d="M14 3v5h5"/><path d="M11 13h4M11 17h4"/>',
    filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
    pill: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9.6 9.6l4.8 4.8"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 3-5.5 6.5-5.5s6.5 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.7c2.2.6 3.5 2.2 3.5 5.3"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    percent: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.2"/><circle cx="17" cy="17" r="2.2"/>',
    steth: '<path d="M6 3v6a4 4 0 0 0 8 0V3"/><path d="M10 13v2a5 5 0 0 0 10 0v-1"/><circle cx="20" cy="12" r="2"/>'
  };
  function icon(name, extraClass) {
    return `<svg class="${extraClass || ''}" viewBox="0 0 24 24">${ICONS[name] || ''}</svg>`;
  }

  const delay = (ms) => new Promise((res) => setTimeout(res, ms));
  const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  const timeAgo = (d) => {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (p) => p + Math.random().toString(36).slice(2, 8).toUpperCase();
  const RX_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function showToast(msg, type) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast' + (type ? ' ' + type : ' success');
    t.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  /* ===== Save-button states: Save -> Saving… -> Saved Successfully | Save Failed — Retry ===== */
  const BS_ICON = {
    spin: '<span class="bs-spin" aria-hidden="true"></span>',
    ok: '<svg class="bs-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path class="bs-tick" d="M8 12.5l2.7 2.7L16 9.5"/></svg>',
    fail: '<svg class="bs-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.6v.1"/></svg>'
  };
  const BtnState = {
    _paint(btn, cls, icon, text) {
      if (!btn) return;
      if (btn._bsHtml == null) btn._bsHtml = btn.innerHTML;
      clearTimeout(btn._bsT);
      btn.classList.add('btn-state');
      btn.classList.remove('is-loading', 'is-success', 'is-fail');
      if (cls) btn.classList.add(cls);
      btn.innerHTML = icon + '<span class="bs-txt">' + esc(text) + '</span><i class="spinner" hidden aria-hidden="true"></i>';   // hidden marker: tells btn-loading.js this button is already handled
    },
    start(btn, text) {
      if (!btn) return;
      this._paint(btn, 'is-loading', BS_ICON.spin, text || 'Saving…');
      btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    },
    ok(btn, text, hold) {
      if (!btn) return Promise.resolve();
      const ms = hold == null ? 750 : hold;
      this._paint(btn, 'is-success', BS_ICON.ok, text || 'Saved Successfully');
      btn.disabled = true; btn.removeAttribute('aria-busy');
      btn._bsT = setTimeout(() => this.reset(btn), ms + 1500);   // only matters if the page is not re-rendered
      return new Promise(r => setTimeout(r, ms));
    },
    fail(btn, text) {
      if (!btn) return;
      this._paint(btn, 'is-fail', BS_ICON.fail, text || 'Save Failed — Retry');
      btn.disabled = false; btn.removeAttribute('aria-busy');
      btn._bsT = setTimeout(() => this.reset(btn), 8000);
    },
    reset(btn) {
      if (!btn) return;
      clearTimeout(btn._bsT);
      if (btn._bsHtml != null) { btn.innerHTML = btn._bsHtml; btn._bsHtml = null; }
      btn.classList.remove('btn-state', 'is-loading', 'is-success', 'is-fail');
      btn.disabled = false; btn.removeAttribute('aria-busy');
    }
  };
  const submitBtn = (e, root) => (e && e.submitter) || (root || e.target).querySelector('button.btn-primary, button.btn-danger, button:not([type])');

  function confirmDialog(title, body) {
    return new Promise((resolve) => {
      const scrim = document.getElementById('confirmScrim');
      document.getElementById('confirmTitle').textContent = title;
      document.getElementById('confirmBody').textContent = body || '';
      scrim.hidden = false;
      const ok = document.getElementById('confirmOk');
      const cancel = document.getElementById('confirmCancel');
      const cleanup = (val) => { scrim.hidden = true; ok.onclick = null; cancel.onclick = null; resolve(val); };
      ok.onclick = () => cleanup(true);
      cancel.onclick = () => cleanup(false);
    });
  }

  // Read the shared constants file (supabase-constants.js) if it is loaded; fall back to the project defaults.
  function globalPick(names) {
    for (const n of names) {
      try { const v = (new Function('return typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined'))(); if (v) return v; } catch (e) { /* not defined */ }
    }
    return undefined;
  }
  const _cfg = globalPick(['SUPABASE_CONFIG', 'supabaseConfig', 'SUPABASE_CONSTANTS']) || {};
  const SB_URL = window.MF_SUPABASE_URL || globalPick(['SUPABASE_URL', 'supabaseUrl', 'SUPABASE_PROJECT_URL', 'SUPA_URL']) || _cfg.url || _cfg.SUPABASE_URL || 'https://rnpbglinkpsikeszcjcl.supabase.co';
  const SB_KEY = window.MF_SUPABASE_KEY || globalPick(['SUPABASE_ANON_KEY', 'SUPABASE_KEY', 'supabaseAnonKey', 'supabaseKey', 'SUPABASE_PUBLISHABLE_KEY', 'SUPA_KEY']) || _cfg.anonKey || _cfg.key || _cfg.SUPABASE_ANON_KEY || 'sb_publishable_Ogc4JOrhQXAl9zRTDU0y3g_oGnitfuZ';
  const _lib = window.supabase;
  const sb = (_lib && _lib.createClient) ? _lib.createClient(SB_URL, SB_KEY) : ((_lib && _lib.auth) ? _lib : null);
  const PRODUCT_BUCKET = 'products';   // existing public storage bucket (authenticated upload)
  let productsCache = null;
  let merchantIdCache = null;
  if (sb) sb.auth.onAuthStateChange((evt) => { if (evt === 'SIGNED_OUT') { merchantIdCache = null; productsCache = null; } });

  function appError(code, message) { const e = new Error(message); e.code = code; return e; }

  async function requireMerchantId() {
    if (merchantIdCache) return merchantIdCache;
    if (!sb) throw appError('NO_SUPABASE', 'The Supabase library could not be loaded.');
    const { data: s, error: sErr } = await sb.auth.getSession();
    if (sErr) throw sErr;
    const user = s && s.session ? s.session.user : null;
    if (!user) throw appError('AUTH_REQUIRED', 'Please sign in.');
    // same relationship the RLS policies use: merchants.auth_user_id = auth.uid() OR merchants.email = auth.email()
    const filters = [`auth_user_id.eq.${user.id}`];
    if (user.email) filters.push(`email.eq."${user.email}"`);
    const { data, error } = await sb.from('merchants').select('id').or(filters.join(',')).order('id', { ascending: true }).limit(1);
    if (error) throw error;
    if (!data || !data.length) throw appError('NO_MERCHANT', 'No merchant account is linked to this login.');
    merchantIdCache = data[0].id;
    return merchantIdCache;
  }

  const DB_TYPE = { medicine: 'Medicine', instrument: 'Instrument', general: 'General', personal_care: 'Personal Care', grocery: 'Grocery', baby_mother: 'Baby & Mother Care', nutrition: 'Medical Nutrition' };
  const typeFromDb = (t) => { const x = String(t || '').toLowerCase(); return /instrument/.test(x) ? 'instrument' : /baby|mother/.test(x) ? 'baby_mother' : /nutrition|supplement/.test(x) ? 'nutrition' : /personal/.test(x) ? 'personal_care' : /general/.test(x) ? 'general' : /grocery|food/.test(x) ? 'grocery' : 'medicine'; };
  const blankBatch = () => ({ serial: '', batchNo: '', lotNo: '', mfd: '', expiry: '', qty: '', cost: '' });
  function rowToProduct(r, priv) {
    const raw = String(r.status || '').toLowerCase();
    let status, active = true;
    if (raw === 'draft') status = 'draft';
    else if (raw === 'rejected') status = 'rejected';
    else if (raw === 'restricted') { status = 'restricted'; active = false; }
    else if (raw === 'inactive') { status = 'approved'; active = false; }
    else if (raw === 'approved' || raw === 'active' || r.admin_approved) status = 'approved';
    else status = 'pending';
    const type = typeFromDb(r.product_type);
    const price = r.selling_price != null ? Number(r.selling_price) : Number(r.unit_price || 0);
    const mrp = r.mrp != null ? Number(r.mrp) : price;
    const images = [r.image_url, r.image_url_2, r.image_url_3, r.image_url_4].map(x => x || '');
    const ed = (r.extra_details && typeof r.extra_details === 'object') ? r.extra_details : {};
    const x = { ...((ed.x && typeof ed.x === 'object') ? ed.x : {}) };
    if (!x.manufacturer) x.manufacturer = r.manufacturer || '';
    const costs = (priv && Array.isArray(priv.costs)) ? priv.costs : [];
    const batches = (Array.isArray(ed.batches) && ed.batches.length)
      ? ed.batches.map(b => ({ ...blankBatch(), ...b }))
      : [{ ...blankBatch(), batchNo: r.batch_number || '', lotNo: r.lot_number || '', mfd: r.mfd_date || '', expiry: r.expiry_date || '', qty: r.stock_qty != null ? Number(r.stock_qty) : '' }];
    batches.forEach((b, i) => { b.cost = costs[i] != null ? costs[i] : ''; });
    const docs = [0, 1].map(i => ({ url: '', name: '', ...((Array.isArray(ed.docs) && ed.docs[i]) || {}) }));
    const cb = (ed.combo && typeof ed.combo === 'object') ? ed.combo : {};
    const combo = [0, 1].map(i => { const it = (Array.isArray(cb.items) && cb.items[i]) || {}; return { type: it.type || '', category: it.category || '', x: { ...((it.x && typeof it.x === 'object') ? it.x : {}) } }; });
    return {
      id: r.id, type, status, active, isCombo: !!cb.enabled, combo,
      name: r.product_name || r.name || '', generic: r.generic_name || '', brand: r.brand_name || r.manufacturer || '',
      manufacturer: r.manufacturer || r.brand_name || '',
      category: r.category || '', subCategory: r.sub_category || '', description: r.description || '',
      images, image: images[0], docs, x, batches,
      mrp, price, discount: calcDiscount(mrp, price),
      stock: Number(r.stock_qty || 0), minStock: r.min_stock_alert != null ? Number(r.min_stock_alert) : 5,
      unitType: r.unit_type || '',
      dosageForm: r.dosage_form || '', strength: r.strength || '', packSize: r.pack_size || '', composition: r.composition || '',
      rxRequired: !!r.is_rx || r.prescription_req === 'Yes',
      batchNo: r.batch_number || '', lotNo: r.lot_number || '', mfd: r.mfd_date || '', expiry: r.expiry_date || '',
      storage: type !== 'instrument' ? (r.storage_condition || '') : '',
      modelNumber: r.model_number || '', color: r.item_color || '', deviceType: r.device_type || '', display: r.display_spec || '',
      battery: r.battery_info || '', range: r.measurement_range || '', warranty: r.warranty_period || 'No Warranty',
      care: type === 'instrument' ? (r.storage_condition || '') : '',
      gst: r.gst_rate != null ? Number(r.gst_rate) : '', hsn: r.hsn_code || '', weight: r.weight_kg != null ? Number(r.weight_kg) : '', sideEffects: r.side_effects || '',
      returnable: !!r.is_returnable, returnDays: r.return_window_days != null ? r.return_window_days : '',
      exchangeable: !!r.is_exchangeable, exchangeDays: r.exchange_window_days != null ? r.exchange_window_days : '',
      createdAt: r.created_at
    };
  }
  function productToRow(p, merchantId) {
    const isMed = p.type === 'medicine';
    const x = p.x || {};
    const bs = Array.isArray(p.batches) ? p.batches : [];
    let status, admin_approved;
    if (p.status === 'draft') { status = 'Draft'; admin_approved = false; }
    else if (p.status === 'approved') { status = p.active === false ? 'Inactive' : 'Approved'; admin_approved = true; }
    else if (p.status === 'restricted') { status = 'Restricted'; admin_approved = false; }
    else { status = 'Pending'; admin_approved = false; }          // 'pending' (and re-published 'rejected')
    const imgs = p.images || [];
    const row = {
      merchant_id: merchantId,
      product_type: DB_TYPE[p.type] || 'Medicine',
      product_name: p.name, name: p.name,
      generic_name: p.generic || null, brand_name: p.brand || null, manufacturer: x.manufacturer || p.brand || '',
      category: p.category || null, sub_category: p.subCategory || null, description: p.description || '',
      image_url: imgs[0] || '', image_url_2: imgs[1] || null, image_url_3: imgs[2] || null, image_url_4: imgs[3] || null,
      mrp: p.mrp, selling_price: p.price, unit_price: p.price,
      stock_qty: p.stock, min_stock_alert: p.minStock, unit_type: p.unitType || null,
      gst_rate: (p.gst === '' || p.gst == null) ? null : Number(p.gst), hsn_code: p.hsn ? String(p.hsn).trim() : null,
      is_returnable: !!p.returnable, return_window_days: p.returnable ? (Number(p.returnDays) || null) : null,
      is_exchangeable: !!p.exchangeable, exchange_window_days: p.exchangeable ? (Number(p.exchangeDays) || null) : null,
      extra_details: {
        x,
        batches: bs.map(({ cost, ...b }) => b),            // purchase prices are NOT stored here (customer-readable table)
        docs: (p.docs || []).map(d => ({ url: (d && d.url) || '', name: (d && d.name) || '' })),
        combo: { enabled: !!p.isCombo, items: (p.combo || []).slice(0, 2).map(it => ({ type: (it && it.type) || '', category: (it && it.category) || '', x: (it && it.x) || {} })) }
      },
      status, admin_approved
    };
    if (!isMed) row.weight_kg = (p.weight === '' || p.weight == null) ? null : Number(p.weight);
    if (isMed) Object.assign(row, {
      dosage_form: p.dosageForm || '', strength: p.strength || '', pack_size: p.packSize || null, composition: p.composition || '',
      prescription_req: p.rxRequired ? 'Yes' : 'No', is_rx: !!p.rxRequired,
      batch_number: p.batchNo || '', lot_number: p.lotNo || null,
      mfd_date: p.mfd || null, expiry_date: p.expiry || null, storage_condition: p.storage || '',
      side_effects: p.sideEffects || null
    });
    else if (p.type !== 'instrument') Object.assign(row, {      // general / personal care / baby / nutrition / grocery
      dosage_form: p.dosageForm || '', pack_size: p.packSize || null, composition: p.composition || '',
      prescription_req: 'No', is_rx: false,
      batch_number: p.batchNo || '', lot_number: p.lotNo || null,
      mfd_date: p.mfd || null, expiry_date: p.expiry || null, storage_condition: p.storage || ''
    });
    else Object.assign(row, {
      model_number: p.modelNumber || null, item_color: p.color || null, device_type: p.deviceType || p.category || null,
      display_spec: p.display || null, battery_info: p.battery || null, measurement_range: p.range || null,
      warranty_period: p.warranty || null, storage_condition: p.care || '',   // storage / care instructions
      batch_number: p.batchNo || '', lot_number: p.lotNo || null, mfd_date: p.mfd || null, expiry_date: p.expiry || null
    });
    return row;
  }

  function dataUrlToBlob(dataUrl) {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
    if (!m) throw new Error('Invalid image data');
    const mime = m[1] || 'image/jpeg';
    const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // Merchant-only data (purchase prices) lives in product_private (RLS: owner / admin only)
  async function loadPrivate(mid) {
    try {
      const { data, error } = await sb.from('product_private').select('medicine_id,data').eq('merchant_id', mid);
      if (error || !data) return {};
      return Object.fromEntries(data.map(r => [r.medicine_id, r.data || {}]));
    } catch (e) { return {}; }
  }

  // New photos are data: URLs held in the browser; upload them to storage and return public URLs (existing http URLs are kept).
  async function uploadProductImages(merchantId, images, tag = '') {
    return Promise.all((images || []).map(async (src, i) => {
      if (!src || !src.startsWith('data:')) return src || '';
      const blob = dataUrlToBlob(src);   // no fetch(): data: URLs can be blocked by CSP / mobile webviews
      const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' })[blob.type] || 'jpg';
      const path = `${merchantId}/${Date.now()}-${tag}${i + 1}.${ext}`;
      const { error } = await sb.storage.from(PRODUCT_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
      if (error) { error.message = 'Image upload failed: ' + error.message; throw error; }
      return sb.storage.from(PRODUCT_BUCKET).getPublicUrl(path).data.publicUrl;
    }));
  }

  const TERMS_URL = 'marchentt_c.html#terms';       // Terms & Conditions (marchentt_c.html)
  const PRIVACY_URL = 'marchentt_c.html#privacy';   // Privacy Policy (same page)
  const RATE_PER_DAY = 10;                          // ₹ per product per day — Featured / Promote
  const PROMO_FAR_END = '2099-12-31T23:59:59.000Z';   // "no end date"
  const SETTINGS_KEY = 'mf_merchant_settings';

  const localDate = (d) => { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const toLocalInput = (d) => { d = new Date(d); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); };
  const isFarEnd = (d) => !d || new Date(d).getFullYear() >= 2099;
  const shortId = (id) => String(id || '').replace(/-/g, '').slice(0, 6).toUpperCase();
  const cleanQuery = (q) => String(q || '').replace(/[%,()*\\"']/g, ' ').trim();

  async function inChunks(table, select, col, values, extra) {
    const out = [];
    const uniq = [...new Set((values || []).filter(v => v !== null && v !== undefined && v !== ''))];
    for (let i = 0; i < uniq.length; i += 80) {
      let q = sb.from(table).select(select).in(col, uniq.slice(i, i + 80));
      if (extra) q = extra(q);
      const { data, error } = await q;
      if (error) throw error;
      if (data) out.push(...data);
    }
    return out;
  }

  let merchantRowCache = null;
  async function loadMerchantRow(force) {
    if (merchantRowCache && !force) return merchantRowCache;
    const mid = await requireMerchantId();
    const { data, error } = await sb.from('merchants').select('*').eq('id', mid).maybeSingle();
    if (error) throw error;
    if (!data) throw appError('NO_MERCHANT', 'No merchant account is linked to this login.');
    merchantRowCache = data;
    return data;
  }

  function loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (e) { s = {}; }
    return Object.assign({ notifOrders: true, notifRx: true, notifStock: true, notifPayout: true, language: 'English' }, s);
  }
  function persistSettings(patch) {
    const s = Object.assign(loadSettings(), patch);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ }
    return s;
  }

  function normalizeKyc(r) {
    const raw = String(r.kyc_status || '').toLowerCase();
    let status = 'not_started';
    if (raw === 'verified' || raw === 'approved') status = 'verified';
    else if (['pending', 'pending_review', 'submitted', 'under_review'].includes(raw)) status = 'pending_review';
    else if (raw === 'rejected') status = 'rejected';
    else if (raw === 'in_progress') status = 'in_progress';
    // merchants verified by the older admin flow only have license_status = 'verified'
    if (status !== 'rejected' && String(r.license_status || '').toLowerCase() === 'verified') status = 'verified';
    return status;
  }

  function rowToMerchant(r, verifiedOn, email) {
    const lat = r.latitude, lng = r.longitude;
    return {
      id: r.id,
      shopName: r.shop_name || r.merchant_name || '',
      ownerName: r.owner_name || '',
      category: r.business_category || '',
      about: r.about_shop || '',
      signature: r.signature_url || '',
      // own profile photo first; if none, fall back to the shop photo uploaded in KYC (Shop photo with signboard)
      photo: r.avatar_url || r.merchant_avatar || ((r.business_proof_type === 'Shop photo with signboard' && r.business_proof_img && !/\.pdf(\?|#|$)/i.test(r.business_proof_img)) ? r.business_proof_img : ''),
      phone: r.phone || '',
      email: r.email || email || '',
      address: {
        fullAddress: r.address || r.resolved_address || '', city: r.city || '', district: r.district || '',
        state: r.state || '', pincode: r.pincode || '',
        gps: (lat !== null && lat !== undefined && lng !== null && lng !== undefined) ? `${lat}, ${lng}` : '',
        lat, lng
      },
      license: { number: r.license_id || '', expiry: r.license_expiry || '', doc: r.license_img || '', status: r.license_status || 'unverified' },
      docs: {
        business: { type: r.business_proof_type || '', doc: r.business_proof_img || '' },
        gst: { number: r.gstin || '', doc: r.gst_img || '' },
        trade: { number: r.trade_license_no || '', doc: r.trade_license_img || '' },
        fssai: { number: r.fssai_no || '', expiry: r.fssai_expiry || '', doc: r.fssai_img || '' },
        pharmacist: { number: r.pharmacist_reg_no || '', doc: r.pharmacist_img || '' },
        invoice: { brand: r.brand_info || '', doc: r.invoice_img || '' },
        extra: { number: r.extra_permit_no || '', doc: r.extra_permit_img || '' }
      },
      identity: { idType: r.id_proof_type || 'Aadhaar', idNumber: r.id_proof_number || '', doc: r.id_proof_img || '', status: normalizeKyc(r) },
      bank: { accountHolder: r.bank_account_holder || r.owner_name || '', accountNumber: r.bank_no || '', ifsc: r.ifsc_code || '', upi: r.upi_id || '', doc: r.bank_image || '', status: r.bank_status || 'unverified' },
      codEnabled: r.cod_available !== false,
      kyc: { status: normalizeKyc(r), submittedOn: r.kyc_submitted_at, verifiedOn: verifiedOn || null, rejectionReason: r.kyc_rejection_reason || '' }
    };
  }

  async function uploadKycDoc(kind, file) {
    const { data: s } = await sb.auth.getSession();
    const uid = s && s.session ? s.session.user.id : null;
    if (!uid) throw appError('AUTH_REQUIRED', 'Please sign in.');
    if (file.size > 8 * 1024 * 1024) throw new Error('File must be under 8 MB');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
    const path = `${uid}/merchant-${kind}-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('license_docs').upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) throw error;
    const { data, error: e2 } = await sb.storage.from('license_docs').createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    if (e2) throw e2;
    return data.signedUrl;
  }

  function parseItemsText(t) {
    if (!t) return [];
    return String(t).split(/,\s+/).map(part => {
      const m = part.trim().match(/^(.*?)\s*(?:×|x|\|)\s*(\d+)$/i);
      return m ? { name: m[1].trim(), qty: Number(m[2]), price: 0 } : { name: part.trim(), qty: 1, price: 0 };
    }).filter(i => i.name);
  }
  // Online = paid through the app/gateway; COD = cash on delivery. Everything is labelled with exactly one of the two.
  function isOnlinePay(r) {
    const m = String(r.payment_mode || r.payment_method || '').toLowerCase();
    if (/cod|cash/.test(m)) return false;
    return /online|upi|razorpay|card|net|wallet|prepaid/.test(m) || !!r.razorpay_payment_id;
  }
  function payStateOf(r, online) {
    const st = String(r.payment_status || '').toLowerCase();
    const delivered = ['delivered', 'completed'].includes(String(r.status || '').toLowerCase());
    if (!online) return delivered ? 'Cash collected' : 'Pay on delivery';
    return /paid|success|captured|verified|complete/.test(st) ? 'Paid' : 'Payment pending';
  }
  const payText = (o) => `${o.paymentMode} · ${o.paymentState}`;
  const ORDER_STATUS_ALIAS = { completed: 'delivered', broadcasted: 'shipped', rejected: 'cancelled', canceled: 'cancelled' };
  function rowToOrder(r, itemRows, rider) {
    let items = [];
    if (itemRows && itemRows.length) items = itemRows.map(i => ({ name: i.product_name || i.name || 'Item', qty: num(i.quantity) || 1, price: num(i.unit_price || i.price) }));
    else if (Array.isArray(r.items) && r.items.length) items = r.items.map(i => ({ name: i.name || i.product_name || 'Item', qty: num(i.qty || i.quantity) || 1, price: num(i.price || i.unit_price) }));
    else items = parseItemsText(r.items_text);
    const st = String(r.status || 'pending').toLowerCase();
    const status = ORDER_STATUS_ALIAS[st] || st;
    const code = r.order_id || r.id;
    return {
      id: r.id, code, userId: r.user_id || '', userEmail: r.user_email || r.customer_email || '',
      customer: r.customer_name || r.user_name || 'Customer', phone: r.customer_phone || r.user_phone || '',
      address: r.customer_address || r.delivery_address || r.address || '',
      items, total: num(r.total_amount) || num(r.total), discount: num(r.discount), platformFee: num(r.platform_fee),
      paymentMode: isOnlinePay(r) ? 'Online' : 'COD', paymentState: payStateOf(r, isOnlinePay(r)),
      status, rawStatus: r.status,
      rider: rider ? (rider.full_name || rider.name || 'Rider') : null, riderPhone: rider ? rider.phone : '', riderVehicle: rider ? [rider.vehicle_type, rider.vehicle_number].filter(Boolean).join(' · ') : '',
      riderLat: r.rider_lat, riderLon: r.rider_lon, riderSeenAt: r.location_updated_at, etaMinutes: r.eta_minutes,
      rxRequired: !!(r.prescription_required || r.rx_verified || r.prescription_url || r.rx_prescription_url),
      rxVerified: !!(r.prescription_verified || r.rx_verified),
      prescriptionUrl: r.prescription_url || r.rx_prescription_url || '',
      partner: r.delivery_partner || (['shipped', 'picked_up'].includes(status) ? 'medifinder' : ''),
      courierName: r.courier_name || '', courierTracking: r.courier_tracking || '', courierProvider: r.courier_provider || '', courierCost: num(r.courier_cost),
      deliverySpeed: r.delivery_speed || 'manual',
      coupon: r.coupon_code || '', cancelReason: r.cancellation_reason || '',
      createdAt: r.created_at, deliveredAt: r.delivered_at
    };
  }

  let ordersCache = { t: 0, data: null };
  const invalidateOrders = () => { ordersCache = { t: 0, data: null }; };

  async function notifyMerchant(title, message, category, ref) {
    try {
      const mid = await requireMerchantId();
      await sb.from('merchant_notifications').insert({ merchant_id: mid, title, message, type: 'info', category: category || 'order', reference_id: ref && RX_UUID_RE.test(ref) ? ref : null });
    } catch (e) { console.warn('merchant notification failed', e); }
  }
  async function notifyCustomer(key, p) {
    try {
      const mid = await requireMerchantId();
      const cid = key.userId || key.email || key.userEmail || key.phone || null;
      await sb.from('customer_communications').insert({ merchant_id: mid, customer_id: cid, order_id: p.orderCode || null, message: p.message, subject: p.title, type: p.type || 'order_update', channel: 'in_app', sent_by: 'merchant' });
      if (key.userId && RX_UUID_RE.test(key.userId)) {
        await sb.from('notifications').insert({ user_id: key.userId, type: p.type || 'order', title: p.title, message: p.message, order_id: p.orderCode || null });
      }
    } catch (e) { console.warn('customer notification failed', e); }
  }

  function promoStatusOf(r) {
    const now = Date.now();
    const start = r.start_date ? new Date(r.start_date).getTime() : 0;
    const end = r.end_date && !isFarEnd(r.end_date) ? new Date(r.end_date).getTime() : Infinity;
    if (r.status === 'pending_payment') return 'pending_payment';
    if (r.status === 'paused' || r.is_active === false) return 'paused';
    if (end < now) return 'expired';
    if (start > now) return 'scheduled';
    return 'active';
  }
  function rowToPromo(r) {
    return {
      id: r.id, type: r.type, title: r.title || '', description: r.description || '',
      discountType: r.discount_type || 'percentage', value: num(r.discount_value) || num(r.discount_percent),
      products: (r.applicable_products || []).map(Number), categories: r.applicable_categories || [],
      start: r.start_date, end: r.end_date, status: promoStatusOf(r), rawStatus: r.status,
      budget: num(r.budget), spent: num(r.spent), impressions: num(r.impressions), clicks: num(r.clicks), conversions: num(r.conversions),
      createdAt: r.created_at
    };
  }
  function rowToCoupon(r) {
    const end = r.end_date || r.expiry;
    let status;
    if (r.is_active === false) status = 'paused';
    else if (end && !isFarEnd(end) && new Date(end).getTime() < Date.now()) status = 'expired';
    else if (r.start_date && new Date(r.start_date).getTime() > Date.now()) status = 'scheduled';
    else status = 'active';
    const limit = num(r.max_uses) || num(r.usage_limit);
    if (status === 'active' && limit && num(r.used_count) >= limit) status = 'exhausted';
    return {
      id: r.id, code: r.code, description: r.description || '', discountType: r.discount_type || 'percentage',
      value: num(r.discount_value) || num(r.discount), minOrder: num(r.min_order_amount) || num(r.min_order),
      maxDiscount: num(r.max_discount_amount) || num(r.max_discount), limit, used: num(r.used_count),
      products: (r.applicable_products || []).map(Number), start: r.start_date, end, status
    };
  }

  function buildCustomers(orders) {
    const map = new Map();
    orders.forEach(o => {
      const key = String(o.userId || o.userEmail || o.phone || o.customer).toLowerCase();
      if (!key) return;
      let c = map.get(key);
      if (!c) { c = { key, userId: o.userId, name: '', email: '', phone: '', orders: [], count: 0, spent: 0, first: null, last: null }; map.set(key, c); }
      if (!c.name && o.customer) c.name = o.customer;
      if (!c.email && o.userEmail) c.email = o.userEmail;
      if (!c.phone && o.phone) c.phone = o.phone;
      if (!c.userId && o.userId) c.userId = o.userId;
      c.orders.push(o);
      if (o.status !== 'cancelled') {
        c.count += 1; c.spent += o.total;
        const t = new Date(o.createdAt).getTime();
        if (!c.first || t < c.first) c.first = t;
        if (!c.last || t > c.last) c.last = t;
      }
    });
    const DAY = 86400000, now = Date.now();
    const list = [...map.values()];
    list.forEach(c => {
      c.name = c.name || 'Customer';
      if (!c.last) c.segment = 'inactive';
      else if (now - c.last > 60 * DAY) c.segment = 'inactive';
      else if (c.count >= 5 || c.spent >= 5000) c.segment = 'vip';
      else if (now - c.first <= 30 * DAY && c.count < 2) c.segment = 'new';
      else c.segment = 'regular';
    });
    return list;
  }

  const RETURN_STATUS_ALIAS = { requested: 'pending', processing: 'approved', picked_up: 'approved', received: 'approved', canceled: 'rejected', cancelled: 'rejected', closed: 'completed' };
  function rowToReturn(r, order, itemRow) {
    const raw = String(r.status || 'pending').toLowerCase();
    const status = ['pending', 'approved', 'rejected', 'refunded', 'completed'].includes(raw) ? raw : (RETURN_STATUS_ALIAS[raw] || 'pending');
    let amount = num(r.refund_amount);
    const original = itemRow ? (num(itemRow.total_price) || num(itemRow.unit_price) * (num(r.quantity) || 1)) : 0;
    const originalAmount = original || (order ? order.total : 0);
    if (!amount && status !== 'refunded' && status !== 'completed') amount = originalAmount;
    return {
      id: r.id, code: 'RET-' + shortId(r.id), orderCode: r.order_id || '',
      customer: (order && order.customer) || (String(r.customer_id || '').includes('@') ? r.customer_id : 'Customer'),
      phone: order ? order.phone : '', email: String(r.customer_id || '').includes('@') ? r.customer_id : (order ? order.userEmail : ''), userId: RX_UUID_RE.test(String(r.customer_id || '')) ? r.customer_id : (order ? order.userId : ''),
      address: (order && order.address) || '', paymentMode: order ? order.paymentMode : '', paymentState: order ? order.paymentState : '',
      product: r.medicine_name || (itemRow && itemRow.product_name) || 'Item', qty: r.quantity || 1,
      reason: r.reason || '—', description: r.description || '', photos: Array.isArray(r.customer_photos) ? r.customer_photos.filter(Boolean) : [],
      amount, originalAmount, requestDate: r.created_at, status,
      refundStatus: r.refund_status, refundMethod: r.refund_method || '', refundedAt: r.refund_processed_at,
      pickupDate: r.return_pickup_date, pickupSlot: r.pickup_slot || '', pickupAddress: r.pickup_address || (order && order.address) || '',
      receivedDate: r.return_received_date, returnAwb: r.return_awb || '', returnCourier: r.return_courier_name || '', restockingFee: num(r.restocking_fee), notes: r.merchant_notes || '', updatedAt: r.updated_at
    };
  }

  function computeNewPrice(oldPrice, mrp, changeType, changeValue) {
    let p = Number(oldPrice);
    if (changeType === 'inc_pct') p = p * (1 + changeValue / 100);
    else if (changeType === 'dec_pct') p = p * (1 - changeValue / 100);
    else if (changeType === 'inc_amt') p = p + changeValue;
    else if (changeType === 'dec_amt') p = p - changeValue;
    p = Math.round(p * 100) / 100;
    let capped = false;
    if (mrp && p > mrp) { p = mrp; capped = true; }       // selling price can never exceed MRP
    return { price: p, capped };
  }

  const DB = {
    /* ---- merchant / profile / KYC ---- */
    /* Permanent account deletion: the delete_my_merchant_account() SQL function (see delete_merchant_account.sql)
       removes the merchant's data and the login itself. It refuses while any order is still active. */
    deleteAccount: async () => {
      await requireMerchantId();
      const { error } = await sb.rpc('delete_my_merchant_account');
      if (error) {
        const msg = String(error.message || '');
        if (/ACTIVE_ORDERS/i.test(msg)) throw appError('ACTIVE_ORDERS', 'You still have active orders. Finish or cancel them first, then delete your account.');
        if (/ADMIN_ACCOUNT/i.test(msg)) throw appError('ADMIN_ACCOUNT', 'This login is an admin account and cannot be deleted from the merchant panel.');
        if (/foreign key|violates/i.test(msg)) throw appError('LINKED', 'This login is linked to other MediFinder data, so it could not be deleted automatically. Please contact support.');
        if (/does not exist|could not find the function|PGRST202/i.test(msg + ' ' + (error.code || ''))) throw appError('NOT_SETUP', 'Account deletion is not set up yet. Please contact support.');
        throw error;
      }
      return true;
    },
    getMerchant: async () => {
      const r = await loadMerchantRow(true);
      let verifiedOn = null;
      try {
        const { data } = await sb.from('merchant_kyc').select('verified_at,verified').eq('merchant_id', r.id).not('verified_at', 'is', null).order('verified_at', { ascending: false }).limit(1);
        if (data && data[0]) verifiedOn = data[0].verified_at;
      } catch (e) { /* optional */ }
      const { data: s } = await sb.auth.getSession();
      return rowToMerchant(r, verifiedOn, s && s.session ? s.session.user.email : '');
    },
    updateMerchant: async (patch) => {
      const mid = await requireMerchantId();
      const { error } = await sb.from('merchants').update(patch).eq('id', mid);
      if (error) throw error;
      merchantRowCache = null;
      return DB.getMerchant();
    },
    uploadAvatar: async (file) => {
      if (!file.type.startsWith('image/')) throw new Error('Please choose an image file');
      if (file.size > 5 * 1024 * 1024) throw new Error('Image must be under 5 MB');
      const mid = await requireMerchantId();
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
      const path = `merchant-${mid}/${Date.now()}.${ext}`;
      const { error } = await sb.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      return DB.updateMerchant({ avatar_url: url });
    },
    /* Optional signature image printed on order receipts. Public bucket (receipts are public); PNG/JPG/WebP, max 2 MB. */
    uploadSignature: async (file) => {
      if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) throw new Error('Please choose a PNG, JPG or WebP image');
      if (file.size > 2 * 1024 * 1024) throw new Error('Signature image must be under 2 MB');
      const mid = await requireMerchantId();
      const ext = file.type.includes('png') ? 'png' : file.type.includes('webp') ? 'webp' : 'jpg';
      const path = `merchant-${mid}/signature-${Date.now()}.${ext}`;
      const { error } = await sb.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      return DB.updateMerchant({ signature_url: url });
    },
    removeSignature: async () => DB.updateMerchant({ signature_url: null }),
    changePassword: async (password) => {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
    },
    submitKyc: async (d, files) => {
      const mid = await requireMerchantId();
      const cur = await loadMerchantRow(true);
      const docs = {};
      for (const kind of ['license', 'business', 'gst', 'trade', 'fssai', 'pharmacist', 'invoice', 'extra', 'identity', 'bank']) {
        if (files && files[kind]) docs[kind] = await uploadKycDoc(kind, files[kind]);
      }
      const gps = String(d.address.gps || '').split(',').map(x => parseFloat(x));
      const cat = catInfo(d.category), dd = d.docs || {};
      const hasLic = cat.drug && String(d.license.number || '').trim() !== '';
      const licenseImg = hasLic ? (docs.license || d.license.doc || '') : '';
      const bizImg = docs.business || (dd.business && dd.business.doc) || '';
      const gstImg = docs.gst || (dd.gst && dd.gst.doc) || '';
      const tradeImg = docs.trade || (dd.trade && dd.trade.doc) || '';
      const fssaiImg = cat.fssai ? (docs.fssai || (dd.fssai && dd.fssai.doc) || '') : '';
      const patch = {
        shop_name: d.shopName, merchant_name: d.shopName, owner_name: d.ownerName, business_category: d.category, about_shop: d.about || '',
        address: d.address.fullAddress, resolved_address: d.address.fullAddress, city: d.address.city, district: d.address.district,
        state: d.address.state, pincode: d.address.pincode,
        license_id: hasLic ? d.license.number.trim() : '', license_img: licenseImg, license_expiry: hasLic ? (d.license.expiry || null) : null,
        pharmacist_reg_no: cat.pharmacist ? ((dd.pharmacist && dd.pharmacist.number) || null) : null, pharmacist_img: cat.pharmacist ? (docs.pharmacist || (dd.pharmacist && dd.pharmacist.doc) || '') : '',
        brand_info: cat.invoice ? ((dd.invoice && dd.invoice.brand) || null) : null, invoice_img: cat.invoice ? (docs.invoice || (dd.invoice && dd.invoice.doc) || '') : '',
        extra_permit_no: cat.extra ? ((dd.extra && dd.extra.number) || null) : null, extra_permit_img: cat.extra ? (docs.extra || (dd.extra && dd.extra.doc) || '') : '',
        business_proof_type: (dd.business && dd.business.type) || null, business_proof_img: bizImg,
        gstin: (dd.gst && dd.gst.number ? String(dd.gst.number).toUpperCase() : null), gst_img: gstImg,
        trade_license_no: (dd.trade && dd.trade.number) || null, trade_license_img: tradeImg,
        fssai_no: cat.fssai ? ((dd.fssai && dd.fssai.number) || null) : null, fssai_expiry: cat.fssai ? ((dd.fssai && dd.fssai.expiry) || null) : null, fssai_img: fssaiImg,
        id_proof_type: d.identity.idType, id_proof_number: d.identity.idNumber, id_proof_img: docs.identity || d.identity.doc || '',
        bank_no: d.bank.accountNumber, ifsc_code: String(d.bank.ifsc || '').toUpperCase(), upi_id: d.bank.upi || '', bank_image: docs.bank || d.bank.doc || '',
        bank_account_holder: d.ownerName,
        kyc_status: 'pending_review', kyc_submitted_at: new Date().toISOString(), kyc_rejection_reason: ''
      };
      if (gps.length === 2 && gps.every(Number.isFinite)) { patch.latitude = gps[0]; patch.longitude = gps[1]; }
      if (String(cur.license_status || '').toLowerCase() !== 'verified') patch.license_status = 'pending';
      if (String(cur.bank_status || '').toLowerCase() !== 'verified') patch.bank_status = 'pending';
      const { error } = await sb.from('merchants').update(patch).eq('id', mid);
      if (error) throw error;
      // keep the admin review queue (merchant_kyc) in step
      try {
        // admin queue row: the Drug Licence when the category needs one, otherwise the main business document
        const kycNo = hasLic ? d.license.number : (cat.fssai ? (dd.fssai.number || '') : ((dd.gst && dd.gst.number) || (dd.trade && dd.trade.number) || ''));
        const kycImg = hasLic ? licenseImg : (cat.fssai ? fssaiImg : bizImg);
        const { data: ex } = await sb.from('merchant_kyc').select('id').eq('merchant_id', mid).eq('kyc_type', 'license').limit(1);
        const kycRow = { license_no: kycNo, license_img: kycImg, status: 'pending', rejection_reason: '' };
        // also mirror the identity the merchant filled in (Aadhaar / PAN) so the admin KYC screen shows it
        const idT = String((d.identity && d.identity.idType) || ''), idN = String((d.identity && d.identity.idNumber) || '').trim();
        const idImg = docs.identity || (d.identity && d.identity.doc) || '';
        const kycRowFull = Object.assign({}, kycRow);
        if (idT === 'Aadhaar') { kycRowFull.aadhaar_number = idN; kycRowFull.aadhaar_img = idImg; }
        if (idT === 'PAN') { kycRowFull.pan_number = idN; kycRowFull.pan_img = idImg; }
        const writeKyc = async (row) => {
          const r = (ex && ex.length)
            ? await sb.from('merchant_kyc').update(row).eq('id', ex[0].id)
            : await sb.from('merchant_kyc').insert(Object.assign({ merchant_id: mid, kyc_type: 'license', verified: false }, row));
          if (r && r.error) throw r.error;
        };
        try { await writeKyc(kycRowFull); }
        catch (e1) { console.warn('merchant_kyc full sync failed, retrying basic', e1); await writeKyc(kycRow); }
      } catch (e) { console.warn('merchant_kyc sync failed', e); }
      if (files && files.signature) {
        try { await DB.uploadSignature(files.signature); }
        catch (e) { console.warn('signature upload failed (optional)', e); }
      }
      merchantRowCache = null;
      return DB.getMerchant();
    },

    /* ---- orders ---- */
    getOrders: async (force) => {
      if (!force && ordersCache.data && Date.now() - ordersCache.t < 8000) return ordersCache.data;
      const mid = await requireMerchantId();
      const { data, error } = await sb.from('orders').select('*').eq('merchant_id', mid).order('created_at', { ascending: false }).limit(300);
      if (error) throw error;
      const rows = data || [];
      const itemRows = await inChunks('order_items', 'order_id,product_name,name,quantity,unit_price,price', 'order_id', rows.map(o => o.order_id));
      const itemsMap = {};
      itemRows.forEach(i => { (itemsMap[i.order_id] = itemsMap[i.order_id] || []).push(i); });
      const riderRows = await inChunks('riders', 'id,full_name,name,phone,vehicle_type,vehicle_number', 'id', rows.map(o => o.rider_id));
      const riders = {};
      riderRows.forEach(r => { riders[r.id] = r; });
      const list = rows.map(o => rowToOrder(o, itemsMap[o.order_id], riders[o.rider_id]));
      ordersCache = { t: Date.now(), data: list };
      return list;
    },
    getOrder: async (id) => (await DB.getOrders()).find(o => o.id === id),
    updateOrder: async (id, patch) => {
      const mid = await requireMerchantId();
      const { data, error } = await sb.from('orders').update(patch).eq('id', id).eq('merchant_id', mid).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw appError('DENIED', 'This order could not be updated.');
      invalidateOrders();
    },
    acceptOrder: async (order) => {
      await DB.updateOrder(order.id, { status: 'accepted' });
      await notifyMerchant('Order Accepted', `Order ${order.code} accepted. Customer: ${order.customer}.`, 'order', order.id);
      await notifyCustomer(order, { title: 'Order accepted', message: `Your order ${order.code} has been accepted and is being prepared.`, orderCode: order.code });
    },
    cancelOrder: async (order, reason, note) => {
      await DB.updateOrder(order.id, { status: 'cancelled', cancellation_reason: reason, cancellation_note: note || '' });
      await notifyMerchant('Order Rejected', `Order ${order.code} was cancelled. Reason: ${reason}.`, 'order', order.id);
      await notifyCustomer(order, { title: 'Order cancelled', message: `Your order ${order.code} was cancelled by the pharmacy. Reason: ${reason}.`, orderCode: order.code });
    },
    // partner: 'medifinder' -> MediFinder India riders pick it up | 'courier' -> a third-party courier company delivers it
    dispatchOrder: async (order, partner, courierName, tracking) => {
      const patch = { status: 'shipped', delivery_partner: partner };
      if (partner === 'courier') { patch.courier_name = courierName || 'Courier'; patch.courier_tracking = tracking || ''; }
      await DB.updateOrder(order.id, patch);
      const who = partner === 'courier' ? `${courierName || 'a courier partner'}${tracking ? ' (tracking ' + tracking + ')' : ''}` : 'MediFinder India delivery';
      await notifyMerchant('Order Shipped', `Order ${order.code} dispatched via ${who}.`, 'order', order.id);
      await notifyCustomer(order, { title: 'Order on the way', message: `Your order ${order.code} has been handed over to ${who}.`, orderCode: order.code });
    },
    autoDispatch: async (order) => {
      if (order.deliverySpeed && order.deliverySpeed !== 'manual') {
        await DB.dispatchOrder(order, 'medifinder');
        return { ok: true, mode: 'medifinder' };
      }
      if (!COURIER_AUTO) return { ok: false, manual: true };
      try {
        const { data, error } = await sb.functions.invoke('courier', { body: { action: 'dispatch', order_id: order.code } });
        let body = data;
        if (!body && error && error.context && typeof error.context.json === 'function') { try { body = await error.context.json(); } catch (_e) { /* generic */ } }
        if (error || !body || body.success === false || !body.awb_code) {
          const reason = (body && body.error) || (error && error.message) || 'Courier could not be booked';
          throw new Error(typeof reason === 'string' ? reason : JSON.stringify(reason));
        }
        invalidateOrders();
        const who = `${body.courier_name} (AWB ${body.awb_code})`;
        await notifyMerchant('Order Shipped', `Order ${order.code} dispatched via ${who}.`, 'order', order.id);
        await notifyCustomer(order, { title: 'Order on the way', message: `Your order ${order.code} has been handed over to ${who}.`, orderCode: order.code });
        return { ok: true, mode: 'courier', awb: body.awb_code, courier: body.courier_name, cost: body.cost };
      } catch (e) {
        console.warn('Courier auto-dispatch failed, falling back to manual courier picker', e);
        return { ok: false, error: e };
      }
    },
    markDelivered: async (order) => {
      if (order.partner === 'courier' && order.courierProvider) throw appError('AUTO', 'Courier orders are marked delivered automatically by the courier.');
      await DB.updateOrder(order.id, { status: 'delivered', delivered_at: new Date().toISOString() });
      await notifyMerchant('Order Delivered', `Order ${order.code} marked as delivered.`, 'order', order.id);
      await notifyCustomer(order, { title: 'Order delivered', message: `Your order ${order.code} has been delivered.`, orderCode: order.code });
    },
    // approve -> auto-book reverse pickup with the cheaper courier (edge function skips non-courier orders)
    bookReturnPickup: async (returnId) => {
      const { data, error } = await sb.functions.invoke('courier', { body: { action: 'return', return_id: returnId } });
      let body = data;
      if (!body && error && error.context && typeof error.context.json === 'function') { try { body = await error.context.json(); } catch (_e) { /* generic */ } }
      if (error || !body || body.success === false) throw new Error((body && body.error) || (error && error.message) || 'Return pickup could not be booked');
      return body;
    },
    updateCourier: async (order, courierName, tracking) => DB.updateOrder(order.id, { courier_name: courierName, courier_tracking: tracking }),

    // Courier shipping label (the sticker that goes on the parcel). Fetched by the `courier` edge function
    // (action 'label'), which asks Shiprocket / NimbusPost for the real label PDF and hands it back as base64.
    downloadCourierLabel: async (order) => {
      const { data, error } = await sb.functions.invoke('courier', { body: { action: 'label', order_id: order.code } });
      let body = data;
      if (!body && error && error.context && typeof error.context.json === 'function') { try { body = await error.context.json(); } catch (_e) { /* generic */ } }
      if (error || !body || body.success === false || !body.base64) throw new Error((body && body.error) || (error && error.message) || 'Courier label is not available yet');
      const bin = atob(body.base64); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      saveBlobAs(new Blob([bytes], { type: body.content_type || 'application/pdf' }), body.filename || `label-${order.code}.pdf`);
    },

    /* ---- prescriptions (broadcast requests; first pharmacy to accept wins) ---- */
    getPrescriptions: async () => {
      const mid = await requireMerchantId();
      const { data, error } = await sb.from('prescription_orders').select('*').or(`status.eq.pending,accepted_by.eq.${mid}`).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      const dismissed = getDismissedRx(mid);
      const rows = (data || []).filter(r => !(r.status === 'pending' && dismissed.has(r.id)));
      const mine = rows.filter(r => r.accepted_by === mid && r.prescription_url);
      const linked = await inChunks('orders', 'id,order_id,prescription_url,status', 'prescription_url', mine.map(r => r.prescription_url), (q) => q.eq('merchant_id', mid));
      const out = rows.map(r => {
        const link = r.accepted_by === mid ? linked.find(o => o.prescription_url === r.prescription_url) : null;
        let status = r.status;
        if (r.status === 'accepted') status = link ? 'ordered' : 'accepted';
        return {
          id: r.id, customer: r.user_name || 'Customer', phone: r.user_phone || '', address: r.user_address || '', email: r.user_email || '', userId: r.user_id || '',
          image: r.prescription_url || '', requested: Array.isArray(r.medicines) ? r.medicines : [], status, otp: r.delivery_otp || '',
          acceptedBy: r.accepted_by, createdAt: r.created_at, orderId: link ? link.id : null, orderCode: link ? link.order_id : null
        };
      });
      // fill any missing phone / address / name from the customer's own profile + saved addresses
      await Promise.all(out.filter(x => x.acceptedBy === mid && (!x.phone || !x.address)).map(async (x) => {
        const c = await DB.getRxContact(x.id);
        if (!c) return;
        x.phone = x.phone || c.phone || '';
        x.address = x.address || c.address || '';
        if ((!x.customer || x.customer === 'Customer') && c.name) x.customer = c.name;
      }));
      return out;
    },
    // customer's phone / address / name straight from the user tables (profiles + user_addresses)
    getRxContact: async (id) => {
      try {
        const { data, error } = await sb.rpc('get_rx_contact', { p_id: id });
        if (error) throw error;
        return data || null;
      } catch (e) { console.warn('rx contact lookup failed', e); return null; }
    },
    acceptPrescription: async (id) => {
      const mid = await requireMerchantId();
      const { data, error } = await sb.rpc('accept_prescription_order', { p_id: id, p_merchant_id: mid });
      if (error) throw error;
      if (!data || !data.id) throw appError('TAKEN', 'Another pharmacy accepted this prescription first.');
      return data;
    },
    // search this merchant's own live inventory so the price is picked up automatically
    searchMedicines: async (q) => {
      const mid = await requireMerchantId();
      let query = sb.from('medicines')
        .select('id,product_name,generic_name,brand_name,selling_price,unit_price,mrp,stock_qty,image_url,is_rx,strength,dosage_form,pack_size,status')
        .eq('merchant_id', mid).in('status', ['Approved', 'Active', 'approved', 'active']).gt('stock_qty', 0).order('product_name').limit(15);
      const c = cleanQuery(q);
      if (c) query = query.or(`product_name.ilike.%${c}%,generic_name.ilike.%${c}%,brand_name.ilike.%${c}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(m => ({
        id: m.id, name: m.product_name, generic: m.generic_name || '', brand: m.brand_name || '', price: num(m.selling_price) || num(m.unit_price), mrp: num(m.mrp),
        stock: num(m.stock_qty), img: m.image_url || '', rx: !!m.is_rx, meta: [m.strength, m.dosage_form, m.pack_size].filter(Boolean).join(' · ')
      }));
    },
    getMedicinesByIds: async (ids) => {
      const mid = await requireMerchantId();
      const rows = await inChunks('medicines', 'id,product_name,selling_price,unit_price,mrp,stock_qty,image_url,is_rx,status', 'id', ids.filter(x => /^\d+$/.test(String(x))), (q) => q.eq('merchant_id', mid));
      return rows.map(m => ({ id: m.id, name: m.product_name, price: num(m.selling_price) || num(m.unit_price), mrp: num(m.mrp), stock: num(m.stock_qty), img: m.image_url || '', rx: !!m.is_rx, live: ['approved', 'active'].includes(String(m.status).toLowerCase()) }));
    },
    createRxOrder: async (rx, lines, paymentMode) => {
      const mid = await requireMerchantId();
      const m = await loadMerchantRow();
      if (rx && rx.id && (!rx.phone || !rx.address)) {
        const c = await DB.getRxContact(rx.id);
        if (c) rx = Object.assign({}, rx, { phone: rx.phone || c.phone || '', address: rx.address || c.address || '', customer: (rx.customer && rx.customer !== 'Customer') ? rx.customer : (c.name || rx.customer) });
      }
      const code = 'ORD-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
      const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
      const cod = paymentMode !== 'ONLINE';
      const row = {
        order_id: code, user_id: rx.userId || null, user_email: rx.email || '', merchant_id: mid,
        customer_name: rx.customer, customer_phone: rx.phone || '', customer_address: rx.address || '', delivery_address: rx.address || '', address: rx.address || '',
        items: lines.map(l => ({ id: l.id, name: l.name, qty: l.qty, price: l.price, mrp: l.mrp })),
        items_text: lines.map(l => `${l.name} × ${l.qty}`).join(', '),
        total_amount: subtotal, total: subtotal, total_bill: '₹' + subtotal.toFixed(2),
        payment_mode: cod ? 'COD' : 'ONLINE', payment_method: cod ? 'cod' : 'online', payment_status: cod ? 'Pending' : 'Payment pending',
        status: 'accepted', rx_verified: true, prescription_required: true, prescription_verified: true, prescription_url: rx.image || '',
        delivery_secure_code: rx.otp || '', customer_otp: rx.otp || '',
        pharmacy_name: m.shop_name || m.merchant_name || '', shop_lat: m.latitude, shop_lng: m.longitude, pharmacy_lat: m.latitude, pharmacy_lon: m.longitude,
        date_string: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
      };
      const { data: order, error } = await sb.from('orders').insert(row).select('id').single();
      if (error) throw error;
      const itemRows = lines.map(l => ({
        order_id: code, medicine_id: l.id, merchant_id: mid, product_name: l.name, name: l.name, product_image: l.img || '', image_url: l.img || '',
        quantity: l.qty, unit_price: l.price, price: l.price, mrp: l.mrp || l.price, total_price: l.price * l.qty, total: l.price * l.qty
      }));
      const { error: e2 } = await sb.from('order_items').insert(itemRows);
      if (e2) console.warn('order_items insert failed', e2);
      for (const l of lines) {           // reserve stock for the medicines the pharmacy added
        const { error: e3 } = await sb.rpc('decrement_stock', { med_id: l.id, qty: l.qty });
        if (e3) console.warn('stock update failed for', l.name, e3);
      }
      productsCache = null; invalidateOrders();
      await notifyMerchant('Prescription Order Created', `Order ${code} created for ${rx.customer} — ₹${subtotal.toFixed(2)}.`, 'order', order.id);
      await notifyCustomer(rx, { title: 'Prescription accepted', message: `${m.shop_name || 'A pharmacy'} accepted your prescription. Order ${code} total ₹${subtotal.toFixed(2)}.`, orderCode: code, type: 'prescription' });
      return { id: order.id, code, subtotal };
    },

    /* ---- products (inventory) ---- */
    getProducts: async () => {
      if (productsCache) return productsCache;
      const mid = await requireMerchantId();
      const { data, error } = await sb.from('medicines').select('*').eq('merchant_id', mid).order('created_at', { ascending: false });
      if (error) { console.error(error); throw error; }
      const priv = await loadPrivate(mid);
      productsCache = data.map(r => rowToProduct(r, priv[r.id]));
      return productsCache;
    },
    getProduct: async (id) => {
      const mid = await requireMerchantId();
      const { data, error } = await sb.from('medicines').select('*').eq('id', id).eq('merchant_id', mid).maybeSingle();
      if (error) { console.error(error); throw error; }
      if (!data) return null;
      const priv = await loadPrivate(mid);
      return rowToProduct(data, priv[data.id]);
    },
    // Categories currently used by this merchant's non-draft products
    getCategories: async () => {
      const products = await DB.getProducts();
      return [...new Set(products.filter(p => p.status !== 'draft').map(p => p.category).filter(Boolean))].sort();
    },
    saveProduct: async (product) => {
      const mid = await requireMerchantId();
      const images = await uploadProductImages(mid, product.images);
      const docUrls = await uploadProductImages(mid, (product.docs || []).map(d => (d && d.url) || ''), 'd');
      const docs = (product.docs || []).map((d, i) => ({ name: (d && d.name) || '', url: docUrls[i] || '' }));
      const row = productToRow({ ...product, images, docs }, mid);
      const q = product.id
        ? sb.from('medicines').update(row).eq('id', product.id).eq('merchant_id', mid).select().single()
        : sb.from('medicines').insert(row).select().single();
      const { data, error } = await q;
      if (error) { console.error(error); throw error; }
      productsCache = null;
      const costs = (product.batches || []).map(b => (b.cost === '' || b.cost == null ? null : Number(b.cost)));
      let privateFailed = false;
      if (costs.some(c => c != null) || product.id) {
        try {
          const { error: pe } = await sb.from('product_private').upsert({ medicine_id: data.id, merchant_id: mid, data: { costs }, updated_at: new Date().toISOString() });
          if (pe) throw pe;
        } catch (e) { console.warn('product_private save failed', e); privateFailed = true; }
      }
      const saved = rowToProduct(data, { costs });
      saved.privateFailed = privateFailed;
      return saved;
    },
    // Pause (status Inactive -> hidden from customers, can't be ordered) / Resume (only for admin-approved products)
    setProductActive: async (id, active) => {
      const mid = await requireMerchantId();
      const { data, error } = await sb.from('medicines').update({ status: active ? 'Approved' : 'Inactive' }).eq('id', id).eq('merchant_id', mid).eq('admin_approved', true).select('id');
      if (error) { console.error(error); throw error; }
      if (!data || !data.length) throw appError('DENIED', 'This product could not be updated.');
      productsCache = null;
    },
    deleteProduct: async (id) => {
      const mid = await requireMerchantId();
      const { data, error } = await sb.from('medicines').delete().eq('id', id).eq('merchant_id', mid).select('id');
      if (error) { console.error(error); throw error; }
      if (!data || !data.length) throw appError('DENIED', 'This product could not be deleted.');
      productsCache = null;
    },

    /* ---- admin offers (campaigns): merchant joins with products → shown on the customer Deals page ---- */
    getOpenCampaigns: async () => {
      const { data, error } = await sb.rpc('merchant_open_campaigns');
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
    getMyCampaignProducts: async () => {
      const mid = await requireMerchantId();
      const { data, error } = await sb.from('campaign_products').select('campaign_id,medicine_id,status').eq('merchant_id', mid);
      if (error) throw error;
      return data || [];
    },
    saveCampaignProducts: async (campaignId, add, remove) => {
      const mid = await requireMerchantId();
      if (add.length) {
        const rows = add.map(id => ({ campaign_id: campaignId, medicine_id: Number(id), merchant_id: mid, status: 'approved' }));
        const { error } = await sb.from('campaign_products').upsert(rows, { onConflict: 'campaign_id,medicine_id', ignoreDuplicates: true });
        if (error) throw error;
      }
      if (remove.length) {
        const { error } = await sb.from('campaign_products').delete().eq('campaign_id', campaignId).eq('merchant_id', mid).in('medicine_id', remove.map(Number));
        if (error) throw error;
      }
    },

    /* ---- promotions: discounts / flash sales / featured ---- */
    getPromotions: async (types) => {
      const mid = await requireMerchantId();
      let q = sb.from('promotions').select('*').eq('merchant_id', mid).order('created_at', { ascending: false });
      if (types) q = q.in('type', types);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(rowToPromo);
    },
    savePromotion: async (f, id) => {
      const mid = await requireMerchantId();
      const row = {
        merchant_id: mid, type: f.type, title: f.title, description: f.description || '',
        discount_type: f.discountType, discount_value: f.value, discount_percent: f.discountType === 'percentage' ? f.value : 0,
        applicable_products: f.products, start_date: f.start, end_date: f.end || PROMO_FAR_END,
        budget: f.budget || 0, is_active: true, status: f.status || 'active'
      };
      const q = id ? sb.from('promotions').update(row).eq('id', id).eq('merchant_id', mid).select().single() : sb.from('promotions').insert(row).select().single();
      const { data, error } = await q;
      if (error) throw error;
      return rowToPromo(data);
    },
    setPromotionActive: async (id, active) => {
      const mid = await requireMerchantId();
      const { error } = await sb.from('promotions').update({ status: active ? 'active' : 'paused', is_active: active }).eq('id', id).eq('merchant_id', mid);
      if (error) throw error;
    },
    deletePromotion: async (id) => {
      const mid = await requireMerchantId();
      const { data, error } = await sb.from('promotions').delete().eq('id', id).eq('merchant_id', mid).select('id');
      if (error) throw error;
      if (!data || !data.length) throw appError('DENIED', 'This promotion could not be deleted.');
    },
    activateFeatured: async (id, paymentId) => {
      const mid = await requireMerchantId();
      const { data: cur } = await sb.from('promotions').select('description').eq('id', id).maybeSingle();
      const desc = ((cur && cur.description) || '') + (paymentId ? ` | Paid via ${paymentId} (merchant confirmed)` : '');
      const { error } = await sb.from('promotions').update({ status: 'active', is_active: true, description: desc }).eq('id', id).eq('merchant_id', mid);
      if (error) throw error;
    },

    /* ---- coupons ---- */
    getCoupons: async () => {
      const mid = await requireMerchantId();
      const { data, error } = await sb.from('coupons').select('*').eq('merchant_id', mid).order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(rowToCoupon);
    },
    saveCoupon: async (f, id) => {
      const mid = await requireMerchantId();
      const code = f.code.toUpperCase();
      const { data: dup, error: dErr } = await sb.from('coupons').select('id').ilike('code', code).limit(5);
      if (dErr) throw dErr;
      if ((dup || []).some(d => d.id !== id)) throw appError('DUPLICATE', 'This coupon code is already in use. Choose another.');
      const end = f.end || PROMO_FAR_END;
      const row = {
        merchant_id: mid, code, description: f.description || '', discount_type: f.discountType,
        discount_value: f.value, discount: f.value, min_order_amount: f.minOrder || 0, min_order: f.minOrder || 0,
        max_discount_amount: f.maxDiscount || null, max_discount: f.maxDiscount || 0, max_uses: f.limit || 0, usage_limit: f.limit || 0,
        applicable_products: f.products.length ? f.products : null, start_date: f.start, end_date: end, expiry: end, is_active: true
      };
      const q = id ? sb.from('coupons').update(row).eq('id', id).eq('merchant_id', mid).select().single() : sb.from('coupons').insert(row).select().single();
      const { data, error } = await q;
      if (error) throw error;
      return rowToCoupon(data);
    },
    setCouponActive: async (id, active) => {
      const mid = await requireMerchantId();
      const { error } = await sb.from('coupons').update({ is_active: active }).eq('id', id).eq('merchant_id', mid);
      if (error) throw error;
    },
    deleteCoupon: async (id) => {
      const mid = await requireMerchantId();
      const { data, error } = await sb.from('coupons').delete().eq('id', id).eq('merchant_id', mid).select('id');
      if (error) throw error;
      if (!data || !data.length) throw appError('DENIED', 'This coupon could not be deleted.');
    },

    /* ---- bulk price management ---- */
    applyPriceChange: async (plan, meta) => {
      const mid = await requireMerchantId();
      let done = 0, skipped = 0, capped = 0;
      for (let i = 0; i < plan.length; i += 15) {
        await Promise.all(plan.slice(i, i + 15).map(async (it) => {
          if (!(it.newPrice > 0)) { skipped++; return; }
          const { error } = await sb.from('medicines').update({ selling_price: it.newPrice, unit_price: it.newPrice }).eq('id', it.id).eq('merchant_id', mid);
          if (error) { console.error(error); skipped++; return; }
          done++; if (it.capped) capped++;
        }));
      }
      const hist = plan.filter(it => it.newPrice > 0).map(it => ({
        product_id: it.id, merchant_id: mid, old_price: it.oldPrice, new_price: it.newPrice, change_type: meta.changeType, change_value: meta.changeValue,
        effective_date: meta.effective, status: 'applied', scope: meta.scope
      }));
      if (hist.length) { const { error } = await sb.from('price_history').insert(hist); if (error) console.warn('price_history insert failed', error); }
      productsCache = null;
      return { done, skipped, capped };
    },
    schedulePriceChange: async (productIds, meta) => {
      const mid = await requireMerchantId();
      const rows = productIds.map(id => ({ product_id: id, merchant_id: mid, old_price: null, new_price: 0, change_type: meta.changeType, change_value: meta.changeValue, effective_date: meta.effective, status: 'scheduled', scope: meta.scope }));
      const { error } = await sb.from('price_history').insert(rows);
      if (error) throw error;
      return rows.length;
    },
    getPriceHistory: async () => {
      const mid = await requireMerchantId();
      const { data, error } = await sb.from('price_history').select('*').eq('merchant_id', mid).order('created_at', { ascending: false }).limit(60);
      if (error) throw error;
      return data || [];
    },
    // Scheduled changes whose date has arrived are applied the next time the merchant opens the dashboard
    applyDueScheduledPrices: async () => {
      const mid = await requireMerchantId();
      const { data: due, error } = await sb.from('price_history').select('*').eq('merchant_id', mid).eq('status', 'scheduled').lte('effective_date', localDate());
      if (error || !due || !due.length) return 0;
      const products = await DB.getProducts();
      let applied = 0;
      for (const row of due) {
        const { data: claimed } = await sb.from('price_history').update({ status: 'applied' }).eq('id', row.id).eq('status', 'scheduled').select('id');
        if (!claimed || !claimed.length) continue;             // another tab claimed it
        const p = products.find(x => String(x.id) === String(row.product_id));
        if (!p) continue;
        const { price } = computeNewPrice(p.price, p.mrp, row.change_type, num(row.change_value));
        if (!(price > 0)) continue;
        await sb.from('medicines').update({ selling_price: price, unit_price: price }).eq('id', p.id).eq('merchant_id', mid);
        await sb.from('price_history').update({ old_price: p.price, new_price: price }).eq('id', row.id);
        applied++;
      }
      if (applied) productsCache = null;
      return applied;
    },

    /* ---- customers ---- */
    // likes = how many customers wishlisted each of this merchant's products (RPC is scoped to the signed-in merchant)
    getLikeCounts: async () => {
      const { data, error } = await sb.rpc('merchant_like_counts');
      if (error) { console.warn('like counts failed', error); return { byId: {}, total: 0 }; }
      const byId = {}; let total = 0;
      (data || []).forEach(r => { byId[r.medicine_id] = Number(r.likes) || 0; total += Number(r.likes) || 0; });
      return { byId, total };
    },
    getCustomers: async () => buildCustomers(await DB.getOrders()),
    sendBulkMessage: async (customers, subject, message) => {
      const mid = await requireMerchantId();
      const logRows = customers.map(c => ({ merchant_id: mid, customer_id: c.userId || c.email || c.phone || null, message, subject, type: 'promotional', channel: 'in_app', sent_by: 'merchant' }));
      const { error } = await sb.from('customer_communications').insert(logRows);
      if (error) throw error;
      const inApp = customers.filter(c => c.userId && RX_UUID_RE.test(c.userId)).map(c => ({ user_id: c.userId, type: 'promo', title: subject, message }));
      let delivered = 0;
      if (inApp.length) {
        const { error: e2 } = await sb.from('notifications').insert(inApp);
        if (e2) console.warn('in-app notifications failed', e2); else delivered = inApp.length;
      }
      return { logged: logRows.length, delivered };
    },

    /* ---- returns ---- */
    getReturns: async () => {
      const mid = await requireMerchantId();
      const { data, error } = await sb.from('returns').select('*').eq('merchant_id', mid).order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      const rows = data || [];
      const orders = await DB.getOrders().catch(() => []);
      const byCode = {}; orders.forEach(o => { byCode[o.code] = o; });
      const missing = rows.map(r => r.order_id).filter(c => c && !byCode[c]);
      if (missing.length) {
        const extra = await inChunks('orders', '*', 'order_id', missing, (q) => q.eq('merchant_id', mid)).catch(() => []);
        extra.forEach(o => { const oo = rowToOrder(o, null, null); byCode[oo.code] = oo; });
      }
      const needAmount = rows.filter(r => !num(r.refund_amount)).map(r => r.order_id);
      const items = needAmount.length ? await inChunks('order_items', 'order_id,product_name,quantity,unit_price,total_price', 'order_id', needAmount).catch(() => []) : [];
      return rows.map(r => {
        const it = items.find(i => i.order_id === r.order_id && String(i.product_name || '').toLowerCase() === String(r.medicine_name || '').toLowerCase()) || items.find(i => i.order_id === r.order_id);
        return rowToReturn(r, byCode[r.order_id], it);
      });
    },
    updateReturn: async (id, patch) => {
      const mid = await requireMerchantId();
      const { data, error } = await sb.from('returns').update(patch).eq('id', id).eq('merchant_id', mid).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw appError('DENIED', 'This return could not be updated.');
    },

    /* ---- delivery ---- */
    getDelivery: async () => (await DB.getOrders()).filter(o => ['shipped', 'picked_up'].includes(o.status)),

    /* ---- notifications ---- */
    getNotifications: async () => {
      const mid = await requireMerchantId();
      const { data, error } = await sb.from('merchant_notifications').select('*').eq('merchant_id', mid).order('created_at', { ascending: false }).limit(60);
      if (error) throw error;
      return (data || []).map(n => ({ id: n.id, type: n.category || n.type || 'system', title: n.title, message: n.message || '', time: n.created_at, read: !!n.is_read }));
    },
    markNotifRead: async (id) => {
      const mid = await requireMerchantId();
      await sb.from('merchant_notifications').update({ is_read: true }).eq('id', id).eq('merchant_id', mid);
    },
    markAllNotifRead: async () => {
      const mid = await requireMerchantId();
      await sb.from('merchant_notifications').update({ is_read: true }).eq('merchant_id', mid).eq('is_read', false);
    },

    /* ---- payments / analytics ---- */
    getPayments: async () => {
      const mid = await requireMerchantId();
      const orders = await DB.getOrders();
      const [{ data: payouts, error: pErr }, returns] = await Promise.all([
        sb.from('merchant_payouts').select('*').eq('shop_id', String(mid)).order('created_at', { ascending: false }).limit(60),
        DB.getReturns().catch(() => [])
      ]);
      if (pErr) throw pErr;
      const delivered = orders.filter(o => o.status === 'delivered');
      const isPaid = (s) => /paid|settled|complete/i.test(String(s || ''));
      const onlinePayouts = (payouts || []).filter(p => !/cod|cash/i.test(String(p.payment_mode || '')));   // COD cash never goes through admin
      const payoutByOrder = {}; onlinePayouts.forEach(p => { payoutByOrder[String(p.order_id)] = p; });
      const txns = delivered.map(o => ({ id: 'TXN-' + shortId(o.id), orderId: o.code, date: o.deliveredAt || o.createdAt, amount: o.total, type: o.paymentMode === 'Online' ? 'Online order' : 'COD order',
          status: o.paymentMode !== 'Online' ? 'COD · cash collected' : (payoutByOrder[String(o.id)] && isPaid(payoutByOrder[String(o.id)].status) ? 'Online · Paid by admin' : 'Online · Pending with admin') }))
        .concat(returns.filter(r => r.status === 'refunded' || r.status === 'completed').map(r => ({ id: 'RFD-' + shortId(r.id), orderId: r.orderCode, date: r.refundedAt || r.updatedAt, amount: -r.amount, type: 'Refund', status: 'Processed' })))
        .sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 40);
      return {
        totalSales: delivered.reduce((s, o) => s + o.total, 0),
        completedOrders: delivered.length,
        pendingAmount: onlinePayouts.filter(p => !isPaid(p.status)).reduce((s, p) => s + num(p.amount), 0),
        paidAmount: onlinePayouts.filter(p => isPaid(p.status)).reduce((s, p) => s + num(p.amount), 0),
        platformFees: delivered.reduce((s, o) => s + o.platformFee, 0),
        payoutHistory: onlinePayouts.map(p => ({ id: 'PO-' + shortId(p.id), date: p.paid_at || p.settled_at || p.created_at, amount: num(p.amount), status: isPaid(p.status) ? 'Paid' : (p.status || 'Pending'), paid: isPaid(p.status) })),
        transactions: txns
      };
    },
    getPendingPayout: async () => {
      const mid = await requireMerchantId();
      const { data } = await sb.from('merchant_payouts').select('amount,status,payment_mode').eq('shop_id', String(mid));
      return (data || []).filter(p => !/cod|cash/i.test(String(p.payment_mode || '')) && !/paid|settled|complete/i.test(String(p.status || ''))).reduce((s, p) => s + num(p.amount), 0);
    },
    getAnalytics: async () => {
      const mid = await requireMerchantId();
      const [orders, products] = await Promise.all([DB.getOrders(), DB.getProducts()]);
      const { data: items } = await sb.from('order_items').select('product_name,medicine_id,quantity,order_id').eq('merchant_id', mid).limit(3000);
      const live = new Set(orders.filter(o => o.status !== 'cancelled').map(o => o.code));
      const sold = {};
      (items || []).filter(i => live.has(i.order_id)).forEach(i => { const k = i.product_name || 'Item'; sold[k] = (sold[k] || 0) + (num(i.quantity) || 1); });
      const ranked = Object.entries(sold).map(([name, n]) => ({ name, sold: n })).sort((a, b) => b.sold - a.sold);
      const days = [], labels = [];
      for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(localDate(d)); labels.push(d.toLocaleDateString('en-IN', { weekday: 'short' })); }
      const salesByDay = days.map(day => orders.filter(o => o.status !== 'cancelled' && localDate(new Date(o.createdAt)) === day).reduce((s, o) => s + o.total, 0));
      const week = orders.filter(o => days.includes(localDate(new Date(o.createdAt))));
      const paying = week.filter(o => o.status !== 'cancelled');
      const liveProducts = products.filter(p => p.status === 'approved');
      return {
        salesByDay, dayLabels: labels,
        avgOrderValue: paying.length ? Math.round(paying.reduce((s, o) => s + o.total, 0) / paying.length) : 0,
        topProducts: ranked.slice(0, 5),
        lowPerforming: liveProducts.map(p => ({ name: p.name, sold: sold[p.name] || 0 })).sort((a, b) => a.sold - b.sold).slice(0, 5),
        orderStatus: {
          completed: week.filter(o => o.status === 'delivered').length, cancelled: week.filter(o => o.status === 'cancelled').length,
          pending: week.filter(o => ['pending', 'accepted'].includes(o.status)).length, preparing: week.filter(o => ['shipped', 'picked_up'].includes(o.status)).length
        }
      };
    },
    getPromoAnalytics: async () => {
      const [orders, coupons, promos] = await Promise.all([DB.getOrders(), DB.getCoupons(), DB.getPromotions()]);
      const paying = orders.filter(o => o.status !== 'cancelled');
      const promoOrders = paying.filter(o => o.coupon || o.discount > 0);
      const discountsGiven = paying.reduce((s, o) => s + o.discount, 0);
      const featuredSpend = promos.filter(p => p.type === 'featured' && p.rawStatus !== 'pending_payment').reduce((s, p) => s + p.budget, 0);
      const promoRevenue = promoOrders.reduce((s, o) => s + o.total, 0);
      const redemptions = coupons.reduce((s, c) => s + c.used, 0) || paying.filter(o => o.coupon).length;
      const cost = discountsGiven + featuredSpend;
      return { discountsGiven, promoRevenue, redemptions, featuredSpend, cost, roi: cost > 0 ? Math.round(((promoRevenue - cost) / cost) * 100) : null, promoOrders: promoOrders.length };
    },

    /* ---- support ---- */
    getTickets: async () => {
      const mid = await requireMerchantId();
      const { data, error } = await sb.from('merchant_complaints').select('*').eq('merchant_id', mid).order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      return (data || []).map(t => ({ id: 'TK-' + t.id, subject: t.subject, category: t.category, status: /resolv|clos/i.test(t.status) ? 'Resolved' : 'Open', createdAt: t.created_at, message: t.message }));
    },
    createTicket: async (category, subject, message) => {
      const mid = await requireMerchantId();
      const { error } = await sb.from('merchant_complaints').insert({ merchant_id: mid, category, subject, message });
      if (error) throw error;
    },

    /* ---- settings ---- */
    getSettings: async () => {
      const m = await loadMerchantRow();
      return Object.assign(loadSettings(), { codEnabled: m.cod_available !== false });
    },
    saveSettings: async (patch) => {
      if ('codEnabled' in patch) {
        const mid = await requireMerchantId();
        const { error } = await sb.from('merchants').update({ cod_available: !!patch.codEnabled }).eq('id', mid);
        if (error) throw error;
        merchantRowCache = null;
      }
      const local = Object.assign({}, patch); delete local.codEnabled;
      persistSettings(local);
      return DB.getSettings();
    }
  };

  /* Prescription "Reject" only hides the request for THIS pharmacy — it stays open for the others */
  function dismissedKey(mid) { return 'mf_rx_dismissed_' + mid; }
  function getDismissedRx(mid) { try { return new Set(JSON.parse(localStorage.getItem(dismissedKey(mid)) || '[]')); } catch (e) { return new Set(); } }
  function dismissRx(mid, id) { const s = getDismissedRx(mid); s.add(id); try { localStorage.setItem(dismissedKey(mid), JSON.stringify([...s].slice(-300))); } catch (e) { /* ignore */ } }

  /* KYC field requirements — used for the completion percentage (20% per section) */
  const KYC_REQUIRED = {
    store: ['shopName', 'ownerName', 'category', 'about'],
    address: ['fullAddress', 'city', 'district', 'state', 'pincode', 'gps'],
    identity: ['idType', 'idNumber', 'doc'],
    bank: ['accountNumber', 'ifsc', 'doc']
  };
  function sectionComplete(section, obj) {
    const req = KYC_REQUIRED[section];
    if (!obj) return false;
    return req.every(f => obj[f] !== undefined && obj[f] !== null && String(obj[f]).trim() !== '');
  }
  /* Business categories → which documents KYC asks for.
     (Supabase table merchant_business_categories enforces the same rules server-side.) */
  const BUSINESS_CATEGORIES = [
    { label: 'General Store / Daily Essentials', drug: false, drugReq: false, fssai: false, pharmacist: false, invoice: false, extra: '', types: ['general'],
      hint: 'Daily essentials, tissue, detergent and general household products. Needs owner ID, shop address proof, bank details and trade licence (if applicable).' },
    { label: 'Personal Care & Hygiene', drug: false, drugReq: false, fssai: false, pharmacist: false, invoice: false, extra: 'Additional permission for your product type (if applicable)', types: ['personal_care'],
      hint: 'Toothpaste, toothbrush, soap, shampoo, hair oil, moisturizer and sanitary products. Needs KYC and shop proof. Some product types may need extra permission.' },
    { label: 'Retail Pharmacy / Medical Store', drug: true, drugReq: true, fssai: false, pharmacist: true, invoice: false, extra: '', types: ['medicine', 'instrument', 'personal_care', 'baby_mother', 'nutrition', 'general', 'grocery'],
      hint: 'Medicines plus medical devices, personal care, baby & mother care, medical nutrition, daily essentials and health food. Needs Drug Licence, pharmacist proof and KYC. You cannot sell medicines until the licence is verified.' },
    { label: 'Medical Consumables & Devices', drug: false, drugReq: false, fssai: false, pharmacist: false, invoice: true, extra: 'Approval for regulated medical device (if your product needs one)', types: ['instrument'],
      hint: 'Bandages, gauze, medical gloves, masks, thermometers, BP monitors and nebulizers. Needs KYC, product invoice and brand / manufacturer details.' },
    { label: 'Wholesale / Distributor', drug: true, drugReq: false, fssai: false, pharmacist: false, invoice: false, extra: '', types: ['general', 'personal_care', 'baby_mother', 'nutrition', 'instrument', 'medicine'],
      hint: 'Approved General, Personal Care and Medical products, only the types you are permitted to supply. Needs KYC, business proof, bank details and GST / trade licence (if applicable). A Drug Licence is required only to distribute medicines.' },
    { label: 'Health Food & Nutrition', drug: false, drugReq: false, fssai: true, pharmacist: false, invoice: false, extra: '', types: ['grocery'],
      hint: 'Health-related food only: protein powder, health drinks, vitamins & supplements, diabetic food, nutrition bars. Ordinary grocery and snacks are not allowed. Needs KYC, shop proof and FSSAI registration / licence.' },
    { label: 'Baby & Mother Care', drug: false, drugReq: false, fssai: false, pharmacist: false, invoice: false, extra: 'Additional permission for your product type (if applicable)', types: ['baby_mother'],
      hint: 'Diapers, baby wipes, baby lotion, shampoo and soap, and maternity pads. Needs KYC and shop proof. Infant food and nutrition belong to Medical Nutrition & Supplements.' },
    { label: 'Medical Nutrition & Supplements', drug: true, drugReq: false, fssai: true, pharmacist: false, invoice: false, extra: '', types: ['nutrition'],
      hint: 'Health supplements, protein powders, vitamins, ORS, electrolytes, and medical, diabetic and infant nutrition. Needs KYC, shop proof and FSSAI registration / licence. Add a Drug Licence only if your products are legally classified as medicines. Ordinary grocery items are not allowed.' }
  ];
  const BUSINESS_PROOF_TYPES = ['Shop address proof', 'Shop Establishment Certificate', 'Shop photo with signboard', 'Rent agreement / property document', 'Utility bill of the shop'];
  const LEGACY_CATEGORY = { 'Grocery & Packaged Food': 5, 'Retail Pharmacy': 2, 'Medical Store': 2, 'Wholesale Pharmacy': 4, 'Health & Wellness': 3 };
  function catInfo(label) {
    const c = BUSINESS_CATEGORIES.find(x => x.label === label);
    if (c) return c;
    if (label in LEGACY_CATEGORY) return BUSINESS_CATEGORIES[LEGACY_CATEGORY[label]];
    // empty / unknown category: strict, nothing can be listed until a category is chosen in KYC
    return { label: label || '', drug: true, drugReq: true, fssai: false, pharmacist: false, invoice: false, extra: '', types: [], hint: '' };
  }
  const hasAll = (o, f) => !!o && f.every(k => o[k] !== undefined && o[k] !== null && String(o[k]).trim() !== '');
  /* Documents section: business proof for everyone; Drug Licence / pharmacist / FSSAI / invoice by category */
  function docsComplete(d) {
    const c = catInfo(d.category), docs = d.docs || {};
    if (!d.category || !(BUSINESS_CATEGORIES.some(x => x.label === d.category) || d.category === 'Grocery & Packaged Food')) return false;
    if (!hasAll(docs.business, ['type', 'doc'])) return false;
    if (c.drugReq && !hasAll(d.license, ['number', 'expiry', 'doc'])) return false;
    if (c.drug && !c.drugReq && String((d.license || {}).number || '').trim() && !hasAll(d.license, ['expiry', 'doc'])) return false;
    if (c.pharmacist && !hasAll(docs.pharmacist, ['number', 'doc'])) return false;
    if (c.fssai && !hasAll(docs.fssai, ['number', 'expiry', 'doc'])) return false;
    if (c.invoice && !hasAll(docs.invoice, ['brand', 'doc'])) return false;
    return true;
  }
  function stepComplete(key, d) {
    if (key === 'store') return sectionComplete('store', d);
    if (key === 'license') return docsComplete(d);
    return sectionComplete(key, d[key]);
  }
  /* Prescription medicines: only with a verified Drug Licence (same rule as the database) */
  function canSellRx(m) {
    if (!m || !m.license || !String(m.license.number || '').trim()) return false;
    if (String(m.license.status || '').toLowerCase() !== 'verified') return false;
    return !m.license.expiry || String(m.license.expiry).slice(0, 10) >= new Date().toISOString().slice(0, 10);
  }
  /* Product types this merchant's account type may list (same rule as the database) */
  function allowedProductTypes(m) {
    if (!m) return [];
    const c = catInfo(m.category);
    return c.types.filter(t => t !== 'medicine' || c.drugReq || (c.drug && String((m.license || {}).number || '').trim()));
  }
  function kycPercent(merchant) {
    const parts = [sectionComplete('store', merchant), sectionComplete('address', merchant.address), docsComplete(merchant), sectionComplete('identity', merchant.identity), sectionComplete('bank', merchant.bank)];
    return parts.filter(Boolean).length * 20;
  }

  const state = {
    merchant: null,
    wizard: { step: 1, draft: null, files: {} },
    filters: {
      orders: { status: 'all', q: '' },
      inventory: { q: '', status: 'all' },
      customers: { q: '', segment: 'all', sort: 'recent' },
      returns: { status: 'all', q: '' },
      delivery: { tab: 'medifinder' }
    },
    selected: { orderId: null, rxId: null },
    product: { step: 0, draft: null, editingId: null, done: null, dirty: false },
    badges: { rx: 0, notif: 0, returns: 0, orders: 0 },
    rx: { draft: null }            // add-medicines draft for an accepted prescription
  };

  const NAV_FULL = [
    { route: 'dashboard', label: 'Dashboard', icon: 'home' },
    { route: 'orders', label: 'Orders', icon: 'orders', badge: 'orders' },
    { route: 'prescription', label: 'Prescription', icon: 'rx', badge: 'rx' },
    { route: 'inventory', label: 'Inventory', icon: 'inventory' },
    { route: 'categories', label: 'Categories', icon: 'tag' },
    { route: 'promotions', label: 'Promotions', icon: 'percent' },
    { route: 'customers', label: 'Customers', icon: 'users' },
    { route: 'returns', label: 'Returns', icon: 'undo', badge: 'returns' },
    { route: 'delivery', label: 'Delivery', icon: 'truck' },
    { route: 'payments', label: 'Payments', icon: 'wallet' },
    { route: 'analytics', label: 'Analytics', icon: 'chart' },
    { route: 'notifications', label: 'Notifications', icon: 'bell', badge: 'notif' },
    { route: 'faq', label: 'FAQ', icon: 'help' },
    { route: 'support', label: 'Support', icon: 'help' },
    { route: 'settings', label: 'Settings', icon: 'settings' }
  ];
  const BOTTOM_MAIN = ['dashboard', 'orders', 'inventory', 'prescription', 'faq'];
  const DRAWER_ROUTES = ['categories', 'promotions', 'customers', 'returns', 'delivery', 'payments', 'analytics', 'notifications', 'support', 'settings'];
  const BOTTOM_ICON_OVERRIDE = { dashboard: 'home' };
  const ROUTE_TITLE = Object.fromEntries(NAV_FULL.map(n => [n.route, n.label]));
  ROUTE_TITLE.profile = 'Profile';

  function badgeCount(key) { return state.badges[key] || 0; }

  function renderShellNav() {
    // Desktop sidebar
    document.getElementById('sidebarNav').innerHTML = NAV_FULL.map(item => {
      const count = item.badge ? badgeCount(item.badge) : 0;
      return `<button class="nav-item" data-route="${item.route}">${icon(item.icon)}<span>${item.label}</span>${count ? `<span class="nav-badge">${count}</span>` : ''}</button>`;
    }).join('');

    // Mobile bottom nav
    document.getElementById('bottomNav').innerHTML = BOTTOM_MAIN.map(route => {
      const item = NAV_FULL.find(n => n.route === route);
      const count = item.badge ? badgeCount(item.badge) : 0;
      return `<button class="bnav-item" data-route="${route}">${icon(BOTTOM_ICON_OVERRIDE[route] || item.icon)}<span>${item.label === 'Prescription' ? 'RX' : item.label}</span>${count ? `<span class="nav-badge">${count}</span>` : ''}</button>`;
    }).join('') + `<button class="bnav-item" id="moreBtn">${icon('more')}<span>More</span></button>`;

    // Mobile drawer ("More"): Profile first, then the rest
    const m = state.merchant;
    const kycMeta = m ? (KYC_STATUS_META[m.kyc.status] || KYC_STATUS_META.not_started) : null;
    const profileCard = `<button class="drawer-profile" data-route="profile">
      ${m && m.photo ? `<img class="drawer-profile-photo" src="${esc(m.photo)}" alt="">` : `<span class="drawer-profile-photo ph">${icon('user')}</span>`}
      <span class="drawer-profile-info"><b>${esc(m && m.shopName ? m.shopName : 'My profile')}</b><small>${kycMeta ? `${kycMeta.dot} ${kycMeta.label}` : 'View profile'}</small></span>
      <span class="profile-row-chevron">${icon('chevronR')}</span>
    </button>`;
    document.getElementById('drawerNav').innerHTML = profileCard + DRAWER_ROUTES.map(route => {
      const item = NAV_FULL.find(n => n.route === route);
      const count = item.badge ? badgeCount(item.badge) : 0;
      return `<button class="nav-item" data-route="${item.route}">${icon(item.icon)}<span>${item.label}</span>${count ? `<span class="nav-badge">${count}</span>` : ''}</button>`;
    }).join('');

    const rxCount = badgeCount('rx'), notifCount = badgeCount('notif');
    document.getElementById('rxBadge').hidden = rxCount === 0;
    const nb = document.getElementById('notifBadge');
    nb.hidden = notifCount === 0; nb.textContent = notifCount > 99 ? '99+' : notifCount;
    setActiveNav(parseHash()[0], parseHash()[1]);
  }

  function setActiveNav(route, param) {
    const navRoute = route === 'add-product' ? 'inventory' : (['profile-kyc-review', 'kyc-wizard', 'kyc-detail'].includes(route) ? 'profile' : route);
    document.querySelectorAll('.nav-item, .bnav-item, .drawer-profile').forEach(el => {
      el.classList.toggle('active', el.dataset.route === navRoute);
    });
    document.getElementById('topbarTitle').textContent = route === 'add-product' ? (param ? 'Edit product' : 'Add product') : (ROUTE_TITLE[route] || 'Dashboard');
    document.getElementById('topbarShopName').textContent = state.merchant && state.merchant.shopName ? state.merchant.shopName : 'MediFinder India';
  }

  function refreshMerchantChrome() {
    if (!state.merchant) return;
    const m = state.merchant;
    document.getElementById('sidebarShopName').textContent = m.shopName || 'My pharmacy';
    document.getElementById('topbarShopName').textContent = m.shopName || 'MediFinder India';
    const photoEl = document.getElementById('sidebarShopPhoto');
    photoEl.src = m.photo || 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><rect width="36" height="36" fill="#dde1e6"/></svg>`);
    const badge = document.getElementById('sidebarKycBadge');
    const [dot, label] = [(KYC_STATUS_META[m.kyc.status] || KYC_STATUS_META.not_started).dot, (KYC_STATUS_META[m.kyc.status] || KYC_STATUS_META.not_started).label];
    badge.textContent = `${dot} ${label}`;
  }

  function closeSheet() { document.querySelectorAll('.sheet-scrim').forEach(el => el.remove()); document.body.classList.remove('sheet-open'); }
  function openSheet(title, bodyHtml, opts) {
    opts = opts || {};
    closeSheet();
    const scrim = document.createElement('div');
    scrim.className = 'modal-scrim sheet-scrim';
    scrim.innerHTML = `<div class="modal sheet${opts.wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><button class="icon-btn" data-sheet-close aria-label="Back">${icon('chevronL')}</button><h3>${esc(title)}</h3></div>
      <div class="modal-body sheet-body">${bodyHtml}</div></div>`;
    document.getElementById('app').appendChild(scrim);
    document.body.classList.add('sheet-open');
    scrim.scrollTop = 0;
    scrim.addEventListener('mousedown', (e) => { scrim._down = e.target === scrim; });
    scrim.addEventListener('click', (e) => { if ((e.target === scrim && scrim._down) || e.target.closest('[data-sheet-close]')) closeSheet(); });
    const body = scrim.querySelector('.sheet-body');
    const api = { el: body, close: closeSheet, setHtml: (h) => { body.innerHTML = h; } };
    if (opts.onOpen) opts.onOpen(api);
    return api;
  }
  const sheetOpen = () => !!document.querySelector('.sheet-scrim') || !document.getElementById('confirmScrim').hidden;

  async function refreshBadges() {
    if (!sb || !merchantIdCache) return;
    try {
      const mid = merchantIdCache;
      const [rx, nt, rt, od] = await Promise.all([
        sb.from('prescription_orders').select('id').eq('status', 'pending').limit(300),
        sb.from('merchant_notifications').select('id', { count: 'exact', head: true }).eq('merchant_id', mid).eq('is_read', false),
        sb.from('returns').select('id', { count: 'exact', head: true }).eq('merchant_id', mid).eq('status', 'pending'),
        sb.from('orders').select('id', { count: 'exact', head: true }).eq('merchant_id', mid).eq('status', 'pending')
      ]);
      const dismissed = getDismissedRx(mid);
      state.badges.rx = (rx.data || []).filter(r => !dismissed.has(r.id)).length;
      state.badges.notif = nt.count || 0;
      state.badges.returns = rt.count || 0;
      state.badges.orders = od.count || 0;
      renderShellNav();
    } catch (e) { console.warn('badge refresh failed', e); }
  }

  let rtChannel = null;
  const RT_ROUTES = ['dashboard', 'orders', 'prescription', 'returns', 'delivery', 'notifications', 'payments'];
  const rtRefresh = debounce(async () => {
    invalidateOrders();
    await refreshBadges();
    const [route] = parseHash();
    const busy = sheetOpen() || (route === 'prescription' && state.rx.draft) || !RT_ROUTES.includes(route) || document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if (!busy) render(true);
  }, 700);

  function startRealtime() {
    if (!sb || !merchantIdCache || rtChannel) return;
    const mid = merchantIdCache;
    const cfg = (table, filter, event) => ({ event: event || '*', schema: 'public', table, ...(filter ? { filter } : {}) });
    try {
      rtChannel = sb.channel('merchant-live-' + mid)
        .on('postgres_changes', cfg('orders', `merchant_id=eq.${mid}`), (p) => {
          if (p.eventType === 'INSERT') showToast('New order received');
          rtRefresh();
        })
        .on('postgres_changes', cfg('prescription_orders', null, 'INSERT'), () => { showToast('New prescription request'); rtRefresh(); })
        .on('postgres_changes', cfg('prescription_orders', null, 'UPDATE'), () => rtRefresh())
        .on('postgres_changes', cfg('returns', `merchant_id=eq.${mid}`), (p) => { if (p.eventType === 'INSERT') showToast('New return request'); rtRefresh(); })
        .on('postgres_changes', cfg('merchant_notifications', `merchant_id=eq.${mid}`, 'INSERT'), () => rtRefresh())
        .subscribe();
    } catch (e) { console.warn('realtime unavailable', e); }
  }
  function stopRealtime() { if (rtChannel && sb) { try { sb.removeChannel(rtChannel); } catch (e) { /* ignore */ } } rtChannel = null; }

  function navigate(route, param) {
    location.hash = '#/' + route + (param ? '/' + encodeURIComponent(param) : '');
  }
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const [route, param] = h.split('/');
    return [route || 'dashboard', param ? decodeURIComponent(param) : null];
  }

  const LOADING_HTML = `<div class="state-block"><div class="spinner"></div><p>Loading…</p></div>`;
  function errorBlock(retryRoute) {
    return `<div class="state-block error">
      <div class="state-icon">${icon('close')}</div>
      <h4>Couldn't load this page</h4>
      <p>Something went wrong while fetching data. Please try again.</p>
      <button class="btn btn-outline btn-sm" data-route="${retryRoute}">Retry</button>
    </div>`;
  }
  function emptyBlock(iconName, title, sub, actionHtml) {
    return `<div class="state-block">
      <div class="state-icon">${icon(iconName)}</div>
      <h4>${esc(title)}</h4>
      <p>${esc(sub)}</p>
      ${actionHtml || ''}
    </div>`;
  }

  let renderSeq = 0;
  async function render(silent) {
    const [route, param] = parseHash();
    const seq = ++renderSeq;
    setActiveNav(route, param);
    document.body.classList.toggle('wizard-mode', route === 'add-product');
    const outlet = document.getElementById('pageOutlet');
    if (!silent) outlet.innerHTML = LOADING_HTML;
    const scrollY = window.scrollY;
    if (!state.merchant) {
      try { state.merchant = await DB.getMerchant(); refreshMerchantChrome(); } catch (e) { /* the page renderer surfaces auth errors */ }
    }
    const renderer = PAGES[route] || PAGES.dashboard;
    try {
      const html = await renderer(param);
      if (seq !== renderSeq) return;            // a newer navigation superseded this one
      outlet.innerHTML = html;
      if (AFTER[route]) AFTER[route](param);
      window.scrollTo(0, silent ? scrollY : 0);
    } catch (err) {
      if (seq !== renderSeq) return;
      console.error(err);
      if (err && err.code === 'AUTH_REQUIRED') { goHome(); return; }
      else if (err && err.code === 'NO_MERCHANT') outlet.innerHTML = `<div class="state-block error"><div class="state-icon">${icon('lock')}</div><h4>No merchant account</h4><p>${esc(err.message)}</p><button class="btn btn-outline btn-sm" id="signOutBtn">Sign out</button></div>`;
      else outlet.innerHTML = errorBlock(route);
      document.getElementById('signOutBtn')?.addEventListener('click', doSignOut);
    }
    renderShellNav();
  }

  function loginHtml() {
    return `<div class="card login-card">
      <h2>Sign in</h2><p class="wizard-desc">Sign in with your merchant account to load your store data.</p>
      <form id="loginForm">
        <label class="field"><span>Email</span><input type="email" name="email" required autocomplete="username"></label>
        <label class="field"><span>Password</span><input type="password" name="password" required autocomplete="current-password"></label>
        <p class="login-error" id="loginError" hidden></p>
        <button class="btn btn-primary" id="loginBtn" style="width:100%">Sign in</button>
      </form></div>`;
  }
  async function bootSession() {
    merchantIdCache = null; merchantRowCache = null; productsCache = null; invalidateOrders();
    state.merchant = await DB.getMerchant();
    refreshMerchantChrome();
    await refreshBadges();
    startRealtime();
    DB.applyDueScheduledPrices().then(n => { if (n) showToast(`${n} scheduled price change${n > 1 ? 's' : ''} applied`); }).catch(() => {});
  }
  function wireLogin() {
    document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target), btn = document.getElementById('loginBtn'), err = document.getElementById('loginError');
      err.hidden = true; btn.disabled = true;
      const { error } = await sb.auth.signInWithPassword({ email: fd.get('email'), password: fd.get('password') });
      if (error) { btn.disabled = false; err.textContent = error.message; err.hidden = false; return; }
      try { await bootSession(); } catch (e2) { console.error(e2); }
      btn.disabled = false;
      render();
    });
  }
  // Signed out (or never signed in): there is no merchant sign-in card any more — always go to the main login/home page.
  function goHome() { location.replace('home.html'); }
  async function doSignOut() {
    stopRealtime();
    try { if (sb) await sb.auth.signOut(); } catch (e) { console.warn('signOut failed', e); }
    merchantIdCache = null; merchantRowCache = null; productsCache = null; invalidateOrders();
    state.merchant = null; state.badges = { rx: 0, notif: 0, returns: 0, orders: 0 };
    goHome();
  }

  const PAGES = {};
  const AFTER = {};

  const isToday = (d, offset) => { const t = new Date(); t.setDate(t.getDate() - (offset || 0)); return localDate(new Date(d)) === localDate(t); };

  PAGES.dashboard = async () => {
    const [orders, products, pendingPayout] = await Promise.all([DB.getOrders(), DB.getProducts(), DB.getPendingPayout().catch(() => 0)]);
    const m = state.merchant;
    const todayOrders = orders.filter(o => isToday(o.createdAt));
    const yOrders = orders.filter(o => isToday(o.createdAt, 1));
    const pct = (a, b) => b > 0 ? Math.round((a - b) / b * 100) : null;
    const delta = (a, b) => { const p = pct(a, b); return p === null ? '<div class="stat-delta">No data for yesterday</div>' : `<div class="stat-delta ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '+' : ''}${p}% vs yesterday</div>`; };
    const sum = (l) => l.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);
    const pending = orders.filter(o => o.status === 'pending');
    const lowStock = products.filter(p => p.status === 'approved' && p.stock <= p.minStock);
    const rxPending = state.badges.rx;
    const week = await DB.getAnalytics().catch(() => null);

    const recent = orders.slice(0, 5);
    const recentRows = recent.map(o => `
      <tr data-route="orders" data-param="${o.id}" style="cursor:pointer">
        <td class="cell-mono">${esc(o.code)}</td>
        <td class="cell-strong">${esc(o.customer)}</td>
        <td>${o.items.length} item${o.items.length === 1 ? '' : 's'}</td>
        <td class="cell-mono">${money(o.total)}</td>
        <td>${statusPill(o.status)}</td>
        <td class="cell-muted">${timeAgo(o.createdAt)}</td>
      </tr>`).join('');
    const recentCards = recent.map(o => `
      <div class="item-card" data-route="orders" data-param="${o.id}" style="cursor:pointer">
        <div class="item-card-body">
          <div class="item-card-title">${esc(o.code)} · ${esc(o.customer)}</div>
          <div class="item-card-sub">${o.items.length} item${o.items.length === 1 ? '' : 's'} · ${money(o.total)}</div>
          <div class="item-card-meta">${statusPill(o.status)}<span class="cell-muted" style="font-size:12px">${timeAgo(o.createdAt)}</span></div>
        </div>
      </div>`).join('');
    const os = week ? week.orderStatus : { completed: 0, cancelled: 0, pending: 0, preparing: 0 };

    const notVerifiedBanner = (m && m.kyc.status !== 'verified') ? `
    <div class="card" style="border-left:4px solid var(--amber-500,#f59e0b);margin-bottom:14px">
      <b>Your products are hidden from customers</b>
      <p class="cell-muted" style="font-size:13px;margin:4px 0 10px">${m.kyc.status === 'pending_review' ? 'Our team is verifying your documents. Your products appear on the home page once you are verified.' : 'Complete KYC and get verified. Until then your products do not appear on the home page.'}</p>
      ${m.kyc.status === 'pending_review' ? '' : '<button class="btn btn-primary btn-sm" data-route="profile">Complete KYC</button>'}
    </div>` : '';
    return `
    ${notVerifiedBanner}
    <div class="page-head">
      <div><h1>Dashboard</h1><p class="page-sub">Welcome back${m && m.ownerName ? ', ' + esc(m.ownerName.split(' ')[0]) : ''}</p></div>
      <div class="page-head-actions">
        <button class="btn btn-primary" data-route="add-product">${icon('plus')}<span>Add product</span></button>
      </div>
    </div>

    <div class="stat-grid">
      <div class="card stat-card"><div class="stat-label">Today's orders</div><div class="stat-value">${todayOrders.length}</div>${delta(todayOrders.length, yOrders.length)}</div>
      <div class="card stat-card"><div class="stat-label">New orders</div><div class="stat-value">${pending.length}</div><div class="stat-delta">${pending.length ? 'Needs action' : 'All caught up'}</div></div>
      <div class="card stat-card accent"><div class="stat-label">Today's sales</div><div class="stat-value">${money(sum(todayOrders))}</div>${delta(sum(todayOrders), sum(yOrders))}</div>
      <div class="card stat-card"><div class="stat-label">Pending payout</div><div class="stat-value">${money(pendingPayout)}</div><div class="stat-delta">Settled to your bank</div></div>
    </div>

    <div class="section-grid">
      <div>
        <div class="card panel">
          <div class="panel-head"><h3>Recent orders</h3><button class="link" data-route="orders">View all</button></div>
          ${recent.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>When</th></tr></thead><tbody>${recentRows}</tbody></table></div>
          <div class="item-cards">${recentCards}</div>` : emptyBlock('orders', 'No orders yet', 'New orders from customers will appear here.')}
        </div>
        <div class="card panel">
          <div class="panel-head"><h3>Sales overview — last 7 days</h3></div>
          ${week ? barChart(week.salesByDay, week.dayLabels) : ''}
        </div>
      </div>
      <div>
        <div class="card panel">
          <div class="panel-head"><h3>Quick actions</h3></div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-outline" data-route="add-product" style="justify-content:flex-start">${icon('plus')}<span>Add a product</span></button>
            <button class="btn btn-outline" data-route="prescription" style="justify-content:flex-start">${icon('rx')}<span>Review prescriptions ${rxPending ? `(${rxPending})` : ''}</span></button>
            <button class="btn btn-outline" data-route="promotions" style="justify-content:flex-start">${icon('percent')}<span>Create a promotion</span></button>
          </div>
        </div>
        <div class="card panel">
          <div class="panel-head"><h3>Low stock alerts</h3><button class="link" data-route="inventory">Manage</button></div>
          ${lowStock.length ? lowStock.slice(0, 6).map(p => `
            <div class="notif-item" style="padding:10px 0;border-bottom:1px solid var(--ink-50)">
              <div class="notif-icon">${icon('box')}</div>
              <div class="notif-body"><div class="notif-title">${esc(p.name)}</div><div class="notif-msg">${p.stock} unit${p.stock === 1 ? '' : 's'} left · min ${p.minStock}</div></div>
            </div>`).join('') : emptyBlock('check', 'Stock levels look healthy', 'No products are below their minimum stock alert right now.')}
        </div>
        <div class="card panel">
          <div class="panel-head"><h3>Order statistics <span class="cell-muted" style="font-weight:600;font-size:12px">· 7 days</span></h3></div>
          <div class="ranked-list">
            ${orderStatRow('Delivered', os.completed, '#1e9e6b', os)}
            ${orderStatRow('Cancelled', os.cancelled, '#d6334a', os)}
            ${orderStatRow('Pending', os.pending, '#c77b12', os)}
            ${orderStatRow('In delivery', os.preparing, '#0e7c86', os)}
          </div>
        </div>
      </div>
    </div>`;
  };

  function orderStatRow(label, val, color, os) {
    const max = Math.max(os.completed, os.cancelled, os.pending, os.preparing, 1);
    return `<div class="ranked-row"><span class="rank-label">${label}</span>
      <div class="rank-bar-track"><div class="rank-bar-fill" style="width:${Math.min(100, val / max * 100)}%;background:${color}"></div></div>
      <span class="rank-value">${val}</span></div>`;
  }
  function barChart(values, labels) {
    const max = Math.max(...values, 1);
    return `<div class="bar-chart">${values.map(v => `<div class="bar${v === max && v > 0 ? ' peak' : ''}" style="height:${Math.max(4, v / max * 100)}%" title="${money(v)}"></div>`).join('')}</div>
      <div class="bar-chart-labels">${labels.map(l => `<span>${l}</span>`).join('')}</div>`;
  }

  const STATUS_PILL_MAP = {
    pending: ['pill-amber', 'New'], accepted: ['pill-teal', 'Accepted'], shipped: ['pill-teal', 'Dispatched'],
    picked_up: ['pill-teal', 'Out for delivery'], delivered: ['pill-green', 'Delivered'], cancelled: ['pill-red', 'Cancelled'],
    preparing: ['pill-teal', 'Preparing'], ready: ['pill-teal', 'Ready']
  };
  function statusPill(status) {
    const [cls, label] = STATUS_PILL_MAP[status] || ['pill-gray', String(status || '').replace(/_/g, ' ')];
    return `<span class="pill ${cls}"><span class="pill-dot"></span>${esc(label)}</span>`;
  }

  const ORDER_TABS = [['all', 'All'], ['pending', 'New'], ['accepted', 'Accepted'], ['shipped', 'Dispatched'], ['picked_up', 'Out for delivery'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']];

  PAGES.orders = async (param) => {
    const orders = await DB.getOrders();
    if (param) return renderOrderDetail(orders.find(o => o.id === param || o.code === param), orders);
    return renderOrdersList(orders);
  };

  function renderOrdersList(orders) {
    const f = state.filters.orders;
    let list = orders.filter(o => f.status === 'all' || o.status === f.status);
    if (f.q) list = list.filter(o => (o.code + ' ' + o.customer + ' ' + o.phone).toLowerCase().includes(f.q.toLowerCase()));

    const rows = list.map(o => `
      <tr data-route="orders" data-param="${o.id}" style="cursor:pointer">
        <td class="cell-mono cell-strong">${esc(o.code)}</td>
        <td>${esc(o.customer)}${o.rxRequired ? ' <span class="pill pill-teal" style="margin-left:6px">RX</span>' : ''}</td>
        <td>${o.items.length} item${o.items.length === 1 ? '' : 's'}</td>
        <td class="cell-mono">${money(o.total)}</td>
        <td><span class="pill ${o.paymentMode === 'Online' ? 'pill-teal' : 'pill-gray'}">${esc(o.paymentMode)}</span> <span class="cell-muted" style="font-size:12px">${esc(o.paymentState)}</span></td>
        <td>${statusPill(o.status)}</td>
        <td class="cell-muted">${timeAgo(o.createdAt)}</td>
      </tr>`).join('');
    const cards = list.map(o => `
      <div class="item-card" data-route="orders" data-param="${o.id}" style="cursor:pointer">
        <div class="item-card-body">
          <div class="item-card-title">${esc(o.code)} · ${esc(o.customer)}</div>
          <div class="item-card-sub">${o.items.length} item${o.items.length === 1 ? '' : 's'} · ${money(o.total)} · ${esc(payText(o))}</div>
          <div class="item-card-meta">${statusPill(o.status)}${o.rxRequired ? '<span class="pill pill-teal">RX</span>' : ''}<span class="cell-muted" style="font-size:12px">${timeAgo(o.createdAt)}</span></div>
        </div>
      </div>`).join('');

    return `
    <div class="page-head"><div><h1>Orders</h1><p class="page-sub">${orders.length} total</p></div></div>
    <div class="toolbar">
      <div class="search-box">${icon('search')}<input type="text" id="orderSearch" placeholder="Search order ID, customer or phone" value="${esc(f.q)}"></div>
    </div>
    <div class="chip-row" style="margin-bottom:16px">
      ${ORDER_TABS.map(([k, l]) => `<button class="filter-chip${f.status === k ? ' active' : ''}" data-order-filter="${k}">${l}</button>`).join('')}
    </div>
    <div class="card">
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>When</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="item-cards" style="padding:10px">${cards}</div>
      ${list.length ? '' : emptyBlock('orders', 'No orders here', 'Try a different filter or search term.')}
    </div>`;
  }

  function saveBlobAs(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  let jsPdfPromise = null;
  function loadJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (!jsPdfPromise) jsPdfPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = () => (window.jspdf && window.jspdf.jsPDF) ? resolve(window.jspdf.jsPDF) : reject(new Error('PDF library failed to load'));
      s.onerror = () => { jsPdfPromise = null; reject(new Error('Could not load the PDF library — check your internet connection')); };
      document.head.appendChild(s);
    });
    return jsPdfPromise;
  }
  // Order receipt = the official MediFinder India invoice page (order-receipt.html): QR-scannable by anyone, verified/signed only by this merchant
  function openOrderReceipt(order) { window.open('order-receipt.html?type=order&order_id=' + encodeURIComponent(order.code), '_blank'); }

  const ORDER_STEPS = ['pending', 'accepted', 'shipped', 'picked_up', 'delivered'];
  const ORDER_STEP_TITLE = { pending: 'Order placed', accepted: 'Accepted by you', shipped: 'Dispatched', picked_up: 'Out for delivery', delivered: 'Delivered' };

  function renderOrderDetail(order) {
    if (!order) return emptyBlock('orders', 'Order not found', 'This order may have been removed.', `<button class="btn btn-outline btn-sm" data-route="orders">Back to orders</button>`);
    const curIdx = ORDER_STEPS.indexOf(order.status);
    const timeline = order.status === 'cancelled'
      ? [{ title: 'Order placed', done: true }, { title: 'Cancelled', done: true }]
      : ORDER_STEPS.map((s, i) => ({ title: ORDER_STEP_TITLE[s], done: i <= curIdx }));
    const courier = order.partner === 'courier';
    const partnerLabel = courier ? `Courier — ${esc(order.courierName || 'Partner')}` : 'MediFinder India riders';

    let actions = '';
    if (order.status === 'pending') actions = `<button class="btn btn-primary" data-order-action="accept" data-order-id="${order.id}">Accept order</button><button class="btn btn-outline" data-order-action="cancel" data-order-id="${order.id}">Reject order</button>`;
    else if (order.status === 'accepted') actions = `<button class="btn btn-primary" data-order-action="dispatch" data-order-id="${order.id}">${icon('truck')}<span>Dispatch order</span></button><button class="btn btn-outline" data-order-action="cancel" data-order-id="${order.id}">Cancel order</button>`;
    else if (order.status === 'shipped' && courier) actions = order.courierProvider ? `<p class="cell-muted" style="font-size:12.5px">${esc(order.courierName)} · AWB ${esc(order.courierTracking)} — status updates automatically when the courier delivers.</p>` : `<button class="btn btn-primary" data-order-action="delivered" data-order-id="${order.id}">Mark delivered</button><button class="btn btn-outline" data-order-action="courier" data-order-id="${order.id}">Edit tracking</button>`;

    return `
    <button class="detail-back" data-route="orders">${icon('chevronL')}<span>Back to orders</span></button>
    <div class="split-layout" style="grid-template-columns:1fr">
      <div class="split-detail" style="max-height:none">
        <div class="page-head" style="margin-bottom:14px">
          <div><h1 style="font-size:18px">${esc(order.code)}</h1><p class="page-sub">${timeAgo(order.createdAt)} · ${fmtDateTime(order.createdAt)}</p></div>
          ${statusPill(order.status)}
        </div>

        <div class="card panel">
          <div class="panel-head"><h3>Customer</h3></div>
          <div class="review-row"><span>Name</span><span>${esc(order.customer)}</span></div>
          <div class="review-row"><span>Phone</span><span>${order.phone ? `<a href="tel:${esc(order.phone)}">${esc(order.phone)}</a>` : '—'}</span></div>
          <div class="review-row"><span>Delivery address</span><span>${esc(order.address || '—')}</span></div>
          ${order.rider ? `<div class="review-row"><span>Rider</span><span>${esc(order.rider)}${order.riderPhone ? ' · ' + esc(order.riderPhone) : ''}</span></div>` : ''}
        </div>

        <div class="card panel">
          <div class="panel-head"><h3>Items</h3></div>
          ${order.items.length ? order.items.map(it => `<div class="review-row"><span>${esc(it.name)} × ${it.qty}</span><span>${it.price ? money(it.price * it.qty) : ''}</span></div>`).join('') : '<p class="cell-muted">No item details.</p>'}
          ${order.discount ? `<div class="review-row"><span>Discount${order.coupon ? ' (' + esc(order.coupon) + ')' : ''}</span><span>-${money(order.discount)}</span></div>` : ''}
          <div class="review-row" style="border-top:1px solid var(--ink-100);margin-top:6px;padding-top:10px"><span>Total</span><span>${money(order.total)}</span></div>
          <div class="review-row"><span>Payment</span><span><span class="pill ${order.paymentMode === 'Online' ? 'pill-teal' : 'pill-gray'}">${esc(order.paymentMode)}</span> ${esc(order.paymentState)}</span></div>
          ${order.prescriptionUrl ? `<div class="review-row"><span>Prescription</span><span><a class="link-a" href="${esc(order.prescriptionUrl)}" target="_blank" rel="noopener">View prescription</a></span></div>` : ''}
        </div>

        ${['shipped', 'picked_up', 'delivered'].includes(order.status) ? `
        <div class="card panel">
          <div class="panel-head"><h3>Delivery</h3></div>
          <div class="review-row"><span>Delivered by</span><span>${partnerLabel}</span></div>
          ${courier && order.courierTracking ? `<div class="review-row"><span>Tracking ID</span><span class="cell-mono">${esc(order.courierTracking)}</span></div>` : ''}
          ${!courier && !order.rider && order.status === 'shipped' ? '<div class="review-row"><span>Rider</span><span>Waiting for a rider to accept</span></div>' : ''}
        </div>` : ''}

        ${['shipped', 'picked_up', 'delivered'].includes(order.status) ? `
        <div class="card panel">
          <div class="panel-head"><h3>${courier ? 'Receipts (2)' : 'Receipt'}</h3></div>
          ${courier ? `<div class="review-row"><span>${esc(order.courierName || 'Courier')} shipping label${order.courierTracking ? ' · AWB ' + esc(order.courierTracking) : ''}</span><span><button class="btn btn-outline btn-sm" data-order-action="label" data-order-id="${order.id}"${order.courierProvider ? '' : ' disabled title="Shipment was entered manually - no courier label exists"'}>${icon('truck')}<span>Download label</span></button></span></div>` : ''}
          <div class="review-row"><span>MediFinder India order receipt<br><small>Open it to download, or to verify / sign as the seller</small></span><span><button class="btn btn-primary btn-sm" data-order-action="receipt" data-order-id="${order.id}"><span>Open receipt</span></button></span></div>
        </div>` : ''}

        ${order.status === 'cancelled' && order.cancelReason ? `<div class="rejection-note"><strong>Cancelled:</strong> ${esc(order.cancelReason)}</div>` : ''}

        <div class="card panel">
          <div class="panel-head"><h3>Order timeline</h3></div>
          <div class="order-timeline">
            ${timeline.map(t => `<div class="timeline-step${t.done ? ' done' : ''}"><div class="timeline-dot"></div><div><div class="timeline-title">${t.title}</div></div></div>`).join('')}
          </div>
        </div>

        ${actions ? `<div class="modal-actions" style="justify-content:flex-start">${actions}</div>` : ''}
      </div>
    </div>`;
  }

  /* Delivery-company chooser: MediFinder India's own riders OR a courier company */
  // Turn this to true ONLY after the NimbusPost account is live and the `courier` / `nimbus-warehouse` edge functions are deployed.
  // While false, every non-rider order is dispatched manually (merchant picks a courier and types the AWB).
  const COURIER_AUTO = false;
  const COURIERS = ['NimbusPost', 'Shiprocket', 'Delhivery', 'Blue Dart', 'DTDC', 'Ecom Express', 'Xpressbees', 'India Post', 'Other'];
  function openDispatchSheet(order, onDone) {
    openSheet('Choose delivery', `
      <p class="cell-muted" style="font-size:13px;margin-bottom:12px">Order ${esc(order.code)} · who will deliver it?</p>
      <form id="dispatchForm">
        <label class="radio-card"><input type="radio" name="partner" value="medifinder" checked>
          <span class="radio-card-body"><b>MediFinder India delivery</b><small>Our own riders pick it up from your shop and deliver to the customer.</small></span></label>
        <label class="radio-card"><input type="radio" name="partner" value="courier">
          <span class="radio-card-body"><b>Courier company</b><small>Hand the parcel to a courier partner and add its tracking ID.</small></span></label>
        <div id="courierFields" hidden>
          <label class="field"><span>Courier company</span><select name="courier">${COURIERS.map(c => `<option>${c}</option>`).join('')}</select></label>
          <label class="field" id="courierOtherWrap" hidden><span>Company name</span><input type="text" name="courierOther" maxlength="60"></label>
          <label class="field"><span>Tracking / AWB number <span class="field-hint">(optional)</span></span><input type="text" name="tracking" maxlength="60"></label>
        </div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-sheet-close>Cancel</button><button class="btn btn-primary" id="dispatchGo">Dispatch order</button></div>
      </form>`, {
      onOpen: (sh) => {
        const form = sh.el.querySelector('#dispatchForm');
        const sync = () => {
          const courier = form.partner.value === 'courier';
          form.querySelector('#courierFields').hidden = !courier;
          form.querySelector('#courierOtherWrap').hidden = !(courier && form.courier.value === 'Other');
        };
        form.addEventListener('change', sync);
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const partner = form.partner.value;
          let name = form.courier.value;
          if (partner === 'courier' && name === 'Other') name = form.courierOther.value.trim();
          if (partner === 'courier' && !name) { showToast('Enter the courier company name', 'error'); return; }
          const btn = form.querySelector('#dispatchGo'); BtnState.start(btn, 'Dispatching…');
          const trk = form.tracking.value.trim();
          if (partner === 'courier' && trk && trk === order.code) { BtnState.reset(btn); showToast('That is the order ID, not a courier tracking/AWB number', 'error'); return; }
          try { await DB.dispatchOrder(order, partner, name, trk); await BtnState.ok(btn, 'Dispatched'); sh.close(); showToast(partner === 'courier' ? 'Handed to courier' : 'Sent to MediFinder India riders'); onDone(); }
          catch (err) { console.error(err); BtnState.fail(btn, 'Failed — Retry'); showToast('Could not dispatch this order', 'error'); }
        });
      }
    });
  }

  function openCancelSheet(order, onDone) {
    const reasons = ['Out of stock', 'Prescription invalid / unclear', 'Shop is closed', 'Cannot deliver to this address', 'Other'];
    openSheet('Reject order', `
      <form id="cancelForm">
        <label class="field"><span>Reason</span><select name="reason">${reasons.map(r => `<option>${r}</option>`).join('')}</select></label>
        <label class="field"><span>Note to customer <span class="field-hint">(optional)</span></span><textarea name="note" rows="2" maxlength="200"></textarea></label>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-sheet-close>Back</button><button class="btn btn-danger" id="cancelGo">Reject order</button></div>
      </form>`, {
      onOpen: (sh) => {
        const form = sh.el.querySelector('#cancelForm');
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = form.querySelector('#cancelGo'); BtnState.start(btn, 'Rejecting…');
          try { await DB.cancelOrder(order, form.reason.value, form.note.value.trim()); await BtnState.ok(btn, 'Order Rejected'); sh.close(); showToast('Order rejected'); onDone(); }
          catch (err) { console.error(err); BtnState.fail(btn, 'Failed — Retry'); showToast('Could not update this order', 'error'); }
        });
      }
    });
  }

  function openCourierSheet(order, onDone) {
    openSheet('Courier tracking', `
      <form id="courierForm">
        <label class="field"><span>Courier company</span><input type="text" name="cname" value="${esc(order.courierName)}" required maxlength="60"></label>
        <label class="field"><span>Tracking / AWB number</span><input type="text" name="tracking" value="${esc(order.courierTracking)}" maxlength="60"></label>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-sheet-close>Cancel</button><button class="btn btn-primary">Save</button></div>
      </form>`, {
      onOpen: (sh) => sh.el.querySelector('#courierForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target, btn = submitBtn(e, f);
        BtnState.start(btn);
        try { await DB.updateCourier(order, f.cname.value.trim(), f.tracking.value.trim()); await BtnState.ok(btn); sh.close(); showToast('Tracking updated'); onDone(); }
        catch (err) { console.error(err); BtnState.fail(btn); showToast('Could not save', 'error'); }
      })
    });
  }

  AFTER.orders = () => {
    document.getElementById('orderSearch')?.addEventListener('input', (e) => { state.filters.orders.q = e.target.value; renderOrdersOnly('orderSearch'); });
    document.querySelectorAll('[data-order-filter]').forEach(b => b.addEventListener('click', () => { state.filters.orders.status = b.dataset.orderFilter; renderOrdersOnly(); }));
    document.querySelectorAll('[data-order-action]').forEach(b => b.addEventListener('click', async () => {
      const order = await DB.getOrder(b.dataset.orderId);
      if (!order) return;
      const act = b.dataset.orderAction;
      const done = () => render();
      try {
        if (act === 'accept') { BtnState.start(b, 'Accepting…'); await DB.acceptOrder(order); await BtnState.ok(b, 'Order Accepted', 500); showToast('Order accepted'); done(); }
        else if (act === 'delivered') { const ok = await confirmDialog('Mark as delivered?', 'The customer will be notified.'); if (ok) { BtnState.start(b, 'Updating…'); await DB.markDelivered(order); await BtnState.ok(b, 'Delivered', 500); showToast('Order delivered'); done(); } }
        else if (act === 'dispatch') {
          if (order.deliverySpeed && order.deliverySpeed !== 'manual') {
            BtnState.start(b, 'Dispatching…');
            const r = await DB.autoDispatch(order);
            if (r.ok) { await BtnState.ok(b, 'Sent to Riders', 500); showToast('Sent to MediFinder India riders'); done(); }
            else { BtnState.fail(b, 'Failed — Retry'); showToast('Could not dispatch this order', 'error'); }
          } else {
            if (!COURIER_AUTO) { openDispatchSheet(order, done); return; }
            BtnState.start(b, 'Finding courier…');
            showToast('Finding the cheapest courier…');
            const r = await DB.autoDispatch(order);
            if (r.ok) { await BtnState.ok(b, 'Courier Booked', 600); showToast(`Booked with ${r.courier} (AWB ${r.awb})`); done(); }
            else { BtnState.fail(b, 'Booking Failed — Retry'); const why = r.error && r.error.message ? String(r.error.message).slice(0, 140) : ''; showToast('Courier booking failed' + (why ? ': ' + why : '') + ' — choose delivery manually', 'error'); openDispatchSheet(order, done); }
          }
        }
        else if (act === 'cancel') openCancelSheet(order, done);
        else if (act === 'courier') openCourierSheet(order, done);
        else if (act === 'receipt') openOrderReceipt(order);
        else if (act === 'label') { BtnState.start(b, 'Fetching label…'); showToast('Fetching courier label…'); try { await DB.downloadCourierLabel(order); BtnState.ok(b, 'Label Downloaded'); showToast('Courier label downloaded'); } catch (e) { BtnState.fail(b, 'Failed — Retry'); showToast('Courier label: ' + String(e.message || e).slice(0, 120), 'error'); } }
      } catch (err) { console.error(err); BtnState.fail(b, 'Failed — Retry'); showToast('Could not update this order', 'error'); }
    }));
  };
  async function renderOrdersOnly(focusId) {
    const outlet = document.getElementById('pageOutlet');
    outlet.innerHTML = renderOrdersList(await DB.getOrders());
    AFTER.orders();
    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); const n = el.value.length; try { el.setSelectionRange(n, n); } catch (e) { /* ignore */ } } }
  }

  PAGES.prescription = async (param) => {
    const list = await DB.getPrescriptions();
    const activeId = param || state.selected.rxId || (list.find(r => r.status === 'pending' || r.status === 'accepted') || list[0] || {}).id;
    const active = list.find(r => r.id === activeId) || list[0];
    state.rx.activeId = active ? active.id : null;
    if (!active || !state.rx.draft || state.rx.draft.rxId !== active.id) state.rx.draft = null;
    return renderPrescriptionSplit(list, active);
  };

  function renderPrescriptionSplit(list, active) {
    if (!list.length) return `<div class="page-head"><h1>Prescription</h1></div><div class="card">${emptyBlock('rx', 'No prescription requests', 'New requests from customers will show up here.')}</div>`;
    const listHtml = list.map(r => `
      <div class="split-list-item${active && r.id === active.id ? ' active' : ''}" data-rx-select="${r.id}">
        <div class="split-item-top"><span class="cell-strong">RX-${shortId(r.id)}</span>${rxPill(r.status)}</div>
        <div class="item-card-sub">${esc(r.customer)}${r.requested.length ? ' · ' + r.requested.length + ' medicine' + (r.requested.length === 1 ? '' : 's') : ''}</div>
        <div class="cell-muted" style="font-size:12px;margin-top:4px">${timeAgo(r.createdAt)}</div>
      </div>`).join('');

    return `
    <div class="page-head"><div><h1>Prescription</h1><p class="page-sub">${list.filter(r => r.status === 'pending').length} pending · ${list.filter(r => r.status === 'accepted').length} need medicines</p></div></div>
    <div class="split-layout">
      <div class="split-list">${listHtml}</div>
      <div class="split-detail" id="rxDetailPane">${active ? rxDetailHtml(active) : emptyBlock('rx', 'Select a request', 'Choose a prescription from the list.')}</div>
    </div>`;
  }
  function rxPill(status) {
    const map = { pending: ['pill-amber', 'Pending'], accepted: ['pill-teal', 'Add medicines'], ordered: ['pill-green', 'Order created'], cancelled: ['pill-gray', 'Cancelled by customer'] };
    const [cls, label] = map[status] || ['pill-gray', status];
    return `<span class="pill ${cls}">${label}</span>`;
  }
  function rxImageHtml(r) {
    if (!r.image) return `<div class="rx-viewer">${icon('file')}&nbsp; No image attached</div>`;
    if (/\.pdf(\?|$)/i.test(r.image)) return `<a class="rx-viewer" href="${esc(r.image)}" target="_blank" rel="noopener">${icon('file')}&nbsp; Open prescription PDF</a>`;
    return `<a href="${esc(r.image)}" target="_blank" rel="noopener" class="rx-viewer rx-img"><img src="${esc(r.image)}" alt="Prescription"></a>`;
  }
  function rxDetailHtml(r) {
    const head = `
      ${rxImageHtml(r)}
      <div class="review-block">
        <h4>Customer</h4>
        <div class="review-row"><span>Name</span><span>${esc(r.customer)}</span></div>
        <div class="review-row"><span>Phone</span><span>${r.phone ? `<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : '—'}</span></div>
        <div class="review-row"><span>Address</span><span>${esc(r.address || '—')}</span></div>
      </div>`;
    if (r.status === 'pending') return head + `
      ${r.requested.length ? `<div class="review-block"><h4>Customer asked for</h4>${r.requested.map(m => `<div class="review-row"><span>${esc(m.name)}</span><span>${m.price ? money(m.price) : ''}</span></div>`).join('')}</div>` : ''}
      <div class="modal-actions" style="justify-content:flex-start">
        <button class="btn btn-primary" data-rx-accept="${r.id}">${icon('check')}<span>Accept prescription</span></button>
        <button class="btn btn-outline" data-rx-reject="${r.id}">Reject</button>
      </div>`;
    if (r.status === 'accepted') return head + `<div id="rxAddPanel" class="rx-add"></div>`;
    if (r.status === 'ordered') return head + `<div class="review-block"><h4>Order</h4><div class="review-row"><span>Order ID</span><span class="cell-mono">${esc(r.orderCode)}</span></div></div>
      <button class="btn btn-outline" data-route="orders" data-param="${r.orderId}">View order</button>`;
    return head + `<p class="cell-muted">The customer cancelled this request.</p>`;
  }

  /* ---- "Add medicines" panel for an accepted prescription ---- */
  async function mountRxAddPanel(rx) {
    const host = document.getElementById('rxAddPanel');
    if (!host) return;
    if (!state.rx.draft || state.rx.draft.rxId !== rx.id) {
      const d = { rxId: rx.id, lines: [], missing: [], payment: 'COD' };
      // pre-fill from what the customer asked for, using MY inventory price
      try {
        const ids = rx.requested.map(m => m.id).filter(Boolean);
        const mine = ids.length ? await DB.getMedicinesByIds(ids) : [];
        rx.requested.forEach(req => {
          const hit = mine.find(m => String(m.id) === String(req.id) && m.live && m.stock > 0);
          if (hit) d.lines.push({ id: hit.id, name: hit.name, price: hit.price, mrp: hit.mrp, stock: hit.stock, img: hit.img, qty: Math.min(num(req.qty) || 1, hit.stock) });
          else d.missing.push(req.name);
        });
      } catch (e) { console.warn(e); }
      state.rx.draft = d;
    }
    const d = state.rx.draft;
    host.innerHTML = `
      <div class="review-block"><h4>Add medicines</h4>
        <p class="cell-muted" style="font-size:12.5px;margin-bottom:8px">Search your inventory — the selling price is filled in automatically.</p>
        ${d.missing.length ? `<div class="chip-row rx-missing" style="margin-bottom:8px"><span class="cell-muted" style="font-size:12px;align-self:center">Customer asked for:</span>${d.missing.map(n => `<button type="button" class="filter-chip" data-rx-fill="${esc(n)}" style="height:30px;font-size:12px">${esc(n)}</button>`).join('')}</div>` : ''}
        <div class="search-box" style="max-width:none">${icon('search')}<input type="text" id="rxSearch" placeholder="Search medicine by name…" autocomplete="off"></div>
        <div id="rxResults" class="rx-results"></div>
      </div>
      <div class="review-block"><h4>Selected medicines</h4><div id="rxLines"></div></div>
      <label class="field"><span>Payment</span>
        <select id="rxPay"><option value="COD"${d.payment === 'COD' ? ' selected' : ''}>Cash on delivery</option><option value="ONLINE"${d.payment === 'ONLINE' ? ' selected' : ''}>Customer pays online</option></select></label>
      ${rx.address ? '' : '<p class="rejection-note">This request has no delivery address — call the customer to confirm it.</p>'}
      <div class="modal-actions" style="justify-content:flex-start"><button class="btn btn-primary" id="rxCreate">Create order</button></div>`;

    const linesEl = host.querySelector('#rxLines'), resEl = host.querySelector('#rxResults'), createBtn = host.querySelector('#rxCreate');
    const redrawLines = () => {
      const total = d.lines.reduce((s, l) => s + l.price * l.qty, 0);
      linesEl.innerHTML = d.lines.length ? d.lines.map((l, i) => `
        <div class="rx-line">
          <div class="rx-line-info"><b>${esc(l.name)}</b><small>${money(l.price)} each · ${l.stock} in stock</small></div>
          <div class="qty-stepper"><button type="button" data-q="-1" data-i="${i}" aria-label="Less">−</button><span>${l.qty}</span><button type="button" data-q="1" data-i="${i}" aria-label="More">+</button></div>
          <span class="rx-line-total">${money(l.price * l.qty)}</span>
          <button type="button" class="icon-btn" data-rm="${i}" aria-label="Remove">${icon('close')}</button>
        </div>`).join('') + `<div class="review-row" style="margin-top:6px"><span>Total</span><span>${money(total)}</span></div>` : '<p class="cell-muted" style="font-size:13px">No medicines added yet.</p>';
      createBtn.disabled = !d.lines.length;
    };
    linesEl.addEventListener('click', (e) => {
      const q = e.target.closest('[data-q]'), rm = e.target.closest('[data-rm]');
      if (q) { const l = d.lines[+q.dataset.i]; l.qty = Math.max(1, Math.min(l.stock, l.qty + +q.dataset.q)); redrawLines(); }
      if (rm) { d.lines.splice(+rm.dataset.rm, 1); redrawLines(); }
    });
    let searchSeq = 0;
    const doSearch = async (q) => {
      const seq = ++searchSeq;
      resEl.innerHTML = '<p class="cell-muted" style="font-size:12.5px;padding:8px 2px">Searching…</p>';
      try {
        const res = await DB.searchMedicines(q);
        if (seq !== searchSeq) return;
        resEl.innerHTML = res.length ? res.map(m => `
          <button type="button" class="rx-result" data-add='${esc(JSON.stringify(m))}'>
            ${m.img ? `<img src="${esc(m.img)}" alt="">` : '<span class="rx-result-ph"></span>'}
            <span class="rx-result-info"><b>${esc(m.name)}</b><small>${esc([m.generic, m.meta].filter(Boolean).join(' · ') || 'In stock: ' + m.stock)}</small></span>
            <span class="rx-result-price">${money(m.price)}${m.rx ? '<em>RX</em>' : ''}</span>
          </button>`).join('') : `<p class="cell-muted" style="font-size:12.5px;padding:8px 2px">${q ? 'No matching medicine in stock in your inventory.' : 'Your inventory has no in-stock, approved medicines yet.'}</p>`;
      } catch (err) { console.error(err); resEl.innerHTML = '<p class="cell-muted" style="font-size:12.5px;padding:8px 2px">Search failed. Try again.</p>'; }
    };
    const searchInput = host.querySelector('#rxSearch');
    searchInput.addEventListener('input', debounce(() => doSearch(searchInput.value), 250));
    resEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-add]'); if (!b) return;
      const m = JSON.parse(b.dataset.add);
      const ex = d.lines.find(l => String(l.id) === String(m.id));
      if (ex) ex.qty = Math.min(ex.stock, ex.qty + 1);
      else d.lines.push({ id: m.id, name: m.name, price: m.price, mrp: m.mrp, stock: m.stock, img: m.img, qty: 1 });
      redrawLines();
      showToast(m.name + ' added');
    });
    host.querySelectorAll('[data-rx-fill]').forEach(b => b.addEventListener('click', () => { searchInput.value = b.dataset.rxFill; searchInput.focus(); doSearch(b.dataset.rxFill); }));
    host.querySelector('#rxPay').addEventListener('change', (e) => { d.payment = e.target.value; });
    createBtn.addEventListener('click', async () => {
      if (!d.lines.length) return;
      if (d.lines.some(l => !(l.price > 0))) { showToast('A selected medicine has no price — fix it in Inventory', 'error'); return; }
      const ok = await confirmDialog('Create this order?', `${d.lines.length} medicine${d.lines.length === 1 ? '' : 's'} · ${money(d.lines.reduce((s, l) => s + l.price * l.qty, 0))}. The customer will be notified.`);
      if (!ok) return;
      BtnState.start(createBtn, 'Creating order…');
      try {
        const res = await DB.createRxOrder(rx, d.lines, d.payment);
        await BtnState.ok(createBtn, 'Order Created');
        state.rx.draft = null;
        showToast('Order created');
        navigate('orders', res.id);
      } catch (err) { console.error(err); BtnState.fail(createBtn, 'Failed — Retry'); showToast('Could not create the order. Please try again.', 'error'); }
    });
    redrawLines();
    doSearch('');
  }

  AFTER.prescription = async () => {
    const list = await DB.getPrescriptions();
    document.querySelectorAll('[data-rx-select]').forEach(el => el.addEventListener('click', () => { state.selected.rxId = el.dataset.rxSelect; navigate('prescription', el.dataset.rxSelect); }));
    document.querySelectorAll('[data-rx-accept]').forEach(el => el.addEventListener('click', async () => {
      el.disabled = true;
      try { await DB.acceptPrescription(el.dataset.rxAccept); showToast('Prescription accepted — add the medicines'); state.rx.draft = null; render(); }
      catch (err) {
        console.error(err); el.disabled = false;
        showToast(err.code === 'TAKEN' ? err.message : 'Could not accept this prescription', 'error');
        if (err.code === 'TAKEN') render();
      }
    }));
    document.querySelectorAll('[data-rx-reject]').forEach(el => el.addEventListener('click', async () => {
      const ok = await confirmDialog('Reject this prescription?', 'It will disappear from your list. Other pharmacies can still accept it.');
      if (!ok) return;
      dismissRx(await requireMerchantId(), el.dataset.rxReject);
      showToast('Prescription rejected');
      refreshBadges(); navigate('prescription');
      render();
    }));
    const active = list.find(r => r.id === state.rx.activeId);
    if (active && active.status === 'accepted') mountRxAddPanel(active);
  };

  let likeInfo = { byId: {}, total: 0 };
  const likesOf = (p) => likeInfo.byId[p.id] || 0;
  PAGES.inventory = async () => {
    const [products, categories, likes] = await Promise.all([DB.getProducts(), DB.getCategories(), DB.getLikeCounts()]);
    likeInfo = likes;
    return renderInventoryList(products, categories);
  };

  // Pause / Resume only makes sense for admin-approved products
  const pauseBtn = (p) => ((p.status || 'approved') === 'approved')
    ? `<button class="btn btn-ghost btn-sm" data-pause-product="${p.id}" data-pause-to="${p.active ? 'pause' : 'resume'}" title="${p.active ? 'Pause' : 'Resume'}">${icon(p.active ? 'pause' : 'play')}<span>${p.active ? 'Pause' : 'Resume'}</span></button>`
    : '';
  function renderInventoryList(products, categories) {
    const f = state.filters.inventory;
    let list = products.filter(p => {
      if (f.status === 'low' && p.stock > p.minStock) return false;
      if (f.status === 'out' && p.stock !== 0) return false;
      if (f.status === 'active' && !isLive(p)) return false;
      if (f.status === 'inactive' && !(isApproved(p) && !p.active)) return false;
      if (f.status === 'pending' && isApproved(p)) return false;
      return true;
    });
    if (f.q) list = list.filter(p => p.name.toLowerCase().includes(f.q.toLowerCase()) || p.generic.toLowerCase().includes(f.q.toLowerCase()));

    const rows = list.map(p => `
      <tr>
        <td class="cell-strong"><div class="prod-cell">${productThumb(p, 'prod-thumb')}<div>${esc(p.name)}<div class="cell-muted" style="font-size:12px">${esc(p.generic || p.brand || '')}</div></div></div></td>
        <td class="cell-muted">${esc(p.category)}</td>
        <td class="cell-mono">♥ ${likesOf(p)}</td>
        <td class="cell-mono">${money(p.price)}${p.discount ? ` <span class="cell-muted">(-${p.discount}%)</span>` : ''}</td>
        <td>${stockPill(p)}</td>
        <td>${p.rxRequired ? '<span class="pill pill-teal">RX</span>' : '<span class="cell-muted">—</span>'}</td>
        <td>${productStatusPill(p)}</td>
        <td><div class="row-actions">${pauseBtn(p)}<button class="btn btn-ghost btn-sm" data-edit-product="${p.id}" title="Edit">${icon('edit')}</button><button class="btn btn-ghost btn-sm" data-delete-product="${p.id}" title="Delete">${icon('trash')}</button></div></td>
      </tr>`).join('');
    const cards = list.map(p => `
      <div class="item-card">
        ${productThumb(p, 'item-card-thumb')}
        <div class="item-card-body">
          <div class="item-card-title">${esc(p.name)}</div>
          <div class="item-card-sub">${esc(p.category)} · ${money(p.price)} · ♥ ${likesOf(p)}</div>
          <div class="item-card-meta">${stockPill(p)}${productStatusPill(p)}</div>
          <div class="row-actions" style="margin-top:10px;flex-wrap:wrap">${pauseBtn(p)}<button class="btn btn-ghost btn-sm" data-edit-product="${p.id}" title="Edit">${icon('edit')}<span>Edit</span></button><button class="btn btn-ghost btn-sm" data-delete-product="${p.id}" title="Delete">${icon('trash')}<span>Delete</span></button></div>
        </div>
      </div>`).join('');

    return `
    <div class="page-head">
      <div><h1>Inventory</h1><p class="page-sub">${products.length} products</p></div>
      <div class="page-head-actions"><button class="btn btn-primary" id="addProductBtn">${icon('plus')}<span>Add product</span></button></div>
    </div>
    <div class="toolbar">
      <div class="search-box">${icon('search')}<input type="text" id="invSearch" placeholder="Search medicine or generic name" value="${esc(f.q)}"></div>
    </div>
    <div class="chip-row" style="margin-bottom:16px">
      ${[['all', 'All'], ['low', 'Low stock'], ['out', 'Out of stock'], ['active', 'Active'], ['inactive', 'Paused'], ['pending', 'Drafts & pending']].map(([k, l]) => `<button class="filter-chip${f.status === k ? ' active' : ''}" data-inv-filter="${k}">${l}</button>`).join('')}
    </div>
    <div class="card">
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Product</th><th>Category</th><th>Likes</th><th>Price</th><th>Stock</th><th>RX</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="item-cards" style="padding:10px">${cards}</div>
      ${list.length ? '' : emptyBlock('inventory', 'No products found', 'Try a different search or filter, or add a new product.')}
    </div>`;
  }
  const isApproved = (p) => (p.status || 'approved') === 'approved';
  const isLive = (p) => isApproved(p) && p.active;
  function productThumb(p, cls) {
    const src = (p.images && p.images[0]) || p.image;
    return src ? `<img class="${cls}" src="${src}" alt="">` : `<div class="${cls}"></div>`;
  }
  function productStatusPill(p) {
    if (p.status === 'draft') return '<span class="pill pill-gray">Draft</span>';
    if (p.status === 'pending') return '<span class="pill pill-amber">Pending approval</span>';
    if (p.status === 'rejected') return '<span class="pill pill-red">Rejected</span>';
    if (p.status === 'restricted') return '<span class="pill pill-amber">Restricted</span>';
    return p.active ? '<span class="pill pill-green">Active</span>' : '<span class="pill pill-gray">Paused</span>';
  }
  function stockPill(p) {
    if (p.stock === 0) return '<span class="pill pill-red">Out of stock</span>';
    if (p.stock <= p.minStock) return `<span class="pill pill-amber">Low · ${p.stock}</span>`;
    return `<span class="pill pill-green">${p.stock} in stock</span>`;
  }

  AFTER.inventory = () => {
    document.getElementById('invSearch')?.addEventListener('input', (e) => { state.filters.inventory.q = e.target.value; refreshInventoryOnly(); });
    document.querySelectorAll('[data-inv-filter]').forEach(b => b.addEventListener('click', () => { state.filters.inventory.status = b.dataset.invFilter; refreshInventoryOnly(); }));
    document.getElementById('addProductBtn')?.addEventListener('click', () => navigate('add-product'));
    document.querySelectorAll('[data-edit-product]').forEach(b => b.addEventListener('click', () => navigate('add-product', b.dataset.editProduct)));
    document.querySelectorAll('[data-pause-product]').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.pauseProduct, resume = b.dataset.pauseTo === 'resume';
      if (resume) {
        const p = (await DB.getProducts()).find(x => String(x.id) === String(id));
        if (p && Number(p.stock) <= 0) { showToast('Add stock first — edit the product and set the quantity', 'error'); return; }
      }
      b.disabled = true;
      try { await DB.setProductActive(id, resume); showToast(resume ? 'Product is live again' : 'Product paused — customers can’t order it'); }
      catch (err) { console.error(err); showToast('Could not update this product', 'error'); }
      refreshInventoryOnly();
    }));
    document.querySelectorAll('[data-delete-product]').forEach(b => b.addEventListener('click', async () => {
      const ok = await confirmDialog('Delete this product?', 'This cannot be undone. The product will be removed from your storefront.');
      if (!ok) return;
      try { await DB.deleteProduct(b.dataset.deleteProduct); showToast('Product deleted'); }
      catch (err) { console.error(err); showToast('Could not delete this product', 'error'); }
      refreshInventoryOnly();
    }));
  };
  async function refreshInventoryOnly() {
    try { document.getElementById('pageOutlet').innerHTML = renderInventoryList(await DB.getProducts(), await DB.getCategories()); }
    catch (err) { console.error(err); document.getElementById('pageOutlet').innerHTML = errorBlock('inventory'); return; }
    AFTER.inventory();
  }

  const HEALTH_FOOD = ['Protein Powder', 'Health Drinks', 'Vitamins & Supplements', 'Diabetic Food', 'Energy & Nutrition Bars'];
  const isHealthFood = (d) => d.type === 'grocery';
  const PRODUCT_CATEGORIES = {
    medicine: ['Tablet', 'Capsule', 'Syrup', 'Insulin', 'Injection', 'Cream', 'Ointment', 'Gel', 'Drops', 'Powder', 'Sachet', 'Inhaler', 'Spray', 'Lotion', 'Soap', 'Other'],
    general: ['Tissue & Paper', 'Detergent & Laundry', 'Cleaning Supplies', 'Household Items', 'Other Daily Essentials'],
    personal_care: ['Toothpaste', 'Toothbrush', 'Soap', 'Shampoo', 'Hair Oil', 'Moisturizer', 'Sanitary Products', 'Other'],
    baby_mother: ['Diapers', 'Baby Wipes', 'Baby Lotion', 'Baby Shampoo', 'Baby Soap', 'Maternity Pads', 'Other'],
    nutrition: ['Health Supplement', 'Protein Powder', 'Vitamin & Mineral Supplement', 'ORS', 'Electrolyte Powder', 'Medical Nutrition', 'Diabetic Nutrition', 'Infant Nutrition', 'Nutrition Drink', 'Other'],
    grocery: ['Protein Powder', 'Health Drinks', 'Vitamins & Supplements', 'Diabetic Food', 'Energy & Nutrition Bars'],
    instrument: ['Bandage & Gauze', 'Medical Gloves', 'Mask', 'Diagnostic Equipment', 'BP Monitor', 'Glucometer', 'Thermometer', 'Pulse Oximeter', 'Nebulizer', 'Weighing Scale', 'Stethoscope', 'Surgical Instrument', 'Walking Stick / Crutches', 'First Aid & Dressing', 'Syringe & Needle', 'Hearing Aid', 'Other Medical Equipment']
  };
  const PRODUCT_UNITS = {
    medicine: ['Strip', 'Bottle', 'Tube', 'Box', 'Vial', 'Sachet', 'Pcs', 'Set', 'Combo'],
    instrument: ['Piece', 'Pcs', 'Set', 'Pair', 'Box', 'Unit', 'Combo'],
    general: ['Pcs', 'Pack', 'Bottle', 'Box', 'Tube', 'Sachet', 'Set', 'Combo'],
    personal_care: ['Pcs', 'Pack', 'Bottle', 'Box', 'Tube', 'Sachet', 'Set', 'Combo'],
    baby_mother: ['Pack', 'Pcs', 'Box', 'Bottle', 'Tube', 'Sachet', 'Set', 'Combo'],
    nutrition: ['Pack', 'Box', 'Bottle', 'Jar', 'Tin', 'Pouch', 'Sachet', 'Pcs', 'Set', 'Combo'],
    grocery: ['Pcs', 'Pack', 'Bottle', 'Box', 'Sachet', 'Set', 'Combo']
  };
  const PRODUCT_TYPE_CARDS = {
    medicine: { ico: 'pill', title: 'Medicines', sub: 'Prescription and OTC medicines — tablets, capsules, syrups, insulin' },
    instrument: { ico: 'steth', title: 'Medical Devices & Instruments', sub: 'Bandages, gloves, masks, thermometers, BP monitors, nebulizers' },
    personal_care: { ico: 'tag', title: 'Personal Care & Hygiene', sub: 'Toothpaste, soap, shampoo, hair oil, moisturizer, sanitary products' },
    baby_mother: { ico: 'users', title: 'Baby & Mother Care', sub: 'Diapers, baby wipes, baby lotion, shampoo, soap, maternity pads' },
    nutrition: { ico: 'box', title: 'Medical Nutrition & Supplements', sub: 'Supplements, protein, vitamins, ORS, electrolytes, medical nutrition' },
    general: { ico: 'store', title: 'Daily Essentials', sub: 'Tissue, detergent and general household products' },
    grocery: { ico: 'box', title: 'Health Food', sub: 'Protein powder, health drinks, vitamins & supplements, diabetic food, nutrition bars (health-related only)' }
  };
  const WARRANTY_OPTIONS = ['No Warranty', '3 Months', '6 Months', '1 Year', '2 Years', '5 Years'];
  const GST_RATES = ['0', '5', '12', '18', '28'];

  /* ---- wizard steps (some are skipped for some product types) ---- */
  const ALL_STEPS = [
    { key: 'type' }, { key: 'basic' }, { key: 'details', skip: ['medicine'] }, { key: 'batch' },
    { key: 'price' }, { key: 'combo' }, { key: 'compliance', skip: ['general', 'grocery'] }, { key: 'images' }, { key: 'review' }
  ];
  const stepsFor = (type) => ALL_STEPS.filter(s => !(s.skip && s.skip.includes(type)));
  const STEP_TEXT = {
    type: { _: ['Product type', 'What are you selling?'] },
    basic: {
      _: ['Product information', 'The name, brand and details customers see first.'],
      instrument: ['Device identification', 'Name, brand, model and intended use.'],
      medicine: ['Product information', 'Medicine type, name, composition, strength and pack.']
    },
    details: {
      _: ['Pack details', 'Pack size and weight.'],
      instrument: ['Technical specifications', 'Only the fields that apply to this device type are shown.'],
      personal_care: ['Product specifications', 'Quantity, ingredients and usage — match the label.'],
      baby_mother: ['Product details', 'Fields change with the product type you chose.'],
      nutrition: ['Pack & composition', 'Ingredients, nutrition, directions and warnings — match the label.']
    },
    batch: {
      _: ['Batch & shelf life', 'Add each batch with its own expiry and quantity. Stock is the total of all batches.'],
      medicine: ['Batch & expiry', 'Add each batch with its own expiry and quantity. Stock is the total of all batches.'],
      instrument: ['Serial & batch', 'Serial, batch and expiry only where they apply to this device.'],
      general: ['Batch & expiry', 'Batch, expiry and quantity. Stock is the total of all batches.'],
      grocery: ['Batch & expiry', 'Batch, expiry and quantity. Stock is the total of all batches.']
    },
    price: { _: ['Pricing & inventory', 'MRP, selling price, unit of sale and stock alert.'] },
    combo: { _: ['Combo pack (optional)', 'Selling two products together? Turn it on and fill each product’s own details.'] },
    compliance: {
      _: ['Compliance', 'Regulatory details. Admin reviews the product separately from your KYC.'],
      medicine: ['Regulatory & compliance', 'Licence, classification and optional product information.'],
      instrument: ['Warranty & compliance', 'Warranty, service and regulatory details.']
    },
    images: { _: ['Images & documents', 'Clear photos of the pack and label. Documents are optional.'] },
    review: { _: ['Review & publish', 'Check everything before it goes for approval.'] }
  };
  function stepMeta(key, type) {
    const t = STEP_TEXT[key] || { _: [key, ''] };
    const v = t[type] || t._;
    return { key, title: v[0], desc: v[1] };
  }
  const STEP_NOTES = {
    'medicine.compliance': 'Prescription and OTC classification must follow verified product information and applicable law. Medicines go for review only after your Drug Licence is verified.',
    'instrument.compliance': 'Warranty and replacement terms are shown clearly to customers. Licences and documents are verified by admin before sale.',
    'personal_care.compliance': 'Ingredients, quantity, warnings and shelf life must match the actual label. Do not make unverified medical or therapeutic claims.',
    'baby_mother.details': 'Size, weight range, ingredients and age suitability must match the manufacturer’s label. Infant food and nutrition belong in Medical Nutrition & Supplements.',
    'baby_mother.compliance': 'Ingredients, age suitability and safety warnings must match the actual product. Do not make unverified medical claims.',
    'grocery.basic': 'Only health-related food is allowed: protein powder, health drinks, vitamins & supplements, diabetic food and nutrition bars. Ordinary grocery, biscuits and snacks are not allowed.',
    'nutrition.basic': 'Only medical-related nutrition and health supplements are allowed here. Ordinary grocery items (rice, lentils, cooking oil, snacks) are not allowed.',
    'nutrition.compliance': 'Rules depend on how the product is classified — not every supplement is a medicine. Do not make unverified disease-treatment claims.',
    'medicine.batch': 'Purchase price is visible only to you. Expired batches cannot be put on sale.'
  };

  const IMAGE_SLOTS_BY_TYPE = {
    medicine: ['Front packaging', 'Back label', 'Composition / ingredient label', 'Other label / packaging'],
    instrument: ['Front product image', 'Back / label image', 'Model / serial label image', 'Package contents image'],
    personal_care: ['Front product image', 'Back label image', 'Ingredients label image', 'Packaging image'],
    baby_mother: ['Front product image', 'Back label image', 'Ingredients / materials label', 'Packaging image'],
    nutrition: ['Front pack image', 'Back label image', 'Ingredients / nutrition label', 'Batch / expiry label'],
    _: ['Main photo', 'Side / back photo', 'Composition / detail photo', 'MRP / price photo']
  };
  const DOC_SLOTS_BY_TYPE = {
    medicine: ['Applicable product document', 'Supporting document'],
    instrument: ['User manual (PDF)', 'Warranty / regulatory document'],
    personal_care: ['Regulatory / licence document', 'Other product document'],
    baby_mother: ['Regulatory / licence document', 'Other product document'],
    nutrition: ['Licence / supporting document', 'Other product document']
  };

  /* ---- field definitions (top:true → stored in a main product column; otherwise in the extra details) ---- */
  const fT = (k, l, o) => ({ t: 'text', k, l, ...o });
  const fS = (k, l, opts, o) => ({ t: 'select', k, l, opts, ...o });
  const fN = (k, l, o) => ({ t: 'number', k, l, ...o });
  const fA = (k, l, o) => ({ t: 'area', k, l, ...o });
  const fRO = (l, v) => ({ t: 'ro', l, v });
  const catIs = (...c) => (d) => c.includes(d.category);
  const adminStatus = (d) => ({
    draft: 'Not submitted yet — admin reviews it after you submit', pending: 'Pending admin review', approved: 'Approved by admin',
    rejected: 'Rejected — update and submit again', restricted: 'Restricted by admin'
  }[d.status] || 'Pending admin review');
  const DEV_ELEC = ['BP Monitor', 'Glucometer', 'Thermometer', 'Pulse Oximeter', 'Nebulizer', 'Weighing Scale', 'Diagnostic Equipment', 'Hearing Aid'];
  const DEV_MEAS = ['BP Monitor', 'Glucometer', 'Thermometer', 'Pulse Oximeter', 'Weighing Scale', 'Diagnostic Equipment'];
  const inCat = (list) => (d) => !d.category || list.includes(d.category);
  const notCat = (list) => (d) => !d.category || !list.includes(d.category);
  const BABY_LOT = ['Baby Lotion', 'Baby Shampoo', 'Baby Soap'];
  const babyOther = (d) => !d.category || d.category === 'Other';
  const identityTail = [fT('country', 'Country of origin', { hint: '(where applicable)' }), fT('sku', 'Product code / SKU'), fT('barcode', 'Barcode / GTIN')];
  const careBatchExtra = [
    fA('storage', 'Storage instructions', { top: true }),
    fT('shelfLife', 'Shelf life', { ph: 'e.g. 24 months', hint: '(where applicable)' })
  ];
  const careCompliance = [
    fRO('Applicable product category', (d) => d.category || '—'),
    fT('licenceReg', 'Licence / registration details', { hint: '(where required)' }),
    fA('mfrDetails', 'Manufacturer / importer details'),
    fA('labelInfo', 'Product label information'),
    fRO('Admin verification status', adminStatus)
  ];
  const plainForm = {
    basic: [
      fT('name', 'Product name', { top: true, req: true }), fT('generic', 'Generic name', { top: true }),
      fT('brand', 'Brand / Manufacturer', { top: true, req: true }), fS('category', 'Category', null, { top: true, req: true }),
      fT('subCategory', 'Sub category', { top: true }), fA('description', 'Product description', { top: true, hint: '(optional)' })
    ],
    details: [
      fT('packSize', 'Pack size', { top: true, ph: 'e.g. 500 ml / 6 pcs · Combo: 1 soap + 1 shampoo (2 pcs)' }),
      fN('weight', 'Weight (kg)', { top: true, hint: '(optional)', step: '0.001' })
    ],
    batchExtra: [fA('storage', 'Storage / usage instructions', { top: true, hint: '(optional)' })]
  };
  const FORMS = {
    medicine: {
      basic: [
        fS('medicineType', 'Medicine type', ['Prescription', 'OTC'], { req: true }),
        fT('name', 'Medicine name', { top: true, req: true }),
        fT('brand', 'Brand name', { top: true, req: true }),
        fT('generic', 'Generic name', { top: true }),
        fA('composition', 'Active ingredient / composition', { top: true, req: true }),
        fT('strength', 'Strength', { top: true, ph: 'e.g. 500 mg' }),
        fS('dosageForm', 'Dosage form', ['Tablet', 'Capsule', 'Syrup', 'Cream', 'Drops', 'Other'], { top: true }),
        fT('packSize', 'Pack size', { top: true, ph: 'e.g. 10 tablets / 100 ml · Combo: 3 pcs' }),
        fT('manufacturer', 'Manufacturer name', { req: true }),
        fT('marketer', 'Marketer name'),
        fS('category', 'Category', null, { top: true, req: true }),
        fT('subCategory', 'Sub category', { top: true })
      ],
      batchExtra: [fA('storage', 'Storage instructions', { top: true, ph: 'e.g. Store below 25 °C, away from sunlight' })],
      compliance: [
        fRO('Drug licence reference', () => { const l = (state.merchant && state.merchant.license) || {}; return l.number ? `${l.number} · ${l.status || 'unverified'}` : 'Not added — add your Drug Licence in KYC'; }),
        fS('licenceType', 'Applicable drug licence type', ['Retail drug licence', 'Wholesale drug licence', 'Restricted licence', 'Other']),
        fRO('Prescription required', (d) => (d.rxRequired ? 'Yes (from the medicine type)' : 'No — OTC (from the medicine type)')),
        fS('schedule', 'Schedule / regulatory classification', ['Not applicable', 'Schedule G', 'Schedule H', 'Schedule H1', 'Schedule X', 'Other']),
        fS('pharmacist', 'Pharmacist verification', ['Not applicable', 'Verified by registered pharmacist']),
        fT('barcode', 'Barcode / GTIN', { hint: '(optional)' }),
        fT('mfrCode', 'Manufacturer product code', { hint: '(optional)' }),
        fT('specialStorage', 'Special storage requirements', { hint: '(optional)' }),
        fA('description', 'Product description', { top: true, hint: '(optional)' }),
        fA('sideEffects', 'Side effects / warnings', { top: true, hint: '(optional)' })
      ]
    },
    instrument: {
      basic: [
        fS('category', 'Device type', null, { top: true, req: true }),
        fT('name', 'Product name', { top: true, req: true }),
        fT('brand', 'Brand name', { top: true, req: true }),
        fT('manufacturer', 'Manufacturer name', { req: true }),
        fT('importer', 'Importer name', { hint: '(if applicable)' }),
        fT('modelNumber', 'Model number', { top: true, req: true }),
        fT('sku', 'Product code / SKU'),
        fT('barcode', 'Barcode / GTIN'),
        fT('country', 'Country of origin', { hint: '(where applicable)' }),
        fA('intendedUse', 'Intended use', { req: true })
      ],
      details: [
        fT('range', 'Measurement range', { top: true, show: inCat(DEV_MEAS) }),
        fT('accuracy', 'Accuracy specification', { show: inCat(DEV_MEAS) }),
        fS('powerSource', 'Power source', ['Battery', 'Rechargeable', 'Electric', 'Manual'], { show: inCat(DEV_ELEC) }),
        fT('battery', 'Battery details', { top: true, ph: 'e.g. 2 × AAA', show: inCat(DEV_ELEC) }),
        fS('connectivity', 'Connectivity', ['None', 'Bluetooth', 'USB', 'Wi-Fi'], { show: inCat(DEV_ELEC) }),
        fT('display', 'Display', { top: true, ph: 'e.g. LCD / Digital', show: inCat(DEV_ELEC) }),
        fT('dimensions', 'Dimensions', { ph: 'e.g. 12 × 8 × 4 cm' }),
        fN('weight', 'Product weight (kg)', { top: true, step: '0.001' }),
        fT('material', 'Material', { show: notCat(DEV_ELEC) }),
        fT('color', 'Colour', { top: true }),
        fT('accessories', 'Compatible accessories', { show: inCat(DEV_ELEC) }),
        fA('packageContents', 'Package contents'),
        fT('shortDesc', 'Short description'),
        fA('description', 'Detailed description', { top: true }),
        fA('keyFeatures', 'Key features'),
        fA('techSpecs', 'Technical specifications'),
        fA('usage', 'Usage instructions'),
        fA('care', 'Storage instructions', { top: true, hint: '(where applicable)' })
      ],
      batchExtra: [],
      compliance: [
        fS('warranty', 'Warranty duration', WARRANTY_OPTIONS, { top: true }),
        fT('warrantyProvider', 'Warranty provider', { req: (d) => !!d.warranty && d.warranty !== 'No Warranty' }),
        fA('serviceCentre', 'Service centre details', { hint: '(if applicable)' }),
        fS('installation', 'Installation required', ['No', 'Yes']),
        fA('afterSales', 'After-sales support details'),
        fA('replacementTerms', 'Replacement terms', { hint: '(shown to customers)' }),
        fS('deviceClass', 'Medical device classification', ['Class A (low risk)', 'Class B (low-moderate risk)', 'Class C (moderate-high risk)', 'Class D (high risk)', 'Not classified / not applicable'], { req: true }),
        fT('regNumber', 'Licence / registration details', { ph: 'e.g. CDSCO registration no.' }),
        fT('regMarking', 'Regulatory marking / product label'),
        fA('instructionsForUse', 'Instructions for use'),
        fA('safetyWarnings', 'Safety warnings'),
        fRO('Admin verification status', adminStatus)
      ]
    },
    personal_care: {
      basic: [
        fS('category', 'Product type', null, { top: true, req: true }),
        fT('name', 'Product name', { top: true, req: true }),
        fT('brand', 'Brand name', { top: true, req: true }),
        fT('variant', 'Product variant / fragrance'),
        fT('manufacturer', 'Manufacturer name', { req: true }),
        ...identityTail,
        fA('description', 'Product description', { top: true })
      ],
      details: [
        fN('netQty', 'Net quantity / weight / volume', { req: true, step: '0.01' }),
        fS('netUnit', 'Unit', ['g', 'kg', 'ml', 'L', 'Piece', 'Pack'], { req: true }),
        fT('packSize', 'Pack size', { top: true, ph: 'e.g. 100 g / 6 pcs · Combo: 1 soap + 1 shampoo (2 pcs)' }),
        fT('skinType', 'Skin type / hair type', { hint: '(where applicable)' }),
        fA('composition', 'Ingredients / composition', { top: true, hint: '(where applicable)' }),
        fT('material', 'Material', { hint: '(where applicable)' }),
        fA('intendedUse', 'Intended use'),
        fA('usage', 'Usage instructions'),
        fA('warnings', 'Safety warnings / allergen information', { hint: '(where applicable)' })
      ],
      batchExtra: careBatchExtra,
      compliance: careCompliance
    },
    baby_mother: {
      basic: [
        fS('category', 'Product type', null, { top: true, req: true }),
        fT('name', 'Product name', { top: true, req: true }),
        fT('brand', 'Brand name', { top: true, req: true }),
        fT('variant', 'Product variant'),
        fT('manufacturer', 'Manufacturer name', { req: true }),
        ...identityTail,
        fA('description', 'Product description', { top: true })
      ],
      details: [
        fS('diaperType', 'Diaper type', ['Tape', 'Pant'], { req: true, show: catIs('Diapers') }),
        fS('size', 'Size', ['Newborn', 'S', 'M', 'L', 'XL', 'XXL', 'Other'], { req: true, show: catIs('Diapers', 'Maternity Pads') }),
        fT('weightRange', 'Recommended weight range', { req: true, hint: '(as per label)', ph: 'e.g. 4–8 kg', show: catIs('Diapers') }),
        fN('piecesPerPack', 'Pieces per pack', { req: true, show: catIs('Diapers', 'Maternity Pads') }),
        fS('dayNight', 'Day / night use', ['Day', 'Night', 'Day & Night'], { show: catIs('Diapers') }),
        fT('material', 'Material / skin contact information', { show: catIs('Diapers', 'Maternity Pads') }),
        fN('wipesCount', 'Wipes count', { req: true, show: catIs('Baby Wipes') }),
        fT('packSize', 'Pack size', { top: true, ph: 'e.g. 3 packs × 72 wipes', show: (d) => d.category === 'Baby Wipes' || babyOther(d) }),
        fS('fragranceType', 'Fragrance', ['Fragrance-free', 'Fragranced'], { show: catIs('Baby Wipes') }),
        fN('netQty', 'Net weight / volume', { req: true, step: '0.01', show: catIs(...BABY_LOT) }),
        fS('netUnit', 'Unit', ['g', 'kg', 'ml', 'L'], { req: true, show: catIs(...BABY_LOT) }),
        fA('composition', 'Ingredients', { top: true, show: (d) => !catIs('Diapers', 'Maternity Pads')(d) }),
        fT('ageSuitability', 'Age suitability', { req: true, hint: '(as per label)', show: catIs(...BABY_LOT) }),
        fT('skinType', 'Skin / hair type', { hint: '(where applicable)', show: catIs(...BABY_LOT) }),
        fT('fragrance', 'Fragrance / variant', { show: catIs('Diapers', ...BABY_LOT) }),
        fT('absorbency', 'Absorbency / specification', { hint: '(where applicable)', show: catIs('Maternity Pads') }),
        fA('intendedUse', 'Intended use', { show: catIs('Baby Wipes', 'Maternity Pads') }),
        fA('usage', 'Usage instructions', { show: (d) => !catIs('Diapers', 'Baby Wipes')(d) }),
        fA('warnings', 'Safety warnings', { show: (d) => !catIs('Diapers', 'Maternity Pads')(d) })
      ],
      batchExtra: careBatchExtra,
      compliance: careCompliance
    },
    nutrition: {
      basic: [
        fS('category', 'Product type', null, { top: true, req: true }),
        fT('name', 'Product name', { top: true, req: true }),
        fT('brand', 'Brand name', { top: true, req: true }),
        fT('variant', 'Product variant / flavour'),
        fT('manufacturer', 'Manufacturer name', { req: true }),
        fT('marketer', 'Importer / marketer name'),
        fT('country', 'Country of origin', { req: true }),
        fT('sku', 'SKU / product code'),
        fT('barcode', 'Barcode / GTIN'),
        fA('description', 'Product description', { top: true })
      ],
      details: [
        fS('dosageForm', 'Form', ['Powder', 'Tablet', 'Capsule', 'Syrup', 'Liquid', 'Sachet', 'Ready-to-Drink', 'Other'], { top: true, req: true }),
        fT('packSize', 'Net quantity / pack size', { top: true, req: true, ph: 'e.g. 500 g / 30 tablets' }),
        fN('weight', 'Net weight (kg)', { top: true, hint: '(optional)', step: '0.001' }),
        fN('unitsPerPack', 'Units per pack'),
        fA('composition', 'Ingredients / composition', { top: true, req: true }),
        fA('nutritionInfo', 'Nutritional information (as per label)', { req: true }),
        fA('allergens', 'Allergen information'),
        fT('ageGroup', 'Recommended age group', { hint: '(as per label)' }),
        fA('directions', 'Directions for use (as per label)', { req: true }),
        fA('warnings', 'Safety warnings / contraindications (as per label)')
      ],
      batchExtra: [fA('storage', 'Storage instructions', { top: true })],
      compliance: [
        fS('regCategory', 'Regulatory category', ['Health supplement / nutraceutical (FSSAI)', 'Food for special medical purpose (FSSAI)', 'Infant / baby nutrition (FSSAI)', 'ORS / electrolyte (FSSAI)', 'Regulated as a drug (Drug licence)', 'Other'], { req: true }),
        fT('fssai', 'FSSAI licence / registration number', { req: (d) => !/drug/i.test((d.x || {}).regCategory || ''), hint: '(for food / supplement products)' }),
        fT('drugApproval', 'Drug licence / approval', { req: (d) => /drug/i.test((d.x || {}).regCategory || ''), hint: '(where legally required)' }),
        fA('mfrDetails', 'Manufacturer / importer details'),
        fRO('Admin verification status', adminStatus)
      ]
    },
    general: plainForm,
    grocery: {
      ...plainForm,
      details: [
        fT('packSize', 'Pack size', { top: true, ph: 'e.g. 500 g / 6 pcs · Combo: 1 protein bar + 1 health drink (2 pcs)' }),
        fN('weight', 'Net weight (kg)', { top: true, hint: '(optional)', step: '0.001' }),
        fA('composition', 'Ingredients / composition', { top: true, req: isHealthFood }),
        fA('nutritionInfo', 'Nutritional information (as per label)', { req: isHealthFood }),
        fA('allergens', 'Allergen information'),
        fS('vegType', 'Veg / Non-veg', ['Veg', 'Non-veg']),
        fT('ageGroup', 'Recommended age group', { hint: '(as per label)', show: isHealthFood }),
        fA('directions', 'Directions for use (as per label)', { req: isHealthFood, show: isHealthFood }),
        fT('fssai', 'FSSAI licence / registration number', { req: isHealthFood, show: isHealthFood }),
        fT('shelfLife', 'Shelf life', { ph: 'e.g. 12 months', hint: '(where applicable)' }),
        fA('warnings', 'Safety warnings / precautions', { hint: '(where applicable)' })
      ]
    }
  };
  const formFields = (d, key) => {
    const F = (FORMS[d.type] || {})[key] || [];
    return F.map(f => (f.k === 'category' ? { ...f, opts: PRODUCT_CATEGORIES[d.type] || [] } : f));
  };

  /* ---- draft helpers ---- */
  const expiryRequired = (d) => ['medicine', 'nutrition', 'grocery'].includes(d.type);
  function blankProduct() {
    return {
      id: null, type: '', name: '', generic: '', brand: '', category: '', subCategory: '', description: '',
      images: ['', '', '', ''], docs: [{ url: '', name: '' }, { url: '', name: '' }], x: {}, batches: [blankBatch()],
      unitType: '', dosageForm: '', strength: '', packSize: '',
      modelNumber: '', color: '', deviceType: '', display: '', battery: '', range: '',
      mrp: '', price: '', stock: '', minStock: 5,
      composition: '', rxRequired: false, batchNo: '', mfd: '', expiry: '', lotNo: '', storage: '',
      warranty: 'No Warranty', care: '',
      gst: '', hsn: '', weight: '', sideEffects: '',
      returnable: false, returnDays: '', exchangeable: false, exchangeDays: '',
      isCombo: false, combo: [blankComboItem(), blankComboItem()],
      active: true, status: 'draft'
    };
  }
  function blankComboItem() { return { type: '', category: '', x: {} }; }
  function syncFromBatches(d) {
    const bs = (d.batches || []).filter(Boolean);
    const filled = bs.filter(b => b.qty !== '' && b.qty != null);
    d.stock = filled.length ? filled.reduce((s, b) => s + (Number(b.qty) || 0), 0) : '';
    const live = bs.filter(b => Number(b.qty) > 0);
    const pool = (live.length ? live : bs).filter(b => b.expiry).sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)));
    const first = pool[0] || bs[0] || {};
    d.expiry = first.expiry || ''; d.mfd = first.mfd || ''; d.batchNo = first.batchNo || ''; d.lotNo = first.lotNo || '';
  }
  function productToDraft(p) {
    const d = { ...blankProduct(), ...p };
    d.type = p.type || 'medicine';
    d.brand = p.brand || p.manufacturer || '';
    d.status = p.status || 'approved';
    const disc = Number(p.discount || 0);
    d.mrp = p.mrp != null ? p.mrp : (disc > 0 && disc < 100 ? Math.round(p.price / (1 - disc / 100)) : p.price);
    const imgs = (p.images && p.images.length ? p.images : (p.image ? [p.image] : [])).slice(0, 4);
    d.images = [0, 1, 2, 3].map(i => imgs[i] || '');
    d.warranty = p.warranty || 'No Warranty';
    d.minStock = p.minStock != null ? p.minStock : 5;
    d.x = { ...(p.x || {}) };
    if (d.type === 'medicine' && !d.x.medicineType) d.x.medicineType = d.rxRequired ? 'Prescription' : 'OTC';
    d.batches = (p.batches && p.batches.length ? p.batches : [blankBatch()]).map(b => ({ ...blankBatch(), ...b }));
    d.docs = [0, 1].map(i => ({ url: '', name: '', ...((p.docs && p.docs[i]) || {}) }));
    d.isCombo = !!p.isCombo;
    d.combo = [0, 1].map(i => { const it = (p.combo && p.combo[i]) || {}; return { type: it.type || '', category: it.category || '', x: { ...(it.x || {}) } }; });
    syncFromBatches(d);
    return d;
  }
  const calcDiscount = (mrp, price) => {
    mrp = Number(mrp); price = Number(price);
    return mrp > 0 && price >= 0 && price <= mrp ? Math.round((mrp - price) / mrp * 1000) / 10 : 0;
  };
  function draftToProduct(d, status) {
    syncFromBatches(d);
    return {
      ...d, status,
      manufacturer: (d.x && d.x.manufacturer) || d.brand,
      mrp: Number(d.mrp) || 0, price: Number(d.price) || 0,
      discount: calcDiscount(d.mrp, d.price),
      stock: Number(d.stock) || 0, minStock: Number(d.minStock) || 0,
      image: d.images[0] || ''
    };
  }
  const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const todayISO = () => new Date().toISOString().slice(0, 10);

  const pField = (name, label, val, o = {}) => `
    <label class="field"><span>${label}${o.hint ? ` <span class="field-hint">${o.hint}</span>` : ''}</span>
      <input type="${o.type || 'text'}" name="${name}" value="${esc(val)}"${o.req ? ' required' : ''}${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${o.attrs ? ' ' + o.attrs : ''}>
    </label>`;
  const pSelect = (name, label, list, val, req) => {
    const opts = list.includes(val) || !val ? list : [val, ...list];
    return `<label class="field"><span>${label}</span>
      <select name="${name}"${req ? ' required' : ''}><option value="">Select…</option>${opts.map(o => `<option value="${esc(o)}"${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>
    </label>`;
  };
  const pArea = (name, label, val, ph) => `<label class="field"><span>${label}</span><textarea name="${name}" rows="3"${ph ? ` placeholder="${esc(ph)}"` : ''}>${esc(val)}</textarea></label>`;

  const returnBlockHtml = (d) => `
    <div class="field" style="margin-top:14px"><span>Return / replacement policy <span class="field-hint">(where permitted · optional)</span></span></div>
    <div class="form-row two">
      <label class="field checkbox-field"><input type="checkbox" name="returnable"${d.returnable ? ' checked' : ''}><span>Returnable / refund</span></label>
      ${pField('returnDays', 'Return window (days)', d.returnDays, { type: 'number', attrs: 'min="1" max="30" step="1" inputmode="numeric"' })}
    </div>
    <div class="form-row two">
      <label class="field checkbox-field"><input type="checkbox" name="exchangeable"${d.exchangeable ? ' checked' : ''}><span>Replaceable / exchangeable</span></label>
      ${pField('exchangeDays', 'Replacement window (days)', d.exchangeDays, { type: 'number', attrs: 'min="1" max="30" step="1" inputmode="numeric"' })}
    </div>`;

  /* generic field renderer for the schema above */
  const fieldVal = (d, f) => (f.top ? d[f.k] : (d.x || {})[f.k]);
  const fieldReq = (d, f) => (typeof f.req === 'function' ? !!f.req(d) : !!f.req);
  function fieldHtml(d, f) {
    if (f.t === 'ro') return `<div class="calc-box"><span>${esc(f.l)}</span><b>${esc(f.v(d))}</b></div>`;
    const req = fieldReq(d, f);
    const name = f.top ? f.k : 'x.' + f.k;
    const v = fieldVal(d, f);
    const val = v == null ? '' : v;
    const lab = esc(f.l) + (req ? '*' : '');
    const hint = f.hint ? ` <span class="field-hint">${f.hint}</span>` : '';
    if (f.t === 'select') return pSelect(name, lab + hint, f.opts || [], String(val), req);
    if (f.t === 'area') return pArea(name, lab + hint, val, f.ph);
    const attrs = f.t === 'number' ? `min="0" step="${f.step || '1'}" inputmode="decimal"` : '';
    return pField(name, lab, val, { type: f.t === 'number' ? 'number' : 'text', req, hint: f.hint, ph: f.ph, attrs });
  }
  function renderFields(d, fields) {
    let html = '', buf = [];
    const flush = () => { if (buf.length) { html += buf.length === 2 ? `<div class="form-row two">${buf.join('')}</div>` : buf[0]; buf = []; } };
    fields.forEach(f => {
      if (f.show && !f.show(d)) return;
      const h = fieldHtml(d, f);
      if (f.t === 'area' || f.t === 'ro') { flush(); html += h; } else { buf.push(h); if (buf.length === 2) flush(); }
    });
    flush();
    return html;
  }
  function missingRequired(d, key) {
    const miss = [];
    formFields(d, key === 'batch' ? 'batchExtra' : key).forEach(f => {
      if (f.t === 'ro' || (f.show && !f.show(d)) || !fieldReq(d, f)) return;
      const v = fieldVal(d, f);
      if (v == null || String(v).trim() === '') miss.push(f.l);
    });
    return miss;
  }

  function batchHtml(d) {
    const inst = d.type === 'instrument', reqExp = expiryRequired(d);
    const cards = d.batches.map((b, i) => `
      <div class="batch-card" style="border:1px solid rgba(128,128,128,.28);border-radius:12px;padding:12px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <b>${inst ? 'Item / batch' : 'Batch'} ${i + 1}</b>
          ${d.batches.length > 1 ? `<button type="button" class="btn btn-ghost btn-sm" data-del-batch="${i}">Remove</button>` : ''}
        </div>
        <div class="form-row two">
          ${inst ? pField(`b${i}.serial`, 'Serial number', b.serial, { hint: '(where applicable)' }) : pField(`b${i}.lotNo`, 'Lot number', b.lotNo, { hint: '(optional)' })}
          ${pField(`b${i}.batchNo`, 'Batch number', b.batchNo, { hint: '(optional)' })}
        </div>
        <div class="form-row two">
          ${pField(`b${i}.mfd`, 'Manufacturing date', b.mfd, { type: 'date', hint: '(optional)' })}
          ${pField(`b${i}.expiry`, reqExp ? 'Expiry / best before*' : 'Expiry / best before', b.expiry, { type: 'date', req: reqExp, hint: reqExp ? '' : '(if applicable)' })}
        </div>
        <div class="form-row two">
          ${pField(`b${i}.qty`, 'Quantity in this batch*', b.qty, { type: 'number', req: true, attrs: 'min="0" step="1" inputmode="numeric"' })}
          ${pField(`b${i}.cost`, 'Purchase price (₹)', b.cost, { type: 'number', hint: '(only you can see this)', attrs: 'min="0" step="0.01" inputmode="decimal"' })}
        </div>
      </div>`).join('');
    return `${cards}<button type="button" class="btn btn-outline btn-sm" data-add-batch>${icon('plus')}<span>Add another batch</span></button>
      <div class="calc-box" style="margin-top:12px"><span>Total stock (all batches)</span><b>${d.stock === '' ? '—' : esc(d.stock)}</b></div>`;
  }
  function priceHtml(d) {
    return `
      <div class="form-row two">
        ${pField('mrp', 'MRP (₹)*', d.mrp, { type: 'number', req: true, attrs: 'min="0" step="0.01" inputmode="decimal"' })}
        ${pField('price', 'Selling price (₹)*', d.price, { type: 'number', req: true, attrs: 'min="0" step="0.01" inputmode="decimal"' })}
      </div>
      <div class="calc-box" id="pwDiscount">${discountLabel(d.mrp, d.price)}</div>
      <div class="form-row two">
        <label class="field"><span>Stock quantity <span class="field-hint">(from your batches)</span></span><input type="number" value="${esc(d.stock)}" readonly tabindex="-1"></label>
        ${pField('minStock', 'Low stock alert quantity', d.minStock, { type: 'number', attrs: 'min="0" step="1" inputmode="numeric"' })}
      </div>
      <div class="form-row two">
        ${pSelect('unitType', 'Unit of sale', PRODUCT_UNITS[d.type] || PRODUCT_UNITS.general, d.unitType)}
        ${pSelect('gst', 'GST rate (%)', GST_RATES, String(d.gst))}
      </div>
      ${pField('hsn', 'HSN code', d.hsn, { hint: '(optional)', attrs: 'maxlength="8" inputmode="numeric"' })}
      ${returnBlockHtml(d)}`;
  }

  /* ---- combo pack: 2 products, each with the inputs of its own product type ---- */
  const COMBO_SKIP = ['name', 'brand', 'category', 'subCategory', 'description', 'sku', 'barcode', 'country', 'marketer', 'importer', 'mfrCode'];
  function comboFieldsFor(type) {
    const F = FORMS[type] || {}, seen = {}, out = [];
    [...(F.basic || []), ...(F.details || []), ...((F.compliance || []).filter(f => ['sideEffects', 'safetyWarnings'].includes(f.k)))].forEach(f => {
      if (f.t === 'ro' || COMBO_SKIP.includes(f.k) || seen[f.k]) return;
      seen[f.k] = 1; out.push(f);
    });
    return out;
  }
  const comboPd = (it) => ({ type: it.type, category: it.category, x: it.x || {}, name: (it.x || {}).name, brand: (it.x || {}).brand });
  function comboFieldHtml(pd, f, i) {
    const req = fieldReq(pd, f), name = `c${i}.${f.k}`;
    const v = (pd.x || {})[f.k], val = v == null ? '' : v;
    const lab = esc(f.l) + (req ? '*' : '');
    const hint = f.hint ? ` <span class="field-hint">${f.hint}</span>` : '';
    if (f.t === 'select') return pSelect(name, lab + hint, f.opts || [], String(val), req);
    if (f.t === 'area') return pArea(name, lab + hint, val, f.ph);
    const attrs = f.t === 'number' ? `min="0" step="${f.step || '1'}" inputmode="decimal"` : '';
    return pField(name, lab, val, { type: f.t === 'number' ? 'number' : 'text', req, hint: f.hint, ph: f.ph, attrs });
  }
  function comboRowsHtml(pd, fields, i) {
    let html = '', buf = [];
    const flush = () => { if (buf.length) { html += buf.length === 2 ? `<div class="form-row two">${buf.join('')}</div>` : buf[0]; buf = []; } };
    fields.forEach(f => {
      if (f.show && !f.show(pd)) return;
      const h = comboFieldHtml(pd, f, i);
      if (f.t === 'area') { flush(); html += h; } else { buf.push(h); if (buf.length === 2) flush(); }
    });
    flush();
    return html;
  }
  function comboItemHtml(d, it, i, allowed) {
    const t = it.type, x = it.x || {}, pd = comboPd(it), fields = comboFieldsFor(t), reqExp = expiryRequired({ type: t });
    const hasWeight = fields.some(f => f.k === 'weight') || t === 'medicine';
    return `
      <div class="batch-card" style="border:1px solid rgba(128,128,128,.28);border-radius:12px;padding:12px;margin-bottom:14px">
        <div style="margin-bottom:8px"><b>Combo product ${i + 1}</b></div>
        <div class="form-row two">
          <label class="field"><span>Product type*</span>
            <select name="c${i}.type" data-combo-type="${i}" required>${allowed.map(k => `<option value="${k}"${k === t ? ' selected' : ''}>${esc(PRODUCT_TYPE_CARDS[k].title)}</option>`).join('')}</select>
          </label>
          ${pSelect(`c${i}.category`, 'Category*', PRODUCT_CATEGORIES[t] || [], it.category, true)}
        </div>
        <div class="form-row two">
          ${pField(`c${i}.name`, 'Product name*', x.name, { req: true })}
          ${pField(`c${i}.brand`, 'Brand name*', x.brand, { req: true })}
        </div>
        ${comboRowsHtml(pd, fields, i)}
        <div class="form-row two">
          ${pField(`c${i}.mfd`, 'Manufacturing date', x.mfd, { type: 'date', hint: '(optional)' })}
          ${pField(`c${i}.expiry`, reqExp ? 'Expiry / best before*' : 'Expiry / best before', x.expiry, { type: 'date', req: reqExp, hint: reqExp ? '' : '(if applicable)' })}
        </div>
        <div class="form-row two">
          ${pField(`c${i}.qtyInCombo`, 'Quantity in combo*', x.qtyInCombo, { type: 'number', req: true, attrs: 'min="1" step="1" inputmode="numeric"' })}
          ${hasWeight ? '' : pField(`c${i}.weight`, 'Weight (kg)', x.weight, { type: 'number', hint: '(optional)', attrs: 'min="0" step="0.001" inputmode="decimal"' })}
        </div>
      </div>`;
  }
  function comboStepHtml(d) {
    const allowed = allowedProductTypes(state.merchant);
    const on = !!d.isCombo;
    let html = `<label class="field checkbox-field"><input type="checkbox" name="isCombo" id="pwCombo"${on ? ' checked' : ''}><span>This is a combo pack (2 products sold together)</span></label>`;
    if (!on) return html + `<p class="cell-muted" style="font-size:12.5px;margin-top:10px">Optional. Skip this step if you are selling a single product. Turn it on to add each product’s own details (type, composition, expiry, weight, safety and more).</p>`;
    if (!allowed.length) return html + `<p class="cell-muted">Choose your business category in KYC first.</p>`;
    d.combo = [0, 1].map(i => (d.combo && d.combo[i]) || blankComboItem());
    d.combo.forEach(it => { if (!it.type || !allowed.includes(it.type)) { it.type = allowed.includes(d.type) ? d.type : allowed[0]; it.category = ''; it.x = it.x || {}; } });
    return html + `<p class="cell-muted" style="font-size:12.5px;margin:10px 0 12px">Fill in both products. The inputs change with each product’s type. Price, stock, images and return policy above apply to the whole combo.</p>`
      + d.combo.map((it, i) => comboItemHtml(d, it, i, allowed)).join('');
  }
  function comboMissing(it) {
    const x = it.x || {}, pd = comboPd(it), miss = [];
    if (!it.type) miss.push('Product type');
    if (!it.category) miss.push('Category');
    if (!String(x.name || '').trim()) miss.push('Product name');
    if (!String(x.brand || '').trim()) miss.push('Brand name');
    if (!(Number(x.qtyInCombo) >= 1)) miss.push('Quantity in combo');
    if (expiryRequired({ type: it.type }) && !x.expiry) miss.push('Expiry date');
    comboFieldsFor(it.type).forEach(f => {
      if ((f.show && !f.show(pd)) || !fieldReq(pd, f)) return;
      const v = (pd.x || {})[f.k];
      if (v == null || String(v).trim() === '') miss.push(f.l);
    });
    return miss;
  }
  function imageSlotHtml(i, label, src) {
    return `<label class="img-slot${src ? ' filled' : ''}" data-slot="${i}">
      <input type="file" accept="image/*" data-img-input="${i}">
      ${src ? `<img src="${src}" alt="${esc(label)}"><span class="img-tag">${esc(label)}</span><button type="button" class="img-remove" data-img-remove="${i}" aria-label="Remove ${esc(label)}">${icon('close')}</button>`
            : `${icon('camera')}<span>${esc(label)}${i === 0 ? '*' : ''}</span>`}
    </label>`;
  }
  function docSlotHtml(i, label, doc) {
    const has = doc && doc.url;
    return `<label class="img-slot${has ? ' filled' : ''}" data-doc-slot="${i}" style="aspect-ratio:auto;min-height:76px;padding:10px;text-align:center">
      <input type="file" accept="application/pdf,image/*" data-doc-input="${i}">
      ${has ? `<span class="img-tag" style="position:static;display:block;word-break:break-all">${esc(doc.name || 'Document added')}</span><span class="cell-muted" style="font-size:11.5px">${esc(label)}</span><button type="button" class="img-remove" data-doc-remove="${i}" aria-label="Remove ${esc(label)}">${icon('close')}</button>`
             : `${icon('plus')}<span>${esc(label)}</span>`}
    </label>`;
  }
  function imagesHtml(d) {
    const slots = IMAGE_SLOTS_BY_TYPE[d.type] || IMAGE_SLOTS_BY_TYPE._;
    const docSlots = DOC_SLOTS_BY_TYPE[d.type] || [];
    return `<div class="field" style="margin-bottom:6px"><span>Product images <span class="field-hint">(up to 4 · first photo required)</span></span></div>
      <div class="img-grid">${slots.map((l, i) => imageSlotHtml(i, l, d.images[i])).join('')}</div>
      ${docSlots.length ? `<div class="field" style="margin:16px 0 6px"><span>Documents <span class="field-hint">(optional · PDF or image · max 5 MB)</span></span></div>
      <div class="img-grid">${docSlots.map((l, i) => docSlotHtml(i, l, d.docs[i] || {})).join('')}</div>` : ''}`;
  }

  function ensureType(d, editing) {
    const allowedTypes = allowedProductTypes(state.merchant);
    if (!d.type && allowedTypes.length === 1 && !editing) d.type = allowedTypes[0];
    if (d.type && !editing && allowedTypes.length && !allowedTypes.includes(d.type)) d.type = allowedTypes[0];
    return allowedTypes;
  }
  function productStepHtml(step, d, editing) {
    const allowedTypes = ensureType(d, editing);
    const steps = stepsFor(d.type);
    const key = (steps[step] || steps[0]).key;
    const note = STEP_NOTES[d.type + '.' + key];
    const noteHtml = note ? `<p class="cell-muted" style="font-size:12.5px;margin-bottom:12px">${esc(note)}</p>` : '';
    switch (key) {
      case 'type':
        if (!allowedTypes.length) return `<p class="cell-muted">Choose your business category in KYC first. Your account type decides which products you can list.</p><button type="button" class="btn btn-primary" data-route="kyc-wizard">Go to KYC</button>`;
        return `<p class="cell-muted" style="font-size:12.5px;margin-bottom:10px">Your account type (${esc(state.merchant.category)}) can list these products only.</p><div class="type-grid">${allowedTypes.map(t => `
          <button type="button" class="type-card${d.type === t ? ' sel' : ''}" data-ptype="${t}">
            <span class="type-card-ico">${icon(PRODUCT_TYPE_CARDS[t].ico)}</span><b>${PRODUCT_TYPE_CARDS[t].title}</b><span>${PRODUCT_TYPE_CARDS[t].sub}</span>
          </button>`).join('')}</div>`;
      case 'basic': return noteHtml + renderFields(d, formFields(d, 'basic'));
      case 'details': return noteHtml + renderFields(d, formFields(d, 'details'));
      case 'batch': return noteHtml + batchHtml(d) + '<div style="margin-top:14px"></div>' + renderFields(d, formFields(d, 'batchExtra'));
      case 'price': return priceHtml(d);
      case 'combo': return comboStepHtml(d);
      case 'compliance': return noteHtml + renderFields(d, formFields(d, 'compliance'));
      case 'images': return imagesHtml(d);
      case 'review': return productReviewHtml(d, editing);
    }
    return '';
  }
  function discountLabel(mrp, price) {
    if (mrp === '' || price === '' || isNaN(Number(mrp)) || isNaN(Number(price))) return `<span>Discount</span><b>—</b>`;
    if (Number(price) > Number(mrp)) return `<span>Discount</span><b class="bad">Selling price is above MRP</b>`;
    const pct = calcDiscount(mrp, price);
    return `<span>Discount (auto-calculated)</span><b>${pct}% off · customers save ${rupee(Number(mrp) - Number(price))}</b>`;
  }

  const CLAIM_RE = /\b(cures?|cured|curing|miracle|guaranteed (?:cure|result)s?|heals?)\b|\b(?:treats?|prevents?|reverses?)\s+(?:cancer|diabetes|covid|hiv|aids|arthritis|asthma|hypertension|heart disease)/i;
  const GROCERY_RE = /\b(basmati|rice|lentils?|dal|atta|flour|cooking oil|mustard oil|sunflower oil|namkeen|chips|snacks?|biscuits?|cookies?|cakes?|noodles|maggi|chocolates?|candy|candies|soft drinks?|cola|pickles?|masala|spices?|sugar|salt|tea|coffee|ghee|jaggery)\b/i;
  const HEALTH_PHRASE_RE = /sugar[\s-]*free|no added sugar|low sodium|salt substitute|diabetic|green tea extract/gi;
  const NUTRITION_OK_RE = /protein|supplement|nutrition|vitamin|mineral|\bors\b|electrolyte|diabet|formula|infant|medical|health|whey|collagen|probiotic|omega|calcium|iron|zinc/i;

  function productChecks(d, approvedEdit) {
    const priceOk = d.mrp !== '' && d.price !== '' && Number(d.price) > 0 && Number(d.price) <= Number(d.mrp);
    const out = [{ label: 'Product information', ok: !!(String(d.name).trim() && String(d.brand).trim() && d.category), step: 'basic' }];
    ['basic', 'details', 'compliance'].forEach(k => {
      if (!stepsFor(d.type).some(s => s.key === k)) return;
      const m = missingRequired(d, k);
      if (m.length) out.push({ label: `${stepMeta(k, d.type).title}: ${m.slice(0, 2).join(', ')}${m.length > 2 ? ` +${m.length - 2} more` : ''}`, ok: false, step: k });
    });
    out.push({ label: 'Price', ok: priceOk, step: 'price' });
    const bs = d.batches || [];
    out.push({ label: 'Stock (quantity in every batch)', ok: bs.length > 0 && bs.every(b => b.qty !== '' && b.qty != null && Number(b.qty) >= 0), step: 'batch' });
    if (expiryRequired(d)) out.push({ label: 'Expiry date on every batch', ok: bs.length > 0 && bs.every(b => !!b.expiry), step: 'batch' });
    out.push({ label: 'No expired stock for sale', ok: !bs.some(b => Number(b.qty) > 0 && b.expiry && b.expiry < todayISO()), step: 'batch' });
    if (d.isCombo) {
      (d.combo || []).slice(0, 2).forEach((it, i) => {
        const m = comboMissing(it);
        out.push({ label: m.length ? `Combo product ${i + 1}: ${m.slice(0, 2).join(', ')}${m.length > 2 ? ` +${m.length - 2} more` : ''}` : `Combo product ${i + 1} details`, ok: !m.length, step: 'combo' });
      });
      out.push({ label: 'Combo has no prescription medicine', ok: !(d.combo || []).some(it => it.type === 'medicine' && (it.x || {}).medicineType === 'Prescription'), step: 'combo' });
      out.push({ label: 'No expired product in combo', ok: !(d.combo || []).some(it => (it.x || {}).expiry && it.x.expiry < todayISO()), step: 'combo' });
    }
    out.push({ label: 'Images (main photo)', ok: !!d.images[0], step: 'images' });
    if (d.type === 'medicine' && !approvedEdit) out.push({ label: 'Drug licence verified (KYC)', ok: canSellRx(state.merchant), step: 'compliance' });
    if (['personal_care', 'baby_mother', 'nutrition', 'grocery'].includes(d.type)) {
      const x = d.x || {};
      const txt = [d.name, d.description, x.usage, x.intendedUse, x.directions, x.warnings].filter(Boolean).join(' ');
      out.push({ label: 'No unverified medical claims', ok: !CLAIM_RE.test(txt), step: 'basic' });
    }
    if (d.type === 'grocery') {
      const t = [d.name, d.category, d.subCategory].filter(Boolean).join(' ').replace(HEALTH_PHRASE_RE, ' ');
      out.push({ label: 'Health-related food only (no ordinary grocery or snacks)', ok: !GROCERY_RE.test(t), step: 'basic' });
    }
    if (d.type === 'nutrition') {
      const t = [d.name, d.category, d.subCategory].filter(Boolean).join(' ');
      out.push({ label: 'Medical nutrition only (no ordinary grocery)', ok: !(GROCERY_RE.test(t) && !NUTRITION_OK_RE.test(t)), step: 'basic' });
    }
    return out;
  }

  function productReviewHtml(d, editing) {
    const goLive = editing && d.status === 'approved';
    const checks = productChecks(d, goLive);
    const unit = d.unitType ? ' ' + esc(d.unitType) : '';
    const disc = calcDiscount(d.mrp, d.price);
    const exp = (d.batches || []).filter(b => b.expiry).map(b => b.expiry).sort()[0];
    return `
      <div class="pv-card">
        <div class="pv-img">${d.images[0] ? `<img src="${d.images[0]}" alt="">` : icon('box')}</div>
        <div class="pv-body">
          <div class="pv-title">${esc(d.name) || '—'}</div>
          <div class="pv-sub">${[d.generic, d.brand].filter(Boolean).map(esc).join(' · ') || '—'}</div>
          <div class="pv-tags">
            <span class="pill pill-gray">${esc(d.category) || 'No category'}</span>
            <span class="pill pill-teal">${esc((PRODUCT_TYPE_CARDS[d.type] || PRODUCT_TYPE_CARDS.medicine).title)}</span>
            ${d.type === 'medicine' ? (d.rxRequired ? '<span class="pill pill-red">Prescription required</span>' : '<span class="pill pill-gray">OTC</span>') : ''}
          </div>
          <div class="pv-price"><b>${d.price !== '' ? rupee(d.price) : '—'}</b>${d.mrp !== '' && disc > 0 ? ` <s>${rupee(d.mrp)}</s> <span class="pill pill-green">${disc}% off</span>` : (d.mrp !== '' ? ` <span class="cell-muted">MRP ${rupee(d.mrp)}</span>` : '')}</div>
          <div class="pv-stock">Stock: <b>${d.stock !== '' ? esc(d.stock) + unit : '—'}</b> · ${(d.batches || []).length} batch${(d.batches || []).length === 1 ? '' : 'es'}${exp ? ` · earliest expiry ${esc(exp)}` : ''}</div>
          ${d.isCombo ? `<div class="pv-stock">Combo: <b>${(d.combo || []).slice(0, 2).map(it => esc((it.x || {}).name || '—') + ' × ' + esc((it.x || {}).qtyInCombo || 1)).join(' + ')}</b></div>` : ''}
        </div>
      </div>
      <div class="pv-checks">
        ${checks.map(c => `<div class="pv-check ${c.ok ? 'ok' : 'bad'}">
          <span class="pv-check-ico">${icon(c.ok ? 'check' : 'close')}</span><span>${esc(c.label)}</span>
          ${c.ok ? '' : `<button type="button" class="pv-fix" data-goto-step="${c.step}">Fix</button>`}
        </div>`).join('')}
      </div>
      ${editing ? `<label class="field checkbox-field" style="margin-top:14px"><input type="checkbox" id="pwActive"${d.active ? ' checked' : ''}><span>Active (visible to customers)</span></label>` : ''}
      <p class="pv-note">${goLive ? 'Changes to an approved product apply straight away.'
        : 'After you publish, the product goes for admin review and shows as <b>Pending approval</b> in Inventory. Product approval is separate from your KYC approval. Once approved it goes live. Drafts stay private.'}</p>`;
  }

  function renderProductPage() {
    const P = state.product;
    if (P.done) return renderProductDone();
    const step = P.step, d = P.draft, editing = !!P.editingId;
    ensureType(d, editing);
    const steps = stepsFor(d.type);
    const s = stepMeta((steps[step] || steps[0]).key, d.type);
    const last = step === steps.length - 1;
    const firstStep = editing ? 1 : 0;
    const approvedEdit = editing && d.status === 'approved';
    return `
    <button class="detail-back" id="pwExit">${icon('chevronL')}<span>Inventory</span></button>
    <div class="page-head"><div><h1>${editing ? 'Edit product' : 'Add product'}</h1>
      <p class="page-sub">Step ${step + 1} of ${steps.length} · ${s.title}</p></div></div>
    <div class="wizard-head pw-head"><div class="wizard-steps">${steps.map((x, i) => `<div class="wizard-step-dot${i < step ? ' done' : i === step ? ' current' : ''}" title="${stepMeta(x.key, d.type).title}"></div>`).join('')}</div></div>
    <div class="card pw-card" id="pwBody">
      <h2>${s.title}</h2><p class="wizard-desc">${s.desc}</p>
      ${editing && step === 1 ? `<p class="pw-lock">${icon('lock')}<span>${esc((PRODUCT_TYPE_CARDS[d.type] || PRODUCT_TYPE_CARDS.medicine).title)} · product type can’t be changed after creation</span></p>` : ''}
      <form id="pwForm" novalidate>${productStepHtml(step, d, editing)}</form>
    </div>
    <div class="pw-actions" id="pwActions">
      <button class="btn btn-ghost" id="pwBack"${step <= firstStep ? ' disabled' : ''}>${icon('chevronL')}<span>Back</span></button>
      <div class="pw-actions-right">
        ${last ? (approvedEdit
          ? `<button class="btn btn-primary" id="pwSubmit" data-mode="update">Save changes</button>`
          : `<button class="btn btn-outline" id="pwDraft" data-mode="draft">Save as draft</button>
             <button class="btn btn-primary" id="pwSubmit" data-mode="publish"${productChecks(d, false).some(c => !c.ok) ? ' disabled' : ''}>Publish product</button>`)
          : `${step >= 1 && !approvedEdit ? `<button class="btn btn-outline" id="pwDraft" data-mode="draft">Save draft</button>` : ''}<button class="btn btn-primary" id="pwNext">Continue</button>`}
      </div>
    </div>`;
  }

  function renderProductDone() {
    const { mode, name, editing } = state.product.done;
    const msg = {
      publish: ['Submitted for approval', `“${esc(name)}” is now <b>Pending approval</b>. It will appear as Active in your store once it’s approved.`],
      draft: ['Draft saved', `“${esc(name)}” is saved as a draft. Finish and publish it any time from Inventory.`],
      update: ['Product updated', `Changes to “${esc(name)}” are saved.`]
    }[mode];
    return `<div class="card pw-done">
      <svg class="done-check" viewBox="0 0 52 52"><circle class="dc-circle" cx="26" cy="26" r="24"/><path class="dc-tick" d="M14 27l8 8 16-17"/></svg>
      <h2>${msg[0]}</h2><p>${msg[1]}</p>
      <div class="pw-done-actions">
        ${editing ? '' : `<button class="btn btn-outline" id="pwAnother">${icon('plus')}<span>Add another product</span></button>`}
        <button class="btn btn-primary" data-route="inventory">Go to inventory</button>
      </div>
    </div>`;
  }

  function collectProductStep() {
    const form = document.getElementById('pwForm');
    if (!form) return;
    const d = state.product.draft;
    const bmap = {}, cmap = {};
    d.x = d.x || {};
    new FormData(form).forEach((v, k) => {
      let m;
      if (k.startsWith('x.')) d.x[k.slice(2)] = v;
      else if ((m = /^b(\d+)\.(\w+)$/.exec(k))) (bmap[m[1]] = bmap[m[1]] || {})[m[2]] = v;
      else if ((m = /^c(\d+)\.(\w+)$/.exec(k))) (cmap[m[1]] = cmap[m[1]] || {})[m[2]] = v;
      else if (k in d && k !== 'images' && k !== 'docs' && k !== 'batches' && k !== 'x' && k !== 'rxRequired' && k !== 'returnable' && k !== 'exchangeable' && k !== 'isCombo' && k !== 'combo') d[k] = v;
    });
    if (form.elements.isCombo) d.isCombo = form.elements.isCombo.checked;
    Object.keys(cmap).forEach(i => {
      const it = (d.combo || [])[Number(i)]; if (!it) return;
      it.x = it.x || {};
      Object.keys(cmap[i]).forEach(k => { if (k === 'type') it.type = cmap[i][k]; else if (k === 'category') it.category = cmap[i][k]; else it.x[k] = cmap[i][k]; });
    });
    if (form.elements.returnable) d.returnable = form.elements.returnable.checked;
    if (form.elements.exchangeable) d.exchangeable = form.elements.exchangeable.checked;
    const idx = Object.keys(bmap).map(Number).sort((a, b) => a - b);
    if (idx.length) d.batches = idx.map(i => ({ ...blankBatch(), ...(d.batches[i] || {}), ...bmap[i] }));
    if (d.type === 'medicine' && d.x.medicineType) d.rxRequired = d.x.medicineType === 'Prescription';
    syncFromBatches(d);
  }
  function validateProductStep() {
    const P = state.product, d0 = P.draft;
    const key = stepsFor(d0.type)[P.step].key;
    const form = document.getElementById('pwForm');
    if (form && !form.reportValidity()) return false;
    collectProductStep();
    const d = P.draft;
    if (key === 'type' && !d.type) { showToast('Choose a product type', 'error'); return false; }
    if (key === 'basic' && d.type === 'medicine' && d.rxRequired && !canSellRx(state.merchant)) { showToast('Prescription medicines unlock after your Drug Licence is verified', 'error'); return false; }
    if (key === 'batch') {
      const bad = d.batches.find(b => b.mfd && b.expiry && b.expiry <= b.mfd);
      if (bad) { showToast('Expiry must be after the manufacturing date', 'error'); return false; }
    }
    if (key === 'price' && Number(d.price) > Number(d.mrp)) { showToast('Selling price can’t be higher than MRP', 'error'); return false; }
    if (key === 'price' && d.returnable && !(Number(d.returnDays) >= 1)) { showToast('Enter the return window in days', 'error'); return false; }
    if (key === 'price' && d.exchangeable && !(Number(d.exchangeDays) >= 1)) { showToast('Enter the replacement window in days', 'error'); return false; }
    if (key === 'combo' && d.isCombo) {
      for (let i = 0; i < 2; i++) {
        const it = d.combo[i], m = comboMissing(it), x = it.x || {};
        if (m.length) { showToast(`Combo product ${i + 1}: fill ${m[0]}`, 'error'); return false; }
        if (it.type === 'medicine' && x.medicineType === 'Prescription') { showToast('A combo cannot include a prescription medicine', 'error'); return false; }
        if (x.mfd && x.expiry && x.expiry <= x.mfd) { showToast(`Combo product ${i + 1}: expiry must be after the manufacturing date`, 'error'); return false; }
        if (x.expiry && x.expiry < todayISO()) { showToast(`Combo product ${i + 1} is expired`, 'error'); return false; }
      }
    }
    if (key === 'images' && !d.images[0]) { showToast('Add a main photo to continue', 'error'); return false; }
    return true;
  }
  function rerenderProduct(keepScroll) {
    document.getElementById('pageOutlet').innerHTML = renderProductPage();
    wireProductPage();
    if (!keepScroll) window.scrollTo(0, 0);
  }
  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file'));
      if (file.size > 5 * 1024 * 1024) return reject(new Error('Image must be under 5 MB'));
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Could not read image'));
      r.readAsDataURL(file);
    });
  }
  async function exitProduct() {
    const P = state.product;
    if (P.dirty && !P.done) {
      const ok = await confirmDialog('Discard this product?', 'Anything you entered on this page will be lost. Use “Save draft” to keep it.');
      if (!ok) return;
    }
    navigate('inventory');
  }
  async function submitProduct(mode) {
    const P = state.product, d = P.draft;
    collectProductStep();
    if (mode === 'draft' && !d.name.trim()) { showToast('Enter a product name to save a draft', 'error'); return; }
    if (mode !== 'draft' && productChecks(d, !!P.editingId && d.status === 'approved').some(c => !c.ok)) { showToast('Complete the highlighted items first', 'error'); return; }
    const status = mode === 'draft' ? 'draft' : mode === 'publish' ? 'pending' : d.status;
    const btns = document.querySelectorAll('#pwActions .btn');
    const main = document.getElementById(mode === 'draft' ? 'pwDraft' : 'pwSubmit');
    btns.forEach(b => b.disabled = true);
    BtnState.start(main, mode === 'draft' ? 'Saving draft…' : mode === 'publish' ? 'Submitting…' : 'Saving…');
    try {
      const saved = await DB.saveProduct(draftToProduct(d, status));
      await BtnState.ok(main, mode === 'publish' ? 'Submitted Successfully' : mode === 'draft' ? 'Draft Saved' : 'Saved Successfully');
      P.done = { mode, name: d.name, editing: !!P.editingId };
      P.dirty = false;
      rerenderProduct();
      if (saved && saved.privateFailed) showToast('Saved, but purchase prices could not be stored', 'error');
    } catch (err) {
      console.error('PRODUCT SAVE ERROR:', err && err.message, err && err.details, err && err.hint, err && err.code, err);
      const why = err && err.message ? String(err.message).slice(0, 140) : '';
      showToast('Could not save the product' + (why ? ': ' + why : '. Please try again.'), 'error');
      btns.forEach(b => b.disabled = false);
      BtnState.fail(main, mode === 'draft' ? 'Save Failed — Retry' : mode === 'publish' ? 'Submit Failed — Retry' : 'Save Failed — Retry');
    }
  }

  function wireProductPage() {
    const P = state.product;
    document.getElementById('pwExit')?.addEventListener('click', exitProduct);
    if (P.done) {
      document.getElementById('pwAnother')?.addEventListener('click', () => {
        P.done = null; P.editingId = null; P.draft = blankProduct(); P.step = 0; P.dirty = false; rerenderProduct();
      });
      return;
    }
    const form = document.getElementById('pwForm');
    const next = () => { if (validateProductStep()) { P.step += 1; rerenderProduct(); } };
    document.getElementById('pwNext')?.addEventListener('click', next);
    form?.addEventListener('submit', (e) => { e.preventDefault(); document.getElementById('pwNext')?.click(); });
    document.getElementById('pwBack')?.addEventListener('click', () => {
      collectProductStep(); P.step = Math.max(P.editingId ? 1 : 0, P.step - 1); rerenderProduct();
    });
    document.getElementById('pwDraft')?.addEventListener('click', () => submitProduct('draft'));
    document.getElementById('pwSubmit')?.addEventListener('click', (e) => submitProduct(e.currentTarget.dataset.mode));
    form?.addEventListener('input', () => {
      P.dirty = true;
      if (form.elements.mrp && form.elements.price) document.getElementById('pwDiscount').innerHTML = discountLabel(form.elements.mrp.value, form.elements.price.value);
    });
    document.getElementById('pwActive')?.addEventListener('change', (e) => { P.draft.active = e.target.checked; P.dirty = true; });

    // product type cards
    document.querySelectorAll('[data-ptype]').forEach(b => b.addEventListener('click', () => {
      const t = b.dataset.ptype;
      if (P.draft.type !== t) {
        P.draft.type = t; P.draft.category = ''; P.draft.unitType = ''; P.draft.x = {}; P.draft.batches = [blankBatch()]; P.draft.stock = ''; P.dirty = true;
        if (t === 'nutrition' || t === 'grocery') { const f = state.merchant && state.merchant.docs && state.merchant.docs.fssai; if (f && f.number) P.draft.x.fssai = f.number; }
      }
      rerenderProduct(true);
    }));
    // combo pack: toggle + per-product type change
    document.getElementById('pwCombo')?.addEventListener('change', () => {
      collectProductStep(); P.dirty = true;
      if (P.draft.isCombo && !P.draft.unitType) P.draft.unitType = 'Combo';
      rerenderProduct(true);
    });
    document.querySelectorAll('[data-combo-type]').forEach(sel => sel.addEventListener('change', () => {
      const it = P.draft.combo[Number(sel.dataset.comboType)], old = it.type;
      collectProductStep();
      if (it.type !== old) {                       // new type → new inputs; keep the common ones already typed
        const x0 = it.x || {}, keep = {};
        ['name', 'brand', 'qtyInCombo', 'mfd', 'expiry'].forEach(k => { if (x0[k] != null && x0[k] !== '') keep[k] = x0[k]; });
        it.category = ''; it.x = keep;
      }
      P.dirty = true; rerenderProduct(true);
    }));
    // jump-to-step links in the review checklist
    document.querySelectorAll('[data-goto-step]').forEach(b => b.addEventListener('click', () => { const i = stepsFor(P.draft.type).findIndex(x => x.key === b.dataset.gotoStep); P.step = Math.max(P.editingId ? 1 : 0, i); rerenderProduct(); }));

    // batches
    document.querySelector('[data-add-batch]')?.addEventListener('click', () => { collectProductStep(); P.draft.batches.push(blankBatch()); P.dirty = true; rerenderProduct(true); });
    document.querySelectorAll('[data-del-batch]').forEach(b => b.addEventListener('click', () => {
      collectProductStep(); P.draft.batches.splice(Number(b.dataset.delBatch), 1);
      if (!P.draft.batches.length) P.draft.batches.push(blankBatch());
      syncFromBatches(P.draft); P.dirty = true; rerenderProduct(true);
    }));
    // documents (PDF or image)
    document.querySelectorAll('[data-doc-input]').forEach(inp => inp.addEventListener('change', async () => {
      const file = inp.files && inp.files[0]; if (!file) return;
      try {
        if (!(file.type === 'application/pdf' || file.type.startsWith('image/'))) throw new Error('Please choose a PDF or an image');
        if (file.size > 5 * 1024 * 1024) throw new Error('Document must be under 5 MB');
        const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file')); r.readAsDataURL(file); });
        collectProductStep();
        P.draft.docs[Number(inp.dataset.docInput)] = { url, name: file.name };
        P.dirty = true; rerenderProduct(true);
      } catch (err) { showToast(err.message, 'error'); inp.value = ''; }
    }));
    document.querySelectorAll('[data-doc-remove]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation(); collectProductStep();
      P.draft.docs[Number(b.dataset.docRemove)] = { url: '', name: '' }; P.dirty = true; rerenderProduct(true);
    }));
    // images
    document.querySelectorAll('[data-img-input]').forEach(inp => inp.addEventListener('change', async () => {
      const file = inp.files && inp.files[0]; if (!file) return;
      const i = Number(inp.dataset.imgInput);
      try {
        collectProductStep();
        P.draft.images[i] = await readImageFile(file);
        P.dirty = true;
        rerenderProduct(true);
      } catch (err) { showToast(err.message, 'error'); inp.value = ''; }
    }));
    document.querySelectorAll('[data-img-remove]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      collectProductStep();
      P.draft.images[Number(b.dataset.imgRemove)] = '';
      P.dirty = true;
      rerenderProduct(true);
    }));
  }

  PAGES['add-product'] = async (param) => {
    const P = state.product;
    P.done = null; P.dirty = false;
    if (param) {
      const p = await DB.getProduct(param);
      if (!p) return `<div class="card">${emptyBlock('box', 'Product not found', 'It may have been deleted.', `<button class="btn btn-outline btn-sm" data-route="inventory">Back to inventory</button>`)}</div>`;
      P.editingId = p.id; P.draft = productToDraft(p); P.step = 1;
    } else {
      P.editingId = null; P.draft = blankProduct(); P.step = 0;
    }
    return renderProductPage();
  };
  AFTER['add-product'] = () => wireProductPage();

  PAGES.categories = async () => {
    const [categories, products] = await Promise.all([DB.getCategories(), DB.getProducts()]);
    if (!categories.length) return `<div class="page-head"><h1>Categories</h1></div><div class="card">${emptyBlock('tag', 'No categories yet', 'Categories will appear as you add products.')}</div>`;
    const cards = categories.map(c => {
      const count = products.filter(p => p.category === c).length;
      return `<div class="card" style="padding:16px;cursor:pointer" data-cat-filter="${esc(c)}">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="profile-row-icon">${icon('tag')}</div>
          <div><div class="cell-strong">${esc(c)}</div><div class="cell-muted" style="font-size:12.5px">${count} product${count === 1 ? '' : 's'}</div></div>
        </div>
      </div>`;
    }).join('');
    return `
    <div class="page-head"><div><h1>Categories</h1><p class="page-sub">${categories.length} categories</p></div></div>
    <div class="toolbar"><div class="search-box">${icon('search')}<input type="text" placeholder="Search categories"></div></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">${cards}</div>`;
  };
  AFTER.categories = () => {
    document.querySelectorAll('[data-cat-filter]').forEach(el => el.addEventListener('click', () => {
      state.filters.inventory = { q: '', status: 'all' };
      navigate('inventory');
      setTimeout(() => { const s = document.getElementById('invSearch'); if (s) { s.value = el.dataset.catFilter; s.dispatchEvent(new Event('input')); } }, 0);
    }));
  };

  function pickerHtml(products, selected, id) {
    const sel = new Set((selected || []).map(String));
    return `<div class="picker" data-picker="${id}">
      <div class="search-box" style="max-width:none">${icon('search')}<input type="text" class="picker-search" placeholder="Search products" autocomplete="off"></div>
      <div class="picker-list">${products.length ? products.map(p => `
        <label class="picker-item" data-name="${esc((p.name + ' ' + p.category).toLowerCase())}">
          <input type="checkbox" value="${p.id}"${sel.has(String(p.id)) ? ' checked' : ''}>
          <span class="picker-name">${esc(p.name)}<small>${esc(p.category)}</small></span>
          <span class="picker-meta">${money(p.price)}</span>
        </label>`).join('') : '<p class="cell-muted" style="padding:12px;font-size:13px">No approved products yet — add products in Inventory first.</p>'}
      </div>
      <div class="picker-foot"><span class="picker-count">0 selected</span><span><button type="button" class="link" data-picker-all>Select all</button> · <button type="button" class="link" data-picker-none>Clear</button></span></div>
    </div>`;
  }
  function wirePicker(root, onChange) {
    const list = root.querySelector('.picker-list'), count = root.querySelector('.picker-count');
    const upd = () => { const n = list.querySelectorAll('input:checked').length; count.textContent = n + ' selected'; if (onChange) onChange(); };
    root.querySelector('.picker-search').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      list.querySelectorAll('.picker-item').forEach(it => { it.hidden = q && !it.dataset.name.includes(q); });
    });
    list.addEventListener('change', upd);
    root.querySelector('[data-picker-all]').addEventListener('click', () => { list.querySelectorAll('.picker-item:not([hidden]) input').forEach(c => { c.checked = true; }); upd(); });
    root.querySelector('[data-picker-none]').addEventListener('click', () => { list.querySelectorAll('input').forEach(c => { c.checked = false; }); upd(); });
    upd();
  }
  const pickerValues = (root) => [...root.querySelectorAll('.picker-list input:checked')].map(c => Number(c.value));
  const liveProducts = async () => (await DB.getProducts()).filter(p => p.status === 'approved');

  const PROMO_PILL = { active: ['pill-green', 'Active'], paused: ['pill-amber', 'Paused'], expired: ['pill-gray', 'Expired'], scheduled: ['pill-teal', 'Scheduled'], exhausted: ['pill-gray', 'Fully used'], pending_payment: ['pill-red', 'Payment pending'] };
  function promoPill(s) { const [c, l] = PROMO_PILL[s] || ['pill-gray', s]; return `<span class="pill ${c}">${l}</span>`; }
  const dateRange = (a, b) => `${fmtDate(a)} – ${isFarEnd(b) ? 'No end date' : fmtDate(b)}`;
  const valueLabel = (type, v) => type === 'fixed' || type === 'flat' ? money(v) + ' off' : v + '% off';
  const productNames = (ids, products) => { const m = new Map(products.map(p => [Number(p.id), p.name])); const names = ids.map(i => m.get(i)).filter(Boolean); return names.length ? (names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2} more` : '')) : (ids.length ? `${ids.length} products` : 'All products'); };

  const PROMO_TABS = [['offers', '🔥 Offers'], ['discounts', 'Discounts'], ['coupons', 'Coupons'], ['flash', 'Flash sales'], ['price', 'Price management'], ['featured', 'Featured'], ['analytics', 'Analytics'], ['how', 'How it works']];
  const PROMO_TAB = {};

  PAGES.promotions = async (param) => {
    const tab = PROMO_TABS.some(t => t[0] === param) ? param : 'discounts';
    state.promoTab = tab;
    const body = await PROMO_TAB[tab].render();
    return `
    <div class="page-head"><div><h1>Promotions</h1><p class="page-sub">Discounts, coupons, sales and price control</p></div>${PROMO_TAB[tab].action ? `<div class="page-head-actions">${PROMO_TAB[tab].action}</div>` : ''}</div>
    <div class="chip-row" style="margin-bottom:16px">${PROMO_TABS.map(([k, l]) => `<button class="filter-chip${k === tab ? ' active' : ''}" data-route="promotions" data-param="${k}">${l}</button>`).join('')}</div>
    <div id="promoBody">${body}</div>`;
  };
  AFTER.promotions = () => { const t = PROMO_TAB[state.promoTab]; if (t && t.after) t.after(); };

  /* ---- generic row actions for promotion / coupon lists ---- */
  function wireListActions(kind, reload, editFn) {
    document.querySelectorAll('[data-pl-toggle]').forEach(b => b.addEventListener('click', async () => {
      try { b.disabled = true; kind === 'coupon' ? await DB.setCouponActive(b.dataset.plToggle, b.dataset.active !== 'true') : await DB.setPromotionActive(b.dataset.plToggle, b.dataset.active !== 'true'); showToast(b.dataset.active === 'true' ? 'Paused' : 'Activated'); reload(); }
      catch (e) { console.error(e); b.disabled = false; showToast('Could not update', 'error'); }
    }));
    document.querySelectorAll('[data-pl-del]').forEach(b => b.addEventListener('click', async () => {
      const ok = await confirmDialog('Delete this?', 'This cannot be undone.'); if (!ok) return;
      try { kind === 'coupon' ? await DB.deleteCoupon(b.dataset.plDel) : await DB.deletePromotion(b.dataset.plDel); showToast('Deleted'); reload(); }
      catch (e) { console.error(e); showToast('Could not delete', 'error'); }
    }));
    document.querySelectorAll('[data-pl-edit]').forEach(b => b.addEventListener('click', () => editFn(b.dataset.plEdit)));
  }
  const reloadPromo = () => render();
  const rowBtns = (id, status, extra) => `<div class="row-actions">
    ${status !== 'expired' && status !== 'pending_payment' ? `<button class="btn btn-ghost btn-sm" data-pl-toggle="${id}" data-active="${status === 'paused' ? 'false' : 'true'}">${status === 'paused' ? 'Resume' : 'Pause'}</button>` : ''}
    ${extra || ''}
    <button class="btn btn-ghost btn-sm" data-pl-del="${id}" aria-label="Delete">${icon('trash')}</button></div>`;

  let discountCache = [];
  PROMO_TAB.discounts = {
    action: `<button class="btn btn-primary" id="newDiscountBtn">${icon('plus')}<span>Create discount</span></button>`,
    render: async () => {
      const [list, products] = await Promise.all([DB.getPromotions(['discount']), liveProducts()]);
      discountCache = list;
      if (!list.length) return `<div class="card">${emptyBlock('percent', 'No discounts yet', 'Create a discount to reduce the price of selected products.')}</div>`;
      return `<div class="card">${list.map(p => `
        <div class="list-row">
          <div class="list-row-main"><div class="cell-strong">${esc(p.title)}</div>
            <div class="cell-muted list-sub">${valueLabel(p.discountType, p.value)} · ${esc(productNames(p.products, products))}</div>
            <div class="cell-muted list-sub">${dateRange(p.start, p.end)}</div></div>
          <div class="list-row-side">${promoPill(p.status)}${rowBtns(p.id, p.status, `<button class="btn btn-ghost btn-sm" data-pl-edit="${p.id}" aria-label="Edit">${icon('edit')}</button>`)}</div>
        </div>`).join('')}</div>`;
    },
    after: () => {
      document.getElementById('newDiscountBtn')?.addEventListener('click', () => openDiscountForm(null));
      wireListActions('promo', reloadPromo, (id) => openDiscountForm(discountCache.find(p => p.id === id)));
    }
  };
  async function openDiscountForm(p) {
    const products = await liveProducts();
    const startVal = p ? localDate(new Date(p.start)) : localDate();
    openSheet(p ? 'Edit discount' : 'Create discount', `
      <form id="discForm">
        <label class="field"><span>Discount name</span><input type="text" name="ttl" required maxlength="60" value="${esc(p ? p.title : '')}" placeholder="e.g. Vitamins Week"></label>
        <div class="form-row two">
          <label class="field"><span>Type</span><select name="dtype"><option value="percentage"${p && p.discountType !== 'percentage' ? '' : ' selected'}>Percentage (%)</option><option value="fixed"${p && p.discountType === 'fixed' ? ' selected' : ''}>Amount (₹)</option></select></label>
          <label class="field"><span>Value</span><input type="number" name="value" required min="1" step="0.01" value="${p ? p.value : ''}"></label>
        </div>
        <div class="form-row two">
          <label class="field"><span>Starts</span><input type="date" name="start" required value="${startVal}"></label>
          <label class="field"><span>Ends <span class="field-hint">(optional)</span></span><input type="date" name="end" value="${p && !isFarEnd(p.end) ? localDate(new Date(p.end)) : ''}"></label>
        </div>
        <div class="field"><span>Apply to products</span>${pickerHtml(products, p ? p.products : [], 'disc')}</div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-sheet-close>Cancel</button><button class="btn btn-primary" id="discGo">${p ? 'Save changes' : 'Create discount'}</button></div>
      </form>`, {
      wide: true,
      onOpen: (sh) => {
        const form = sh.el.querySelector('#discForm');
        wirePicker(form.querySelector('.picker'));
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const ids = pickerValues(form), val = Number(form.value.value), type = form.dtype.value;
          if (!ids.length) return showToast('Select at least one product', 'error');
          if (type === 'percentage' && (val < 1 || val > 90)) return showToast('Percentage must be between 1 and 90', 'error');
          const chosen = products.filter(x => ids.includes(Number(x.id)));
          if (type === 'fixed' && chosen.some(x => val >= x.price)) return showToast('Amount off must be lower than every selected product’s price', 'error');
          if (form.end.value && form.end.value < form.start.value) return showToast('End date must be after the start date', 'error');
          const btn = form.querySelector('#discGo'); BtnState.start(btn);
          try {
            await DB.savePromotion({ type: 'discount', title: form.ttl.value.trim(), discountType: type, value: val, products: ids, start: new Date(form.start.value + 'T00:00:00').toISOString(), end: form.end.value ? new Date(form.end.value + 'T23:59:59').toISOString() : null, status: p && p.status === 'paused' ? 'paused' : 'active' }, p ? p.id : null);
            await BtnState.ok(btn); sh.close(); showToast(p ? 'Discount updated' : 'Discount created'); reloadPromo();
          } catch (err) { console.error(err); BtnState.fail(btn); showToast('Could not save the discount', 'error'); }
        });
      }
    });
  }

  let couponCache = [];
  PROMO_TAB.coupons = {
    action: `<button class="btn btn-primary" id="newCouponBtn">${icon('plus')}<span>Create coupon</span></button>`,
    render: async () => {
      const [list, products] = await Promise.all([DB.getCoupons(), liveProducts()]);
      couponCache = list;
      if (!list.length) return `<div class="card">${emptyBlock('percent', 'No coupons yet', 'Create a coupon code your customers can apply at checkout.')}</div>`;
      return `<div class="card">${list.map(c => `
        <div class="list-row">
          <div class="list-row-main">
            <div class="coupon-code"><span class="cell-mono cell-strong">${esc(c.code)}</span><button class="btn btn-ghost btn-sm" data-copy="${esc(c.code)}" aria-label="Copy code">${icon('copy')}<span>Copy</span></button></div>
            <div class="cell-muted list-sub">${esc(c.description || valueLabel(c.discountType, c.value))}</div>
            <div class="cell-muted list-sub">${valueLabel(c.discountType, c.value)}${c.minOrder ? ' · min order ' + money(c.minOrder) : ''}${c.maxDiscount && c.discountType === 'percentage' ? ' · up to ' + money(c.maxDiscount) : ''} · ${esc(productNames(c.products, products))}</div>
            <div class="cell-muted list-sub">Redeemed ${c.used}${c.limit ? ' / ' + c.limit : ''} · ${dateRange(c.start, c.end)}</div>
          </div>
          <div class="list-row-side">${promoPill(c.status)}${rowBtns(c.id, c.status === 'exhausted' ? 'active' : c.status, `<button class="btn btn-ghost btn-sm" data-pl-edit="${c.id}" aria-label="Edit">${icon('edit')}</button>`)}</div>
        </div>`).join('')}</div>`;
    },
    after: () => {
      document.getElementById('newCouponBtn')?.addEventListener('click', () => openCouponForm(null));
      document.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(b.dataset.copy); showToast('Coupon code copied'); }
        catch (e) { showToast(b.dataset.copy, 'success'); }
      }));
      wireListActions('coupon', reloadPromo, (id) => openCouponForm(couponCache.find(c => c.id === id)));
    }
  };
  async function openCouponForm(c) {
    const products = await liveProducts();
    openSheet(c ? 'Edit coupon' : 'Create coupon', `
      <form id="coupForm">
        <div class="form-row two">
          <label class="field"><span>Coupon code</span><input type="text" name="code" required maxlength="20" pattern="[A-Za-z0-9]{4,20}" title="4–20 letters or numbers" style="text-transform:uppercase" value="${esc(c ? c.code : '')}" placeholder="SAVE10"></label>
          <label class="field"><span>Type</span><select name="dtype"><option value="percentage"${c && c.discountType === 'fixed' ? '' : ' selected'}>Percentage (%)</option><option value="fixed"${c && c.discountType === 'fixed' ? ' selected' : ''}>Amount (₹)</option></select></label>
        </div>
        <label class="field"><span>Description</span><input type="text" name="description" maxlength="120" value="${esc(c ? c.description : '')}" placeholder="e.g. 10% off on orders above ₹300"></label>
        <div class="form-row two">
          <label class="field"><span>Discount value</span><input type="number" name="value" required min="1" step="0.01" value="${c ? c.value : ''}"></label>
          <label class="field"><span>Min. order (₹)</span><input type="number" name="min" min="0" step="1" value="${c ? c.minOrder : 0}"></label>
        </div>
        <div class="form-row two">
          <label class="field"><span>Max discount (₹) <span class="field-hint">(for %)</span></span><input type="number" name="max" min="0" step="1" value="${c ? c.maxDiscount : 0}"></label>
          <label class="field"><span>Usage limit <span class="field-hint">(0 = unlimited)</span></span><input type="number" name="limit" min="0" step="1" value="${c ? c.limit : 100}"></label>
        </div>
        <div class="form-row two">
          <label class="field"><span>Starts</span><input type="date" name="start" required value="${c ? localDate(new Date(c.start)) : localDate()}"></label>
          <label class="field"><span>Expires <span class="field-hint">(optional)</span></span><input type="date" name="end" value="${c && !isFarEnd(c.end) ? localDate(new Date(c.end)) : ''}"></label>
        </div>
        <div class="field"><span>Applicable products <span class="field-hint">(none selected = all your products)</span></span>${pickerHtml(products, c ? c.products : [], 'coup')}</div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-sheet-close>Cancel</button><button class="btn btn-primary" id="coupGo">${c ? 'Save changes' : 'Create coupon'}</button></div>
      </form>`, {
      wide: true,
      onOpen: (sh) => {
        const form = sh.el.querySelector('#coupForm');
        wirePicker(form.querySelector('.picker'));
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const val = Number(form.value.value), type = form.dtype.value;
          if (type === 'percentage' && (val < 1 || val > 90)) return showToast('Percentage must be between 1 and 90', 'error');
          if (form.end.value && form.end.value < form.start.value) return showToast('Expiry must be after the start date', 'error');
          const btn = form.querySelector('#coupGo'); BtnState.start(btn);
          try {
            await DB.saveCoupon({ code: form.code.value.trim(), description: form.description.value.trim(), discountType: type, value: val, minOrder: Number(form.min.value) || 0, maxDiscount: Number(form.max.value) || 0, limit: Number(form.limit.value) || 0, products: pickerValues(form), start: new Date(form.start.value + 'T00:00:00').toISOString(), end: form.end.value ? new Date(form.end.value + 'T23:59:59').toISOString() : null }, c ? c.id : null);
            await BtnState.ok(btn); sh.close(); showToast(c ? 'Coupon updated' : 'Coupon created'); reloadPromo();
          } catch (err) { console.error(err); BtnState.fail(btn); showToast(err.code === 'DUPLICATE' ? err.message : 'Could not save the coupon', 'error'); }
        });
      }
    });
  }

  let flashCache = [];
  PROMO_TAB.flash = {
    action: `<button class="btn btn-primary" id="newFlashBtn">${icon('plus')}<span>Create flash sale</span></button>`,
    render: async () => {
      const [list, products] = await Promise.all([DB.getPromotions(['flash_sale']), liveProducts()]);
      flashCache = list;
      if (!list.length) return `<div class="card">${emptyBlock('zap', 'No flash sales', 'Run a time-limited sale with a discount budget.')}</div>`;
      return `<div class="card">${list.map(p => `
        <div class="list-row">
          <div class="list-row-main"><div class="cell-strong">⚡ ${esc(p.title)}</div>
            <div class="cell-muted list-sub">${p.value}% off · ${esc(productNames(p.products, products))}</div>
            <div class="cell-muted list-sub">${fmtDateTime(p.start)} → ${fmtDateTime(p.end)}</div>
            <div class="cell-muted list-sub">Budget ${money(p.budget)} · used ${money(p.spent)}</div></div>
          <div class="list-row-side">${promoPill(p.status)}${rowBtns(p.id, p.status, `<button class="btn btn-ghost btn-sm" data-pl-edit="${p.id}" aria-label="Edit">${icon('edit')}</button>`)}</div>
        </div>`).join('')}</div>`;
    },
    after: () => {
      document.getElementById('newFlashBtn')?.addEventListener('click', () => openFlashForm(null));
      wireListActions('promo', reloadPromo, (id) => openFlashForm(flashCache.find(p => p.id === id)));
    }
  };
  async function openFlashForm(p) {
    const products = await liveProducts();
    const now = new Date(), later = new Date(Date.now() + 6 * 3600000);
    openSheet(p ? 'Edit flash sale' : 'Create flash sale', `
      <form id="flashForm">
        <label class="field"><span>Sale name</span><input type="text" name="ttl" required maxlength="60" value="${esc(p ? p.title : '')}" placeholder="e.g. Weekend Flash Sale"></label>
        <div class="form-row two">
          <label class="field"><span>Start date &amp; time</span><input type="datetime-local" name="start" required value="${toLocalInput(p ? p.start : now)}"></label>
          <label class="field"><span>End date &amp; time</span><input type="datetime-local" name="end" required value="${toLocalInput(p ? p.end : later)}"></label>
        </div>
        <div class="form-row two">
          <label class="field"><span>Discount (%)</span><input type="number" name="value" required min="1" max="90" step="1" value="${p ? p.value : ''}"></label>
          <label class="field"><span>Budget (₹) <span class="field-hint">(max total discount)</span></span><input type="number" name="budget" required min="0" step="1" value="${p ? p.budget : 1000}"></label>
        </div>
        <div class="field"><span>Products in the sale</span>${pickerHtml(products, p ? p.products : [], 'flash')}</div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-sheet-close>Cancel</button><button class="btn btn-primary" id="flashGo">${p ? 'Save changes' : 'Start flash sale'}</button></div>
      </form>`, {
      wide: true,
      onOpen: (sh) => {
        const form = sh.el.querySelector('#flashForm');
        wirePicker(form.querySelector('.picker'));
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const ids = pickerValues(form), val = Number(form.value.value);
          const s = new Date(form.start.value), en = new Date(form.end.value);
          if (!ids.length) return showToast('Select at least one product', 'error');
          if (!(val >= 1 && val <= 90)) return showToast('Discount must be between 1 and 90%', 'error');
          if (!(en > s)) return showToast('End time must be after the start time', 'error');
          const btn = form.querySelector('#flashGo'); BtnState.start(btn);
          try {
            await DB.savePromotion({ type: 'flash_sale', title: form.ttl.value.trim(), discountType: 'percentage', value: val, products: ids, start: s.toISOString(), end: en.toISOString(), budget: Number(form.budget.value) || 0, status: p && p.status === 'paused' ? 'paused' : 'active' }, p ? p.id : null);
            await BtnState.ok(btn); sh.close(); showToast(p ? 'Flash sale updated' : 'Flash sale created'); reloadPromo();
          } catch (err) { console.error(err); BtnState.fail(btn); showToast('Could not save the flash sale', 'error'); }
        });
      }
    });
  }

  PROMO_TAB.price = {
    render: async () => {
      const [products, history] = await Promise.all([liveProducts(), DB.getPriceHistory().catch(() => [])]);
      const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
      const byId = new Map(products.map(p => [String(p.id), p.name]));
      return `
      <div class="card panel">
        <div class="panel-head"><h3>Bulk price update</h3></div>
        <form id="priceForm">
          <div class="field"><span>Apply to</span>
            <div class="seg"><label><input type="radio" name="scope" value="all" checked><span>All products</span></label><label><input type="radio" name="scope" value="selected"><span>Selected</span></label><label><input type="radio" name="scope" value="category"><span>By category</span></label></div></div>
          <div id="scopeSelected" hidden class="field"><span>Products</span>${pickerHtml(products, [], 'price')}</div>
          <div id="scopeCategory" hidden class="field"><span>Categories</span><div class="chip-wrap">${cats.map(c => `<label class="check-chip"><input type="checkbox" name="cat" value="${esc(c)}"><span>${esc(c)}</span></label>`).join('') || '<span class="cell-muted">No categories yet</span>'}</div></div>
          <div class="form-row three">
            <label class="field"><span>Change</span><select name="ctype"><option value="inc_pct">Increase by %</option><option value="dec_pct">Decrease by %</option><option value="inc_amt">Increase by ₹</option><option value="dec_amt">Decrease by ₹</option></select></label>
            <label class="field"><span>Value</span><input type="number" name="cval" min="0.01" step="0.01" required></label>
            <label class="field"><span>Effective date</span><input type="date" name="eff" min="${localDate()}" value="${localDate()}" required></label>
          </div>
          <p class="cell-muted" style="font-size:12.5px;margin:-4px 0 12px">Selling price never goes above MRP. Future dates are applied the next time you open the dashboard on/after that day.</p>
          <div id="pricePreview"></div>
          <div class="modal-actions" style="justify-content:flex-start"><button type="button" class="btn btn-outline" id="priceBtnPreview">Preview</button><button class="btn btn-primary" id="priceBtnApply">Apply price changes</button></div>
        </form>
      </div>
      <div class="card panel">
        <div class="panel-head"><h3>Recent price changes</h3></div>
        ${history.length ? history.slice(0, 25).map(h => `<div class="review-row"><span>${esc(byId.get(String(h.product_id)) || 'Product #' + h.product_id)}<div class="cell-muted" style="font-size:11.5px">${h.status === 'scheduled' ? 'Scheduled for ' + fmtDate(h.effective_date) : fmtDate(h.created_at)}</div></span><span>${h.status === 'scheduled' ? '<span class="pill pill-teal">Scheduled</span>' : money(h.old_price) + ' → ' + money(h.new_price)}</span></div>`).join('') : emptyBlock('tag', 'No price changes yet', 'Your bulk updates will be listed here.')}
      </div>`;
    },
    after: async () => {
      const form = document.getElementById('priceForm'); if (!form) return;
      const products = await liveProducts();
      wirePicker(form.querySelector('.picker'), () => { document.getElementById('pricePreview').innerHTML = ''; });
      const sync = () => { const s = form.scope.value; document.getElementById('scopeSelected').hidden = s !== 'selected'; document.getElementById('scopeCategory').hidden = s !== 'category'; document.getElementById('pricePreview').innerHTML = ''; };
      form.addEventListener('change', sync);
      const target = () => {
        const s = form.scope.value;
        if (s === 'selected') return products.filter(p => pickerValues(form).includes(Number(p.id)));
        if (s === 'category') { const c = [...form.querySelectorAll('[name=cat]:checked')].map(x => x.value); return products.filter(p => c.includes(p.category)); }
        return products;
      };
      const plan = () => {
        const t = target(), v = Number(form.cval.value);
        if (!t.length) { showToast('No products match your selection', 'error'); return null; }
        if (!(v > 0)) { showToast('Enter a change value', 'error'); return null; }
        if ((form.ctype.value === 'inc_pct' || form.ctype.value === 'dec_pct') && form.ctype.value === 'dec_pct' && v >= 100) { showToast('Decrease must be under 100%', 'error'); return null; }
        return t.map(p => { const r = computeNewPrice(p.price, p.mrp, form.ctype.value, v); return { id: p.id, name: p.name, oldPrice: p.price, newPrice: r.price, capped: r.capped, mrp: p.mrp }; });
      };
      const showPreview = () => {
        const pl = plan(); if (!pl) return null;
        document.getElementById('pricePreview').innerHTML = `<div class="table-wrap" style="margin-bottom:12px"><table class="data-table"><thead><tr><th>Product</th><th>Old</th><th>New</th></tr></thead><tbody>${pl.slice(0, 40).map(i => `<tr><td class="cell-strong">${esc(i.name)}</td><td class="cell-mono">${money(i.oldPrice)}</td><td class="cell-mono">${i.newPrice > 0 ? money(i.newPrice) : 'skipped'}${i.capped ? ' <span class="pill pill-amber">capped at MRP</span>' : ''}</td></tr>`).join('')}</tbody></table>${pl.length > 40 ? `<p class="cell-muted" style="font-size:12px;padding:6px 14px">+ ${pl.length - 40} more products</p>` : ''}</div>`;
        return pl;
      };
      document.getElementById('priceBtnPreview').addEventListener('click', showPreview);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pl = showPreview(); if (!pl) return;
        const eff = form.eff.value, future = eff > localDate();
        const ok = await confirmDialog(future ? 'Schedule price change?' : 'Apply price changes?', `${pl.length} product${pl.length === 1 ? '' : 's'} will be updated${future ? ' on ' + fmtDate(eff) : ' now'}. Customers will see the new prices.`);
        if (!ok) return;
        const btn = document.getElementById('priceBtnApply'); BtnState.start(btn, 'Applying…');
        const meta = { changeType: form.ctype.value, changeValue: Number(form.cval.value), effective: eff, scope: form.scope.value };
        try {
          if (future) { const n = await DB.schedulePriceChange(pl.map(i => i.id), meta); showToast(`${n} price change${n === 1 ? '' : 's'} scheduled`); }
          else { const r = await DB.applyPriceChange(pl, meta); showToast(`${r.done} price${r.done === 1 ? '' : 's'} updated${r.capped ? ` (${r.capped} capped at MRP)` : ''}${r.skipped ? `, ${r.skipped} skipped` : ''}`); }
          await BtnState.ok(btn, 'Applied Successfully'); reloadPromo();
        } catch (err) { console.error(err); BtnState.fail(btn, 'Failed — Retry'); showToast('Could not apply the price changes', 'error'); }
      });
    }
  };

  let featuredCache = [];
  // No payment gateway: pay straight from any UPI app on the phone, or scan the MediFinder QR (medifinder.png), then confirm.
  // Set window.MF_UPI_ID (e.g. in supabase-constants.js) to MediFinder's receiving UPI ID to enable the "Pay with UPI app" button.
  const PLATFORM_UPI_ID = () => window.MF_UPI_ID || globalPick(['MF_UPI_ID', 'PLATFORM_UPI_ID', 'UPI_ID']) || '';
  const QR_IMAGE = 'medifinder.png';
  function payForFeatured(promo) {
    if (!promo) return;
    const days = Math.max(1, Math.round((new Date(promo.end) - new Date(promo.start)) / 86400000));
    const upi = PLATFORM_UPI_ID();
    const upiLink = upi ? `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent('MediFinder India')}&am=${Number(promo.budget).toFixed(2)}&cu=INR&tn=${encodeURIComponent('Featured ' + promo.products.length + ' products x ' + days + ' days')}` : '';
    openSheet('Pay for promotion', `
      <div class="calc-box" style="margin-bottom:12px"><span>${promo.products.length} product${promo.products.length === 1 ? '' : 's'} × ${days} day${days === 1 ? '' : 's'}</span><span>Total: <b>${money(promo.budget)}</b></span></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${upiLink ? `<a class="btn btn-primary" id="payUpiBtn" href="${esc(upiLink)}" style="width:100%">Pay with UPI app</a>` : ''}
        <button type="button" class="btn btn-outline" id="payQrBtn" style="width:100%">Pay by QR code</button>
      </div>
      <div id="payQrBox" hidden style="text-align:center;margin-top:14px"><img src="${QR_IMAGE}" alt="MediFinder India payment QR" style="max-width:260px;width:100%;margin:0 auto;border:1px solid var(--ink-100);border-radius:12px"><p class="cell-muted" style="font-size:12.5px;margin-top:8px">Scan with any UPI app and pay ${money(promo.budget)}.</p></div>
      <p class="cell-muted" style="font-size:12.5px;margin-top:14px">After you have paid, tap <b>Yes, continue</b>.</p>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-sheet-close>Cancel</button><button type="button" class="btn btn-primary" id="payDoneBtn" disabled>Yes, continue</button></div>`, {
      onOpen: (sh) => {
        const done = sh.el.querySelector('#payDoneBtn'), arm = () => { done.disabled = false; };
        sh.el.querySelector('#payUpiBtn')?.addEventListener('click', () => setTimeout(arm, 600));
        sh.el.querySelector('#payQrBtn').addEventListener('click', () => { sh.el.querySelector('#payQrBox').hidden = false; arm(); });
        done.addEventListener('click', async () => {
          BtnState.start(done, 'Confirming…');
          try { await DB.activateFeatured(promo.id, 'UPI'); await BtnState.ok(done, 'Payment Confirmed'); sh.close(); showToast('Payment confirmed — your products are featured'); reloadPromo(); }
          catch (err) { console.error(err); BtnState.fail(done, 'Failed — Retry'); showToast(err.message || 'Could not confirm payment', 'error'); }
        });
      }
    });
  }
  PROMO_TAB.featured = {
    render: async () => {
      const [products, list] = await Promise.all([liveProducts(), DB.getPromotions(['featured'])]);
      featuredCache = list;
      return `
      <div class="card panel">
        <div class="panel-head"><h3>Promote products ⭐</h3></div>
        <p class="cell-muted" style="font-size:13px;margin-bottom:12px">Featured products are shown first to customers. Rate: <b>₹${RATE_PER_DAY} / product / day</b>.</p>
        <form id="featForm">
          <div class="field"><span>Select products</span>${pickerHtml(products, [], 'feat')}</div>
          <label class="field"><span>How many days?</span><input type="number" name="days" min="1" max="90" step="1" value="7" required></label>
          <div class="calc-box"><span><b id="fCount" style="color:var(--ink-900)">0</b> products × <b id="fDays" style="color:var(--ink-900)">7</b> days × ₹${RATE_PER_DAY}</span><span>Total: <b id="fTotal">₹0</b></span></div>
          <button class="btn btn-primary" id="featGo" style="width:100%">Continue to payment</button>
        </form>
      </div>
      <div class="card panel">
        <div class="panel-head"><h3>Your promotions</h3></div>
        ${list.length ? list.map(p => `<div class="list-row" style="padding-left:0;padding-right:0">
          <div class="list-row-main"><div class="cell-strong">${p.products.length} product${p.products.length === 1 ? '' : 's'} · ${money(p.budget)}</div><div class="cell-muted list-sub">${esc(productNames(p.products, products))}</div><div class="cell-muted list-sub">${dateRange(p.start, p.end)}${p.status === 'active' ? ` · ${p.impressions} views · ${p.clicks} clicks` : ''}</div></div>
          <div class="list-row-side">${promoPill(p.status)}${p.status === 'pending_payment' ? `<button class="btn btn-primary btn-sm" data-pay-featured="${p.id}">Pay now</button><button class="btn btn-ghost btn-sm" data-pl-del="${p.id}" aria-label="Delete">${icon('trash')}</button>` : ''}</div>
        </div>`).join('') : emptyBlock('star', 'Nothing promoted yet', 'Pick products above to feature them.')}
      </div>`;
    },
    after: () => {
      const form = document.getElementById('featForm');
      if (form) {
        const upd = () => { const n = pickerValues(form).length, d = Math.max(0, Math.floor(Number(form.days.value) || 0)); document.getElementById('fCount').textContent = n; document.getElementById('fDays').textContent = d; document.getElementById('fTotal').textContent = money(n * d * RATE_PER_DAY); };
        wirePicker(form.querySelector('.picker'), upd);
        form.days.addEventListener('input', upd);
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const ids = pickerValues(form), days = Math.floor(Number(form.days.value));
          if (!ids.length) return showToast('Select at least one product', 'error');
          if (!(days >= 1 && days <= 90)) return showToast('Choose between 1 and 90 days', 'error');
          const total = ids.length * days * RATE_PER_DAY;
          const btn = document.getElementById('featGo'); BtnState.start(btn, 'Preparing…');
          try {
            const start = new Date(), end = new Date(Date.now() + days * 86400000);
            const promo = await DB.savePromotion({ type: 'featured', title: `Featured · ${ids.length} product${ids.length === 1 ? '' : 's'} · ${days} day${days === 1 ? '' : 's'}`, discountType: 'percentage', value: 0, products: ids, start: start.toISOString(), end: end.toISOString(), budget: total, status: 'pending_payment' }, null);
            BtnState.reset(btn); payForFeatured(promo); reloadPromo();
          } catch (err) { console.error(err); BtnState.fail(btn, 'Failed — Retry'); showToast('Could not start the payment', 'error'); }
        });
      }
      document.querySelectorAll('[data-pay-featured]').forEach(b => b.addEventListener('click', () => payForFeatured(featuredCache.find(p => p.id === b.dataset.payFeatured))));
      wireListActions('promo', reloadPromo, () => {});
    }
  };

  /* ---- Offers: join an admin-run offer (e.g. Durga Puja Offer) with your products ---- */
  PROMO_TAB.offers = {
    render: async () => {
      const [camps, products, mine] = await Promise.all([DB.getOpenCampaigns(), liveProducts(), DB.getMyCampaignProducts()]);
      const now = Date.now();
      if (!camps.length) return `<div class="card panel">${emptyBlock('zap', 'No offer is running right now', 'When MediFinder India starts an offer (like a festival sale), it appears here and you can add your products to it.')}</div>`;
      return `<p class="cell-muted" style="font-size:13px;margin:0 0 12px">Add your products to an offer — customers see them on that offer's Deals page, grouped by category. Prices stay the same; run a discount or flash sale to make them cheaper.</p>` +
        camps.map(c => {
          const picked = mine.filter(m => m.campaign_id === c.id && m.status === 'approved').map(m => m.medicine_id);
          const removed = mine.filter(m => m.campaign_id === c.id && m.status === 'removed').length;
          const live = new Date(c.start_at).getTime() <= now;
          return `<form class="card panel offer-join" data-offer="${esc(c.id)}">
            <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:10px">
              ${c.image_url ? `<img src="${esc(c.image_url)}" alt="" style="width:84px;height:58px;object-fit:cover;border-radius:10px;flex:none">` : ''}
              <div style="min-width:0;flex:1"><div class="cell-strong">${esc(c.title)}</div>
                <div class="cell-muted list-sub">${esc(c.discount_text || '')}</div>
                <div class="cell-muted list-sub">${fmtDateTime(c.start_at)} → ${fmtDateTime(c.end_at)}</div></div>
              <span class="pill ${live ? 'pill-green' : 'pill-teal'}">${live ? 'Live' : 'Starts soon'}</span>
            </div>
            <div class="field"><span>Your products in this offer</span>${pickerHtml(products, picked, 'offer_' + c.id)}</div>
            ${removed ? `<p class="cell-muted" style="font-size:12px;margin:6px 0">${removed} of your product${removed === 1 ? ' was' : 's were'} removed by MediFinder India and cannot be added again.</p>` : ''}
            <button class="btn btn-primary" data-offer-save="${esc(c.id)}" style="width:100%;margin-top:10px">Save products for this offer</button>
          </form>`;
        }).join('');
    },
    after: () => {
      document.querySelectorAll('form.offer-join').forEach(form => {
        wirePicker(form.querySelector('.picker'), null);
        const id = form.dataset.offer;
        form.addEventListener('submit', (e) => e.preventDefault());
        form.querySelector('[data-offer-save]').addEventListener('click', async (e) => {
          const btn = e.currentTarget, chosen = pickerValues(form);
          BtnState.start(btn, 'Saving…');
          try {
            const mine = (await DB.getMyCampaignProducts()).filter(m => m.campaign_id === id && m.status === 'approved').map(m => Number(m.medicine_id));
            const add = chosen.filter(x => !mine.includes(x)), remove = mine.filter(x => !chosen.includes(x));
            await DB.saveCampaignProducts(id, add, remove);
            BtnState.reset(btn); showToast(chosen.length ? `${chosen.length} product${chosen.length === 1 ? '' : 's'} in this offer` : 'Removed from offer');
          } catch (err) { console.error(err); BtnState.fail(btn, 'Failed — Retry'); showToast(err.message || 'Could not save', 'error'); }
        });
      });
    }
  };

  PROMO_TAB.analytics = {
    render: async () => {
      const a = await DB.getPromoAnalytics();
      return `
      <div class="stat-grid">
        <div class="card stat-card"><div class="stat-label">Total discounts given</div><div class="stat-value">${money(a.discountsGiven)}</div></div>
        <div class="card stat-card"><div class="stat-label">Revenue from promotions</div><div class="stat-value">${money(a.promoRevenue)}</div><div class="stat-delta">${a.promoOrders} order${a.promoOrders === 1 ? '' : 's'}</div></div>
        <div class="card stat-card"><div class="stat-label">Coupon redemptions</div><div class="stat-value">${a.redemptions}</div></div>
        <div class="card stat-card accent"><div class="stat-label">Promo ROI</div><div class="stat-value">${a.roi === null ? '—' : a.roi + '%'}</div><div class="stat-delta">${a.roi === null ? 'No promo spend yet' : (a.roi >= 0 ? 'Profitable' : 'Below cost')}</div></div>
      </div>
      <div class="card panel"><p class="cell-muted" style="font-size:13px">ROI = (promotion revenue − cost) ÷ cost, where cost = discounts given (${money(a.discountsGiven)}) + featured-product spend (${money(a.featuredSpend)}). Cancelled orders are excluded.</p></div>`;
    }
  };

  PROMO_TAB.how = {
    render: async () => {
      const steps = [
        ['zap', 'Offers', 'Join an offer run by MediFinder India (festival sales etc.) by adding your products. Customers see them on the offer\'s Deals page, grouped by category.'],
        ['percent', 'Discounts', 'Pick products and reduce their price by a % or a flat ₹ amount. Pause or resume any time.'],
        ['tag', 'Coupons', 'Create a code (e.g. SAVE10). Customers enter it at checkout. Set a minimum order, a cap and a usage limit.'],
        ['zap', 'Flash sales', 'A time-boxed sale. Set start/end time, discount % and a budget — the sale stops when the budget is used up.'],
        ['wallet', 'Price management', 'Change many prices at once — all products, selected ones or by category. Prices never exceed MRP.'],
        ['star', 'Featured', `Pay ₹${RATE_PER_DAY} per product per day to show your products first to customers.`],
        ['chart', 'Analytics', 'See discounts given, revenue from promotions, coupon redemptions and your ROI.']
      ];
      return `<div class="card panel">${steps.map(([ic, t, d]) => `<div class="how-row"><div class="profile-row-icon">${icon(ic)}</div><div><div class="cell-strong">${t}</div><div class="cell-muted" style="font-size:13px">${d}</div></div></div>`).join('')}</div>`;
    }
  };

  const SEGMENTS = [
    ['new', 'New', 'First order within the last 30 days'],
    ['regular', 'Regular', 'Ordered more than once and active'],
    ['vip', 'VIP', '5+ orders or ₹5,000+ spent'],
    ['inactive', 'Inactive', 'No order in the last 60 days']
  ];
  const SEG_PILL = { new: 'pill-teal', regular: 'pill-gray', vip: 'pill-green', inactive: 'pill-amber' };
  const CUSTOMER_TABS = [['list', 'Customer list'], ['analytics', 'Analytics'], ['segments', 'Segments']];
  let customerCache = [];

  PAGES.customers = async (param) => {
    const tab = CUSTOMER_TABS.some(t => t[0] === param) ? param : 'list';
    state.custTab = tab;
    const list = await DB.getCustomers();
    customerCache = list;
    let body = '';
    if (tab === 'list') body = customersListHtml(list);
    else if (tab === 'analytics') body = customersAnalyticsHtml(list);
    else body = customersSegmentsHtml(list);
    return `
    <div class="page-head"><div><h1>Customers</h1><p class="page-sub">${list.length} customer${list.length === 1 ? '' : 's'}</p></div></div>
    <div class="chip-row" style="margin-bottom:16px">${CUSTOMER_TABS.map(([k, l]) => `<button class="filter-chip${k === tab ? ' active' : ''}" data-route="customers" data-param="${k}">${l}</button>`).join('')}</div>
    ${body}`;
  };

  function filteredCustomers() {
    const f = state.filters.customers;
    let l = customerCache.filter(c => f.segment === 'all' || c.segment === f.segment);
    if (f.q) { const q = f.q.toLowerCase(); l = l.filter(c => (c.name + ' ' + c.email + ' ' + c.phone).toLowerCase().includes(q)); }
    const sorters = { recent: (a, b) => (b.last || 0) - (a.last || 0), spent: (a, b) => b.spent - a.spent, orders: (a, b) => b.count - a.count, name: (a, b) => a.name.localeCompare(b.name) };
    return l.sort(sorters[f.sort] || sorters.recent);
  }
  function customerRowsHtml(list) {
    if (!list.length) return emptyBlock('users', 'No customers found', 'Customers appear here after their first order.');
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Customer</th><th>Contact</th><th>Orders</th><th>Spent</th><th>Last order</th><th>Segment</th></tr></thead><tbody>${list.map(c => `
      <tr data-customer="${esc(c.key)}" style="cursor:pointer"><td class="cell-strong">${esc(c.name)}</td><td class="cell-muted">${esc(c.email || c.phone || '—')}</td><td>${c.count}</td><td class="cell-mono">${money(c.spent)}</td><td class="cell-muted">${c.last ? fmtDate(c.last) : '—'}</td><td><span class="pill ${SEG_PILL[c.segment]}">${c.segment}</span></td></tr>`).join('')}</tbody></table></div>
    <div class="item-cards" style="padding:10px">${list.map(c => `
      <div class="item-card" data-customer="${esc(c.key)}" style="cursor:pointer"><div class="item-card-body">
        <div class="item-card-title">${esc(c.name)}</div><div class="item-card-sub">${esc(c.email || c.phone || '—')}</div>
        <div class="item-card-meta"><span class="pill ${SEG_PILL[c.segment]}">${c.segment}</span><span class="cell-muted" style="font-size:12px">${c.count} order${c.count === 1 ? '' : 's'} · ${money(c.spent)}</span></div></div></div>`).join('')}</div>`;
  }
  function customersListHtml(list) {
    const f = state.filters.customers;
    return `
    <div class="toolbar">
      <div class="search-box">${icon('search')}<input type="text" id="custSearch" placeholder="Search name, email or phone" value="${esc(f.q)}"></div>
      <select id="custSegment" class="filter-chip"><option value="all">All segments</option>${SEGMENTS.map(([k, l]) => `<option value="${k}"${f.segment === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <select id="custSort" class="filter-chip">${[['recent', 'Latest order'], ['spent', 'Most spent'], ['orders', 'Most orders'], ['name', 'Name A–Z']].map(([k, l]) => `<option value="${k}"${f.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="card" id="custList">${customerRowsHtml(filteredCustomers())}</div>`;
  }
  function customersAnalyticsHtml(list) {
    const count = (s) => list.filter(c => c.segment === s).length;
    const revenue = list.reduce((s, c) => s + c.spent, 0), orders = list.reduce((s, c) => s + c.count, 0);
    return `
    <div class="stat-grid">
      <div class="card stat-card"><div class="stat-label">Total customers</div><div class="stat-value">${list.length}</div></div>
      <div class="card stat-card"><div class="stat-label">New customers</div><div class="stat-value">${count('new')}</div></div>
      <div class="card stat-card"><div class="stat-label">Regular customers</div><div class="stat-value">${count('regular')}</div></div>
      <div class="card stat-card"><div class="stat-label">VIP customers</div><div class="stat-value">${count('vip')}</div></div>
      <div class="card stat-card"><div class="stat-label">Inactive customers</div><div class="stat-value">${count('inactive')}</div></div>
      <div class="card stat-card accent"><div class="stat-label">Total revenue</div><div class="stat-value">${money(revenue)}</div></div>
      <div class="card stat-card"><div class="stat-label">Average order value</div><div class="stat-value">${money(orders ? revenue / orders : 0)}</div></div>
    </div>`;
  }
  function customersSegmentsHtml(list) {
    const count = (s) => list.filter(c => c.segment === s).length;
    return `
    <div class="seg-grid">${SEGMENTS.map(([k, l, d]) => `<div class="card seg-card"><span class="pill ${SEG_PILL[k]}">${l}</span><div class="stat-value">${count(k)}</div><div class="cell-muted" style="font-size:12.5px">${d}</div></div>`).join('')}</div>
    <div class="card panel">
      <div class="panel-head"><h3>Bulk message</h3></div>
      <form id="bulkForm">
        <label class="field"><span>Select segment</span><select name="segment">${SEGMENTS.map(([k, l]) => `<option value="${k}">${l} (${count(k)})</option>`).join('')}<option value="all">Everyone (${list.length})</option></select></label>
        <label class="field"><span>Title</span><input type="text" name="subject" required maxlength="60" placeholder="e.g. 10% off this weekend"></label>
        <label class="field"><span>Message</span><textarea name="message" rows="4" required maxlength="300" placeholder="Write your message…"></textarea><span class="field-hint" id="bulkCount">0 / 300</span></label>
        <button class="btn btn-primary" id="bulkGo">Send to segment</button>
      </form>
    </div>`;
  }

  AFTER.customers = () => {
    const bindRows = () => document.querySelectorAll('[data-customer]').forEach(el => el.addEventListener('click', () => openCustomerSheet(customerCache.find(c => c.key === el.dataset.customer))));
    const redraw = () => { document.getElementById('custList').innerHTML = customerRowsHtml(filteredCustomers()); bindRows(); };
    document.getElementById('custSearch')?.addEventListener('input', (e) => { state.filters.customers.q = e.target.value; redraw(); });
    document.getElementById('custSegment')?.addEventListener('change', (e) => { state.filters.customers.segment = e.target.value; redraw(); });
    document.getElementById('custSort')?.addEventListener('change', (e) => { state.filters.customers.sort = e.target.value; redraw(); });
    bindRows();
    const bulk = document.getElementById('bulkForm');
    if (bulk) {
      bulk.message.addEventListener('input', () => { document.getElementById('bulkCount').textContent = bulk.message.value.length + ' / 300'; });
      bulk.addEventListener('submit', async (e) => {
        e.preventDefault();
        const seg = bulk.segment.value;
        const targets = customerCache.filter(c => seg === 'all' || c.segment === seg);
        if (!targets.length) return showToast('No customers in this segment', 'error');
        const ok = await confirmDialog('Send message?', `This will be sent to ${targets.length} customer${targets.length === 1 ? '' : 's'}.`);
        if (!ok) return;
        const btn = document.getElementById('bulkGo'); BtnState.start(btn, 'Sending…');
        try {
          const r = await DB.sendBulkMessage(targets, bulk.subject.value.trim(), bulk.message.value.trim());
          showToast(`Sent to ${r.logged} customer${r.logged === 1 ? '' : 's'}${r.delivered < r.logged ? ` (${r.delivered} have the app inbox)` : ''}`);
          bulk.reset(); document.getElementById('bulkCount').textContent = '0 / 300';
          BtnState.ok(btn, 'Sent Successfully');
        } catch (err) { console.error(err); BtnState.fail(btn, 'Send Failed — Retry'); showToast('Could not send the message', 'error'); }
      });
    }
  };
  function openCustomerSheet(c) {
    if (!c) return;
    openSheet(c.name, `
      <div style="margin-bottom:10px"><span class="pill ${SEG_PILL[c.segment]}">${c.segment}</span></div>
      <div class="review-row"><span>Email</span><span>${esc(c.email || '—')}</span></div>
      <div class="review-row"><span>Phone</span><span>${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : '—'}</span></div>
      <div class="review-row"><span>Total orders</span><span>${c.count}</span></div>
      <div class="review-row"><span>Total spent</span><span>${money(c.spent)}</span></div>
      <div class="review-row"><span>Last order</span><span>${c.last ? fmtDate(c.last) : '—'}</span></div>
      <h4 style="margin:16px 0 6px;font-size:13px;color:var(--ink-500)">Order history</h4>
      ${c.orders.slice(0, 15).map(o => `<div class="review-row" data-route="orders" data-param="${o.id}" style="cursor:pointer"><span>${esc(o.code)}<div class="cell-muted" style="font-size:11.5px">${fmtDate(o.createdAt)}</div></span><span>${money(o.total)} ${statusPill(o.status)}</span></div>`).join('')}`);
  }

  const RETURN_TABS = [['all', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['refunded', 'Refunded'], ['completed', 'Completed']];
  const RET_PILL = { pending: ['pill-amber', 'Pending'], approved: ['pill-teal', 'Approved'], rejected: ['pill-red', 'Rejected'], refunded: ['pill-green', 'Refunded'], completed: ['pill-green', 'Completed'] };
  const retPill = (s) => { const [c, l] = RET_PILL[s] || ['pill-gray', s]; return `<span class="pill ${c}"><span class="pill-dot"></span>${l}</span>`; };
  let returnsCache = [];

  PAGES.returns = async (param) => {
    const list = await DB.getReturns();
    returnsCache = list;
    if (param) return renderReturnDetail(list.find(r => r.id === param));
    const f = state.filters.returns;
    return `
    <div class="page-head"><div><h1>Returns</h1><p class="page-sub">${list.length} request${list.length === 1 ? '' : 's'} · ${list.filter(r => r.status === 'pending').length} pending</p></div></div>
    <div class="toolbar"><div class="search-box">${icon('search')}<input type="text" id="retSearch" placeholder="Search return, order or customer" value="${esc(f.q)}"></div></div>
    <div class="chip-row" style="margin-bottom:16px">${RETURN_TABS.map(([k, l]) => `<button class="filter-chip${f.status === k ? ' active' : ''}" data-ret-filter="${k}">${l}${k !== 'all' ? ` (${list.filter(r => r.status === k).length})` : ''}</button>`).join('')}</div>
    <div class="card" id="retList">${returnRowsHtml(filteredReturns())}</div>`;
  };
  function filteredReturns() {
    const f = state.filters.returns;
    let l = returnsCache.filter(r => f.status === 'all' || r.status === f.status);
    if (f.q) { const q = f.q.toLowerCase(); l = l.filter(r => (r.code + ' ' + r.orderCode + ' ' + r.customer + ' ' + r.product).toLowerCase().includes(q)); }
    return l;
  }
  function returnRowsHtml(list) {
    if (!list.length) return emptyBlock('undo', 'No return requests', 'Return requests from customers will appear here.');
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Return</th><th>Order</th><th>Customer</th><th>Product</th><th>Reason</th><th>Amount</th><th>Requested</th><th>Status</th></tr></thead><tbody>${list.map(r => `
      <tr data-route="returns" data-param="${r.id}" style="cursor:pointer"><td class="cell-mono cell-strong">${r.code}</td><td class="cell-mono">${esc(r.orderCode)}</td><td>${esc(r.customer)}</td><td>${esc(r.product)}${r.qty > 1 ? ' × ' + r.qty : ''}</td><td class="cell-muted">${esc(r.reason)}</td><td class="cell-mono">${money(r.amount)}</td><td class="cell-muted">${fmtDate(r.requestDate)}</td><td>${retPill(r.status)}</td></tr>`).join('')}</tbody></table></div>
    <div class="item-cards" style="padding:10px">${list.map(r => `
      <div class="item-card" data-route="returns" data-param="${r.id}" style="cursor:pointer"><div class="item-card-body">
        <div class="item-card-title">${r.code} · ${esc(r.product)}</div><div class="item-card-sub">${esc(r.customer)} · ${esc(r.reason)}</div>
        <div class="item-card-meta">${retPill(r.status)}<span class="cell-muted" style="font-size:12px">${money(r.amount)} · ${timeAgo(r.requestDate)}</span></div></div></div>`).join('')}</div>`;
  }
  AFTER.returns = () => {
    document.getElementById('retSearch')?.addEventListener('input', (e) => { state.filters.returns.q = e.target.value; document.getElementById('retList').innerHTML = returnRowsHtml(filteredReturns()); });
    document.querySelectorAll('[data-ret-filter]').forEach(b => b.addEventListener('click', () => { state.filters.returns.status = b.dataset.retFilter; render(); }));
    const id = parseHash()[1];
    if (id) wireReturnDetail(returnsCache.find(r => r.id === id));
  };

  function returnTimeline(r) {
    const steps = [{ t: 'Return requested', d: r.requestDate, done: true }];
    if (r.status === 'rejected') { steps.push({ t: 'Rejected', d: r.updatedAt, done: true }); return steps; }
    steps.push({ t: 'Approved', d: r.status !== 'pending' ? r.updatedAt : null, done: r.status !== 'pending' });
    steps.push({ t: 'Pickup scheduled', d: r.pickupDate, done: !!r.pickupDate });
    steps.push({ t: 'Item received', d: r.receivedDate, done: !!r.receivedDate });
    steps.push({ t: 'Refund processed', d: r.refundedAt, done: r.status === 'refunded' || r.status === 'completed' });
    steps.push({ t: 'Completed', d: null, done: r.status === 'completed' });
    return steps;
  }
  const SLOTS = [['9 AM – 12 PM', 9], ['12 PM – 3 PM', 12], ['3 PM – 6 PM', 15]];

  function renderReturnDetail(r) {
    if (!r) return emptyBlock('undo', 'Return not found', 'It may have been removed.', `<button class="btn btn-outline btn-sm" data-route="returns">Back to returns</button>`);
    const approved = ['approved', 'refunded', 'completed'].includes(r.status);
    const fee = r.restockingFee;
    return `
    <button class="detail-back" data-route="returns">${icon('chevronL')}<span>Back to returns</span></button>
    <div class="page-head" style="margin-bottom:14px"><div><h1 style="font-size:18px">${r.code}</h1><p class="page-sub">Requested ${fmtDateTime(r.requestDate)}</p></div>${retPill(r.status)}</div>
    <div class="detail-cols">
      <div>
        <div class="card panel"><div class="panel-head"><h3>Customer</h3></div>
          <div class="review-row"><span>Name</span><span>${esc(r.customer)}</span></div>
          <div class="review-row"><span>Phone</span><span>${r.phone ? `<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : '—'}</span></div>
          <div class="review-row"><span>Email</span><span>${esc(r.email || '—')}</span></div>
          <div class="review-row"><span>Address</span><span>${esc(r.address || '—')}</span></div></div>
        <div class="card panel"><div class="panel-head"><h3>Product &amp; order</h3></div>
          <div class="review-row"><span>Product</span><span>${esc(r.product)} × ${r.qty}</span></div>
          <div class="review-row"><span>Order ID</span><span class="cell-mono">${esc(r.orderCode)}</span></div>
          <div class="review-row"><span>Payment</span><span>${esc(r.paymentMode || '—')}${r.paymentState ? ' · ' + esc(r.paymentState) : ''}</span></div>
          <div class="review-row"><span>Item value</span><span>${money(r.originalAmount)}</span></div></div>
        <div class="card panel"><div class="panel-head"><h3>Return reason</h3></div>
          <div class="review-row"><span>Reason</span><span>${esc(r.reason)}</span></div>
          ${r.description ? `<p style="font-size:13.5px;margin:8px 0">${esc(r.description)}</p>` : ''}
          ${r.photos.length ? `<div class="photo-row">${r.photos.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Return photo"></a>`).join('')}</div>` : '<p class="cell-muted" style="font-size:12.5px">No photos attached.</p>'}
          ${r.notes ? `<div class="rejection-note" style="margin:12px 0 0"><strong>Your notes:</strong> ${esc(r.notes)}</div>` : ''}</div>
      </div>
      <div>
        <div class="card panel"><div class="panel-head"><h3>Timeline</h3></div><div class="order-timeline">
          ${returnTimeline(r).map(s => `<div class="timeline-step${s.done ? ' done' : ''}"><div class="timeline-dot"></div><div><div class="timeline-title">${s.t}</div>${s.d && s.done ? `<div class="timeline-time">${fmtDateTime(s.d)}</div>` : ''}</div></div>`).join('')}</div></div>

        ${r.status === 'pending' ? `<div class="card panel"><div class="panel-head"><h3>Decision</h3></div><div class="modal-actions" style="justify-content:flex-start;margin-top:0"><button class="btn btn-primary" data-ret-act="approve">Approve return</button><button class="btn btn-outline" data-ret-act="reject">Reject</button></div></div>` : ''}

        ${approved ? `<div class="card panel"><div class="panel-head"><h3>Pickup</h3></div>
          ${r.returnAwb ? `<div class="review-row"><span>Courier</span><span>${esc(r.returnCourier)}</span></div><div class="review-row"><span>AWB</span><span class="cell-mono">${esc(r.returnAwb)}</span></div><p class="cell-muted" style="font-size:12px;margin-top:6px">Pickup is arranged automatically. "Received" is marked when the courier delivers it back to you.</p>` : ''}
          ${r.pickupDate && !r.returnAwb ? `<div class="review-row"><span>Date</span><span>${fmtDate(r.pickupDate)}</span></div><div class="review-row"><span>Slot</span><span>${esc(r.pickupSlot || '—')}</span></div><div class="review-row"><span>Address</span><span>${esc(r.pickupAddress || '—')}</span></div>` : ''}
          ${r.status === 'approved' && !r.returnAwb ? `<button class="btn btn-outline" style="margin-top:10px" data-ret-act="pickup">${r.pickupDate ? 'Reschedule pickup' : 'Schedule pickup'}</button>` : ''}
          ${r.status === 'approved' && !r.receivedDate && !r.returnAwb ? `<button class="btn btn-primary" style="margin:10px 0 0 8px" data-ret-act="received">Mark item received</button>` : ''}</div>

        <div class="card panel"><div class="panel-head"><h3>Refund</h3></div>
          <div class="review-row"><span>Original amount</span><span>${money(r.originalAmount)}</span></div>
          ${r.status === 'approved' ? `
          <form id="refundForm" style="margin-top:10px">
            <div class="form-row two">
              <label class="field"><span>Restocking fee (₹)</span><input type="number" name="fee" min="0" step="1" value="${fee}"></label>
              <label class="field"><span>Refund to</span><select name="rmethod"><option>Original payment method</option><option>Store wallet</option><option>Bank transfer</option></select></label>
            </div>
            <div class="calc-box"><span>Refund amount</span><b id="refundAmt">${money(Math.max(0, r.originalAmount - fee))}</b></div>
            <button class="btn btn-primary" id="refundGo" ${r.receivedDate ? '' : 'disabled'}>Process refund</button>
            ${r.receivedDate ? '' : '<p class="cell-muted" style="font-size:12px;margin-top:6px">Mark the item as received before refunding.</p>'}
          </form>` : `
          <div class="review-row"><span>Restocking fee</span><span>${money(r.restockingFee)}</span></div>
          <div class="review-row"><span>Refund amount</span><span>${money(r.amount)}</span></div>
          <div class="review-row"><span>Method</span><span>${esc(r.refundMethod || '—')}</span></div>`}
          <p class="cell-muted" style="font-size:11.5px;margin-top:8px">Processing records the refund and notifies the customer; the money transfer itself is done through your payment provider.</p></div>

        <div class="card panel"><div class="panel-head"><h3>Completion</h3></div>
          <div class="review-row"><span>Item received</span><span>${r.receivedDate ? '✓ ' + fmtDate(r.receivedDate) : 'Not yet'}</span></div>
          <div class="review-row"><span>Refund processed</span><span>${r.status === 'refunded' || r.status === 'completed' ? '✓ ' + fmtDate(r.refundedAt) : 'Not yet'}</span></div>
          ${r.status === 'refunded' ? `<button class="btn btn-primary" style="margin-top:10px" data-ret-act="complete">Mark as completed</button>` : ''}</div>` : ''}
      </div>
    </div>`;
  }

  function wireReturnDetail(r) {
    if (!r) return;
    const key = { userId: r.userId, email: r.email, phone: r.phone };
    const done = (msg) => { showToast(msg); render(); };
    const note = (title, message) => notifyCustomer(key, { title, message, orderCode: r.orderCode, type: 'return' });
    const fail = (err) => { console.error(err); showToast('Could not update this return', 'error'); };
    const refundForm = document.getElementById('refundForm');
    if (refundForm) {
      const upd = () => { document.getElementById('refundAmt').textContent = money(Math.max(0, r.originalAmount - (Number(refundForm.fee.value) || 0))); };
      refundForm.fee.addEventListener('input', upd);
      refundForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fee = Math.max(0, Number(refundForm.fee.value) || 0), amt = Math.max(0, r.originalAmount - fee);
        const ok = await confirmDialog('Process refund?', `${money(amt)} will be refunded via "${refundForm.rmethod.value}".`);
        if (!ok) return;
        const rbtn = submitBtn(e, refundForm); BtnState.start(rbtn, 'Processing…');
        try {
          await DB.updateReturn(r.id, { status: 'refunded', refund_status: 'processed', refund_amount: amt, restocking_fee: fee, refund_method: refundForm.rmethod.value, refund_processed_at: new Date().toISOString() });
          await note('Refund processed', `Your refund of ${money(amt)} for ${r.product} (order ${r.orderCode}) has been processed via ${refundForm.rmethod.value}.`);
          await BtnState.ok(rbtn, 'Refund Processed');
          done('Refund processed');
        } catch (err) { BtnState.fail(rbtn, 'Failed — Retry'); fail(err); }
      });
    }
    document.querySelectorAll('[data-ret-act]').forEach(b => b.addEventListener('click', async () => {
      const act = b.dataset.retAct;
      try {
        if (act === 'approve') {
          BtnState.start(b, 'Approving…');
          await DB.updateReturn(r.id, { status: 'approved' });
          let msg = 'Return approved';
          try {
            showToast('Booking return pickup…');
            const bk = await DB.bookReturnPickup(r.id);
            if (bk && bk.awb_code) { msg = `Return approved · pickup booked with ${bk.courier_name} (AWB ${bk.awb_code})`; await note('Return approved', `Your return for ${r.product} (order ${r.orderCode}) was approved. ${bk.courier_name} will pick it up (AWB ${bk.awb_code}).`); }
            else await note('Return approved', `Your return for ${r.product} (order ${r.orderCode}) was approved. A pickup will be scheduled.`);
          } catch (e) { console.error(e); msg = 'Return approved, but courier pickup could not be booked — schedule it manually'; await note('Return approved', `Your return for ${r.product} (order ${r.orderCode}) was approved. A pickup will be scheduled.`); }
          await BtnState.ok(b, 'Return Approved', 500);
          done(msg);
        }
        else if (act === 'reject') {
          openSheet('Reject return', `<form id="rejForm"><label class="field"><span>Reason for rejection</span><textarea name="reason" rows="3" required maxlength="200"></textarea></label><div class="modal-actions"><button type="button" class="btn btn-ghost" data-sheet-close>Back</button><button class="btn btn-danger">Reject return</button></div></form>`, {
            onOpen: (sh) => sh.el.querySelector('#rejForm').addEventListener('submit', async (e) => {
              e.preventDefault();
              const reason = e.target.reason.value.trim(), xbtn = submitBtn(e, e.target); BtnState.start(xbtn, 'Rejecting…');
              try { await DB.updateReturn(r.id, { status: 'rejected', merchant_notes: reason }); await note('Return rejected', `Your return for ${r.product} (order ${r.orderCode}) was rejected. Reason: ${reason}`); await BtnState.ok(xbtn, 'Return Rejected'); sh.close(); done('Return rejected'); } catch (err) { BtnState.fail(xbtn, 'Failed — Retry'); fail(err); }
            })
          });
        }
        else if (act === 'pickup') {
          openSheet('Schedule pickup', `<form id="pickForm">
            <div class="form-row two"><label class="field"><span>Pickup date</span><input type="date" name="date" min="${localDate()}" value="${r.pickupDate ? localDate(new Date(r.pickupDate)) : localDate()}" required></label>
            <label class="field"><span>Time slot</span><select name="tslot">${SLOTS.map(([l]) => `<option${r.pickupSlot === l ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
            <label class="field"><span>Pickup address</span><textarea name="addr" rows="2" required>${esc(r.pickupAddress)}</textarea></label>
            <div class="modal-actions"><button type="button" class="btn btn-ghost" data-sheet-close>Cancel</button><button class="btn btn-primary">Schedule pickup</button></div></form>`, {
            onOpen: (sh) => sh.el.querySelector('#pickForm').addEventListener('submit', async (e) => {
              e.preventDefault();
              const f = e.target, hour = (SLOTS.find(s => s[0] === f.tslot.value) || SLOTS[0])[1];
              const when = new Date(f.date.value + 'T' + String(hour).padStart(2, '0') + ':00:00');
              const pbtn = submitBtn(e, f); BtnState.start(pbtn, 'Scheduling…');
              try { await DB.updateReturn(r.id, { return_pickup_date: when.toISOString(), pickup_slot: f.tslot.value, pickup_address: f.addr.value.trim() }); await note('Pickup scheduled', `Pickup for your return (order ${r.orderCode}) is scheduled on ${fmtDate(when)}, ${f.tslot.value}.`); await BtnState.ok(pbtn, 'Pickup Scheduled'); sh.close(); done('Pickup scheduled'); } catch (err) { BtnState.fail(pbtn, 'Failed — Retry'); fail(err); }
            })
          });
        }
        else if (act === 'received') { BtnState.start(b); await DB.updateReturn(r.id, { return_received_date: new Date().toISOString() }); await BtnState.ok(b, 'Marked Received', 500); done('Marked as received'); }
        else if (act === 'complete') { BtnState.start(b); await DB.updateReturn(r.id, { status: 'completed' }); await note('Return completed', `Your return for order ${r.orderCode} is complete.`); await BtnState.ok(b, 'Completed', 500); done('Return completed'); }
      } catch (err) { BtnState.fail(b, 'Failed — Retry'); fail(err); }
    }));
  }

  PAGES.delivery = async () => {
    const active = await DB.getDelivery();
    const own = active.filter(o => o.partner !== 'courier');
    const courier = active.filter(o => o.partner === 'courier');
    const tab = state.filters.delivery.tab;
    const list = tab === 'courier' ? courier : own;

    const card = (o) => {
      const isC = o.partner === 'courier';
      const mapLink = !isC && o.riderLat && o.riderLon ? `<a class="link-a" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${o.riderLat},${o.riderLon}">Track rider on map</a>` : '';
      return `<div class="card panel">
        <div class="panel-head"><h3 class="wrap">${esc(o.code)}</h3>${statusPill(o.status)}</div>
        <div class="review-row"><span>Customer</span><span>${esc(o.customer)}</span></div>
        <div class="review-row"><span>Deliver to</span><span>${esc(o.address || '—')}</span></div>
        ${isC ? `
          <div class="review-row"><span>Courier</span><span>${esc(o.courierName || '—')}</span></div>
          <div class="review-row"><span>Tracking ID</span><span class="cell-mono">${esc(o.courierTracking || '—')}</span></div>
          ${o.courierProvider ? `<p class="cell-muted" style="font-size:12px;margin-top:8px">Delivered status updates automatically from the courier.</p>` : `<div class="modal-actions" style="justify-content:flex-start"><button class="btn btn-outline btn-sm" data-order-action="courier" data-order-id="${o.id}">Edit tracking</button><button class="btn btn-primary btn-sm" data-order-action="delivered" data-order-id="${o.id}">Mark delivered</button></div>`}`
          : `
          <div class="review-row"><span>Rider</span><span>${o.rider ? esc(o.rider) : 'Waiting for a rider to accept'}</span></div>
          ${o.rider && o.riderPhone ? `<div class="review-row"><span>Rider phone</span><span><a href="tel:${esc(o.riderPhone)}">${esc(o.riderPhone)}</a></span></div>` : ''}
          ${o.riderVehicle ? `<div class="review-row"><span>Vehicle</span><span>${esc(o.riderVehicle)}</span></div>` : ''}
          ${o.riderSeenAt ? `<div class="review-row"><span>Last location</span><span>${timeAgo(o.riderSeenAt)}</span></div>` : ''}
          ${mapLink ? `<div style="margin-top:8px">${mapLink}</div>` : ''}`}
      </div>`;
    };
    return `
    <div class="page-head"><div><h1>Delivery</h1><p class="page-sub">${active.length} active</p></div></div>
    <div class="chip-row" style="margin-bottom:16px">
      <button class="filter-chip${tab === 'medifinder' ? ' active' : ''}" data-del-tab="medifinder">MediFinder India riders (${own.length})</button>
      <button class="filter-chip${tab === 'courier' ? ' active' : ''}" data-del-tab="courier">Courier company (${courier.length})</button>
    </div>
    ${list.length ? `<div class="delivery-grid">${list.map(card).join('')}</div>` : `<div class="card">${emptyBlock('truck', 'No active deliveries', tab === 'courier' ? 'Orders you hand to a courier company will be tracked here.' : 'Orders picked up by MediFinder India riders will be tracked here.')}</div>`}`;
  };
  AFTER.delivery = () => {
    document.querySelectorAll('[data-del-tab]').forEach(b => b.addEventListener('click', () => { state.filters.delivery.tab = b.dataset.delTab; render(); }));
    document.querySelectorAll('[data-order-action]').forEach(b => b.addEventListener('click', async () => {
      const order = await DB.getOrder(b.dataset.orderId); if (!order) return;
      try {
        if (b.dataset.orderAction === 'delivered') { const ok = await confirmDialog('Mark as delivered?', 'The customer will be notified.'); if (ok) { await DB.markDelivered(order); showToast('Order delivered'); render(); } }
        else openCourierSheet(order, () => render());
      } catch (err) { console.error(err); showToast('Could not update this order', 'error'); }
    }));
  };

  const NOTIF_ICON = { order: 'orders', rx: 'rx', prescription: 'rx', stock: 'inventory', rider: 'truck', payout: 'wallet', return: 'undo', admin: 'bell', system: 'bell' };
  const notifIcon = (t) => NOTIF_ICON[String(t || '').toLowerCase()] || 'bell';
  /* Real push is handled by push-notifications.js (window.MFPush) — it subscribes this device and saves it to Supabase.
     Its on/off preference lives in localStorage 'mf_push_pref'. */
  const PUSH_PREF_KEY = 'mf_push_pref';
  function pushState() {
    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    const perm = supported ? Notification.permission : 'unsupported';
    let pref = null; try { pref = localStorage.getItem(PUSH_PREF_KEY); } catch (e) { /* storage blocked */ }
    return { supported, perm, on: supported && perm === 'granted' && pref !== 'off' };
  }
  async function setPush(on) {
    if (!window.MFPush) return { ok: false, perm: Notification.permission };
    if (on) {
      const r = await window.MFPush.enable();      // sets pref ON, asks permission if needed, subscribes + saves to Supabase
      if (!r || !r.ok) return { ok: false, perm: Notification.permission, reason: r && r.reason };
      return { ok: true, perm: 'granted' };
    }
    try { localStorage.setItem(PUSH_PREF_KEY, 'off'); } catch (e) { /* storage blocked */ }
    await window.MFPush.disable();                  // removes this device from Supabase + unsubscribes
    return { ok: true, perm: Notification.permission };
  }
  function pushCardHtml() {
    const st = pushState();
    let sub = 'Get alerts for new orders and prescriptions even when the app is closed.';
    if (!st.supported) sub = 'Push notifications are not supported on this browser.';
    else if (st.perm === 'denied') sub = 'Blocked in your browser settings. Allow notifications for this site to turn them on.';
    return `<div class="card push-card"><div class="settings-row"><div><div class="settings-row-label">Push notifications</div><div class="settings-row-sub" id="pushSub">${sub}</div></div><button class="switch${st.on ? ' on' : ''}" id="pushToggle" role="switch" aria-checked="${st.on}" aria-label="Push notifications"${st.supported ? '' : ' disabled'}></button></div></div>`;
  }
  function wirePush(root) {
    const btn = root.querySelector('#pushToggle');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const next = !btn.classList.contains('on');
      btn.classList.add('busy');
      try {
        const r = await setPush(next);
        if (!r.ok) { showToast(r.perm === 'denied' ? 'Notifications are blocked — allow them in browser settings' : 'Could not turn on push — please try again', 'error'); return; }
        btn.classList.toggle('on', next); btn.setAttribute('aria-checked', String(next));
        showToast(next ? 'Push notifications on' : 'Push notifications off');
      } catch (err) { console.error(err); showToast('Could not change push setting', 'error'); }
      finally { btn.classList.remove('busy'); }
    });
  }
  function notifListHtml(list) {
    return list.map(n => `
      <div class="notif-item${n.read ? '' : ' unread'}" data-notif-read="${n.id}">
        <div class="notif-icon">${icon(notifIcon(n.type))}</div>
        <div class="notif-body">
          <div class="notif-title">${esc(n.title)}</div>
          <div class="notif-msg">${esc(n.message)}</div>
          <div class="notif-time">${timeAgo(n.time)}</div>
        </div>
      </div>`).join('');
  }
  function wireNotifs(root, after) {
    wirePush(root);
    root.querySelectorAll('[data-notif-read]').forEach(el => el.addEventListener('click', async () => { await DB.markNotifRead(el.dataset.notifRead); el.classList.remove('unread'); refreshBadges(); }));
    root.querySelector('#markAllReadBtn')?.addEventListener('click', async () => { await DB.markAllNotifRead(); refreshBadges(); after(); });
  }
  PAGES.notifications = async () => {
    const list = await DB.getNotifications();
    if (!list.length) return `<div class="page-head"><h1>Notifications</h1></div>${pushCardHtml()}<div class="card">${emptyBlock('bell', 'You’re all caught up', 'New orders, prescriptions and alerts will show up here.')}</div>`;
    return `
    <div class="page-head">
      <div><h1>Notifications</h1><p class="page-sub">${list.filter(n => !n.read).length} unread</p></div>
      <div class="page-head-actions"><button class="btn btn-outline btn-sm" id="markAllReadBtn">Mark all as read</button></div>
    </div>
    ${pushCardHtml()}
    <div class="card">${notifListHtml(list)}</div>`;
  };
  AFTER.notifications = () => wireNotifs(document.getElementById('pageOutlet'), () => render());

  PAGES.payments = async () => {
    const p = await DB.getPayments();
    const payoutRows = p.payoutHistory.map(x => `<tr><td class="cell-mono">${x.id}</td><td class="cell-muted">${fmtDate(x.date)}</td><td class="cell-mono">${money(x.amount)}</td><td><span class="pill ${x.paid ? 'pill-green' : 'pill-amber'}">${esc(x.status)}</span></td></tr>`).join('');
    const txnRows = p.transactions.map(x => `<tr><td class="cell-mono">${x.id}</td><td class="cell-mono cell-muted">${esc(x.orderId)}</td><td class="cell-muted">${fmtDate(x.date)}</td><td>${esc(x.type)}</td><td class="cell-mono" style="color:${x.amount < 0 ? 'var(--red-600)' : 'inherit'}">${x.amount < 0 ? '-' : ''}${money(Math.abs(x.amount))}</td><td><span class="pill ${/Paid by admin/.test(x.status) ? 'pill-green' : /Pending/.test(x.status) ? 'pill-amber' : 'pill-gray'}">${esc(x.status)}</span></td></tr>`).join('');
    return `
    <div class="page-head"><div><h1>Payments</h1><p class="page-sub">Earnings and payout history</p></div></div>
    <div class="stat-grid">
      <div class="card stat-card"><div class="stat-label">Total sales</div><div class="stat-value">${money(p.totalSales)}</div></div>
      <div class="card stat-card"><div class="stat-label">Completed orders</div><div class="stat-value">${p.completedOrders}</div></div>
      <div class="card stat-card"><div class="stat-label">Pending payout</div><div class="stat-value">${money(p.pendingAmount)}</div></div>
      <div class="card stat-card"><div class="stat-label">Platform fees</div><div class="stat-value">${money(p.platformFees)}</div></div>
    </div>
    <div class="card panel">
      <div class="panel-head"><h3>Payout history</h3></div>
      ${p.payoutHistory.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Payout ID</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>${payoutRows}</tbody></table></div>
      <div class="item-cards">${p.payoutHistory.map(x => `<div class="item-card"><div class="item-card-body"><div class="item-card-title">${money(x.amount)}</div><div class="item-card-sub">${x.id} · ${fmtDate(x.date)}</div></div><span class="pill ${x.paid ? 'pill-green' : 'pill-amber'}">${esc(x.status)}</span></div>`).join('')}</div>` : emptyBlock('wallet', 'No payouts yet', 'Payouts appear here once your delivered orders are settled.')}
    </div>
    <div class="card panel">
      <div class="panel-head"><h3>Transactions</h3></div>
      ${p.transactions.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Txn ID</th><th>Order</th><th>Date</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead><tbody>${txnRows}</tbody></table></div>
      <div class="item-cards">${p.transactions.map(x => `<div class="item-card"><div class="item-card-body"><div class="item-card-title">${esc(x.type)}</div><div class="item-card-sub">${esc(x.orderId)} · ${fmtDate(x.date)}</div><div class="item-card-sub">${esc(x.status)}</div></div><span class="cell-mono">${x.amount < 0 ? '-' : ''}${money(Math.abs(x.amount))}</span></div>`).join('')}</div>` : emptyBlock('wallet', 'No transactions yet', 'Delivered orders and refunds are listed here.')}
    </div>`;
  };

  PAGES.analytics = async () => {
    const a = await DB.getAnalytics();
    const maxTop = Math.max(...a.topProducts.map(p => p.sold), 1);
    return `
    <div class="page-head"><div><h1>Analytics</h1><p class="page-sub">Last 7 days</p></div></div>
    <div class="stat-grid">
      <div class="card stat-card"><div class="stat-label">Avg. order value</div><div class="stat-value">${money(a.avgOrderValue)}</div></div>
      <div class="card stat-card"><div class="stat-label">Delivered</div><div class="stat-value">${a.orderStatus.completed}</div></div>
      <div class="card stat-card"><div class="stat-label">Cancelled</div><div class="stat-value">${a.orderStatus.cancelled}</div></div>
      <div class="card stat-card"><div class="stat-label">In progress</div><div class="stat-value">${a.orderStatus.pending + a.orderStatus.preparing}</div></div>
    </div>
    <div class="section-grid">
      <div class="card chart-card"><div class="panel-head"><h3>Revenue — daily</h3></div>${barChart(a.salesByDay, a.dayLabels)}</div>
      <div class="card panel">
        <div class="panel-head"><h3>Top selling medicines</h3></div>
        ${a.topProducts.length ? `<div class="ranked-list">${a.topProducts.map((p, i) => `<div class="ranked-row"><span class="rank-num">${i + 1}</span><span class="rank-name cell-strong">${esc(p.name)}</span><div class="rank-bar-track"><div class="rank-bar-fill" style="width:${p.sold / maxTop * 100}%"></div></div><span class="rank-value">${p.sold} sold</span></div>`).join('')}</div>` : emptyBlock('chart', 'No sales yet', 'Your best sellers will show up here.')}
      </div>
    </div>
    <div class="card panel">
      <div class="panel-head"><h3>Low performing products</h3></div>
      ${a.lowPerforming.length ? a.lowPerforming.map(p => `<div class="review-row"><span>${esc(p.name)}</span><span>${p.sold} sold</span></div>`).join('') : emptyBlock('chart', 'Nothing here', 'Add products to see how they perform.')}
    </div>`;
  };

  const SUPPORT_EMAILS = ['support@medifinderindia.com'];
  const FAQ_GROUPS = [
    ['Getting started & KYC', [
      ['Why do I need to complete KYC?', 'KYC (store details, address, drug licence, ID and bank details) lets our team verify your pharmacy before you start selling. Until it is verified, some features stay locked.'],
      ['How long does verification take?', 'Our team reviews your submission and updates the status on your Profile. While it is under review your details are locked and cannot be edited.'],
      ['How do I change my drug licence details?', 'Once your KYC is verified, licence changes go through Support so our team can re-verify the document.'],
      ['How do I change my bank details?', 'Verified bank details are locked for safety. Raise a ticket under Support and we will re-verify the new details.'],
      ['What if my KYC is rejected?', 'Open your Profile, read the rejection note, correct the section mentioned and submit again.']
    ]],
    ['Orders', [
      ['How do I accept or reject an order?', 'Open Orders, tap the new order and accept it, or reject it with a reason. The customer is notified automatically.'],
      ['Can I cancel an order after accepting it?', 'Yes, use Reject order and choose a reason. Please cancel only when the medicine is genuinely unavailable.']
    ]],
    ['Prescription (RX)', [
      ['How does prescription (RX) ordering work?', 'Accept the request first, then add the medicines from your inventory — the price is filled in automatically — and create the order.']
    ]],
    ['Inventory & products', [
      ['How do I add a medicine?', 'Go to Inventory and tap Add product, then follow the steps.'],
      ['How do I update price or stock?', 'Open the product from Inventory and edit it. You can also schedule price changes to apply later.']
    ]],
    ['Promotions', [
      ['What promotions can I run?', 'You can create product discounts, coupon codes and flash sales, and feature products for more visibility, all from Promotions.']
    ]],
    ['Delivery', [
      ['Who delivers my orders?', 'When you dispatch an order choose MediFinder India delivery (our riders) or hand it to a courier company and add the tracking ID.'],
      ['How do I update courier tracking?', 'Open the order and choose Edit tracking to change the courier name or tracking ID.']
    ]],
    ['Returns', [
      ['How do I handle a return request?', 'Open Returns, review the reason and photos, then approve or reject. For approved returns you can schedule a pickup.']
    ]],
    ['Payments', [
      ['How do I get paid?', 'Payouts are processed to your registered bank account after order completion, shown under Payments.'],
      ['Can I turn off Cash on delivery?', 'Yes. Go to Settings → Order settings and switch Cash on delivery off.']
    ]],
    ['Account & settings', [
      ['How do I change the app language?', 'Open Profile → Language, or Settings → App preferences.'],
      ['Who do I contact for other problems?', 'Raise a ticket from Support or email us. Contact details are on the Support page.']
    ]]
  ];
  PAGES.faq = async () => `
    <div class="page-head"><div><h1>FAQ</h1><p class="page-sub">Answers to common merchant questions</p></div></div>
    ${FAQ_GROUPS.map(([title, items]) => `<div class="card panel faq-group"><div class="panel-head"><h3>${title}</h3></div>${items.map(([q, a]) => `<details class="faq-item"><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>`).join('')}
    <div class="card panel"><div class="panel-head"><h3>Still need help?</h3></div><button class="btn btn-outline" data-route="support">${icon('help')}<span>Go to Support</span></button></div>`;
  function supportHtml(tickets) {
    return `
      <div class="review-block"><h4>Contact us</h4>
        ${SUPPORT_EMAILS.map(e => `<a class="btn btn-outline" style="width:100%;justify-content:flex-start;margin-bottom:8px" href="mailto:${e}">${icon('help')}<span class="wrap">${e}</span></a>`).join('')}</div>
      <div class="review-block"><h4>Raise a ticket</h4>
        <form id="ticketForm">
          <label class="field"><span>Topic</span><select name="category">${['Order Issue', 'Payment Issue', 'Product Issue', 'Technical Issue', 'Other'].map(c => `<option>${c}</option>`).join('')}</select></label>
          <label class="field"><span>Subject</span><input type="text" name="subject" required maxlength="100"></label>
          <label class="field"><span>Describe the problem</span><textarea name="message" rows="3" required maxlength="1000"></textarea></label>
          <button class="btn btn-primary" id="ticketGo" style="width:100%">Submit ticket</button>
        </form></div>
      <div class="review-block"><h4>Your tickets</h4>
        ${tickets.length ? tickets.map(t => `<div class="review-row"><span>${esc(t.subject)}<div class="cell-muted" style="font-size:12px">${esc(t.id)} · ${esc(t.category)} · ${fmtDate(t.createdAt)}</div></span><span class="pill ${t.status === 'Open' ? 'pill-amber' : 'pill-green'}">${t.status}</span></div>`).join('') : '<p class="cell-muted" style="font-size:13px">No tickets yet.</p>'}</div>
      <div class="review-block"><h4>Frequently asked questions</h4>
        <button class="btn btn-outline" style="width:100%" data-route="faq">${icon('help')}<span>Open all FAQs</span></button></div>`;
  }
  function wireTicketForm(root, reload) {
    root.querySelector('#ticketForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target, btn = root.querySelector('#ticketGo'); BtnState.start(btn, 'Submitting…');
      try { await DB.createTicket(f.category.value, f.subject.value.trim(), f.message.value.trim()); await BtnState.ok(btn, 'Ticket Submitted'); showToast('Ticket submitted'); reload(); }
      catch (err) { console.error(err); BtnState.fail(btn, 'Failed — Retry'); showToast('Could not submit the ticket', 'error'); }
    });
  }
  PAGES.support = async () => `<div class="page-head"><div><h1>Support</h1></div></div><div class="card panel support-page">${supportHtml(await DB.getTickets())}</div>`;
  AFTER.support = () => wireTicketForm(document.getElementById('pageOutlet'), () => render());
  async function openSupportSheet() {
    const tickets = await DB.getTickets().catch(() => []);
    openSheet('Help & Support', supportHtml(tickets), { onOpen: (sh) => wireTicketForm(sh.el, () => openSupportSheet()) });
  }
  async function openNotificationsSheet() {
    const list = await DB.getNotifications().catch(() => []);
    const draw = async () => { const l = await DB.getNotifications().catch(() => []); sh.setHtml(inner(l)); wireNotifs(sh.el, draw); };
    const inner = (l) => pushCardHtml() + (l.length ? `<div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn btn-outline btn-sm" id="markAllReadBtn">Mark all as read</button></div><div class="notif-sheet">${notifListHtml(l)}</div>` : emptyBlock('bell', 'You’re all caught up', 'New orders, prescriptions and alerts will show up here.'));
    const sh = openSheet('Notifications', inner(list), { onOpen: (s) => wireNotifs(s.el, draw) });
  }

  PAGES.settings = async () => {
    const s = await DB.getSettings();
    return `
    <div class="page-head"><h1>Settings</h1></div>
    <div class="card panel">
      <div class="panel-head"><h3>Notifications</h3></div>
      ${settingsSwitch('notifOrders', 'New orders', s.notifOrders)}
      ${settingsSwitch('notifRx', 'Prescription requests', s.notifRx)}
      ${settingsSwitch('notifStock', 'Stock alerts', s.notifStock)}
      ${settingsSwitch('notifPayout', 'Payout updates', s.notifPayout)}
    </div>
    <div class="card panel">
      <div class="panel-head"><h3>Order settings</h3></div>
      <div class="settings-row"><div><div class="settings-row-label">Cash on delivery</div><div class="settings-row-sub">Allow customers to pay COD</div></div><button class="switch${s.codEnabled ? ' on' : ''}" data-setting="codEnabled" aria-label="Cash on delivery"></button></div>
    </div>
    <div class="card panel">
      <div class="panel-head"><h3>App preferences</h3></div>
      <div class="settings-row"><div class="settings-row-label">Language</div>${languageSelect(s.language)}</div>
      <div class="settings-row"><div class="settings-row-label">Theme</div>${themeOptsHtml()}</div>
    </div>
    ${COURIER_AUTO ? `<div class="card panel">
      <div class="panel-head"><h3>Courier pickup</h3></div>
      <div class="settings-row-sub" style="margin-bottom:10px">Register your shop as a NimbusPost pickup point so orders can ship with the cheaper courier.</div>
      <button class="btn btn-outline" id="nimbusWhBtn" style="width:100%;justify-content:flex-start">${icon('truck')}<span>NimbusPost pickup setup</span></button>
    </div>` : ''}
    <div class="card panel">
      <div class="panel-head"><h3>Security</h3></div>
      <button class="btn btn-outline" id="changePwBtn" style="width:100%;justify-content:flex-start">${icon('lock')}<span>Change password</span></button>
      <button class="btn btn-outline" id="deleteAccBtn" style="width:100%;justify-content:flex-start;margin-top:8px;color:var(--red-600)">${icon('trash')}<span>Delete account</span></button>
    </div>
    <div class="card panel">
      <button class="btn btn-danger" id="logoutBtn" style="width:100%">${icon('logout')}<span>Logout</span></button>
    </div>`;
  };
  const themeOptsHtml = () => `<div class="theme-seg" role="group" aria-label="Theme"><button type="button" data-theme-opt="light">Light</button><button type="button" data-theme-opt="dark">Dark</button></div>`;
  const languageSelect = (cur) => `<select id="langSelect" class="filter-chip" style="height:36px">${['English', 'Bengali', 'Hindi'].map(l => `<option${cur === l ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  function settingsSwitch(key, label, val) {
    return `<div class="settings-row"><div class="settings-row-label">${label}</div><button class="switch${val ? ' on' : ''}" data-setting="${key}" aria-label="${label}"></button></div>`;
  }
  function openDeleteAccountSheet() {
    openSheet('Delete account', `<form id="delAccForm">
      <div class="card" style="border:1px solid #f3c1c7;background:#fff5f6;margin-bottom:12px">
        <b style="color:var(--red-600)">This is permanent.</b>
        <p class="cell-muted" style="font-size:13px;margin:6px 0 0">Your merchant account, shop profile, KYC documents, products, coupons and promotions will be deleted, and your login will stop working. We cannot bring any of it back.</p>
      </div>
      <p class="cell-muted" style="font-size:12.5px;margin:0 0 10px">You cannot delete your account while you have active orders. Finish or cancel them first.</p>
      <label class="field"><span>Type DELETE to confirm</span><input type="text" name="confirm" autocomplete="off" autocapitalize="characters" required></label>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-sheet-close>Keep my account</button><button class="btn btn-danger" id="delAccBtn" disabled>Delete forever</button></div></form>`, {
      onOpen: (sh) => {
        const form = sh.el.querySelector('#delAccForm');
        const btn = sh.el.querySelector('#delAccBtn');
        form.confirm.addEventListener('input', () => { btn.disabled = form.confirm.value.trim() !== 'DELETE'; });
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (form.confirm.value.trim() !== 'DELETE') return;
          btn.disabled = true; btn.textContent = 'Deleting…';
          try {
            await DB.deleteAccount();
            sh.close();
            showToast('Account deleted');
            await doSignOut();
          } catch (err) {
            console.error(err);
            btn.disabled = false; btn.textContent = 'Delete forever';
            showToast(err.message || 'Could not delete the account', 'error');
          }
        });
      }
    });
  }
  async function confirmLogout() {
    const ok = await confirmDialog('Log out?', 'You will need to sign in again to access your merchant dashboard.');
    if (ok) { closeSheet(); await doSignOut(); }
  }
  function openPasswordSheet() {
    openSheet('Change password', `<form id="pwForm">
      <label class="field"><span>New password</span><input type="password" name="pw" required minlength="8" autocomplete="new-password"></label>
      <label class="field"><span>Confirm password</span><input type="password" name="pw2" required minlength="8" autocomplete="new-password"></label>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-sheet-close>Cancel</button><button class="btn btn-primary">Update password</button></div></form>`, {
      onOpen: (sh) => sh.el.querySelector('#pwForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        if (f.pw.value !== f.pw2.value) return showToast('Passwords do not match', 'error');
        try { await DB.changePassword(f.pw.value); sh.close(); showToast('Password updated'); } catch (err) { showToast(err.message || 'Could not update password', 'error'); }
      })
    });
  }
  async function nimbusWh(body) {
    const { data, error } = await sb.functions.invoke('nimbus-warehouse', { body });
    let b = data;
    if (!b && error && error.context && typeof error.context.json === 'function') { try { b = await error.context.json(); } catch (_e) { /* generic */ } }
    if (error || !b || b.success === false) throw new Error((b && b.error) || (error && error.message) || 'Request failed');
    return b;
  }
  function openNimbusWarehouseSheet() {
    openSheet('NimbusPost pickup setup', '<p class="cell-muted" style="font-size:13px">Checking…</p>', {
      onOpen: async (sh) => {
        const body = () => sh.el.querySelector('.sheet-body') || sh.el;
        const done = (id) => { body().innerHTML = `<p style="font-size:14px"><b>Connected ✓</b><br><span class="cell-muted">Pickup warehouse: ${esc(id)}</span></p><div class="modal-actions"><button class="btn btn-primary" data-sheet-close>Done</button></div>`; };
        try {
          const st = await nimbusWh({ action: 'status' });
          if (st.connected) return done(st.warehouse_id);
          body().innerHTML = `<p style="font-size:13px;margin-bottom:12px">We will send an OTP to your shop phone <b>${esc(st.phone || '')}</b> (pincode ${esc(st.pincode || '')}) to register your pickup point with NimbusPost.</p>
            <form id="nbWhForm"><div id="nbOtpRow" style="display:none"><label class="field"><span>OTP</span><input type="text" name="otp" inputmode="numeric" maxlength="8" autocomplete="one-time-code"></label></div>
            <div class="modal-actions"><button type="button" class="btn btn-ghost" data-sheet-close>Cancel</button><button class="btn btn-primary" id="nbWhGo">Send OTP</button></div></form>`;
          const f = body().querySelector('#nbWhForm'), go = body().querySelector('#nbWhGo'); let sent = false;
          f.addEventListener('submit', async (e) => {
            e.preventDefault();
            const wasSent = sent;
            if (wasSent && !String(f.otp.value || '').trim()) { showToast('Enter the OTP first', 'error'); return; }
            BtnState.start(go, wasSent ? 'Connecting…' : 'Sending OTP…');
            try {
              if (!sent) {
                await nimbusWh({ action: 'send_otp' }); sent = true; f.querySelector('#nbOtpRow').style.display = '';
                await BtnState.ok(go, 'OTP Sent', 700); BtnState.reset(go); go.textContent = 'Verify & create'; showToast('OTP sent');
              } else {
                const r = await nimbusWh({ action: 'create', otp: f.otp.value });
                await BtnState.ok(go, 'Pickup Connected', 700); showToast('Pickup point connected'); done(r.warehouse_id);
              }
            } catch (err) { BtnState.fail(go, wasSent ? 'Verify Failed — Retry' : 'OTP Failed — Retry'); showToast(err.message || 'Failed', 'error'); }
          });
        } catch (err) { body().innerHTML = `<p class="cell-muted">${esc(err.message || 'Could not load')}</p>`; }
      }
    });
  }
  AFTER.settings = () => {
    document.querySelectorAll('[data-setting]').forEach(btn => btn.addEventListener('click', async () => {
      const key = btn.dataset.setting, next = !btn.classList.contains('on');
      try { await DB.saveSettings({ [key]: next }); btn.classList.toggle('on', next); showToast('Preference saved'); }
      catch (err) { console.error(err); showToast('Could not save', 'error'); }
    }));
    document.getElementById('langSelect')?.addEventListener('change', async (e) => { await DB.saveSettings({ language: e.target.value }); showToast('Language updated'); });
    document.getElementById('logoutBtn')?.addEventListener('click', confirmLogout);
    document.getElementById('changePwBtn')?.addEventListener('click', openPasswordSheet);
    document.getElementById('deleteAccBtn')?.addEventListener('click', openDeleteAccountSheet);
    document.getElementById('nimbusWhBtn')?.addEventListener('click', openNimbusWarehouseSheet);
  };

  const KYC_STATUS_META = {
    not_started: { dot: '🔴', label: 'Verification Required' },
    in_progress: { dot: '🟠', label: 'Verification In Progress' },
    pending_review: { dot: '🟠', label: 'Verification Pending' },
    verified: { dot: '🟢', label: 'Verified Merchant' },
    rejected: { dot: '🔴', label: 'KYC Rejected' }
  };
  const PHOTO_PH = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#eef0f3"/></svg>');

  PAGES.profile = async () => {
    const m = await DB.getMerchant();
    state.merchant = m; refreshMerchantChrome();
    likeInfo = await DB.getLikeCounts();
    const pct = kycPercent(m);
    const meta = KYC_STATUS_META[m.kyc.status] || KYC_STATUS_META.not_started;
    const locked = m.kyc.status !== 'verified';

    let kycCard = '';
    if (m.kyc.status === 'pending_review') {
      kycCard = `<div class="card kyc-card">
        <div class="kyc-progress-head"><h3>KYC Verification</h3><span class="kyc-progress-pct">100%</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:100%"></div></div>
        <p style="font-size:12.5px;color:var(--ink-500);margin-top:8px">Submitted on ${fmtDate(m.kyc.submittedOn)}. Our team is reviewing your documents — this usually takes 1–2 business days.</p>
        <button class="btn btn-outline" data-route="profile-kyc-review">View submitted information</button>
      </div>`;
    } else if (m.kyc.status === 'rejected') {
      kycCard = `<div class="card kyc-card">
        <div class="kyc-progress-head"><h3>KYC Verification</h3><span class="kyc-progress-pct">${pct}%</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:var(--red-500)"></div></div>
        <div class="rejection-note" style="margin-top:12px"><strong>Reason for rejection:</strong> ${esc(m.kyc.rejectionReason || 'Please review and resubmit your documents.')}</div>
        <button class="btn btn-primary" data-route="kyc-wizard">Fix &amp; resubmit</button>
      </div>`;
    } else if (m.kyc.status !== 'verified') {
      kycCard = `<div class="card kyc-card">
        <div class="kyc-progress-head"><h3>KYC Verification</h3><span class="kyc-progress-pct">${pct}%</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <p style="font-size:12.5px;color:var(--ink-500);margin-top:8px">${pct === 0 ? 'Complete your profile to start selling on MediFinder India.' : 'Continue where you left off.'}</p>
        <button class="btn btn-primary" data-route="kyc-wizard">${pct === 0 ? 'Complete KYC' : 'Continue KYC'}</button>
      </div>`;
    }

    const businessRows = [['store', 'store', 'Store Information'], ['address', 'pin', 'Business Address'], ['license', 'doc2', 'Documents'], ['identity', 'user', 'Identity'], ['bank', 'bank', 'Bank & Payment']].map(([key, ic, label]) => `
      <div class="profile-row card${locked ? ' locked' : ''}" ${locked ? '' : `data-route="kyc-detail" data-param="${key}"`}>
        <div class="profile-row-icon">${icon(ic)}</div>
        <span class="profile-row-label">${label}</span>
        ${locked ? '<span class="cell-muted" style="font-size:12px">Locked</span>' : ''}
        <span class="profile-row-chevron">${icon('chevronR')}</span>
      </div>`).join('');
    const unread = badgeCount('notif');

    return `
    <div class="page-head"><h1>Profile</h1></div>

    <div class="card profile-hero">
      <label class="profile-photo-wrap" title="Change photo"><img class="profile-photo" src="${esc(m.photo || PHOTO_PH)}" alt=""><input type="file" id="avatarInput" accept="image/*" hidden><span class="photo-edit">${icon('camera')}</span></label>
      <div class="profile-hero-info">
        <h2>${esc(m.shopName || 'Your pharmacy')}</h2>
        <div class="mid">Merchant ID: #${esc(m.id)}</div>
        <div class="mid" style="font-family:var(--font-ui);font-size:13px;font-weight:700;color:var(--red-600)">♥ ${likeInfo.total} total like${likeInfo.total === 1 ? '' : 's'} on your products</div>
        <span class="pill ${m.kyc.status === 'verified' ? 'pill-green' : m.kyc.status === 'rejected' ? 'pill-red' : 'pill-amber'}">${meta.dot} ${meta.label}</span>
      </div>
    </div>

    ${kycCard}

    <div class="nav-section-label">ACCOUNT</div>
    <div class="profile-list">
      <div class="profile-row card" data-profile-action="personal">${icon('user')}<span class="profile-row-label">Personal Information</span><span class="profile-row-chevron">${icon('chevronR')}</span></div>
      <div class="profile-row card" data-profile-action="contact">${icon('phone')}<span class="profile-row-label">Contact Information</span><span class="profile-row-chevron">${icon('chevronR')}</span></div>
      <div class="profile-row card" data-profile-action="signature">${icon('edit')}<span class="profile-row-label">Receipt Signature</span><span class="cell-muted" style="font-size:12.5px">${m.signature ? 'Added' : 'Optional'}</span><span class="profile-row-chevron">${icon('chevronR')}</span></div>
      <div class="profile-row card" data-profile-action="language">${icon('globe')}<span class="profile-row-label">Language</span><span class="cell-muted" style="font-size:12.5px">${esc(loadSettings().language)}</span><span class="profile-row-chevron">${icon('chevronR')}</span></div>
    </div>

    <div class="nav-section-label">BUSINESS</div>
    <div class="profile-list">${businessRows}</div>

    <div class="nav-section-label">SUPPORT</div>
    <div class="profile-list">
      <div class="profile-row card" data-profile-action="notifications">${icon('bell')}<span class="profile-row-label">Notifications</span>${unread ? `<span class="nav-badge inline">${unread}</span>` : ''}<span class="profile-row-chevron">${icon('chevronR')}</span></div>
      <div class="profile-row card" data-profile-action="support">${icon('help')}<span class="profile-row-label">Help &amp; Support</span><span class="profile-row-chevron">${icon('chevronR')}</span></div>
      <a class="profile-row card" href="${esc(TERMS_URL)}">${icon('doc2')}<span class="profile-row-label">Terms &amp; Conditions</span><span class="profile-row-chevron">${icon('chevronR')}</span></a>
      <a class="profile-row card" href="${esc(PRIVACY_URL)}">${icon('lock')}<span class="profile-row-label">Privacy Policy</span><span class="profile-row-chevron">${icon('chevronR')}</span></a>
      <div class="profile-row card" data-profile-action="logout">${icon('logout')}<span class="profile-row-label">Logout</span><span class="profile-row-chevron">${icon('chevronR')}</span></div>
      <div class="profile-row card" data-profile-action="delete-account" style="color:var(--red-600)">${icon('trash')}<span class="profile-row-label">Delete Account</span><span class="profile-row-chevron">${icon('chevronR')}</span></div>
    </div>`;
  };

  function openPersonalSheet() {
    const m = state.merchant;
    openSheet('Personal information', `<form id="persForm">
      <label class="field"><span>Owner name</span><input type="text" name="owner" required maxlength="80" value="${esc(m.ownerName)}"></label>
      <label class="field"><span>About your shop</span><textarea name="about" rows="3" maxlength="300">${esc(m.about)}</textarea></label>
      <p class="cell-muted" style="font-size:12px;margin-bottom:8px">Shop name, address and documents are part of KYC and can’t be edited here.</p>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-sheet-close>Cancel</button><button class="btn btn-primary">Save</button></div></form>`, {
      onOpen: (sh) => sh.el.querySelector('#persForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = submitBtn(e, e.target); BtnState.start(btn);
        try { state.merchant = await DB.updateMerchant({ owner_name: e.target.owner.value.trim(), about_shop: e.target.about.value.trim() }); refreshMerchantChrome(); await BtnState.ok(btn); sh.close(); showToast('Saved'); render(true); }
        catch (err) { console.error(err); BtnState.fail(btn); showToast('Could not save', 'error'); }
      })
    });
  }
  function openContactSheet() {
    const m = state.merchant;
    openSheet('Contact information', `<form id="contForm">
      <label class="field"><span>Phone number</span><input type="tel" name="phone" required pattern="[0-9+ ]{10,15}" title="Enter a valid phone number" value="${esc(m.phone)}"></label>
      <label class="field"><span>Email</span><input type="email" value="${esc(m.email)}" disabled><span class="field-hint">Your login email can’t be changed here.</span></label>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-sheet-close>Cancel</button><button class="btn btn-primary">Save</button></div></form>`, {
      onOpen: (sh) => sh.el.querySelector('#contForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = submitBtn(e, e.target); BtnState.start(btn);
        try { state.merchant = await DB.updateMerchant({ phone: e.target.phone.value.trim() }); await BtnState.ok(btn); sh.close(); showToast('Saved'); render(true); }
        catch (err) { console.error(err); BtnState.fail(btn); showToast('Could not save', 'error'); }
      })
    });
  }
  function openSignatureSheet() {
    const m = state.merchant;
    openSheet('Receipt signature', `<form id="sigForm">
      <p class="cell-muted" style="font-size:13px;margin:0 0 10px">Optional. Your signature is printed on the order receipts you issue. Sign on white paper and upload a clear PNG, JPG or WebP photo (max 2 MB).</p>
      <div id="sigPreviewBox" style="border:1px dashed #cfd5dd;border-radius:12px;padding:12px;background:#fff;text-align:center;margin-bottom:12px;min-height:80px">
        ${m.signature ? `<img id="sigPreview" src="${esc(m.signature)}" alt="Your signature" style="max-width:100%;max-height:120px;object-fit:contain">` : `<span class="cell-muted" id="sigEmpty" style="font-size:13px;line-height:80px">No signature added</span>`}
      </div>
      <label class="field"><span>${m.signature ? 'Replace signature' : 'Signature image'}</span><input type="file" name="sig" accept="image/png,image/jpeg,image/webp"></label>
      <div class="modal-actions">
        ${m.signature ? '<button type="button" class="btn btn-ghost" id="sigRemove">Remove</button>' : '<button type="button" class="btn btn-ghost" data-sheet-close>Cancel</button>'}
        <button class="btn btn-primary" id="sigSave">Save</button>
      </div></form>`, {
      onOpen: (sh) => {
        const form = sh.el.querySelector('#sigForm');
        form.sig.addEventListener('change', () => {
          const f = form.sig.files && form.sig.files[0]; if (!f) return;
          const box = sh.el.querySelector('#sigPreviewBox');
          box.innerHTML = ''; const im = document.createElement('img'); im.alt = 'Signature preview';
          im.style.cssText = 'max-width:100%;max-height:120px;object-fit:contain'; im.src = URL.createObjectURL(f); box.appendChild(im);
        });
        sh.el.querySelector('#sigRemove')?.addEventListener('click', async () => {
          const ok = await confirmDialog('Remove signature?', 'New receipts will be issued without a signature.'); if (!ok) return;
          try { state.merchant = await DB.removeSignature(); sh.close(); showToast('Signature removed'); render(true); }
          catch (err) { console.error(err); showToast('Could not remove the signature', 'error'); }
        });
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = form.sig.files && form.sig.files[0];
          if (!f) { showToast('Choose a signature image first', 'error'); return; }
          const btn = sh.el.querySelector('#sigSave'); BtnState.start(btn);
          try { state.merchant = await DB.uploadSignature(f); await BtnState.ok(btn); sh.close(); showToast('Signature saved'); render(true); }
          catch (err) { console.error(err); BtnState.fail(btn); showToast(err.message || 'Could not save the signature', 'error'); }
        });
      }
    });
  }
  function openLanguageSheet() {
    const cur = loadSettings().language;
    openSheet('Language', `<div>${['English', 'Bengali', 'Hindi'].map(l => `<label class="radio-card"><input type="radio" name="lang" value="${l}"${l === cur ? ' checked' : ''}><span class="radio-card-body"><b>${l}</b></span></label>`).join('')}</div>`, {
      onOpen: (sh) => sh.el.addEventListener('change', async (e) => { await DB.saveSettings({ language: e.target.value }); sh.close(); showToast('Language updated'); render(true); })
    });
  }
  AFTER.profile = () => {
    document.querySelectorAll('[data-profile-action]').forEach(el => el.addEventListener('click', () => {
      const a = el.dataset.profileAction;
      if (a === 'personal') openPersonalSheet();
      else if (a === 'contact') openContactSheet();
      else if (a === 'language') openLanguageSheet();
      else if (a === 'signature') openSignatureSheet();
      else if (a === 'notifications') openNotificationsSheet();
      else if (a === 'support') openSupportSheet();
      else if (a === 'logout') confirmLogout();
      else if (a === 'delete-account') openDeleteAccountSheet();
    }));
    document.getElementById('avatarInput')?.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try { state.merchant = await DB.uploadAvatar(f); refreshMerchantChrome(); showToast('Photo updated'); render(true); }
      catch (err) { console.error(err); showToast(err.message || 'Could not upload the photo', 'error'); }
    });
  };

  const KYC_SECTION_LABEL = { store: 'Store Information', address: 'Business Address', license: 'Documents', identity: 'Identity', bank: 'Bank & Payment' };
  const isPdfUrl = (u) => /\.pdf(\?|#|$)/i.test(u || '');
  const docView = (v) => !v ? `<div class="doc-preview">${icon('file')}<span>Not uploaded</span></div>`
    : isPdfUrl(v) ? `<a class="doc-preview" href="${esc(v)}" target="_blank" rel="noopener">${icon('file')}<span>Open PDF document</span></a>`
    : `<button type="button" class="doc-img" data-zoom="${esc(v)}" aria-label="View document full screen"><img src="${esc(v)}" alt="Document" loading="lazy"><span class="doc-img-hint">Tap to zoom</span></button>`;
  // stored file that is not an image (e.g. a PDF without extension) -> plain link fallback
  function wireDocImages(root) {
    (root || document).querySelectorAll('.doc-img img').forEach(img => img.addEventListener('error', () => {
      const b = img.closest('.doc-img'); if (!b) return;
      const a = document.createElement('a');
      a.className = 'doc-preview'; a.href = b.dataset.zoom; a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = `${icon('file')}<span>Open document</span>`;
      b.replaceWith(a);
    }));
  }
  function closeLightbox() { document.getElementById('lightbox')?.remove(); document.body.classList.remove('lightbox-open'); }
  function openLightbox(src) {
    closeLightbox();
    const lb = document.createElement('div');
    lb.id = 'lightbox'; lb.className = 'lightbox';
    lb.innerHTML = `<button class="lightbox-close" aria-label="Close">${icon('close')}</button><div class="lightbox-stage"><img src="${esc(src)}" alt="Document" draggable="false"></div><div class="lightbox-hint">Pinch or double-tap to zoom</div>`;
    document.getElementById('app').appendChild(lb);
    document.body.classList.add('lightbox-open');
    const stage = lb.querySelector('.lightbox-stage'), img = lb.querySelector('img');
    let s = 1, x = 0, y = 0, lastDist = 0, lastTap = 0;
    const pts = new Map();
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const apply = () => { if (s <= 1) { s = 1; x = 0; y = 0; } img.style.transform = `translate(${x}px,${y}px) scale(${s})`; };
    const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    stage.addEventListener('pointerdown', (e) => {
      stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { lastDist = dist(); return; }
      const now = Date.now();
      if (now - lastTap < 300) { s = s > 1 ? 1 : 2.5; x = 0; y = 0; apply(); }
      lastTap = now;
    });
    stage.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId); if (!prev) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const d = dist(); if (lastDist) s = clamp(s * d / lastDist, 1, 6); lastDist = d; apply(); }
      else if (s > 1) { x += e.clientX - prev.x; y += e.clientY - prev.y; apply(); }
    });
    const up = (e) => { pts.delete(e.pointerId); lastDist = 0; };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', (e) => { e.preventDefault(); s = clamp(s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 1, 6); apply(); }, { passive: false });
    lb.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  }
  document.addEventListener('click', (e) => {
    const z = e.target.closest('[data-zoom]');
    if (z) { e.preventDefault(); openLightbox(z.dataset.zoom); }
  });
  PAGES['kyc-detail'] = async (section) => {
    const m = await DB.getMerchant();
    if (!KYC_SECTION_LABEL[section]) return emptyBlock('doc2', 'Not found', 'This section does not exist.');
    const fields = kycSectionFields(m, section);
    return `
    <button class="detail-back" data-route="profile">${icon('chevronL')}<span>Back to profile</span></button>
    <div class="card detail-card">
      <div class="detail-status"><span class="pill pill-green">${icon('check')} Verified</span></div>
      <h2 style="font-size:17px;margin-bottom:14px">${KYC_SECTION_LABEL[section]}</h2>
      ${fields.map(([label, value, isDoc]) => isDoc ? `<div class="detail-field"><div class="detail-field-label">${label}</div>${docView(value)}</div>` : `<div class="detail-field"><div class="detail-field-label">${label}</div><div class="detail-field-value">${esc(value)}</div></div>`).join('')}
      ${section === 'address' ? pinMapBlock(m) : ''}
      <div class="detail-field"><div class="detail-field-label">Submitted on</div><div class="detail-field-value">${fmtDate(m.kyc.submittedOn)}</div></div>
      <div class="detail-field"><div class="detail-field-label">Verified on</div><div class="detail-field-value">${fmtDate(m.kyc.verifiedOn)}</div></div>
    </div>`;
  };
  AFTER['kyc-detail'] = () => wireDocImages(document.getElementById('pageOutlet'));
  AFTER['profile-kyc-review'] = AFTER['kyc-detail'];
  function kycSectionFields(m, section) {
    if (section === 'store') return [['Shop name', m.shopName || '—'], ['Owner name', m.ownerName || '—'], ['Business category', m.category || '—'], ['About shop', m.about || '—']];
    if (section === 'address') return [['Full address', m.address.fullAddress || '—'], ['City', m.address.city || '—'], ['District', m.address.district || '—'], ['State', m.address.state || '—'], ['Pincode', m.address.pincode || '—'], ['GPS location', m.address.gps || '—']];
    if (section === 'license') {
      const c = catInfo(m.category), dc = m.docs || { business: {}, gst: {}, trade: {}, fssai: {} };
      const rows = [['Business proof type', dc.business.type || '—'], ['Business proof document', dc.business.doc, true]];
      if (c.drug && m.license.number) rows.push(['Drug licence number', m.license.number || '—'], ['Drug licence expiry', m.license.expiry ? fmtDate(m.license.expiry) : '—'], ['Drug licence document', m.license.doc, true]);
      if (c.pharmacist) rows.push(['Pharmacist registration no.', (dc.pharmacist || {}).number || '—'], ['Pharmacist proof', (dc.pharmacist || {}).doc, true]);
      if (c.invoice) rows.push(['Brand / manufacturer', (dc.invoice || {}).brand || '—'], ['Product invoice', (dc.invoice || {}).doc, true]);
      if (c.extra && ((dc.extra || {}).number || (dc.extra || {}).doc)) rows.push(['Additional permission no.', (dc.extra || {}).number || '—'], ['Additional permission document', (dc.extra || {}).doc, true]);
      if (c.fssai) rows.push(['FSSAI number', dc.fssai.number || '—'], ['FSSAI expiry', dc.fssai.expiry ? fmtDate(dc.fssai.expiry) : '—'], ['FSSAI document', dc.fssai.doc, true]);
      if (dc.gst.number || dc.gst.doc) rows.push(['GSTIN', dc.gst.number || '—'], ['GST certificate', dc.gst.doc, true]);
      if (dc.trade.number || dc.trade.doc) rows.push(['Trade licence number', dc.trade.number || '—'], ['Trade licence document', dc.trade.doc, true]);
      return rows;
    }
    if (section === 'identity') return [['ID type', m.identity.idType], ['ID number', m.identity.idNumber || '—'], ['ID document', m.identity.doc, true]].concat(m.signature ? [['Signature', m.signature, true]] : []);
    if (section === 'bank') return [['Account holder', m.bank.accountHolder || '—'], ['Account number', m.bank.accountNumber || '—'], ['IFSC', m.bank.ifsc || '—'], ['UPI', m.bank.upi || '—'], ['Bank document', m.bank.doc, true]];
    return [];
  }

  PAGES['profile-kyc-review'] = async () => {
    const m = await DB.getMerchant();
    return `
    <button class="detail-back" data-route="profile">${icon('chevronL')}<span>Back to profile</span></button>
    <div class="card detail-card">
      <div class="detail-status"><span class="pill pill-amber">Pending admin verification</span></div>
      <h2 style="font-size:17px;margin-bottom:6px">Submitted information</h2>
      <p style="font-size:13px;color:var(--ink-500);margin-bottom:14px">Your details are locked while under review. You cannot edit, replace documents, or change bank details until a decision is made.</p>
      ${['store', 'address', 'license', 'identity', 'bank'].map(sec => `
        <div class="review-block"><h4>${KYC_SECTION_LABEL[sec]}</h4>
        ${kycSectionFields(m, sec).map(([l, v, isDoc]) => `<div class="review-row"><span>${l}</span><span>${isDoc ? docView(v) : esc(v)}</span></div>`).join('')}
        </div>`).join('')}
    </div>`;
  };

  const WIZARD_STEPS = [
    { key: 'store', title: 'Store Information', desc: 'Tell customers who you are.' },
    { key: 'address', title: 'Shop Address', desc: 'Where customers can find and reach you.' },
    { key: 'license', title: 'Documents', desc: 'Documents needed for your business category.' },
    { key: 'identity', title: 'Identity', desc: 'A valid government ID for verification.' },
    { key: 'bank', title: 'Bank & Payment', desc: 'Where your payouts will be sent.' },
    { key: 'review', title: 'Review & Submit', desc: 'Check everything before submitting.' }
  ];

  function ensureWizardDraft(m) {
    if (!state.wizard.draft) {
      state.wizard.draft = {
        shopName: m.shopName || '', ownerName: m.ownerName || '', category: m.category || '', about: m.about || '',
        address: { ...m.address }, license: { ...m.license }, docs: JSON.parse(JSON.stringify(m.docs || { business: {}, gst: {}, trade: {}, fssai: {}, pharmacist: {}, invoice: {}, extra: {} })), identity: { ...m.identity }, bank: { ...m.bank }, signature: m.signature || ''
      };
      state.wizard.files = {};
      const idx = WIZARD_STEPS.findIndex(s => s.key !== 'review' && !stepComplete(s.key, state.wizard.draft));
      state.wizard.step = idx === -1 ? WIZARD_STEPS.length - 1 : idx;
    }
  }

  PAGES['kyc-wizard'] = async () => {
    const m = await DB.getMerchant();
    if (m.kyc.status === 'pending_review') return emptyBlock('lock', 'Under review', 'Your details are locked while our team reviews them.', `<button class="btn btn-outline btn-sm" data-route="profile">Back to profile</button>`);
    ensureWizardDraft(m);
    return renderWizardShell();
  };

  function renderWizardShell() {
    const step = state.wizard.step;
    const d = state.wizard.draft;
    return `
    <button class="detail-back" data-route="profile">${icon('chevronL')}<span>Back to profile</span></button>
    <div class="wizard-head">
      <div class="wizard-steps">${WIZARD_STEPS.map((s, i) => `<div class="wizard-step-dot${i < step ? ' done' : i === step ? ' current' : ''}"></div>`).join('')}</div>
      <span class="wizard-step-label">${step + 1} / ${WIZARD_STEPS.length}</span>
    </div>
    <div class="card wizard-card" id="wizardBody">${renderWizardStepBody(step, d)}</div>`;
  }

  const fileHint = (doc, kind) => state.wizard.files[kind] ? `<span class="field-hint">Selected: ${esc(state.wizard.files[kind].name)}</span>` : (doc ? `<span class="field-hint">Already uploaded — choose a file only to replace it.</span>` : '');

  function renderWizardStepBody(step, d) {
    const s = WIZARD_STEPS[step];
    let inner = '';
    if (s.key === 'store') inner = `
      <div class="form-row two">
        <label class="field"><span>Shop name*</span><input type="text" name="shopName" value="${esc(d.shopName)}" required></label>
        <label class="field"><span>Owner name*</span><input type="text" name="ownerName" value="${esc(d.ownerName)}" required></label>
      </div>
      <label class="field"><span>Business category*</span>
        <select name="category" required><option value="">Select…</option>${BUSINESS_CATEGORIES.map(c => c.label).concat(d.category && !BUSINESS_CATEGORIES.some(c => c.label === d.category) ? [d.category] : []).map(c => `<option${d.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <span class="field-hint">The documents you upload next depend on this category.</span>
      </label>
      <label class="field"><span>About shop*</span><textarea name="about" rows="2" required minlength="10">${esc(d.about)}</textarea></label>`;
    else if (s.key === 'address') inner = `
      <label class="field"><span>Full address*</span><input type="text" name="fullAddress" value="${esc(d.address.fullAddress)}" required></label>
      <div class="form-row two">
        <label class="field"><span>City*</span><input type="text" name="city" value="${esc(d.address.city)}" required></label>
        <label class="field"><span>District*</span><input type="text" name="district" value="${esc(d.address.district)}" required></label>
      </div>
      <div class="form-row two">
        <label class="field"><span>State*</span><input type="text" name="state" value="${esc(d.address.state)}" required></label>
        <label class="field"><span>Pincode*</span><input type="text" name="pincode" value="${esc(d.address.pincode)}" required pattern="[0-9]{6}" inputmode="numeric" maxlength="6"></label>
      </div>
      <label class="field"><span>GPS location*</span><div style="display:flex;gap:8px"><input type="text" name="gps" value="${esc(d.address.gps || '')}" placeholder="lat, lng" required pattern="\\s*-?[0-9]{1,3}(\\.[0-9]+)?\\s*,\\s*-?[0-9]{1,3}(\\.[0-9]+)?\\s*" title="Tap Detect, or enter: latitude, longitude" style="flex:1;min-width:0"><button type="button" class="btn btn-outline" id="detectGps">Use my GPS</button></div></label>
      <div class="shop-pin-box">
        <h4>📍 Pin your shop's exact location</h4>
        <p class="pin-help">Best way: stand inside your shop, tap <b>Use my GPS</b>, then drag the pin onto your shop door. Customers and riders will see this exact spot.</p>
        <div class="pin-actions">
          <button type="button" class="btn btn-outline" id="pinFindAddr">Find my typed address</button>
        </div>
        <div id="shopPinMap" class="shop-pin-map"></div>
        <div class="pin-coord" id="pinCoordText">Tap on the map or use GPS to drop the pin</div>
        <a class="link-a" id="pinOpenGmaps" href="#" target="_blank" rel="noopener" style="display:none;font-size:13px">Open this pin in Google Maps</a>
      </div>`;
    else if (s.key === 'license') {
      const c = catInfo(d.category), dc = d.docs || (d.docs = { business: {}, gst: {}, trade: {}, fssai: {}, pharmacist: {}, invoice: {}, extra: {} });
      const up = (label, name, kind, doc, req) => `<label class="field"><span>${label}${req ? '*' : ' <span class="field-hint">(optional)</span>'}</span><input type="file" name="${name}" accept="image/*,.pdf"${req && !(doc || state.wizard.files[kind]) ? ' required' : ''}>${fileHint(doc, kind)}</label>`;
      if (!d.category) inner = `<p class="cell-muted">Choose your business category in the first step to see the documents you need.</p>`;
      else inner = `
        <div class="rejection-note" style="background:var(--ink-50,#f4f6f8);border-color:var(--ink-200,#dde1e6);color:var(--ink-700,#333)"><strong>${esc(d.category)}</strong><br>${esc(c.hint || '')}<br><span style="font-size:12px">Identity (KYC) and bank details come in the next steps.</span></div>
        <h4 style="margin:14px 0 8px">Business proof</h4>
        <label class="field"><span>Proof type*</span><select name="bizType" required><option value="">Select…</option>${BUSINESS_PROOF_TYPES.map(t => `<option${dc.business.type === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        ${up('Business proof document', 'docBusiness', 'business', dc.business.doc, true)}
        ${c.drug ? `
        <h4 style="margin:14px 0 8px">Drug Licence ${c.drugReq ? '' : '<span class="field-hint">(only if you distribute medicines)</span>'}</h4>
        <label class="field"><span>Drug licence number${c.drugReq ? '*' : ''}</span><input type="text" name="number" value="${esc(d.license.number)}"${c.drugReq ? ' required' : ''}></label>
        <label class="field"><span>Licence expiry date${c.drugReq ? '*' : ''}</span><input type="date" name="expiry"${c.drugReq ? ' required' : ''} value="${d.license.expiry ? String(d.license.expiry).slice(0, 10) : ''}"></label>
        ${up('Drug licence document', 'docLicense', 'license', d.license.doc, c.drugReq)}
        ${c.drugReq ? '' : '<p class="cell-muted" style="font-size:12.5px">Without a verified Drug Licence you cannot list medicines.</p>'}` : `
        <p class="cell-muted" style="font-size:12.5px;margin:12px 0">This account type cannot list medicines. You can list only products of your own category.</p>`}
        ${c.pharmacist ? `
        <h4 style="margin:14px 0 8px">Pharmacist proof</h4>
        <label class="field"><span>Pharmacist registration number*</span><input type="text" name="pharmNo" value="${esc((dc.pharmacist || {}).number || '')}" required></label>
        ${up('Pharmacist registration certificate / ID', 'docPharm', 'pharmacist', (dc.pharmacist || {}).doc, true)}` : ''}
        ${c.invoice ? `
        <h4 style="margin:14px 0 8px">Products &amp; brand</h4>
        <label class="field"><span>Brand / manufacturer details*</span><input type="text" name="brandInfo" value="${esc((dc.invoice || {}).brand || '')}" required placeholder="e.g. brands you sell, manufacturer names"></label>
        ${up('Product purchase invoice', 'docInvoice', 'invoice', (dc.invoice || {}).doc, true)}` : ''}
        ${c.extra ? `
        <h4 style="margin:14px 0 8px">Additional approval <span class="field-hint">(if applicable)</span></h4>
        <p class="cell-muted" style="font-size:12.5px;margin:0 0 6px">${esc(c.extra)}</p>
        <label class="field"><span>Approval / permission number <span class="field-hint">(optional)</span></span><input type="text" name="extraNo" value="${esc((dc.extra || {}).number || '')}"></label>
        ${up('Approval document', 'docExtra', 'extra', (dc.extra || {}).doc, false)}` : ''}
        ${c.fssai ? `
        <h4 style="margin:14px 0 8px">FSSAI</h4>
        <label class="field"><span>FSSAI registration / licence number*</span><input type="text" name="fssaiNo" value="${esc(dc.fssai.number || '')}" required inputmode="numeric" pattern="[0-9]{14}" maxlength="14" title="14 digits"></label>
        <label class="field"><span>FSSAI expiry date*</span><input type="date" name="fssaiExpiry" required value="${dc.fssai.expiry ? String(dc.fssai.expiry).slice(0, 10) : ''}"></label>
        ${up('FSSAI certificate', 'docFssai', 'fssai', dc.fssai.doc, true)}` : ''}
        <h4 style="margin:14px 0 8px">GST &amp; Trade Licence <span class="field-hint">(if applicable)</span></h4>
        <label class="field"><span>GSTIN <span class="field-hint">(optional)</span></span><input type="text" name="gstin" value="${esc(dc.gst.number || '')}" maxlength="15" style="text-transform:uppercase" pattern="[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z]Z[0-9A-Za-z]" title="15-character GSTIN"></label>
        ${up('GST certificate', 'docGst', 'gst', dc.gst.doc, false)}
        <label class="field"><span>Trade licence number <span class="field-hint">(optional)</span></span><input type="text" name="tradeNo" value="${esc(dc.trade.number || '')}"></label>
        ${up('Trade licence document', 'docTrade', 'trade', dc.trade.doc, false)}`;
    }
    else if (s.key === 'identity') inner = `
      <label class="field"><span>ID type*</span>
        <select name="idType" required>${['Aadhaar', 'PAN', 'Voter ID', 'Passport'].map(t => `<option${d.identity.idType === t ? ' selected' : ''}>${t}</option>`).join('')}</select>
      </label>
      <label class="field"><span>ID number*</span><input type="text" name="idNumber" value="${esc(d.identity.idNumber)}" required></label>
      <label class="field"><span>ID document*</span><input type="file" name="doc" accept="image/*,.pdf"${d.identity.doc || state.wizard.files.identity ? '' : ' required'}>${fileHint(d.identity.doc, 'identity')}</label>
      <label class="field"><span>Signature image <span class="field-hint">(optional)</span></span><input type="file" name="signature" accept="image/png,image/jpeg,image/webp">
        <span class="field-hint">${state.wizard.files.signature ? 'Selected: ' + esc(state.wizard.files.signature.name) : d.signature ? 'Already added — choose a file only to replace it.' : 'Printed on your order receipts. Sign on white paper, take a clear photo and upload it. You can add or change it later from Profile.'}</span>
      </label>`;
    else if (s.key === 'bank') inner = `
      <p class="cell-muted" style="font-size:12.5px;margin-bottom:12px">Account holder: <b>${esc(d.ownerName || 'owner name')}</b> — must match your bank passbook.</p>
      <div class="form-row two">
        <label class="field"><span>Account number*</span><input type="text" name="accountNumber" value="${esc(d.bank.accountNumber)}" required inputmode="numeric" pattern="[0-9]{9,18}" title="9–18 digits"></label>
        <label class="field"><span>IFSC*</span><input type="text" name="ifsc" value="${esc(d.bank.ifsc)}" required pattern="[A-Za-z]{4}0[A-Za-z0-9]{6}" title="e.g. SBIN0004521" style="text-transform:uppercase"></label>
      </div>
      <label class="field"><span>UPI ID <span class="field-hint">(optional)</span></span><input type="text" name="upi" value="${esc(d.bank.upi || '')}"></label>
      <label class="field"><span>Bank document*</span><input type="file" name="doc" accept="image/*,.pdf"${d.bank.doc || state.wizard.files.bank ? '' : ' required'}>${fileHint(d.bank.doc, 'bank')}</label>`;
    else if (s.key === 'review') inner = renderWizardReview(d);

    const isLast = step === WIZARD_STEPS.length - 1;
    return `
      <h2>${s.title}</h2><p class="wizard-desc">${s.desc}</p>
      <form id="wizardForm">${inner}</form>
      <div class="wizard-actions">
        <button class="btn btn-ghost" id="wizardBack" ${step === 0 ? 'disabled' : ''}>${icon('chevronL')}<span>Back</span></button>
        ${isLast ? `<button class="btn btn-primary" id="wizardSubmit">Submit for verification</button>` : `<button class="btn btn-primary" id="wizardNext">Continue</button>`}
      </div>`;
  }

  function renderWizardReview(d) {
    const docRow = (l, kind, doc) => `<div class="review-row"><span>${l}</span><span>${state.wizard.files[kind] ? '📄 ' + esc(state.wizard.files[kind].name) : (doc ? '📄 Uploaded' : '<b style="color:var(--red-600)">Missing</b>')}</span></div>`;
    return `
      <div class="review-block"><h4>Store Information</h4>
        <div class="review-row"><span>Shop name</span><span>${esc(d.shopName)}</span></div>
        <div class="review-row"><span>Owner name</span><span>${esc(d.ownerName)}</span></div>
        <div class="review-row"><span>Category</span><span>${esc(d.category)}</span></div>
      </div>
      <div class="review-block"><h4>Address</h4>
        <div class="review-row"><span>Address</span><span>${esc(d.address.fullAddress)}, ${esc(d.address.city)}</span></div>
        <div class="review-row"><span>State / Pincode</span><span>${esc(d.address.state)} - ${esc(d.address.pincode)}</span></div>
      </div>
      <div class="review-block"><h4>Documents</h4>
        <div class="review-row"><span>Business proof</span><span>${esc((d.docs.business || {}).type || '')}</span></div>${docRow('Proof document', 'business', (d.docs.business || {}).doc)}
        ${catInfo(d.category).drug && d.license.number ? `<div class="review-row"><span>Drug licence no.</span><span>${esc(d.license.number)}</span></div>${docRow('Drug licence document', 'license', d.license.doc)}` : ''}
        ${catInfo(d.category).pharmacist ? `<div class="review-row"><span>Pharmacist reg. no.</span><span>${esc((d.docs.pharmacist || {}).number || '')}</span></div>${docRow('Pharmacist proof', 'pharmacist', (d.docs.pharmacist || {}).doc)}` : ''}
        ${catInfo(d.category).invoice ? `<div class="review-row"><span>Brand / manufacturer</span><span>${esc((d.docs.invoice || {}).brand || '')}</span></div>${docRow('Product invoice', 'invoice', (d.docs.invoice || {}).doc)}` : ''}
        ${catInfo(d.category).fssai ? `<div class="review-row"><span>FSSAI no.</span><span>${esc((d.docs.fssai || {}).number || '')}</span></div>${docRow('FSSAI certificate', 'fssai', (d.docs.fssai || {}).doc)}` : ''}
        ${(d.docs.gst || {}).number || (d.docs.gst || {}).doc ? `<div class="review-row"><span>GSTIN</span><span>${esc((d.docs.gst || {}).number || '')}</span></div>` : ''}
        ${(d.docs.trade || {}).number || (d.docs.trade || {}).doc ? `<div class="review-row"><span>Trade licence</span><span>${esc((d.docs.trade || {}).number || '')}</span></div>` : ''}
        <div class="review-row"><span>You can list</span><span>${esc(catInfo(d.category).types.map(t => PRODUCT_TYPE_CARDS[t].title).join(', '))}</span></div>
      </div>
      <div class="review-block"><h4>Identity</h4>
        <div class="review-row"><span>${esc(d.identity.idType)}</span><span>${esc(d.identity.idNumber)}</span></div>${docRow('Document', 'identity', d.identity.doc)}
        <div class="review-row"><span>Signature (optional)</span><span>${state.wizard.files.signature ? '📄 ' + esc(state.wizard.files.signature.name) : d.signature ? '📄 Uploaded' : 'Not added'}</span></div>
      </div>
      <div class="review-block"><h4>Bank &amp; Payment</h4>
        <div class="review-row"><span>Account / IFSC</span><span>${esc(d.bank.accountNumber)} / ${esc(d.bank.ifsc)}</span></div>${docRow('Document', 'bank', d.bank.doc)}
      </div>
      <p style="font-size:12.5px;color:var(--ink-500)">By submitting, your business details are locked until our team completes verification.</p>
      <p style="font-size:12.5px;color:var(--ink-500);margin-top:6px">By submitting you agree to our <a href="${esc(TERMS_URL)}" target="_blank" rel="noopener" style="color:var(--red-600);font-weight:700">Terms &amp; Conditions</a> and <a href="${esc(PRIVACY_URL)}" target="_blank" rel="noopener" style="color:var(--red-600);font-weight:700">Privacy Policy</a>.</p>`;
  }

  function validateIdNumber(type, num) {
    const n = String(num || '').replace(/\s+/g, '').toUpperCase();
    const rules = { Aadhaar: [/^[2-9][0-9]{11}$/, 'Aadhaar must be 12 digits'], PAN: [/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN must look like ABCDE1234F'], 'Voter ID': [/^[A-Z]{3}[0-9]{7}$/, 'Voter ID must look like ABC1234567'], Passport: [/^[A-Z][0-9]{7}$/, 'Passport must look like A1234567'] };
    const r = rules[type]; return r && !r[0].test(n) ? r[1] : '';
  }
  function saveStepIntoDraft(step, d) {
    const form = document.getElementById('wizardForm');
    if (!form) return true;
    if (!form.reportValidity()) return false;
    const fd = new FormData(form);
    const s = WIZARD_STEPS[step].key;
    const file = fd.get('doc') && fd.get('doc').size ? fd.get('doc') : null;
    if (s === 'store') { d.shopName = fd.get('shopName').trim(); d.ownerName = fd.get('ownerName').trim(); d.category = fd.get('category'); d.about = fd.get('about'); }
    else if (s === 'address') { d.address = { ...d.address, fullAddress: fd.get('fullAddress').trim(), city: fd.get('city').trim(), district: fd.get('district').trim(), state: fd.get('state').trim(), pincode: fd.get('pincode').trim(), gps: fd.get('gps').trim() }; }
    else if (s === 'license') {
      const c = catInfo(d.category);
      const f = (n) => { const x = fd.get(n); return x && x.size ? x : null; };
      const keep = (kind, cur, file) => { if (file) { state.wizard.files[kind] = file; return cur || 'pending-upload'; } return cur; };
      d.docs = d.docs || { business: {}, gst: {}, trade: {}, fssai: {}, pharmacist: {}, invoice: {}, extra: {} };
      d.docs.business = { type: fd.get('bizType') || '', doc: keep('business', (d.docs.business || {}).doc, f('docBusiness')) };
      if (!state.wizard.files.business && !d.docs.business.doc) { showToast('Upload your business proof document', 'error'); return false; }
      if (c.drug) {
        d.license = { ...d.license, number: (fd.get('number') || '').trim(), expiry: fd.get('expiry') || '' };
        d.license.doc = keep('license', d.license.doc, f('docLicense'));
        if (c.drugReq || d.license.number) {
          if (!d.license.number) { showToast('Enter your drug licence number', 'error'); return false; }
          if (!d.license.expiry) { showToast('Enter the drug licence expiry date', 'error'); return false; }
          if (!state.wizard.files.license && !d.license.doc) { showToast('Upload your drug licence document', 'error'); return false; }
        }
      }
      if (c.pharmacist) {
        d.docs.pharmacist = { number: (fd.get('pharmNo') || '').trim(), doc: keep('pharmacist', (d.docs.pharmacist || {}).doc, f('docPharm')) };
        if (!state.wizard.files.pharmacist && !d.docs.pharmacist.doc) { showToast('Upload your pharmacist proof', 'error'); return false; }
      }
      if (c.invoice) {
        d.docs.invoice = { brand: (fd.get('brandInfo') || '').trim(), doc: keep('invoice', (d.docs.invoice || {}).doc, f('docInvoice')) };
        if (!state.wizard.files.invoice && !d.docs.invoice.doc) { showToast('Upload a product purchase invoice', 'error'); return false; }
      }
      if (c.extra) d.docs.extra = { number: (fd.get('extraNo') || '').trim(), doc: keep('extra', (d.docs.extra || {}).doc, f('docExtra')) };
      if (c.fssai) {
        d.docs.fssai = { number: (fd.get('fssaiNo') || '').trim(), expiry: fd.get('fssaiExpiry') || '', doc: keep('fssai', (d.docs.fssai || {}).doc, f('docFssai')) };
        if (!state.wizard.files.fssai && !d.docs.fssai.doc) { showToast('Upload your FSSAI certificate', 'error'); return false; }
      }
      const gstin = (fd.get('gstin') || '').trim().toUpperCase();
      d.docs.gst = { number: gstin, doc: keep('gst', (d.docs.gst || {}).doc, f('docGst')) };
      d.docs.trade = { number: (fd.get('tradeNo') || '').trim(), doc: keep('trade', (d.docs.trade || {}).doc, f('docTrade')) };
    } else if (s === 'identity') {
      d.identity = { ...d.identity, idType: fd.get('idType'), idNumber: fd.get('idNumber').trim() };
      const idErr = validateIdNumber(d.identity.idType, d.identity.idNumber);
      if (idErr) { showToast(idErr, 'error'); return false; }
      if (file) { state.wizard.files.identity = file; d.identity.doc = d.identity.doc || 'pending-upload'; }
      if (!state.wizard.files.identity && !d.identity.doc) { showToast('Upload your ID document', 'error'); return false; }
      const sig = fd.get('signature');
      if (sig && sig.size) {
        if (!/^image\/(png|jpe?g|webp)$/i.test(sig.type)) { showToast('Signature must be a PNG, JPG or WebP image', 'error'); return false; }
        if (sig.size > 2 * 1024 * 1024) { showToast('Signature image must be under 2 MB', 'error'); return false; }
        state.wizard.files.signature = sig; d.signature = d.signature || 'pending-upload';
      }
    } else if (s === 'bank') {
      d.bank = { ...d.bank, accountNumber: fd.get('accountNumber').trim(), ifsc: fd.get('ifsc').trim().toUpperCase(), upi: fd.get('upi').trim() };
      if (file) { state.wizard.files.bank = file; d.bank.doc = d.bank.doc || 'pending-upload'; }
      if (!state.wizard.files.bank && !d.bank.doc) { showToast('Upload your bank passbook / cancelled cheque', 'error'); return false; }
    }
    return true;
  }

  let __pinMap = null, __pinMarker = null;
  function parseGpsInput(v) {
    const p = String(v || '').split(',').map(x => parseFloat(x));
    return (p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180) ? p : null;
  }
  function initShopPinMap() {
    if (__pinMap) { try { __pinMap.remove(); } catch (e) {} __pinMap = null; __pinMarker = null; }
    window.__setShopPin = null;
    const el = document.getElementById('shopPinMap');
    if (!el) return;
    if (typeof L === 'undefined') { el.innerHTML = '<p class="field-hint" style="padding:16px">Map could not load. Type the GPS as: latitude, longitude</p>'; return; }
    const input = document.querySelector('#wizardForm [name=gps]');
    const txt = document.getElementById('pinCoordText');
    const link = document.getElementById('pinOpenGmaps');
    const start = parseGpsInput(input && input.value);
    __pinMap = L.map(el).setView(start || [22.9734, 78.6569], start ? 17 : 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(__pinMap);
    const setPin = (lat, lng, zoom) => {
      lat = +Number(lat).toFixed(6); lng = +Number(lng).toFixed(6);
      if (!__pinMarker) {
        __pinMarker = L.marker([lat, lng], { draggable: true }).addTo(__pinMap);
        __pinMarker.on('dragend', () => { const p = __pinMarker.getLatLng(); setPin(p.lat, p.lng); });
      } else __pinMarker.setLatLng([lat, lng]);
      if (zoom) __pinMap.setView([lat, lng], zoom);
      if (input) input.value = `${lat}, ${lng}`;
      if (txt) txt.textContent = `📍 Pinned: ${lat}, ${lng}`;
      if (link) { link.href = `https://www.google.com/maps?q=${lat},${lng}`; link.style.display = ''; }
    };
    window.__setShopPin = setPin;
    if (start) setPin(start[0], start[1]);
    __pinMap.on('click', (e) => setPin(e.latlng.lat, e.latlng.lng));
    if (input) input.addEventListener('change', () => { const p = parseGpsInput(input.value); if (p) setPin(p[0], p[1], 17); });
    setTimeout(() => { if (__pinMap) __pinMap.invalidateSize(); }, 250);
  }
  function pinMapBlock(m) {
    const lat = parseFloat(m.address.lat), lng = parseFloat(m.address.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
    return `<div class="shop-pin-box"><h4>📍 Shop location pin</h4><div id="kycAddrMap" class="shop-pin-map" data-lat="${lat}" data-lng="${lng}"></div><a class="link-a" href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" rel="noopener" style="font-size:13px">Open exact pin in Google Maps</a></div>`;
  }
  function initReadonlyPin() {
    const el = document.getElementById('kycAddrMap');
    if (!el || typeof L === 'undefined') return;
    const lat = parseFloat(el.dataset.lat), lng = parseFloat(el.dataset.lng);
    const mp = L.map(el).setView([lat, lng], 17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mp);
    L.marker([lat, lng]).addTo(mp);
    setTimeout(() => mp.invalidateSize(), 250);
  }
  AFTER['kyc-detail'] = (sec) => { if (sec === 'address') initReadonlyPin(); };

  AFTER['kyc-wizard'] = () => wireWizardButtons();
  function wireWizardButtons() {
    const redraw = () => {
      document.getElementById('wizardBody').innerHTML = renderWizardStepBody(state.wizard.step, state.wizard.draft); wireWizardButtons(); window.scrollTo(0, 0);
      // keep the red step bar + "n / 6" in sync with the current step
      const st = state.wizard.step, dots = document.querySelector('.wizard-head .wizard-steps'), lbl = document.querySelector('.wizard-head .wizard-step-label');
      if (dots) dots.innerHTML = WIZARD_STEPS.map((x, i) => `<div class="wizard-step-dot${i < st ? ' done' : i === st ? ' current' : ''}"></div>`).join('');
      if (lbl) lbl.textContent = `${st + 1} / ${WIZARD_STEPS.length}`;
    };
    document.getElementById('wizardBack')?.addEventListener('click', () => {
      if (state.wizard.step === 0) return;
      saveStepIntoDraftSilently();
      state.wizard.step -= 1; redraw();
    });
    document.getElementById('wizardNext')?.addEventListener('click', async (e) => {
      const nb = e.currentTarget;
      if (!saveStepIntoDraft(state.wizard.step, state.wizard.draft)) return;
      BtnState.start(nb, 'Saving…'); await BtnState.ok(nb, 'Saved', 350);
      state.wizard.step += 1; redraw();
    });
    initShopPinMap();
    document.getElementById('detectGps')?.addEventListener('click', (e) => {
      const gbtn = e.currentTarget;
      if (!navigator.geolocation) return showToast('Location is not available on this device', 'error');
      BtnState.start(gbtn, 'Locating…');
      navigator.geolocation.getCurrentPosition((p) => {
        BtnState.ok(gbtn, 'Location Set', 600);
        if (window.__setShopPin) window.__setShopPin(p.coords.latitude, p.coords.longitude, 18);
        else document.querySelector('#wizardForm [name=gps]').value = `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`;
        if (p.coords.accuracy && p.coords.accuracy > 100) showToast(`GPS accuracy is only ±${Math.round(p.coords.accuracy)} m — drag the pin to your shop door`, 'error');
      }, () => { BtnState.fail(gbtn, 'Failed — Retry'); showToast('Could not get your location', 'error'); }, { enableHighAccuracy: true, timeout: 10000 });
    });
    document.getElementById('pinFindAddr')?.addEventListener('click', async (e) => {
      const f = document.getElementById('wizardForm'); if (!f) return;
      const fbtn = e.currentTarget; BtnState.start(fbtn, 'Searching…');
      const g = (n) => ((f.querySelector(`[name=${n}]`) || {}).value || '').trim();
      const q = [g('fullAddress'), g('city'), g('district'), g('state'), g('pincode'), 'India'].filter(Boolean).join(', ');
      try {
        const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=' + encodeURIComponent(q));
        const j = await r.json();
        if (j && j[0] && window.__setShopPin) { window.__setShopPin(parseFloat(j[0].lat), parseFloat(j[0].lon), 17); BtnState.ok(fbtn, 'Address Found', 700); }
        else { BtnState.fail(fbtn, 'Not Found — Retry'); showToast('Address not found on the map — use GPS or tap the map', 'error'); }
      } catch (e2) { BtnState.fail(fbtn, 'Failed — Retry'); showToast('Could not search the address right now', 'error'); }
    });
    document.getElementById('wizardSubmit')?.addEventListener('click', async (e) => {
      const d = state.wizard.draft, btn = e.currentTarget;
      const missing = WIZARD_STEPS.findIndex(s => s.key !== 'review' && !stepComplete(s.key, d));
      if (missing !== -1) { showToast(`Complete "${WIZARD_STEPS[missing].title}" first`, 'error'); state.wizard.step = missing; redraw(); return; }
      BtnState.start(btn, 'Submitting…');
      try {
        state.merchant = await DB.submitKyc(d, state.wizard.files);
        await BtnState.ok(btn, 'Submitted Successfully');
        state.wizard.draft = null; state.wizard.step = 0; state.wizard.files = {};
        refreshMerchantChrome();
        showToast('KYC submitted for verification');
        navigate('profile');
      } catch (err) { console.error(err); BtnState.fail(btn, 'Submit Failed — Retry'); showToast(err.message || 'Could not submit KYC', 'error'); }
    });
  }
  function saveStepIntoDraftSilently() {
    const form = document.getElementById('wizardForm'); if (!form || form.reportValidity === undefined) return;
    try {
      const fd = new FormData(form), d = state.wizard.draft, s = WIZARD_STEPS[state.wizard.step].key;
      if (s === 'store') { d.shopName = fd.get('shopName') || ''; d.ownerName = fd.get('ownerName') || ''; d.category = fd.get('category') || ''; d.about = fd.get('about') || ''; }
      else if (s === 'address') d.address = { ...d.address, fullAddress: fd.get('fullAddress') || '', city: fd.get('city') || '', district: fd.get('district') || '', state: fd.get('state') || '', pincode: fd.get('pincode') || '', gps: fd.get('gps') || '' };
      else if (s === 'license') {
        if (fd.get('number') !== null) d.license = { ...d.license, number: fd.get('number') || '', expiry: fd.get('expiry') || '' };
        d.docs = d.docs || { business: {}, gst: {}, trade: {}, fssai: {} };
        d.docs.business = { ...d.docs.business, type: fd.get('bizType') || d.docs.business.type || '' };
        d.docs.gst = { ...d.docs.gst, number: (fd.get('gstin') || '').toUpperCase() };
        d.docs.trade = { ...d.docs.trade, number: fd.get('tradeNo') || '' };
        if (fd.get('pharmNo') !== null) d.docs.pharmacist = { ...d.docs.pharmacist, number: fd.get('pharmNo') || '' };
        if (fd.get('brandInfo') !== null) d.docs.invoice = { ...d.docs.invoice, brand: fd.get('brandInfo') || '' };
        if (fd.get('extraNo') !== null) d.docs.extra = { ...d.docs.extra, number: fd.get('extraNo') || '' };
        if (fd.get('fssaiNo') !== null) d.docs.fssai = { ...d.docs.fssai, number: fd.get('fssaiNo') || '', expiry: fd.get('fssaiExpiry') || '' };
      }
      else if (s === 'identity') d.identity = { ...d.identity, idType: fd.get('idType') || d.identity.idType, idNumber: fd.get('idNumber') || '' };
      else if (s === 'bank') d.bank = { ...d.bank, accountNumber: fd.get('accountNumber') || '', ifsc: fd.get('ifsc') || '', upi: fd.get('upi') || '' };
    } catch (e) { /* ignore */ }
  }

  function openDrawer() { document.getElementById('moreDrawer').classList.add('open'); document.getElementById('drawerScrim').classList.add('open'); }
  function closeDrawer() { document.getElementById('moreDrawer').classList.remove('open'); document.getElementById('drawerScrim').classList.remove('open'); }

  function initKeyboardAwareFooter() {
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = null;
    function apply() {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const offset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        const kbOpen = offset > 80; // ignore small browser-chrome jitter
        document.documentElement.style.setProperty('--kb-offset', (kbOpen ? offset : 0) + 'px');
        document.body.classList.toggle('kb-open', kbOpen);
      });
    }
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    apply();
  }


  // Add-product: when a field gets focus (or the keyboard opens) make sure it is never hidden behind the Back/Continue bar
  document.addEventListener('focusin', (e) => {
    if (!document.body.classList.contains('wizard-mode')) return;
    const t = e.target;
    if (t && t.matches && t.matches('input,select,textarea')) setTimeout(() => { try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (x) { /* ignore */ } }, 280);
  });

  function bindGlobalUI() {
    document.addEventListener('click', (e) => {
      const moreBtn = e.target.closest('#moreBtn');
      if (moreBtn) { openDrawer(); return; }

      const routeEl = e.target.closest('[data-route]');
      if (routeEl) {
        closeSheet();
        navigate(routeEl.dataset.route, routeEl.dataset.param);
        closeDrawer();
        return;
      }
      const toastEl = e.target.closest('[data-toast]');
      if (toastEl) { showToast(toastEl.dataset.toast); return; }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (document.getElementById('lightbox')) closeLightbox(); else { closeSheet(); closeDrawer(); } } });

    document.getElementById('drawerClose')?.addEventListener('click', closeDrawer);
    document.getElementById('drawerScrim')?.addEventListener('click', closeDrawer);
  }

  async function init() {
    bindGlobalUI();
    initKeyboardAwareFooter();
    window.addEventListener('hashchange', () => { closeSheet(); closeLightbox(); render(); });   // SPA navigation: re-render on every route change
    if (sb) sb.auth.onAuthStateChange((evt) => {
      if (evt === 'SIGNED_OUT') { stopRealtime(); state.merchant = null; goHome(); }
    });
    try { await bootSession(); } catch (e) { console.warn('Not signed in yet or merchant not found', e && e.message); }
    if (!location.hash) location.hash = '#/dashboard';
    else render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();


(function () {
  var MB = 1024 * 1024;
  function fmt(n) { return n >= MB ? (n / MB).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function rule(inp) {
    var sig = inp.name === 'sig' || inp.name === 'signature';
    return sig ? { max: 2 * MB, types: /^image\/(png|jpe?g|webp)$/i, label: 'PNG, JPG or WebP', pdf: false }
               : { max: 8 * MB, types: /^image\//i, label: 'an image or PDF', pdf: true };
  }
  function box(inp) {
    var b = inp.parentNode.querySelector('.kycf');
    if (!b) { b = document.createElement('div'); b.className = 'kycf'; inp.insertAdjacentElement('afterend', b); }
    return b;
  }
  function esc2(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function show(inp) {
    var f = inp.files && inp.files[0], b = box(inp);
    if (b._url) { URL.revokeObjectURL(b._url); b._url = null; }
    if (!f) { b.remove(); inp.classList.remove('kycf-hide'); return; }
    var r = rule(inp), isPdf = /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name), err = '';
    if (!(r.types.test(f.type) || (r.pdf && isPdf))) err = 'Wrong file type — choose ' + r.label;
    else if (f.size > r.max) err = 'File too large (' + fmt(f.size) + ') — max ' + fmt(r.max);
    var thumb;
    if (!err && !isPdf) { b._url = URL.createObjectURL(f); thumb = '<img class="kycf-img" src="' + b._url + '" alt="">'; }
    else thumb = '<span class="kycf-img kycf-ph">' + (isPdf ? 'PDF' : '!') + '</span>';
    b.className = 'kycf ' + (err ? 'kycf-bad' : 'kycf-ok');
    b.innerHTML = thumb + '<div class="kycf-txt"><div class="kycf-name">' + esc2(f.name) + '</div><div class="kycf-sub">' +
      (err ? esc2(err) : '✓ ' + fmt(f.size) + ' · ready') + '</div></div>' +
      '<button type="button" class="kycf-btn">' + (err ? 'Choose again' : 'Change') + '</button>';
    b.querySelector('.kycf-btn').onclick = function (e) { e.preventDefault(); e.stopPropagation(); inp.click(); };
    if (err) { inp.value = ''; inp.classList.remove('kycf-hide'); }   // clear -> required check will flag it
    else inp.classList.add('kycf-hide');
  }
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || t.type !== 'file' || t.hidden || t.hasAttribute('data-img-input') || t.id === 'avatarInput') return;
    if (!t.closest('label.field')) return;
    show(t);
  }, true);
})();
