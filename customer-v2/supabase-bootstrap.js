(() => {
  "use strict";
  if (window.supabaseClient) return;
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    window.MFCustomerV2BootstrapError = "Supabase client library did not load.";
    return;
  }
  if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_KEY === "undefined") {
    window.MFCustomerV2BootstrapError = "MediFinder Supabase configuration is unavailable.";
    return;
  }
  try {
    // Use the same project URL, publishable key and default auth storage key
    // as user.html so the existing signed-in session is shared across pages.
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  } catch (error) {
    window.MFCustomerV2BootstrapError = error && error.message ? error.message : "Could not connect to Supabase.";
  }
})();