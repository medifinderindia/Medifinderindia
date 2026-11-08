"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const src=fs.readFileSync("customer-v2/account-hub.js","utf8");
new vm.Script(src,{filename:"account-hub.js"});
assert.ok(src.includes('from("notifications").update({ is_read: true })'));
assert.ok(src.includes('.eq("user_id", auth.user.id)'));
assert.ok(src.includes('if (!row.is_read && row.user_id)'));
console.log("PASS: notification read action is scoped to the signed-in owner");
