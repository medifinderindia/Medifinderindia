# Customer Panel V2 — Checkout & Performance Trace Phase 3

Branch: `feat/customer-panel-v2-foundation`
Scope: static inspection of the existing `user.html`, `user.js`, and Android APK workflow. No live runtime profiling was available.

## Checkout — verified source flow

- The bill is recalculated from cart subtotal, discount, delivery/shipping/platform/processing fees, COD fee and delivery-speed fee.
- Tablet Coin discount is limited to the wallet balance and the remaining eligible product subtotal after other discounts. The UI implements 1 coin = ₹1.
- The order payload snapshots delivery/payment state, fees, discount, coins used, coupon, prescription reference, patient and delivery coordinates.
- The code first caches the payload in localStorage key `medi_active_orders`, then inserts into Supabase `orders`.
- If the insert fails because a referenced column is missing, it retries after removing the reported unknown payload column (up to 12 attempts). Other failures are queued in `medi_pending_order_sync` for later retry.
- After a successful order insert, it attempts Tablet Coin debit through RPC `use_coins_on_order`, refreshes orders, sends a user notification, snapshots medicine metadata, inserts `order_items`, marks coupons used, records sponsor claims, decrements stock and notifies merchants.
- Some secondary writes are best-effort and errors are swallowed. The order may exist even if an order-items, coin, stock, coupon or merchant-notification side effect fails.
- COD and online payment are deliberately presented differently. COD shows an order-placed confirmation. Online UPI/QR shows payment verification pending; the source explicitly does not treat a UTR as verified payment.
- **Important reliability risk:** coin debit RPC errors are caught and ignored. The client then clears local coin-use state. Verify the database RPC's idempotency and order linkage before changing this; do not trust client-side UI as proof of coin debit.
- **Important order integrity risk:** the pending sync queue stores order payloads, but the full retry path must be tested for duplicate protection and for replaying dependent writes. A retry must never create duplicate orders or double-debit coins.

## Initial load / freeze — source evidence

The HTML includes a full-screen boot loader and loads the large customer script as a deferred script. The script's DOM-ready startup previously audited includes GPS detection, auth hydration, pending-order sync, notification setup, and setup functions for Home, Cart, Orders, Profile and Maps. These are wrapped individually in try/catch, but try/catch does not make asynchronous network work non-blocking or prevent main-thread work.

The following are evidence-backed candidates for performance work, not proven root causes of the reported freeze:

1. **Startup fan-out:** multiple page modules and data hydration start on one page load even though only Home is visible.
2. **GPS/geocoding:** location detection can trigger device permission and network reverse-geocoding; this should not hold up category rendering.
3. **Orders / pending sync:** server refresh and retry can compete with first paint if started before the visible Home is ready.
4. **Realtime/polling:** Tablet Coin currently calls `tcInit()` at script evaluation and subscribes to live updates. Ambulance tracking has polling/realtime/map work that belongs only on its active screen.
5. **Maps:** Leaflet and route/geocoding work should be lazy-loaded on the relevant map/tracking view, not on Home startup.
6. **Heavy DOM:** product grids, category tiles and repeated HTML rendering should be measured and chunked/virtualized if needed; do not assume CSS alone is the cause.

## Android APK build workflow — verified

- `.github/workflows/android-apk.yml` builds a debug APK with Gradle and uploads it as an artifact.
- On non-PR runs it copies the APK to `medifinder-india-latest.apk` and publishes/updates a rolling GitHub release tagged `latest-apk`.
- This workflow does **not** show any JavaScript minification/build step. It packages the Android app; it does not explain how `user.min.js` is generated.
- Therefore the readable `user.js` vs `user.min.js` mismatch (including the Android bridge wrapper present in readable source but absent in the minified file in the earlier comparison) remains unresolved. Find the actual minification source/commit history before regenerating or replacing the minified production asset.

## Safe V2 performance sequence

1. Render Home shell and category tiles immediately from local/static structure; do not wait for GPS, offers, shop metadata or product catalogue network requests.
2. Load products and offers asynchronously with skeletons and bounded timeouts; show retry/empty states on failure.
3. Move Orders, Profile, Cart, Tablet Coin, map and booking data initialization behind their page-enter events.
4. Start and stop realtime channels, polling, observers, intervals and map instances with page lifecycle.
5. Add request cancellation / stale-response guards so a previous page's response cannot update a newly opened page.
6. Add Android WebView smoke checks: login → user page, Home first paint, category taps, rapid navigation, scroll, offline transition, return/back, and opening each booking/map page.
7. Only after runtime tests, migrate feature modules from existing source into V2. Keep current live customer panel and Supabase contracts untouched until acceptance passes.

## Still unverified

- Actual Android device freeze timing, CPU/memory profile and JavaScript exceptions.
- Whether category rendering is delayed by a specific query, promise chain, image load or main-thread loop.
- Server-side constraints/triggers/RLS and RPC idempotency for orders, coins and stock.
- Exact minifier command and source revision used to generate `user.min.js`.
- End-to-end payment verification and duplicate-order handling under intermittent network conditions.
