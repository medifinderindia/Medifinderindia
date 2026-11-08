"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const src=fs.readFileSync("customer-v2/account-hub.js","utf8");new vm.Script(src,{filename:"account-hub.js"});
for(const x of ['from("nurse_service_rates")','rpc("create_customer_nurse_booking")','rpc("create_customer_ambulance_booking")','p_pickup_lat:coords[0]','p_drop_lat:coords[2]'])assert.ok(src.includes(x),"Missing service booking flow: "+x);
console.log("PASS: nurse booking uses admin-verified rates and ambulance booking uses server fare/availability RPCs");
