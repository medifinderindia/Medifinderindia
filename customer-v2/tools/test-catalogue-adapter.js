#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("customer-v2/catalogue-adapter.js", "utf8");
const calls = [];
const rows = [{ id: 9, status: "Approved", name: "Real test row" }];
const query = {
  from(table) { calls.push(["from", table]); return this; },
  select(columns) { calls.push(["select", columns]); return this; },
  eq(column, value) { calls.push(["eq", column, value]); return this; },
  order(column, options) { calls.push(["order", column, options]); return this; },
  limit(value) { calls.push(["limit", value]); return this; },
  abortSignal(signal) { calls.push(["abortSignal", signal]); return this; },
  then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); }
};
const context = { window: {}, supabase: { from: (...args) => query.from(...args) } };
vm.runInNewContext(source, context);
const provider = context.window.MFCustomerV2Catalogue.createHomeCatalogueProvider(context.supabase);

(async () => {
  const normal = await provider({});
  assert.equal(normal, rows);
  assert.deepEqual(calls, [
    ["from", "medicines"], ["select", "*"], ["eq", "status", "Approved"],
    ["order", "id", { ascending: false }], ["limit", 120]
  ]);
  calls.length = 0;
  await provider({ merchantId: "merchant-uuid", instrumentMode: true });
  assert.deepEqual(calls, [
    ["from", "medicines"], ["select", "*"], ["eq", "status", "Approved"],
    ["order", "id", { ascending: false }], ["limit", 300],
    ["eq", "merchant_id", "merchant-uuid"], ["eq", "product_type", "Instrument"]
  ]);
  const failing = context.window.MFCustomerV2Catalogue.createHomeCatalogueProvider({
    from() { return { select() { return this; }, eq() { return this; }, order() { return this; },
      limit() { return Promise.resolve({ data: null, error: new Error("network failure") }); } }; }
  });
  await assert.rejects(() => failing({}), /network failure/);
  console.log("PASS: approved catalogue filters, limits, and error propagation");
})().catch(error => { console.error(error); process.exitCode = 1; });
