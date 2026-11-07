(() => {
  "use strict";
  const CHUNK_SIZE = 12;
  let generation = 0;

  const text = (value) => String(value == null ? "" : value);
  const priceOf = (p) => Number(p.selling_price || p.unit_price || p.price || 0) || 0;
  const mrpOf = (p) => Number(p.mrp || 0) || 0;
  const stockOf = (p) => Number.parseInt(p.stock_qty || p.stock || 0, 10) || 0;
  const isRx = (p) => p.prescription_req
    ? p.prescription_req === "Yes"
    : p.is_rx === true || p.is_rx === "true";

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function productCard(product) {
    const price = priceOf(product);
    const mrp = mrpOf(product);
    const stock = stockOf(product);
    const rx = isRx(product);
    const name = text(product.name || product.product_name || "Healthcare product");
    const imageUrl = text(product.image_url || product.img || "");
    const card = element("article", "v2-product-card product-card");
    Object.assign(card.dataset, {
      id: text(product.id),
      name,
      price: String(price),
      mrp: String(mrp || price),
      mrpOrig: text(product.mrp || ""),
      img: imageUrl,
      img2: text(product.image_url_2 || ""),
      img3: text(product.image_url_3 || ""),
      img4: text(product.image_url_4 || ""),
      manufacturer: text(product.manufacturer || ""),
      desc: text(product.description || ""),
      isRx: String(rx),
      prescriptionReq: text(product.prescription_req || (rx ? "Yes" : "No")),
      merchantId: text(product.merchant_id || ""),
      stock: String(stock),
      composition: text(product.composition || ""),
      dosageForm: text(product.dosage_form || ""),
      strength: text(product.strength || ""),
      categoryRaw: text(product.category || product.dosage_form || "Medicine"),
      productType: text(product.product_type || "Medicine"),
      weightKg: text(product.weight_kg || "")
    });

    const media = element("div", "v2-product-media");
    if (imageUrl) {
      const img = element("img", "v2-product-image");
      img.src = imageUrl;
      img.alt = name;
      img.loading = "lazy";
      img.decoding = "async";
      img.onerror = () => { img.hidden = true; };
      media.append(img);
    } else {
      media.append(element("span", "v2-product-image-placeholder", "MediFinder"));
    }

    const favorite = element("button", "v2-product-save", "♡");
    favorite.type = "button";
    favorite.setAttribute("aria-label", "Save to wishlist");
    favorite.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleWishlist(product, favorite);
    });
    media.append(favorite);

    const info = element("div", "v2-product-info");
    info.append(element("small", "v2-product-category", text(product.category || product.dosage_form || "Medicine")));
    info.append(element("h3", "v2-product-name", name));
    if (product.manufacturer) info.append(element("p", "v2-product-maker", text(product.manufacturer)));

    const priceLine = element("div", "v2-product-prices");
    priceLine.append(element("strong", "", "₹" + price.toFixed(2)));
    if (mrp > price) {
      const old = element("del", "", "₹" + mrp.toFixed(2));
      priceLine.append(old);
      priceLine.append(element("small", "v2-product-discount", Math.round((mrp - price) / mrp * 100) + "% off"));
    }
    info.append(priceLine);

    const actions = element("div", "v2-product-actions");
    const buy = element("button", "v2-product-buy", stock > 0 ? "View details" : "Unavailable");
    buy.type = "button";
    buy.disabled = stock <= 0;
    buy.addEventListener("click", (event) => {
      event.stopPropagation();
      if (typeof window.navigateToProductDetail === "function") window.navigateToProductDetail(card.dataset);
    });
    const add = element("button", "v2-product-add", "Add to cart");
    add.type = "button";
    add.disabled = stock <= 0;
    add.addEventListener("click", (event) => {
      event.stopPropagation();
      if (typeof window.handleQuickAddToCart === "function") window.handleQuickAddToCart(add);
      else if (typeof window.addToCart === "function") window.addToCart(card.dataset);
    });
    actions.append(buy, add);
    info.append(actions);
    if (rx) info.append(element("small", "v2-product-rx", "Prescription required"));
    if (stock <= 0) info.append(element("small", "v2-product-stock", "Currently unavailable"));
    card.append(media, info);
    card.addEventListener("click", () => {
      if (stock > 0 && typeof window.navigateToProductDetail === "function") {
        window.navigateToProductDetail(card.dataset);
      }
    });
    return card;
  }

  async function toggleWishlist(product, button) {
    const id = text(product.id);
    if (!id) return;
    let saved;
    try { saved = JSON.parse(localStorage.getItem("medi_wishlist") || "[]"); }
    catch (_) { saved = []; }
    const exists = saved.map(String).includes(id);
    saved = exists ? saved.filter(value => String(value) !== id) : [...saved, id];
    localStorage.setItem("medi_wishlist", JSON.stringify(saved));
    button.classList.toggle("active", !exists);
    button.textContent = exists ? "♡" : "♥";

    try {
      const client = window.supabaseClient;
      const uid = typeof window.getCurrentAuthUserId === "function"
        ? await window.getCurrentAuthUserId() : null;
      if (client && uid) {
        if (exists) {
          const { error } = await client.from("user_wishlist").delete()
            .eq("user_id", uid).eq("medicine_id", id);
          if (error) throw error;
        } else {
          const { error } = await client.from("user_wishlist").upsert(
            { user_id: uid, medicine_id: id },
            { onConflict: "user_id,medicine_id" }
          );
          if (error) throw error;
        }
      }
      if (typeof window.showToast === "function") {
        window.showToast(exists ? "Removed from wishlist" : "Added to wishlist", "info");
      }
    } catch (error) {
      // Keep local wishlist usable; the existing account sync can reconcile later.
      if (typeof window.showToast === "function") {
        window.showToast("Saved on this device. Account sync is unavailable right now.", "info");
      }
    }
  }

  async function render(root, products, options = {}) {
    const current = ++generation;
    const grid = root.querySelector("[data-home-products]");
    if (!grid) throw new Error("Home product grid element is missing.");
    const rows = Array.isArray(products) ? products : [];
    grid.replaceChildren();

    for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
      if (current !== generation || !root.isConnected) return;
      const fragment = document.createDocumentFragment();
      rows.slice(offset, offset + CHUNK_SIZE).forEach(row => fragment.append(productCard(row)));
      grid.append(fragment);
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    if (!rows.length) {
      const empty = element("p", "v2-products-empty", "No approved products are available right now.");
      grid.append(empty);
    }
    options.onRendered?.(rows.length);
  }

  function cancel() { generation++; }
  window.MFCustomerV2ProductCards = Object.freeze({ render, cancel });
})();
