"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const src=fs.readFileSync("customer-v2/account-hub.js","utf8");
new vm.Script(src,{filename:"account-hub.js"});
assert.ok(src.includes('rpc("claim_daily_coin_bonus")'));
assert.ok(src.includes('claim.data.ok !== true'));
assert.ok(src.includes('Daily check-in · Claim 1 coin'));
console.log("PASS: daily check-in uses server-side atomic claim RPC");
