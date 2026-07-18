// Supabase Configuration (URL & key loaded from supabase-constants.js)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

let otpInterval;

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
                dynamicPolicyLink.href = "marchentt&c.html";
            } else if (selectedRole === 'delivery') {
                dynamicPolicyLink.textContent = "Delivery Partner Policy";
                dynamicPolicyLink.href = "dboyt&c.html";
            } else {
                dynamicPolicyLink.textContent = "User Policy";
                dynamicPolicyLink.href = "usert&c.html";
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
    const isLoginPage = path.includes("login.html");
    const isSignupPage = path.includes("signup.html") || path.endsWith("/signup");

    // Splash should play again on the next entry after a logout.
    if (event === 'SIGNED_OUT') {
        try { sessionStorage.removeItem('mf_splash_shown'); } catch (e) {}
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
                    window.location.href = "Login.html";
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
        // নতুন sign-in হলেই শুধু role sync/OAuth upsert চালাও — একটা persisted
        // session রিস্টোর হওয়া (INITIAL_SESSION/TOKEN_REFRESHED) মানে নতুন কিছু
        // করার দরকার নেই, শুধু সঠিক পেজে পাঠিয়ে দিলেই যথেষ্ট।
        if (event === 'SIGNED_IN') {
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

        if (isLoginPage || isSignupPage) {
            redirectUserBasedOnRole(session.user);
        }
    } else if (!session && !isLoginPage && !isSignupPage) {
        // Don't immediately redirect - check if session is still loading
        setTimeout(() => {
            const currentPath = window.location.pathname.toLowerCase();
            const stillOnProtectedPage = !currentPath.includes("login.html") && !currentPath.includes("signup.html");
            // Only redirect if we're still on a protected page after 2 seconds
            if (stillOnProtectedPage) {
                // Double check session before redirecting
                supabaseClient.auth.getSession().then(({ data: { session: s } }) => {
                    if (!s) {
                        localStorage.removeItem('merchantSessionActive');
                        window.location.href = "Login.html";
                    }
                }).catch(() => {});
            }
        }, 2000);
    }
});

let _roleUpdateInProgress = false;

// ✅ FIXED: এখন আর existing account এর role জোর করে ওভাররাইট করবে না।
// প্রথমবার (নতুন ইউজার) হলে role সেট হবে, কিন্তু আগে থেকে profiles টেবিলে
// role থাকলে সেটাই আসল/সত্য (source of truth) — mismatch হলে সাইন-আউট করে দেওয়া হবে।
async function handleOAuthUserRoleUpdate(user) {
    if (_roleUpdateInProgress) return;
    const savedRole = localStorage.getItem('selected_role') || 'user';
    _roleUpdateInProgress = true;
    try {
        const { data: existingProfile } = await supabaseClient
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

        const actualRole = existingProfile?.role;

        if (actualRole) {
            // এই একাউন্ট আগে থেকেই একটা নির্দিষ্ট role এ registered
            if (actualRole !== savedRole) {
                await supabaseClient.auth.signOut();
                showToast(`এই একাউন্টটি ইতিমধ্যে "${actualRole}" হিসেবে রেজিস্টার করা আছে। দয়া করে "${actualRole}" রোল সিলেক্ট করে লগইন করুন।`, "error");
                localStorage.removeItem('selected_role');
                throw new Error('role_mismatch');
            }
            return; // role মিলে গেছে, কিছু পাল্টানোর দরকার নেই
        }

        // একদম নতুন ইউজার — প্রথমবার role সেট করা হচ্ছে
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
    } catch (e) {
        _roleUpdateInProgress = false;
        throw e; // caller (onAuthStateChange) কে জানিয়ে দাও যে blocked হয়েছে
    }
    _roleUpdateInProgress = false;
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
        window.location.href = "adminuser.html";
        return;
    }

    let role = user.user_metadata?.role || localStorage.getItem('selected_role') || 'user';

    if (role === 'merchant') {
        localStorage.setItem('merchantSessionActive', 'true');
        window.location.href = 'marchenthome.html';
    } else if (role === 'delivery') {
        window.location.href = 'delyvaryhome.html';
    } else {
        window.location.href = 'userhome.html';
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

        if (password !== confirmPassword) {
            showToast("Signup Failed: Passwords do not match! Please check your typing.", "error");
            return;
        }

        localStorage.setItem('selected_role', role);

        // ✅ Admin email দিয়ে signup block করো
        const BLOCKED_ADMIN_EMAIL = "medifinderindia@gmail.com";
        if (email === BLOCKED_ADMIN_EMAIL) {
            showToast("Signup Failed: This email is not allowed for registration.", "error");
            return;
        }

        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { full_name: name, phone_number: phone, role: role }
            }
        });

        if (error) {
            showToast("Signup Failed! Reason: " + error.message, "error");
        } else {
            // ডাটাবেস ইনসার্ট লজিক এখানে শুরু হবে
            if (data && data.user) {
                try {
                    await supabaseClient.from('profiles').upsert({
                        id: data.user.id,
                        email: email,
                        phone: phone || '',
                        full_name: name,
                        role: role,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'id', ignoreDuplicates: false });
                } catch(e) {}

                if (role === 'merchant') {
                    const { error: dbError } = await supabaseClient
                        .from('merchants')
                        .insert([{ 
                            auth_user_id: data.user.id,
                            email: email,
                            merchant_name: name
                        }]);
                    if (dbError) {}
                }
                if (role === 'delivery') {
                    try {
                        await supabaseClient.from('riders').upsert({
                            auth_user_id: data.user.id,
                            name: name || 'New Rider',
                            phone: phone || '',
                            status: 'offline'
                        }, { onConflict: 'auth_user_id' });
                    } catch(e) {}
                }
            }
            // ডাটাবেস ইনসার্ট লজিক শেষ
            
            showToast("Signup Successful!", "success");
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

        if (!phone || !name) {
            showToast("Signup Failed: Please enter Name and Phone number first!", "error");
            return;
        }

        localStorage.setItem('selected_role', role);

        const { data, error } = await supabaseClient.auth.signInWithOtp({
            phone: phone,
            options: {
                data: { full_name: name, role: role }
            }
        });

        if (error) {
            showToast("OTP Send Failed! Reason: " + error.message, "error");
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
        
        const { error } = await supabaseClient.auth.signInWithOtp({ phone: phone });
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
                }
            } catch (profileErr) {

            }

            localStorage.setItem('selected_role', role);
            localStorage.setItem('userPhone', formattedPhone);
            localStorage.setItem('userName', name);

            verifySignupOtpBtn.innerHTML = '<i class="fas fa-check-circle"></i> Verified!';

            // Redirect based on role
            if (role === 'merchant') {
                window.location.href = 'marchenthome.html';
            } else if (role === 'delivery') {
                window.location.href = 'delyvaryhome.html';
            } else {
                window.location.href = 'userhome.html';
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

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            // ✅ FIXED: email ভুল নাকি password ভুল সেটা আলাদা করে দেখানো হচ্ছে
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
                    showToast("Please enter correct email id!", "error");
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
                    .select('role')
                    .eq('id', user.id)
                    .maybeSingle();

                const actualRole = existingProfile?.role;

                if (actualRole && actualRole !== role) {
                    // ভুল রোল সিলেক্ট করে লগইন করার চেষ্টা — ব্লক করো
                    await supabaseClient.auth.signOut();
                    showToast(`এই একাউন্টটি "${actualRole}" হিসেবে রেজিস্টার করা। দয়া করে "${actualRole}" রোল সিলেক্ট করে আবার লগইন করুন।`, "error");
                    if (loginBtn) {
                        loginBtn.disabled = false;
                        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login Now';
                    }
                    return;
                }

                const finalRole = actualRole || role;

                await supabaseClient.from('profiles').upsert({
                    id: user.id,
                    email: user.email || email,
                    phone: user.phone || '',
                    role: finalRole,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id', ignoreDuplicates: false });

                if (!actualRole && finalRole === 'merchant') {
                    await supabaseClient.from('merchants').upsert({
                        auth_user_id: user.id,
                        merchant_name: user.user_metadata?.full_name || user.user_metadata?.name || 'New Merchant',
                        email: user.email || email,
                        status: 'active',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'auth_user_id' });
                }
                if (!actualRole && finalRole === 'delivery') {
                    await supabaseClient.from('riders').upsert({
                        auth_user_id: user.id,
                        name: user.user_metadata?.full_name || user.user_metadata?.name || 'New Rider',
                        email: user.email || email,
                        status: 'offline',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'auth_user_id' });
                }

                localStorage.setItem('selected_role', finalRole);

                // Redirect based on the ACTUAL (verified) role
                if (finalRole === 'merchant') {
                    window.location.href = 'marchenthome.html';
                } else if (finalRole === 'delivery') {
                    window.location.href = 'delyvaryhome.html';
                } else {
                    window.location.href = 'userhome.html';
                }
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

        const { data, error } = await supabaseClient.auth.signInWithOtp({ phone: formattedPhone });

        if (error) {
            showToast("Error sending OTP: " + error.message, "error");
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
                    .select('role')
                    .eq('id', user.id)
                    .maybeSingle();

                const actualRole = existingProfile?.role;

                if (actualRole && actualRole !== role) {
                    await supabaseClient.auth.signOut();
                    showToast(`এই নাম্বারটি "${actualRole}" হিসেবে রেজিস্টার করা। দয়া করে "${actualRole}" রোল সিলেক্ট করে আবার লগইন করুন।`, "error");
                    verifyOtpBtn.disabled = false;
                    verifyOtpBtn.innerHTML = '<i class="fas fa-check-circle"></i> Verify OTP';
                    return;
                }

                const finalRole = actualRole || role;

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
                    window.location.href = 'marchenthome.html';
                } else if (finalRole === 'delivery') {
                    window.location.href = 'delyvaryhome.html';
                } else {
                    window.location.href = 'userhome.html';
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
    
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + '/Login.html'
        }
    });
    if (error) showToast("Google Auth Error: " + error.message, "error");
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

        const { error } = await supabaseClient.auth.signInWithOtp({ phone: formattedPhone });
        if (error) {
            showToast("Resend OTP Failed! Reason: " + error.message, "error");
        } else {
            loginResendOtp.style.display = 'none';
            startLoginOTPTimer();
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
const ADMIN_SECRET_PASSWORD = "Admin@medifinderindia2026";
const ADMIN_EMAIL = "medifinderindia@gmail.com";
const ADMIN_PHONE = "9593625498";

let logoClickCount = 0;
let logoClickTimeout;

const logoCircle = document.querySelector('.logo-circle');
const adminModal = document.getElementById('admin-modal');
const closeAdminModal = document.getElementById('close-admin-modal');

if (logoCircle) {
    logoCircle.addEventListener('click', () => {
        logoClickCount++;
        clearTimeout(logoClickTimeout);
        logoClickTimeout = setTimeout(() => {
            logoClickCount = 0;
        }, 3000);

        if (logoClickCount === 5) {
            logoClickCount = 0;
            openAdminVerification();
        }
    });
}

function openAdminVerification() {
    if (adminModal) {
        adminModal.style.display = 'flex';
        document.getElementById('admin-step-1').classList.remove('hidden-section');
        document.getElementById('admin-step-2').classList.add('hidden-section');
        document.getElementById('admin-step-3').classList.add('hidden-section');
        
        document.getElementById('admin-password').value = "";
        document.getElementById('admin-email-otp').value = "";
        document.getElementById('admin-phone-otp').value = "";
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

        if (enteredPassword === ADMIN_SECRET_PASSWORD) {
            showToast("Password Verified! Sending OTP to Admin Email...", "info");
            localStorage.setItem('admin_auth_in_progress', 'true');
            
            const { error } = await supabaseClient.auth.signInWithOtp({
                email: ADMIN_EMAIL,
            });

            if (error) {
                showToast("Admin Verification Step 1 Failed: " + error.message, "error");
            } else {
                document.getElementById('admin-step-1').classList.add('hidden-section');
                document.getElementById('admin-step-2').classList.remove('hidden-section');
            }
        } else {
            showToast("Incorrect Password! Access Denied.", "error");
            if (adminModal) adminModal.style.display = 'none';
        }
    });
}

const adminBtnStep2 = document.getElementById('admin-btn-step-2');
if (adminBtnStep2) {
    adminBtnStep2.addEventListener('click', async () => {
        const emailToken = document.getElementById('admin-email-otp').value;

        if (!emailToken) {
            showToast("Verification Failed: Please enter the Email OTP!", "error");
            return;
        }

        const { data, error } = await supabaseClient.auth.verifyOtp({
            email: ADMIN_EMAIL,
            token: emailToken,
            type: 'email'
        });

        if (error) {
            showToast("Email OTP Verification Failed: " + error.message, "error");
        } else {
            showToast("3-Step Verification Complete! Welcome Admin.", "success");
            localStorage.setItem('admin_auth_in_progress', 'true');
            if (adminModal) adminModal.style.display = 'none';
            window.location.href = "adminuser.html";
        }
    });
}

const adminBtnStep3 = document.getElementById('admin-btn-step-3');
if (adminBtnStep3) {
    adminBtnStep3.addEventListener('click', async () => {
        const phoneToken = document.getElementById('admin-phone-otp').value;

        if (!phoneToken) {
            showToast("Verification Failed: Please enter the Phone OTP!", "error");
            return;
        }

        const { data, error } = await supabaseClient.auth.verifyOtp({
            phone: ADMIN_PHONE,
            token: phoneToken,
            type: 'sms'
        });

        if (error) {
            showToast("Phone OTP Verification Failed: " + error.message, "error");
        } else {
            showToast("3-Step Verification Complete! Welcome Admin.", "success");
            if (adminModal) adminModal.style.display = 'none';
            window.location.href = "adminuser.html";
        }
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
    if (!user) return 'Login.html';

    // Admin email always goes to the admin panel (mirrors redirectUserBasedOnRole)
    if (user.email === 'medifinderindia@gmail.com' &&
        localStorage.getItem('admin_auth_in_progress') !== 'true') {
        return 'adminuser.html';
    }

    // The profiles table is the source of truth for role, same as everywhere else in this file.
    let role = user.user_metadata?.role;
    try {
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        if (profile?.role) role = profile.role;
    } catch (e) {
        // fall back silently to metadata/local role below
    }

    role = role || localStorage.getItem('selected_role') || 'user';

    if (role === 'merchant') return 'marchenthome.html';
    if (role === 'delivery') return 'delyvaryhome.html';
    return 'userhome.html';
};