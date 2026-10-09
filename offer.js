// ==========================================
// MediFinder — Offers / Campaigns (homepage banner + server-time countdown)
// Use on user home page (after supabase-config.js):
//   <link rel="stylesheet" href="offer.css?v=1">
//   <div id="mf-offers"></div>                      <- where the section should appear
//   <script src="offer.js?v=1" defer></script>
// Countdown uses the SERVER clock (offset from get_active_campaigns), so refresh
// or a wrong phone clock never changes the time left.
// ==========================================
(function () {
    'use strict';
    var MOUNT_ID = 'mf-offers';
    var offset = 0;            // serverNow - Date.now()
    var items = [];
    var tick = null, refetchTimer = null, root = null;

    function getClient() {
        try { if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient; } catch (e) {}
        if (window.supabaseClient) return window.supabaseClient;
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
    function parts(ms) {
        var t = Math.max(0, Math.floor(ms / 1000));
        return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
    }
    function timerHtml(ms) {
        var p = parts(ms), days = p.d ? '<span class="mfo-days">' + p.d + 'd</span>' : '';
        return days + '<b>' + pad(p.h) + '</b><i>:</i><b>' + pad(p.m) + '</b><i>:</i><b>' + pad(p.s) + '</b>';
    }
    function phase(c) {
        var t = now(), s = new Date(c.start_at).getTime(), e = new Date(c.end_at).getTime();
        if (c.ended_early || t >= e) return 'ended';
        return t < s ? 'upcoming' : 'live';
    }

    function cardHtml(c) {
        var ph = phase(c), s = new Date(c.start_at).getTime(), e = new Date(c.end_at).getTime();
        var bg = c.image_url ? ' style="background-image:linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.65)),url(\'' + esc(c.image_url) + '\')"' : '';
        var clock = '';
        if (c.show_countdown !== false) {
            clock = '<div class="mfo-clock" data-mfo-clock data-end="' + (ph === 'upcoming' ? s : e) + '">' +
                '<span class="mfo-clock-lbl">' + (ph === 'upcoming' ? 'Starts in' : 'Ends in') + '</span>' +
                '<span class="mfo-clock-time">' + timerHtml((ph === 'upcoming' ? s : e) - now()) + '</span></div>';
        }
        return '<article class="mfo-card ' + ph + '" data-id="' + esc(c.id) + '" data-url="' + esc(c.target_url || '/user.html') + '"' + bg + '>' +
            '<div class="mfo-body">' +
            (c.discount_text ? '<div class="mfo-badge">' + esc(c.discount_text) + '</div>' : '') +
            '<h3 class="mfo-title">' + esc(c.title) + '</h3>' +
            (c.description ? '<p class="mfo-desc">' + esc(c.description) + '</p>' : '') +
            clock +
            (ph === 'live' ? '<button class="mfo-cta" type="button">SHOP NOW</button>' : '<button class="mfo-cta soon" type="button" disabled>COMING SOON</button>') +
            '</div></article>';
    }

    function render() {
        if (!root) return;
        var live = items.filter(function (c) { return phase(c) !== 'ended'; });
        if (!live.length) { root.innerHTML = ''; root.hidden = true; return; }
        root.hidden = false;
        root.innerHTML = '<section class="mfo-section" id="mf-offers-section"><h2 class="mfo-head">🔥 Today\'s Health Deals</h2>' +
            '<div class="mfo-track">' + live.map(cardHtml).join('') + '</div></section>';
    }

    // runs every second: only touches the numbers (no flicker); re-renders when a phase changes
    function update() {
        if (!root || root.hidden) return;
        var changed = false;
        items.forEach(function (c) {
            var card = root.querySelector('.mfo-card[data-id="' + c.id + '"]');
            var ph = phase(c);
            if (!card) { if (ph !== 'ended') changed = true; return; }
            if (!card.classList.contains(ph)) changed = true;
        });
        if (changed) { render(); return; }
        root.querySelectorAll('[data-mfo-clock]').forEach(function (el) {
            var end = Number(el.getAttribute('data-end')), left = end - now();
            var t = el.querySelector('.mfo-clock-time');
            if (t) t.innerHTML = timerHtml(left);
            el.classList.toggle('urgent', left > 0 && left < 3600000);
        });
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

    function toast(msg) {
        var t = document.createElement('div'); t.className = 'mfo-toast'; t.textContent = msg; document.body.appendChild(t);
        setTimeout(function () { t.classList.add('show'); }, 20);
        setTimeout(function () { t.remove(); }, 4200);
    }

    function init() {
        root = document.getElementById(MOUNT_ID);
        if (!root) return;
        root.hidden = true;
        root.addEventListener('click', function (e) {
            var card = e.target.closest('.mfo-card');
            if (!card || card.classList.contains('upcoming')) return;
            var c = items.find(function (x) { return String(x.id) === card.getAttribute('data-id'); });
            if (!c || phase(c) === 'ended') { toast('This offer has ended'); load(); return; }
            window.location.href = card.getAttribute('data-url');
        });
        var q = new URLSearchParams(location.search);
        if (q.get('offer_ended') === '1') toast('Sorry, this offer has ended. Check out our other deals!');
        load().then(function () { if (location.hash === '#mf-offers') { var el = document.getElementById('mf-offers-section'); if (el) el.scrollIntoView({ behavior: 'smooth' }); } });
        tick = setInterval(update, 1000);
        refetchTimer = setInterval(load, 60000);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
    }
    window.MFOffers = { reload: load };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
