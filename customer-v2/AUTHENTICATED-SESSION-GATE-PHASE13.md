# Phase 13 — Authenticated Session Gate

## Added
- `auth-session.js` validates the existing Supabase session with both `auth.getSession()` and `auth.getUser()`.
- The V2 catalogue integration now requires a validated signed-in user before reading approved catalogue data or the user's wishlist.
- The integration listens for sign-in, sign-out, and token-refresh events and reloads the view accordingly.
- The integration exposes a destroy method that aborts an active catalogue request, unsubscribes from auth events, and cancels pending card rendering.
- Script order in the isolated V2 preview loads the auth gate before the integration bootstrap.

## Existing production architecture verified
- The legacy `user.js` creates `window.supabaseClient` once from the existing Supabase JS global and constants.
- `user.html` loads the Supabase JS UMD library, `supabase-constants.js`, and `app-env.js` before the deferred `user.min.js`.
- V2 must reuse that existing client when migrated into the authenticated shell. It must not create a second client or duplicate auth state.

## Important limitation
- The standalone `customer-v2/index.html` preview does not load the production Supabase constants, legacy login shell, or `user.min.js`. It therefore remains disconnected by design.
- This phase does not embed keys, copy auth tokens, or bypass the current login flow.
- Auth event callback is deliberately minimal; it schedules the actual async session validation in the integration loader.

## Verification status
- Changes are committed to `feat/customer-panel-v2-foundation`.
- The GitHub Actions workflow includes syntax/parity, catalogue, wishlist, and legacy-action tests. A green run was not confirmed in this phase.
- Real Android WebView and live authenticated-session testing are still pending.

## Production safety
- No production customer HTML/JS/CSS, Supabase schema/RLS/auth settings, live routes, or APK workflow was changed.
