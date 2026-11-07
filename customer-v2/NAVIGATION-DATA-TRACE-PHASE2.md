# Customer Panel V2 — Navigation & Data Trace Phase 2

Branch: `feat/customer-panel-v2-foundation`
Scope: static source inspection of the existing `user.js`; this is not runtime performance measurement.

## Nurse booking — verified flow

- Nurse serviceability is checked against `nurse_service_areas` by pincode before allowing submission.
- The booking sheet requests patient details, service type, duration, schedule, written address, contact numbers, optional prescription, and GPS coordinates.
- Optional prescription files upload to Supabase Storage bucket `media` under `nurse-prescriptions/`; the returned public URL is stored on the booking.
- Submission requires a logged-in user and a 12-digit UTR. The UI constructs a total from service rate × duration plus service charge.
- It inserts into `nurse_bookings` with payment method `upi`, payment status initially pending, and booking status pending. It retries a small set of status spellings only when a CHECK constraint error is returned.
- On success it triggers a WhatsApp compose link, a home notification, and refreshes booking history. History reads `nurse_bookings` filtered by current user.
- **Important payment wording:** the code records a UTR and pending verification; it does not itself prove that money was received. UI copy should consistently say “payment submitted for verification,” not “payment verified.”
- **Performance risk:** opening the nurse sheet immediately requests high-accuracy GPS and reverse geocodes through Nominatim. Keep this action user-initiated or clearly optional; do not run it during general customer-panel startup.
- **Reliability risk:** prescription upload failure returns `null`, but the current booking path can continue. V2 should show a clear upload error and let the user retry or explicitly continue without an attachment.

## Ambulance booking — verified flow (from targeted source trace)

- Booking requires login, validates phone/pickup information, obtains current user, and inserts a `searching` record into `ambulance_bookings` with pickup/drop details, coordinates, vehicle type, fare estimate and a generated OTP.
- Duplicate-key error handling reports an existing active booking.
- The tracker listens for realtime UPDATE events on the booking row; driver details are retrieved through RPC `get_booking_driver`.
- Some tracker paths poll driver data every 5 seconds and request OSRM routing/geocoding. Cancellation updates booking status to `cancelled`.
- UPI/UTR confirmation is submitted through RPC `submit_ambulance_payment`; the UI indicates admin verification is still pending.
- Booking history reads the current user's latest 30 rows.
- **V2 requirement:** start realtime subscriptions, polling, route calculation and map rendering only while the ambulance tracker is visible; clean up timers/channels on exit. Never start these from the home page.

## Tablet Coin — verified flow

- Wallet balance is read from `profiles.coins`; transaction history comes from `coin_transactions`, filtered by user and ordered newest first.
- Daily check-in and profile-complete rewards call RPCs `claim_daily_coin_bonus` and `claim_profile_complete_bonus`.
- The screen subscribes to `coin_transactions` and profile UPDATE events while initialized, then refreshes wallet and emits `mf:coins-changed`.
- Checkout reads `profiles.coins`; the source comment and UI implement a 1 coin = ₹1 discount, capped by wallet balance and eligible subtotal. Redemption can be activated from the Tablet Coin screen and is remembered using localStorage key `mf_coin_mode`.
- Checkout redemption also calls RPC `use_coins_on_order` in the order flow. Confirm exact server-side debit/credit and idempotency behavior against the database function before changing this contract.
- **Performance risk:** the current Tablet Coin module calls `tcInit()` at script evaluation and installs realtime subscriptions, even if the customer is not viewing the Tablet Coin page. V2 should defer wallet/history loading and realtime subscription until the page is entered, and unsubscribe when leaving.
- **Correctness risk:** checkout coin balance loading is asynchronous. V2 must prevent a user from submitting an order with a stale or unconfirmed coin amount; server-side validation remains authoritative.

## V2 migration rules from these traces

1. Preserve existing table, column, RPC, storage-bucket and auth contracts until verified against live schema and policies.
2. Keep booking confirmation distinct from payment verification.
3. Lazy-load GPS, reverse geocoding, maps, route services, realtime channels and polling only on the relevant active screen.
4. Add loading, retry, empty and error states without blocking initial Home rendering.
5. Ensure every timer, realtime channel and event listener has a deterministic cleanup path.
6. Do not change production `user.html`, `user.js`, `user.min.js`, database schema, or live routes during this audit phase.

## Not yet verified

- Runtime timing / actual freeze reproduction on a physical Android WebView.
- Database CHECK constraints, RLS policies, triggers and exact RPC definitions.
- Full checkout order insert/payment confirmation lifecycle and coin debit idempotency.
- The minifier/build pipeline responsible for the observed readable-source vs minified Android bridge mismatch.
