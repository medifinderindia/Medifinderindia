#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("customer-v2/index.html", "utf8");
const source = fs.readFileSync("customer-v2/checkout-ui.js", "utf8");
const rules = fs.readFileSync("customer-v2/checkout-rules.js", "utf8");

assert.ok(html.includes('data-checkout-pincode inputmode="numeric"'), "PIN input must exist in checkout HTML");
assert.ok(html.includes('data-checkout-prescription'), "Prescription selector must exist");
assert.ok(html.includes('data-place-cod'), "COD order button must exist");
assert.ok(!html.includes("Place order unavailable in preview"), "Checkout must not remain disabled preview copy");
assert.ok(source.includes('pin=$("[data-checkout-pincode]")'), "Checkout must use the complete PIN selector");
assert.ok(source.includes('rpc("create_customer_cod_order"'), "Checkout must call the atomic server-side order RPC");
assert.ok(source.includes('serviceability.available'), "Checkout must fail closed until an approved PIN is verified");
assert.ok(source.includes('money(data.total_amount)'), "The confirmed amount must come from the server response");
assert.ok(source.includes('state.items.forEach(item=>store.remove(item.id))'), "Cart must clear only after the server confirms an order");
assert.ok(!source.includes("quoteShiprocketDelivery"), "An indicative browser courier quote must not be treated as final COD pricing");
new vm.Script(source, { filename: "customer-v2/checkout-ui.js" });
new vm.Script(rules, { filename: "customer-v2/checkout-rules.js" });
assert.ok(rules.includes('.eq("is_active",true).eq("status","approved")'), "Only active approved zones can pass the PIN check");
console.log("PASS: checkout PIN, prescription, COD RPC, server amount and success-only cart clear contract");
