// ==========================================
// MediFinder India - Session Guard + Router (all pages)  v2
//  1. Logged-in person STAYS logged in until Logout (or MF_MAX_IDLE_DAYS idle).
//  2. Public pages (home.html) never show a logged-in person: they are sent
//     to THEIR OWN page (role + service_type) instantly, no network needed.
//  3. ANY sign-out (any page, any script) wipes every cached login trace, so
//     the next visit is: Splash -> public Home.
//  4. Back/forward cache can never show a stale logged-in page after logout.
// Load as the FIRST script in <head>, plain <script>, no defer:
//   <script src="session-guard.js?v=2"></script>
// ==========================================
(function () {
    'use strict';
    if (window.__mfSessionGuard) return;
    window.__mfSessionGuard = true;

    var MF_MAX_IDLE_DAYS = 20;
    var KEY = 'mf_last_active';
    var DAY = 86400000;
    var ADMIN_EMAIL = 'medifinderindia@gmail.com';
    var EMS_PAGES = { ambulance_driver: 'ambulance-partner.html', nurse: 'nurse-patner.html', phlebotomist: 'blood-patner.html' };
    var AUTH_KEY_RE = /^sb-.*-auth-token$/;
    var LOGIN_TRACES = ['selected_role', 'selected_service_type', 'merchantSessionActive', 'userPhone', 'userName', 'admin_auth_in_progress', 'mf_pending_action', KEY];

    var _rm = Storage.prototype.removeItem;     // original, so cleanup never recurses

    function sbKeys() {
        var out = [];
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (k && /^sb-.*-auth-token/.test(k)) out.push(k);
            }
        } catch (e) {}
        return out;
    }
    function touch() { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} }

    // ---- full local wipe (used by logout, idle logout, and any signOut) ----
    function wipeLoginTraces() {
        try { LOGIN_TRACES.forEach(function (k) { _rm.call(localStorage, k); }); } catch (e) {}
        try { sessionStorage.removeItem('mf_splash_shown'); sessionStorage.removeItem('mf_oauth_pending'); } catch (e) {}
    }
    // Catches EVERY supabase signOut (user.js, marchent.js, rider.js ... any page):
    // supabase-js removes the "sb-...-auth-token" key when the session ends.
    Storage.prototype.removeItem = function (k) {
        var r = _rm.apply(this, arguments);
        try { if (this === window.localStorage && AUTH_KEY_RE.test(String(k))) wipeLoginTraces(); } catch (e) {}
        return r;
    };

    // ---- read the stored session synchronously (no network) ----
    function readUser() {
        try {
            var keys = sbKeys();
            for (var i = 0; i < keys.length; i++) {
                var j = JSON.parse(localStorage.getItem(keys[i]) || 'null');
                if (!j) continue;
                if (j.currentSession) j = j.currentSession;
                if (j && (j.access_token || j.user)) return j.user || {};
            }
        } catch (e) {}
        return null;
    }
    // role + service_type -> own page. Returns null if it can't be known offline.
    function routeFor(user) {
        if (!user) return null;
        if (user.email === ADMIN_EMAIL && localStorage.getItem('admin_auth_in_progress') !== 'true') return 'admin.html';
        var role = localStorage.getItem('selected_role') || (user.user_metadata && user.user_metadata.role) || 'user';
        if (role === 'merchant') return 'marchent.html';
        if (role === 'delivery') return 'rider.html';
        if (role === 'service') {
            var st = localStorage.getItem('selected_service_type') || '';
            return EMS_PAGES[st] || null;       // unknown service type -> let the splash look it up
        }
        return 'user.html';
    }
    function tooManyRedirects() {
        try {
            var log = JSON.parse(sessionStorage.getItem('mf_guard_log') || '[]'), now = Date.now();
            log = log.filter(function (t) { return now - t < 6000; }); log.push(now);
            sessionStorage.setItem('mf_guard_log', JSON.stringify(log));
            return log.length > 4;
        } catch (e) { return false; }
    }
    function go(path) { if (!tooManyRedirects()) location.replace(path); }

    // ---- public API for every page ----
    window.mfRouteFromCache = function () { return routeFor(readUser()); };
    window.mfHasSession = function () { return sbKeys().length > 0; };
    window.mfLogout = async function (redirectTo) {
        try {
            var c = window.supabaseClient;
            if (c && c.auth) {
                await Promise.race([c.auth.signOut(), new Promise(function (r) { setTimeout(r, 3500); })]);
            }
        } catch (e) {}
        try { sbKeys().forEach(function (k) { _rm.call(localStorage, k); }); } catch (e) {}   // even if network failed
        wipeLoginTraces();
        location.replace(redirectTo || 'home.html');
    };

    var p = location.pathname.toLowerCase();
    var isHome = /(^|\/)home\.html$/.test(p);
    var isPublic = /(^|\/)(home|auth|index)\.html$/.test(p) || /\/$/.test(p);

    try {
        var keys = sbKeys();
        var last = Number(localStorage.getItem(KEY) || 0);

        if (keys.length && last && (Date.now() - last) > MF_MAX_IDLE_DAYS * DAY) {
            // idle too long -> local sign-out
            keys.forEach(function (k) { _rm.call(localStorage, k); });
            wipeLoginTraces();
            try { sessionStorage.setItem('mf_auth_notice', JSON.stringify({ msg: 'You were logged out automatically because you did not use MediFinder India for ' + MF_MAX_IDLE_DAYS + ' days. Please log in again.', type: 'error' })); } catch (e) {}
            if (!isPublic) { location.replace('home.html'); }
        } else if (keys.length) {
            touch();
            // (2) home.html is PUBLIC ONLY: a logged-in person is sent to their own page.
            if (isHome) {
                var dest = routeFor(readUser());
                go(dest || 'index.html');       // unknown service type -> splash resolves it from the DB
            }
        }
    } catch (e) {}

    // (4) Back/forward cache: never show a stale page after the session changed.
    window.addEventListener('pageshow', function (ev) {
        if (!ev.persisted) return;
        var has = sbKeys().length > 0;
        if (!isPublic && !has) { go('home.html'); }
        else if (isHome && has) { go(routeFor(readUser()) || 'index.html'); }
    });

    // keep "last active" fresh while the site is actually being used
    var lastWrite = Date.now();
    function tick() { if (sbKeys().length && Date.now() - lastWrite > 600000) { lastWrite = Date.now(); touch(); } }
    document.addEventListener('visibilitychange', function () { if (!document.hidden && sbKeys().length) { lastWrite = Date.now(); touch(); } });
    ['pointerdown', 'keydown', 'scroll'].forEach(function (ev) { document.addEventListener(ev, tick, { passive: true, capture: true }); });
    window.addEventListener('pagehide', function () { if (sbKeys().length) touch(); });
})();
