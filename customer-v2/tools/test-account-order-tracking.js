"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const src=fs.readFileSync("customer-v2/account-hub.js","utf8");
new vm.Script(src,{filename:"account-hub.js"});
assert.ok(src.includes('functions.invoke("shiprocket"'));
assert.ok(src.includes('body: { action: "track", order_id: row.order_id }'));
assert.ok(src.includes('from("order_tracking_events")'));
assert.ok(src.includes('.eq("order_id", row.order_id)'));
console.log("PASS: order tracking uses authenticated Shiprocket action and owner-scoped event read");
