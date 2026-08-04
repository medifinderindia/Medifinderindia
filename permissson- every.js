// ==========================================
// MediFinder — First Time Setup Wizard
// একবার সব দরকারি permission (Notification, Location,
// Camera, Microphone) সেটআপ করে নেয়, পরে আর জিজ্ঞেস করে না।
// শুধু index.html (বা যেখান থেকে ইউজার প্রথম ঢোকে) তে
// <script src="/permission-wizard.js" defer></script> যোগ করলেই হবে।
// ==========================================
(function () {
    const FLAG_KEY = 'mf_permissions_setup';
    const BRAND_RED = '#e02020';

    // ইতিমধ্যে সেটআপ শেষ হলে কিছুই করার দরকার নেই
    if (localStorage.getItem(FLAG_KEY) === 'done') return;

    // লগইন ছাড়া পাবলিক পেজে (যেমন signup.html) দেখানোর দরকার নেই —
    // চাইলে নিচের লাইনে নিজের auth-check বসাতে পারেন
    // if (!window.currentUser) return;

    const STEPS = [
        {
            id: 'notification',
            icon: '🔔',
            title: 'Notification',
            desc: 'অর্ডার আপডেট আর অফার মিস করবেন না',
            request: () => {
                if (!('Notification' in window)) return Promise.resolve('unsupported');
                if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
                return Notification.requestPermission();
            }
        },
        {
            id: 'location',
            icon: '📍',
            title: 'Location',
            desc: 'কাছের ফার্মেসি ও দ্রুত ডেলিভারির জন্য',
            request: () => new Promise((resolve) => {
                if (!('geolocation' in navigator)) return resolve('unsupported');
                navigator.geolocation.getCurrentPosition(
                    () => resolve('granted'),
                    () => resolve('denied'),
                    { timeout: 8000 }
                );
            })
        },
        {
            id: 'camera',
            icon: '📷',
            title: 'Camera',
            desc: 'প্রেসক্রিপশন স্ক্যান ও ছবি আপলোডের জন্য',
            request: () => navigator.mediaDevices && navigator.mediaDevices.getUserMedia
                ? navigator.mediaDevices.getUserMedia({ video: true })
                    .then(stream => { stream.getTracks().forEach(t => t.stop()); return 'granted'; })
                    .catch(() => 'denied')
                : Promise.resolve('unsupported')
        },
        {
            id: 'microphone',
            icon: '🎤',
            title: 'Microphone',
            desc: 'ভয়েস সার্চ ব্যবহারের জন্য',
            request: () => navigator.mediaDevices && navigator.mediaDevices.getUserMedia
                ? navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(stream => { stream.getTracks().forEach(t => t.stop()); return 'granted'; })
                    .catch(() => 'denied')
                : Promise.resolve('unsupported')
        }
    ];

    let stepIndex = -1; // -1 = welcome screen

    const style = document.createElement('style');
    style.textContent = `
        #mf-perm-overlay {
            position: fixed; inset: 0; z-index: 999999;
            background: rgba(20,20,20,.55);
            display: flex; align-items: flex-end; justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            opacity: 0; transition: opacity .25s ease;
        }
        #mf-perm-overlay.mf-show { opacity: 1; }
        #mf-perm-card {
            width: 100%; max-width: 420px;
            background: #fff; border-radius: 20px 20px 0 0;
            padding: 28px 24px 24px; text-align: center;
            transform: translateY(30px); transition: transform .3s ease;
            box-shadow: 0 -8px 30px rgba(0,0,0,.2);
        }
        #mf-perm-overlay.mf-show #mf-perm-card { transform: translateY(0); }
        @media (min-width: 480px) {
            #mf-perm-overlay { align-items: center; }
            #mf-perm-card { border-radius: 20px; }
        }
        .mf-perm-icon { font-size: 44px; line-height: 1; margin-bottom: 14px; }
        .mf-perm-title { font-size: 19px; font-weight: 700; color: #1a1a1a; margin: 0 0 8px; }
        .mf-perm-desc { font-size: 14px; color: #666; margin: 0 0 22px; line-height: 1.5; }
        .mf-perm-dots { display: flex; justify-content: center; gap: 6px; margin-bottom: 18px; }
        .mf-perm-dots span { width: 6px; height: 6px; border-radius: 50%; background: #e5e5e5; }
        .mf-perm-dots span.mf-active { background: ${BRAND_RED}; width: 18px; border-radius: 3px; transition: all .2s; }
        .mf-perm-btn {
            display: block; width: 100%; padding: 14px; border: none; border-radius: 12px;
            font-size: 15px; font-weight: 600; cursor: pointer; margin-bottom: 10px;
        }
        .mf-perm-btn-primary { background: ${BRAND_RED}; color: #fff; }
        .mf-perm-btn-primary:active { opacity: .85; }
        .mf-perm-btn-skip { background: transparent; color: #999; }
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
        return `<div class="mf-perm-dots">${STEPS.map((_, i) =>
            `<span class="${i === stepIndex ? 'mf-active' : ''}"></span>`).join('')}</div>`;
    }

    function renderWelcome() {
        card.innerHTML = `
            <div class="mf-perm-icon">👋</div>
            <p class="mf-perm-title">MediFinder-এ স্বাগতম</p>
            <p class="mf-perm-desc">সবচেয়ে ভালো অভিজ্ঞতার জন্য কিছু পারমিশন দরকার। মাত্র কয়েক সেকেন্ড লাগবে।</p>
            <button class="mf-perm-btn mf-perm-btn-primary" id="mf-perm-continue">Continue</button>
            <button class="mf-perm-btn mf-perm-btn-skip" id="mf-perm-skip-all">এখন না</button>
        `;
        document.getElementById('mf-perm-continue').onclick = () => nextStep();
        document.getElementById('mf-perm-skip-all').onclick = () => finish();
    }

    function renderStep() {
        const step = STEPS[stepIndex];
        card.innerHTML = `
            ${renderDots()}
            <div class="mf-perm-icon">${step.icon}</div>
            <p class="mf-perm-title">${step.title}</p>
            <p class="mf-perm-desc">${step.desc}</p>
            <button class="mf-perm-btn mf-perm-btn-primary" id="mf-perm-allow">Allow</button>
            <button class="mf-perm-btn mf-perm-btn-skip" id="mf-perm-skip">Skip</button>
        `;
        document.getElementById('mf-perm-allow').onclick = async () => {
            document.getElementById('mf-perm-allow').textContent = '...';
            try { await step.request(); } catch (e) {}
            nextStep();
        };
        document.getElementById('mf-perm-skip').onclick = () => nextStep();
    }

    function nextStep() {
        stepIndex++;
        if (stepIndex >= STEPS.length) return finish();
        renderStep();
    }

    function finish() {
        localStorage.setItem(FLAG_KEY, 'done');
        overlay.classList.remove('mf-show');
        setTimeout(() => overlay.remove(), 250);
    }

    renderWelcome();
})();