#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("customer-v2/index.html", "utf8");
const source = fs.readFileSync("customer-v2/checkout-ui.js", "utf8");

// Verify the selector matches a real input and cannot throw a selector syntax error.
assert.ok(html.includes('data-checkout-pincode inputmode="numeric"'), "PIN input must exist in the checkout HTML");
assert.ok(source.includes('pin=$("[data-checkout-pincode]")'), "Checkout must use the complete PIN selector");
assert.ok(!source.includes('pin=$("[data-checkout-pincode")'), "Malformed PIN selector must not return");
new vm.Script(source, { filename: "customer-v2/checkout-ui.js" });
console.log("PASS: checkout PIN selector contract and JavaScript syntax");

const rulesSource = fs.readFileSync("customer-v2/checkout-rules.js", "utf8");
new vm.Script(rulesSource, { filename: "customer-v2/checkout-rules.js" });
assert.ok(rulesSource.includes('status: "unconfirmed"'), "Delivery fee must remain unconfirmed without a verified rate source");
assert.ok(rulesSource.includes('total: null'), "Unverified delivery fee must not produce a charge");
assert.ok(!source.includes('deliveryEstimate.total'), "Checkout must not add an unverified delivery estimate to payable total");
assert.ok(source.includes('row("Delivery fee","To be confirmed")'), "Checkout must disclose fee confirmation is pending");
console.log("PASS: delivery fee fail-closed contract");
