# Phase 6 — JavaScript Bundle Provenance & Parity Findings

Date: 2026-11-07  
Branch: `feat/customer-panel-v2-foundation`

## Scope

This phase checks the history around the customer dashboard's readable source (`user.js`) and the production-loaded bundle (`user.min.js`). No production files, live routes, database objects, or APK workflow were changed.

## Verified findings

1. `user.html` loads `user.min.js`, so that is the customer panel JavaScript actually executed by the website/WebView. Editing `user.js` alone does not update the running customer panel.
2. Commit `acc2b73ac41ccf5cccc507c73fe970fdba27a76f` ("Defer heavy user dashboard initialization") changed `user.js` to stage startup work.
3. The immediately following commit `9f6b89e987cc5109f6220708364da1519a89594c` ("Update minified user dashboard startup") has `acc2b73...` as its parent and changes only `user.min.js` (34 additions, 1 deletion). This establishes that the readable-source startup change and the minified-bundle update were separate commits, one after the other.
4. The later commit `282610831a0196c125432ba28bae7382cd76e5a0` ("Defer hidden dashboard modules until tab entry") changes `user.js` again. The audited APK workflow does not run a JavaScript minifier.
5. No deterministic, repository-defined command for generating `user.min.js` has been established in the inspected root manifests/workflows. The exact tool/version/options used to create it remain unknown.
6. A previously confirmed parity gap remains: readable `user.js` includes an Android native share/clipboard bridge wrapper, while the loaded `user.min.js` does not contain the `MFAndroid` identifier.
7. The minified bundle's staged Home startup and early category rendering differ from the readable source's corresponding startup path. This is a real source/bundle maintenance risk, but it is not by itself proof of the user's freeze root cause.

## Conclusion

The repository history supports treating `user.js` and `user.min.js` as two separately maintained deliverables, rather than assuming the minified file is automatically rebuilt by GitHub Actions. A source edit can therefore leave the live WebView behavior unchanged, while a bundle-only edit can create drift from the readable source.

The exact minifier provenance is still unverified. Do not replace the production bundle with a newly minified `user.js` yet: the readable and minified startup implementations are already behaviorally different, and a blind rebuild could remove early category rendering or change Android bridge behavior.

## Safe next steps

1. Establish a pinned minifier (tool, version, options) on this isolated V2 branch only.
2. Add a build/parity check that explicitly verifies required Android bridge hooks, first-paint category rendering, page-entry events, and expected startup hooks.
3. Build a candidate bundle from an agreed canonical source and compare its behavior and output size; do not publish it to the live page yet.
4. Test Home first paint, category taps, scroll, cart, orders, profile, prescription upload, maps-on-demand, and native share on Android WebView.
5. Only after parity and Android smoke tests pass, prepare a separate reviewed production migration/rollback change.

## Safety status

- Production `user.js` / `user.min.js`: unchanged.
- `user.html`: unchanged.
- Supabase schema, data, auth, and RLS: unchanged.
- Android APK workflow: unchanged.
- V2 preview remains isolated and is not wired into live customer traffic.
