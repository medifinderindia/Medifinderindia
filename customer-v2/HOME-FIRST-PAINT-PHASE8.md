# Phase 8 — Home First-Paint Migration Slice (Isolated Prototype)

## Objective
Make the V2 Home shell immediately usable while catalogue data is loading, without inventing products or changing the live customer panel.

## Implemented in this slice
- A small Home module API that paints the static service/category shell synchronously.
- Product data is accepted only from an injected real-data provider; no demo products are embedded.
- Catalogue rendering is chunked with `requestAnimationFrame` so a large product list does not create one long DOM task.
- A generation token prevents an older request from overwriting a newer Home render after navigation/search.
- Empty, loading, offline/error, and loaded states are explicit.
- No GPS, Leaflet, geocoding, order sync, or realtime subscription is started by this module.
- No pull-to-refresh behavior is added.

## Integration boundary
The module is intentionally not wired to `user.html`, `user.js`, `user.min.js`, or Supabase yet. Before integration, the existing approved-medicine query, merchant metadata, filters, stock rules, product-card actions, and auth/session behavior must be connected through a reviewed adapter. The module must not create a second Supabase client or duplicate authentication state.

## Required tests before integration
1. Home shell and service/category tiles appear before any catalogue request resolves.
2. Slow network: shell remains responsive and loading state remains visible.
3. Empty catalogue: show a clear empty state, not a blank screen.
4. Request failure/offline: show retry affordance without freezing other navigation.
5. Rapid navigation/search: stale responses cannot repaint the wrong view.
6. Large catalogue: chunked render keeps taps and scroll responsive while preserving the complete result set.
7. Android WebView: verify touch, keyboard, viewport/safe-area, and back navigation.
8. No map/GPS request occurs merely by opening Home.

## Safety
This is a V2-only prototype. No live source, production bundle, APK, Supabase data/schema, or customer route is changed.
