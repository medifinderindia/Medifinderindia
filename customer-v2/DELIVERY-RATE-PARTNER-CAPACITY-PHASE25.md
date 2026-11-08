# Phase 25 — Live delivery-rate and partner-capacity verification

## Current findings
- The legacy checkout calls the Supabase Edge Function `shiprocket`, but its deployed implementation is not present in this repository for audit.
- PIN approval establishes only service-zone eligibility; it does not confirm inventory, rider availability, dispatch capacity or a delivery slot.
- No verified live partner-capacity endpoint/table is connected to this V2 branch.

## Current fail-closed behavior
- Same Day and 30 Minutes remain disabled regardless of PIN approval.
- Standard delivery remains subject to final serviceability and verified server-side rate confirmation.
- Checkout does not calculate a customer delivery charge from copied static fee bands.
- No ETA or faster-delivery promise is made.

## Required integrations
- Audit the deployed Shiprocket Edge Function and safely validate its response before displaying any quote.
- Integrate an authenticated partner-capacity service with live stock, rider/dispatch capacity, supported PIN and slot data.
- Enable a speed only when the capacity service confirms that exact option for the customer's address and order.

## Deployment
- Isolated to `customer-v2/`; production customer pages, database and APK workflow are untouched.
