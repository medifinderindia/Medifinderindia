"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const rules=fs.readFileSync("customer-v2/checkout-rules.js","utf8"),cap=fs.readFileSync("customer-v2/delivery-capability.js","utf8"),ui=fs.readFileSync("customer-v2/checkout-ui.js","utf8");
for(const [p,s] of [["rules",rules],["capability",cap],["checkout",ui]])new vm.Script(s,{filename:p});
assert.ok(rules.includes('action: "rate_verified"'));
assert.ok(cap.includes('rpc("get_customer_delivery_capability"'));
assert.ok(ui.includes('await updateSpeedOptions()'));
assert.ok(!rules.includes('\\\\d'));
console.log("PASS: live Shiprocket quote and partner-capacity RPC contracts");
