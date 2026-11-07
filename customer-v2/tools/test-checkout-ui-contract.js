#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("customer-v2/index.html", "utf8");
const source = fs.readFileSync("customer-v2/checkout-ui.js", "utf8");

// Catch malformed CSS selectors during review rather than letting checkout boot fail.
assert.match(html, /data-checkout-pincode(?:[\\s>])/);
assert.match(source, /pin=\\$\\("\\[data-checkout-pincode\\]"\\)/);
assert.doesNotMatch(source, /pin=\\$\\("\\[data-checkout-pincode"\\)/);
new vm.Script(source, { filename: "customer-v2/checkout-ui.js" });
console.log("PASS: checkout PIN selector exists in HTML and is syntactically closed in JS");
