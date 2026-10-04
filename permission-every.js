// ==========================================
// MediFinder India — Lazy Permission Guard (all pages)
//
// OLD behaviour: a wizard asked Notification + Location + Camera + Microphone
// right after login. REMOVED.
//
// NEW behaviour:
//   * Nothing is asked up-front. The browser's own permission prompt appears
//     only when the visitor actually USES a feature (GPS button, camera /
//     prescription scan, voice search, ...).
//   * Once the visitor has answered (Allow / Block / closed the prompt) for a
//     feature, we never ask for that same feature again until the browser tab
//     is closed (sessionStorage is wiped when the tab closes).
//
// Load this file BEFORE every other script (plain <script>, no defer):
//   <script src="permission-every.js?v=4"></script>
// ==========================================
(function () {
    'use strict';
    if (window.__mfPermissionGuard) return;
    window.__mfPermissionGuard = true;

    var PREFIX = 'mf_perm_asked_';
    function flagged(k) { try { return sessionStorage.getItem(PREFIX + k) === '1'; } catch (e) { return false; } }
    function setFlag(k) { try { sessionStorage.setItem(PREFIX + k, '1'); } catch (e) {} }
    function clearFlag(k) { try { sessionStorage.removeItem(PREFIX + k); } catch (e) {} }

    // If the visitor later switches the permission to "granted" in browser
    // settings, honour it immediately instead of waiting for the tab to close.
    function isNowGranted(name) {
        if (!(navigator.permissions && navigator.permissions.query)) return Promise.resolve(false);
        return navigator.permissions.query({ name: name })
            .then(function (r) { return r.state === 'granted'; })
            .catch(function () { return false; });
    }

    // ---------- Geolocation ----------
    if (navigator.geolocation) {
        var geo = navigator.geolocation;
        var origGet = geo.getCurrentPosition.bind(geo);
        var origWatch = geo.watchPosition.bind(geo);
        var deniedError = function () {
            return { code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
        };
        var watchSeq = 0;

        geo.getCurrentPosition = function (ok, err, opts) {
            var wrappedErr = function (e) { if (e && e.code === 1) setFlag('geolocation'); if (err) err(e); };
            if (!flagged('geolocation')) return origGet(ok, wrappedErr, opts);
            isNowGranted('geolocation').then(function (granted) {
                if (granted) { clearFlag('geolocation'); origGet(ok, wrappedErr, opts); }
                else if (err) err(deniedError());
            });
        };
        geo.watchPosition = function (ok, err, opts) {
            var wrappedErr = function (e) { if (e && e.code === 1) setFlag('geolocation'); if (err) err(e); };
            if (!flagged('geolocation')) return origWatch(ok, wrappedErr, opts);
            var id = --watchSeq; // negative id: nothing is really being watched
            isNowGranted('geolocation').then(function (granted) {
                if (granted) clearFlag('geolocation');
                if (!granted && err) err(deniedError());
            });
            return id;
        };
    }

    // ---------- Camera / Microphone ----------
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        var md = navigator.mediaDevices;
        var origGum = md.getUserMedia.bind(md);
        md.getUserMedia = function (constraints) {
            var kinds = [];
            if (constraints && constraints.video) kinds.push('camera');
            if (constraints && constraints.audio) kinds.push('microphone');
            var blocked = kinds.filter(flagged);
            var run = function () {
                return origGum(constraints).catch(function (e) {
                    if (e && (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError' || e.name === 'SecurityError')) {
                        kinds.forEach(setFlag);
                    }
                    throw e;
                });
            };
            if (!blocked.length) return run();
            return Promise.all(blocked.map(isNowGranted)).then(function (res) {
                if (res.every(Boolean)) { blocked.forEach(clearFlag); return run(); }
                var err;
                try { err = new DOMException('Permission denied', 'NotAllowedError'); }
                catch (e) { err = new Error('Permission denied'); err.name = 'NotAllowedError'; }
                throw err;
            });
        };
    }

    // ---------- Notifications ----------
    if ('Notification' in window && typeof Notification.requestPermission === 'function') {
        var origReq = Notification.requestPermission.bind(Notification);
        Notification.requestPermission = function (cb) {
            // Already decided in the browser (granted / denied) -> nothing to ask.
            if (Notification.permission !== 'default') {
                var p = Promise.resolve(Notification.permission);
                if (typeof cb === 'function') p.then(cb);
                return p;
            }
            // Visitor already saw the prompt this session and closed it -> don't ask again.
            if (flagged('notifications')) {
                var q = Promise.resolve('default');
                if (typeof cb === 'function') q.then(cb);
                return q;
            }
            var result = origReq();
            result.then(function (perm) { if (perm !== 'granted') setFlag('notifications'); });
            if (typeof cb === 'function') result.then(cb);
            return result;
        };
    }

    window.MFPermissions = {
        // 'granted' | 'denied' | 'prompt'  (never triggers a prompt)
        state: function (name) {
            if (navigator.permissions && navigator.permissions.query) {
                return navigator.permissions.query({ name: name }).then(function (r) { return r.state; }).catch(function () { return 'prompt'; });
            }
            if (name === 'notifications' && 'Notification' in window) {
                return Promise.resolve(Notification.permission === 'default' ? 'prompt' : Notification.permission);
            }
            return Promise.resolve('prompt');
        },
        // Forget "already asked this session" (e.g. after the visitor taps an explicit "Turn on" button)
        forget: function (name) { clearFlag(name === 'geolocation' ? 'geolocation' : name); }
    };
    window.MF_resetPermissionWizard = function () {}; // kept so old callers don't break
})();
