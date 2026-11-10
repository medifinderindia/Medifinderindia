(() => {
  "use strict";
  const root = document.querySelector('[data-view="shop"]');
  if (!root) return;
  let currentShop = null, requestSequence = 0;
  const $ = selector => root.querySelector(selector);
  const text = (selector, value, fallback = "Not provided") => {
    const el = $(selector);
    if (el) el.textContent = value == null || value === "" ? fallback : String(value);
  };
  function open(shop) {
    if (!shop || !shop.id || !["verified","approved"].includes(String(shop.license_status || "").toLowerCase())) return;
    currentShop = shop;
    requestSequence++;
    const image = shop.avatar_url || shop.merchant_avatar || "";
    const avatar = $("[data-shop-detail-avatar]");
    if (avatar) {
      avatar.replaceChildren();
      if (image) {
        const img = document.createElement("img");
        img.src = image; img.alt = ""; img.loading = "lazy";
        img.onerror = () => { img.remove(); avatar.textContent = "MF"; };
        avatar.append(img);
      } else avatar.textContent = "MF";
    }
    text("[data-shop-detail-name]", shop.shop_name || shop.merchant_name, "Healthcare Partner");
    text("[data-shop-detail-area]", [shop.city,shop.district,shop.state,shop.pincode].filter(Boolean).join(" · "));
    text("[data-shop-detail-about]", shop.about_shop, "");
    text("[data-shop-detail-address]", shop.resolved_address || shop.address);
    text("[data-shop-detail-category]", shop.business_category);
    text("[data-shop-detail-cod]", shop.cod_available === true ? "Cash on Delivery listed as available" : "Ask the pharmacy about delivery and payment options");
    const call = $("[data-shop-call]");
    if (call) {
      call.hidden = !shop.phone;
      call.href = shop.phone ? "tel:" + String(shop.phone).replace(/[^+0-9]/g,"") : "";
    }
    const directions = $("[data-shop-directions]");
    const mapQuery = shop.latitude != null && shop.longitude != null
      ? shop.latitude + "," + shop.longitude
      : shop.resolved_address || shop.address || [shop.shop_name,shop.city,shop.pincode].filter(Boolean).join(" ");
    if (directions) {
      directions.hidden = !mapQuery;
      directions.href = mapQuery ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(mapQuery) : "";
    }
    if (window.MFCustomerV2App) window.MFCustomerV2App.openView("shop");
    else loadProducts();
  }
  async function loadProducts() {
    const sequence = requestSequence;
    const grid = $("[data-shop-products]");
    const status = $("[data-shop-products-status]");
    if (!currentShop || !grid || !window.supabaseClient) {
      if (status) status.textContent = "Product catalogue is not available right now.";
      return;
    }
    if (status) status.textContent = "Loading approved products from this pharmacy…";
    grid.replaceChildren();
    try {
      const provider = window.MFCustomerV2Catalogue.createHomeCatalogueProvider(window.supabaseClient);
      const products = await provider({ merchantId: currentShop.id, limit: 300 });
      if (sequence !== requestSequence || !root.isConnected) return;
      if (status) status.textContent = products.length
        ? products.length + " approved product" + (products.length === 1 ? "" : "s") + " listed by this pharmacy"
        : "This verified pharmacy has no approved products listed yet.";
      if (window.MFCustomerV2ProductCards) {
        await window.MFCustomerV2ProductCards.render(root, products, { gridSelector: "[data-shop-products]" });
      }
    } catch (error) {
      if (sequence !== requestSequence) return;
      if (status) status.textContent = "Could not load this pharmacy's products. Please check your connection and retry.";
    }
  }
  window.MFCustomerV2ShopDetail = Object.freeze({ open, refresh: loadProducts });
})();