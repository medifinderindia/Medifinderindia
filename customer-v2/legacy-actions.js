(() => {
  "use strict";

  function createLegacyActions(options = {}) {
    const addToCart = options.addToCart;
    const openProduct = options.navigateToProductDetail;
    const wishlist = options.wishlist;
    if (typeof addToCart !== "function" || typeof openProduct !== "function") {
      throw new Error("Both verified legacy Cart and Product Details actions are required.");
    }

    return Object.freeze({
      onAddToCart(dataset) {
        const product = {
          id: dataset.id,
          name: dataset.name,
          price: dataset.price,
          mrp: dataset.mrp,
          img: dataset.img,
          isRx: dataset.isRx === "true",
          merchantId: dataset.merchantId || "",
          weightKg: dataset.weightKg || ""
        };
        return addToCart(product);
      },
      onProductOpen(dataset) {
        return openProduct({ ...dataset });
      },
      async onWishlist(product, button) {
        if (!wishlist) throw new Error("Wishlist adapter is not connected.");
        const id = String(product.id);
        const shouldSave = !button.classList.contains("active");
        const result = await wishlist.setSaved(id, shouldSave);
        button.classList.toggle("active", shouldSave);
        button.textContent = shouldSave ? "♥" : "♡";
        button.setAttribute("aria-pressed", String(shouldSave));
        return result;
      }
    });
  }

  window.MFCustomerV2LegacyActions = Object.freeze({ createLegacyActions });
})();