// ==========================================
// MediFinder — Push Notifications (shared, all pages)
// User / Merchant / Rider / Admin / Ambulance / Nurse / Blood partner —
// jekono page e ei ekta line add korlei hobe (supabase-config.js er PORE):
//   <script src="push-notifications.js?v=1" defer></script>
//
// Kaj: Permission granted thakle → SW register → PushManager.subscribe()
//      → Supabase push_subscriptions e save (RPC: save_push_subscription)
// Permission chaowa kaj permission-every.js er; eta shudhu subscribe kore.
// ==========================================
(function () {
    'use strict';

    // ✅ `npx web-push generate-vapid-keys` er PUBLIC key ekhane boshao.
    // ❌ PRIVATE key kokhono ekhane noy — shudhu Edge Function secret e.
    const VAPID_PUBLIC_KEY = 'BJAxnajNPVqnHqwS8m123RdeQADveZn13WpXN5prhkE4Ya8nzPfr5XQufeQDMlQByN6B4QOIDxC1jNm7az4anmQ';
    const SW_URL = '/sw.js';

    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    let busy = false;

    // Switch state kept per browser. 'off' = user switched push off; in-app notifications keep working.
    const PREF_KEY = 'mf_push_pref';
    function prefOff() { try { return localStorage.getItem(PREF_KEY) === 'off'; } catch (e) { return false; } }
    function setPref(v) { try { localStorage.setItem(PREF_KEY, v); } catch (e) {} }

    function getClient() {
        try { if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient; } catch (e) {}
        if (window.supabaseClient) return window.supabaseClient;
        try {
            if (window.supabase && typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_KEY !== 'undefined') {
                window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: false } });
                return window.supabaseClient;
            }
        } catch (e) {}
        return null;
    }

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(base64);
        const out = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
        return out;
    }

    function deviceLabel() {
        const ua = navigator.userAgent || '';
        const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'Other';
        const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
        return os + ' ' + br;
    }

    async function getRegistration() {
        await navigator.serviceWorker.register(SW_URL); // already registered thakle same registration dey
        return navigator.serviceWorker.ready;
    }

    // Permission already granted thakle subscribe kore Supabase e save kore
    async function subscribe() {
        if (!supported) return { ok: false, reason: 'unsupported' };
        if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.startsWith('PASTE_')) return { ok: false, reason: 'no-vapid-key' };
        if (Notification.permission !== 'granted') return { ok: false, reason: 'permission-' + Notification.permission };
        if (prefOff()) return { ok: false, reason: 'permission-switched-off' }; // user turned the switch OFF on the Notifications page

        const client = getClient();
        if (!client) return { ok: false, reason: 'no-supabase-client' };

        const { data } = await client.auth.getSession();
        if (!data || !data.session) return { ok: false, reason: 'not-logged-in' };

        const reg = await getRegistration();
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
        }

        const json = sub.toJSON();
        const keys = json.keys || {};
        const { error } = await client.rpc('save_push_subscription', {
            p_endpoint: json.endpoint,
            p_p256dh: keys.p256dh,
            p_auth: keys.auth,
            p_device: deviceLabel()
        });
        if (error) return { ok: false, reason: 'save-failed', error };
        return { ok: true };
    }

    async function init() {
        if (busy) return;
        busy = true;
        try {
            const r = await subscribe();
            if (!r.ok && !/^permission-|not-logged-in|unsupported/.test(r.reason)) {
                console.warn('[MFPush]', r.reason, r.error || '');
            }
        } catch (e) {
            console.warn('[MFPush] init failed', e);
        } finally {
            busy = false;
        }
    }

    // Explicit tap on a "Turn on" button / the switch.
    async function enable() {
        if (!supported) return { ok: false, reason: 'unsupported' };
        setPref('on');
        if (Notification.permission === 'default') {
            if (window.MFPermissions) window.MFPermissions.forget('notifications');
            await Notification.requestPermission();
        }
        if (Notification.permission === 'denied') return { ok: false, reason: 'blocked' };
        return subscribe();
    }

    // Logout er AGE call korle (shared phone e onner notification na jay):
    //   await MFPush.disable(); await supabaseClient.auth.signOut();
    async function disable() {
        try {
            const reg = await navigator.serviceWorker.getRegistration('/');
            const sub = reg && await reg.pushManager.getSubscription();
            if (!sub) return;
            const client = getClient();
            if (client) {
                // RPC works even after signOut (no session needed); table delete kept as fallback
                const r = await client.rpc('remove_push_subscription', { p_endpoint: sub.endpoint });
                if (r && r.error) await client.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
            }
            await sub.unsubscribe();
        } catch (e) { console.warn('[MFPush] disable failed', e); }
    }

    window.MFPush = { init, enable, disable, subscribe };
    // (mountSwitch / isOn / refreshSwitches are attached below)

    // ---- First-visit prompt on the HOME page (home.html / user.html) ----
    // Shown once per browser session while the permission is still 'default'.
    // "Allow" = real browser prompt (needs a tap on mobile). "Not now" = snooze 3 days.
    const SNOOZE_KEY = 'mf_push_prompt_snooze_until';
    const SEEN_KEY = 'mf_push_prompt_seen_session';
    // Prompt only on pages a LOGGED-IN person sees (never on home/auth/index/admin before login).
    function isHomePage() { return !/(^|\/)(home|auth|index|admin)\.html$/i.test(location.pathname) && !/\/$/.test(location.pathname); }
    function hasLocalSession() {
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (/^sb-.*-auth-token$/.test(k) && localStorage.getItem(k)) return true;
            }
        } catch (e) {}
        return false;
    }
    function promptSnoozed() {
        try {
            if (sessionStorage.getItem(SEEN_KEY) === '1') return true;
            return Date.now() < Number(localStorage.getItem(SNOOZE_KEY) || 0);
        } catch (e) { return false; }
    }
    function showHomePrompt() {
        if (document.getElementById('mf-push-prompt')) return;
        try { sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) {}
        const wrap = document.createElement('div');
        wrap.id = 'mf-push-prompt';
        wrap.setAttribute('role', 'dialog');
        wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,15,15,.5);display:flex;align-items:flex-end;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;';
        wrap.innerHTML =
            '<div style="width:100%;max-width:420px;background:#fff;border-radius:20px 20px 0 0;padding:26px 22px 22px;text-align:center;box-shadow:0 -8px 30px rgba(0,0,0,.22)">' +
            '<div style="font-size:42px;line-height:1;margin-bottom:12px">🔔</div>' +
            '<div style="font-size:19px;font-weight:700;color:#1a1a1a;margin-bottom:8px">Stay updated with MediFinder India</div>' +
            '<div style="font-size:14px;color:#666;line-height:1.5;margin-bottom:20px">Turn on notifications to get order updates, delivery alerts and offers, even when the app is closed.</div>' +
            '<button id="mf-push-yes" style="display:block;width:100%;padding:14px;border:0;border-radius:12px;background:#e02020;color:#fff;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:10px">Allow notifications</button>' +
            '<button id="mf-push-no" style="display:block;width:100%;padding:14px;border:0;border-radius:12px;background:#f4f4f4;color:#555;font-size:15px;font-weight:600;cursor:pointer">Not now</button>' +
            '</div>';
        document.body.appendChild(wrap);
        const close = () => wrap.remove();
        wrap.querySelector('#mf-push-no').onclick = () => {
            try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 3 * 24 * 3600 * 1000)); } catch (e) {}
            close();
        };
        wrap.querySelector('#mf-push-yes').onclick = async () => { close(); try { await enable(); } catch (e) {} refreshSwitches(); };
    }
    function maybeShowHomePrompt() {
        if (!supported || !isHomePage() || !hasLocalSession()) return;
        if (Notification.permission !== 'default' || promptSnoozed()) return;
        if (document.getElementById('mf-perm-overlay')) return;
        showHomePrompt();
    }

    // ---- On/Off switch (Notifications page) ----
    // MFPush.mountSwitch('#mf-push-switch') draws: a status line + a switch.
    // Status line makes it clear that in-app notifications still arrive when push is off.
    function pushIsOn() { return supported && Notification.permission === 'granted' && !prefOff(); }
    function switchHtml() {
        const on = pushIsOn();
        const blocked = supported && Notification.permission === 'denied';
        let line;
        if (!supported) line = 'Push notifications are not supported on this browser. You will still get notifications inside the app.';
        else if (blocked) line = 'Push is blocked in your browser settings. You will still get notifications inside the app.';
        else if (on) line = 'Push is ON. You get alerts even when the app is closed.';
        else line = 'Push is OFF. You will still get notifications inside the app. Turn it on to get alerts when the app is closed.';
        const knob = on ? 'translateX(20px)' : 'translateX(0)';
        return '<div style="display:flex;align-items:center;gap:12px;background:#fff7f7;border:1px solid #f3d6d6;border-radius:12px;padding:12px 14px;margin:10px 12px 6px;font-family:inherit">' +
            '<span style="font-size:20px">🔔</span>' +
            '<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:700;color:#1a1a1a">Push notifications</div>' +
            '<div data-mf-push-line style="font-size:12.5px;color:#666;line-height:1.4;margin-top:2px">' + line + '</div></div>' +
            (supported ? '<button type="button" data-mf-push-btn role="switch" aria-checked="' + on + '" aria-label="Push notifications" style="flex:none;width:46px;height:26px;border-radius:13px;border:0;padding:3px;cursor:pointer;background:' + (on ? '#e02020' : '#cfcfcf') + ';transition:background .2s">' +
            '<span style="display:block;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transform:' + knob + ';transition:transform .2s"></span></button>' : '') +
            '</div>';
    }
    function showBlockedHelp(box) {
        let h = box.querySelector('[data-mf-push-help]');
        if (!h) { h = document.createElement('div'); h.setAttribute('data-mf-push-help', ''); h.style.cssText = 'margin:0 12px 8px;padding:10px 12px;border-radius:10px;background:#fff3cd;color:#664d03;font-size:12.5px;line-height:1.45'; box.appendChild(h); }
        h.textContent = 'Notifications are blocked for this site. Tap the lock icon next to the address bar, open Site settings, set Notifications to Allow, then come back and turn this switch on.';
    }
    function drawSwitch(box) {
        box.innerHTML = switchHtml();
        const btn = box.querySelector('[data-mf-push-btn]');
        if (!btn) return;
        btn.onclick = async () => {
            btn.disabled = true;
            try {
                if (pushIsOn()) { setPref('off'); await disable(); }
                else {
                    const r = await enable();
                    if (r && r.reason === 'blocked') { drawSwitch(box); showBlockedHelp(box); return; }
                }
            } catch (e) { console.warn('[MFPush] switch failed', e); }
            drawSwitch(box);
        };
    }
    const switches = [];
    function refreshSwitches() { switches.forEach(drawSwitch); }
    function mountSwitch(target) {
        const box = typeof target === 'string' ? document.querySelector(target) : target;
        if (!box) return;
        if (switches.indexOf(box) === -1) switches.push(box);
        drawSwitch(box);
    }
    window.MFPush.mountSwitch = mountSwitch;
    window.MFPush.isOn = pushIsOn;
    window.MFPush.refreshSwitches = refreshSwitches;

    function autoMount() {
        const el = document.getElementById('mf-push-switch');
        if (el) mountSwitch(el);
    }
    // keep the switch honest if permission is changed in browser settings / bell is opened
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSwitches(); });
    document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#notiBtn')) setTimeout(refreshSwitches, 50); });

    if (supported) {
        let tries = 0;
        const pt = setInterval(() => {
            tries++;
            if (Notification.permission !== 'default' || tries > 12) { clearInterval(pt); return; }
            if (tries >= 2) { clearInterval(pt); maybeShowHomePrompt(); }
        }, 1500);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount);
    else autoMount();

    // ---- Auto triggers ----
    if (supported) {
        // 1) page load
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();

        // 2) login hoye gele
        const t = setInterval(() => {
            const c = getClient();
            if (c && c.auth && c.auth.onAuthStateChange) {
                clearInterval(t);
                c.auth.onAuthStateChange((event) => {
                    if (event === 'SIGNED_IN') init();
                    // logout hole ei device theke purono account er push bondho (role/account mix hobe na)
                    if (event === 'SIGNED_OUT') disable();
                });
            }
        }, 500);
        setTimeout(() => clearInterval(t), 15000);

        // 3) permission-every.js e user "Allow" dile sathe sathe subscribe
        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name: 'notifications' }).then((p) => {
                p.onchange = () => { if (p.state === 'granted') init(); refreshSwitches(); };
            }).catch(() => {});
        }
    }
})();
