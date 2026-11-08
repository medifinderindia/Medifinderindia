(() => {
  "use strict";
  const root = document.querySelector('[data-view="module"]');
  if (!root) return;
  const title = root.querySelector("#module-title");
  const description = root.querySelector("#module-description");
  const status = root.querySelector("#module-status");
  const panel = root.querySelector(".module-panel");
  const links = root.querySelector("#module-links");
  let request = 0;

  const labels = {
    orders: ["My Orders", "Your real MediFinder order history and current status."],
    notifications: ["Notifications", "Account alerts and service updates."],
    coins: ["Tablet Coin", "Your current coin balance and transaction history."],
    lab: ["Lab Test Bookings", "Your submitted diagnostic bookings."],
    nurse: ["Nurse Bookings", "Your submitted home-care requests."],
    ambulance: ["Ambulance Bookings", "Your ambulance requests and current booking status."],
    profile: ["My Profile", "Your saved MediFinder account information."]
  };
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = String(text);
    return node;
  };
  const money = value => "₹" + (Number(value) || 0).toFixed(2);
  function card(heading, detail, meta) {
    const item = el("article", "v2-account-card");
    item.append(el("strong", "", heading), el("p", "", detail));
    if (meta) item.append(el("small", "", meta));
    return item;
  }
  function renderRows(host, rows, kind) {
    host.replaceChildren();
    if (!rows.length) {
      host.append(el("p", "v2-account-empty", "No " + kind + " found."));
      return;
    }
    rows.forEach(row => {
      if (kind === "orders") {
        const id = row.order_id || row.id || "Order";
        const kind = row._order_kind === "prescription" ? "Prescription order" : "Order";
        const amount = row.total_amount ?? row.total ?? row.grand_total;
        host.append(card(kind + " " + id, "Status: " + (row.status || "Pending"), (amount == null ? "" : "Total: " + money(amount) + " · ") + (row.created_at ? new Date(row.created_at).toLocaleString() : "Date unavailable")));
      } else if (kind === "notifications") {
        host.append(card(row.title || "MediFinder update", row.message || "No message", (row.is_read ? "Read" : "Unread") + " · " + (row.created_at ? new Date(row.created_at).toLocaleString() : "")));
      } else if (kind === "coins") {
        host.append(card(row.reason || row.type || "Coin activity", (Number(row.amount) || 0) + " coins", row.created_at ? new Date(row.created_at).toLocaleString() : ""));
      } else {
        host.append(card(row.service_name || row.test_name || row.patient_name || row.pickup_address || row.patient || "Booking", "Status: " + (row.status || row.payment_status || "Submitted"), row.created_at ? new Date(row.created_at).toLocaleString() : ""));
      }
    });
  }
  async function queryRows(client, table, uid, extra) {
    let q = client.from(table).select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(30);
    if (extra) q = extra(q);
    const result = await q;
    if (result.error) throw result.error;
    return result.data || [];
  }
  async function load(key) {
    if (!labels[key]) return;
    const current = ++request;
    title.textContent = labels[key][0];
    description.textContent = labels[key][1];
    panel.replaceChildren(el("p", "v2-account-loading", "Loading your secure account data…"));
    links.replaceChildren();
    try {
      const client = window.supabaseClient;
      if (!client || !window.MFCustomerV2Auth) throw new Error("Secure account connection is unavailable.");
      const auth = await window.MFCustomerV2Auth.requireAuthenticatedUser(client);
      if (current !== request) return;
      if (!auth.authenticated) throw new Error("Please sign in to view your account information.");
      const uid = auth.user.id;
      const email = auth.user.email;
      panel.replaceChildren();
      if (key === "profile") {
        if (!window.MFCustomerV2Profile) throw new Error("Profile editor is not connected.");
        const profile = window.MFCustomerV2Profile.create(client, auth.user);
        const p = await profile.getProfile() || {};
        const avatar = p.avatar_url || (auth.user.user_metadata && (auth.user.user_metadata.avatar_url || auth.user.user_metadata.picture));
        const form = el("form", "v2-profile-form");
        if (avatar) { const img = el("img", "v2-account-avatar"); img.src = avatar; img.alt = "Profile photo"; img.loading = "lazy"; form.append(img); }
        const field = (label, name, type, value, required) => {
          const wrap = el("label", "v2-profile-field", label);
          const input = el("input"); input.name = name; input.type = type; input.value = value || ""; input.required = !!required;
          if (name === "phone") { input.inputMode = "numeric"; input.maxLength = 10; input.placeholder = "10-digit mobile number"; }
          if (name === "date_of_birth") input.max = new Date().toISOString().slice(0,10);
          wrap.append(input); return wrap;
        };
        form.append(field("Full name","full_name","text",p.full_name || "",true));
        form.append(field("Mobile number","phone","tel",p.phone || "",true));
        form.append(field("Date of birth","date_of_birth","date",p.date_of_birth || "",true));
        const terms = el("label","v2-profile-terms");
        const tick = el("input"); tick.type = "checkbox"; tick.name = "terms_accepted"; tick.checked = p.terms_accepted === true;
        terms.append(tick, document.createTextNode(" I accept the Terms & Conditions and Privacy Policy."));
        form.append(terms);
        const save = el("button","v2-profile-save","Save profile"); save.type = "submit"; form.append(save);
        const photo = el("label","v2-profile-photo","Change profile photo");
        const photoInput = el("input"); photoInput.type = "file"; photoInput.accept = "image/jpeg,image/png,image/webp,image/gif"; photo.append(photoInput); form.append(photo);
        photoInput.addEventListener("change", async () => {
          const file = photoInput.files && photoInput.files[0]; if (!file) return;
          photoInput.disabled = true; status.textContent = "Uploading profile photo…";
          try { const updated = await profile.uploadAvatar(file); status.textContent = "Profile photo updated."; await load("profile"); }
          catch (e) { status.textContent = e.message || "Could not upload profile photo."; }
          finally { photoInput.disabled = false; }
        });
        form.addEventListener("submit", async event => {
          event.preventDefault(); save.disabled = true; save.textContent = "Saving…";
          try { await profile.saveProfile({ full_name: form.elements.full_name.value, phone: form.elements.phone.value, date_of_birth: form.elements.date_of_birth.value, terms_accepted: tick.checked }); status.textContent = "Profile saved successfully."; await load("profile"); }
          catch (e) { status.textContent = e.message || "Could not save profile."; }
          finally { save.disabled = false; save.textContent = "Save profile"; }
        });
        panel.append(form);
        const address = el("p","v2-profile-address","Address: " + (p.address || "Manage saved addresses and patients below."));
        panel.append(address);
        const manage = el("button","v2-profile-manage","Manage patients & addresses"); manage.type = "button"; manage.dataset.go = "people"; panel.append(manage);
      } else {
        const config = {
          orders: async () => {
            // Match production ownership rules and include prescription-linked orders.
            const filters = ["user_id.eq." + uid];
            const phone = String(auth.user.phone || (auth.user.user_metadata && auth.user.user_metadata.phone) || "").replace(/[(),]/g, "");
            const userEmail = String(email || "").replace(/[(),]/g, "");
            if (phone) filters.push("customer_phone.eq." + phone);
            if (userEmail) filters.push("user_email.eq." + userEmail);
            const [regular, prescriptions] = await Promise.all([
              client.from("orders").select("*").or(filters.join(","))
                .order("created_at", { ascending: false }).limit(30),
              client.from("prescription_orders").select("*").eq("user_id", uid)
                .order("created_at", { ascending: false }).limit(30)
            ]);
            if (regular.error) throw regular.error;
            if (prescriptions.error) throw prescriptions.error;
            return (regular.data || []).map(row => ({ ...row, _order_kind: "standard" }))
              .concat((prescriptions.data || []).map(row => ({ ...row, _order_kind: "prescription" })))
              .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
              .slice(0, 50);
          },
          notifications: () => client.from("notifications").select("*").or("user_id.eq." + uid + ",user_id.is.null").order("created_at", { ascending: false }).limit(50).then(r => { if (r.error) throw r.error; return r.data || []; }),
          coins: () => queryRows(client, "coin_transactions", uid),
          lab: () => queryRows(client, "lab_bookings", uid),
          nurse: () => queryRows(client, "nurse_bookings", uid),
          ambulance: () => queryRows(client, "ambulance_bookings", uid)
        };
        const rows = await config[key]();
        if (current !== request) return;
        if (key === "coins") {
          const result = await client.from("profiles").select("coins").eq("id", uid).maybeSingle();
          if (result.error) throw result.error;
          panel.append(card("Available balance", (Number(result.data && result.data.coins) || 0) + " coins", "1 coin = ₹1 where eligible"));
        }
        renderRows(panel, rows, key === "lab" || key === "nurse" || key === "ambulance" ? "bookings" : key);
      }
      if (current === request) status.textContent = "Live account data loaded from MediFinder.";
    } catch (error) {
      if (current !== request) return;
      panel.replaceChildren(el("p", "v2-account-empty", error.message || "Could not load account data. Please retry."));
      status.textContent = "Account data unavailable.";
    }
  }
  window.MFCustomerV2AccountHub = Object.freeze({ load });
})();