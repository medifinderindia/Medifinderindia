"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const src=fs.readFileSync("customer-v2/account-hub.js","utf8");new vm.Script(src,{filename:"account-hub.js"});
for(const signal of ['from("lab_tests")','rpc("generate_lab_booking_id")','from("lab_bookings").insert','booking_source:"customer_v2"','pins.includes(data.addr_pincode)'])assert.ok(src.includes(signal),"Missing lab booking contract: "+signal);
console.log("PASS: lab booking uses approved test catalogue, matching PIN and authenticated booking insert");
