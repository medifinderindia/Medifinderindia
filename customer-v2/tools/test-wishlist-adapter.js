#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("customer-v2/wishlist-adapter.js", "utf8");
const calls = [];
const store = new Map([["medi_wishlist", JSON.stringify(["7"])]]);
const storage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value))
};
let resultRows = [{ medicine_id: 7 }];
const client = {
  from(table) {
    assert.equal(table, "user_wishlist");
    const query = {
      select(columns) { calls.push(["select", columns]); return this; },
      eq(column, value) { calls.push(["eq", column, value]); return this; },
      upsert(row, options) { calls.push(["upsert", row, options]); return Promise.resolve({ error: null }); },
      delete() { calls.push(["delete"]); return this; },
      then(resolve) { return Promise.resolve({ data: resultRows, error: null }).then(resolve); }
    };
    return query;
  }
};
const context = { window: { localStorage: storage } };
vm.runInNewContext(source, context);
const adapter = context.window.MFCustomerV2Wishlist.createWishlistAdapter({
  supabase: client, getUserId: async () => "user-123", storage
});

(async () => {
  assert.deepEqual(await adapter.getSavedIds(), ["7"]);
  await adapter.setSaved("9", true);
  assert.deepEqual(calls.at(-1), ["upsert", { user_id: "user-123", medicine_id: "9" }, { onConflict: "user_id,medicine_id" }]);
  await adapter.setSaved("7", false);
  assert.deepEqual(calls.slice(-3), [["delete"], ["eq", "user_id", "user-123"], ["eq", "medicine_id", "7"]]);
  const localOnly = context.window.MFCustomerV2Wishlist.createWishlistAdapter({ storage });
  assert.deepEqual(await localOnly.setSaved("11", true), { localOnly: true, saved: true });
  console.log("PASS: legacy wishlist key, user_wishlist select/upsert/delete contract");
})().catch(error => { console.error(error); process.exitCode = 1; });
