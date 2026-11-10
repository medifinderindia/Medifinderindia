(() => {
  "use strict";
  const root = document.querySelector('[data-view="module"]');
  if (!root) return;
  const panel = root.querySelector("[data-shops-panel]");
  const search = root.querySelector("[data-shops-search]");
  const refresh = root.querySelector("[data-shops-refresh]");
  const locate = root.querySelector("[data-shops-location]");
  const status = root.querySelector("[data-shops-status]");
  const list = root.querySelector("[data-shops-list]");
  if (!panel || !search || !refresh || !locate || !status || !list) return;
  let rows = [], position = null, loading = false, sequence = 0;

  const hasCoordinates = shop => shop.latitude != null && shop.longitude != null && String(shop.latitude).trim() !== "" && String(shop.longitude).trim() !== "" && Number.isFinite(Number(shop.latitude)) && Number.isFinite(Number(shop.longitude));
  const distanceKm = (a, b) => {
    const rad = value => value * Math.PI / 180;
    const dLat = rad(Number(b.latitude) - Number(a.latitude));
    const dLon = rad(Number(b.longitude) - Number(a.longitude));
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(Number(a.latitude))) *
      Math.cos(rad(Number(b.latitude))) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };
  const node = (tag, cls, value) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (value != null) el.textContent = String(value);
    return el;
  };
  function filtered() {
    const query = search.value.trim().toLowerCase();
    return rows.map(shop => {
      const km = position && hasCoordinates(shop)
        ? distanceKm(position, shop) : null;
      return { ...shop, _distance: km };
    }).filter(shop => !query || [
      shop.shop_name, shop.merchant_name, shop.city, shop.district, shop.state,
      shop.pincode, shop.address, shop.resolved_address, shop.business_category
    ].some(value => String(value || "").toLowerCase().includes(query)))
      .sort((a, b) => {
        if (a._distance != null && b._distance != null) return a._distance - b._distance;
        if (a._distance != null) return -1;
        if (b._distance != null) return 1;
        return String(a.shop_name || a.merchant_name || "").localeCompare(String(b.shop_name || b.merchant_name || ""));
      });
  }
  function render() {
    list.replaceChildren();
    const results = filtered();
    if (!results.length) {
      list.append(node("p", "v2-shops-empty", rows.length ? "No licensed partner pharmacies match your search." : "No licensed partner pharmacies are listed right now."));
      return;
    }
    const fragment = document.createDocumentFragment();
    results.forEach(shop => {
      const card = node("article", "v2-shop-card");
      card.setAttribute("data-shop-card", String(shop.id));
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", "View " + (shop.shop_name || shop.merchant_name || "pharmacy") + " details");
      const imageUrl = shop.avatar_url || shop.merchant_avatar || "";
      if (imageUrl) {
        const image = node("img", "v2-shop-avatar");
        image.src = imageUrl; image.alt = ""; image.loading = "lazy";
        image.onerror = () => { image.hidden = true; };
        card.append(image);
      } else card.append(node("div", "v2-shop-avatar v2-shop-avatar-placeholder", "MF"));
      const details = node("div", "v2-shop-details");
      details.append(node("strong", "v2-shop-name", shop.shop_name || shop.merchant_name || "Healthcare Partner"));
      const area = [shop.city, shop.district, shop.state, shop.pincode].filter(Boolean).join(" · ");
      details.append(node("small", "v2-shop-area", area || "Location details not provided"));
      if (shop.business_category) details.append(node("small", "v2-shop-category", shop.business_category));
      const address = shop.resolved_address || shop.address;
      if (address) details.append(node("p", "v2-shop-address", address));
      if (shop._distance != null) details.append(node("small", "v2-shop-distance", shop._distance < 1 ? Math.round(shop._distance * 1000) + " m away" : shop._distance.toFixed(1) + " km away"));
      if (shop.cod_available === true) details.append(node("small", "v2-shop-cod", "Cash on Delivery available"));
      const actions = node("div", "v2-shop-actions");
      if (shop.phone) {
        const call = node("a", "", "Call shop");
        call.href = "tel:" + String(shop.phone).replace(/[^+0-9]/g, "");
        actions.append(call);
      }
      const mapQuery = hasCoordinates(shop)
        ? shop.latitude + "," + shop.longitude : address || [shop.shop_name, shop.city, shop.pincode].filter(Boolean).join(" ");
      if (mapQuery) {
        const map = node("a", "", "Directions");
        map.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(mapQuery);
        map.target = "_blank"; map.rel = "noopener noreferrer"; actions.append(map);
      }
      const view = node("button", "v2-shop-view", "View shop & products");
      view.type = "button";
      view.addEventListener("click", () => window.MFCustomerV2ShopDetail && window.MFCustomerV2ShopDetail.open(shop));
      details.append(actions, view); card.append(details); fragment.append(card);
    });
    list.append(fragment);
  }
  async function load() {
    if (loading) return;
    const client = window.supabaseClient;
    if (!client) { status.textContent = "Secure database connection is unavailable. Please retry."; return; }
    loading = true; const current = ++sequence;
    refresh.disabled = true; status.textContent = "Loading licensed partner pharmacies…";
    try {
      const result = await client.from("merchants_public")
        .select("id,shop_name,merchant_name,merchant_avatar,avatar_url,license_status,pincode,city,district,state,address,resolved_address,latitude,longitude,cod_available,business_category,about_shop,phone")
        .or("license_status.eq.verified,license_status.eq.approved")
        .limit(150);
      if (result.error) throw result.error;
      if (current !== sequence) return;
      rows = Array.isArray(result.data) ? result.data : [];
      status.textContent = rows.length + " licensed partner pharmacy" + (rows.length === 1 ? "" : "s") + " found" + (position ? " · sorted by distance" : " · add location to sort nearby shops first");
      render();
    } catch (error) {
      if (current !== sequence) return;
      rows = []; list.replaceChildren();
      status.textContent = "Could not load nearby shops. Check your internet connection and retry.";
    } finally {
      loading = false; refresh.disabled = false;
    }
  }
  function useLocation() {
    if (!navigator.geolocation) { status.textContent = "Location is not supported by this device. Search by town or PIN code."; return; }
    locate.disabled = true; status.textContent = "Waiting for location permission…";
    navigator.geolocation.getCurrentPosition(result => {
      position = { latitude: result.coords.latitude, longitude: result.coords.longitude };
      locate.disabled = false; status.textContent = "Location enabled · shops sorted by distance"; render();
    }, error => {
      locate.disabled = false;
      status.textContent = error.code === 1 ? "Location permission was not granted. You can still search by town or PIN code." : "Location could not be detected. Check GPS and try again.";
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
  }
  list.addEventListener("keydown", event => { if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-shop-card]")) { event.preventDefault(); const shop = rows.find(item => String(item.id) === event.target.getAttribute("data-shop-card")); if (shop && window.MFCustomerV2ShopDetail) window.MFCustomerV2ShopDetail.open(shop); } });
  search.addEventListener("input", render);
  refresh.addEventListener("click", load);
  locate.addEventListener("click", useLocation);
  window.MFCustomerV2Shops = Object.freeze({ load });
  panel.hidden = true;
})();
