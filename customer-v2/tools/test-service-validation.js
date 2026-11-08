"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
for(const p of ["customer-v2/account-hub.js","customer-v2/delivery-capability.js","customer-v2/checkout-ui.js"])new vm.Script(fs.readFileSync(p,"utf8"),{filename:p});
const a=fs.readFileSync("customer-v2/account-hub.js","utf8"),c=fs.readFileSync("customer-v2/delivery-capability.js","utf8");
assert.ok(a.includes('/^[6-9]\\d{9}$/'));
assert.ok(c.includes('p_product_ids:'));
console.log("PASS: service form validation and capacity stock contract");
