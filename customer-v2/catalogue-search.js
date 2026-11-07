(() => {
  "use strict";

  function normalize(value) {
    return String(value == null ? "" : value)
      .normalize("NFKD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .toLocaleLowerCase()
      .trim();
  }

  function filter(products, query) {
    const rows = Array.isArray(products) ? products : [];
    const term = normalize(query);
    if (!term) return rows.slice();
    return rows.filter(product => {
      const fields = [
        product.name, product.product_name, product.category,
        product.manufacturer, product.composition, product.strength,
        product.dosage_form, product.product_type
      ];
      return fields.some(value => normalize(value).includes(term));
    });
  }

  window.MFCustomerV2Search = Object.freeze({ filter });
})();