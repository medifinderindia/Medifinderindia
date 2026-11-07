# Customer Panel V2 — Performance History & Regression-Risk Audit (Phase 5)

Audited the repository's per-file Git history for `user.js`, `user.min.js`, `user.css`, and `user.min.css`. This is a source/history review, not an Android device benchmark. No production code was changed.

## 1. Existing performance work already present in repository history

The recent history shows several deliberate Home/WebView performance changes:

- `acc2b73` — "Defer heavy user dashboard initialization": moved several heavy/background tasks out of the initial DOMContentLoaded sequence.
- `2826108` — "Defer hidden dashboard modules until tab entry": added an `mf:page-enter` handler and initializes cart/orders/profile/shops modules when their page is entered rather than all at startup.
- `5e0a24d` — "Avoid background GPS work on hidden dashboard tabs": limits GPS-triggered cart/home refresh work to the active page.
- `dec3e0e` — "Load Home product images only near viewport": introduced IntersectionObserver-based image activation and reduced the first Home query limit from 120 to 60 (merchant page 300 to 120).
- `ad518e5` — "Preserve full Home catalogue while keeping lazy image loading": restored the query limit to 120 (merchant page 300), explicitly prioritizing catalogue completeness.
- `bcec906` — "Use native lazy image loading in User Home": replaced a custom placeholder + preloader + delayed source swap with browser-native `loading="lazy"` and `decoding="async"`.
- `d893bbe` / `580167a` — disabled thumbnail filter/transition/transform effects for lower-cost Android WebView painting.
- `49b42a3` / `f9c04ff` — reduced animated image paint effects.
- `ec7ef6f` — refreshed the Home performance CSS cache key.

These commits show that the freeze has already been addressed in several layers. A new rewrite should not blindly reapply the same optimizations or undo the catalogue/image behavior that was deliberately restored.

## 2. Important feature/performance trade-off

The Home medicines query limit was lowered to 60 and then restored to 120 after a commit explicitly called out preserving the full catalogue. A future performance patch must not silently cut the number of products or hide legitimate catalogue entries. Prefer pagination/infinite loading or staged rendering while preserving the full result set and filters.

## 3. Lifecycle detail and risk to test

The page-entry initialization commit introduced a one-time `initializedPages` Set. This avoids repeated setup, but the audit should verify that page modules which need refresh-on-return still have an explicit refresh path. One-time initialization must not accidentally leave order status, notifications, wallet balance, or booking history stale when a user returns to a tab.

The startup deferral commit also changed the initialization wrapper to observe returned Promise rejections. That is useful, but it does not itself cancel slow requests or prevent a late response from writing into a page after the user navigates away.

## 4. What remains unproven

- No frame-time, memory, long-task, network waterfall, or WebView console trace from the affected Android phone is available.
- The exact currently served JS bundle is still `user.min.js`; the repository history shows separate changes to readable and minified assets, but does not establish a reproducible minifier command.
- Static history cannot establish whether the freeze is caused by product DOM insertion, image decoding, a WebView rendering issue, Supabase latency, a stale asynchronous callback, or another script.
- The earlier Android bridge parity mismatch remains relevant and should be reconciled through the authoritative JS build path.

## 5. Next safe engineering sequence

1. Establish an explicit build command or checked-in script for producing `user.min.js` from the authoritative readable source, with deterministic output and a parity check.
2. Add a source-to-minified parity check for required compatibility features (Android bridge, early category paint, page-entry events, image lazy loading).
3. Instrument Home startup with lightweight timing marks around shell paint, category paint, first product response, first product DOM commit, and Home interactivity. Do not log personal or health data.
4. Render the first small visual batch, then append subsequent product batches in animation-frame-sized chunks while preserving the complete catalogue, sorting, filtering, and cart behavior.
5. Ensure all network work has timeouts/abort or stale-response guards where safe; keep Home usable if offers, notifications, or location lookup are slow.
6. Verify page-entry modules refresh correctly on return and clean up realtime listeners, polling, observers, and timers when appropriate.
7. Run the full feature checklist and a real Android WebView test before changing the live asset or issuing a final APK.

## Evidence commits

- https://github.com/medifinderindia/Medifinderindia/commit/acc2b73ac41ccf5cccc507c73fe970fdba27a76f
- https://github.com/medifinderindia/Medifinderindia/commit/282610831a0196c125432ba28bae7382cd76e5a0
- https://github.com/medifinderindia/Medifinderindia/commit/5e0a24d12161b88b432ef4d29269c852ec55393a
- https://github.com/medifinderindia/Medifinderindia/commit/dec3e0e4072a5c3dccd6de2646d681677a29089d
- https://github.com/medifinderindia/Medifinderindia/commit/ad518e50b3eba0f945e1430f3beb08dd6fe6b08e
- https://github.com/medifinderindia/Medifinderindia/commit/bcec906f3d817d197e0dffc5431a43af03450253
- https://github.com/medifinderindia/Medifinderindia/commit/580167a3623e5c3423978892a3c08f6d200f9b56
