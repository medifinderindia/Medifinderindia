# Phase 26 — Checkout startup selector regression fix

## Finding
The checkout UI initialized its PIN input with the malformed selector `[data-checkout-pincode` (missing the closing `]`). Calling `querySelector` with that selector throws a DOMException during module startup, preventing the rest of the checkout UI from initializing.

## Changes
- Corrected the selector to `[data-checkout-pincode]`.
- Added `tools/test-checkout-ui-contract.js` to verify that the matching data attribute exists in the V2 HTML and that the JavaScript uses the closed selector.
- Added the regression test to the customer JavaScript GitHub Actions workflow.

## Scope and verification
- Changes are limited to `customer-v2/` and its dedicated CI workflow on `feat/customer-panel-v2-foundation`.
- No production page, minified bundle, Supabase schema/data, auth, payment, or APK workflow was changed.
- The test is committed for GitHub Actions; it has not been executed in this chat environment. Browser and Android WebView runtime checks remain required.
