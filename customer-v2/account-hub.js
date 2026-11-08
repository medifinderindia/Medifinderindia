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
        host.append(card("Order " + id, "Status: " + (row.status || "Pending"), "Total: " + money(row.total_amount ?? row.total ?? row.grand_total) + " · " + (row.created_at ? new Date(row.created_at).toLocaleString() : "Date unavailable")));
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
        const result = await client.from("profiles").select("*").eq("email", email).maybeSingle();
        if (result.error) throw result.error;
        const p = result.data || {};
        const avatar = p.avatar_url || (auth.user.user_metadata && (auth.user.user_metadata.avatar_url || auth.user.user_metadata.picture));
        if (avatar) { const img = el("img", "v2-account-avatar"); img.src = avatar; img.alt = "Profile photo"; img.loading = "lazy"; panel.append(img); }
        panel.append(card(p.full_name || (auth.user.user_metadata && (auth.user.user_metadata.full_name || auth.user.user_metadata.name)) || "MediFinder customer", email, p.phone || "Phone number not added"));
        panel.append(card("Address", p.address || "Manage saved addresses and patients", "Use Patients & Addresses from your account"));
      } else {
        const config = {
          orders: () => queryRows(client, "orders", uid),
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