"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "..", "delivery-capability.js"), "utf8");
const window = {};
vm.runInNewContext(source, { window, Object });
const resolve = window.MFCustomerV2DeliveryCapability.resolve;
assert.equal(typeof resolve, "function");
(async () => {
  const missing = await resolve(null, "733140", []);
  assert.equal(missing.status, "unknown");
  assert.equal(missing.available, false);

  const rejected = await resolve({
    rpc: async () => ({ data: { serviceable: false, stock_verified: false, reason: "PIN unavailable" }, error: null })
  }, "733140", [{ id: 12 }]);
  assert.equal(rejected.status, "unavailable");
  assert.equal(rejected.available, false);

  const zoneOnly = await resolve({
    rpc: async () => ({ data: { serviceable: true, stock_verified: false, fresh_online_riders: 3, reason: "Stock not verified" }, error: null })
  }, "733140", [{ id: 12 }]);
  assert.equal(zoneOnly.status, "unknown");
  assert.equal(zoneOnly.available, false);
  assert.match(zoneOnly.reason, /stock/i);

  const noRiders = await resolve({
    rpc: async () => ({ data: { serviceable: true, stock_verified: true, fresh_online_riders: 0, reason: "No fresh verified delivery rider is online" }, error: null })
  }, "733140", [{ id: 12 }]);
  assert.equal(noRiders.status, "unknown");
  assert.equal(noRiders.available, false);
  assert.match(noRiders.reason, /rider/i);

  const verified = await resolve({
    rpc: async (name, args) => {
      assert.equal(name, "get_customer_delivery_capability");
      assert.deepEqual(Array.from(args.p_product_ids), [12]);
      return { data: { serviceable: true, stock_verified: true, fresh_online_riders: 2, sameday: true, express_30m: false }, error: null };
    }
  }, "733140", [{ id: 12 }]);
  assert.equal(verified.status, "available");
  assert.equal(verified.available, true);
  assert.equal(verified.sameday, true);
  assert.equal(verified.express_30m, false);

  await assert.rejects(() => resolve({
    rpc: async () => ({ data: null, error: new Error("network") })
  }, "733140", [{ id: 12 }]), /could not be checked/i);
  console.log("PASS: delivery capability fails closed unless PIN, cart stock and partner capacity are verified");
})().catch(error => { console.error(error); process.exitCode = 1; });
