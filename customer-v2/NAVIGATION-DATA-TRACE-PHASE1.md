# Customer Panel V2 — Navigation & Feature Data Trace (Phase 1)

This is a static trace of the current readable `user.js` and `user.html` on the V2 branch. It records confirmed code paths and intentionally marks areas that still need deeper tracing.

## Confirmed feature paths

| Customer feature | Confirmed implementation path | Existing data/service contract seen |
|---|---|---|
| Home catalogue | `setupHomePageModules()` | `medicines` filtered to Approved; `merchants_public` coordinates are fetched for shop context |
| Cart | `setupCartPageModules()` → `renderCartPage()` | Local cart cache `medi_cart`; saved delivery addresses from `user_addresses`; camera and file prescription inputs |
| Orders | `setupOrdersPageModules()` → `refreshOrdersFromServer()` | `orders` plus `prescription_orders`; user order realtime listener is also set up |
| Profile | `setupProfilePageModules()` | Local profile cache; `profiles`, `patients`, `reminders` are used in account hydration paths |
| Prescription upload | `handlePrescriptionFile()` | Supabase Storage bucket `media`, path prefix `live_slips/`; local prescription archive and prescription-order flow |
| Wishlist | `initWishlistButtons()` | Local `medi_wishlist` cache reconciled with `user_wishlist` |
| Lab tests | `loadTests()`, `startBooking()`, `finalizeBooking()`, `loadMyBookings()` | `lab_tests`, `lab_bookings`, `lab_test_reviews`; booking writes only after successful insert response |
| Nearby pharmacies | `setupMapPageModules()` | Leaflet map, OpenStreetMap tiles, GPS, reverse geocoding via Nominatim; shop list refresh after location resolves |
| Product sharing | delegated handler for `#pd-share-btn` | Builds product URL from `currentProduct`; tries Android native share bridge first, then Web Share |

## Performance observations confirmed in code

1. Home catalogue starts by hiding embedded product cards and showing an empty/loading message, then queries the approved catalogue. It also fetches merchant coordinates and other shop metadata. This is one area to profile for first-paint delay and avoid serial waits.
2. Cart startup calls `renderCartPage()` and begins address loading. Address loading waits for the authenticated user ID before querying `user_addresses`.
3. Orders startup awaits `refreshOrdersFromServer()` before rendering the orders UI and subscribing to order updates. This can delay the first orders-page paint when the network is slow.
4. The map setup requests GPS and reverse-geocodes the result; the map itself creates a Leaflet instance and loads OSM tiles. It should not be part of the Home critical path.
5. Prescription upload waits for Storage upload before the new prescription URL can be used. Upload progress and failure states already exist and must be preserved.

These are code-path observations, not yet measured runtime timings. The next performance step is to add safe timing instrumentation in the isolated V2 route and compare cold start on a real Android WebView.

## Known caution points

- The audit still needs to map every navigation trigger and every profile, nurse, ambulance, and checkout mutation to its exact table/RPC/storage contract.
- A grep that finds no direct `.from('ambulance_bookings')` or `.from('nurse_bookings')` in this large bundle does not mean those services are unused; they may be loaded through RPCs, helper modules, or other scripts.
- Do not copy the existing code wholesale into the preview. Migrate behavior module-by-module with the existing auth/session and error handling.
- Do not change live script references until V2 passes the feature-parity and device tests.

## Next tracing targets

1. Exact navigation route map and page entry/exit hooks.
2. Nurse and ambulance booking reads/writes, RPCs, and realtime subscriptions.
3. Checkout/order creation, payment verification, cancellation, and prescription-order lifecycle.
4. Profile, addresses, patient records, reminders, notifications, and Tablet Coin data ownership.
