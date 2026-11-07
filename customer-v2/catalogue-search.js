(() => {
  "use strict";

  function normalize(value) {
    return String(value == null ? "" : value)
      .normalize("NFKD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .toLocaleLowerCase()
      .trim();
  }

  function fields(product) {
    return [
      product.name, product.product_name, product.category,
      product.manufacturer, product.composition, product.strength,
      product.dosage_form, product.product_type
    ].map(normalize).filter(Boolean);
  }

  function filter(products, query) {
    const rows = Array.isArray(products) ? products : [];
    const term = normalize(query);
    if (!term) return rows.slice();
    return rows.filter(product => fields(product).some(value => value.includes(term)));
  }

  function suggest(products, query, limit = 4) {
    const rows = Array.isArray(products) ? products : [];
    const term = normalize(query);
    if (!term || !rows.length) return [];
    const tokens = term.split(/\\s+/).filter(token => token.length > 1);
    const ranked = rows.map((product, index) => {
      const values = fields(product);
      let score = 0;
      for (const token of tokens) {
        if (values.some(value => value === token)) score += 8;
        else if (values.some(value => value.startsWith(token))) score += 5;
        else if (values.some(value => value.includes(token))) score += 3;
      }
      // Prefer products from the same product type/category family when text is a near match.
      const family = normalize(product.product_type || product.category || "");
      if (family && tokens.some(token => family.includes(token) || token.includes(family))) score += 2;
      return { product, score, index };
    });
    const nearMatches = ranked.filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index);
    const pool = nearMatches.length ? nearMatches : ranked;
    return pool.slice(0, Math.max(0, limit)).map(item => item.product);
  }

  window.MFCustomerV2Search = Object.freeze({ filter, suggest });
})();