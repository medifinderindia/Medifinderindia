/* MediFinder offers — home banner cards (Flipkart style) + full "Deals" page + live countdown.
   - Home: each live offer is a card (banner image, countdown strip, product preview, SHOP NOW).
   - SHOP NOW opens the Deals page inside user.html (#page-offer-deals): products the merchants added to that
     offer, grouped by category (3 per category + "View all"). Deep link: user.html?offer=<campaign id>
   - Merchants add their products to an offer from the merchant panel (table campaign_products).            */
(function () {
    'use strict';
    var MOUNT_ID = 'mf-offers', PAGE_ID = 'page-offer-deals';
    var offset = 0;            // serverNow - Date.now()
    var items = [];
    var tick = null, refetchTimer = null, root = null;
    var dealsCache = {};       // campaignId -> { t, data }
    var cur = { id: null, cat: null, sort: 'rel', data: null };

    /* ---------- helpers ---------- */
    function getClient() {
        try { if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient; } catch (e) {}
        if (window.supabaseClient) return window.supabaseClient;
        try { if (typeof supabase !== 'undefined' && supabase && supabase.rpc) return supabase; } catch (e) {}
        try {
            if (window.supabase && typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_KEY !== 'undefined') {
                window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
                return window.supabaseClient;
            }
        } catch (e) {}
        return null;
    }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
    function now() { return Date.now() + offset; }
    function pad(n) { return String(n).padStart(2, '0'); }
    function money(n) { return '₹' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
    function parts(ms) {
        var t = Math.max(0, Math.floor(ms / 1000));
        return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
    }
    function timerHtml(ms) {
        var p = parts(ms), out = '';
        if (p.d) out += '<span class="mfo-u"><b>' + pad(p.d) + '</b><small>d</small></span><i>:</i>';
        out += '<span class="mfo-u"><b>' + pad(p.h) + '</b><small>h</small></span><i>:</i>' +
               '<span class="mfo-u"><b>' + pad(p.m) + '</b><small>m</small></span><i>:</i>' +
               '<span class="mfo-u"><b>' + pad(p.s) + '</b><small>s</small></span>';
        return out;
    }
    function phase(c) {
        var t = now(), s = new Date(c.start_at).getTime(), e = new Date(c.end_at).getTime();
        if (c.ended_early || t >= e) return 'ended';
        return t < s ? 'upcoming' : 'live';
    }
    function pctOff(mrp, price) { mrp = Number(mrp) || 0; price = Number(price) || 0; return mrp > price && price > 0 ? Math.round((mrp - price) / mrp * 100) : 0; }
    function isDefaultTarget(u) { return !u || /^\/?user\.html\/?$/i.test(String(u).trim()); }
    function toast(msg) {
        var t = document.createElement('div'); t.className = 'mfo-toast'; t.textContent = msg; document.body.appendChild(t);
        setTimeout(function () { t.classList.add('show'); }, 20);
        setTimeout(function () { t.remove(); }, 4200);
    }
    function clockStrip(c, ph, cls) {
        if (c.show_countdown === false) return '';
        var s = new Date(c.start_at).getTime(), e = new Date(c.end_at).getTime(), end = ph === 'upcoming' ? s : e;
        return '<div class="mfo-clock ' + (cls || '') + '" data-mfo-clock data-end="' + end + '">' +
            '<span class="mfo-clock-lbl"><i class="fa-regular fa-clock"></i> ' + (ph === 'upcoming' ? 'Starts in' : 'Ends in') + '</span>' +
            '<span class="mfo-clock-time">' + timerHtml(end - now()) + '</span></div>';
    }

    /* ---------- deals data ---------- */
    async function fetchDeals(id, force) {
        var hit = dealsCache[id];
        if (!force && hit && Date.now() - hit.t < 45000) return hit.data;
        var c = getClient(); if (!c) return null;
        try {
            var r = await c.rpc('get_campaign_deals', { p_campaign_id: id });
            if (r.error || !r.data) return null;
            if (r.data.server_now) offset = new Date(r.data.server_now).getTime() - Date.now();
            dealsCache[id] = { t: Date.now(), data: r.data };
            return r.data;
        } catch (e) { console.warn('[MFOffers deals]', e); return null; }
    }

    /* ---------- HOME cards ---------- */
    function cardHtml(c) {
        var ph = phase(c);
        var hero = c.image_url
            ? '<div class="mfo-hero"><img src="' + esc(c.image_url) + '" alt="' + esc(c.title) + '" loading="lazy" decoding="async"></div>'
            : '<div class="mfo-hero mfo-hero-ph"><span>' + esc(c.title) + '</span></div>';
        return '<article class="mfo-card ' + ph + '" data-id="' + esc(c.id) + '" data-url="' + esc(c.target_url || '/user.html') + '">' +
            hero + clockStrip(c, ph, 'on-strip') +
            '<div class="mfo-info">' +
            '<div class="mfo-toprow">' + (c.discount_text ? '<span class="mfo-badge">' + esc(c.discount_text) + '</span>' : '') + '</div>' +
            '<h3 class="mfo-title">' + esc(c.title) + '</h3>' +
            (c.description ? '<p class="mfo-desc">' + esc(c.description) + '</p>' : '') +
            '<div class="mfo-prev" data-prev="' + esc(c.id) + '" hidden></div>' +
            (ph === 'live'
                ? '<button class="mfo-cta" type="button">SHOP NOW <i class="fa-solid fa-arrow-right"></i></button>'
                : '<button class="mfo-cta soon" type="button" disabled>COMING SOON</button>') +
            '</div></article>';
    }
    function render() {
        if (!root) return;
        var live = items.filter(function (c) { return phase(c) !== 'ended'; });
        if (!live.length) { root.innerHTML = ''; root.hidden = true; return; }
        root.hidden = false;
        root.innerHTML = '<section class="mfo-section" id="mf-offers-section"><h2 class="mfo-head">🔥 Today\'s Health Deals</h2>' +
            '<div class="mfo-track">' + live.map(cardHtml).join('') + '</div></section>';
        live.forEach(function (c) { if (phase(c) === 'live') fillPreview(c.id); });
    }
    async function fillPreview(id) {
        var d = await fetchDeals(id); if (!root) return;
        var box = root.querySelector('.mfo-prev[data-prev="' + id + '"]'); if (!box) return;
        var list = (d && d.items) || [];
        if (!list.length) { box.hidden = true; box.innerHTML = ''; return; }
        var best = list.slice().sort(function (a, b) { return pctOff(b.mrp, b.selling_price) - pctOff(a.mrp, a.selling_price); }).slice(0, 4);
        box.innerHTML = best.map(function (p) {
            var off = pctOff(p.mrp, p.selling_price);
            return '<div class="mfo-pv"><div class="mfo-pv-img"><img src="' + esc(p.image_url || '') + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'"></div>' +
                '<div class="mfo-pv-pr">' + money(p.selling_price) + '</div>' + (off ? '<div class="mfo-pv-off">' + off + '% off</div>' : '') + '</div>';
        }).join('') + '<div class="mfo-pv mfo-pv-more"><span>' + list.length + '+</span><small>items</small></div>';
        box.hidden = false;
    }

    // runs every second: only touches the numbers (no flicker); re-renders when a phase changes
    function update() {
        var els = document.querySelectorAll('[data-mfo-clock]');
        if (root && !root.hidden) {
            var changed = false;
            items.forEach(function (c) {
                var card = root.querySelector('.mfo-card[data-id="' + c.id + '"]');
                var ph = phase(c);
                if (!card) { if (ph !== 'ended') changed = true; return; }
                if (!card.classList.contains(ph)) changed = true;
            });
            if (changed) { render(); return; }
        }
        els.forEach(function (el) {
            var end = Number(el.getAttribute('data-end')), left = end - now();
            var t = el.querySelector('.mfo-clock-time');
            if (t) t.innerHTML = timerHtml(left);
            el.classList.toggle('urgent', left > 0 && left < 3600000);
        });
        var pg = document.getElementById(PAGE_ID);
        if (pg && pg.classList.contains('active') && cur.id) {
            var c2 = items.find(function (x) { return String(x.id) === String(cur.id); }) || (cur.data && cur.data.campaign);
            if (c2 && phase(c2) === 'ended') { toast('This offer has ended'); closeDeals(); load(); }
        }
    }

    async function load() {
        var c = getClient(); if (!c) return;
        try {
            var r = await c.rpc('get_active_campaigns');
            if (r.error || !r.data) return;
            offset = new Date(r.data.server_now).getTime() - Date.now();
            items = r.data.items || [];
            render();
        } catch (e) { console.warn('[MFOffers]', e); }
    }

    /* ---------- DEALS page ---------- */
    function pageEl() { return document.getElementById(PAGE_ID); }
    function ensurePage() {
        var pg = pageEl();
        if (!pg) {
            pg = document.createElement('div'); pg.id = PAGE_ID; pg.className = 'app-page'; pg.setAttribute('data-page', 'offer-deals');
            var host = document.getElementById('page-home'); (host && host.parentNode ? host.parentNode : document.body).appendChild(pg);
        }
        return pg;
    }
    function groupByCat(list) {
        var map = {}, order = [];
        list.forEach(function (p) { var k = p.category || 'Other'; if (!map[k]) { map[k] = []; order.push(k); } map[k].push(p); });
        order.sort(function (a, b) { return map[b].length - map[a].length; });
        return { map: map, order: order };
    }
    function payload(p) {
        return { id: p.id, name: p.name, price: Number(p.selling_price) || 0, mrp: p.mrp, img: p.image_url, manufacturer: p.manufacturer,
            merchantId: p.merchant_id, isRx: p.is_rx === true, weightKg: p.weight_kg, composition: p.composition, desc: p.description,
            category: p.category, stock: p.stock_qty };
    }
    function prodCard(p) {
        var off = pctOff(p.mrp, p.selling_price), low = Number(p.stock_qty) > 0 && Number(p.stock_qty) <= 5;
        return '<div class="dl-card" data-pid="' + esc(p.id) + '">' +
            '<div class="dl-img"><img src="' + esc(p.image_url || '') + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
            (off ? '<span class="dl-off">' + off + '% OFF</span>' : '') + (p.is_rx ? '<span class="dl-rx">Rx</span>' : '') + '</div>' +
            '<div class="dl-nm">' + esc(p.name) + '</div>' +
            (p.shop_name ? '<div class="dl-shop"><i class="fa-solid fa-store"></i> ' + esc(p.shop_name) + '</div>' : '') +
            '<div class="dl-pr"><b>' + money(p.selling_price) + '</b>' + (off ? '<s>' + money(p.mrp) + '</s>' : '') + '</div>' +
            (low ? '<div class="dl-low">Only ' + esc(p.stock_qty) + ' left</div>' : '') +
            '<button class="dl-add" type="button" data-add="' + esc(p.id) + '">ADD</button></div>';
    }
    function sortList(list, mode) {
        var l = list.slice();
        if (mode === 'low') l.sort(function (a, b) { return a.selling_price - b.selling_price; });
        else if (mode === 'high') l.sort(function (a, b) { return b.selling_price - a.selling_price; });
        else if (mode === 'disc') l.sort(function (a, b) { return pctOff(b.mrp, b.selling_price) - pctOff(a.mrp, a.selling_price); });
        return l;
    }
    function paintDeals() {
        var pg = pageEl(); if (!pg) return;
        var d = cur.data, c = d && d.campaign;
        var list = (d && d.items) || [];
        var title = c ? c.title : 'Offers';
        var ph = c ? phase(c) : 'live';
        var g = groupByCat(list);
        var head = '<header class="dl-head"><button class="dl-back" type="button" data-dl="back" aria-label="Back"><i class="fa-solid fa-arrow-left"></i></button>' +
            '<div class="dl-ttl"><b>' + esc(cur.cat || title) + '</b><small>' + (cur.cat ? esc(title) : esc((c && c.discount_text) || 'Special offers for you')) + '</small></div>' +
            '<button class="dl-cartbtn" type="button" data-dl="cart" aria-label="Cart"><i class="fa-solid fa-bag-shopping"></i></button></header>';
        var timer = c ? clockStrip(c, ph, 'dl-timer') : '';
        var body = '';
        if (!d) {
            body = '<div class="dl-skel">' + '<div class="dl-sk-hero"></div><div class="dl-sk-row"><i></i><i></i><i></i></div>'.repeat(2) + '</div>';
        } else if (!c) {
            body = '<div class="dl-empty"><div class="dl-empty-ic">⏰</div><h3>This offer has ended</h3><p>Check out our other deals on the home page.</p><button class="dl-btn" data-dl="home">Back to Home</button></div>';
        } else if (!list.length) {
            body = (c.image_url ? '<div class="dl-hero"><img src="' + esc(c.image_url) + '" alt=""></div>' : '') +
                '<div class="dl-empty"><div class="dl-empty-ic">🛍️</div><h3>Deals are being added</h3><p>Pharmacies are adding their products to this offer. Please check again soon.</p><button class="dl-btn" data-dl="home">Continue shopping</button></div>';
        } else if (cur.cat) {
            var arr = sortList(g.map[cur.cat] || [], cur.sort);
            body = '<div class="dl-sortbar">' + [['rel', 'Relevance'], ['low', 'Price: Low'], ['high', 'Price: High'], ['disc', 'Discount']].map(function (s) {
                return '<button type="button" class="' + (cur.sort === s[0] ? 'on' : '') + '" data-sort="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div>' +
                '<div class="dl-count">' + arr.length + ' item' + (arr.length === 1 ? '' : 's') + '</div>' +
                '<div class="dl-grid">' + arr.map(prodCard).join('') + '</div>';
        } else {
            body = (c.image_url ? '<div class="dl-hero"><img src="' + esc(c.image_url) + '" alt=""></div>' : '') +
                g.order.map(function (k) {
                    var arr2 = g.map[k];
                    return '<section class="dl-sec"><div class="dl-sec-h"><h3>' + esc(k) + ' <em>' + arr2.length + '</em></h3>' +
                        '<button type="button" class="dl-viewall" data-cat="' + esc(k) + '">View all <i class="fa-solid fa-chevron-right"></i></button></div>' +
                        '<div class="dl-row">' + arr2.slice(0, 3).map(prodCard).join('') +
                        (arr2.length > 3 ? '<button type="button" class="dl-more" data-cat="' + esc(k) + '"><span>+' + (arr2.length - 3) + '</span>View all</button>' : '') + '</div></section>';
                }).join('');
        }
        var chips = (d && c && list.length && g.order.length > 1)
            ? '<div class="dl-chips"><button type="button" class="' + (!cur.cat ? 'on' : '') + '" data-cat="">All</button>' +
              g.order.map(function (k) { return '<button type="button" class="' + (cur.cat === k ? 'on' : '') + '" data-cat="' + esc(k) + '">' + esc(k) + '</button>'; }).join('') + '</div>' : '';
        var st = pg.querySelector('.dl-scroll'), keep = st ? st.scrollTop : 0;
        pg.innerHTML = head + timer + '<div class="dl-scroll">' + chips + '<div class="dl-body">' + body + '</div><div class="dl-spacer"></div></div>';
        var ns = pg.querySelector('.dl-scroll'); if (ns && keep) ns.scrollTop = keep;
    }
    function showPage() {
        ensurePage();
        if (typeof window.navigateTo === 'function') window.navigateTo('offer-deals');
    }
    async function openDeals(id, cat) {
        if (!id) return;
        cur = { id: id, cat: cat || null, sort: 'rel', data: null };
        showPage(); paintDeals();
        var d = await fetchDeals(id, true);
        if (String(cur.id) !== String(id)) return;
        if (!d) { toast('Could not load deals. Check your internet.'); closeDeals(); return; }
        cur.data = d;
        if (!d.campaign) { toast('Sorry, this offer has ended. Check out our other deals!'); }
        else if (cur.cat && !(d.items || []).some(function (p) { return (p.category || 'Other') === cur.cat; })) cur.cat = null;
        paintDeals();
        var s = pageEl().querySelector('.dl-scroll'); if (s) s.scrollTop = 0;
    }
    function closeDeals() {
        cur.id = null;
        if (typeof window.navigateTo === 'function') window.navigateTo('home');
    }
    function findProd(pid) { var l = (cur.data && cur.data.items) || []; return l.find(function (p) { return String(p.id) === String(pid); }); }

    function onPageClick(e) {
        var t = e.target;
        var b = t.closest && t.closest('[data-dl]');
        if (b) {
            var a = b.getAttribute('data-dl');
            if (a === 'back') { if (cur.cat) { cur.cat = null; paintDeals(); } else closeDeals(); }
            else if (a === 'home') closeDeals();
            else if (a === 'cart') { if (typeof window.navigateTo === 'function') window.navigateTo('cart'); }
            return;
        }
        var s = t.closest && t.closest('[data-sort]'); if (s) { cur.sort = s.getAttribute('data-sort'); paintDeals(); return; }
        var ct = t.closest && t.closest('[data-cat]');
        if (ct) { cur.cat = ct.getAttribute('data-cat') || null; cur.sort = 'rel'; paintDeals(); var sc = pageEl().querySelector('.dl-scroll'); if (sc) sc.scrollTop = 0; return; }
        var add = t.closest && t.closest('[data-add]');
        if (add) {
            e.stopPropagation();
            var p = findProd(add.getAttribute('data-add')); if (!p) return;
            if (typeof addToCart === 'function') addToCart(payload(p));
            add.classList.add('done'); add.textContent = '✓ ADDED';
            setTimeout(function () { add.classList.remove('done'); add.textContent = 'ADD'; }, 1400);
            return;
        }
        var card = t.closest && t.closest('.dl-card');
        if (card) {
            var pr = findProd(card.getAttribute('data-pid'));
            if (pr && typeof navigateToProductDetail === 'function') navigateToProductDetail(payload(pr));
        }
    }

    /* page switching: 'offer-deals' is handled here, every other page goes to the app's own navigateTo */
    function hookNav() {
        var orig = window.navigateTo;
        if (typeof orig !== 'function' || orig.__mfo) return;
        var wrapped = function (page, anchor) {
            var pg = ensurePage();
            if (page === 'offer-deals') {
                document.querySelectorAll('.app-page.active').forEach(function (el) { el.classList.remove('active'); });
                pg.classList.add('active');
                document.querySelectorAll('#bottom-nav .nav-item').forEach(function (i) { i.classList.toggle('active', i.dataset.page === 'home'); });
                if (typeof updateHomeHeaderVisibility === 'function') updateHomeHeaderVisibility('offer-deals');
                try { history.replaceState(null, '', location.pathname + '?offer=' + encodeURIComponent(cur.id || '') + '#offer-deals'); } catch (e) {}
                window.scrollTo(0, 0);
                return;
            }
            if (pg.classList.contains('active')) {
                pg.classList.remove('active');
                try { var u = new URL(location.href); u.searchParams.delete('offer'); history.replaceState(null, '', u.pathname + (u.search || '')); } catch (e) {}
            }
            return orig.apply(this, arguments);
        };
        wrapped.__mfo = true;
        window.navigateTo = wrapped;
    }

    function init() {
        root = document.getElementById(MOUNT_ID);
        hookNav();
        var pg = ensurePage(); pg.addEventListener('click', onPageClick);
        if (root) {
            root.hidden = true;
            root.addEventListener('click', function (e) {
                var card = e.target.closest('.mfo-card');
                if (!card || card.classList.contains('upcoming')) return;
                var c = items.find(function (x) { return String(x.id) === card.getAttribute('data-id'); });
                if (!c || phase(c) === 'ended') { toast('This offer has ended'); load(); return; }
                var url = card.getAttribute('data-url');
                if (isDefaultTarget(url)) openDeals(c.id); else window.location.href = url;
            });
        }
        var q = new URLSearchParams(location.search);
        if (q.get('offer_ended') === '1') toast('Sorry, this offer has ended. Check out our other deals!');
        var deep = q.get('offer');
        load().then(function () {
            if (deep) openDeals(deep);
            else if (location.hash === '#mf-offers') { var el = document.getElementById('mf-offers-section'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }
        });
        tick = setInterval(update, 1000);
        refetchTimer = setInterval(function () { load(); }, 60000);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) { load(); if (cur.id) { fetchDeals(cur.id, true).then(function (d) { if (d && cur.id) { cur.data = d; paintDeals(); } }); } } });
    }
    window.MFOffers = { reload: load, open: openDeals, close: closeDeals };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
