(() => {
  "use strict";
  const PROFILE_FIELDS = "id,email,full_name,phone,date_of_birth,terms_accepted,terms_accepted_at,avatar_url";
  function create(client, user) {
    if (!client || !user || !user.id || !user.email) throw new Error("Sign in is required to edit your profile.");
    const uid = user.id, email = user.email;
    async function getProfile() {
      const { data, error } = await client.from("profiles").select(PROFILE_FIELDS).eq("email", email).maybeSingle();
      if (error) throw error;
      return data || null;
    }
    async function saveProfile(input) {
      const full_name = String(input.full_name || "").trim().slice(0, 100);
      const phone = String(input.phone || "").replace(/\D/g, "").slice(-10);
      const date_of_birth = String(input.date_of_birth || "").trim();
      if (!full_name) throw new Error("Enter your full name.");
      const dobMatch = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(date_of_birth);
      const dobYear = dobMatch ? Number(dobMatch[1]) : 0;
      const dobMonth = dobMatch ? Number(dobMatch[2]) : 0;
      const dobDay = dobMatch ? Number(dobMatch[3]) : 0;
      const dobDate = dobMatch ? new Date(dobYear, dobMonth - 1, dobDay) : null;
      const validDob = !!dobMatch && dobMonth >= 1 && dobMonth <= 12 && dobDay >= 1 &&
        dobDate.getFullYear() === dobYear && dobDate.getMonth() === dobMonth - 1 && dobDate.getDate() === dobDay;
      const today = new Date(); today.setHours(0,0,0,0);
      if (!validDob || dobDate > today || dobYear < 1900) throw new Error("Enter a valid date of birth.");
      if (input.terms_accepted !== true) throw new Error("Please accept the Terms & Conditions.");
      const { data, error } = await client.from("profiles")
        .update({ full_name, phone, date_of_birth, terms_accepted: true, terms_accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("email", email).select(PROFILE_FIELDS).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Your profile record could not be updated. Please contact support.");
      return data;
    }
    async function uploadAvatar(file) {
      if (!file || !file.type || !/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error("Choose a JPG, PNG, WEBP or GIF image.");
      if (file.size > 5 * 1024 * 1024) throw new Error("Profile image must be 5 MB or smaller.");
      const ext = ({ "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif" })[file.type];
      const path = uid + "/profile-" + Date.now() + "." + ext;
      const { error: uploadError } = await client.storage.from("avatars").upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;
      const { data } = client.storage.from("avatars").getPublicUrl(path);
      const avatar_url = data && data.publicUrl;
      if (!avatar_url) throw new Error("Could not create the profile image URL.");
      const { data: updated, error } = await client.from("profiles").update({ avatar_url, updated_at: new Date().toISOString() })
        .eq("email", email).select(PROFILE_FIELDS).maybeSingle();
      if (error || !updated) {
        try { await client.storage.from("avatars").remove([path]); } catch (_) {}
        throw error || new Error("Profile image could not be linked to your account.");
      }
      return updated;
    }
    return Object.freeze({ getProfile, saveProfile, uploadAvatar });
  }
  window.MFCustomerV2Profile = Object.freeze({ create });
})();
