# Phase 18 — V2 Cart Screen (Preview-Safe)

## Completed
- Added a dedicated Cart view and routed the Cart shortcut/bottom navigation to it.
- Added responsive cart item cards with image fallback, unit price, line total, quantity increase/decrease, and remove action.
- Added empty-cart state with a Browse Products action.
- Added an item count, subtotal, and clearly labelled checkout-time delivery/service charge estimate placeholder.
- The cart UI reads and writes through the isolated V2 cart store using the existing `medi_cart` key.
- Product cards can add to this isolated V2 cart when the V2 session/catalogue is connected but the legacy cart shell is not present.
- Added CSS and CI syntax checks for the new Cart UI and integration scripts.

## Safety and important limits
- This is a preview Cart screen, not production checkout.
- The Checkout button is deliberately disabled. No address, patient, prescription upload, delivery availability, shipping rate, coupon, Tablet Coin, UPI/COD, UTR, payment, stock reservation, or order-creation logic is simulated.
- Prescription-required items are clearly labelled; the preview does not claim that a prescription has been reviewed or approved.
- Existing live checkout remains the source of truth until every existing checkout rule is migrated and verified.
- The preview uses the same browser `medi_cart` local-storage key. Test with non-production/test data only; do not use this preview to change a real live cart.

## Verification
- Changes are committed to `feat/customer-panel-v2-foundation`.
- CI has syntax checks and contract tests configured, but a green run was not confirmed in this phase.
- Real Android WebView interaction and authenticated-session testing remain pending.

## Production safety
- No production `user.html`, `user.js`, `user.min.js`, Supabase schema/RLS, checkout/payment flow, live route, or APK workflow was changed.
