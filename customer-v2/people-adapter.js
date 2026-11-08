(() => {
  "use strict";

  function create(client, user) {
    if (!client || !user || !user.id) throw new Error("Sign in is required to manage patients and addresses.");
    const email = String(user.email || "");
    const uid = user.id;

    async function listPatients() {
      const owned = await client.from("patients").select("*").eq("user_id", uid).order("name", { ascending: true });
      if (owned.error) throw owned.error;
      let legacy = { data: [], error: null };
      if (email) legacy = await client.from("patients").select("*").eq("user_email", email).order("name", { ascending: true });
      if (legacy.error) throw legacy.error;
      const rows = new Map();
      [...(owned.data || []), ...(legacy.data || [])].forEach(row => rows.set(String(row.id), row));
      return [...rows.values()].sort((a,b) => String(a.name || "").localeCompare(String(b.name || "")));
    }
    async function savePatient(input) {
      const name = String(input.name || "").trim();
      const age = Number(input.age);
      const gender = String(input.gender || "").trim();
      if (!name || !Number.isInteger(age) || age < 0 || age > 120 || !["Male", "Female", "Other"].includes(gender)) {
        throw new Error("Enter a valid name, age and gender.");
      }
      const row = { id: input.id || "PAT-" + Date.now(), user_id: uid, user_email: email, name, age, gender };
      let result;
      if (input.id) {
        result = await client.from("patients").update({ name, age, gender }).eq("id", input.id).eq("user_id", uid).select().maybeSingle();
        if (result.error) throw result.error;
        if (!result.data && email) {
          result = await client.from("patients").update({ name, age, gender, user_id: uid }).eq("id", input.id).eq("user_email", email).select().maybeSingle();
          if (result.error) throw result.error;
        }
        if (!result.data) throw new Error("Patient record was not found in your account.");
      } else {
        result = await client.from("patients").insert([row]).select().single();
        if (result.error) throw result.error;
      }
      return result.data;
    }
    async function deletePatient(id) {
      let result = await client.from("patients").delete().eq("id", id).eq("user_id", uid).select("id");
      if (result.error) throw result.error;
      if ((!result.data || !result.data.length) && email) {
        result = await client.from("patients").delete().eq("id", id).eq("user_email", email).select("id");
        if (result.error) throw result.error;
      }
      if (!result.data || !result.data.length) throw new Error("Patient record was not found in your account.");
    }

    async function listAddresses() {
      const { data, error } = await client.from("user_addresses").select("*").eq("user_id", uid)
        .order("is_default", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    }
    async function saveAddress(input) {
      const fields = {
        tag: String(input.tag || "Home").trim().slice(0, 24),
        name: String(input.name || "").trim(),
        phone: String(input.phone || "").replace(/\D/g, "").slice(-10),
        address1: String(input.address1 || "").trim(),
        address2: String(input.address2 || "").trim() || null,
        landmark: String(input.landmark || "").trim() || null,
        city: String(input.city || "").trim(),
        state: String(input.state || "").trim(),
        pincode: String(input.pincode || "").replace(/\D/g, "").slice(0, 6),
        is_default: input.is_default === true
      };
      if (!fields.name || !/^[6-9]\d{9}$/.test(fields.phone) || !fields.address1 || !fields.city || !/^[1-9]\d{5}$/.test(fields.pincode)) {
        throw new Error("Enter name, valid 10-digit Indian phone, address, city and 6-digit PIN code.");
      }
      if (fields.is_default) {
        const reset = await client.from("user_addresses").update({ is_default: false }).eq("user_id", uid);
        if (reset.error) throw reset.error;
      }
      const payload = { ...fields, user_id: uid };
      const result = input.id
        ? await client.from("user_addresses").update(payload).eq("id", input.id).eq("user_id", uid).select().single()
        : await client.from("user_addresses").insert([payload]).select().single();
      if (result.error) throw result.error;
      return result.data;
    }
    async function deleteAddress(id) {
      const { error } = await client.from("user_addresses").delete().eq("id", id).eq("user_id", uid);
      if (error) throw error;
    }
    async function setDefaultAddress(id) {
      const reset = await client.from("user_addresses").update({ is_default: false }).eq("user_id", uid);
      if (reset.error) throw reset.error;
      const selected = await client.from("user_addresses").update({ is_default: true }).eq("id", id).eq("user_id", uid);
      if (selected.error) throw selected.error;
    }
    return Object.freeze({ listPatients, savePatient, deletePatient, listAddresses, saveAddress, deleteAddress, setDefaultAddress });
  }
  window.MFCustomerV2People = Object.freeze({ create });
})();
