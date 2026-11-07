# Phase 22 — Checkout Validation (Preview-Safe)

## Completed
- Connected the V2 Delivery Details screen to the existing `service_zones` read contract: `pin, dist, status`, matching approved status before reporting availability.
- PIN verification is fail-closed: invalid PIN, query error, or missing/unapproved zone never appears serviceable.
- Added coupon validation using the existing `user_coupons` first and public `coupons` fallback, including used state, active dates, minimum order, percentage/fixed discount and max discount cap.
- Added Tablet Coin balance read from `profiles.coins`, and a local preview toggle capped by remaining cart subtotal after coupon discount. No coins are spent.
- Added a checkout subtotal/discount estimate and explicit statement that delivery fees, taxes and final payable total are not yet calculated.
- Added a CI syntax check for the new checkout rules adapter.

## Important boundaries
- This phase performs read-only checks. It does not mark coupons used, debit coins, call `use_coins_on_order`, reserve stock, or create orders.
- The legacy coupon flow marks coupons used only after order insertion; V2 preserves that boundary.
- Legacy service-zone code has a fail-open fallback on network/configuration errors. V2 intentionally fails closed so it cannot promise delivery when verification failed.
- Delivery price is not inferred from zone distance. Legacy fees depend on additional cart/distance logic and shipping-rate refresh; that must be migrated and tested before showing a final amount.
- No UPI, COD, payment verification, order creation or place-order action is enabled.

## Verification and production safety
- Changes committed to `feat/customer-panel-v2-foundation`.
- GitHub Actions is configured to run JS syntax checks and existing parity/contract tests on branch changes. A successful run was not confirmed here.
- Real authenticated-session, RLS, live service-zone/coupon data and Android WebView tests remain pending.
- No production customer page/bundle, Supabase schema/RLS, live checkout, payment functions, APK workflow or production route was changed.
