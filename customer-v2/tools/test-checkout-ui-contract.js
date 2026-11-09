#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("customer-v2/index.html", "utf8");
const source = fs.readFileSync("customer-v2/checkout-ui.js", "utf8");
const rulesSource = fs.readFileSync("customer-v2/checkout-rules.js", "utf8");

for (const [name, text] of [["checkout-ui.js", source], ["checkout-rules.js", rulesSource]]) {
  new vm.Script(text, { filename: name });
}
assert.ok(html.includes('data-checkout-pincode inputmode="numeric"'), "Checkout must include a numeric PIN input");
assert.ok(html.includes('data-place-cod-order'), "Checkout must expose the real COD order action");
assert.ok(html.includes('data-order-result'), "Checkout must expose an accessible order result");
assert.ok(source.includes('pin=$("[data-checkout-pincode]")') || source.includes('pin = $("[data-checkout-pincode]")'), "Checkout must use the valid PIN selector");
assert.ok(source.includes('rpc("create_customer_cod_order"'), "Checkout must call the server-side atomic COD order RPC");
assert.ok(source.includes("p_request_id"), "Checkout must pass an idempotency request ID");
assert.ok(source.includes("acceptedPrescriptionPath"), "Prescription medicines must require an accepted pharmacy prescription");
assert.ok(source.includes("completedOrderId"), "A confirmed order must not be submitted twice from the same checkout view");
assert.ok(source.includes("This is a Preview environment connected to the live MediFinder backend"), "Preview must require explicit confirmation before creating a real COD order");
assert.ok(rulesSource.includes('.or("pin.eq."+p+",pincode.eq."+p)'), "Delivery zone lookup must support both legacy PIN columns");
assert.ok(!html.includes("Place order unavailable in preview"), "Checkout must not retain the old disabled preview-only order button");
assert.ok(!html.includes("data-apply-coupon"), "Inactive coupon preview controls must not be presented as functional");
assert.ok(!source.includes("validateCoupon("), "Preview-only coupon discounts must not affect real order totals");
console.log("PASS: secure COD checkout, PIN lookup, idempotency and prescription gate contract");
