#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("customer-v2/legacy-actions.js", "utf8");
const calls = [];
const context = { window: {} };
vm.runInNewContext(source, context);
const actions = context.window.MFCustomerV2LegacyActions.createLegacyActions({
  addToCart: product => calls.push(["cart", product]),
  navigateToProductDetail: data => calls.push(["detail", data]),
  wishlist: { setSaved: async (id, save) => ({ id, save }) }
});
const assertJSONEqual = (actual, expected) =>
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));

actions.onAddToCart({
  id: "42", name: "Test item", price: "19.5", mrp: "25", img: "image",
  isRx: "true", merchantId: "merchant-1", weightKg: "0.25"
});
assertJSONEqual(calls[0], ["cart", {
  id: "42", name: "Test item", price: "19.5", mrp: "25", img: "image",
  isRx: true, merchantId: "merchant-1", weightKg: "0.25"
}]);
actions.onProductOpen({ id: "42", name: "Test item" });
assert.equal(calls[1][0], "detail");
assert.equal(calls[1][1].id, "42");
(async () => {
  const button = {
    classList: { contains: () => false, toggle: () => {} },
    setAttribute: () => {},
    textContent: ""
  };
  const result = await actions.onWishlist({ id: 42 }, button);
  assertJSONEqual(result, { id: "42", save: true });
  assert.equal(button.textContent, "♥");
  console.log("PASS: legacy Cart/Product Details action argument contract");
})().catch(error => { console.error(error); process.exitCode = 1; });
