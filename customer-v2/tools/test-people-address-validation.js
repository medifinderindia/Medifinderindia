#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("customer-v2/people-adapter.js", "utf8");
const context = { window: {} };
vm.runInNewContext(source, context, { filename: "people-adapter.js" });

let inserted = null;
const builder = {
  insert(rows) { inserted = rows[0]; return this; },
  select() { return this; },
  single() { return Promise.resolve({ data: inserted, error: null }); }
};
const client = { from(table) { assert.equal(table, "user_addresses"); return builder; } };
const people = context.window.MFCustomerV2People.create(client, { id: "user-1", email: "test@example.com" });

(async () => {
  const saved = await people.saveAddress({
    name: "Test User", phone: "+91 98765-43210", address1: "Main Road",
    city: "Gangarampur", state: "West Bengal", pincode: "733140"
  });
  assert.equal(saved.phone, "9876543210", "phone should normalize to 10 digits");
  assert.equal(saved.pincode, "733140", "PIN should normalize to 6 digits");
  assert.equal(saved.user_id, "user-1");

  const phoneOnlyPeople = context.window.MFCustomerV2People.create(client, { id: "phone-user-2", phone: "+919876543210" });
  assert.deepEqual(await phoneOnlyPeople.listPatients(), [], "phone-only accounts should still reach checkout without an email lookup");
  const phoneAddress = await phoneOnlyPeople.saveAddress({
    name: "Phone Customer", phone: "9876543210", address1: "Station Road",
    city: "Gangarampur", state: "West Bengal", pincode: "733140"
  });
  assert.equal(phoneAddress.user_id, "phone-user-2", "phone-only account address must be linked by auth user ID");

  await assert.rejects(
    () => people.saveAddress({ name: "Test", phone: "12345", address1: "Road", city: "Town", pincode: "733140" }),
    /valid 10-digit Indian phone/
  );
  await assert.rejects(
    () => people.saveAddress({ name: "Test", phone: "9876543210", address1: "Road", city: "Town", pincode: "12345" }),
    /6-digit PIN code/
  );
  console.log("PASS: address phone and PIN normalization/validation");
})().catch(error => { console.error(error); process.exitCode = 1; });
