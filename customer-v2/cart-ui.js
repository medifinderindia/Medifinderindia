(() => {
  "use strict";
  const root = document.querySelector('[data-view="cart"]');
  if (!root || !window.MFCustomerV2Cart) return;
  const store = window.MFCustomerV2Cart.createCartStore();
  const itemsHost = root.querySelector("[data-cart-items]");
  const summary = root.querySelector("[data-cart-summary]");
  const money = value => "₹" + (Number(value) || 0).toFixed(2);

  function render() {
    const state = store.snapshot();
    itemsHost.replaceChildren();
    if (!state.items.length) {
      const empty = document.createElement("div");
      empty.className = "v2-cart-empty";
      const title = document.createElement("h3"); title.textContent = "Your cart is empty";
      const copy = document.createElement("p"); copy.textContent = "Browse the catalogue and add healthcare products.";
      const browse = document.createElement("button"); browse.type = "button"; browse.textContent = "Browse products";
      browse.addEventListener("click", () => window.MFCustomerV2App && window.MFCustomerV2App.openView("home"));
      empty.append(title, copy, browse); itemsHost.append(empty);
      summary.hidden = true;
      return;
    }
    state.items.forEach(item => {
      const card = document.createElement("article"); card.className = "v2-cart-row";
      let media;
      if (item.img) {
        media = document.createElement("img"); media.className = "v2-cart-thumb";
        media.src = item.img; media.alt = item.name || "Product"; media.loading = "lazy";
        media.onerror = () => { media.replaceWith(placeholder()); };
      } else media = placeholder();
      const details = document.createElement("div");
      const title = document.createElement("h3"); title.textContent = item.name || "Healthcare product";
      const meta = document.createElement("p"); meta.className = "v2-cart-meta";
      meta.textContent = (item.merchantId ? "Partner product · " : "") + money(item.price) + " each";
      details.append(title);
      if (item.isRx) {
        const rx = document.createElement("span"); rx.className = "v2-cart-rx";
        rx.textContent = item.rxVerified ? "Prescription uploaded — pending review" : "Prescription required";
        details.append(rx);
      }
      details.append(meta);
      const price = document.createElement("div"); price.className = "v2-cart-price";
      price.textContent = money(item.price * item.qty); details.append(price);
      const controls = document.createElement("div"); controls.className = "v2-cart-controls";
      const minus = button("−", "Decrease quantity", () => {
        if (item.qty <= 1) store.remove(item.id); else store.setQuantity(item.id, item.qty - 1);
        render();
      });
      const count = document.createElement("span"); count.textContent = String(item.qty); count.setAttribute("aria-label", "Quantity");
      const plus = button("+", "Increase quantity", () => { store.setQuantity(item.id, item.qty + 1); render(); });
      const remove = button("Remove", "Remove product", () => { store.remove(item.id); render(); });
      remove.className = "v2-cart-remove";
      controls.append(minus, count, plus, remove); details.append(controls);
      card.append(media, details); itemsHost.append(card);
    });
    summary.hidden = false;
    summary.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = "Price details"; summary.append(heading);
    summary.append(summaryRow("Items (" + state.itemCount + ")", money(state.subtotal)));
    summary.append(summaryRow("Delivery & service charges", "Calculated at checkout"));
    const total = summaryRow("Subtotal", money(state.subtotal)); total.classList.add("total"); summary.append(total);
  }
  function placeholder() {
    const node = document.createElement("div"); node.className = "v2-cart-thumb v2-cart-thumb-placeholder";
    node.textContent = "MediFinder"; return node;
  }
  function button(label, aria, action) {
    const node = document.createElement("button"); node.type = "button"; node.textContent = label;
    node.setAttribute("aria-label", aria); node.addEventListener("click", action); return node;
  }
  function summaryRow(label, value) {
    const row = document.createElement("div"); row.className = "v2-cart-summary-row";
    const left = document.createElement("span"); left.textContent = label;
    const right = document.createElement("strong"); right.textContent = value;
    row.append(left, right); return row;
  }
  window.MFCustomerV2CartUI = Object.freeze({ render, refresh: render });
  document.addEventListener("click", event => {
    if (event.target.closest('[data-go="cart"]')) render();
  });
  window.addEventListener("storage", event => { if (event.key === "medi_cart") render(); });
  render();
})();
