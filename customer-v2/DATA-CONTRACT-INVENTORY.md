# Customer Panel V2 — Existing Data Contract Inventory

Read-only static scan of the current readable `user.js` on `feat/customer-panel-v2-foundation`. This inventory records names referenced by the customer code; it is not a claim that every object is currently healthy or accessible under every user role.

## Supabase tables referenced

- `ambulance_bookings`
- `cancelled_orders`
- `checkups`
- `coin_transactions`
- `complaints`
- `coupons`
- `lab_bookings`
- `lab_test_reviews`
- `lab_tests`
- `media`
- `medicines`
- `merchant_notifications`
- `merchants_public`
- `notifications`
- `nurse_bookings`
- `nurse_service_areas`
- `offers`
- `order_feedback`
- `order_items`
- `order_tracking_events`
- `orders`
- `patients`
- `platform_offers`
- `prescription_orders`
- `product_reviews`
- `profiles`
- `reminders`
- `returns`
- `review_helpful_votes`
- `riders`
- `service_zones`
- `sponsor_discount_claims`
- `sponsored_products`
- `user_addresses`
- `user_coupons`
- `user_wishlist`

## RPC functions referenced

- `decrement_stock`
- `delete_user_account`
- `get_available_ambulances`
- `get_booking_driver`
- `get_my_referrals`
- `redeem_referral_code`
- `submit_ambulance_payment`
- `toggle_review_helpful`
- `use_coins_on_order`

## Integration safety

- Treat these names as existing contracts: do not rename, replace, or migrate them as part of a UI-only rebuild.
- Before moving a feature, trace its exact select/insert/update/upsert filters, storage bucket/path, auth identity, and error handling.
- Verify RLS behavior using the existing signed-in role; do not weaken RLS to make a new screen work.
- Payment and booking mutations must call the existing verified backend flow and show success only after a confirmed response.
- A table appearing in this static scan does not prove the current account has permission to access it or that the object is used on every customer session.
