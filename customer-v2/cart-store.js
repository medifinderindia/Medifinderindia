(() => {
  "use strict";
  const KEY = "medi_cart";

  function read(storage) {
    try {
      const value = JSON.parse(storage.getItem(KEY) || "[]");
      return Array.isArray(value) ? value.filter(item => item && typeof item === "object" && item.id != null) : [];
    } catch (_) { return []; }
  }
  function persist(storage, rows) {
    storage.setItem(KEY, JSON.stringify(rows));
    return rows;
  }
  function createCartStore(storage = window.localStorage) {
    function snapshot() {
      const items = read(storage).map(item => ({
        ...item,
        qty: Math.max(1, Math.floor(Number(item.qty) || 1)),
        price: Math.max(0, Number(item.price) || 0),
        mrp: Math.max(0, Number(item.mrp || item.price) || 0),
        isRx: item.isRx === true || item.isRx === "true",
        rxVerified: item.rxVerified === true
      }));
      return {
        items,
        itemCount: items.reduce((sum, item) => sum + item.qty, 0),
        subtotal: items.reduce((sum, item) => sum + item.price * item.qty, 0)
      };
    }
    function add(product) {
      if (!product || product.id == null || !String(product.id)) throw new Error("A valid product ID is required.");
      const rows = read(storage);
      const existing = rows.find(item => String(item.id) === String(product.id));
      if (existing) existing.qty = Math.max(1, Number(existing.qty) || 1) + 1;
      else {
        const rx = product.isRx === true || product.isRx === "true";
        rows.push({
          id: product.id, name: String(product.name || "Healthcare product"),
          price: Number(product.price) || 0, mrp: Number(product.mrp || product.price) || 0,
          img: product.img || "", qty: 1, isRx: rx, rxVerified: !rx,
          merchantId: product.merchantId || product.merchant_id || "",
          weight: Number(product.weightKg || product.weight_kg) || 0.5,
          exempt_platform_fee: product.id === "p2",
          exempt_processing_charge: product.id === "p4",
          sponsorDiscountSlotId: product.sponsorDiscountSlotId || null
        });
      }
      persist(storage, rows);
      return snapshot();
    }
    function setQuantity(id, quantity) {
      const qty = Math.floor(Number(quantity));
      if (!Number.isFinite(qty) || qty < 1) throw new Error("Quantity must be at least one.");
      const rows = read(storage);
      const item = rows.find(row => String(row.id) === String(id));
      if (!item) throw new Error("Cart item was not found.");
      item.qty = qty;
      persist(storage, rows);
      return snapshot();
    }
    function remove(id) {
      const rows = read(storage).filter(row => String(row.id) !== String(id));
      persist(storage, rows);
      return snapshot();
    }
    return Object.freeze({ snapshot, add, setQuantity, remove });
  }
  window.MFCustomerV2Cart = Object.freeze({ createCartStore });
})();