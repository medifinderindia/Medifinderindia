# Phase 9 — Existing Supabase Catalogue Adapter

## Confirmed contract from current customer source
The existing `loadHomeProductGrid()` reads from `medicines`, selects the current row shape with `select('*')`, filters `status = 'Approved'`, orders by descending `id`, and limits to 120 rows for the normal catalogue or 300 for a merchant storefront. Merchant mode adds `merchant_id = <merchant>`; instrument mode adds `product_type = 'Instrument'`.

## Added
- `customer-v2/catalogue-adapter.js`: exposes a provider factory that receives the existing shared Supabase client and reproduces those filters and limits.
- `customer-v2/tools/test-catalogue-adapter.js`: Node-based contract test with a fake query builder; verifies query shape, row limits, and error propagation.
- No product data is hardcoded. No new Supabase client, auth flow, schema, table, or RPC is created.

## Integration note
The provider is not yet connected to the preview. The caller must pass the already-initialized authenticated Supabase client and any merchant/instrument context. Ratings and merchant coordinates remain separate optional enrichment work; they must not block the initial product list.

## Test
Run from repository root:
```sh
node customer-v2/tools/test-catalogue-adapter.js
```

## Safety
V2 branch only. Existing live `user.html`, `user.js`, `user.min.js`, APK workflow, Supabase data/schema, and customer routes remain unchanged.
