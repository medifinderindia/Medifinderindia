# Phase 23 — Delivery Fee Estimate

## Completed
- Added a V2 delivery-fee estimator matching the legacy cart's static fee bands and ₹499 free-delivery threshold.
- For subtotal below ₹499, fee band is selected by distance: near (up to 5 km), mid (over 5 km through 12 km), far (over 12 km or distance unavailable).
- Subtotal price band is low (below ₹150) or mid (₹150 and above).
- Shows delivery, shipping, platform and processing components as one estimated fee total in checkout.
- Estimate is refreshed after an approved PIN check and cleared when the PIN changes.
- The displayed payable amount remains explicitly an estimate before taxes/payment.

## Important limitations
- This does not yet reproduce the legacy Shiprocket live rate, manual/express/same-day delivery selection, COD fee, or final order-time recalculation.
- The service-zone `dist` field is used only if the PIN lookup returns it; it is not independently confirmed as live road-route distance.
- The legacy cart may refresh shipping from Shiprocket and GPS/OSRM. Until those same sources are safely integrated and server-verified, this V2 number must not be treated as a final delivery charge.
- The ₹499 threshold and fee bands were copied from the existing legacy `user.js` logic; no fee values were invented.
- No order submission or payment is enabled.

## Verification and production safety
- Changes committed to `feat/customer-panel-v2-foundation`.
- CI syntax checks remain configured; a green Actions run was not confirmed.
- Live production pages, database schema/RLS, payment logic and APK workflow remain unchanged.
