// Supabase Configuration (URL & key loaded from supabase-constants.js)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

let otpInterval;

// ==========================================
// ⏱️ 20-SECOND TIMEOUT + RETRY HELPER
// ==========================================
// Wraps any Supabase auth call (login / signup) so that if the network is
// slow or the request just hangs, the user sees a clear "timed out, please
// retry" message within 20s instead of a spinner that never ends. Used by
// the login and signup submit handlers below.
function withTimeout(promise, ms = 20000) {
    return Promise.race([
        promise,
        new Promise((resolve) => {
            setTimeout(() => resolve({ data: null, error: { message: '__TIMEOUT__' } }), ms);
        })
    ]);
}

// Resets a submit button back to a clickable "Retry" state after a timeout,
// instead of leaving it permanently disabled/spinning.
function setButtonRetryState(btn, retryLabel) {
    if (!btn) return;
    btn.disabled = false;
    btn.innerHTML = retryLabel;
}

function formatPhoneToE164(phone) {
    let formatted = phone.trim();
    if (!formatted.startsWith('+')) {
        if (formatted.startsWith('0')) {
            formatted = '+91' + formatted.slice(1);
        } else if (formatted.length === 10) {
            formatted = '+91' + formatted;
        }
    }
    return formatted;
}

// ==========================================
// 🔒 ONE EMAIL / ONE PHONE = ONE ROLE (strict) + clean OAuth landing helpers
// ==========================================
// A toast shown right before a redirect/reload is lost. So we park the message in
// sessionStorage and show it once on the next page load (auth.html).
function setAuthNotice(msg, type) {
    try { sessionStorage.setItem('mf_auth_notice', JSON.stringify({ msg: msg, type: type || 'error' })); } catch (e) {}
}
function flushAuthNotice() {
    try {
        const raw = sessionStorage.getItem('mf_auth_notice');
        if (!raw) return;
        sessionStorage.removeItem('mf_auth_notice');
        const n = JSON.parse(raw);
        if (n && n.msg && typeof showToast === 'function') showToast(n.msg, n.type || 'error');
    } catch (e) {}
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(flushAuthNotice, 150));
else setTimeout(flushAuthNotice, 150);

// Full-screen branded cover while we resolve the role after Google returns, so the
// visitor never sees a half-built / blank auth page. (No text-only "Logging in" page.)
function showAuthCover() {
    if (document.getElementById('mf-auth-cover')) return;
    const c = document.createElement('div');
    c.id = 'mf-auth-cover';
    c.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#fff;display:flex;align-items:center;justify-content:center;';
    c.innerHTML = '<div style="width:46px;height:46px;border:4px solid #fde2e2;border-top-color:#e02020;border-radius:50%;animation:mfspin .8s linear infinite"></div>' +
        '<style>@keyframes mfspin{to{transform:rotate(360deg)}}</style>';
    (document.body || document.documentElement).appendChild(c);
}
function hideAuthCover() {
    const c = document.getElementById('mf-auth-cover');
    if (c) c.remove();
}

// Asks the database (SECURITY DEFINER rpc, see role-lock.sql) which role already owns
// this email or phone. Returns the role string, or null if free / rpc not installed yet
// (the DB trigger in role-lock.sql is the hard backstop in that case).
async function getRegisteredRole(email, phone) {
    try {
        const { data, error } = await supabaseClient.rpc('get_registered_role', {
            p_email: (email || '').trim().toLowerCase(),
            p_phone: phone ? formatPhoneToE164(phone) : ''
        });
        if (error) return null;
        return data || null;
    } catch (e) { return null; }
}

// ==========================================
// ডায়নামিক রোল পলিসি লিংক চেঞ্জার লজিক
// ==========================================
const roleRadioButtons = document.querySelectorAll('input[name="signup-role"]');
const dynamicPolicyLink = document.getElementById('dynamic-policy-link');

if (roleRadioButtons && dynamicPolicyLink) {
    roleRadioButtons.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const selectedRole = e.target.value;
            if (selectedRole === 'merchant') {
                dynamicPolicyLink.textContent = "Merchant Policy";
                dynamicPolicyLink.href = "info.html#terms";
            } else if (selectedRole === 'delivery') {
                dynamicPolicyLink.textContent = "Delivery Partner Policy";
                dynamicPolicyLink.href = "info.html#terms";
            } else {
                dynamicPolicyLink.textContent = "User Policy";
                dynamicPolicyLink.href = "info.html#terms";
            }
        });
    });
}

// Helper Function: পলিসি টিক চেক করার জন্য
function checkPolicyAgreement() {
    const policyCheckbox = document.getElementById('policy-agree-checkbox');
    if (policyCheckbox && !policyCheckbox.checked) {
        const currentRole = document.querySelector('input[name="signup-role"]:checked').value;
        let roleName = "User Policy";
        if(currentRole === 'merchant') roleName = "Merchant Policy";
        if(currentRole === 'delivery') roleName = "Delivery Partner Policy";
        
        showToast(`Failed: Please read and approve the ${roleName}, Terms & Conditions to proceed.`, "error");
        return false;
    }
    return true;
}

// ==========================================
// ১. সেশন চেক ও রিডাইরেকশন লজিক (Fixed for Localhost & Netlify)
// ==========================================
// ✅ Fixed: একটাই onAuthStateChange, async করা হয়েছে, else if সঠিক জায়গায়
supabaseClient.auth.onAuthStateChange(async (event, session) => {
    const path = window.location.pathname.toLowerCase();
    // ✅ PUBLIC-HOME ARCHITECTURE: home.html is now the real public landing/shopping
    // page (it does not load this file at all) and auth.html is the login/signup page.
    //   isAuthPage   -> auth.html: a signed-in user is sent on to their role dashboard.
    //   isPublicPage -> auth.html / home.html / index.html (splash): a signed-out
    //                   visitor must NEVER be bounced away from these.
    // Every other page that loads this file is a protected page and sends a
    // signed-out visitor back to the public home.
    const isAuthPage = path.includes("auth.html");
    const isPublicPage = isAuthPage || path.includes("home.html") || /\/(index\.html)?$/.test(path);

    // ✅ GOOGLE OAUTH FIX: when we've just returned from Google (?oauth=google),
    // handleGoogleOAuthCallback() below owns role-resolution + redirect exclusively
    // for that leg. Without this guard, this listener's own SIGNED_IN handling could
    // fire at the same time (a real race — sometimes before, sometimes after the
    // callback's getSession() resolves) and either double-run the role upsert or
    // send the user to two different places. This listener still handles every other
    // sign-in path (email, phone OTP, admin, session restore) exactly as before.
    // Reads window._mfGoogleOAuthPending (set by auth.html's inline script before
    // its own showView() call strips ?oauth=google from the URL) instead of
    // re-parsing window.location.search, which would already be too late here.
    const isGoogleOAuthCallback = window._mfGoogleOAuthPending === true;

    // Splash should play again on the next entry after a logout.
    if (event === 'SIGNED_OUT') {
        try { sessionStorage.removeItem('mf_splash_shown'); } catch (e) {}
        _roleUpdatePromise = null; _roleUpdateUserId = null;
    }

    // ✅ FIXED: PASSWORD_RECOVERY নিজে একটা আলাদা event — আগে এটা "SIGNED_IN" এর
    // ভেতরে বসানো থাকায় কখনোই রান হতো না। এখন আলাদা করে হ্যান্ডেল করা হচ্ছে।
    if (event === "PASSWORD_RECOVERY" && session) {
        const newPassword = await new Promise(resolve => {
            const m = document.createElement('div');
            m.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
            m.innerHTML = `<div style="background:#fff;border-radius:16px;padding:24px;width:90%;max-width:360px;text-align:center;">
                <h3 style="margin:0 0 12px;font-size:1rem;color:#2f3542;">New Password</h3>
                <input type="password" id="_pi" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:0.9rem;margin-bottom:14px;outline:none;" placeholder="Enter your new secure password">
                <div style="display:flex;gap:10px;">
                    <button onclick="this.closest('div[style]').remove()" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-weight:600;">Cancel</button>
                    <button id="_po" style="flex:1;padding:10px;border:none;border-radius:8px;background:#e02020;color:#fff;cursor:pointer;font-weight:600;">OK</button>
                </div>
            </div>`;
            document.body.appendChild(m);
            m.querySelector('#_pi').focus();
            m.querySelector('#_po').onclick = () => { const v = m.querySelector('#_pi').value.trim(); m.remove(); resolve(v || null); };
            m.onclick = (e) => { if (e.target === m) { m.remove(); resolve(null); } };
        });
        if (newPassword) {
            supabaseClient.auth.updateUser({ password: newPassword }).then(({ error }) => {
                if (error) showToast("Error updating password: " + error.message, "error");
                else {
                    showToast("Password updated successfully! Please log in.", "success");
                    supabaseClient.auth.signOut();
                    window.location.href = "auth.html?panel=login";
                }
            });
        }
        return;
    }

    // ✅ FIXED: আগে শুধু event === 'SIGNED_IN' হলে রিডাইরেক্ট হতো। কিন্তু ব্রাউজার/অ্যাপ
    // রিফ্রেশ করলে বা সরাসরি Login.html/signup.html ওপেন করলে Supabase একবার
    // 'INITIAL_SESSION' event পাঠায় (persisted session সহ) — সেটা আগে ইগনোর হতো,
    // ফলে আগে থেকে লগইন থাকা ইউজারও Login পেজেই আটকে থাকতো, মনে হতো বারবার
    // লগইন করতে হচ্ছে। এখন INITIAL_SESSION কেও ধরা হচ্ছে যাতে সাথে সাথে home এ যায়।
    const isSignInLikeEvent = event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED';

    if (session && isSignInLikeEvent) {
        // ✅ GOOGLE OAUTH FIX: bail out here — handleGoogleOAuthCallback() (defined
        // below, near loginWithGoogle) is already running and will call
        // handleOAuthUserRoleUpdate() + redirect itself. See isGoogleOAuthCallback above.
        if (isGoogleOAuthCallback) {
            return;
        }

        // নতুন sign-in হলেই শুধু role sync/OAuth upsert চালাও — একটা persisted
        // session রিস্টোর হওয়া (INITIAL_SESSION/TOKEN_REFRESHED) মানে নতুন কিছু
        // করার দরকার নেই, শুধু সঠিক পেজে পাঠিয়ে দিলেই যথেষ্ট।
        // ✅ ADMIN LOGIN FIX: admin flow-er setSession() ei callback cholar somoy auth lock
        // dhore rakhe. Ekhane await kore onno supabase call (profiles query) korle DEADLOCK hoy —
        // setSession() kokhono resolve hoy na, tai admin.html-e jawa hoy na. Ar role mismatch hole
        // admin session signOut-o hoye jayte pare. Tai admin hole ekhane kono DB call korbo na.
        if (localStorage.getItem('admin_auth_in_progress') === 'true') {
            return;
        }
        const _isAdminSession = session.user.email === "medifinderindia@gmail.com";

        if (event === 'SIGNED_IN' && !_isAdminSession) {
            try {
                await handleOAuthUserRoleUpdate(session.user);
            } catch (e) {
                return; // role mismatch হলে already sign-out + toast হয়ে গেছে, এখানেই থামো
            }
        }

        if (session.user.email === "medifinderindia@gmail.com" && localStorage.getItem('admin_auth_in_progress') === 'true') {
            return;
        }

        if (localStorage.getItem('admin_auth_in_progress') === 'true') {
            return;
        }

        if (isAuthPage) {
            redirectUserBasedOnRole(session.user);
        }
    } else if (!session && !isPublicPage) {
        // Don't immediately redirect - check if session is still loading
        setTimeout(() => {
            const currentPath = window.location.pathname.toLowerCase();
            const stillOnProtectedPage = !(currentPath.includes("auth.html") || currentPath.includes("home.html") || /\/(index\.html)?$/.test(currentPath));
            // Only redirect if we're still on a protected page after 2 seconds
            if (stillOnProtectedPage) {
                // Double check session before redirecting
                supabaseClient.auth.getSession().then(({ data: { session: s } }) => {
                    if (!s) {
                        localStorage.removeItem('merchantSessionActive');
                        window.location.href = "home.html";
                    }
                }).catch(() => {});
            }
        }, 2000);
    }
});

// ==========================================
// 🩺 SERVICE PROVIDER (Nurse / Ambulance Driver / Phlebotomist) HELPERS
// ==========================================
// Service type is chosen once at signup (see auth.html's signup-service-type
// select). It's stashed in localStorage so it survives a Google OAuth
// redirect round-trip, where the signup form/DOM is gone by the time we
// come back.
function getPendingServiceType() {
    if (window.getMediFinderServiceProfile) {
        const t = window.getMediFinderServiceProfile().service_type;
        if (t) return t;
    }
    const select = document.getElementById('signup-service-type');
    if (select && select.value) return select.value;
    return localStorage.getItem('selected_service_type') || '';
}

// EMS Partner destinations. Each EMS service type lands on its own
// dedicated partner app (there is no generic service.html anymore).
const EMS_PARTNER_PAGES = {
    ambulance_driver: 'ambulance-partner.html',
    nurse: 'nurse-patner.html',
    phlebotomist: 'blood-patner.html'
};
function getServiceRedirectTarget(serviceType) {
    const t = serviceType || getPendingServiceType() || localStorage.getItem('selected_service_type') || '';
    // Unknown/missing service type -> the customer app (service.html no longer exists; user.html is also this file's default target)
    return EMS_PARTNER_PAGES[t] || 'user.html';
}

async function upsertServiceProviderProfile(user, serviceType) {
    if (!serviceType) return;
    await supabaseClient.from('profiles').update({
        service_type: serviceType,
        availability: false,
        kyc_status: 'pending',
        updated_at: new Date().toISOString()
    }).eq('id', user.id);
}

// ✅ ONE shared promise per signed-in user. Before, a second caller (splash / listener /
// OAuth callback) hit `if (_roleUpdateInProgress) return;` and was treated as "role OK"
// while the real mismatch check was still running — so a wrong-role Google login could
// slip through to the other role's page. Now every caller awaits the SAME result.
let _roleUpdatePromise = null;
let _roleUpdateUserId = null;
function handleOAuthUserRoleUpdate(user) {
    if (!_roleUpdatePromise || _roleUpdateUserId !== user.id) {
        _roleUpdateUserId = user.id;
        _roleUpdatePromise = _handleOAuthUserRoleUpdateImpl(user);
    }
    return _roleUpdatePromise;
}

async function _handleOAuthUserRoleUpdateImpl(user) {
    const savedRole = localStorage.getItem('selected_role') || 'user';

    const { data: existingProfile } = await supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

    const actualRole = existingProfile?.role;

    // Only a FRESH Google sign-in is checked against the role the visitor picked.
    // supabase-js also fires SIGNED_IN when a tab regains focus / session is re-validated;
    // comparing against a stale localStorage 'selected_role' then signed people out
    // ("have to login again and again"). For an already-logged-in user we just trust the DB role.
    let _fresh = window._mfGoogleOAuthPending === true;
    try { _fresh = _fresh || sessionStorage.getItem('mf_oauth_pending') === '1'; } catch (e) {}

    if (actualRole && !_fresh) {
        localStorage.setItem('selected_role', actualRole);
        return;
    }

    if (actualRole) {
        // This account already belongs to exactly ONE role — profiles.role is the truth.
        if (actualRole !== savedRole) {
            setAuthNotice(`This account is already registered as "${actualRole}". It cannot be used for the "${savedRole}" role. Please log in with the "${actualRole}" role.`, 'error');
            localStorage.removeItem('selected_role');
            await supabaseClient.auth.signOut();
            throw new Error('role_mismatch');
        }
        return; // role matches
    }

    // Brand-new auth user. Make sure this email/phone is not already owned by ANOTHER role
    // (covers the case where Supabase created a separate auth user for the same email).
    const owner = await getRegisteredRole(user.email, user.phone);
    if (owner && owner !== savedRole) {
        setAuthNotice(`This email is already registered as "${owner}". One email can only have one role. Please log in with the "${owner}" role.`, 'error');
        localStorage.removeItem('selected_role');
        await supabaseClient.auth.signOut();
        throw new Error('role_mismatch');
    }

    // First time — set the role once.
    await supabaseClient.auth.updateUser({ data: { role: savedRole } });
    await supabaseClient.from('profiles').upsert({
        id: user.id,
        email: user.email || '',
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
        role: savedRole,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }, { onConflict: 'id' });

    if (savedRole === 'merchant') {
        await supabaseClient.from('merchants').upsert({
            auth_user_id: user.id,
            merchant_name: user.user_metadata?.full_name || user.user_metadata?.name || 'New Merchant',
            email: user.email || '',
            status: 'active'
        }, { onConflict: 'auth_user_id' });
    }
    if (savedRole === 'delivery') {
        await supabaseClient.from('riders').upsert({
            auth_user_id: user.id,
            name: user.user_metadata?.full_name || user.user_metadata?.name || 'New Rider',
            status: 'offline'
        }, { onConflict: 'auth_user_id' });
    }
    if (savedRole === 'service') {
        const serviceType = getPendingServiceType();
        await upsertServiceProviderProfile(user, serviceType);
        localStorage.removeItem('selected_service_type');
    }
}

async function redirectUserBasedOnRole(user) {
    if (localStorage.getItem('admin_auth_in_progress') === 'true') {
        return;
    }

    // অ্যাডমিন ইমেইল হলে সরাসরি অ্যাডমিন প্যানেলে রিডাইরেক্ট
    if (
        user.email === 'medifinderindia@gmail.com' &&
        localStorage.getItem('admin_auth_in_progress') !== 'true'
    ) {
        window.location.href = "admin.html";
        return;
    }

    let role = user.user_metadata?.role || localStorage.getItem('selected_role') || 'user';

    if (role === 'merchant') {
        localStorage.setItem('merchantSessionActive', 'true');
        window.location.href = 'marchent.html';
    } else if (role === 'delivery') {
        window.location.href = 'rider.html';
    } else if (role === 'service') {
        // ✅ SPEED FIX: use the cached service_type first and only hit the
        // network if we genuinely don't have it yet — this extra "select"
        // on every single redirect was the main reason nurse/blood/ambulance
        // partner accounts felt slow compared to merchant/rider.
        let serviceType = localStorage.getItem('selected_service_type') || '';
        if (!serviceType) {
            try {
                const { data: profile } = await supabaseClient
                    .from('profiles')
                    .select('service_type')
                    .eq('id', user.id)
                    .maybeSingle();
                if (profile?.service_type) serviceType = profile.service_type;
            } catch (e) {}
        }
        window.location.href = getServiceRedirectTarget(serviceType);
    } else {
        window.location.href = 'user.html';
    }
}

// ==========================================
// ২. SIGN UP FUNCTIONALITIES & OTP TIMER
// ==========================================
const signupForm = document.getElementById('signup-form');
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // ১. পলিসি এপ্রুভ চেক
        if (!checkPolicyAgreement()) return;
        
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const phone = document.getElementById('signup-phone').value;
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-confirm-password').value;
        const role = document.querySelector('input[name="signup-role"]:checked').value;
        const serviceType = role === 'service' ? getPendingServiceType() : '';

        if (password !== confirmPassword) {
            showToast("Signup Failed: Passwords do not match! Please check your typing.", "error");
            return;
        }

        if (role === 'service' && !serviceType) {
            showToast("Signup Failed: Please select your service (Nurse, Ambulance Driver, or Phlebotomist).", "error");
            return;
        }

        localStorage.setItem('selected_role', role);
        if (serviceType) localStorage.setItem('selected_service_type', serviceType);

        // ✅ Admin email দিয়ে signup block করো
        const BLOCKED_ADMIN_EMAIL = "medifinderindia@gmail.com";
        if (email === BLOCKED_ADMIN_EMAIL) {
            showToast("Signup Failed: This email is not allowed for registration.", "error");
            return;
        }

        const signupBtn = signupForm.querySelector('button[type="submit"]');
        if (signupBtn) {
            signupBtn.disabled = true;
            signupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
        }

        // 🔒 One email / one phone = one role. Stop BEFORE creating anything.
        const _owner = await getRegisteredRole(email, phone);
        if (_owner) {
            showToast(_owner === role
                ? 'This email or phone is already registered. Please log in instead.'
                : `This email or phone is already registered as "${_owner}". One email/phone can only have one role. Please log in with the "${_owner}" role.`, 'error');
            if (signupBtn) {
                signupBtn.disabled = false;
                signupBtn.innerHTML = '<i class="fas fa-user-plus"></i> Sign Up';
            }
            return;
        }

        const { data, error } = await withTimeout(supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { full_name: name, phone_number: phone, role: role }
            }
        }));

        if (error) {
            if (error.message === '__TIMEOUT__') {
                showToast("Signup is taking too long. Please check your connection and tap Retry.", "error");
                setButtonRetryState(signupBtn, '<i class="fas fa-redo"></i> Retry Signup');
                return;
            }
            showToast("Signup Failed! Reason: " + error.message, "error");
            if (signupBtn) {
                signupBtn.disabled = false;
                signupBtn.innerHTML = '<i class="fas fa-user-plus"></i> Sign Up';
            }
        } else if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            // Supabase hides "email already exists" by returning a fake user with no identities.
            // Never write a profile for it.
            showToast('This email is already registered. Please log in with the role you originally signed up with.', 'error');
            if (signupBtn) {
                signupBtn.disabled = false;
                signupBtn.innerHTML = '<i class="fas fa-user-plus"></i> Sign Up';
            }
        } else {
            // ডাটাবেস ইনসার্ট লজিক এখানে শুরু হবে
            if (data && data.user) {
                // ✅ SPEED FIX: profile upsert + role-specific table write don't
                // depend on each other — run them in parallel instead of one
                // after another. Service-role (nurse/blood/ambulance) signups
                // previously waited for profiles → THEN the service update,
                // doubling the wait versus merchant/delivery.
                const writes = [
                    supabaseClient.from('profiles').upsert({
                        id: data.user.id,
                        email: email,
                        phone: phone || '',
                        full_name: name,
                        role: role,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'id', ignoreDuplicates: false }).then(() => {}).catch(() => {})
                ];

                if (role === 'merchant') {
                    writes.push(supabaseClient.from('merchants').insert([{
                        auth_user_id: data.user.id,
                        email: email,
                        merchant_name: name
                    }]).then(() => {}).catch(() => {}));
                }
                if (role === 'delivery') {
                    writes.push(supabaseClient.from('riders').upsert({
                        auth_user_id: data.user.id,
                        name: name || 'New Rider',
                        phone: phone || '',
                        status: 'offline'
                    }, { onConflict: 'auth_user_id' }).then(() => {}).catch(() => {}));
                }
                if (role === 'service') {
                    writes.push(upsertServiceProviderProfile(data.user, serviceType).catch(() => {}));
                    if (serviceType) localStorage.setItem('selected_service_type', serviceType);
                }
                await Promise.all(writes);
            }
            // ডাটাবেস ইনসার্ট লজিক শেষ

            showToast("Signup Successful!", "success");

            // ✅ FIX: আগে এখানে কোনো redirect ছিল না, তাই signup এর পর
            // ইউজার সাইনআপ পেজেই আটকে থাকতো / লগইন পেজে ফেরত যেতে হতো।
            if (data.session) {
                // Email confirmation off (or auto-confirmed) — session is live, send them straight in
                setTimeout(() => redirectUserBasedOnRole(data.user), 700);
            } else {
                // Supabase requires email confirmation before a session exists
                showToast("Please check your email to verify your account, then log in.", "success");
                setTimeout(() => {
                    showView('login');
                    if (signupBtn) {
                        signupBtn.disabled = false;
                        signupBtn.innerHTML = '<i class="fas fa-user-plus"></i> Sign Up';
                    }
                }, 1200);
            }
        }
    });
}

function startOTPTimer() {
    let timeLeft = 60;
    const timerText = document.getElementById('otp-timer-text');
    const countdownDisplay = document.getElementById('countdown-timer');
    const resendLink = document.getElementById('resend-otp-link');

    if(timerText && resendLink && countdownDisplay) {
        timerText.style.display = "block";
        resendLink.style.display = "none";
        countdownDisplay.textContent = timeLeft;

        clearInterval(otpInterval);
        otpInterval = setInterval(() => {
            timeLeft--;
            countdownDisplay.textContent = timeLeft;

            if (timeLeft <= 0) {
                clearInterval(otpInterval);
                timerText.style.display = "none";
                resendLink.style.display = "block";
            }
        }, 1000);
    }
}

const sendSignupOtpBtn = document.getElementById('send-signup-otp-btn');
if (sendSignupOtpBtn) {
    sendSignupOtpBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        // ১. পলিসি এপ্রুভ চেক 
        if (!checkPolicyAgreement()) return;

        const phone = document.getElementById('phone-signup-number').value;
        const name = document.getElementById('otp-name').value;
        const role = document.querySelector('input[name="signup-role"]:checked').value;
        const serviceType = role === 'service' ? getPendingServiceType() : '';

        if (!phone || !name) {
            showToast("Signup Failed: Please enter Name and Phone number first!", "error");
            return;
        }

        if (role === 'service' && !serviceType) {
            showToast("Signup Failed: Please select your service (Nurse, Ambulance Driver, or Phlebotomist).", "error");
            return;
        }

        localStorage.setItem('selected_role', role);
        if (serviceType) localStorage.setItem('selected_service_type', serviceType);

        const _phoneOwner = await getRegisteredRole('', phone);
        if (_phoneOwner) {
            showToast(_phoneOwner === role
                ? 'This phone number is already registered. Please log in instead.'
                : `This phone number is already registered as "${_phoneOwner}". One phone can only have one role. Please log in with the "${_phoneOwner}" role.`, 'error');
            return;
        }

        const _sendLabel = sendSignupOtpBtn.innerHTML;
        sendSignupOtpBtn.disabled = true;
        sendSignupOtpBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        const { data, error } = await withTimeout(supabaseClient.auth.signInWithOtp({
            phone: formatPhoneToE164(phone),
            options: {
                data: { full_name: name, role: role }
            }
        }));

        sendSignupOtpBtn.disabled = false;
        sendSignupOtpBtn.innerHTML = _sendLabel;

        if (error) {
            showToast(error.message === '__TIMEOUT__'
                ? "OTP request timed out. Please check your connection and try again."
                : "OTP Send Failed! Reason: " + error.message, "error");
        } else {
            showToast("OTP Sent Successfully!", "success");
            document.getElementById('signup-otp-wrapper').classList.remove('hidden-section');
            startOTPTimer();
        }
    });
}

const resendOtpLink = document.getElementById('resend-otp-link');
if (resendOtpLink) {
    resendOtpLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const phone = document.getElementById('phone-signup-number').value;
        
        const { error } = await supabaseClient.auth.signInWithOtp({ phone: formatPhoneToE164(phone) });
        if (error) {
            showToast("Resend OTP Failed! Reason: " + error.message, "error");
        } else {
            showToast("A new OTP has been sent successfully!", "success");
            startOTPTimer();
        }
    });
}

const verifySignupOtpBtn = document.getElementById('verify-signup-otp-btn');
if (verifySignupOtpBtn) {
    verifySignupOtpBtn.addEventListener('click', async () => {
        const phone = document.getElementById('phone-signup-number').value;
        const token = document.getElementById('signup-otp-code').value;
        const name = document.getElementById('otp-name')?.value || '';
        const role = document.querySelector('input[name="signup-role"]:checked')?.value || 'user';
        const serviceType = role === 'service' ? getPendingServiceType() : '';

        if (!token || token.length < 4) {
            showToast("Please enter a valid OTP code!", "error");
            return;
        }

        // Format phone
        let formattedPhone = formatPhoneToE164(phone);

        verifySignupOtpBtn.disabled = true;
        verifySignupOtpBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';

        const { data, error } = await supabaseClient.auth.verifyOtp({
            phone: formattedPhone,
            token: token,
            type: 'sms'
        });

        if (error) {
            showToast("OTP Verification Failed! Reason: " + error.message, "error");
            verifySignupOtpBtn.disabled = false;
            verifySignupOtpBtn.innerHTML = '<i class="fas fa-check-circle"></i> Verify & Signup';
        } else {
            // OTP Verified - create profile
            try {
                const user = data.user;
                if (user) {
                    // 🔒 Never overwrite an existing account's role.
                    const { data: _ex } = await supabaseClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
                    if (_ex && _ex.role && _ex.role !== role) {
                        await supabaseClient.auth.signOut();
                        showToast(`This number is already registered as "${_ex.role}". Please log in with the "${_ex.role}" role.`, 'error');
                        verifySignupOtpBtn.disabled = false;
                        verifySignupOtpBtn.innerHTML = '<i class="fas fa-check-circle"></i> Verify & Signup';
                        return;
                    }
                    // Upsert profile with name
                    await supabaseClient.from('profiles').upsert({
                        id: user.id,
                        email: user.email || '',
                        phone: formattedPhone,
                        full_name: name,
                        role: role,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'id' });

                    // Update user metadata
                    await supabaseClient.auth.updateUser({
                        data: { full_name: name, role: role }
                    });

                    // Create role-specific records
                    if (role === 'merchant') {
                        await supabaseClient.from('merchants').upsert({
                            auth_user_id: user.id,
                            merchant_name: name || 'New Merchant',
                            email: user.email || '',
                            phone: formattedPhone,
                            status: 'active'
                        }, { onConflict: 'auth_user_id' });
                    }

                    if (role === 'delivery') {
                        await supabaseClient.from('riders').upsert({
                            auth_user_id: user.id,
                            name: name || 'New Rider',
                            phone: formattedPhone,
                            status: 'offline'
                        }, { onConflict: 'auth_user_id' });
                    }

                    if (role === 'service') {
                        await upsertServiceProviderProfile(user, serviceType);
                    }
                }
            } catch (profileErr) {
                console.warn('[MediFinder] profile write after OTP signup failed:', profileErr);
            }

            localStorage.setItem('selected_role', role);
            localStorage.setItem('userPhone', formattedPhone);
            localStorage.setItem('userName', name);
            localStorage.removeItem('selected_service_type');

            verifySignupOtpBtn.innerHTML = '<i class="fas fa-check-circle"></i> Verified!';

            // Redirect based on role
            if (role === 'merchant') {
                window.location.href = 'marchent.html';
            } else if (role === 'delivery') {
                window.location.href = 'rider.html';
            } else if (role === 'service') {
                window.location.href = getServiceRedirectTarget(serviceType);
            } else {
                window.location.href = 'user.html';
            }
        }
    });
}

// ==========================================
// ৩. LOGIN & FORGOT PASSWORD FUNCTIONALITIES
// ==========================================
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const roleChecked = document.querySelector('input[name="login-role"]:checked');
        const role = roleChecked ? roleChecked.value : 'user';

        if (email === "medifinderindia@gmail.com") {
            showToast("Login Failed: Admin access is restricted. Use the Admin Panel.", "error");
            return;
        }

        localStorage.setItem('selected_role', role);

        const loginBtn = loginForm.querySelector('button[type="submit"]');
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
        }

        const { data, error } = await withTimeout(supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        }));

        if (error) {
            // ✅ Request just timed out (slow/failed network) — never seen for
            // user/merchant/rider before, but was silently hanging for the
            // service-partner roles under load. Show a clear red retry state
            // instead of leaving the button stuck on "Logging in...".
            if (error.message === '__TIMEOUT__') {
                showToast("Login is taking too long. Please check your connection and tap Retry.", "error");
                setButtonRetryState(loginBtn, '<i class="fas fa-redo"></i> Retry Login');
                return;
            }
            // ✅ FIXED: email ভুল নাকি password ভুল সেটা আলাদা করে দেখানো হচ্ছে (red popup)
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showToast("Please enter a valid email id!", "error");
            } else {
                let emailExists = null;
                try {
                    const { data: existsData } = await supabaseClient.rpc('check_email_exists', { p_email: email.trim().toLowerCase() });
                    emailExists = existsData;
                } catch (rpcErr) {
                    emailExists = null; // RPC না থাকলে/ফেইল করলে নিচের fallback ব্যবহার হবে
                }

                if (emailExists === false) {
                    showToast("No account found with this email. Please check and try again, or sign up first.", "error");
                } else if (emailExists === true) {
                    showToast("Incorrect password! Please try again.", "error");
                } else {
                    // RPC না থাকলে Supabase-এর generic মেসেজ দেখাও
                    showToast("Login Failed! Reason: " + error.message, "error");
                }
            }
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login Now';
            }
        } else {
            // ✅ FIXED: আগে আসল role চেক করো, তারপর upsert/redirect করো
            const user = data.user;
            try {
                const { data: existingProfile } = await supabaseClient
                    .from('profiles')
                    .select('role, service_type')
                    .eq('id', user.id)
                    .maybeSingle();

                const actualRole = existingProfile?.role;

                if (actualRole && actualRole !== role) {
                    // ভুল রোল সিলেক্ট করে লগইন করার চেষ্টা — ব্লক করো
                    await supabaseClient.auth.signOut();
                    showToast(`This account is registered as "${actualRole}". Please select the "${actualRole}" role and log in again.`, "error");
                    if (loginBtn) {
                        loginBtn.disabled = false;
                        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login Now';
                    }
                    return;
                }

                const finalRole = actualRole || role;
                const finalServiceType = existingProfile?.service_type || '';

                // ✅ SPEED FIX: these two writes don't depend on each other, so run
                // them together instead of one-after-another. This is exactly the
                // extra sequential round-trip that made service-partner (nurse /
                // ambulance / phlebotomist) logins feel much slower than
                // merchant/rider logins, which never had a second dependent write.
                const profileUpsert = supabaseClient.from('profiles').upsert({
                    id: user.id,
                    email: user.email || email,
                    phone: user.phone || '',
                    role: finalRole,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id', ignoreDuplicates: false });

                const extraWrites = [];
                if (!actualRole && finalRole === 'merchant') {
                    extraWrites.push(supabaseClient.from('merchants').upsert({
                        auth_user_id: user.id,
                        merchant_name: user.user_metadata?.full_name || user.user_metadata?.name || 'New Merchant',
                        email: user.email || email,
                        status: 'active',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'auth_user_id' }));
                }
                if (!actualRole && finalRole === 'delivery') {
                    extraWrites.push(supabaseClient.from('riders').upsert({
                        auth_user_id: user.id,
                        name: user.user_metadata?.full_name || user.user_metadata?.name || 'New Rider',
                        email: user.email || email,
                        status: 'offline',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'auth_user_id' }));
                }
                await Promise.all([profileUpsert, ...extraWrites]);

                localStorage.setItem('selected_role', finalRole);
                // ✅ Cache service_type immediately so the redirect below (and the
                // dashboard page it lands on) never has to re-fetch it — this was
                // the extra round-trip that specifically slowed down nurse/blood/
                // ambulance-partner logins compared to merchant/rider.
                if (finalServiceType) localStorage.setItem('selected_service_type', finalServiceType);

                // ✅ Green success popup, exactly like a wrong password shows red.
                showToast("Login successful! Redirecting...", "success");

                // Redirect based on the ACTUAL (verified) role
                setTimeout(() => {
                    if (finalRole === 'merchant') {
                        window.location.href = 'marchent.html';
                    } else if (finalRole === 'delivery') {
                        window.location.href = 'rider.html';
                    } else if (finalRole === 'service') {
                        window.location.href = getServiceRedirectTarget(finalServiceType);
                    } else {
                        window.location.href = 'user.html';
                    }
                }, 500);
            } catch (e) {
                showToast("Login error while verifying role. Please try again.", "error");
                if (loginBtn) {
                    loginBtn.disabled = false;
                    loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login Now';
                }
            }
        }
    });
}

const forgotLink = document.getElementById('forgot-password-link');
const forgotModal = document.getElementById('forgot-modal');
const closeForgotModal = document.getElementById('close-forgot-modal');

if (forgotLink && forgotModal) {
    forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        forgotModal.style.display = 'flex';
    });
}
if (closeForgotModal && forgotModal) {
    closeForgotModal.addEventListener('click', () => {
        forgotModal.style.display = 'none';
    });
}

const sendResetLinkBtn = document.getElementById('send-reset-link-btn');
if (sendResetLinkBtn) {
    sendResetLinkBtn.addEventListener('click', async () => {
        const email = document.getElementById('reset-email').value;
        if (!email) {
            showToast("Reset Failed: Please provide an email address.", "error");
            return;
        }

        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname
        });

        if (error) showToast("Reset Link Error: " + error.message, "error");
        else {
            showToast("Password reset link sent to your email successfully!", "success");
            forgotModal.style.display = 'none';
        }
    });
}

const sendOtpBtn = document.getElementById('send-otp-btn');
if (sendOtpBtn) {
    sendOtpBtn.addEventListener('click', async () => {
        const phone = document.getElementById('phone-number').value;
        
        const roleChecked = document.querySelector('input[name="login-role"]:checked');
        if (!roleChecked) {
            showToast("Login Failed: Please select a role first!", "error");
            return;
        }
        localStorage.setItem('selected_role', roleChecked.value);

        if (!phone) {
            showToast("Login Failed: Please enter Phone number!", "error");
            return;
        }

        // Format phone to E.164 if not already
        let formattedPhone = formatPhoneToE164(phone);

        sendOtpBtn.disabled = true;
        sendOtpBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        // 🔒 Login must only work for an existing number under the SAME role.
        const _loginOwner = await getRegisteredRole('', formattedPhone);
        const _pickedRole = roleChecked.value;
        if (_loginOwner && _loginOwner !== _pickedRole) {
            showToast(`This number is registered as "${_loginOwner}". Please select the "${_loginOwner}" role to log in.`, "error");
            sendOtpBtn.disabled = false;
            sendOtpBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send OTP';
            return;
        }

        // shouldCreateUser:false -> an unknown number can NOT silently create a new account from the login screen
        const { data, error } = await withTimeout(supabaseClient.auth.signInWithOtp({
            phone: formattedPhone,
            options: { shouldCreateUser: false }
        }));

        if (error) {
            let msg = "Error sending OTP: " + error.message;
            if (error.message === '__TIMEOUT__') msg = "OTP request timed out. Please check your connection and try again.";
            else if (/signups? not allowed|not found|user.*not/i.test(error.message)) msg = "No account found with this phone number. Please sign up first.";
            showToast(msg, "error");
            sendOtpBtn.disabled = false;
            sendOtpBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send OTP';
        } else {
            if (data) {
            document.getElementById('otp-input-wrapper').classList.remove('hidden-section');
            const timerEl = document.getElementById('login-otp-timer');
            if (timerEl) timerEl.style.display = 'block';
            sendOtpBtn.innerHTML = '<i class="fas fa-check"></i> OTP Sent!';
            startLoginOTPTimer();
        }
        }
    });
}

let loginOtpInterval;
function startLoginOTPTimer() {
    const timerText = document.getElementById('login-otp-timer');
    const resendLink = document.getElementById('login-resend-otp');
    const sendBtn = document.getElementById('send-otp-btn');
    if (!timerText) return;
    
    let seconds = 30;
    timerText.textContent = `Resend OTP in ${seconds}s`;
    if (resendLink) resendLink.style.display = 'none';
    if (sendBtn) sendBtn.style.display = 'none';
    
    clearInterval(loginOtpInterval);
    loginOtpInterval = setInterval(() => {
        seconds--;
        if (timerText) timerText.textContent = `Resend OTP in ${seconds}s`;
        if (seconds <= 0) {
            clearInterval(loginOtpInterval);
            if (timerText) timerText.textContent = '';
            if (resendLink) resendLink.style.display = 'inline';
            if (sendBtn) {
                sendBtn.style.display = 'inline-flex';
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send OTP';
            }
        }
    }, 1000);
}

const verifyOtpBtn = document.getElementById('verify-otp-btn');
if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener('click', async () => {
        const phone = document.getElementById('phone-number').value;
        const token = document.getElementById('otp-code').value;
        const role = localStorage.getItem('selected_role') || 'user';

        if (!token || token.length < 4) {
            showToast("Please enter a valid OTP code!", "error");
            return;
        }

        // Format phone
        let formattedPhone = formatPhoneToE164(phone);

        verifyOtpBtn.disabled = true;
        verifyOtpBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';

        const { data, error } = await supabaseClient.auth.verifyOtp({
            phone: formattedPhone,
            token: token,
            type: 'sms'
        });

        if (error) {
            showToast("Verification Failed! Reason: " + error.message, "error");
            verifyOtpBtn.disabled = false;
            verifyOtpBtn.innerHTML = '<i class="fas fa-check-circle"></i> Verify OTP';
        } else {
            // ✅ FIXED: OTP Verified — আগে আসল role চেক করো, তারপর upsert/redirect
            const user = data.user;
            try {
                const { data: existingProfile } = await supabaseClient
                    .from('profiles')
                    .select('role, service_type')
                    .eq('id', user.id)
                    .maybeSingle();

                const actualRole = existingProfile?.role;

                if (actualRole && actualRole !== role) {
                    await supabaseClient.auth.signOut();
                    showToast(`This number is registered as "${actualRole}". Please select the "${actualRole}" role and log in again.`, "error");
                    verifyOtpBtn.disabled = false;
                    verifyOtpBtn.innerHTML = '<i class="fas fa-check-circle"></i> Verify OTP';
                    return;
                }

                const finalRole = actualRole || role;
                const finalServiceType = existingProfile?.service_type || '';

                await supabaseClient.from('profiles').upsert({
                    id: user.id,
                    email: user.email || '',
                    phone: formattedPhone,
                    full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
                    role: finalRole,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' });

                if (!actualRole && finalRole === 'merchant') {
                    await supabaseClient.from('merchants').upsert({
                        auth_user_id: user.id,
                        merchant_name: user.user_metadata?.full_name || 'New Merchant',
                        email: user.email || '',
                        phone: formattedPhone,
                        status: 'active',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'auth_user_id' });
                }
                if (!actualRole && finalRole === 'delivery') {
                    await supabaseClient.from('riders').upsert({
                        auth_user_id: user.id,
                        name: user.user_metadata?.full_name || 'New Rider',
                        phone: formattedPhone,
                        status: 'offline',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'auth_user_id' });
                }

                localStorage.setItem('selected_role', finalRole);
                localStorage.setItem('userPhone', formattedPhone);

                verifyOtpBtn.innerHTML = '<i class="fas fa-check-circle"></i> Verified!';

                if (finalRole === 'merchant') {
                    window.location.href = 'marchent.html';
                } else if (finalRole === 'delivery') {
                    window.location.href = 'rider.html';
                } else if (finalRole === 'service') {
                    window.location.href = getServiceRedirectTarget(finalServiceType);
                } else {
                    window.location.href = 'user.html';
                }
            } catch (profileErr) {
                showToast("Login error while verifying role. Please try again.", "error");
                verifyOtpBtn.disabled = false;
                verifyOtpBtn.innerHTML = '<i class="fas fa-check-circle"></i> Verify OTP';
            }
        }
    });
}

async function loginWithGoogle(roleValue) {
    localStorage.setItem('selected_role', roleValue);
    // Marks "a Google round-trip is in flight" so ANY page we land on afterwards
    // (auth.html OR the splash, if Supabase falls back to the Site URL) resolves
    // role + mismatch BEFORE showing anything.
    try { sessionStorage.setItem('mf_oauth_pending', '1'); } catch (e) {}

    // ✅ GOOGLE OAUTH FIX: redirectTo now carries ?oauth=google so that, once Google
    // sends the browser back here, handleGoogleOAuthCallback() below can reliably
    // detect "we just came back from Google" and take over the redirect — instead of
    // silently depending on onAuthStateChange timing, which is what left users stuck
    // on auth.html.
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + '/auth.html?oauth=google'
        }
    });
    if (error) showToast("Google Auth Error: " + error.message, "error");
}

// ==========================================
// ✅ GOOGLE OAUTH CALLBACK — reliable fallback redirect
// ==========================================
// Runs only when window._mfGoogleOAuthPending is true (i.e. we've just landed
// back on auth.html after Google finished authenticating — see auth.html's
// inline script, which captures this before it rewrites the URL and erases
// the original ?oauth=google param). Independently calls getSession() and
// drives the redirect itself, so the dashboard redirect no longer depends on
// exactly when/whether onAuthStateChange's SIGNED_IN event fires relative to
// this script running.
async function handleGoogleOAuthCallback() {
    console.log('[MediFinder] Google OAuth callback detected');
    showAuthCover();

    // getSession() can occasionally run a beat before supabase-js finishes
    // parsing the auth params Google appended to the URL, so retry briefly
    // instead of giving up on a single null.
    let session = null;
    for (let attempt = 0; attempt < 10 && !session; attempt++) {
        const { data } = await supabaseClient.auth.getSession();
        session = data && data.session ? data.session : null;
        if (!session) await new Promise(resolve => setTimeout(resolve, 150));
    }

    console.log('[MediFinder] Google session:', session ? '(present)' : '(none)');

    if (!session || !session.user) {
        // No session ever materialized — leave the user on auth.html rather
        // than guessing where to send them.
        try { sessionStorage.removeItem('mf_oauth_pending'); } catch (e) {}
        hideAuthCover();
        return;
    }

    try { sessionStorage.removeItem('mf_oauth_pending'); } catch (e) {}
    const user = session.user;

    // Admin email always goes straight to the admin panel, same as every
    // other login path in this file.
    if (user.email === "medifinderindia@gmail.com") {
        console.log('[MediFinder] Redirecting to: admin.html');
        window.location.replace("admin.html");
        return;
    }

    // Same new-account provisioning / existing-role protection used by the
    // normal onAuthStateChange flow. It's guarded by _roleUpdateInProgress,
    // so this is safe to call here even if something else triggers it too.
    try {
        await handleOAuthUserRoleUpdate(user);
    } catch (e) {
        // Role mismatch: handleOAuthUserRoleUpdate() already signed the user
        // out and showed the toast — just land back on a clean login panel.
        // (notice is parked in sessionStorage and shown on the fresh auth page)
        window.location.replace("auth.html?panel=login");
        return;
    }

    // Resolve role with the required priority: profiles.role (DB) →
    // user.user_metadata.role → localStorage.selected_role → 'user'.
    let role = null;
    let serviceType = null;
    try {
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('role, service_type')
            .eq('id', user.id)
            .maybeSingle();
        role = profile && profile.role ? profile.role : null;
        serviceType = profile && profile.service_type ? profile.service_type : null;
    } catch (e) {
        // fall through to metadata/localStorage below
    }
    role = role || user.user_metadata?.role || localStorage.getItem('selected_role') || 'user';
    localStorage.setItem('selected_role', role);

    console.log('[MediFinder] Resolved role:', role);

    let target = 'user.html';
    if (role === 'merchant') {
        localStorage.setItem('merchantSessionActive', 'true');
        target = 'marchent.html';
    } else if (role === 'delivery') {
        target = 'rider.html';
    } else if (role === 'service') {
        target = getServiceRedirectTarget(serviceType || localStorage.getItem('selected_service_type') || '');
    }

    console.log('[MediFinder] Redirecting to:', target);
    window.location.replace(target);
}

if (window._mfGoogleOAuthPending === true) {
    handleGoogleOAuthCallback();
}

const googleBtn = document.getElementById('google-btn');
if (googleBtn) {
    googleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const roleChecked = document.querySelector('input[name="login-role"]:checked');
        if (!roleChecked) {
            showToast("Login Failed: Please select a role first!", "error");
            return;
        }
        loginWithGoogle(roleChecked.value);
    });
}

const googleSignupBtn = document.getElementById('google-signup-btn');
if (googleSignupBtn) {
    googleSignupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const roleChecked = document.querySelector('input[name="signup-role"]:checked');
        if (!roleChecked) {
            showToast("Signup Failed: Please select a role first!", "error");
            return;
        }
        if (roleChecked.value === 'service') {
            const serviceType = getPendingServiceType();
            if (!serviceType) {
                showToast("Signup Failed: Please select your service (Nurse, Ambulance Driver, or Phlebotomist).", "error");
                return;
            }
            localStorage.setItem('selected_service_type', serviceType);
        }
        loginWithGoogle(roleChecked.value);
    });
}

const phoneAuthToggle = document.getElementById('phone-auth-toggle');
if (phoneAuthToggle) {
    phoneAuthToggle.addEventListener('click', () => {
        document.getElementById('phone-section').classList.toggle('hidden-section');
    });
}

// Login Resend OTP
const loginResendOtp = document.getElementById('login-resend-otp');
if (loginResendOtp) {
    loginResendOtp.addEventListener('click', async (e) => {
        e.preventDefault();
        const phone = document.getElementById('phone-number').value;
        if (!phone) {
            showToast("Please enter your phone number first!", "error");
            return;
        }

        let formattedPhone = formatPhoneToE164(phone);

        const { error } = await supabaseClient.auth.signInWithOtp({ phone: formattedPhone, options: { shouldCreateUser: false } });
        if (error) {
            showToast("Resend OTP Failed! Reason: " + error.message, "error");
        } else {
            loginResendOtp.style.display = 'none';
            startLoginOTPTimer();
        }
    });
}

// ==========================================
// 🎟️ REFERRAL CODE VERIFICATION (was missing — button had no handler at all)
// ==========================================
// Expects a Postgres function `verify_referral_code(p_code text)` in Supabase
// that returns true/false (or a row) for a valid, unused code. Create it once
// in the SQL editor, e.g.:
//   create or replace function verify_referral_code(p_code text)
//   returns boolean language sql as $$
//     select exists(select 1 from referral_codes where code = p_code and used = false)
//   $$;
// If your table/function name differs, just change 'verify_referral_code'
// and the p_code param name below to match.
const verifyReferralBtn = document.getElementById('verify-referral-btn');
const referralInput = document.getElementById('referral-code');
const referralMsg = document.getElementById('referral-msg');

if (verifyReferralBtn && referralInput) {
    verifyReferralBtn.addEventListener('click', async () => {
        const code = referralInput.value.trim();
        if (!code) {
            if (referralMsg) { referralMsg.textContent = 'Please enter a referral code first.'; referralMsg.style.color = '#e02020'; }
            return;
        }

        verifyReferralBtn.disabled = true;
        const originalLabel = verifyReferralBtn.textContent;
        verifyReferralBtn.textContent = '...';

        try {
            const { data, error } = await withTimeout(
                supabaseClient.rpc('verify_referral_code', { p_code: code }), 15000
            );

            if (error && error.message === '__TIMEOUT__') {
                if (referralMsg) { referralMsg.textContent = 'Verification timed out — tap Verify to retry.'; referralMsg.style.color = '#e02020'; }
            } else if (error) {
                if (referralMsg) { referralMsg.textContent = 'Could not verify code right now. Please try again.'; referralMsg.style.color = '#e02020'; }
            } else if (data === true || data === 'valid') {
                localStorage.setItem('applied_referral_code', code);
                if (referralMsg) { referralMsg.textContent = '✔ Referral code applied!'; referralMsg.style.color = '#2ed573'; }
                showToast("Referral code verified successfully!", "success");
            } else {
                localStorage.removeItem('applied_referral_code');
                if (referralMsg) { referralMsg.textContent = '✘ Invalid or already-used referral code.'; referralMsg.style.color = '#e02020'; }
                showToast("Invalid referral code.", "error");
            }
        } catch (e) {
            if (referralMsg) { referralMsg.textContent = 'Could not verify code right now. Please try again.'; referralMsg.style.color = '#e02020'; }
        } finally {
            verifyReferralBtn.disabled = false;
            verifyReferralBtn.textContent = originalLabel;
        }
    });
}

const phoneSignupToggle = document.getElementById('phone-signup-toggle');
if (phoneSignupToggle) {
    phoneSignupToggle.addEventListener('click', () => {
        document.getElementById('phone-signup-section').classList.toggle('hidden-section');
    });
}

// ==========================================
// 🥷 6. SECRET ADMIN SYSTEM (Fixed Authentication Flow)
// ==========================================
const ADMIN_TAPS_REQUIRED = 4;      // logo tap koto bar korle admin modal khulbe
const ADMIN_TAP_WINDOW_MS = 3000;   // ei somoyer moddhe tap korte hobe

let logoClickCount = 0;
let logoClickTimeout;
const ADMIN_REDIRECT_MAX_MS = 20000; // finalize-er por max 20 sec-er moddhe admin.html-e jabei
let adminPhoneTicket = null; // server-encrypted ticket (email OTP verified, phone number pending)

const adminModal = document.getElementById('admin-modal');
const closeAdminModal = document.getElementById('close-admin-modal');

// Admin password / email / phone ar client-e nei. Sob kichu 'admin-auth'
// edge function-e (server secrets) verify hoy.
async function callAdminAuth(action, payload = {}) {
    try {
        const { data, error } = await supabaseClient.functions.invoke('admin-auth', {
            body: { action, ...payload }
        });
        if (error) {
            let message = error.message || 'Request failed';
            try {
                if (error.context && typeof error.context.json === 'function') {
                    const body = await error.context.json();
                    if (body && body.error) message = body.error;
                }
            } catch (e) { /* ignore parse errors */ }
            return { data: null, error: { message } };
        }
        if (data && data.error) return { data: null, error: { message: data.error } };
        return { data, error: null };
    } catch (e) {
        return { data: null, error: { message: e.message || 'Network error' } };
    }
}

function handleAdminLogoTap() {
    logoClickCount++;
    clearTimeout(logoClickTimeout);
    logoClickTimeout = setTimeout(() => { logoClickCount = 0; }, ADMIN_TAP_WINDOW_MS);

    if (logoClickCount >= ADMIN_TAPS_REQUIRED) {
        logoClickCount = 0;
        openAdminVerification();
    }
}

// Home header logo + login/signup logo circle — sobgulote kaj korbe
document.querySelectorAll('.mf-brand-logo, .logo-circle').forEach((el) => {
    el.addEventListener('click', handleAdminLogoTap);
});

function openAdminVerification() {
    if (adminModal) {
        adminModal.style.display = 'flex';
        document.getElementById('admin-step-1').classList.remove('hidden-section');
        document.getElementById('admin-step-2').classList.add('hidden-section');
        document.getElementById('admin-step-3').classList.add('hidden-section');

        document.getElementById('admin-password').value = "";
        document.getElementById('admin-email-otp').value = "";
        document.getElementById('admin-phone-otp').value = "";
        const _fo = document.getElementById('admin-fixed-otp'); if (_fo) _fo.value = "";
    }
}

if (closeAdminModal) {
    closeAdminModal.addEventListener('click', () => {
        if (adminModal) adminModal.style.display = 'none';
        localStorage.removeItem('admin_auth_in_progress');
    });
}

const adminBtnStep1 = document.getElementById('admin-btn-step-1');
if (adminBtnStep1) {
    adminBtnStep1.addEventListener('click', async () => {
        const enteredPassword = document.getElementById('admin-password').value;
        if (!enteredPassword) {
            showToast("Please enter the admin password.", "error");
            return;
        }

        adminBtnStep1.disabled = true;
        showToast("Verifying password...", "info");

        // Edge function password check kore, thik hole admin email-e OTP pathay
        const { error } = await callAdminAuth('verify-password', { password: enteredPassword });
        adminBtnStep1.disabled = false;

        if (error) {
            showToast("Access Denied: " + error.message, "error");
            if (adminModal) adminModal.style.display = 'none';
            document.getElementById('admin-password').value = "";
        } else {
            showToast("Password Verified! OTP sent to Admin Email.", "info");
            localStorage.setItem('admin_auth_in_progress', 'true');
            document.getElementById('admin-password').value = "";
            document.getElementById('admin-step-1').classList.add('hidden-section');
            document.getElementById('admin-step-2').classList.remove('hidden-section');
        }
    });
}

// Session pawar por: client-e set kore admin.html-e pathai
async function finishAdminLogin(session) {
    // ✅ ADMIN LOGIN FIX: flag age set, ar 20s fallback redirect setSession-er AGEI arm kora hocche —
    // agey fallback setSession-er pore chilo, tai setSession hang korle fallback kokhono arm-i hoto na.
    localStorage.setItem('admin_auth_in_progress', 'true'); // admin.js load hole clear kore dey
    const fallbackRedirect = setTimeout(() => window.location.replace("admin.html"), ADMIN_REDIRECT_MAX_MS);

    // setSession session-ta localStorage-e age save kore, tarpor listener-der khabor dey.
    // Tai jodi 6s-er moddhe return na kore, tobuo session save hoye gechhe — redirect kora safe.
    const result = await Promise.race([
        supabaseClient.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token
        }),
        new Promise((resolve) => setTimeout(() => resolve({ error: null, timedOut: true }), 6000))
    ]);

    if (result && result.error) {
        clearTimeout(fallbackRedirect);
        localStorage.removeItem('admin_auth_in_progress');
        showToast("Session setup failed: " + result.error.message, "error");
        return;
    }

    adminPhoneTicket = null;
    showToast("Verification Complete! Welcome Admin.", "success");
    if (adminModal) adminModal.style.display = 'none';
    window.location.href = "admin.html";
}

const adminBtnStep2 = document.getElementById('admin-btn-step-2');
if (adminBtnStep2) {
    adminBtnStep2.addEventListener('click', async () => {
        const emailToken = document.getElementById('admin-email-otp').value.trim();

        if (!emailToken) {
            showToast("Verification Failed: Please enter the Email OTP!", "error");
            return;
        }

        adminBtnStep2.disabled = true;
        const { data, error } = await callAdminAuth('verify-email-otp', { token: emailToken });
        adminBtnStep2.disabled = false;

        if (error) {
            showToast("Email OTP Verification Failed: " + error.message, "error");
            return;
        }

        // Admin phone configured thakle admin ke nijer phone number type korte hobe (SMS OTP nei)
        if (data.needPhone) {
            adminPhoneTicket = data.ticket;
            const desc = document.querySelector('#admin-step-3 .step-desc');
            if (desc) desc.textContent = "Step 3: Enter Admin Phone Number & OTP";
            const otpInput = document.getElementById('admin-fixed-otp');
            if (otpInput) otpInput.value = "";
            const phoneInput = document.getElementById('admin-phone-otp');
            if (phoneInput) {
                phoneInput.value = "";
                phoneInput.placeholder = "Admin phone number";
                phoneInput.type = "tel";
                phoneInput.inputMode = "tel";
                phoneInput.removeAttribute('maxlength');
            }
            document.getElementById('admin-email-otp').value = "";
            document.getElementById('admin-step-2').classList.add('hidden-section');
            document.getElementById('admin-step-3').classList.remove('hidden-section');
            showToast("Email verified! Now enter Admin Phone Number and OTP.", "info");
            return;
        }

        await finishAdminLogin(data.session);
    });
}

const adminBtnStep3 = document.getElementById('admin-btn-step-3');
if (adminBtnStep3) {
    adminBtnStep3.addEventListener('click', async () => {
        const phoneNumber = document.getElementById('admin-phone-otp').value.trim();

        if (!phoneNumber) {
            showToast("Verification Failed: Please enter the Phone Number!", "error");
            return;
        }
        const enteredOtp = (document.getElementById('admin-fixed-otp')?.value || '').trim();
        if (!enteredOtp) {
            showToast("Verification Failed: Please enter the OTP!", "error");
            return;
        }
        if (!adminPhoneTicket) {
            showToast("Session expired. Please start again.", "error");
            openAdminVerification();
            return;
        }

        adminBtnStep3.disabled = true;
        const { data, error } = await callAdminAuth('verify-phone', { phone: phoneNumber, ticket: adminPhoneTicket, code: enteredOtp });
        adminBtnStep3.disabled = false;

        if (error) {
            showToast("Phone Verification Failed: " + error.message, "error");
            return;
        }

        await finishAdminLogin(data.session);
    });
}

// ==========================================
// 🚀 7. SPLASH SCREEN SUPPORT (Extension — additive only)
// ==========================================
// Nothing above this block is modified. This simply exposes the already-
// created client plus a single-source-of-truth role → destination resolver
// so splash.js can decide where to send an already-logged-in user without
// duplicating (and risking drifting from) the role logic above.
window.supabaseClient = supabaseClient;

window.getRedirectPathForUser = async function (user) {
    if (!user) return 'home.html';

    // Admin email always goes to the admin panel (mirrors redirectUserBasedOnRole)
    if (user.email === 'medifinderindia@gmail.com' &&
        localStorage.getItem('admin_auth_in_progress') !== 'true') {
        return 'admin.html';
    }

    // Coming back from Google onto THIS page (e.g. Supabase used the Site URL instead of
    // auth.html?oauth=google)? Then do the exact same first-time/mismatch check first,
    // and never route a wrong-role Google login into the other role's dashboard.
    let _oauthPending = false;
    try { _oauthPending = sessionStorage.getItem('mf_oauth_pending') === '1'; } catch (e) {}
    if (_oauthPending) {
        try {
            await handleOAuthUserRoleUpdate(user);
        } catch (e) {
            try { sessionStorage.removeItem('mf_oauth_pending'); } catch (e2) {}
            return 'auth.html?panel=login';
        }
        try { sessionStorage.removeItem('mf_oauth_pending'); } catch (e) {}
    }

    // The profiles table is the source of truth for role, same as everywhere else in this file.
    let role = user.user_metadata?.role;
    let serviceType = '';
    try {
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('role, service_type')
            .eq('id', user.id)
            .maybeSingle();
        if (profile?.role) role = profile.role;
        if (profile?.service_type) serviceType = profile.service_type;
    } catch (e) {
        // fall back silently to metadata/local role below
    }

    role = role || localStorage.getItem('selected_role') || 'user';

    if (role === 'merchant') return 'marchent.html';
    if (role === 'delivery') return 'rider.html';
    if (role === 'service') return getServiceRedirectTarget(serviceType || localStorage.getItem('selected_service_type') || '');
    return 'user.html';
};