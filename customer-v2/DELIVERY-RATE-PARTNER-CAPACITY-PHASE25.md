# Phase 25 — Live delivery-rate and partner-capacity verification

## Findings
- The legacy customer checkout calls the Supabase Edge Function named `shiprocket` with `pickup_postcode`, `delivery_postcode`, `weight`, and `cod`. Its expected response includes `success`, optional `serviceable`, and `rate`.
- The legacy flow first reads `merchants_public(id, pincode)`, groups cart weight by merchant, and requests a separate rate for each pickup PIN.
- The legacy fallback is not safe to copy as a live V2 promise: on Edge Function/network failure it falls back to a local distance-fee table. The V2 preview therefore does not claim that estimate is a carrier-confirmed quote.
- The repository tree for this feature branch contains no checked-in Shiprocket Edge Function source or verified live partner-capacity endpoint/table. The function's server implementation, authentication/secret handling, response schema, and capacity source cannot be audited from this repository branch.
- Legacy Same Day / 30 Minutes gating is based on approved `service_zones` PIN status. That proves only zone eligibility, not current pharmacy stock, rider availability, dispatch capacity, or a guaranteed ETA.

## Changes in this phase
- Added `delivery-capability.js`, a fail-closed resolver. Faster modes return `unknown` until a real partner-capacity integration is verified.
- Updated checkout speed controls so only Standard can be selected; Same Day and 30 Minutes remain visibly unavailable rather than being enabled merely by an approved PIN.
- Removed duplicate `updateSpeedOptions` declaration and duplicate delivery-speed change listener found in the V2 checkout UI.
- Existing PIN-zone verification and fee-estimate preview remain separate; neither is represented as confirmed courier availability or final shipping price.

## Not enabled
- No live Shiprocket quote is shown in V2 yet. The legacy Edge Function implementation must be reviewed before reusing it, including timeout behavior, response validation, multi-merchant partial failures, and server-side secret protection.
- No partner-capacity table/API is verified. No Same Day / 30 Minutes availability or ETA is promised.
- Place Order, payment, coupon redemption, coin debit, stock reservation, and booking remain disabled.

## Safety / deployment
- Only files under `customer-v2/` were changed on `feat/customer-panel-v2-foundation`.
- No production customer page, Supabase schema/RLS/data, live checkout, or APK workflow was changed.
- GitHub Actions / browser / Android WebView runtime tests have not been executed in this phase; syntax tests must be run by CI after commit.
