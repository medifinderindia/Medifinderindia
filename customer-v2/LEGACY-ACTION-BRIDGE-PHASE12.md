# Phase 12 — Legacy Action Bridge Hardening

## Completed
- Rechecked the actual legacy `addToCart(product)` implementation: it expects a product object with `id`, `name`, `price`, `mrp`, `img`, `isRx`, `merchantId`, and `weightKg`. It persists through the existing `medi_cart` key and refreshes the existing cart badge/page when present.
- Rechecked `navigateToProductDetail(data)`: it stores `currentProduct`, paints the existing product detail UI, and navigates through the existing legacy page navigation.
- Kept the explicit bridge in `legacy-actions.js`; V2 cards do not call guessed legacy function signatures directly.
- Integration now exposes actions only when both verified legacy functions exist. Otherwise actions remain unavailable.
- Wishlist persistence now restores the previous local state if the Supabase write fails; the card no longer flips its heart icon optimistically on a failed request.

## Important integration boundary
- The standalone V2 preview does not load the legacy `user.js` or the production page shell. Therefore it cannot safely invoke the live legacy Cart/Product Details functions by itself.
- The bridge is ready for the later authenticated-shell migration, where the existing `window.supabaseClient`, `addToCart`, and `navigateToProductDetail` are already initialized.
- The current preview must not be treated as a working shopping app or used for real orders/payments.

## Verification
- The GitHub Actions workflow includes catalogue, wishlist, and legacy-action contract tests.
- Workflow execution status was not available for verification in this step. Do not call this CI-passed until a green run is observed.

## Production safety
- No production `user.html`, `user.js`, `user.min.js`, Supabase schema/RLS/auth, live route, or APK workflow was changed.
