/* MediFinder India — Admin Campaign Builder. Loads after admin.js and uses its globals (Actions, DATA, supabase, openModal…). */
(function () {
  'use strict';
  if (typeof Actions === 'undefined' || typeof supabase === 'undefined' || !supabase || window.__mfCB) return;
  window.__mfCB = 1;
  var BUCKET = 'campaign-banners', MAXB = 5 * 1024 * 1024, OKT = ['image/jpeg', 'image/png', 'image/webp'];
  var STYPES = { hero_carousel: 'Hero banner carousel', single_banner: 'Single promotional banner', grid_2: 'Two-image grid', grid_multi: 'Multi-image grid', product_carousel: 'Product deals carousel', product_grid: 'Product collection grid', service_collection: 'Healthcare services', category_tiles: 'Category tiles', sponsor_strip: 'Sponsor logo strip', sponsor_tiers: 'Sponsor tiers (Powered by…)', custom_text_image: 'Image and text' };
  var IMGT = ['hero_carousel', 'single_banner', 'grid_2', 'grid_multi', 'category_tiles', 'custom_text_image'];
  var CTYPES = { medicine: 'Medicine & pharmacy deals', equipment: 'Medical equipment & devices', baby_mother: 'Baby & mother care', personal_care: 'Personal care & hygiene', nutrition: 'Nutrition & healthcare products', diagnostics: 'Diagnostic tests & lab services', home_care: 'Home healthcare & nurse booking', ambulance: 'Ambulance services', blood: 'Blood donation & partner services', seasonal: 'Seasonal healthcare', mixed: 'Mixed deals' };
  var TIERS = { presented_by: 'Presented by', powered_by: 'Powered by', co_powered_by: 'Co-powered by', associate: 'Associate sponsor' };
  var LINKS = { none: 'No link', campaign_section: 'Scroll to section', product: 'Product', category: 'Category', service: 'Service booking', internal_page: 'App page', external_url: 'External website (https)' };
  var PAGES = ['home', 'shops', 'cart', 'order', 'profile', 'lab-test', 'nurse-booking', 'ambulance'];
  var TABS = [['details', 'Details'], ['sections', 'Sections & images'], ['sponsors', 'Sponsors'], ['items', 'Products & services'], ['preview', 'Preview']];
  var B = null;
  var uid = function () { return (crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var q = function (s, r) { return (r || document).querySelector(s); };
  var attr = function (s) { return esc(s == null ? '' : s); };

  /* styles: one small block, admin tokens reused where they exist */
  var css = document.createElement('style'); css.textContent =
    '.cb-tabs{display:flex;gap:6px;overflow-x:auto;margin:0 0 14px;padding-bottom:4px;scrollbar-width:none}.cb-tabs button{flex:none;border:1px solid var(--line,#ddd);background:var(--surface,#fff);color:inherit;border-radius:999px;padding:8px 14px;font-weight:600;cursor:pointer}.cb-tabs button.on{background:var(--brand,#0E5C52);color:#fff;border-color:transparent}' +
    '.cb-card{border:1px solid var(--line,#ddd);border-radius:12px;padding:12px;margin-bottom:12px;background:var(--surface,#fff)}.cb-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.cb-grow{flex:1;min-width:140px}' +
    '.cb-img{display:flex;gap:10px;padding:10px 0;border-top:1px solid var(--line,#eee)}.cb-img .th{flex:none;width:84px;height:64px;border-radius:8px;background:#e8e8ec center/contain no-repeat;border:1px solid var(--line,#ddd)}.cb-err{color:#c0392b;font-size:12px;margin-top:4px}' +
    '.cb-dev{display:flex;gap:6px;margin-bottom:10px}.cb-frame{display:block;margin:0 auto;border:1px solid var(--line,#ccc);border-radius:14px;background:#fff;max-width:100%;height:70vh}.cb-spin{display:inline-block;width:14px;height:14px;border:2px solid #fff6;border-top-color:#fff;border-radius:50%;animation:cbs .7s linear infinite;vertical-align:-2px;margin-right:6px}@keyframes cbs{to{transform:rotate(360deg)}}' +
    '.cb-warn{background:#fff6e0;border:1px solid #f0cf80;color:#6b4a00;border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:13px}' +
    '#cbProg:empty{display:none}.fp-foot .fp-foot-in>.cb-row{flex-wrap:nowrap;gap:14px;align-items:center}#cbFoot{flex:1;display:flex;flex-wrap:nowrap;justify-content:space-between;gap:16px;min-width:0}#cbFoot .btn{min-width:130px;justify-content:center;white-space:nowrap}#cbFoot .btn:only-child{margin-left:auto}' +
    '@media(max-width:640px){.fp-foot .fp-foot-in{flex-direction:column-reverse;gap:8px}.fp-foot .fp-foot-in>.cb-row{flex-direction:column;align-items:stretch;gap:8px}#cbProg{text-align:center}#cbFoot{width:100%;gap:12px}#cbFoot .btn{flex:1 1 0;width:auto;min-width:0;padding:12px 8px}}';
  document.head.appendChild(css);

  /* ---------- load / model ---------- */
  function blank() { var now = new Date(), end = new Date(now.getTime() + 7 * 864e5); return { id: null, c: { title: '', description: '', discount_text: '', campaign_type: 'mixed', terms: '', cta_label: '', cta_url: '', display_order: 0, show_countdown: true, show_homepage: true, start_at: toLocalInput(now), end_at: toLocalInput(end), image_url: null, is_published: false, ended_early: false }, sections: [], sponsors: [], services: [], products: [], del: { sections: [], images: [], sponsors: [], services: [] }, orphans: [], tab: 'details', saving: false, errors: [], dev: 390, pq: '', pres: [] }; }
  async function fetchAll(id) {
    var r = await Promise.all([
      supabase.from('campaigns').select('*').eq('id', id).single(),
      supabase.from('campaign_sections').select('*').eq('campaign_id', id).order('display_order'),
      supabase.from('campaign_images').select('*').eq('campaign_id', id).order('display_order'),
      supabase.from('campaign_sponsors').select('*').eq('campaign_id', id).order('display_order'),
      supabase.from('campaign_services').select('*').eq('campaign_id', id).order('display_order'),
      supabase.from('campaign_products').select('id,status,medicine_id,merchant_id,reject_reason,medicines(name,product_name,image_url,selling_price,mrp,stock_qty,is_rx,category,status,is_visible),merchants(shop_name)').eq('campaign_id', id).order('created_at')]);
    for (var i = 0; i < 5; i++) if (r[i].error) throw new Error(r[i].error.message + (/does not exist|schema cache/i.test(r[i].error.message) ? ' — run medifinder_campaigns_v2.sql first' : ''));
    var c = r[0].data, m = blank();
    m.id = c.id; m.c = { title: c.title || '', description: c.description || '', discount_text: c.discount_text || '', campaign_type: c.campaign_type || 'mixed', terms: c.terms || '', cta_label: c.cta_label || '', cta_url: c.cta_url || '', display_order: c.display_order || 0, show_countdown: !!c.show_countdown, show_homepage: !!c.show_homepage, start_at: toLocalInput(new Date(c.start_at)), end_at: toLocalInput(new Date(c.end_at)), image_url: c.image_url, is_published: !!c.is_published, ended_early: !!c.ended_early };
    var imgs = r[2].data || [];
    m.sections = (r[1].data || []).map(function (s) { return { _k: s.id, id: s.id, section_type: s.section_type, title: s.title || '', subtitle: s.subtitle || '', config: s.config || {}, is_visible: s.is_visible, images: imgs.filter(function (i) { return i.section_id === s.id; }).map(function (i) { return { _k: i.id, id: i.id, url: i.image_url, storage_path: i.storage_path, mobile_url: i.mobile_image_url, mobile_path: i.mobile_storage_path, alt_text: i.alt_text || '', is_clickable: !!i.is_clickable, link_type: i.link_type || 'none', link_value: i.link_value || '', is_visible: i.is_visible }; }) }; });
    m.sponsors = (r[3].data || []).map(function (p) { return { _k: p.id, id: p.id, brand_name: p.brand_name, tier: p.tier, website_url: p.website_url || '', logo_url: p.logo_url, logo_path: p.logo_storage_path, is_active: p.is_active, authorization_confirmed: p.authorization_confirmed }; });
    m.services = (r[4].data || []).map(function (v) { return { _k: v.id, id: v.id, service_type: v.service_type, label: v.label, description: v.description || '', provider_ref: v.provider_ref || '', is_active: v.is_active }; });
    m.products = r[5].error ? [] : (r[5].data || []);
    return m;
  }

  /* ---------- open ---------- */
  function shell() {
    openModal(B.id ? 'Edit campaign' : 'New campaign', '<div id="cbRoot"></div>', '<div class="cb-row" style="width:100%;justify-content:space-between"><span id="cbProg" class="cell-sub"></span><span class="cb-row" id="cbFoot" style="flex:1;display:flex;flex-wrap:nowrap;justify-content:space-between;gap:12px;min-width:0"></span></div>');
    bindRoot(); paint();
  }
  Actions['camp-new'] = function () { B = blank(); shell(); };
  Actions['camp-edit'] = async function (el) {
    var id = el.dataset.id; toast('Loading campaign…');
    try { B = await fetchAll(id); } catch (e) { toast('Cannot open: ' + e.message, 'danger'); return; }
    shell();
  };

  /* ---------- paint ---------- */
  function paint() {
    var root = q('#cbRoot'); if (!root) return; var sc = q('.fp-scroll'), top = sc ? sc.scrollTop : 0;
    var mig = B.migrationMissing ? '<div class="cb-warn">The campaign tables are missing. Run <b>medifinder_campaigns_v2.sql</b> in Supabase, then reopen this page.</div>' : '';
    var err = B.errors.length ? '<div class="cb-warn"><b>Fix before saving:</b><ul style="margin:6px 0 0 18px">' + B.errors.map(function (e) { return '<li>' + esc(e.msg) + '</li>'; }).join('') + '</ul></div>' : '';
    root.innerHTML = mig + err + '<div class="cb-tabs" role="tablist">' + TABS.map(function (t) { return '<button type="button" role="tab" class="' + (B.tab === t[0] ? 'on' : '') + '" data-cb="tab" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div><div id="cbBody">' + ({ details: tDetails, sections: tSections, sponsors: tSponsors, items: tItems, preview: tPreview }[B.tab])() + '</div>';
    var p = B.c.is_published, dis = B.saving ? ' disabled' : '';
    q('#cbFoot').innerHTML = (p ? '<button class="btn" style="flex:1 1 0;max-width:240px;min-width:0;width:auto;justify-content:center;white-space:nowrap"' + dis + ' data-cb="unpublish">Unpublish</button>' : '<button class="btn" style="flex:1 1 0;max-width:240px;min-width:0;width:auto;justify-content:center;white-space:nowrap"' + dis + ' data-cb="draft">Save draft</button>') +
      '<button class="btn primary" style="flex:1 1 0;max-width:240px;min-width:0;width:auto;justify-content:center;white-space:nowrap"' + dis + ' data-cb="' + (p ? 'draft' : 'publish') + '">' + (B.saving ? '<span class="cb-spin"></span>Saving…' : (p ? 'Save changes' : 'Publish')) + '</button>';
    if (sc) sc.scrollTop = top;
    if (B.tab === 'preview') drawPreview();
  }
  var F = function (label, inner, hint) { return '<div class="field"><label>' + label + '</label>' + inner + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>'; };
  var inp = function (path, v, ph, type, extra) { return '<input ' + (type ? 'type="' + type + '" ' : '') + 'data-b="' + path + '" value="' + attr(v) + '" placeholder="' + attr(ph || '') + '" ' + (extra || '') + '>'; };
  var chk = function (path, v, label) { return '<label class="chk"><input type="checkbox" data-b="' + path + '"' + (v ? ' checked' : '') + '> ' + label + '</label>'; };
  var sel = function (path, v, opts) { return '<select data-b="' + path + '">' + Object.keys(opts).map(function (k) { return '<option value="' + attr(k) + '"' + (String(v) === k ? ' selected' : '') + '>' + esc(opts[k]) + '</option>'; }).join('') + '</select>'; };

  function tDetails() {
    var c = B.c;
    return F('Campaign title *', inp('c.title', c.title, 'Mega Health Sale')) + F('Short offer text', inp('c.discount_text', c.discount_text, 'Up to 40% off'), 'Shown under the title. Only claim discounts the listed products actually have.') +
      F('Description', '<textarea data-b="c.description">' + esc(c.description) + '</textarea>') + F('Campaign type', sel('c.campaign_type', c.campaign_type, CTYPES)) +
      '<div class="field-row">' + F('Starts *', inp('c.start_at', c.start_at, '', 'datetime-local')) + F('Ends *', inp('c.end_at', c.end_at, '', 'datetime-local')) + '</div>' +
      F('Terms & conditions', '<textarea data-b="c.terms" placeholder="Eligibility, validity, prescription rules…">' + esc(c.terms) + '</textarea>') +
      '<div class="field-row">' + F('Button label (optional)', inp('c.cta_label', c.cta_label, 'Shop now')) + F('Button action', inp('c.cta_url', c.cta_url, 'page:cart · service:nurse · category:Tablets · https://…'), 'Leave empty for no button.') + '</div>' +
      F('Display order on home', inp('c.display_order', c.display_order, '0', 'number')) + chk('c.show_countdown', c.show_countdown, 'Show countdown') + chk('c.show_homepage', c.show_homepage, 'Show on the home page') +
      '<div class="hint" style="margin-top:8px">Status: <b>' + (c.ended_early ? 'Ended' : c.is_published ? 'Published' : 'Draft') + '</b>. Banners are added under “Sections & images”.</div>';
  }
  function secCard(s, i, n) {
    var cfg = s.config || {}, img = IMGT.indexOf(s.section_type) > -1, k = s._k;
    var layout = img ? '<div class="field-row">' + F('Aspect ratio', sel('s:' + k + '.config.aspect', cfg.aspect || '16/9', { '16/9': '16:9', '21/9': '21:9', '3/1': '3:1', '4/3': '4:3', '1/1': '1:1', 'auto': 'Original (no crop)' })) + F('Image fit', sel('s:' + k + '.config.fit', cfg.fit || 'cover', { cover: 'Fill (may trim edges)', contain: 'Contain (never cropped)' })) + '</div>' +
      (s.section_type.indexOf('grid') > -1 || s.section_type === 'category_tiles' ? '<div class="field-row">' + F('Columns · phone', sel('s:' + k + '.config.cols_m', cfg.cols_m || 2, { 1: '1', 2: '2', 3: '3' })) + F('tablet', sel('s:' + k + '.config.cols_t', cfg.cols_t || 3, { 1: '1', 2: '2', 3: '3', 4: '4' })) + F('desktop', sel('s:' + k + '.config.cols_d', cfg.cols_d || 4, { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6' })) + '</div>' : '') +
      '<div class="field-row">' + F('Spacing (4–20 px)', inp('s:' + k + '.config.gap', cfg.gap == null ? 10 : cfg.gap, '', 'number', 'min="4" max="20"')) + F('Corner radius (0–24 px)', inp('s:' + k + '.config.radius', cfg.radius == null ? 16 : cfg.radius, '', 'number', 'min="0" max="24"')) + F('Background', sel('s:' + k + '.config.theme', cfg.theme || 'white', { white: 'White', red: 'Soft red', gold: 'Soft gold', brand: 'Brand red (festive)', teal: 'Medical teal', royal: 'Royal blue' })) + '</div>' : '';
    var extra = '';
    if (s.section_type === 'product_carousel' || s.section_type === 'product_grid') extra = F('Only this category (optional)', inp('s:' + k + '.config.category', cfg.category || '', 'All categories'), 'Exact category name from your products.') + (s.section_type === 'product_grid' ? F('Products to show', inp('s:' + k + '.config.limit', cfg.limit || 8, '', 'number', 'min="2" max="24"')) : '');
    if (s.section_type === 'service_collection') extra = F('Service', sel('s:' + k + '.config.service_type', cfg.service_type || 'all', { all: 'All services added in “Products & services”', nurse: 'Nurse booking', lab: 'Lab tests', ambulance: 'Ambulance' }));
    if (s.section_type === 'custom_text_image') extra = F('Text', '<textarea data-b="s:' + k + '.config.body">' + esc(cfg.body || '') + '</textarea>') + '<div class="field-row">' + F('Button label', inp('s:' + k + '.config.cta_label', cfg.cta_label || '', '')) + F('Button action', inp('s:' + k + '.config.cta_target', cfg.cta_target || '', 'page:cart · service:lab · https://…')) + '</div>';
    var imgs = img ? s.images.map(function (im, j) { return imgRow(s, im, j); }).join('') + '<div class="cb-row" style="margin-top:8px"><label class="btn sm primary" style="cursor:pointer">+ Add images<input type="file" multiple accept="image/jpeg,image/png,image/webp" data-cb-files="' + k + '" hidden></label><span class="cell-sub">JPG, PNG or WebP · max 5 MB each</span></div>' : '';
    return '<div class="cb-card"><div class="cb-row"><b class="cb-grow">' + esc(STYPES[s.section_type]) + '</b>' + chk('s:' + k + '.is_visible', s.is_visible, 'Visible') +
      '<button class="btn sm" data-cb="s-up" data-k="' + k + '"' + (i ? '' : ' disabled') + ' aria-label="Move section up">↑</button><button class="btn sm" data-cb="s-dn" data-k="' + k + '"' + (i < n - 1 ? '' : ' disabled') + ' aria-label="Move section down">↓</button><button class="btn sm danger" data-cb="s-del" data-k="' + k + '">Remove</button></div>' +
      '<div class="field-row" style="margin-top:8px">' + F('Section title', inp('s:' + k + '.title', s.title, '')) + F('Subtitle', inp('s:' + k + '.subtitle', s.subtitle, '')) + '</div>' + layout + extra + imgs + '</div>';
  }
  function imgRow(s, im, j) {
    var k = im._k, e = im._err ? '<div class="cb-err">' + esc(im._err) + '</div>' : '';
    return '<div class="cb-img"><div class="th" style="background-image:url(\'' + attr(im.url) + '\')"></div><div style="flex:1;min-width:0">' +
      F('Alt text * (describes the image)', inp('i:' + k + '.alt_text', im.alt_text, '')) +
      '<div class="cb-row">' + chk('i:' + k + '.is_visible', im.is_visible, 'Visible') + chk('i:' + k + '.is_clickable', im.is_clickable, 'Clickable') + '</div>' +
      (im.is_clickable ? '<div class="field-row">' + F('Action', sel('i:' + k + '.link_type', im.link_type, LINKS)) + F('Target', inp('i:' + k + '.link_value', im.link_value, linkHint(im.link_type))) + '</div>' : '') +
      '<div class="cb-row" style="margin-top:6px"><button class="btn sm" data-cb="i-up" data-k="' + k + '"' + (j ? '' : ' disabled') + ' aria-label="Move image earlier">←</button><button class="btn sm" data-cb="i-dn" data-k="' + k + '"' + (j < s.images.length - 1 ? '' : ' disabled') + ' aria-label="Move image later">→</button>' +
      '<label class="btn sm" style="cursor:pointer">Replace<input type="file" accept="image/jpeg,image/png,image/webp" data-cb-replace="' + k + '" hidden></label>' +
      '<label class="btn sm" style="cursor:pointer">' + (im.mobile_url ? 'Change phone version' : 'Phone version') + '<input type="file" accept="image/jpeg,image/png,image/webp" data-cb-mobile="' + k + '" hidden></label><button class="btn sm danger" data-cb="i-del" data-k="' + k + '">Remove</button></div>' + e + '</div></div>';
  }
  function linkHint(t) { return { campaign_section: 'Section id (copy from preview)', product: 'Product id', category: 'Category name', service: 'nurse · lab · ambulance', internal_page: PAGES.join(' · '), external_url: 'https://…' }[t] || ''; }
  function tSections() {
    var add = Object.keys(STYPES).map(function (k) { return '<option value="' + k + '">' + esc(STYPES[k]) + '</option>'; }).join('');
    return (B.sections.length ? B.sections.map(function (s, i) { return secCard(s, i, B.sections.length); }).join('') : '<div class="empty"><div class="ic">🖼</div><h4>No sections yet</h4><p>Add a hero banner carousel first, then products, services and sponsors.</p></div>') +
      '<div class="cb-row" style="margin-top:6px"><select id="cbNewSec" class="cb-grow">' + add + '</select><button class="btn primary" data-cb="s-add">Add section</button></div>';
  }
  function tSponsors() {
    var rows = B.sponsors.map(function (p, i) {
      var k = p._k;
      return '<div class="cb-card"><div class="cb-row"><div class="th" style="width:84px;height:56px;border:1px solid var(--line,#ddd);border-radius:8px;background:#fff center/contain no-repeat url(\'' + attr(p.logo_url || '') + '\')"></div><b class="cb-grow">' + esc(p.brand_name || 'New sponsor') + '</b>' + ((p.is_active && p.logo_url && p.authorization_confirmed) ? '<span class="cell-sub" style="color:#1f9d55;font-weight:700">● Visible to customers</span>' : '<span class="cell-sub" style="color:#b26a00;font-weight:700">● Hidden: ' + (!p.logo_url ? 'upload logo' : !p.authorization_confirmed ? 'tick authorization' : 'turned off') + '</span>') +
        '<button class="btn sm" data-cb="p-up" data-k="' + k + '"' + (i ? '' : ' disabled') + '>↑</button><button class="btn sm" data-cb="p-dn" data-k="' + k + '"' + (i < B.sponsors.length - 1 ? '' : ' disabled') + '>↓</button><button class="btn sm danger" data-cb="p-del" data-k="' + k + '">Remove</button></div>' +
        '<div class="field-row" style="margin-top:8px">' + F('Brand name *', inp('p:' + k + '.brand_name', p.brand_name, '')) + F('Tier', sel('p:' + k + '.tier', p.tier, TIERS)) + '</div>' + F('Website (optional, https)', inp('p:' + k + '.website_url', p.website_url, 'https://')) +
        '<div class="cb-row"><label class="btn sm" style="cursor:pointer">' + (p.logo_url ? 'Replace logo' : 'Upload logo *') + '<input type="file" accept="image/jpeg,image/png,image/webp" data-cb-logo="' + k + '" hidden></label>' + chk('p:' + k + '.is_active', p.is_active, 'Show on page') + '</div>' +
        '<label class="chk" style="margin-top:6px"><input type="checkbox" data-b="p:' + k + '.authorization_confirmed"' + (p.authorization_confirmed ? ' checked' : '') + '> I confirm written authorization from this brand to show its name and logo</label>' + (p._err ? '<div class="cb-err">' + esc(p._err) + '</div>' : '') + '</div>';
    }).join('');
    return '<div class="hint" style="margin-bottom:10px">Only sponsors with a logo and a confirmed authorization are shown to customers. Add real partners only.</div>' + (rows || '<div class="empty"><div class="ic">🤝</div><h4>No sponsors</h4><p>The sponsor section stays hidden until you add one.</p></div>') + '<button class="btn primary" data-cb="p-add">Add sponsor</button>';
  }
  function tItems() {
    if (!B.id) return '<div class="cb-warn">Save the draft once to start adding products and services.</div>';
    var prods = B.products.map(function (r) {
      var m = r.medicines || {}, nm = m.name || m.product_name || ('Product #' + r.medicine_id), ok = ['Approved', 'Active'].indexOf(m.status) > -1 && m.is_visible !== false;
      return '<div class="cb-img"><div class="th" style="background-image:url(\'' + attr(m.image_url || '') + '\')"></div><div style="flex:1;min-width:0"><div class="cell-strong" style="white-space:normal">' + esc(nm) + (m.is_rx ? ' · Rx' : '') + '</div><div class="cell-sub">' + esc((r.merchants && r.merchants.shop_name) || '') + ' · ₹' + esc(m.selling_price == null ? '—' : m.selling_price) + (m.mrp ? ' (MRP ₹' + esc(m.mrp) + ')' : '') + ' · stock ' + esc(m.stock_qty == null ? 0 : m.stock_qty) + (ok ? '' : ' · product not live') + '</div>' +
        '<div class="cb-row" style="margin-top:6px">' + badge(r.status, r.status === 'approved' ? 'green' : r.status === 'pending' ? 'gold' : 'gray') +
        (r.status !== 'approved' && ok ? '<button class="btn sm primary" data-cb="cp-ok" data-k="' + r.id + '">Approve</button>' : '') + (r.status === 'pending' ? '<button class="btn sm" data-cb="cp-no" data-k="' + r.id + '">Reject</button>' : '') + (r.status === 'approved' ? '<button class="btn sm danger" data-cb="cp-rm" data-k="' + r.id + '">Remove</button>' : '') + '</div></div></div>';
    }).join('');
    var res = (B.pres || []).map(function (m) { var has = B.products.some(function (r) { return String(r.medicine_id) === String(m.id); }); return '<div class="cb-img"><div class="th" style="background-image:url(\'' + attr(m.image_url || '') + '\')"></div><div style="flex:1;min-width:0"><div class="cell-strong" style="white-space:normal">' + esc(m.name || m.product_name) + (m.is_rx ? ' · Rx' : '') + '</div><div class="cell-sub">₹' + esc(m.selling_price) + ' · stock ' + esc(m.stock_qty || 0) + '</div></div>' + (has ? badge('Added', 'gray') : '<button class="btn sm primary" data-cb="cp-add" data-k="' + m.id + '" data-m="' + attr(m.merchant_id) + '">Add</button>') + '</div>'; }).join('');
    var svc = B.services.map(function (v) {
      var k = v._k;
      return '<div class="cb-card"><div class="field-row">' + F('Service', sel('v:' + k + '.service_type', v.service_type, { nurse: 'Nurse booking', lab: 'Lab tests', ambulance: 'Ambulance' })) + F('Card title *', inp('v:' + k + '.label', v.label, '')) + '</div>' + F('Short description', inp('v:' + k + '.description', v.description, '')) +
        '<div class="cb-row">' + chk('v:' + k + '.is_active', v.is_active, 'Show on page') + '<button class="btn sm danger" data-cb="v-del" data-k="' + k + '">Remove</button></div></div>';
    }).join('');
    return '<h3 style="margin:0 0 8px">Products</h3><div class="hint" style="margin-bottom:8px">Merchants request to join from their panel. Only approved merchant products that are live, visible and in stock-tracked inventory are shown. Prescription rules are enforced at checkout and cannot be overridden here.</div>' + (prods || '<div class="cell-sub" style="margin:8px 0">No products yet.</div>') +
      '<div class="field" style="margin-top:12px"><label>Find a product to add</label><div class="cb-row"><input id="cbPq" class="cb-grow" placeholder="Search approved products" value="' + attr(B.pq) + '"><button class="btn" data-cb="cp-search">Search</button></div></div>' + res +
      '<h3 style="margin:18px 0 8px">Services</h3><div class="hint" style="margin-bottom:8px">Each card opens the app’s existing booking flow. Make sure approved providers exist for that service.</div>' + svc + '<button class="btn primary" data-cb="v-add">Add service card</button>';
  }
  function tPreview() {
    return '<div class="cb-dev">' + [[390, 'Mobile'], [768, 'Tablet'], [1100, 'Desktop']].map(function (d) { return '<button class="btn sm' + (B.dev === d[0] ? ' primary' : '') + '" data-cb="dev" data-v="' + d[0] + '">' + d[1] + '</button>'; }).join('') + '</div><iframe id="cbFrame" class="cb-frame" title="Campaign preview" sandbox="allow-same-origin" style="width:' + B.dev + 'px"></iframe><div class="hint" style="margin-top:6px">Preview uses the customer page renderer with your unsaved changes. Buttons are inactive here.</div>';
  }
  function previewData() {
    var secs = B.sections.filter(function (s) { return s.is_visible; }).map(function (s) { return { id: s.id || s._k, type: s.section_type, title: s.title, subtitle: s.subtitle, config: s.config, images: s.images.filter(function (i) { return i.is_visible; }).map(function (i) { return { id: i._k, url: i.url, mobile_url: i.mobile_url, alt: i.alt_text, clickable: i.is_clickable, link_type: i.link_type, link_value: i.link_value }; }) }; });
    var c = B.c, prods = B.products.filter(function (r) { return r.status === 'approved' && r.medicines; }).map(function (r) { var m = r.medicines; return { id: r.medicine_id, name: m.name || m.product_name, price: m.selling_price, mrp: m.mrp, img: m.image_url, category: m.category, merchantId: r.merchant_id, isRx: !!m.is_rx, stock: m.stock_qty || 0, shop: r.merchants && r.merchants.shop_name }; });
    return { campaign: { id: B.id, title: c.title || 'Campaign title', description: c.description, discount_text: c.discount_text, image_url: c.image_url, start_at: new Date(c.start_at).toISOString(), end_at: new Date(c.end_at).toISOString(), ended_early: false, show_countdown: c.show_countdown, terms: c.terms, cta_label: c.cta_label, cta_url: c.cta_url }, sections: secs,
      sponsors: B.sponsors.filter(function (p) { return p.is_active && p.authorization_confirmed && p.logo_url; }).map(function (p) { return { id: p._k, name: p.brand_name, logo: p.logo_url, tier: p.tier, url: p.website_url }; }),
      services: B.services.filter(function (v) { return v.is_active; }).map(function (v) { return { id: v._k, type: v.service_type, label: v.label, description: v.description }; }), products: prods };
  }
  function drawPreview() {
    var f = q('#cbFrame'); if (!f || !window.MFCampaign) { if (f) f.srcdoc = '<p style="font:14px sans-serif;padding:20px">Preview unavailable: campaign-page.js is not loaded.</p>'; return; }
    var base = location.href.replace(/[^/]*([?#].*)?$/, ''), html = '';
    try { html = window.MFCampaign.preview(previewData()); } catch (e) { html = '<div style="padding:20px">Preview error: ' + esc(e.message) + '</div>'; }
    f.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="' + attr(base) + '"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"><link rel="stylesheet" href="campaign-page.css">' +
      '<style>body{margin:0;font-family:system-ui,sans-serif}#page-campaign.active{display:block;animation:none;min-height:100vh}#cp-root{overflow:visible;padding-bottom:24px}.cp-chips{position:static}[data-cp]:not([data-cp=track]){pointer-events:none}</style></head><body><div id="page-campaign" class="app-page active"><header class="cp-header"><span class="cp-ib"><i class="fa-solid fa-arrow-left"></i></span><span class="cp-title">' + esc(B.c.title || 'Campaign title') + '</span><span class="cp-ib"><i class="fa-solid fa-magnifying-glass"></i></span><span class="cp-ib"><i class="fa-solid fa-cart-shopping"></i></span></header><main id="cp-root">' + html + '</main></div></body></html>';
  }

  /* ---------- state binding ---------- */
  function find(kind, k) {
    if (kind === 's') return B.sections.filter(function (s) { return s._k === k; })[0];
    if (kind === 'p') return B.sponsors.filter(function (s) { return s._k === k; })[0];
    if (kind === 'v') return B.services.filter(function (s) { return s._k === k; })[0];
    if (kind === 'i') { for (var a = 0; a < B.sections.length; a++) for (var b = 0; b < B.sections[a].images.length; b++) if (B.sections[a].images[b]._k === k) return B.sections[a].images[b]; }
  }
  function setPath(path, val, structural) {
    var m = /^([cspiv]):?([^.]*)\.(.+)$/.exec(path) || /^(c)\.(.+)$/.exec(path); if (!m) return;
    var obj, rest;
    if (path.indexOf('c.') === 0) { obj = B.c; rest = path.slice(2); } else { obj = find(m[1], m[2]); rest = m[3]; } if (!obj) return;
    var parts = rest.split('.'), last = parts.pop(); parts.forEach(function (p) { obj = obj[p] = obj[p] || {}; }); obj[last] = val;
  }
  function bindRoot() {
    var root = q('#modalRoot'); if (!root || root.__cb) return; root.__cb = 1;
    root.addEventListener('input', function (e) { var t = e.target; if (!B || !t.getAttribute) return; var p = t.getAttribute('data-b'); if (!p) return; if (t.type === 'checkbox') return; setPath(p, t.type === 'number' ? (t.value === '' ? null : Number(t.value)) : t.value); });
    root.addEventListener('change', function (e) {
      var t = e.target; if (!B || !t.getAttribute) return;
      var p = t.getAttribute('data-b');
      if (p) { setPath(p, t.type === 'checkbox' ? t.checked : t.value); if (t.type === 'checkbox' && /is_clickable$/.test(p) || /link_type$/.test(p)) paint(); return; }
      var f = t.files; if (!f || !f.length) return;
      if (t.hasAttribute('data-cb-files')) addImages(t.getAttribute('data-cb-files'), f);
      else if (t.hasAttribute('data-cb-replace')) setFile(t.getAttribute('data-cb-replace'), f[0], 'url');
      else if (t.hasAttribute('data-cb-mobile')) setFile(t.getAttribute('data-cb-mobile'), f[0], 'mobile_url');
      else if (t.hasAttribute('data-cb-logo')) setLogo(t.getAttribute('data-cb-logo'), f[0]);
      t.value = '';
    });
    root.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-cb]') : null; if (!t || !B || t.disabled) return;
      var a = t.getAttribute('data-cb'), k = t.getAttribute('data-k');
      if (a === 'tab') { B.tab = t.getAttribute('data-v'); paint(); }
      else if (a === 'dev') { B.dev = Number(t.getAttribute('data-v')); paint(); }
      else if (a === 'draft' || a === 'publish' || a === 'unpublish') save(a);
      else if (a === 's-add') { var ty = q('#cbNewSec').value; B.sections.push({ _k: uid(), id: null, section_type: ty, title: '', subtitle: '', config: {}, is_visible: true, images: [] }); paint(); }
      else if (a === 's-up' || a === 's-dn') { move(B.sections, k, a === 's-up' ? -1 : 1); paint(); }
      else if (a === 's-del') { askConfirm('Remove section?', 'Its images are deleted after you save.', { danger: true, ok: 'Remove' }).then(function (ok) { if (!ok) return; var s = find('s', k); if (s.id) { B.del.sections.push(s.id); s.images.forEach(function (i) { orphan(i); }); } else s.images.forEach(function (i) { freeBlob(i); }); B.sections = B.sections.filter(function (x) { return x._k !== k; }); paint(); }); }
      else if (a === 'i-up' || a === 'i-dn') { B.sections.forEach(function (s) { if (s.images.some(function (i) { return i._k === k; })) move(s.images, k, a === 'i-up' ? -1 : 1); }); paint(); }
      else if (a === 'i-del') { B.sections.forEach(function (s) { var im = s.images.filter(function (i) { return i._k === k; })[0]; if (im) { if (im.id) { B.del.images.push(im.id); orphan(im); } else freeBlob(im); s.images = s.images.filter(function (i) { return i._k !== k; }); } }); paint(); }
      else if (a === 'p-add') { B.sponsors.push({ _k: uid(), id: null, brand_name: '', tier: 'powered_by', website_url: '', logo_url: null, is_active: true, authorization_confirmed: false }); paint(); }
      else if (a === 'p-up' || a === 'p-dn') { move(B.sponsors, k, a === 'p-up' ? -1 : 1); paint(); }
      else if (a === 'p-del') { var p = find('p', k); if (p.id) { B.del.sponsors.push(p.id); if (p.logo_path) B.orphans.push(p.logo_path); } B.sponsors = B.sponsors.filter(function (x) { return x._k !== k; }); paint(); }
      else if (a === 'v-add') { B.services.push({ _k: uid(), id: null, service_type: 'nurse', label: '', description: '', provider_ref: '', is_active: true }); paint(); }
      else if (a === 'v-del') { var v = find('v', k); if (v.id) B.del.services.push(v.id); B.services = B.services.filter(function (x) { return x._k !== k; }); paint(); }
      else if (a === 'cp-search') searchProducts();
      else if (a === 'cp-add') addProduct(k, t.getAttribute('data-m'));
      else if (a === 'cp-ok' || a === 'cp-no' || a === 'cp-rm') setProdStatus(k, a === 'cp-ok' ? 'approved' : a === 'cp-no' ? 'rejected' : 'removed');
    });
    root.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'cbPq') { e.preventDefault(); searchProducts(); } });
  }
  function move(arr, k, d) { var i = arr.findIndex(function (x) { return x._k === k; }), j = i + d; if (i < 0 || j < 0 || j >= arr.length) return; var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  function orphan(im) { if (im.storage_path) B.orphans.push(im.storage_path); if (im.mobile_path) B.orphans.push(im.mobile_path); freeBlob(im); }
  function freeBlob(im) { if (im.url && String(im.url).indexOf('blob:') === 0) { try { URL.revokeObjectURL(im.url); } catch (e) {} } }
  function checkFile(f) { if (OKT.indexOf(f.type) < 0) return f.name + ': only JPG, PNG or WebP images are allowed'; if (f.size > MAXB) return f.name + ': larger than 5 MB'; return ''; }
  function addImages(sk, files) {
    var s = find('s', sk), bad = []; if (!s) return;
    Array.prototype.forEach.call(files, function (f) { var m = checkFile(f); if (m) { bad.push(m); return; } s.images.push({ _k: uid(), id: null, url: URL.createObjectURL(f), file: f, alt_text: f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), is_clickable: false, link_type: 'none', link_value: '', is_visible: true }); });
    if (bad.length) toast(bad.join(' · '), 'danger'); paint();
  }
  function setFile(ik, f, field) {
    var im = find('i', ik), m = checkFile(f); if (m) { toast(m, 'danger'); return; } if (!im) return;
    if (field === 'url') { freeBlob(im); im._oldPath = im._oldPath || im.storage_path; im.file = f; im.url = URL.createObjectURL(f); }
    else { im._oldMobile = im._oldMobile || im.mobile_path; im.mfile = f; im.mobile_url = URL.createObjectURL(f); }
    im._err = ''; paint();
  }
  function setLogo(pk, f) { var p = find('p', pk), m = checkFile(f); if (m) { toast(m, 'danger'); return; } p._oldPath = p._oldPath || p.logo_path; p.file = f; p.logo_url = URL.createObjectURL(f); p._err = ''; paint(); }

  /* ---------- products ---------- */
  async function searchProducts() {
    var v = (q('#cbPq') || {}).value || ''; B.pq = v.trim(); if (B.pq.length < 2) { toast('Type at least 2 letters', 'danger'); return; }
    var s = B.pq.replace(/[%,()]/g, ' ');
    var r = await supabase.from('medicines').select('id,name,product_name,image_url,selling_price,stock_qty,is_rx,merchant_id,status,is_visible').or('name.ilike.%' + s + '%,product_name.ilike.%' + s + '%').in('status', ['Approved', 'Active']).neq('is_visible', false).gt('stock_qty', 0).limit(20);
    if (r.error) { toast('Search failed: ' + r.error.message, 'danger'); return; } B.pres = r.data || []; paint();
  }
  async function reloadProducts() {
    var r = await supabase.from('campaign_products').select('id,status,medicine_id,merchant_id,reject_reason,medicines(name,product_name,image_url,selling_price,mrp,stock_qty,is_rx,category,status,is_visible),merchants(shop_name)').eq('campaign_id', B.id).order('created_at');
    if (r.error) { toast('Could not refresh products: ' + r.error.message, 'danger'); return; } B.products = r.data || []; paint();
  }
  async function addProduct(mid, merchantId) {
    if (B.products.some(function (r) { return String(r.medicine_id) === String(mid); })) { toast('Already in this campaign', 'danger'); return; }
    var r = await supabase.from('campaign_products').insert({ campaign_id: B.id, medicine_id: /^\d+$/.test(mid) ? Number(mid) : mid, merchant_id: merchantId, status: 'approved' });
    if (r.error) { toast('Not added: ' + r.error.message, 'danger'); return; } toast('Product added'); await reloadProducts();
  }
  async function setProdStatus(id, status) {
    var r = await supabase.from('campaign_products').update({ status: status }).eq('id', id);
    if (r.error) { toast('Not saved: ' + r.error.message, 'danger'); return; } await logAdminAction('Set campaign product to ' + status); toast('Product ' + status); await reloadProducts();
  }

  /* ---------- validate / save ---------- */
  function validate(mode) {
    var e = [], c = B.c, s = new Date(c.start_at), en = new Date(c.end_at), add = function (tab, msg) { e.push({ tab: tab, msg: msg }); };
    if (!c.title.trim()) add('details', 'Campaign title is required');
    if (isNaN(s) || isNaN(en)) add('details', 'Set a valid start and end time'); else if (en <= s) add('details', 'End time must be after the start time');
    if (c.cta_label && !c.cta_url) add('details', 'Add an action for the button, or clear its label');
    B.sections.forEach(function (sec) { sec.images.forEach(function (im, j) { if (!im.alt_text.trim()) add('sections', STYPES[sec.section_type] + ', image ' + (j + 1) + ': alt text is required'); if (im.is_clickable && im.link_type !== 'none' && !String(im.link_value).trim()) add('sections', STYPES[sec.section_type] + ', image ' + (j + 1) + ': add a link target'); if (im.is_clickable && im.link_type === 'external_url' && !/^https:\/\//i.test(im.link_value)) add('sections', 'External links must start with https://'); }); });
    B.sponsors.forEach(function (p) { if (!p.brand_name.trim()) add('sponsors', 'Every sponsor needs a brand name'); if (p.is_active && !(p.logo_url || p.file)) add('sponsors', (p.brand_name || 'A sponsor') + ': upload a logo or switch it off'); if (p.is_active && !p.authorization_confirmed && mode === 'publish') add('sponsors', (p.brand_name || 'A sponsor') + ': confirm brand authorization or switch it off'); if (p.website_url && !/^https:\/\//i.test(p.website_url)) add('sponsors', (p.brand_name || 'Sponsor') + ': website must start with https://'); });
    B.services.forEach(function (v) { if (!v.label.trim()) add('items', 'Every service card needs a title'); });
    if (mode === 'publish') { if (en <= new Date()) add('details', 'The end time has already passed'); var hasHero = B.c.image_url || B.sections.some(function (x) { return x.is_visible && x.images.length; }); if (!hasHero) add('sections', 'Add at least one banner image before publishing'); }
    return e;
  }
  async function upload(file, folder) {
    var ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type], path = 'campaigns/' + folder + '/' + uid() + '.' + ext, last;
    for (var a = 0; a < 3; a++) {
      var r = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' });
      if (!r.error) return { path: path, url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
      last = r.error; await sleep(700 * (a + 1));
    }
    throw new Error(last && last.message || 'upload failed');
  }
  async function save(mode) {
    if (B.saving) return;
    if (mode === 'unpublish' && !(await askConfirm('Unpublish campaign?', 'It disappears from the app immediately. Your work stays saved as a draft.', { ok: 'Unpublish' }))) return;
    B.errors = validate(mode === 'unpublish' ? 'draft' : mode);
    if (B.errors.length) { B.tab = B.errors[0].tab; paint(); toast(B.errors[0].msg, 'danger'); return; }
    B.saving = true; paint(); var prog = q('#cbProg');
    try {
      var jobs = []; B.sections.forEach(function (s) { s.images.forEach(function (im) { if (im.file) jobs.push([im, 'file']); if (im.mfile) jobs.push([im, 'mfile']); }); }); B.sponsors.forEach(function (p) { if (p.file) jobs.push([p, 'file']); });
      var folder = B.id || ('new-' + uid()), done = 0, fail = 0;
      for (var j = 0; j < jobs.length; j++) {
        var o = jobs[j][0], f = jobs[j][1]; if (prog) prog.textContent = 'Uploading ' + (done + 1) + ' of ' + jobs.length + '…';
        try {
          var up = await upload(o[f], folder);
          if (o.brand_name !== undefined) { o.logo_url = up.url; if (o._oldPath) B.orphans.push(o._oldPath); o.logo_path = up.path; o._oldPath = null; o.file = null; }
          else if (f === 'file') { o.url = up.url; if (o._oldPath) B.orphans.push(o._oldPath); o.storage_path = up.path; o._oldPath = null; o.file = null; }
          else { o.mobile_url = up.url; if (o._oldMobile) B.orphans.push(o._oldMobile); o.mobile_path = up.path; o._oldMobile = null; o.mfile = null; }
          o._err = ''; done++;
        } catch (er) { o._err = 'Upload failed: ' + er.message + '. Tap Publish/Save again to retry.'; fail++; }
      }
      if (fail) throw new Error(fail + ' image upload' + (fail > 1 ? 's' : '') + ' failed — nothing was published. Fix and retry.');
      if (prog) prog.textContent = 'Saving…';
      var c = B.c, hero = null; B.sections.forEach(function (s) { if (!hero && s.is_visible && (s.section_type === 'hero_carousel' || s.section_type === 'single_banner') && s.images[0]) hero = s.images[0].url; });
      var pub = mode === 'publish' ? true : mode === 'unpublish' ? false : c.is_published;
      var row = { title: c.title.trim(), description: c.description.trim() || null, discount_text: c.discount_text.trim() || null, campaign_type: c.campaign_type, terms: c.terms.trim() || null, cta_label: c.cta_label.trim() || null, cta_url: c.cta_url.trim() || null, display_order: Number(c.display_order) || 0, show_countdown: c.show_countdown, show_homepage: c.show_homepage, start_at: new Date(c.start_at).toISOString(), end_at: new Date(c.end_at).toISOString(), image_url: hero || c.image_url || null, is_published: pub };
      var cr;
      if (B.id) cr = await supabase.from('campaigns').update(row).eq('id', B.id).select('id').single();
      else { row.send_push = false; row.send_ending_push = false; row.target_url = '/user.html'; row.created_by = (DATA.me && DATA.me.email) || null; cr = await supabase.from('campaigns').insert(row).select('id').single(); }
      if (cr.error) throw new Error(cr.error.message);
      var cid = cr.data.id; if (!B.id) { await supabase.from('campaigns').update({ target_url: '/user.html#campaign/' + cid }).eq('id', cid); }
      var secRows = [], imgRows = [];
      B.sections.forEach(function (s, i) { s.id = s.id || s._k; secRows.push({ id: s.id, campaign_id: cid, section_type: s.section_type, title: s.title.trim() || null, subtitle: s.subtitle.trim() || null, config: s.config || {}, display_order: i, is_visible: s.is_visible }); s.images.forEach(function (im, j) { im.id = im.id || im._k; imgRows.push({ id: im.id, campaign_id: cid, section_id: s.id, image_url: im.url, mobile_image_url: im.mobile_url || null, storage_path: im.storage_path || null, mobile_storage_path: im.mobile_path || null, alt_text: im.alt_text.trim(), is_clickable: !!im.is_clickable, link_type: im.is_clickable ? im.link_type : 'none', link_value: im.is_clickable ? String(im.link_value).trim() : null, display_order: j, is_visible: im.is_visible }); }); });
      var spRows = B.sponsors.map(function (p, i) { p.id = p.id || p._k; return { id: p.id, campaign_id: cid, brand_name: p.brand_name.trim(), logo_url: p.logo_url, logo_storage_path: p.logo_path || null, tier: p.tier, website_url: p.website_url.trim() || null, display_order: i, is_active: p.is_active, authorization_confirmed: p.authorization_confirmed }; });
      var svRows = B.services.map(function (v, i) { v.id = v.id || v._k; return { id: v.id, campaign_id: cid, service_type: v.service_type, label: v.label.trim(), description: v.description.trim() || null, provider_ref: v.provider_ref || null, display_order: i, is_active: v.is_active }; });
      var steps = [['campaign_sections', secRows], ['campaign_images', imgRows], ['campaign_sponsors', spRows], ['campaign_services', svRows]];
      for (var si = 0; si < steps.length; si++) if (steps[si][1].length) { var ur = await supabase.from(steps[si][0]).upsert(steps[si][1], { onConflict: 'id' }); if (ur.error) throw new Error(steps[si][0] + ': ' + ur.error.message); }
      var dels = [['campaign_images', B.del.images], ['campaign_sections', B.del.sections], ['campaign_sponsors', B.del.sponsors], ['campaign_services', B.del.services]];
      for (var di = 0; di < dels.length; di++) if (dels[di][1].length) { var dr = await supabase.from(dels[di][0]).delete().in('id', dels[di][1]); if (dr.error) throw new Error(dels[di][0] + ': ' + dr.error.message); }
      // confirm from the database before reporting success
      var fresh = await fetchAll(cid), orph = B.orphans.slice(), tab = B.tab, dev = B.dev; B = fresh; B.tab = tab; B.dev = dev;
      if (orph.length) { try { await supabase.storage.from(BUCKET).remove(orph); } catch (x) { console.warn('orphan cleanup', x); } }
      await logAdminAction((mode === 'publish' ? 'Published' : mode === 'unpublish' ? 'Unpublished' : 'Saved') + ' campaign “' + row.title + '”');
      // On first publish, send the campaign immediately through the existing server-side sender.
      // The sender delivers both Web Push and native Android FCM; never expose secrets in this client.
      var pushWarning = '';
      if (mode === 'publish') {
        try {
          var pushResult = await supabase.functions.invoke('send-campaign-push', { body: { campaign_id: cid, kind: 'offer' } });
          if (pushResult.error) {
            console.warn('Campaign saved, but push invocation failed:', pushResult.error);
            pushWarning = ' Offer published, but push could not be sent. Check campaign-push logs.';
          } else if (pushResult.data && Number(pushResult.data.fcm_failed || 0) > 0) {
            console.warn('Campaign push result:', pushResult.data);
            pushWarning = ' Offer published; Android push needs configuration/log review.';
          }
        } catch (pushErr) {
          console.warn('Campaign saved, but push invocation failed:', pushErr);
          pushWarning = ' Offer published, but push could not be sent. Check campaign-push logs.';
        }
      }
      B.saving = false; await loadCampaigns(); render(); paint();
      toast((mode === 'publish' ? 'Campaign published' : mode === 'unpublish' ? 'Campaign unpublished' : 'Saved') + pushWarning, pushWarning ? 'danger' : undefined);
    } catch (er) { B.saving = false; paint(); if (/campaign_(sections|images|sponsors|services)|schema cache|does not exist/i.test(er.message)) { B.migrationMissing = true; paint(); } toast(er.message, 'danger'); }
  }
})();
