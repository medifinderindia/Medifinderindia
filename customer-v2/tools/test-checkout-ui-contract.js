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
