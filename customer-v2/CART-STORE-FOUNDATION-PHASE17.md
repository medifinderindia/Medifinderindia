# Phase 17 — Legacy Cart Store Foundation

## Completed
- Added an isolated V2 cart store using the existing `medi_cart` local-storage key.
- Existing cart rows are read without discarding legacy fields; the store normalizes only quantity, price, MRP, Rx and Rx-verification values for its calculated snapshot.
- Added add, quantity update, remove, item-count and subtotal operations.
- Adding an existing product increments its quantity, matching the legacy `addToCart(product)` behavior.
- New prescription-required products are marked `isRx: true` and `rxVerified: false`, so they remain blocked pending the existing prescription workflow.
- Preserves merchant ID, weight, legacy fee-exemption flags, and sponsor discount slot metadata when adding a new product.
- Added a Node contract test for existing cart migration, add/increment, quantity update, removal, totals, Rx flags and invalid input.
- Added the cart test to the V2 GitHub Actions workflow.

## Not yet integrated
- This is the cart data/store foundation, not a finished Cart page.
- Checkout, prescription upload, patient selection, address validation, delivery fees, coupon/coin application, payment, order creation and stock validation remain on the existing production flow and must be explicitly migrated before V2 can replace it.
- Do not use this preview for real purchases.

## Verification
- Code and tests are committed to `feat/customer-panel-v2-foundation`.
- GitHub Actions green status has not been confirmed in this phase.

## Production safety
- No production `user.html`, `user.js`, `user.min.js`, Supabase schema/RLS, checkout/payment flow, live route, or APK workflow was changed.
