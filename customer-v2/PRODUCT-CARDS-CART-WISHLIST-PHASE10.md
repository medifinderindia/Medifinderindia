# Phase 10 — Real Product Cards, Cart and Wishlist

## Added
- `customer-v2/product-cards.js`: safe DOM-built product cards using actual approved catalogue rows; images, current price/MRP/discount, category, manufacturer, prescription flag, stock state, details, Add to Cart, and wishlist actions.
- `customer-v2/product-cards.css`: responsive mobile/desktop product grid.
- The Add to Cart action reuses the existing global `handleQuickAddToCart` contract and card dataset, which leads to the existing `addToCart()` implementation and `medi_cart` storage. Product details reuse `navigateToProductDetail()`.
- Wishlist uses the existing `medi_wishlist` local key and existing `user_wishlist` table with `user_id,medicine_id` upsert/delete. It uses the existing shared `window.supabaseClient`; it does not create another Supabase client.
- All DB-provided labels are assigned with `textContent`, not injected as HTML.

## Integration
The files remain an isolated V2 module and are not yet wired into the preview's HTML or the live page. The host must load the shared Supabase client and legacy customer actions first, then call `MFCustomerV2Catalogue.createHomeCatalogueProvider(window.supabaseClient)`, load rows, and pass them to `MFCustomerV2ProductCards.render(root, rows)`. Add the CSS and module scripts to the V2 preview only after checking its root markup.

## Important
- Product data is not fabricated.
- Stock <= 0 disables buy/cart.
- Prescription-required products retain the existing cart handler's prescription flow.
- If wishlist sync fails, local wishlist remains available and a message explains the sync limitation.
- No database, RLS, auth, checkout, payment, live website, or APK changes.
