// Supabase Configuration (URL & key loaded from supabase-constants.js)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
                dynamicPolicyLink.href = "merchant-policy.html";
            } else if (selectedRole === 'delivery') {
                dynamicPolicyLink.textContent = "Delivery Partner Policy";
                dynamicPolicyLink.href = "delivery-policy.html";
            } else {
                dynamicPolicyLink.textContent = "User Policy";
                dynamicPolicyLink.href = "user-policy.html";
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
    const isLoginPage = path === "/" || path.includes("index.html") || path.endsWith("/index") || path === "";
    const isSignupPage = path.includes("signup.html") || path.endsWith("/signup");

    if (session && event === 'SIGNED_IN') {
        await handleOAuthUserRoleUpdate(session.user);

        if (event === "PASSWORD_RECOVERY") {
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
                        window.location.href = "index.html";
                    }
                });
            }
            return;
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
            const stillOnProtectedPage = !currentPath.includes("index.html") && !currentPath.includes("signup.html");
            // Only redirect if we're still on a protected page after 2 seconds
            if (stillOnProtectedPage) {
                // Double check session before redirecting
                supabaseClient.auth.getSession().then(({ data: { session: s } }) => {
                    if (!s) {
                        localStorage.removeItem('merchantSessionActive');
                        window.location.href = "index.html";
                    }
                }).catch(() => {});
            }
        }, 2000);
    }
});

let _roleUpdateInProgress = false;
let _lastRoleUpdated = '';
async function handleOAuthUserRoleUpdate(user) {
    const savedRole = localStorage.getItem('selected_role');
    if (!savedRole || _roleUpdateInProgress) return;
    if (user.user_metadata?.role === savedRole || _lastRoleUpdated === savedRole) return;
    _roleUpdateInProgress = true;
    try {
        _lastRoleUpdated = savedRole;
        await supabaseClient.auth.updateUser({ data: { role: savedRole } });
    } catch(e) { 

        _lastRoleUpdated = '';
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
            showToast("Login Failed! Reason: " + error.message, "error");
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login Now';
            }
        } else {
            // Login successful - update profile role if needed
            try {
                const user = data.user;
                if (user) {
                    await supabaseClient.from('profiles').upsert({
                        id: user.id,
                        email: user.email || email,
                        phone: user.phone || '',
                        role: role,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'id', ignoreDuplicates: false });

                    if (role === 'merchant') {
                        await supabaseClient.from('merchants').upsert({
                            auth_user_id: user.id,
                            merchant_name: user.user_metadata?.full_name || user.user_metadata?.name || 'New Merchant',
                            email: user.email || email,
                            status: 'active',
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'auth_user_id' });
                    }
                    if (role === 'delivery') {
                        await supabaseClient.from('riders').upsert({
                            auth_user_id: user.id,
                            name: user.user_metadata?.full_name || user.user_metadata?.name || 'New Rider',
                            email: user.email || email,
                            status: 'offline',
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'auth_user_id' });
                    }
                }
            } catch(e) {}

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
            // OTP Verified - create/update profile and redirect
            try {
                const user = data.user;
                if (user) {
                    // Upsert profile
                    await supabaseClient.from('profiles').upsert({
                        id: user.id,
                        email: user.email || '',
                        phone: formattedPhone,
                        full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
                        role: role,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'id' });

                    // If merchant, upsert merchant record
                    if (role === 'merchant') {
                        await supabaseClient.from('merchants').upsert({
                            auth_user_id: user.id,
                            merchant_name: user.user_metadata?.full_name || 'New Merchant',
                            email: user.email || '',
                            phone: formattedPhone,
                            status: 'active',
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'auth_user_id' });
                    }

                    // If delivery, upsert rider record
                    if (role === 'delivery') {
                        await supabaseClient.from('riders').upsert({
                            auth_user_id: user.id,
                            name: user.user_metadata?.full_name || 'New Rider',
                            phone: formattedPhone,
                            status: 'offline',
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'auth_user_id' });
                    }
                }
            } catch (profileErr) {

            }

            // Store role and redirect
            localStorage.setItem('selected_role', role);
            localStorage.setItem('userPhone', formattedPhone);
            
            verifyOtpBtn.innerHTML = '<i class="fas fa-check-circle"></i> Verified!';

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

async function loginWithGoogle(roleValue) {
    localStorage.setItem('selected_role', roleValue);
    
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + '/index.html'
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
const ADMIN_PHONE = "+919593625498";

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
            showToast("Email OTP Verified! Now please input the Phone SMS Token code standard.", "info");
            
            await supabaseClient.auth.signOut(); 

            const { error: phoneError } = await supabaseClient.auth.signInWithOtp({
                phone: ADMIN_PHONE
            });

            if (phoneError) {
                showToast("Error sending Phone OTP: " + phoneError.message, "error");
            } else {
                document.getElementById('admin-step-2').classList.add('hidden-section');
                document.getElementById('admin-step-3').classList.remove('hidden-section');
            }
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