# Phase 19 — Prescription Selection Page (Preview-Safe)

## Completed
- Added a dedicated V2 My Prescriptions page and connected Home's Prescription shortcut to it.
- Added a camera-oriented image picker using `accept="image/*"` and `capture="environment"` for supported mobile browsers/WebViews.
- Added a separate image/PDF file picker.
- Added client-side type checks for JPEG, PNG, WebP, HEIC/HEIF and PDF.
- Added a 10 MB per-file guard and selected filename/size feedback.
- Added responsive page styling and a CI JavaScript syntax check.

## Deliberately not enabled
- The selected file remains local to the browser; this phase does not upload or persist medical documents.
- No Supabase Storage upload, public URL creation, prescription order, delete, replace, or pharmacy acceptance state is performed.
- The legacy upload uses the `media` bucket and prescription-order workflow, but the exact customer upload entry point, ownership/path policy, and RLS/Storage policy need to be verified before reuse. A new V2 upload would be unsafe without that verification.
- The archive is a placeholder until account-linked secure retrieval is wired.

## Verification and safety
- Code and docs are committed to `feat/customer-panel-v2-foundation`.
- CI green status and real Android camera/PDF picker behavior have not been confirmed.
- No production customer page, Supabase schema/RLS, live route, or APK workflow was changed.
