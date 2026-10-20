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
  // Health-only campaign: hides grocery / household / fashion style categories even if a merchant listed them.
  var NON_HEALTH = /(detergent|laundry|household|tissue|paper|grocer|kitchen|cookware|dress|cloth|fashion|apparel|footwear|shoe|electronic|mobile|toy|furniture|snack|beverage|decor|cleaning)/i;
  function healthy(p) { return !(window.MF_HEALTH_ONLY === true && NON_HEALTH.test(String(p.category || ''))); }   // off by default: set window.MF_HEALTH_ONLY = true to hide non-health categories
  function healthList() { return (st.data.products || []).filter(healthy); }
  function cats() { var set = {}; healthList().forEach(function (p) { if (p.category) set[p.category] = 1; }); return Object.keys(set).sort(); }
  function filtered(extraCat) {
    var q = st.q.trim().toLowerCase(), cat = extraCat || st.cat;
    return healthList().filter(function (p) { return (cat === 'all' || p.category === cat) && (!q || String(p.name || '').toLowerCase().indexOf(q) > -1); });
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
    return '<div class="cp-card" role="button" tabindex="0" data-cp="prod" data-id="' + esc(p.id) + '">' + (p.isRx ? '<span class="cp-rx">Rx</span>' : '') + (d ? '<span class="cp-off">' + d + '% OFF</span>' : '') +
      '<div class="pic">' + (safeImg(p.img) ? '<img src="' + esc(p.img) + '" alt="" loading="lazy" decoding="async">' : '<i class="fa-solid fa-capsules" style="color:#c9ccd3;font-size:1.8rem"></i>') + '</div>' +
      '<div class="nm">' + esc(p.name) + '</div><div class="sh">' + esc(p.shop || '') + '</div>' + (!out && Number(p.stock) <= 5 ? '<div class="cp-low">Only ' + Number(p.stock) + ' left</div>' : '') +
      '<div class="cp-price"><b>' + inr(p.price) + '</b>' + (d ? '<s>' + inr(p.mrp) + '</s><em>' + d + '% off</em>' : '') + '</div>' +
      '<button type="button" class="cp-btn" data-cp="add" data-id="' + esc(p.id) + '"' + (out ? ' disabled' : '') + '>' + (out ? 'Out of stock' : (p.isRx ? 'Add (Rx needed)' : 'Add to cart')) + '</button></div>';
  }
  function section(s) {
    var cfg = s.config || {}, imgs = s.images || [], css = secStyle(cfg), theme = cfg.theme && /^(red|gold|white|pink|orange|royal|brand|teal)$/.test(cfg.theme) ? ' cp-themed cp-theme-' + cfg.theme : '';
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
  /* ---------- Rich automatic layout (real data only) ----------
     Used when the campaign has no product section of its own: category tiles, biggest savings,
     per-category festive carousels, under-₹99 picks. Everything comes from the approved products. */
  function wrapSec(id, theme, headHtml, inner) { return '<section class="cp-sec cp-themed cp-theme-' + theme + '" id="' + id + '">' + headHtml + inner + '</section>'; }
  function minPrice(list) { var n = list.map(function (p) { return Number(p.price) || 0; }).filter(Boolean); return n.length ? Math.min.apply(null, n) : 0; }
  function maxPct(list) { return Math.max.apply(null, list.map(pct).concat([0])); }
  function autoLayout() {
    var all = healthList(); if (!all.length) return '';
    var by = {}; all.forEach(function (p) { var c = p.category || 'Health essentials'; (by[c] = by[c] || []).push(p); });
    var names = Object.keys(by).sort(function (a, b) { return by[b].length - by[a].length; });
    var out = '', th = ['teal', 'brand', 'royal'];
    if (names.length > 1) {
      out += wrapSec('cp-a-cats', 'brand', head({ title: 'Shop by health need', subtitle: 'Tap a category to see all deals' }),
        '<div class="cp-tiles">' + names.slice(0, 9).map(function (c) {
          var l = by[c], im = l.filter(function (p) { return safeImg(p.img); })[0], mp = minPrice(l);
          return '<button type="button" class="cp-tile" data-cp="viewall" data-cat="' + esc(c) + '"><span class="ph">' + (im ? '<img src="' + esc(im.img) + '" alt="" loading="lazy">' : '<i class="fa-solid fa-capsules"></i>') + '</span>' +
            (mp ? '<span class="pr">From ' + inr(mp) + '</span>' : '') + '<span class="nm">' + esc(c) + '</span></button>'; }).join('') + '</div>');
    }
    var disc = all.filter(function (p) { return pct(p) > 0; }).sort(function (a, b) { return pct(b) - pct(a); }).slice(0, 6);
    if (disc.length >= 2) out += wrapSec('cp-a-top', 'royal', head({ title: 'Biggest savings', subtitle: 'Up to ' + maxPct(all) + '% off on health essentials' }), '<div class="cp-pgrid">' + disc.map(productCard).join('') + '</div>');
    var big = names.filter(function (c) { return by[c].length >= 3; });
    if (!big.length && all.length >= 2) out += wrapSec('cp-a-all', 'teal', head({ title: 'Top health deals', subtitle: 'Hand-picked offers for you' }), '<div class="cp-prow">' + all.slice(0, 12).map(productCard).join('') + '</div>');
    big.slice(0, 4).forEach(function (c, i) {
      var l = by[c], m = maxPct(l), mp = minPrice(l);
      out += section({ id: 'a-cat-' + i, type: 'product_carousel', title: 'Deals on ' + c, subtitle: (mp ? 'From ' + inr(mp) : '') + (m ? (mp ? ' · ' : '') + 'up to ' + m + '% off' : ''), config: { category: c, theme: th[i % 3] }, images: [] });
    });
    var cheap = all.filter(function (p) { return Number(p.price) > 0 && Number(p.price) <= 99; }).slice(0, 10);
    if (cheap.length >= 3) out += wrapSec('cp-a-cheap', 'brand', head({ title: 'Everyday care under ₹99', subtitle: 'Pocket-friendly picks' }), '<div class="cp-prow">' + cheap.map(productCard).join('') + '</div>');
    return out;
  }
  function buildHTML() {
    var d = st.data, c = d.campaign, h = infoCard(c), secs = (d.sections || []).map(section).join('');
    var hasProdSec = (d.sections || []).some(function (s) { return s.type === 'product_carousel' || s.type === 'product_grid'; });
    var prods = (d.products || []).filter(healthy);
    var auto = !hasProdSec ? autoLayout() : '';
    var hasSvSec = (d.sections || []).some(function (s) { return s.type === 'service_collection'; });
    var autoSv = !hasSvSec && (d.services || []).length ? section({ id: 'a-svc', type: 'service_collection', title: 'Healthcare services', subtitle: 'Book in a few taps', config: {}, images: [] }) : '';
    var fallback = !hasProdSec && prods.length ? '<section class="cp-sec" id="cp-prods"><div class="cp-sec-h"><h2>' + (auto ? 'All deals' : 'Deals for you') + '</h2></div><div class="cp-pgrid" id="cp-pg">' + filtered().map(productCard).join('') + '</div></section>' : '';
    var hero = !(d.sections || []).some(function (s) { return s.type === 'hero_carousel' || s.type === 'single_banner'; }) && safeImg(c.image_url)
      ? '<div class="cp-sec" style="--cp-img-r:16px;--cp-fit:contain"><div class="cp-img-btn"><div class="cp-img-box auto"><img src="' + esc(c.image_url) + '" alt="' + esc(c.title) + '" fetchpriority="high" decoding="async"></div></div></div>' : '';
    var empty = !secs && !fallback && !hero && !((d.sponsors || []).length) ? '<div class="cp-state"><i class="fa-regular fa-clock"></i><h3>Nothing here yet</h3><p>' + (status(c) === 'scheduled' ? 'Deals appear when the offer starts.' : 'No eligible products or services are available right now.') + '</p></div>' : '';
    var hasSpSec = (d.sections || []).some(function (s) { return s.type === 'sponsor_tiers' || s.type === 'sponsor_strip'; });
    var autoSp = !hasSpSec && (d.sponsors || []).length ? section({ id: 'auto-sponsors', type: 'sponsor_tiers', title: '', config: {}, images: [] }) : '';
    var trust = '<div class="cp-trust"><span><i class="fa-solid fa-shield-halved"></i>Verified pharmacy partners</span><span><i class="fa-solid fa-truck-fast"></i>Fast home delivery</span><span><i class="fa-solid fa-file-prescription"></i>Prescription-safe ordering</span></div>';
    return hero + h + trust + (auto ? '' : chips()) + secs + autoSv + auto + fallback + autoSp + empty;
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

  /* ---------- home "Today's Health Deals" feed (replaces the offer.js strip when it loads OK) ---------- */
  var hm = { off: 0, items: [], timer: null, at: 0, busy: false };
  function homeTile(p) {
    var d = pct(p);
    return '<div class="hm-tile"><div class="pic">' + (safeImg(p.img) ? '<img src="' + esc(p.img) + '" alt="" loading="lazy" decoding="async">' : '') + '</div><b>' + inr(p.price) + '</b>' + (d ? '<em>' + d + '% off</em>' : '<em class="n">&nbsp;</em>') + '</div>';
  }
  function homeCard(c) {
    var more = Number(c.count) - (c.products || []).length;
    return '<article class="hm-card"><button type="button" class="hm-open" data-hm="open" data-id="' + esc(c.id) + '" aria-label="Open ' + esc(c.title) + '">' +
      (safeImg(c.image) ? '<img class="hm-banner" src="' + esc(c.image) + '" alt="' + esc(c.title) + '" decoding="async" fetchpriority="high">' : '') +
      (c.show_countdown ? '<div class="hm-count" data-end="' + esc(c.end_at) + '" data-start="' + esc(c.start_at) + '"></div>' : '') +
      '<div class="hm-body">' + (c.discount_text ? '<div class="hm-pill">' + esc(c.discount_text) + '</div>' : '') + '<h3>' + esc(c.title) + '</h3>' +
      ((c.products || []).length ? '<div class="hm-tiles">' + c.products.map(homeTile).join('') + (more > 0 ? '<div class="hm-more"><b>' + more + '+</b><span>items</span></div>' : '') + '</div>' : '') +
      '</div></button></article>';
  }
  function homeTick() {
    var els = document.querySelectorAll('#mf-home-campaigns .hm-count'); if (!els.length) { clearInterval(hm.timer); hm.timer = null; return; }
    var t = Date.now() + hm.off;
    els.forEach(function (el) {
      var sA = Date.parse(el.getAttribute('data-start')), eA = Date.parse(el.getAttribute('data-end')), pre = t < sA, ms = Math.max(0, (pre ? sA : eA) - t), sec = Math.floor(ms / 1000);
      var u = function (n, l) { return '<span class="u"><i>' + String(n).padStart(2, '0') + '</i>' + l + '</span>'; };
      el.innerHTML = '<b>' + (pre ? 'STARTS IN' : 'ENDS IN') + '</b><div>' + u(Math.floor(sec / 86400), 'd') + u(Math.floor(sec % 86400 / 3600), 'h') + u(Math.floor(sec % 3600 / 60), 'm') + u(sec % 60, 's') + '</div>';
      if (ms === 0 && !pre && !hm.busy) { hm.busy = true; setTimeout(function () { hm.busy = false; loadHome(true); }, 1500); }
    });
  }
  function paintHome(host) {
    if (!hm.items.length) { host.innerHTML = ''; document.body.classList.remove('mf-cp-home'); return; }
    host.innerHTML = '<h2 class="hm-title"><span aria-hidden="true">🔥</span> Today’s Health Deals</h2>' + hm.items.map(homeCard).join('');
    document.body.classList.add('mf-cp-home');                 // hides the old #mf-offers strip only after this one rendered
    homeTick(); if (!hm.timer) hm.timer = setInterval(homeTick, 1000);
  }
  function loadHome(force) {
    var host = $('mf-home-campaigns'); if (!host || !sb()) return;
    if (!force && Date.now() - hm.at < 30000) return; hm.at = Date.now();
    sb().rpc('mf_campaign_home').then(function (r) {
      if (r.error || !r.data) return;                          // keep whatever is on screen (old strip stays as fallback)
      hm.off = Date.parse(r.data.server_now) - Date.now(); hm.items = r.data.items || []; paintHome(host);
    }, function () {});
  }
  function wireHome() {
    var host = $('mf-home-campaigns'); if (!host || host.__mfWired) return; host.__mfWired = true;
    host.addEventListener('click', function (e) {
      var t = e.target.closest('[data-hm="open"]'); if (!t) return;
      e.preventDefault(); e.stopPropagation();
      var id = t.getAttribute('data-id'); st.tracked = {}; st.ref = id;
      track('click', 'home'); st.ref = null; open(id);
    });
    loadHome(true);
    window.addEventListener('mf:page-enter', function (e) { if (e.detail && e.detail.page === 'home') loadHome(false); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireHome); else wireHome();
    window.MFCampaign = { open: open, reload: load, preview: preview };
})();
