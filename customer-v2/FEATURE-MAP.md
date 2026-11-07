# Customer Panel V2 — Feature & Runtime Audit

Audit branch: `feat/customer-panel-v2-foundation`  
Audited files: `user.html`, `user.js`, `user.min.js`  
Scope: read-only inspection. No production customer files or Supabase objects changed.

## 1. Live entry and script order

The customer page contains 14 primary page containers:

- `page-home`
- `page-product-detail`
- `page-campaign`
- `page-shop-detail`
- `page-notification`
- `page-prescriptions`
- `page-shops`
- `page-order`
- `page-cart`
- `page-profile`
- `page-lab-test`
- `page-nurse-booking`
- `page-ambulance`
- `page-tablet-coin`

The HTML currently loads the following deferred scripts in this order:

1. `btn-loading.js?v=20261030a`
2. `permission-every.js?v=c0db5117`
3. Supabase JS v2.43.4
4. `supabase-constants.js`
5. `app-env.js?v=b38a28fb`
6. Leaflet 1.9.4
7. `prod-utils.js?v=00ded7fb`
8. `user.min.js?v=f3948831`
9. `ux-final.js?v=346553eb`
10. `offer.js?v=ee17ca87`
11. `campaign-page.js?v=78f5e57d`
12. `app-settings.js?v=dfe01d34`
13. `push-notifications.js?v=81cb258c`

**Important:** the browser/WebView runs `user.min.js`, not `user.js`. Editing only the readable source file will not fix the live customer page.

## 2. Source/minified mismatch — confirmed

The readable `user.js` contains an Android WebView compatibility wrapper named `mfNativeShareAndRefresh`. It bridges Web Share and clipboard calls to `window.MFAndroid.shareContent` and `window.MFAndroid.copyText`.

The currently referenced `user.min.js` does **not** contain the `MFAndroid` bridge string. This is a concrete source/build mismatch and may explain why native share/clipboard behavior differs from the source file's intended behavior.

The readable source has 391 named function declarations; the minified bundle has 339 named function declarations. Minification can rename or restructure functions, so these raw counts are not a complete semantic diff. The confirmed missing native bridge is the actionable finding; a proper reproducible build/source-map comparison is still required before synchronizing bundles.

## 3. Startup work observed in readable source

The `DOMContentLoaded` initializer calls multiple setup routines, including:

- GPS coordinate detection
- Auth-based saved user data autofill
- Pending order synchronization
- Global notification hub
- Home, cart, orders, and profile setup
- Map setup when a map element exists
- Global close-button listeners
- Pill-alarm engine scheduled every 10 seconds
- Service-worker notification setup
- Live offer/broadcast stream initialization when applicable

Each setup is individually wrapped so a synchronous exception in one step is logged without preventing later steps. However, this does not prevent slow network calls or expensive work from delaying the main thread or competing with first paint.

The readable source also contains five `L.map(` initializations and thirteen `L.marker(` references. This is a static count only; it does not establish that all maps initialize on page load. Map lifecycle must be traced per page before changing it.

## 4. V2 migration rules

- Keep the 14 existing page capabilities and their current URLs/IDs until replacements are verified.
- Do not point the live HTML at the V2 preview yet.
- Reuse the existing authenticated Supabase client/session and existing table/API contracts.
- No schema changes, mock orders, fake products, or simulated payment/booking success.
- Load map code only when the relevant map experience is opened, after confirming each current map flow.
- Preserve camera/gallery/PDF prescription uploads, cart/checkout, order tracking, patient/address data, booking histories, notifications, and Tablet Coin.
- Keep the Android WebView share bridge and native back/session behavior in the final integration.
- Do not add pull-to-refresh; the requested behavior is no pull-to-refresh.

## 5. Next implementation sequence

1. Trace the actual page navigation and event handlers for each of the 14 page containers.
2. Trace the data functions and Supabase table/RPC/storage calls used by each feature.
3. Identify the reproducible build step that produces `user.min.js`, then fix the source/bundle mismatch safely.
4. Implement one V2 feature at a time behind the isolated V2 route and compare it against the old page.
5. Test first paint, category visibility, taps, scrolling, slow/offline network, denied GPS, and Android WebView before any live cutover.
