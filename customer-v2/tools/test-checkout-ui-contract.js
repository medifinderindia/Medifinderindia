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
assert.ok(rulesSource.includes('status:"unconfirmed"'), "No fallback delivery fee may be treated as confirmed");
assert.ok(rulesSource.includes('functions.invoke("shiprocket"'), "Checkout must request a live Shiprocket quote");
assert.ok(rulesSource.includes('data.serviceable !== true'), "Unserviceable courier response must be rejected");
assert.ok(rulesSource.includes('confirmed: false'), "Indicative courier quote must remain unconfirmed");
assert.ok(!source.includes('deliveryEstimate.total'), "Checkout must not silently add an indicative rate to a payable total");
assert.ok(source.includes('rateQuote?"₹"+rateQuote.total.toFixed(2):"To be confirmed"'), "Checkout may display only the clearly indicative quote or pending fee");
console.log("PASS: delivery fee fail-closed contract");
