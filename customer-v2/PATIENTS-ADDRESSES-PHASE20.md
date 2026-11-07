# Phase 20 — Patient and Saved Address Management

## Completed
- Added a dedicated Patients & Addresses page in the isolated V2 preview.
- Patient records use the existing `patients` table and the legacy `user_email`, `id`, `name`, `age`, and `gender` fields.
- Patient list, add and delete actions are scoped to the authenticated user's email.
- Saved addresses use the existing `user_addresses` table and legacy fields: `user_id`, `tag`, `name`, `phone`, `address1`, `address2`, `landmark`, `city`, `state`, `pincode`, `is_default`, and `created_at`.
- Address list, add, delete and set-default actions are scoped to the authenticated user's Supabase UUID.
- Added validation for Indian 10-digit mobile numbers and six-digit PIN codes, plus required name/address/city fields.
- Added responsive forms, saved-record cards, empty states and account connection/error messages.
- Added CI syntax checks for the new adapter and UI.

## Known limitations / next integration
- The standalone V2 preview does not currently load the production Supabase client or establish a production auth session; without an authenticated host it correctly shows a connection/sign-in error rather than fabricated records.
- Address edits are not yet exposed in the V2 UI; add/delete/default are supported.
- This page does not automatically select an address for checkout, verify delivery serviceability, calculate shipping, or attach a patient to an order. Those are separate checkout integration tasks.
- Setting a default address currently performs two sequential updates; a transactional server-side operation would be preferable if one is later introduced without breaking existing contracts.
- No Supabase schema, RLS policy, or table definition was changed.

## Verification and production safety
- Changes are committed to `feat/customer-panel-v2-foundation`.
- CI syntax and existing contract tests are configured; a successful run has not been confirmed.
- No production customer page, Supabase schema/RLS, live route, checkout/payment logic, or APK workflow was changed.
