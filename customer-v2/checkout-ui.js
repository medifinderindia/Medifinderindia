(() => {
  "use strict";
  const root = document.querySelector('[data-view="checkout"]');
  if (!root) return;
  const $ = selector => root.querySelector(selector);
  const patientsHost = $("[data-checkout-patients]");
  const addressesHost = $("[data-checkout-addresses]");
  const status = $("[data-checkout-status]");
  const summary = $("[data-checkout-summary]");
  const pin = $("[data-checkout-pincode]");
  const pinResult = $("[data-pincode-result]");
  const placeButton = $("[data-place-cod-order]");
  const orderResult = $("[data-order-result]");
  let rules = null, currentUser = null, completedOrderId = "", selectedPatient = "self";
  let selectedAddress = "", addresses = [], patients = [], serviceability = null, loading = false, placing = false;
  const money = value => "₹" + (Number(value) || 0).toFixed(2);
  const cart = () => window.MFCustomerV2Cart
    ? window.MFCustomerV2Cart.createCartStore().snapshot()
    : { items: [], subtotal: 0 };

  function message(element, text, error = false) {
    if (!element) return;
    element.textContent = text;
    element.dataset.error = String(error);
  }
  function option(host, name, value, label, checked, change) {
    const row = document.createElement("label");
    row.className = "v2-checkout-option";
    const input = document.createElement("input");
    input.type = "radio"; input.name = name; input.value = value; input.checked = checked;
    input.addEventListener("change", () => change(value));
    const text = document.createElement("span"); text.textContent = label;
    row.append(input, text); host.append(row);
  }
  function renderSummary() {
    const state = cart();
    summary.replaceChildren();
    if (!state.items.length) {
      summary.textContent = "Your cart is empty.";
      placeButton.disabled = true;
      return;
    }
    state.items.forEach(item => {
      const line = document.createElement("div"); line.className = "v2-checkout-summary-line";
      const name = document.createElement("span"); name.textContent = (item.name || "Product") + " × " + item.qty;
      const amount = document.createElement("strong"); amount.textContent = money(item.price * item.qty);
      line.append(name, amount); summary.append(line);
    });
    const row = document.createElement("div"); row.className = "v2-checkout-summary-line";
    const label = document.createElement("span"); label.textContent = "Cart subtotal (display estimate)";
    const value = document.createElement("strong"); value.textContent = money(state.subtotal);
    row.append(label, value); summary.append(row);
    const note = document.createElement("p"); note.className = "v2-checkout-hint";
    note.textContent = "Final product prices, stock, service-zone delivery fee and payable total are recalculated securely by MediFinder when you place the COD order.";
    summary.append(note);
    placeButton.disabled = placing || !!completedOrderId || !rules || !selectedAddress || !serviceability || !serviceability.available;
  }
  async function checkPin() {
    serviceability = null;
    pin.value = pin.value.replace(/\D/g, "").slice(0, 6);
    if (!rules) { message(pinResult, "Account connection is unavailable. Please reload and retry.", true); renderSummary(); return; }
    if (!/^[1-9]\d{5}$/.test(pin.value)) { message(pinResult, "Enter a valid 6-digit PIN code.", true); renderSummary(); return; }
    const button = $("[data-check-pincode]");
    button.disabled = true; button.textContent = "Checking…";
    try {
      serviceability = await rules.checkPincode(pin.value);
      if (serviceability.available) {
        message(pinResult, "PIN code is in an approved service zone. The final delivery fee and stock will be checked again by the server.");
      } else {
        message(pinResult, "This PIN code is not in an approved delivery zone.", true);
      }
    } catch (error) {
      message(pinResult, error.message || "Could not verify the PIN code. Please retry.", true);
    } finally {
      button.disabled = false; button.textContent = "Check delivery availability"; renderSummary();
    }
  }
  function requestId() {
    const key = "mf_customer_cod_request_id";
    try {
      let value = sessionStorage.getItem(key);
      if (!value) {
        value = crypto.randomUUID();
        sessionStorage.setItem(key, value);
      }
      return value;
    } catch (_) {
      if (!requestId.fallback) requestId.fallback = crypto.randomUUID();
      return requestId.fallback;
    }
  }
  async function acceptedPrescriptionPath(client, userId, items) {
    const rxItems = items.filter(item => item.isRx === true || item.isRx === "true");
    if (!rxItems.length) return null;
    const merchantIds = [...new Set(rxItems.map(item => Number(item.merchantId || item.merchant_id)).filter(Number.isSafeInteger))];
    if (merchantIds.length !== 1) throw new Error("Prescription medicines must be ordered from one verified pharmacy at a time.");
    const { data, error } = await client.from("prescription_orders")
      .select("prescription_url,accepted_by,status")
      .eq("user_id", userId).eq("status", "accepted").eq("accepted_by", merchantIds[0])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("Could not verify the pharmacy-approved prescription. Please retry.");
    if (!data || !data.prescription_url) throw new Error("Your prescription must be reviewed and accepted by this pharmacy before ordering prescription medicines.");
    return data.prescription_url;
  }
  async function placeCODOrder() {
    if (placing || completedOrderId) return;
    const client = window.supabaseClient;
    const state = cart();
    const address = addresses.find(item => String(item.id) === String(selectedAddress));
    if (!client || !currentUser || !address) { message(orderResult, "Sign in and select a saved delivery address first.", true); return; }
    if (!state.items.length) { message(orderResult, "Your cart is empty.", true); return; }
    if (!serviceability || !serviceability.available || String(pin.value) !== String(address.pincode)) {
      message(orderResult, "Verify the selected address PIN code before placing your order.", true); return;
    }
    const rpcItems = state.items.map(item => ({
      medicine_id: Number(item.id),
      quantity: Math.max(1, Math.floor(Number(item.qty) || 1))
    }));
    if (rpcItems.some(item => !Number.isSafeInteger(item.medicine_id) || item.medicine_id <= 0)) {
      message(orderResult, "A cart product has an invalid catalogue ID. Remove it and add the product again.", true); return;
    }
    if (rpcItems.length > 20) { message(orderResult, "A single order can contain up to 20 different products.", true); return; }
    placing = true; placeButton.disabled = true; placeButton.textContent = "Placing secure COD order…";
    message(orderResult, "Checking live stock, current prices, pharmacy approval and delivery charges…");
    try {
      const prescriptionPath = await acceptedPrescriptionPath(client, currentUser.id, state.items);
      const patient = selectedPatient === "self" ? null : patients.find(item => String(item.id) === String(selectedPatient));
      const result = await client.rpc("create_customer_cod_order", {
        p_items: rpcItems,
        p_customer_name: address.name,
        p_customer_phone: String(address.phone || "").replace(/\D/g, "").slice(-10),
        p_address1: address.address1,
        p_address2: address.address2 || "",
        p_landmark: address.landmark || "",
        p_city: address.city,
        p_state: address.state || "West Bengal",
        p_pincode: String(address.pincode),
        p_patient_name: patient ? patient.name : "",
        p_prescription_path: prescriptionPath,
        p_request_id: requestId(),
        p_user_lat: null,
        p_user_lon: null
      });
      if (result.error) throw result.error;
      const data = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!data || data.success !== true || !data.order_id) throw new Error((data && data.message) || "The server did not confirm this order. Please check My Orders before retrying.");
      try { sessionStorage.removeItem("mf_customer_cod_request_id"); } catch (_) {}
      try { localStorage.removeItem("medi_cart"); } catch (_) {}
      if (window.MFCustomerV2CartUI) window.MFCustomerV2CartUI.refresh();
      const total = data.total_amount == null ? "confirmed by server" : money(data.total_amount);
      completedOrderId = String(data.order_id);\n      message(orderResult, "Order placed successfully · " + data.order_id + " · Cash on Delivery · Total " + total);
      message(status, "Your order was accepted by MediFinder. Track its status in My Orders.");
      placeButton.textContent = "Order placed · " + data.order_id;
      placeButton.disabled = true;
      renderSummary();
    } catch (error) {
      message(orderResult, error.message || "Order could not be placed. Your cart has been kept safe; please retry.", true);
    } finally {
      placing = false;
      if (placeButton.textContent !== "Order placed · " + placeButton.textContent.split(" · ").pop()) {
        placeButton.textContent = "Place Cash on Delivery order";
      }
      renderSummary();
    }
  }
  async function load() {
    if (loading) return;
    loading = true; patientsHost.replaceChildren(); addressesHost.replaceChildren();
    try {
      const client = window.supabaseClient;
      if (!client || !window.MFCustomerV2Auth || !window.MFCustomerV2People || !window.MFCustomerV2CheckoutRules) {
        throw new Error("Secure account services are not connected in this preview.");
      }
      const auth = await window.MFCustomerV2Auth.requireAuthenticatedUser(client);
      if (!auth.authenticated || !auth.user || !auth.user.id) throw new Error("Please sign in before checkout.");
      currentUser = auth.user;
      const people = window.MFCustomerV2People.create(client, currentUser);
      rules = window.MFCustomerV2CheckoutRules.create(client, currentUser);
      const [patientRows, addressRows] = await Promise.all([people.listPatients(), people.listAddresses()]);
      patients = patientRows; addresses = addressRows;
      option(patientsHost, "checkout-patient", "self", "Myself", selectedPatient === "self", value => { selectedPatient = value; });
      patients.forEach(patient => option(patientsHost, "checkout-patient", String(patient.id),
        patient.name + " · " + patient.age + " years", selectedPatient === String(patient.id), value => { selectedPatient = value; }));
      if (!patients.length) {
        const hint = document.createElement("p"); hint.className = "v2-checkout-hint";
        hint.textContent = "No family patients saved. You can continue with Myself."; patientsHost.append(hint);
      }
      if (!selectedAddress) {
        const preferred = addresses.find(item => item.is_default) || addresses[0];
        if (preferred) selectedAddress = String(preferred.id);
      }
      addresses.forEach(address => option(addressesHost, "checkout-address", String(address.id),
        (address.tag || "Address") + " — " + [address.address1, address.address2, address.city, address.pincode].filter(Boolean).join(", "),
        selectedAddress === String(address.id), value => {
          selectedAddress = value; serviceability = null;
          const chosen = addresses.find(item => String(item.id) === value);
          pin.value = chosen && chosen.pincode ? String(chosen.pincode) : "";
          message(pinResult, "Address changed. Verify its PIN code before checkout.");
          renderSummary();
        }));
      if (!addresses.length) {
        const hint = document.createElement("p"); hint.className = "v2-checkout-hint";
        hint.textContent = "Add a saved delivery address before placing an order."; addressesHost.append(hint);
      }
      const chosen = addresses.find(item => String(item.id) === selectedAddress);
      if (chosen && chosen.pincode) {
        pin.value = String(chosen.pincode);
        message(pinResult, "Saved address loaded. Verify its PIN code before placing an order.");
      }
      message(status, "Saved details loaded. Only server-confirmed Cash on Delivery orders can be placed here.");
    } catch (error) {
      rules = null; currentUser = null;
      message(status, error.message || "Could not load delivery details.", true);
    } finally {
      loading = false; renderSummary();
    }
  }

  pin.addEventListener("input", () => {
    pin.value = pin.value.replace(/\D/g, "").slice(0, 6);
    serviceability = null;
    message(pinResult, "PIN changed. Verify delivery availability again.");
    renderSummary();
  });
  $("[data-check-pincode]").addEventListener("click", checkPin);
  placeButton.addEventListener("click", placeCODOrder);
  window.MFCustomerV2Checkout = Object.freeze({
    load,
    getSelection: () => ({ patient: selectedPatient, address: selectedAddress, pincode: pin.value, serviceability })
  });
  load();
})();
