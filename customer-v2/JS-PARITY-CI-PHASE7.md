# Phase 7 — Read-only JavaScript Parity CI

## Added files
- `customer-v2/tools/js-parity-audit.js`: checks JavaScript syntax for both the readable source and loaded minified bundle, then reports parity for critical feature signals.
- `.github/workflows/customer-js-parity.yml`: runs the audit on demand and when customer JavaScript/V2 audit files change on the V2 branch; uploads a JSON report.

## Important safety behavior
- The audit does not rewrite, minify, or publish `user.min.js`.
- It does not alter the Android APK workflow.
- Syntax errors fail the job. Feature-token mismatches are reported for review rather than automatically failing, because the two files are known to have intentional/legacy implementation differences and a token-only comparison is not proof of behavioral equivalence.
- Current checks cover Android native bridge, Home startup, page-entry lifecycle, cart, orders, profile, maps, and prescription upload.
- This is a guardrail and evidence report, not a full browser/WebView integration test.

## Why not auto-minify now?
The exact historical minifier and options remain unknown, and source/bundle behavior already differs. Automatically replacing the live bundle could regress category first paint or Android native sharing. Canonical-source selection and runtime tests must come first.

## Run locally
```sh
node customer-v2/tools/js-parity-audit.js user.js user.min.js
```
