# Phase 23 — Delivery fee safety correction

## Current behavior
- Removed copied static distance/subtotal fee bands and the ₹499 free-delivery threshold from the V2 customer checkout calculation.
- Checkout now marks the delivery fee as **To be confirmed** and keeps the payable total pending until a verified server-side rate is available.
- PIN-zone approval is not used to infer a fee.
- No static delivery, shipping, platform, processing, or speed surcharge is represented as a real charge.

## Required before enabling a real fee
- Audit the deployed `shiprocket` Edge Function implementation and its authentication/secret handling.
- Validate carrier quote response, merchant pickup PINs, cart weight, COD handling, multi-merchant rates, timeouts and server-side order-time recalculation.
- Display a quote only after a successful, validated server response; reconcile final charge before payment/order creation.

## Deployment
- Isolated to `customer-v2/`; production customer pages and database remain untouched.
