const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Element {
  constructor() { this.listeners = {}; this.dataset = {}; this.children = []; this.hidden = false; this.disabled = false; this.textContent = ""; this.value = ""; this.style = {}; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  replaceChildren(...nodes) { this.children = nodes; }
  append(node) { this.children.push(node); }
  removeAttribute(name) { delete this[name]; }
  click(name) { if (this.listeners[name]) return this.listeners[name]({ preventDefault() {}, stopPropagation() {} }); }
}
const elements = new Map();
const root = { querySelector(selector) { if (!elements.has(selector)) elements.set(selector, new Element()); return elements.get(selector); } };
const added = [];
let opened = "";
let refreshed = 0;
const product = { id: 41, product_name: "Test Health Product", selling_price: 42, mrp: 50, stock_qty: 5, status: "Approved", image_url: "https://example.invalid/product.png", description: "Verified catalogue description", merchant_id: 7 };
const client = {
  from(table) {
    assert.equal(table, "medicines");
    const query = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: product, error: null }; } };
    return query;
  }
};
const window = {
  supabaseClient: client,
  MFCustomerV2Cart: { createCartStore() { return { add(p) { added.push(p); } }; } },
  MFCustomerV2CartUI: { refresh() { refreshed++; } },
  MFCustomerV2App: { openView(v) { opened = v; } }
};
const document = { querySelector(selector) { return selector === '[data-view="product"]' ? root : null; }, createElement() { return new Element(); } };
const context = { window, document, console, setTimeout() { return 1; } };
vm.runInNewContext(fs.readFileSync("customer-v2/product-detail-ui.js", "utf8"), context);
(async () => {
  await window.MFCustomerV2ProductDetail.open({ id: "41", name: "Catalogue card", price: "42", stock: "5" });
  assert.equal(opened, "product");
  assert.equal(elements.get("[data-product-title]").textContent, "Test Health Product");
  assert.equal(elements.get("[data-product-price]").textContent, "₹42.00");
  elements.get("[data-product-plus]").click("click");
  elements.get("[data-product-add]").click("click");
  assert.equal(added.length, 2, "quantity selector should add the selected quantity");
  assert.equal(added[0].id, 41);
  assert.equal(refreshed, 1);
  console.log("Product detail: authoritative product load, quantity and cart action passed.");
})().catch(error => { console.error(error); process.exit(1); });
