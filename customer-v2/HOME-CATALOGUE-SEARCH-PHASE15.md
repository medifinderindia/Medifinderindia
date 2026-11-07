# Phase 15 — Home Catalogue Search

## Completed
- Connected the existing Home search field to the approved catalogue rows already fetched for the signed-in session.
- Search matches product name, product_name, category, manufacturer, composition, strength, dosage form, and product type.
- Filtering is client-side against the already loaded catalogue; it does not create extra Supabase queries on each keystroke.
- Added a short debounce to avoid excessive rerenders while typing.
- Preserves the current wishlist adapter when rendering filtered results.
- Displays a clear no-match state and cleans up the debounce timer on integration destroy.
- Added automated unit coverage for name, manufacturer, composition, no-match, and empty-query cases; wired it into the Customer JavaScript Parity workflow.

## Scope and limitations
- Search applies to the already loaded catalogue page (current adapter limit is 120 normal / 300 merchant rows); it is not yet a server-side global search.
- It does not search lab tests, service bookings, nearby shops, or campaign content yet.
- The standalone V2 preview remains disconnected unless an existing authenticated shell explicitly supplies the existing Supabase client and legacy actions.
- No fake products or additional database schema were introduced.

## Verification status
- Code and test are committed to `feat/customer-panel-v2-foundation`.
- The GitHub Actions run could not be retrieved for this check; do not describe CI as passed.
- Live website and Android WebView testing remain pending.

## Production safety
- No production customer page, source/minified JS bundle, Supabase schema/RLS, live route, or APK workflow was modified.
