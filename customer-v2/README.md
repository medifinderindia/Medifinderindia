# MediFinder India — Customer Panel V2 Migration Plan

## Safety rules
- This branch is an isolated rebuild track. Do not replace `user.html`, `user.min.js`, `user.js`, existing CSS, Android WebView entry URLs, Supabase tables, or auth flows during the foundation phase.
- Existing customer features remain the source of truth until each V2 feature is connected to the existing backend and verified.
- No mock orders, fake products, fake payment success, or invented booking availability in production.
- Keep the website and Android WebView on the same shared customer experience.
- Preserve existing URLs/deep links and back-button expectations.

## Baseline inspected on `fix/android-fcm-offline-actions`
- `user.html`: 144,750 characters; 608 unique element IDs; no duplicate IDs detected.
- `user.js`: 722,044 characters; 391 named function declarations.
- The live page currently loads `user.min.js?v=f3948831`, not `user.js`.
- The source and minified JS are known to be divergent; changes must not be made to only one file and assumed live.
- Customer page containers found: 14.
- Current supporting scripts include Supabase JS, Supabase constants, app env, Leaflet, product utilities, user bundle, UX final, offers, campaigns, app settings, and push notifications.
- Android native entry: `app/src/main/java/com/medifinderindia/app/MainActivity.kt`.
- Android APK workflow: `.github/workflows/android-apk.yml`; pushes to `fix/**` and `feat/**` build an APK. A feature-branch build is not by itself a production website deployment.

## Existing feature/page inventory — must be retained
1. Home: greeting, notification badge, medicine search, voice search, quick services, offers/campaigns, prescription camera/gallery/PDF upload, categories, product grid.
2. Product details: gallery, wishlist, ratings/reviews, verified seller/shop link, price/discount/offers, delivery estimate/location, prescription warning, quantity/pack variants, similar products, share.
3. Campaign and offer pages.
4. Shop details: seller profile, verified status, contact/WhatsApp/directions, address/map, delivery details, offers, categories, shop products.
5. Notifications: notification list/dropdown and push preference.
6. Prescription box: upload/list/view and prescription order workflow.
7. Nearby shops/pharmacies: search, map, GPS/live location, result list.
8. Orders: order list, detail, tracking timeline, support/help.
9. Cart and checkout: cart items, prescription attachment, patient selection, saved addresses, GPS/address form, delivery speed, promo code, Tablet Coin, payment drawer.
10. Profile: profile image/name/identity, edit profile, prescription box, orders, wishlist, addresses, patients, pill reminders, referral, offers, terms, privacy, cancellation, complaints, favourite shops, FAQ, language.
11. Lab test: search/categories, serviceability/pincode check, booking, patient/address details, prescription upload, date/time, UPI/COD, UTR confirmation, booking history.
12. Nurse booking: categories, service selection, duration/rates/bill, patient details, prescription, date/time, address/contact, payment, booking history.
13. Ambulance: categories, pickup/destination, GPS, available ambulance results, booking confirmation, live tracking, OTP, driver contact, cancellation, booking history.
14. Tablet Coin: balance, earn/redeem, history.

## V2 architecture
- Build a parallel customer shell under `customer-v2/`; keep the old panel untouched.
- Split presentation and behavior into small modules: app shell/navigation, home/catalog, product/shop, cart/checkout, orders/tracking, prescriptions, service bookings, notifications, profile/rewards.
- One shared Supabase client/auth session adapter; no duplicate sign-in or independent user identity state.
- Feature modules must call existing backend contracts and preserve RLS/security. Do not introduce schema changes unless a verified feature requires them and they are separately reviewed.
- Use event delegation and lifecycle cleanup for page-level listeners; avoid repeated global listeners, duplicate timers, and expensive work during scroll.
- Lazy-load maps and other heavy widgets only when their page/section is opened; never block the first customer screen on map initialization.
- Render skeletons immediately, then load data asynchronously with bounded retries and visible offline/error states.
- Respect reduced-motion settings and Android WebView viewport/safe-area behavior.
- Do not re-enable pull-to-refresh; the current requested behavior is no pull-to-refresh.

## Acceptance checks before cutover
- Every item in the feature inventory has a working, backend-connected V2 equivalent.
- Login/session restoration, logout, role protection, deep links, and Android back behavior work.
- Product search, cart totals, prescription uploads, order creation, payment verification, tracking, bookings, profile, notifications, and rewards use real data.
- No duplicate IDs, uncaught console errors, unhandled promise rejections, or repeated event listeners.
- Test on mobile browser, desktop browser, and Android WebView; check slow/offline network and location permission denied/disabled.
- APK workflow succeeds. Website deployment is separately verified.
- Only after explicit feature parity sign-off should the entry point be switched; retain a rollback path.

## Current status
Foundation branch created from `fix/android-fcm-offline-actions`. This document records the baseline and migration contract. No existing customer files, database objects, or production routes have been modified.
