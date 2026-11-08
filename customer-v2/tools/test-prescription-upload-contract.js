#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const html=fs.readFileSync("customer-v2/index.html","utf8");
const upload=fs.readFileSync("customer-v2/prescriptions-ui.js","utf8");
const checkout=fs.readFileSync("customer-v2/checkout-ui.js","utf8");
const cards=fs.readFileSync("customer-v2/product-cards.js","utf8");
assert.ok(html.includes('data-prescription-camera'),"Camera capture input must be present");
assert.ok(html.includes('data-prescription-file'),"File upload input must be present");
assert.ok(html.includes('data-prescription-list'),"Saved prescription archive must have a live container");
assert.ok(upload.includes('storage.from("customer-prescriptions").upload(path'),"Prescription files must use the private customer bucket");
assert.ok(upload.includes('const path = userId + "/"'),"Storage path must be scoped to the authenticated user");
assert.ok(upload.includes('prescription_url:path'),"Uploaded file path must be linked to the prescription record");
assert.ok(upload.includes('status:"pending"'),"New prescription submissions must await review");
assert.ok(upload.includes('createSignedUrl(row.prescription_url,300)'),"Private prescription viewing must use a short-lived signed URL");
assert.ok(checkout.includes('.eq("user_id",authUser.id)'),"Checkout must list only the signed-in user's prescription records");
assert.ok(cards.includes('String(p.prescription_req || "").trim().toLowerCase() === "yes"'),"Prescription requirement detection must be case-insensitive");
console.log("PASS: private prescription upload, ownership, review status, archive and checkout linkage");
