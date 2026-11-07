#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("customer-v2/auth-session.js", "utf8");
const context = { window: {} };
vm.runInNewContext(source, context);

(async () => {
  const valid = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "u-1" } } }, error: null }),
      getUser: async () => ({ data: { user: { id: "u-1" } }, error: null })
    }
  };
  const result = await context.window.MFCustomerV2Auth.requireAuthenticatedUser(valid);
  assert.equal(result.authenticated, true);
  assert.equal(result.user.id, "u-1");

  const signedOut = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null })
    }
  };
  assert.deepEqual(await context.window.MFCustomerV2Auth.requireAuthenticatedUser(signedOut),
    { authenticated: false, user: null });

  const mismatch = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "u-1" } } }, error: null }),
      getUser: async () => ({ data: { user: { id: "u-2" } }, error: null })
    }
  };
  assert.deepEqual(await context.window.MFCustomerV2Auth.requireAuthenticatedUser(mismatch),
    { authenticated: false, user: null });
  console.log("PASS: V2 auth session validation, signed-out, and mismatched-user cases");
})().catch(error => { console.error(error); process.exitCode = 1; });
