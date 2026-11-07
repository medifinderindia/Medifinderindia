# Phase 16 — No-Result Search and Related Suggestions

## Completed
- A search with no exact catalogue matches now keeps a visible "No matching products found" message.
- When possible, up to four related catalogue products are shown underneath the message.
- Suggestions rank exact field matches, prefix matches, partial matches, and close spelling matches in product fields.
- Search and suggestions use only the already-loaded approved catalogue; no extra database requests or invented products are used.
- The heading "Suggested products" appears only when suggestions are available.
- The wishlist adapter remains connected while the suggestion cards are rendered.
- Added tests for misspelled queries and empty suggestion queries to the catalogue search test.

## Behaviour
- If the query matches products, matching products are shown normally and the suggestion heading stays hidden.
- If there are no exact matches but related/near-spelling candidates exist, the not-found message and suggestions are both shown.
- If no useful match can be inferred, the current catalogue rows can serve as general alternatives; these are real approved catalogue entries, not fabricated recommendations.
- If the catalogue itself is empty, the normal empty catalogue message remains.

## Verification and safety
- Changes are committed to `feat/customer-panel-v2-foundation`.
- CI execution status has not been confirmed.
- The feature is limited to the isolated V2 preview. No production page, Supabase schema, live route, or APK workflow was changed.
