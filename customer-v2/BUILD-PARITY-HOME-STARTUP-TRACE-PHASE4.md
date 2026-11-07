# Customer Panel V2 — Build Parity & Home Startup Trace (Phase 4)

Branch audited: `feat/customer-panel-v2-foundation`

## Scope and safety

This is a static source audit of the checked-in `user.html`, `user.js`, and `user.min.js`. It does not measure runtime timings on the user's Realme Android device. No production file, live route, Supabase object, or APK workflow was changed.

## 1. HTML serves the minified file

The checked-in `user.html` script tag loads `user.min.js?v=f3948831`, not `user.js`. Therefore, edits to readable `user.js` alone will not affect the deployed customer panel unless the minified asset is regenerated and the HTML cache version is updated.

## 2. Confirmed source/minified behavioral drift

### Android share and clipboard bridge

Readable `user.js` contains an IIFE named `mfNativeShareAndRefresh`. It detects `window.MFAndroid` and adapts Android's `shareContent()` and `copyText()` methods to `navigator.share` and `navigator.clipboard.writeText`.

A direct content scan of the served `user.min.js` did not find `mfNativeShareAndRefresh` or the `MFAndroid` identifier. This is a concrete parity mismatch, not merely different formatting. It can affect native Android share/clipboard fallback behavior.

### Home category first paint

The minified `setupHomePageModules()` explicitly paints the eight fixed category tiles into `#home-cat-grid` before awaiting `loadHomeProductGrid(isInstrumentMode, merchantFilterId)`.

The readable `user.js` version of `setupHomePageModules()` does not contain that same early-paint block in the corresponding function. It has a later `mfRenderHomeTiles()` helper and call sites, but the implementation path differs. This means the two files are not currently safe to treat as equivalent builds. The minified version actually contains a performance-oriented early category paint that the readable source does not mirror.

## 3. Startup work that can compete with first paint

The readable source's DOMContentLoaded startup sequence invokes, among other work:

- GPS detection
- saved user-data hydration
- pending order sync
- notification hub setup (which awaits a Supabase notification query)
- Home, cart, orders, and profile module setup
- map setup when a map element exists
- pill alarm interval setup
- service-worker notification setup
- offer/broadcast stream setup

Each call is wrapped in try/catch, but that does not prevent asynchronous network work or synchronous DOM work from competing for the main thread. The notification hub itself awaits the initial notification refresh. Map setup includes GPS and reverse geocoding. These are plausible sources of startup contention, but this static audit cannot prove which one causes the reported device freeze.

The minified file's boot section uses a staged `run(...)` / `later(...)` startup pattern, starts the Home module during the first boot pass, and defers GPS and pending-order sync. This is another sign of architectural drift between the two assets.

## 4. Minification/build pipeline not yet established

The APK workflow `.github/workflows/android-apk.yml` builds the Android debug APK and publishes the APK artifact/release. It contains no JavaScript minification step and does not explain how `user.min.js` is generated.

A root `package.json` and common root minifier script candidates were not found at the audited branch paths. The exact authoritative build command and source-of-truth for `user.min.js` therefore remain unverified. Do not regenerate the minified file with an arbitrary tool or overwrite it from `user.js` until the repository's intended minifier/configuration is identified.

## 5. Safe next implementation plan

1. Identify the actual historical/maintainer workflow that produces `user.min.js` and determine which file is authoritative.
2. Reconcile the Android bridge and early category paint in the authoritative source, then regenerate the served asset using the exact project build settings.
3. Keep the first Home frame independent of Supabase: render static category tiles and the page shell synchronously; load products/offers asynchronously with loading states and stale-response protection.
4. Move GPS/reverse-geocoding and map construction to the explicit nearby-shops/map page entry, not general customer-panel startup.
5. Make notification refresh non-blocking for Home first paint; fetch when the notification surface is opened or hydrate the badge in the background.
6. Profile on the actual Android WebView before attributing the freeze to any one startup task.
7. Preserve all existing customer features, Supabase table/RPC contracts, authentication, and no-pull-to-refresh behavior. Test Home, search, product detail, cart/checkout, orders, profile, prescriptions, wishlist, notifications, lab, nurse, ambulance, Tablet Coin, Android share, and offline handling before switching live.

## Evidence summary

- `user.html`: loads `user.min.js?v=f3948831`.
- `user.js`: includes the `mfNativeShareAndRefresh` Android bridge wrapper.
- `user.min.js`: lacks the bridge identifier but contains an early Home category paint before the product-grid await.
- `user.min.js`: uses staged boot scheduling; readable `user.js` has a different DOMContentLoaded startup sequence.
- `.github/workflows/android-apk.yml`: builds/publishes APK only; no JS minification command.
