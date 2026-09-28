// ==========================================
// MediFinder — Post-Login Permission Wizard
// Login korar por (user session thakle) ekbar Notification, Location (GPS),
// Camera, Microphone permission chay. User "Allow" ba "Don't Allow" dite pare.
// Login page/home e (logged-out) dekhabe na. Prottek user-er jonno ekbar.
// Dashboard page gulote (user/merchant/delivery/EMS) eta add korte hobe:
// <script src="permission-every.js?v=2" defer></script>
// ==========================================
(function () {
    const FLAG_PREFIX = 'mf_permissions_setup_';
    const BRAND_RED = '#e02020';

    // ---- Logged-in user id (Supabase session localStorage theke) ----
    function getLoggedInUserId() {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (/^sb-.*-auth-token$/.test(k)) {
                    const s = JSON.parse(localStorage.getItem(k) || 'null');
                    const uid = s && ((s.user && s.user.id) || (s.currentSession && s.currentSession.user && s.currentSession.user.id));
                    if (uid) return uid;
                }
            }
        } catch (e) {}
        return null;
    }

    const STEPS = [
        {
            id: 'notification', permName: 'notifications',
            icon: '🔔', title: 'Notification',
            desc: 'অর্ডার আপডেট আর অফার মিস করবেন না',
            request: () => {
                if (!('Notification' in window)) return Promise.resolve('unsupported');
                if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
                return Notification.requestPermission();
            }
        },
        {
            id: 'location', permName: 'geolocation',
            icon: '📍', title: 'Location (GPS)',
            desc: 'কাছের ফার্মেসি ও দ্রুত ডেলিভারির জন্য',
            request: () => new Promise((resolve) => {
                if (!('geolocation' in navigator)) return resolve('unsupported');
                navigator.geolocation.getCurrentPosition(
                    () => resolve('granted'),
                    () => resolve('denied'),
                    { timeout: 10000 }
                );
            })
        },
        {
            id: 'camera', permName: 'camera',
            icon: '📷', title: 'Camera',
            desc: 'প্রেসক্রিপশন স্ক্যান ও ছবি আপলোডের জন্য',
            request: () => askMedia({ video: true })
        },
        {
            id: 'microphone', permName: 'microphone',
            icon: '🎤', title: 'Microphone',
            desc: 'ভয়েস সার্চ ব্যবহারের জন্য',
            request: () => askMedia({ audio: true })
        }
    ];

    function askMedia(constraints) {
        if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return Promise.resolve('unsupported');
        return navigator.mediaDevices.getUserMedia(constraints)
            .then(stream => { stream.getTracks().forEach(t => t.stop()); return 'granted'; })
            .catch(() => 'denied');
    }

    // Already granted/denied hole abar jiggesh korbe na (browser abar prompt dey na)
    async function currentState(step) {
        try {
            const r = await navigator.permissions.query({ name: step.permName });
            return r.state; // 'granted' | 'denied' | 'prompt'
        } catch (e) {
            if (step.id === 'notification' && 'Notification' in window) {
                return Notification.permission === 'default' ? 'prompt' : Notification.permission;
            }
            return 'prompt';
        }
    }

    let started = false;

    async function start(uid) {
        if (started) return;
        started = true;
        const flagKey = FLAG_PREFIX + uid;

        // Shudhu jegulo ekhono "prompt" state e ache segulo dekhabe
        const pending = [];
        for (const s of STEPS) {
            if ((await currentState(s)) === 'prompt') pending.push(s);
        }
        if (!pending.length) { localStorage.setItem(flagKey, 'done'); return; }

        let stepIndex = -1; // -1 = welcome screen

        const style = document.createElement('style');
        style.textContent = `
            #mf-perm-overlay { position: fixed; inset: 0; z-index: 999999; background: rgba(20,20,20,.55);
                display: flex; align-items: flex-end; justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                opacity: 0; transition: opacity .25s ease; }
            #mf-perm-overlay.mf-show { opacity: 1; }
            #mf-perm-card { width: 100%; max-width: 420px; background: #fff; border-radius: 20px 20px 0 0;
                padding: 28px 24px 24px; text-align: center; transform: translateY(30px);
                transition: transform .3s ease; box-shadow: 0 -8px 30px rgba(0,0,0,.2); }
            #mf-perm-overlay.mf-show #mf-perm-card { transform: translateY(0); }
            @media (min-width: 480px) { #mf-perm-overlay { align-items: center; } #mf-perm-card { border-radius: 20px; } }
            .mf-perm-icon { font-size: 44px; line-height: 1; margin-bottom: 14px; }
            .mf-perm-title { font-size: 19px; font-weight: 700; color: #1a1a1a; margin: 0 0 8px; }
            .mf-perm-desc { font-size: 14px; color: #666; margin: 0 0 22px; line-height: 1.5; }
            .mf-perm-dots { display: flex; justify-content: center; gap: 6px; margin-bottom: 18px; }
            .mf-perm-dots span { width: 6px; height: 6px; border-radius: 50%; background: #e5e5e5; }
            .mf-perm-dots span.mf-active { background: ${BRAND_RED}; width: 18px; border-radius: 3px; transition: all .2s; }
            .mf-perm-btn { display: block; width: 100%; padding: 14px; border: none; border-radius: 12px;
                font-size: 15px; font-weight: 600; cursor: pointer; margin-bottom: 10px; }
            .mf-perm-btn-primary { background: ${BRAND_RED}; color: #fff; }
            .mf-perm-btn-primary:active { opacity: .85; }
            .mf-perm-btn-skip { background: #f4f4f4; color: #555; }
        `;
        document.head.appendChild(style);

        const overlay = document.createElement('div');
        overlay.id = 'mf-perm-overlay';
        overlay.innerHTML = `<div id="mf-perm-card"></div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('mf-show'));
        const card = overlay.querySelector('#mf-perm-card');

        function renderDots() {
            if (stepIndex < 0) return '';
            return `<div class="mf-perm-dots">${pending.map((_, i) =>
                `<span class="${i === stepIndex ? 'mf-active' : ''}"></span>`).join('')}</div>`;
        }

        function renderWelcome() {
            card.innerHTML = `
                <div class="mf-perm-icon">👋</div>
                <p class="mf-perm-title">MediFinder-এ স্বাগতম</p>
                <p class="mf-perm-desc">সবচেয়ে ভালো অভিজ্ঞতার জন্য কিছু পারমিশন দরকার। Allow বা Don't Allow — আপনার ইচ্ছা।</p>
                <button class="mf-perm-btn mf-perm-btn-primary" id="mf-perm-continue">Continue</button>
                <button class="mf-perm-btn mf-perm-btn-skip" id="mf-perm-skip-all">Don't Allow</button>
            `;
            document.getElementById('mf-perm-continue').onclick = () => nextStep();
            document.getElementById('mf-perm-skip-all').onclick = () => finish();
        }

        function renderStep() {
            const step = pending[stepIndex];
            card.innerHTML = `
                ${renderDots()}
                <div class="mf-perm-icon">${step.icon}</div>
                <p class="mf-perm-title">${step.title}</p>
                <p class="mf-perm-desc">${step.desc}</p>
                <button class="mf-perm-btn mf-perm-btn-primary" id="mf-perm-allow">Allow</button>
                <button class="mf-perm-btn mf-perm-btn-skip" id="mf-perm-skip">Don't Allow</button>
            `;
            document.getElementById('mf-perm-allow').onclick = async () => {
                const b = document.getElementById('mf-perm-allow');
                b.textContent = '...'; b.disabled = true;
                try { await step.request(); } catch (e) {}
                nextStep();
            };
            // Don't Allow = browser prompt-i dekhano hobe na, sudhu porer step e jabe
            document.getElementById('mf-perm-skip').onclick = () => nextStep();
        }

        function nextStep() {
            stepIndex++;
            if (stepIndex >= pending.length) return finish();
            renderStep();
        }

        function finish() {
            localStorage.setItem(flagKey, 'done');
            overlay.classList.remove('mf-show');
            setTimeout(() => { overlay.remove(); style.remove(); }, 250);
        }

        renderWelcome();
    }

    // ---- Login detect: page load e + same page e login holeo (poll) ----
    function check() {
        const uid = getLoggedInUserId();
        if (!uid) return false;
        if (localStorage.getItem(FLAG_PREFIX + uid) === 'done') return true; // ei user er kaj shesh
        start(uid);
        return true;
    }

    function init() {
        if (check()) return;
        const t = setInterval(() => { if (check()) clearInterval(t); }, 1500);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    // Manual trigger (jodi kokhono abar dekhate chan): localStorage theke flag muche
    window.MF_resetPermissionWizard = function () {
        const uid = getLoggedInUserId();
        if (uid) localStorage.removeItem(FLAG_PREFIX + uid);
    };
})();
