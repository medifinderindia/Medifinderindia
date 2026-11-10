(() => {
  "use strict";
  const root = document.querySelector('[data-view="product"]');
  if (!root) return;
  let current = null;
  const $ = selector => root.querySelector(selector);
  const set = (selector, value, fallback = "Not provided") => {
    const el = $(selector);
    if (el) el.textContent = value == null || value === "" ? fallback : String(value);
  };
  function refresh() {
    if (!current) return;
    set("[data-detail-name]", current.name);
    set("[data-detail-category]", current.categoryRaw || current.productType || "Healthcare product");
    set("[data-detail-maker]", current.manufacturer, "");
    set("[data-detail-price]", "₹" + (Number(current.price) || 0).toFixed(2));
    const mrp = Number(current.mrp) || 0, price = Number(current.price) || 0;
    const old = $("[data-detail-mrp]"), discount = $("[data-detail-discount]");
    if (old) { old.hidden = !(mrp > price); old.textContent = "₹" + mrp.toFixed(2); }
    if (discount) { discount.hidden = !(mrp > price); discount.textContent = mrp > price ? Math.round((mrp-price)/mrp*100) + "% off" : ""; }
    set("[data-detail-stock]", Number(current.stock) > 0 ? "In stock" : "Currently unavailable");
    set("[data-detail-description]", current.desc, "Product information has not been provided by the seller.");
    set("[data-detail-composition]", current.composition);
    set("[data-detail-strength]", current.strength);
    set("[data-detail-form]", current.dosageForm);
    const rx = $("[data-detail-rx]");
    if (rx) rx.hidden = current.isRx !== "true";
    const image = $("[data-detail-image]"), fallback = $("[data-detail-image-fallback]");
    if (image) {
      image.hidden = !current.img;
      image.alt = current.name || "Healthcare product";
      if (current.img) image.src = current.img;
      image.onerror = () => { image.hidden = true; if (fallback) fallback.hidden = false; };
    }
    if (fallback) fallback.hidden = Boolean(current.img);
    const add = $("[data-detail-add]");
    if (add) add.disabled = Number(current.stock) <= 0 || !(window.MFCustomerV2Actions && typeof window.MFCustomerV2Actions.onAddToCart === "function");
    set("[data-detail-status]", "");
  }
  function open(product) {
    current = { ...product };
    refresh();
    if (window.MFCustomerV2App) window.MFCustomerV2App.openView("product");
  }
  const add = $("[data-detail-add]");
  if (add) add.addEventListener("click", async () => {
    if (!current || add.disabled) return;
    add.disabled = true;
    try {
      const action = window.MFCustomerV2Actions;
      if (!action || typeof action.onAddToCart !== "function") throw new Error("Cart is not available. Please return to the catalogue and retry.");
      await action.onAddToCart(current);
      set("[data-detail-status]", "Added to your cart.");
    } catch (error) {
      set("[data-detail-status]", error && error.message ? error.message : "Could not add this product. Please try again.");
    } finally {
      add.disabled = Number(current && current.stock) <= 0;
    }
  });
  window.MFCustomerV2ProductDetail = Object.freeze({ open, refresh });
})();