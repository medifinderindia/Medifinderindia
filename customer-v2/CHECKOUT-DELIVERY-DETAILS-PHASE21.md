# Phase 21 — Delivery Details Review (Preview-Safe)

## Completed
- Added a dedicated Delivery Details view and a Continue to Delivery Details action from the V2 Cart.
- Loads authenticated account patient and saved-address records through the existing V2 People adapter.
- Allows selecting Myself or a saved patient.
- Allows selecting a saved delivery address, preferring the default address initially.
- Displays cart line items and items subtotal.
- Added a six-digit Indian PIN input with numeric-only client-side formatting.
- Added checkout UI styles and a CI JavaScript syntax check.
- Added Edit controls for saved patients and addresses in the Patients & Addresses page.

## Deliberately not enabled
- PIN-code serviceability is not checked. No service zone table contract or verified serviceability function was established in this phase, so the UI explicitly says availability is unknown.
- Delivery fee, express/same-day options, coupon validation, Tablet Coin balance/redeem, tax, payment method, UPI/QR/UTR, COD eligibility, stock reservation, and order creation remain disabled.
- The Place Order button is disabled. No real or fake order can be submitted from this preview.
- The selected patient/address is currently view state only and is not yet passed into a server-verified order creation flow.

## Verification
- Code committed to `feat/customer-panel-v2-foundation`.
- GitHub Actions syntax check is configured; a green run was not confirmed.
- Real authenticated Supabase session and Android WebView tests remain pending.

## Production safety
- No production customer HTML/JS bundle, Supabase schema/RLS, live checkout, payment function, APK workflow, or production route was changed.
