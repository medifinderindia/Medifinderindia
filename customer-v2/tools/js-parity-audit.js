#!/usr/bin/env node
/**
 * Read-only source/bundle parity audit.
 * This script intentionally does not rewrite user.min.js.
 */
const fs = require('node:fs');
const vm = require('node:vm');

const sourcePath = process.argv[2] || 'user.js';
const bundlePath = process.argv[3] || 'user.min.js';
const source = fs.readFileSync(sourcePath, 'utf8');
const bundle = fs.readFileSync(bundlePath, 'utf8');

function syntaxCheck(label, code) {
  try { new vm.Script(code, { filename: label }); return { ok: true }; }
  catch (error) { return { ok: false, error: error.message }; }
}

const requiredSignals = [
  ['Android native bridge', 'MFAndroid'],
  ['Home startup', 'setupHomePageModules'],
  ['Page-entry lifecycle', 'mf:page-enter'],
  ['Cart module', 'setupCartPageModules'],
  ['Orders module', 'setupOrdersPageModules'],
  ['Profile module', 'setupProfilePageModules'],
  ['Map module', 'setupMapPageModules'],
  ['Prescription upload flow', 'handlePrescriptionFile']
];

const sourceSyntax = syntaxCheck(sourcePath, source);
const bundleSyntax = syntaxCheck(bundlePath, bundle);
const rows = requiredSignals.map(([label, token]) => ({
  feature: label,
  source: source.includes(token),
  bundle: bundle.includes(token),
  parity: source.includes(token) === bundle.includes(token)
}));

const report = {
  audit: 'MediFinder customer JS source/bundle parity',
  mode: 'read-only; no output bundle generated',
  source: { file: sourcePath, bytes: Buffer.byteLength(source), syntax: sourceSyntax },
  bundle: { file: bundlePath, bytes: Buffer.byteLength(bundle), syntax: bundleSyntax },
  signals: rows,
  mismatches: rows.filter(row => !row.parity).map(row => row.feature)
};
console.log(JSON.stringify(report, null, 2));
if (!sourceSyntax.ok || !bundleSyntax.ok) process.exitCode = 2;
