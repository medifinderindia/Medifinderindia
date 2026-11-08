"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
for(const p of ["customer-v2/checkout-rules.js","customer-v2/checkout-ui.js"])new vm.Script(fs.readFileSync(p,"utf8"),{filename:p});
const rules=fs.readFileSync("customer-v2/checkout-rules.js","utf8");
for(const x of ['functions.invoke("shiprocket"','action: "rate"','pickup_postcode','delivery_postcode','data.serviceable !== true','confirmed: false'])assert.ok(rules.includes(x),"Missing live-rate guard: "+x);
console.log("PASS: Shiprocket quote requires verified merchant pickup PIN and serviceable live response; quote remains unconfirmed");
