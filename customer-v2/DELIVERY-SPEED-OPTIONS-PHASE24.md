# Phase 24 — Delivery Speed Options

## Completed
- Added Standard, Same Day and 30 Minutes delivery choices to the V2 checkout preview.
- Standard is the default option.
- Same Day and 30 Minutes stay disabled until the entered PIN is verified against an approved `service_zones` record.
- Changing the PIN clears prior serviceability and resets a fast option back to Standard.
- Added legacy static speed surcharges: Same Day ₹10 and 30 Minutes ₹20.
- Selected speed surcharge is reflected in the preview estimate.
- Added CI JavaScript syntax validation for the checkout UI.

## Boundaries
- An approved service-zone PIN only enables the choice in this preview; it does not confirm a rider, pharmacy, stock, or actual 30-minute/same-day service slot.
- Legacy UI labels these as 30 Minutes and Same Day; no separate partner capacity/coverage table or booking API has been verified.
- Standard shipping still needs live Shiprocket rate integration; current delivery estimate remains an estimate.
- Speed surcharge is copied from the legacy cart HTML data-fee values, but the preview does not place orders or charge the user.
- No payment, coupon redemption, coin debit, stock reservation, order creation or delivery promise is enabled.

## Verification and production safety
- Committed to `feat/customer-panel-v2-foundation`.
- CI syntax check configured; successful Actions result not confirmed.
- No live website, production database/schema, payment flow or APK workflow changed.
