#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = { window: {} };
vm.runInNewContext(fs.readFileSync("customer-v2/catalogue-search.js", "utf8"), context);
const filter = context.window.MFCustomerV2Search.filter;
const rows = [
  { id: 1, name: "Paracetamol 500", category: "Medicine", manufacturer: "ABC Pharma" },
  { id: 2, product_name: "Digital Thermometer", category: "Instrument", manufacturer: "HealthCo" },
  { id: 3, name: "Vitamin C", composition: "Ascorbic Acid", manufacturer: "Care Labs" }
];
assert.deepEqual(filter(rows, "thermometer").map(x => x.id), [2]);
assert.deepEqual(filter(rows, "abc pharma").map(x => x.id), [1]);
assert.deepEqual(filter(rows, "ascorbic").map(x => x.id), [3]);
assert.equal(filter(rows, "not found").length, 0);
assert.equal(filter(rows, "").length, 3);
console.log("PASS: catalogue search by name, category, manufacturer, composition and empty query");
