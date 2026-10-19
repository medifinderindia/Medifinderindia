/* MediFinder India — customer campaign page. Loads after user.min.js. Renders from the mf_campaign_page RPC. */
(function () {
  'use strict';
  if (window.MFCampaign) return;                         // one instance, one set of listeners
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var sb = function () { return window.supabaseClient || null; };
  var PAGES = ['home', 'shops', 'cart', 'order', 'profile', 'notification', 'lab-test', 'nurse-booking', 'ambulance', 'tablet-coin', 'prescriptions'];
  var SERVICE_PAGE = { nurse: 'nurse-booking', lab: 'lab-test', ambulance: 'ambulance' };   // existing booking flows; blood has none, so it is not rendered
  var SERVICE_ICON = { nurse: 'fa-user-nurse', lab: 'fa-flask-vial', ambulance: 'fa-truck-medical' };
  var TIERS = [['presented_by', 'Presented by'], ['powered_by', 'Powered by'], ['co_powered_by', 'Co-powered by'], ['associate', 'Associate sponsors']];
  var st = { ref: null, data: null, offset: 0, cat: 'all', q: '', view: 'main', ret: 'home', timer: null, token: 0, tracked: {} };

  function safeImg(u) { u = String(u || ''); return /^(https:\/\/|blob:)/i.test(u) ? u : ''; }
  function safeWeb(u) { u = String(u || '').trim(); return /^(https:\/\/|blob:)/i.test(u) ? u : ''; }
  function inr(n) { return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
  function sessionKey() { try { var k = sessionStorage.getItem('mf_cp_sess'); if (!k) { k = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('mf_cp_sess', k); } return k; } catch (e) { return 'anon' + Date.now(); } }
  function track(type, ref) {                             // counts only; impression is deduped per session in the DB too
    if (!sb() || !st.ref) return;
    var key = type + '|' + (ref || '') + '|' + st.ref; if (type === 'impression' && st.tracked[key]) return; st.tracked[key] = 1;
    try { sb().rpc('mf_campaign_track', { p_campaign: st.ref, p_type: type, p_ref: ref || '', p_session: sessionKey() }).then(function () {}, function () {}); } catch (e) {}
  }
  function cartCount() { try { return (JSON.parse(localStorage.getItem('medi_cart')) || []).reduce(function (a, i) { return a + (Number(i.qty) || 0); }, 0); } catch (e) { return 0; } }
  function paintCart() { var b = $('cp-cart-badge'); if (!b) return; var n = cartCount(); b.textContent = n > 99 ? '99+' : n; b.style.display = n ? 'grid' : 'none'; }
  function activePageKey() { var a = document.querySelector('.app-page.active'); return a ? a.getAttribute('data-page') : null; }

  /* ---------- routing ---------- */
  function open(ref) {
    if (!ref) return;
    ref = String(ref);
    var cur = activePageKey();
    if (cur && cur !== 'campaign') st.ret = PAGES.indexOf(cur) > -1 ? cur : 'home';
    var already = cur === 'campaign' && st.ref === ref;
    try { if (!(history.state && history.state.mfCampaign === ref)) history.pushState({ mfCampaign: ref }, '', '#campaign/' + encodeURIComponent(ref)); } catch (e) {}
    if (typeof window.navigateTo === 'function') window.navigateTo('campaign');
    if (!already) { st.ref = ref; st.cat = 'all'; st.q = ''; st.view = 'main'; load(); }
  }
  function back() {
    if (st.view === 'all' && !(history.state && history.state.all)) { showMain(); return; }
    if (history.state && history.state.mfCampaign) { history.back(); return; }
    if (typeof window.navigateTo === 'function') window.navigateTo(st.ret || 'home');
  }
  function leave() { stopTimer(); }
  window.addEventListener('popstate', function (e) {
    if (activePageKey() !== 'campaign') return;
    if (e.state && e.state.mfCampaign) { if (st.view === 'all' && !e.state.all) showMain(); return; }   // moved between campaign states
    stopTimer(); if (typeof window.navigateTo === 'function') window.navigateTo(st.ret || 'home');
  });
  window.addEventListener('mf:page-enter', function (e) {
    var p = e.detail && e.detail.page;
    if (p === 'campaign') { paintCart(); if (st.data) startTimer(); } else leave();
  });
  function fromHash() {
    var m = /^#campaign\/(.+)$/.exec(location.hash || ''); if (!m) return false;
    var ref; try { ref = decodeURIComponent(m[1]); } catch (e) { return false; }
    if (activePageKey() === 'campaign' && st.ref === ref) return true;
    st.ret = 'home'; st.ref = ref; st.cat = 'all'; st.q = ''; st.view = 'main';
    if (typeof window.navigateTo === 'function') window.navigateTo('campaign');
    load(); return true;
  }
  window.addEventListener('hashchange', fromHash);
  document.addEventListener('DOMContentLoaded', function () { if (fromHash()) setTimeout(function () { if (/^#campaign\//.test(location.hash) && activePageKey() !== 'campaign') fromHash(); }, 600); });
  if (document.readyState !== 'loading') fromHash();

  /* ---------- data ---------- */
  function skeleton() {
    $('cp-root').innerHTML = '<div class="cp-skel" style="aspect-ratio:16/8;margin-bottom:14px"></div><div class="cp-skel" style="height:96px;margin-bottom:14px"></div>' +
      '<div class="cp-pgrid">' + [1, 2, 3, 4].map(function () { return '<div class="cp-skel" style="height:230px"></div>'; }).join('') + '</div>';
  }
  function stateBox(icon, title, msg, retry) {
    $('cp-root').innerHTML = '<div class="cp-state"><i class="fa-solid ' + icon + '"></i><h3>' + esc(title) + '</h3><p>' + esc(msg) + '</p>' +
      (retry ? '<button class="cp-btn" data-cp="retry">Try again</button> ' : '') + '<button class="cp-btn ghost" data-cp="home">Go to Home</button></div>';
  }
  function load() {
    var my = ++st.token; stopTimer(); skeleton(); $('cp-title').textContent = 'Offer';
    if (!sb()) { stateBox('fa-plug-circle-xmark', 'Can’t connect', 'The app could not reach MediFinder India. Check your connection.', true); return; }
    sb().rpc('mf_campaign_page', { p_ref: st.ref }).then(function (r) {
      if (my !== st.token) return;
      if (r.error) { stateBox('fa-triangle-exclamation', 'Couldn’t load this offer', 'Something went wrong. Please try again.', true); return; }
      var d = r.data;
      if (!d || d.error) { stateBox('fa-circle-xmark', 'Offer not available', 'This offer link is invalid, or the offer is no longer published.', false); return; }
      st.data = d; st.offset = Date.parse(d.server_now) - Date.now();
      $('cp-title').textContent = d.campaign.title || 'Offer';
      render(); track('impression');
    }, function () { if (my === st.token) stateBox('fa-plug-circle-xmark', 'Can’t connect', 'Check your internet connection and try again.', true); });
  }

  /* ---------- helpers ---------- */
  function now() { return Date.now() + st.offset; }
  function status(c) { var t = now(), s = Date.parse(c.start_at), e = Date.parse(c.end_at); if (c.ended_early || t >= e) return 'ended'; return t < s ? 'scheduled' : 'live'; }
  function fmt(d) { return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }
  function pct(p) { var m = Number(p.mrp), s = Number(p.price); return m > s && s > 0 ? Math.round((m - s) / m * 100) : 0; }   // only from real prices
  function cats() { var set = {}; (st.data.products || []).forEach(function (p) { if (p.category) set[p.category] = 1; }); return Object.keys(set).sort(); }
  function filtered(extraCat) {
    var q = st.q.trim().toLowerCase(), cat = extraCat || st.cat;
    return (st.data.products || []).filter(function (p) { return (cat === 'all' || p.category === cat) && (!q || String(p.name || '').toLowerCase().indexOf(q) > -1); });
  }

  /* ---------- rendering ---------- */
  function imgBox(img, cfg, eager) {
    var u = safeImg(img.mobile_url && window.innerWidth < 700 ? img.mobile_url : img.url); if (!u) return '';
    var ar = cfg.aspect === 'auto' ? '' : '--cp-ar:' + esc(String(cfg.aspect || '16/9').replace(/[^0-9/.:]/g, '').replace(':', '/')) + ';';
    var inner = '<div class="cp-img-box' + (cfg.aspect === 'auto' ? ' auto' : '') + '" style="' + ar + '"><img src="' + esc(u) + '" alt="' + esc(img.alt || '') + '" ' + (eager ? 'fetchpriority="high"' : 'loading="lazy"') + ' decoding="async"></div>';
    return img.clickable && img.link_type && img.link_type !== 'none'
      ? '<button type="button" class="cp-img-btn" data-click="1" data-cp="img" data-lt="' + esc(img.link_type) + '" data-lv="' + esc(img.link_value || '') + '" aria-label="' + esc(img.alt || 'Open') + '">' + inner + '</button>'
      : '<div class="cp-img-btn">' + inner + '</div>';
  }
  function secStyle(cfg) {
    var r = Math.max(0, Math.min(24, Number(cfg.radius == null ? 16 : cfg.radius))), g = Math.max(4, Math.min(20, Number(cfg.gap == null ? 10 : cfg.gap)));
    var cm = Math.max(1, Math.min(3, +cfg.cols_m || 2)), ct = Math.max(1, Math.min(4, +cfg.cols_t || 3)), cd = Math.max(1, Math.min(6, +cfg.cols_d || 4));
    return '--cp-img-r:' + r + 'px;--cp-gap:' + g + 'px;--cp-fit:' + (cfg.fit === 'contain' ? 'contain' : 'cover') + ';--c-m:' + cm + ';--c-t:' + ct + ';--c-d:' + cd + ';';
  }
  function head(s, viewAll) {
    if (!s.title && !viewAll) return '';
    return '<div class="cp-sec-h"><div>' + (s.title ? '<h2>' + esc(s.title) + '</h2>' : '') + (s.subtitle ? '<p>' + esc(s.subtitle) + '</p>' : '') + '</div>' + (viewAll || '') + '</div>';
  }
  function productCard(p) {
    var d = pct(p), out = Number(p.stock) <= 0;
    return '<div class="cp-card" role="button" tabindex="0" data-cp="prod" data-id="' + esc(p.id) + '">' + (p.isRx ? '<span class="cp-rx">Rx</span>' : '') +
      '<div class="pic">' + (safeImg(p.img) ? '<img src="' + esc(p.img) + '" alt="" loading="lazy" decoding="async">' : '<i class="fa-solid fa-capsules" style="color:#c9ccd3;font-size:1.8rem"></i>') + '</div>' +
      '<div class="nm">' + esc(p.name) + '</div><div class="sh">' + esc(p.shop || '') + '</div>' +
      '<div class="cp-price"><b>' + inr(p.price) + '</b>' + (d ? '<s>' + inr(p.mrp) + '</s><em>' + d + '% off</em>' : '') + '</div>' +
      '<button type="button" class="cp-btn" data-cp="add" data-id="' + esc(p.id) + '"' + (out ? ' disabled' : '') + '>' + (out ? 'Out of stock' : (p.isRx ? 'Add (Rx needed)' : 'Add to cart')) + '</button></div>';
  }
  function section(s) {
    var cfg = s.config || {}, imgs = s.images || [], css = secStyle(cfg), theme = cfg.theme && /^(red|gold|white)$/.test(cfg.theme) ? ' cp-themed cp-theme-' + cfg.theme : '';
    var wrap = function (inner) { return '<section class="cp-sec' + theme + '" id="cp-s-' + esc(s.id) + '" style="' + css + '">' + inner + '</section>'; };
    switch (s.type) {
      case 'hero_carousel': case 'single_banner':
        if (!imgs.length) return '';
        if (imgs.length === 1 || s.type === 'single_banner') return wrap(head(s) + imgBox(imgs[0], cfg, true));
        return wrap(head(s) + '<div class="cp-carousel"><div class="cp-track" data-cp="track" aria-roledescription="carousel">' + imgs.map(function (i, k) { return '<div>' + imgBox(i, cfg, k === 0) + '</div>'; }).join('') + '</div><div class="cp-dots">' + imgs.map(function (_, k) { return '<span class="cp-dot' + (k ? '' : ' on') + '"></span>'; }).join('') + '</div></div>');
      case 'grid_2': case 'grid_multi':
        if (!imgs.length) return '';
        if (imgs.length === 1) return wrap(head(s) + imgBox(imgs[0], cfg, false));
        var one = s.type === 'grid_2' ? 'style="--c-m:2;--c-t:2;--c-d:2"' : '';
        return wrap(head(s) + '<div class="cp-grid" ' + one + '>' + imgs.map(function (i) { return imgBox(i, cfg, false); }).join('') + '</div>');
      case 'category_tiles':
        if (!imgs.length) return '';
        return wrap(head(s) + '<div class="cp-grid">' + imgs.map(function (i) { return '<div>' + imgBox(i, cfg, false) + (i.alt ? '<div style="text-align:center;font-size:.76rem;font-weight:600;margin-top:5px">' + esc(i.alt) + '</div>' : '') + '</div>'; }).join('') + '</div>');
      case 'product_carousel': case 'product_grid':
        var list = filtered(cfg.category && cfg.category !== 'all' ? cfg.category : null); if (!list.length) return '';
        var show = s.type === 'product_carousel' ? list.slice(0, 12) : list.slice(0, Number(cfg.limit) || 8);
        var va = list.length > show.length || s.type === 'product_carousel' ? '<button class="cp-link" data-cp="viewall" data-cat="' + esc(cfg.category || 'all') + '">View all</button>' : '';
        return wrap(head(s, va) + (s.type === 'product_carousel' ? '<div class="cp-prow">' : '<div class="cp-pgrid">') + show.map(productCard).join('') + '</div>');
      case 'service_collection':
        var sv = (st.data.services || []).filter(function (v) { return SERVICE_PAGE[v.type] && (!cfg.service_type || cfg.service_type === 'all' || cfg.service_type === v.type); }); if (!sv.length) return '';
        return wrap(head(s) + sv.map(function (v) {
          return '<div class="cp-svc"><div class="pic">' + (safeImg(v.image) ? '<img src="' + esc(v.image) + '" alt="" loading="lazy">' : '<i class="fa-solid ' + SERVICE_ICON[v.type] + '"></i>') + '</div><div class="tx"><b>' + esc(v.label) + '</b><span>' + esc(v.description || '') + '</span></div>' +
            '<button class="cp-btn" data-cp="svc" data-type="' + esc(v.type) + '" data-id="' + esc(v.id) + '">Book now</button></div>'; }).join(''));
      case 'sponsor_strip': case 'sponsor_tiers':
        var sp = st.data.sponsors || []; if (!sp.length) return '';
        var logo = function (p) { var im = '<img src="' + esc(safeImg(p.logo)) + '" alt="' + esc(p.name) + '" loading="lazy">'; var u = safeWeb(p.url); return u ? '<a class="cp-logo" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer sponsored" data-cp="sp">' + im + '</a>' : '<span class="cp-logo">' + im + '</span>'; };
        if (s.type === 'sponsor_strip') return wrap(head(s) + '<div class="cp-sp"><div class="cp-sp-row">' + sp.filter(function (p) { return safeImg(p.logo); }).map(logo).join('') + '</div></div>');
        return wrap(head(s) + '<div class="cp-sp">' + TIERS.map(function (t) { var rows = sp.filter(function (p) { return p.tier === t[0] && safeImg(p.logo); }); return rows.length ? '<h3>' + t[1] + '</h3><div class="cp-sp-row t-' + t[0] + '">' + rows.map(logo).join('') + '</div>' : ''; }).join('') + '</div>');
      case 'custom_text_image':
        var im0 = imgs[0]; if (!im0 && !cfg.body) return '';
        return wrap(head(s) + (im0 ? imgBox(im0, cfg, false) : '') + (cfg.body ? '<p style="margin:10px 2px 0;font-size:.9rem;line-height:1.5;color:#454b57">' + esc(cfg.body) + '</p>' : '') +
          (cfg.cta_label && cfg.cta_target ? '<div style="margin-top:10px"><button class="cp-btn" data-cp="act" data-act="' + esc(cfg.cta_target) + '">' + esc(cfg.cta_label) + '</button></div>' : ''));
    }
    return '';
  }
  function infoCard(c) {
    var s = status(c), lbl = { live: 'Live now', scheduled: 'Starts soon', ended: 'Ended' }[s];
    var cta = c.cta_label && c.cta_url ? '<div style="margin-top:12px"><button class="cp-btn" data-cp="act" data-act="' + esc(c.cta_url) + '">' + esc(c.cta_label) + '</button></div>' : '';
    return '<div class="cp-info"><h1>' + esc(c.title) + '</h1>' + (c.discount_text ? '<p style="color:var(--cp-red);font-weight:800">' + esc(c.discount_text) + '</p>' : '') + (c.description ? '<p>' + esc(c.description) + '</p>' : '') +
      '<div class="cp-meta"><span class="cp-status ' + s + '" id="cp-status">' + lbl + '</span><span>' + fmt(c.start_at) + ' – ' + fmt(c.end_at) + '</span></div>' +
      (c.show_countdown && s !== 'ended' ? '<div class="cp-count" id="cp-count" role="timer" aria-live="off"></div>' : '') + cta +
      (c.terms ? '<details class="cp-terms"><summary>Terms &amp; conditions</summary><div>' + esc(c.terms) + '</div></details>' : '') + '</div>';
  }
  function chips() {
    var cs = cats(); if (cs.length < 2) return '';
    return '<div class="cp-chips" id="cp-chips" role="tablist">' + ['all'].concat(cs).map(function (c) { return '<button class="cp-chip' + (st.cat === c ? ' on' : '') + '" role="tab" aria-selected="' + (st.cat === c) + '" data-cp="chip" data-cat="' + esc(c) + '">' + (c === 'all' ? 'All' : esc(c)) + '</button>'; }).join('') + '</div>';
  }
  function buildHTML() {
    var d = st.data, c = d.campaign, h = infoCard(c), secs = (d.sections || []).map(section).join('');
    var hasProdSec = (d.sections || []).some(function (s) { return s.type === 'product_carousel' || s.type === 'product_grid'; });
    var prods = d.products || [];
    var fallback = !hasProdSec && prods.length ? '<section class="cp-sec" id="cp-prods"><div class="cp-sec-h"><h2>Deals for you</h2></div><div class="cp-pgrid" id="cp-pg">' + filtered().map(productCard).join('') + '</div></section>' : '';
    var hero = !(d.sections || []).some(function (s) { return s.type === 'hero_carousel' || s.type === 'single_banner'; }) && safeImg(c.image_url)
      ? '<div class="cp-sec" style="--cp-img-r:16px;--cp-fit:contain"><div class="cp-img-btn"><div class="cp-img-box auto"><img src="' + esc(c.image_url) + '" alt="' + esc(c.title) + '" fetchpriority="high" decoding="async"></div></div></div>' : '';
    var empty = !secs && !fallback && !hero ? '<div class="cp-state"><i class="fa-regular fa-clock"></i><h3>Nothing here yet</h3><p>' + (status(c) === 'scheduled' ? 'Deals appear when the offer starts.' : 'No eligible products or services are available right now.') + '</p></div>' : '';
    return hero + h + chips() + secs + fallback + empty;
  }
  function render() { $('cp-root').innerHTML = buildHTML(); bindTracks(); startTimer(); paintCart(); }
  // Admin live preview: same renderer, no page state touched. Returns HTML only.
  function preview(data) { var keep = { d: st.data, c: st.cat, q: st.q, o: st.offset }; st.data = data; st.cat = 'all'; st.q = ''; st.offset = 0; try { return buildHTML(); } finally { st.data = keep.d; st.cat = keep.c; st.q = keep.q; st.offset = keep.o; } }
  function renderAll(cat) {
    st.view = 'all'; var list = filtered(cat);
    $('cp-root').innerHTML = '<div class="cp-sec-h"><div><h2>' + (cat && cat !== 'all' ? esc(cat) : 'All deals') + '</h2><p>' + list.length + ' product' + (list.length === 1 ? '' : 's') + '</p></div></div>' + chips() +
      (list.length ? '<div class="cp-pgrid" id="cp-pg">' + list.map(productCard).join('') + '</div>' : '<div class="cp-state"><i class="fa-solid fa-box-open"></i><h3>No products found</h3><p>Try another category or search.</p></div>');
    $('cp-root').scrollTop = 0;
  }
  function showMain() { st.view = 'main'; st.cat = 'all'; render(); }
  function repaintProducts() {
    var pg = $('cp-pg');
    if (st.view === 'all') { renderAll(st.cat); return; }
    if (pg) { var l = filtered(); pg.innerHTML = l.length ? l.map(productCard).join('') : ''; if (!l.length) pg.innerHTML = '<div class="cp-state" style="grid-column:1/-1"><h3>No products found</h3><p>Try another category or search.</p></div>'; }
    else render();
  }

  /* ---------- carousel dots, countdown ---------- */
  function bindTracks() {
    document.querySelectorAll('#cp-root [data-cp="track"]').forEach(function (tr) {
      var dots = tr.parentNode.querySelectorAll('.cp-dot');
      tr.addEventListener('scroll', function () { var i = Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth)); dots.forEach(function (d, k) { d.classList.toggle('on', k === i); }); }, { passive: true });
    });
  }
  function stopTimer() { if (st.timer) { clearInterval(st.timer); st.timer = null; } }
  function startTimer() {
    stopTimer(); var c = st.data && st.data.campaign; if (!c) return;
    var el = $('cp-count'), prev = status(c);
    function tick() {
      var s = status(c);
      if (s !== prev) { stopTimer(); load(); return; }          // status flipped on server time → refetch real data
      if (!el) return;
      var target = s === 'scheduled' ? Date.parse(c.start_at) : Date.parse(c.end_at), ms = Math.max(0, target - now()), sec = Math.floor(ms / 1000);
      var dd = Math.floor(sec / 86400), hh = Math.floor(sec % 86400 / 3600), mm = Math.floor(sec % 3600 / 60), ss = sec % 60, u = function (n, l) { return '<div class="u"><i>' + String(n).padStart(2, '0') + '</i><span>' + l + '</span></div>'; };
      el.innerHTML = '<b>' + (s === 'scheduled' ? 'Starts in' : 'Ends in') + '</b>' + (dd ? u(dd, 'days') : '') + u(hh, 'hrs') + u(mm, 'min') + u(ss, 'sec');
    }
    tick(); if (el) st.timer = setInterval(tick, 1000); else st.timer = setInterval(function () { if (status(c) !== prev) { stopTimer(); load(); } }, 15000);
  }

  /* ---------- actions (existing flows only) ---------- */
  function goProduct(id) {
    var p = (st.data.products || []).filter(function (x) { return String(x.id) === String(id); })[0]; if (!p) return;
    track('product_click', String(p.id));
    if (typeof window.navigateToProductDetail === 'function') window.navigateToProductDetail({ id: p.id, name: p.name, price: p.price, mrp: p.mrp, img: p.img, merchantId: p.merchantId, category: p.category, isRx: String(!!p.isRx) });
  }
  function runLink(type, val) {
    if (type === 'campaign_section') { var t = $('cp-s-' + val); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (type === 'category') { st.cat = val || 'all'; renderAll(st.cat); }
    else if (type === 'product') goProduct(val);
    else if (type === 'service') { var pg = SERVICE_PAGE[val]; if (pg) { track('service_click', val); window.navigateTo(pg); } }
    else if (type === 'internal_page') { if (PAGES.indexOf(val) > -1) window.navigateTo(val); }
    else if (type === 'external_url') { var u = safeWeb(val); if (u) window.open(u, '_blank', 'noopener,noreferrer'); }
  }
  function runAct(a) {                                   // "page:cart" | "service:nurse" | "category:Tablets" | "section:<id>" | https://…
    var i = String(a).indexOf(':'), k = i > -1 ? a.slice(0, i) : '', v = i > -1 ? a.slice(i + 1) : '';
    if (k === 'page') runLink('internal_page', v); else if (k === 'service') runLink('service', v); else if (k === 'category') runLink('category', v); else if (k === 'section') runLink('campaign_section', v); else if (/^https:/i.test(a)) runLink('external_url', a);
  }

  /* ---------- one delegated listener per page (no duplicates) ---------- */
  function wire() {
    var page = $('page-campaign'); if (!page || page.__mfWired) return; page.__mfWired = true;
    page.addEventListener('click', function (e) {
      var t = e.target.closest('[data-cp]'); if (!t) { return; }
      var a = t.getAttribute('data-cp');
      if (a === 'back') back();
      else if (a === 'cart') window.navigateTo('cart');
      else if (a === 'search') { var s = $('cp-search'); s.classList.toggle('open'); if (s.classList.contains('open')) $('cp-q').focus(); }
      else if (a === 'retry') load();
      else if (a === 'home') window.navigateTo('home');
      else if (a === 'chip') { st.cat = t.getAttribute('data-cat'); if (st.view === 'main' && !$('cp-pg')) { renderAll(st.cat); } else repaintProducts(); var c = document.querySelector('#cp-chips .cp-chip.on'); if (c && c.scrollIntoView) c.scrollIntoView({ inline: 'center', block: 'nearest' }); }
      else if (a === 'viewall') { try { history.pushState({ mfCampaign: st.ref, all: 1 }, '', location.hash); } catch (x) {} renderAll(t.getAttribute('data-cat')); }
      else if (a === 'add') { e.stopPropagation(); var p = (st.data.products || []).filter(function (x) { return String(x.id) === t.getAttribute('data-id'); })[0]; if (p && typeof window.addToCart === 'function') { track('product_click', String(p.id)); window.addToCart({ id: p.id, name: p.name, price: p.price, mrp: p.mrp, img: p.img, merchantId: p.merchantId, isRx: !!p.isRx }); paintCart(); } }
      else if (a === 'prod') goProduct(t.getAttribute('data-id'));
      else if (a === 'svc') runLink('service', t.getAttribute('data-type'));
      else if (a === 'img') { track('click', t.getAttribute('data-lt')); runLink(t.getAttribute('data-lt'), t.getAttribute('data-lv')); }
      else if (a === 'act') { track('click', 'cta'); runAct(t.getAttribute('data-act')); }
    });
    page.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute && e.target.getAttribute('data-cp') === 'prod') { e.preventDefault(); goProduct(e.target.getAttribute('data-id')); } });
    var q = $('cp-q'), tm; if (q) q.addEventListener('input', function () { clearTimeout(tm); tm = setTimeout(function () { st.q = q.value; repaintProducts(); }, 160); });
    window.addEventListener('storage', paintCart);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  window.MFCampaign = { open: open, reload: load, preview: preview };
})();
