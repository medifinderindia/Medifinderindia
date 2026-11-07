# Phase 14 — Session Race and Sign-out Privacy Hardening

## Completed
- Added a monotonically increasing load sequence to the V2 integration bootstrap.
- Every new load invalidates older work and aborts its prior catalogue request.
- Results from an old session cannot overwrite the current session's catalogue after an account switch or newer auth event.
- When the session is signed out, pending card rendering is cancelled, the product grid is cleared, and the legacy action bridge is removed.
- Destroying the integration invalidates outstanding loads before aborting and unsubscribing.
- Added `test-auth-session.js` for valid session, signed-out session, and mismatched Auth user cases.
- Added the auth-session test to the Customer JavaScript Parity Audit workflow.

## Verification
- The changes are committed to `feat/customer-panel-v2-foundation`.
- The GitHub Actions workflow is configured to run auth, catalogue, wishlist, legacy action, and source/bundle parity checks.
- A green workflow run has not yet been confirmed; do not treat CI as passed.
- Live Android WebView testing remains pending.

## Production safety
- No production customer HTML/JS/CSS, Supabase schema/RLS, live routes, or APK workflow was changed.
- V2 remains an isolated preview and should not be used for real orders, payments, or bookings.
