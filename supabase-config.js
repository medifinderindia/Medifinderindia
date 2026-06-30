// Supabase Configuration
const SUPABASE_URL = "https://rnpbglinkpsikeszcjcl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Ogc4JOrhQXAl9zRTDU0y3g_oGnitfuZ";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let otpInterval;

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
                dynamicPolicyLink.href = "dboyT&C.html";
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
        
        alert(`Failed: Please read and approve the ${roleName}, Terms & Conditions to proceed.`);
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
            const newPassword = prompt("Enter your new secure password:");
            if (newPassword) {
                supabaseClient.auth.updateUser({ password: newPassword }).then(({ error }) => {
                    if (error) alert("Error updating password: " + error.message);
                    else {
                        alert("Password updated successfully! Please log in.");
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
    } catch(e) { console.warn('Role update skipped:', e.message); }
    _roleUpdateInProgress = false;
}

async function redirectUserBasedOnRole(user) {
    // অ্যাডমিন ইমেইল হলে সরাসরি অ্যাডমিন প্যানেলে রিডাইরেক্ট
    if (
        user.email === 'medifinderindia@gmail.com' &&
        localStorage.getItem('admin_auth_in_progress') !== 'true'
    ) {
        window.location.href = "adminuser.html";
        return;
    }

    let role = localStorage.getItem('selected_role') || user.user_metadata?.role || 'user';

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
            alert("Signup Failed: Passwords do not match! Please check your typing.");
            return;
        }

        localStorage.setItem('selected_role', role);

        // ✅ Admin email দিয়ে signup block করো
        const BLOCKED_ADMIN_EMAIL = "medifinderindia@gmail.com";
        if (email === BLOCKED_ADMIN_EMAIL) {
            alert("Signup Failed: This email is not allowed for registration.");
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
            alert("Signup Failed! Reason: " + error.message);
        } else {
            // ডাটাবেস ইনসার্ট লজিক এখানে শুরু হবে
            if (role === 'merchant') {
                const { error: dbError } = await supabaseClient
                    .from('merchants')
                    .insert([
                        { 
                            auth_user_id: data.user.id,
                            email: email,
                            merchant_name: name
                        }
                    ]);
                
                if (dbError) {
                    console.error("Database Insert Error:", dbError);
                } else {
                    console.log("Merchant record created successfully!");
                }
            }
            // ডাটাবেস ইনসার্ট লজিক শেষ
            
            alert("Signup Successful!");
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
            alert("Signup Failed: Please enter Name and Phone number first!");
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
            alert("OTP Send Failed! Reason: " + error.message);
        } else {
            alert("OTP Sent Successfully!");
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
            alert("Resend OTP Failed! Reason: " + error.message);
        } else {
            alert("A new OTP has been sent successfully!");
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
            alert("Please enter a valid OTP code!");
            return;
        }

        // Format phone
        let formattedPhone = phone.trim();
        if (!formattedPhone.startsWith('+')) {
            if (formattedPhone.startsWith('0')) {
                formattedPhone = '+91' + formattedPhone.slice(1);
            } else if (formattedPhone.length === 10) {
                formattedPhone = '+91' + formattedPhone;
            }
        }

        verifySignupOtpBtn.disabled = true;
        verifySignupOtpBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';

        const { data, error } = await supabaseClient.auth.verifyOtp({
            phone: formattedPhone,
            token: token,
            type: 'sms'
        });

        if (error) {
            alert("OTP Verification Failed! Reason: " + error.message);
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
                console.error('Profile save error:', profileErr);
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
            alert("Login Failed: Admin access is restricted. Use the Admin Panel.");
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
            alert("Login Failed! Reason: " + error.message);
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
            } catch(e) { console.error('Profile update error:', e); }

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
            alert("Reset Failed: Please provide an email address.");
            return;
        }

        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname
        });

        if (error) alert("Reset Link Error: " + error.message);
        else {
            alert("Password reset link sent to your email successfully!");
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
            alert("Login Failed: Please select a role first!");
            return;
        }
        localStorage.setItem('selected_role', roleChecked.value);

        if (!phone) {
            alert("Login Failed: Please enter Phone number!");
            return;
        }

        // Format phone to E.164 if not already
        let formattedPhone = phone.trim();
        if (!formattedPhone.startsWith('+')) {
            if (formattedPhone.startsWith('0')) {
                formattedPhone = '+91' + formattedPhone.slice(1);
            } else if (formattedPhone.length === 10) {
                formattedPhone = '+91' + formattedPhone;
            }
        }

        sendOtpBtn.disabled = true;
        sendOtpBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        const { data, error } = await supabaseClient.auth.signInWithOtp({ phone: formattedPhone });

        if (error) {
            alert("Error sending OTP: " + error.message);
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
            alert("Please enter a valid OTP code!");
            return;
        }

        // Format phone
        let formattedPhone = phone.trim();
        if (!formattedPhone.startsWith('+')) {
            if (formattedPhone.startsWith('0')) {
                formattedPhone = '+91' + formattedPhone.slice(1);
            } else if (formattedPhone.length === 10) {
                formattedPhone = '+91' + formattedPhone;
            }
        }

        verifyOtpBtn.disabled = true;
        verifyOtpBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';

        const { data, error } = await supabaseClient.auth.verifyOtp({
            phone: formattedPhone,
            token: token,
            type: 'sms'
        });

        if (error) {
            alert("Verification Failed! Reason: " + error.message);
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
                console.error('Profile save error:', profileErr);
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
    if (error) alert("Google Auth Error: " + error.message);
}

const googleBtn = document.getElementById('google-btn');
if (googleBtn) {
    googleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const roleChecked = document.querySelector('input[name="login-role"]:checked');
        if (!roleChecked) {
            alert("Login Failed: Please select a role first!");
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
            alert("Signup Failed: Please select a role first!");
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
            alert("Please enter your phone number first!");
            return;
        }

        let formattedPhone = phone.trim();
        if (!formattedPhone.startsWith('+')) {
            if (formattedPhone.startsWith('0')) {
                formattedPhone = '+91' + formattedPhone.slice(1);
            } else if (formattedPhone.length === 10) {
                formattedPhone = '+91' + formattedPhone;
            }
        }

        const { error } = await supabaseClient.auth.signInWithOtp({ phone: formattedPhone });
        if (error) {
            alert("Resend OTP Failed! Reason: " + error.message);
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
            alert("Password Verified! Sending OTP to Admin Email...");
            localStorage.setItem('admin_auth_in_progress', 'true');
            
            const { error } = await supabaseClient.auth.signInWithOtp({
                email: ADMIN_EMAIL,
            });

            if (error) {
                alert("Admin Verification Step 1 Failed: " + error.message);
            } else {
                document.getElementById('admin-step-1').classList.add('hidden-section');
                document.getElementById('admin-step-2').classList.remove('hidden-section');
            }
        } else {
            alert("Incorrect Password! Access Denied.");
            if (adminModal) adminModal.style.display = 'none';
        }
    });
}

const adminBtnStep2 = document.getElementById('admin-btn-step-2');
if (adminBtnStep2) {
    adminBtnStep2.addEventListener('click', async () => {
        const emailToken = document.getElementById('admin-email-otp').value;

        if (!emailToken) {
            alert("Verification Failed: Please enter the Email OTP!");
            return;
        }

        const { data, error } = await supabaseClient.auth.verifyOtp({
            email: ADMIN_EMAIL,
            token: emailToken,
            type: 'magiclink'
        });

        if (error) {
            alert("Email OTP Verification Failed: " + error.message);
        } else {
            alert("Email OTP Verified! Now please input the Phone SMS Token code standard.");
            
            await supabaseClient.auth.signOut(); 

            const { error: phoneError } = await supabaseClient.auth.signInWithOtp({
                phone: ADMIN_PHONE
            });

            if (phoneError) {
                alert("Error sending Phone OTP: " + phoneError.message);
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
            alert("Verification Failed: Please enter the Phone OTP!");
            return;
        }

        const { data, error } = await supabaseClient.auth.verifyOtp({
            phone: ADMIN_PHONE,
            token: phoneToken,
            type: 'sms'
        });

        if (error) {
            alert("Phone OTP Verification Failed: " + error.message);
        } else {
            alert("💥 3-Step Verification Complete! Welcome Admin.");
            localStorage.removeItem('admin_auth_in_progress');
            if (adminModal) adminModal.style.display = 'none';
            window.location.href = "adminuser.html";
        }
    });
}