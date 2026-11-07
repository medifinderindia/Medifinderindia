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
      const bridge = window.MFCustomerV2Actions;
      if (bridge && typeof bridge.onWishlist === "function") {
        Promise.resolve(bridge.onWishlist(product, favorite)).catch(() => {});
      } else {
        favorite.disabled = true;
        favorite.title = "Wishlist will be connected with the existing account feature during migration.";
      }
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
    buy.disabled = stock <= 0 || !(window.MFCustomerV2Actions && typeof window.MFCustomerV2Actions.onProductOpen === "function");
    buy.addEventListener("click", (event) => {
      event.stopPropagation();
      const bridge = window.MFCustomerV2Actions;
      if (bridge && typeof bridge.onProductOpen === "function") bridge.onProductOpen(card.dataset);
    });
    const add = element("button", "v2-product-add", "Add to cart");
    add.type = "button";
    add.disabled = stock <= 0 || !(window.MFCustomerV2Actions && typeof window.MFCustomerV2Actions.onAddToCart === "function");
    add.addEventListener("click", (event) => {
      event.stopPropagation();
      const bridge = window.MFCustomerV2Actions;
      if (bridge && typeof bridge.onAddToCart === "function") bridge.onAddToCart(card.dataset);
      else {
        add.disabled = true;
        add.textContent = "Cart unavailable";
      }
    });
    actions.append(buy, add);
    info.append(actions);
    if (rx) info.append(element("small", "v2-product-rx", "Prescription required"));
    if (stock <= 0) info.append(element("small", "v2-product-stock", "Currently unavailable"));
    card.append(media, info);
    card.addEventListener("click", () => {
      const bridge = window.MFCustomerV2Actions;
      if (stock > 0 && bridge && typeof bridge.onProductOpen === "function") {
        bridge.onProductOpen(card.dataset);
      }
    });
    return card;
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
