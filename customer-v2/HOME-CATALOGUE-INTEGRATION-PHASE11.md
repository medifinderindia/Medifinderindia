# Phase 11 — V2 Home Catalogue Preview Integration

## Added
- Home preview now includes a real-product catalogue region, status text, and retry control.
- Loads the existing isolated catalogue adapter, product-card renderer, and integration bootstrap in dependency order.
- Uses only an explicitly supplied `window.supabaseClient`; it does not create a second Supabase client or embed credentials.
- If no client/session is supplied, the preview shows a clear disconnected state and renders no sample/fake products.
- Product cards render in small animation-frame chunks and use lazy image decoding.
- Product actions remain disabled until an explicit, reviewed action bridge is supplied.

## Legacy contract findings
- Existing `addToCart(product)` accepts a product-like object with camelCase keys including `id`, `name`, `price`, `mrp`, `img`, `isRx`, `merchantId`, and `weightKg`.
- Existing `navigateToProductDetail(data)` stores and paints the supplied data object, then navigates to the legacy product-detail page.
- The legacy source does not define `handleQuickAddToCart` in the inspected branch.
- The exact wishlist state and persistence flow has not yet been fully verified. Therefore V2 does not write guessed wishlist rows or local-storage keys.
- The V2 preview does not load legacy `user.js`, legacy page markup, or live account code. It is intentionally isolated.

## Safety / scope
- No production `user.html`, `user.js`, `user.min.js`, Supabase schema, RLS, auth, production routes, or APK workflow changed.
- No real order, payment, booking, or account mutation is possible from this preview.
- Do not merge or deploy this phase as a replacement customer panel.

## Verification status
- The existing catalogue adapter test is already part of the Customer JavaScript Parity Audit workflow.
- This phase adds integration code and script references; a successful GitHub Actions run must still be observed before calling the phase CI-verified.
- Live product loading cannot be confirmed from this isolated preview until a trusted existing session/client is explicitly injected.
