#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const values = new Map([["medi_cart", JSON.stringify([
  { id: 5, name: "Old item", price: 10, mrp: 12, qty: 2, isRx: false }
])]]);
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
const context = { window: { localStorage: storage } };
vm.runInNewContext(fs.readFileSync("customer-v2/cart-store.js", "utf8"), context);
const cart = context.window.MFCustomerV2Cart.createCartStore(storage);
let state = cart.snapshot();
assert.equal(state.itemCount, 2);
assert.equal(state.subtotal, 20);
cart.add({ id: 5, name: "Old item", price: 10, mrp: 12 });
state = cart.snapshot();
assert.equal(state.items.length, 1);
assert.equal(state.items[0].qty, 3);
cart.add({ id: 8, name: "Rx item", price: 30, isRx: true, merchantId: "m-1" });
state = cart.snapshot();
assert.equal(state.itemCount, 4);
assert.equal(state.subtotal, 60);
const rx = state.items.find(item => item.id === 8);
assert.equal(rx.isRx, true);
assert.equal(rx.rxVerified, false);
cart.setQuantity(8, 2);
assert.equal(cart.snapshot().itemCount, 5);
cart.remove(5);
state = cart.snapshot();
assert.equal(state.items.length, 1);
assert.equal(state.subtotal, 60);
assert.throws(() => cart.setQuantity(8, 0));
assert.throws(() => cart.add({ name: "Missing ID" }));
console.log("PASS: legacy medi_cart migration, add, quantity, remove, totals, and Rx flags");
