-- ============================================================================
-- FIX ALL RLS POLICIES — Run this in Supabase SQL Editor
-- Safe to run: all DROP IF EXISTS + CREATE
-- ============================================================================

-- Drop ALL existing policies first
DO $$ DECLARE r RECORD;
BEGIN
    FOR r IN (SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- profiles
CREATE POLICY "profiles_sel" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_ins" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "profiles_upd" ON public.profiles FOR UPDATE USING (
    public.is_admin() OR id = auth.uid()::text OR id = auth.email()
);

-- patients (scoped to own)
CREATE POLICY "patients_all" ON public.patients FOR ALL
  USING (user_email = auth.email() OR public.is_admin())
  WITH CHECK (user_email = auth.email() OR public.is_admin());

-- reminders (scoped to own)
CREATE POLICY "reminders_all" ON public.reminders FOR ALL
  USING (user_email = auth.email() OR public.is_admin())
  WITH CHECK (user_email = auth.email() OR public.is_admin());

-- merchants
CREATE POLICY "merchants_sel" ON public.merchants FOR SELECT USING (true);
CREATE POLICY "merchants_ins" ON public.merchants FOR INSERT WITH CHECK (true);
CREATE POLICY "merchants_upd" ON public.merchants FOR UPDATE USING (
    public.is_admin()
    OR auth_user_id = auth.uid()
    OR email = coalesce(auth.email(), '')
    OR phone = coalesce(auth.jwt() ->> 'phone', '')
);

-- medicines
CREATE POLICY "meds_sel" ON public.medicines FOR SELECT
  USING (status IN ('Approved','Active') OR public.is_admin()
    OR merchant_id IN (SELECT id FROM public.merchants WHERE auth_user_id = auth.uid() OR email = auth.email()));
CREATE POLICY "meds_all" ON public.medicines FOR ALL
  USING (public.is_admin() OR merchant_id IN (SELECT id FROM public.merchants WHERE auth_user_id = auth.uid() OR email = auth.email()))
  WITH CHECK (public.is_admin() OR merchant_id IN (SELECT id FROM public.merchants WHERE auth_user_id = auth.uid() OR email = auth.email()));

-- riders
CREATE POLICY "riders_sel" ON public.riders FOR SELECT USING (true);
CREATE POLICY "riders_ins" ON public.riders FOR INSERT WITH CHECK (true);
CREATE POLICY "riders_upd" ON public.riders FOR UPDATE USING (public.is_admin() OR auth_user_id = auth.uid());

-- orders
CREATE POLICY "orders_sel" ON public.orders FOR SELECT
  USING (public.is_admin() OR user_email = auth.email()
    OR merchant_id IN (SELECT id FROM public.merchants WHERE auth_user_id = auth.uid() OR email = auth.email())
    OR rider_id IN (SELECT id FROM public.riders WHERE auth_user_id = auth.uid() OR email = auth.email()));
CREATE POLICY "orders_ins" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_upd" ON public.orders FOR UPDATE
  USING (public.is_admin() OR user_email = auth.email()
    OR merchant_id IN (SELECT id FROM public.merchants WHERE auth_user_id = auth.uid() OR email = auth.email())
    OR rider_id IN (SELECT id FROM public.riders WHERE auth_user_id = auth.uid() OR email = auth.email()));
CREATE POLICY "orders_del" ON public.orders FOR DELETE
  USING (public.is_admin() OR user_email = auth.email());

-- cancelled_orders
CREATE POLICY "co_sel" ON public.cancelled_orders FOR SELECT
  USING (public.is_admin() OR user_email = auth.email());
CREATE POLICY "co_upd" ON public.cancelled_orders FOR UPDATE USING (public.is_admin());

-- rx_orders
CREATE POLICY "rx_sel" ON public.rx_orders FOR SELECT USING (public.is_admin());
CREATE POLICY "rx_ins" ON public.rx_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "rx_upd" ON public.rx_orders FOR UPDATE USING (public.is_admin());

-- order_items
CREATE POLICY "oi_sel" ON public.order_items FOR SELECT
  USING (public.is_admin() OR merchant_id IN (SELECT id FROM public.merchants WHERE auth_user_id = auth.uid()));
CREATE POLICY "oi_ins" ON public.order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "oi_upd" ON public.order_items FOR UPDATE
  USING (public.is_admin() OR merchant_id IN (SELECT id FROM public.merchants WHERE auth_user_id = auth.uid()));

-- rider_kyc
CREATE POLICY "rk_sel" ON public.rider_kyc FOR SELECT USING (public.is_admin());
CREATE POLICY "rk_ins" ON public.rider_kyc FOR INSERT WITH CHECK (true);
CREATE POLICY "rk_upd" ON public.rider_kyc FOR UPDATE USING (public.is_admin());

-- rider_payouts
CREATE POLICY "rp_sel" ON public.rider_payouts FOR SELECT USING (public.is_admin());
CREATE POLICY "rp_ins" ON public.rider_payouts FOR INSERT WITH CHECK (true);
CREATE POLICY "rp_upd" ON public.rider_payouts FOR UPDATE USING (public.is_admin());

-- admin_kyc_verifications
CREATE POLICY "akv_sel" ON public.admin_kyc_verifications FOR SELECT USING (public.is_admin());
CREATE POLICY "akv_ins" ON public.admin_kyc_verifications FOR INSERT WITH CHECK (true);
CREATE POLICY "akv_upd" ON public.admin_kyc_verifications FOR UPDATE USING (public.is_admin());

-- admin_payout_requests
CREATE POLICY "apr_sel" ON public.admin_payout_requests FOR SELECT USING (public.is_admin());
CREATE POLICY "apr_ins" ON public.admin_payout_requests FOR INSERT WITH CHECK (true);

-- payout_history
CREATE POLICY "ph_sel" ON public.payout_history FOR SELECT USING (public.is_admin());
CREATE POLICY "ph_ins" ON public.payout_history FOR INSERT WITH CHECK (public.is_admin());

-- riders_wallet
CREATE POLICY "rw_sel" ON public.riders_wallet FOR SELECT
  USING (public.is_admin() OR rider_id IN (SELECT id FROM public.riders WHERE auth_user_id = auth.uid()));
CREATE POLICY "rw_ins" ON public.riders_wallet FOR INSERT WITH CHECK (true);
CREATE POLICY "rw_upd" ON public.riders_wallet FOR UPDATE
  USING (public.is_admin() OR rider_id IN (SELECT id FROM public.riders WHERE auth_user_id = auth.uid()));

-- service_zones
CREATE POLICY "sz_sel" ON public.service_zones FOR SELECT USING (true);
CREATE POLICY "sz_ins" ON public.service_zones FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "sz_upd" ON public.service_zones FOR UPDATE USING (public.is_admin());

-- offers
CREATE POLICY "offers_sel" ON public.offers FOR SELECT USING (true);
CREATE POLICY "offers_ins" ON public.offers FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "offers_upd" ON public.offers FOR UPDATE USING (public.is_admin());

-- checkups
CREATE POLICY "checkups_ins" ON public.checkups FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "checkups_sel" ON public.checkups FOR SELECT USING (public.is_admin());

-- notifications
CREATE POLICY "notif_sel" ON public.notifications FOR SELECT USING (true);
CREATE POLICY "notif_ins" ON public.notifications FOR INSERT WITH CHECK (public.is_admin());

-- merchant_kyc
CREATE POLICY "mkyc_sel" ON public.merchant_kyc FOR SELECT
  USING (public.is_admin() OR merchant_id IN (SELECT id FROM public.merchants WHERE auth_user_id = auth.uid() OR email = auth.email()));
CREATE POLICY "mkyc_ins" ON public.merchant_kyc FOR INSERT WITH CHECK (true);
CREATE POLICY "mkyc_upd" ON public.merchant_kyc FOR UPDATE
  USING (public.is_admin() OR merchant_id IN (SELECT id FROM public.merchants WHERE auth_user_id = auth.uid() OR email = auth.email()));

-- merchant_alerts
CREATE POLICY "malert_sel" ON public.merchant_alerts FOR SELECT USING (true);
CREATE POLICY "malert_ins" ON public.merchant_alerts FOR INSERT WITH CHECK (true);

-- merchant_payouts
CREATE POLICY "mpay_sel" ON public.merchant_payouts FOR SELECT
  USING (public.is_admin() OR shop_id IN (SELECT id::text FROM public.merchants WHERE auth_user_id = auth.uid() OR email = auth.email()));
CREATE POLICY "mpay_upd" ON public.merchant_payouts FOR UPDATE USING (public.is_admin());

-- rider_notifications
CREATE POLICY "rn_sel" ON public.rider_notifications FOR SELECT USING (true);
CREATE POLICY "rn_ins" ON public.rider_notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "rn_upd" ON public.rider_notifications FOR UPDATE
  USING (public.is_admin() OR rider_id IN (SELECT id FROM public.riders WHERE auth_user_id = auth.uid()));

-- delivery_requests
CREATE POLICY "dreq_sel" ON public.delivery_requests FOR SELECT USING (true);
CREATE POLICY "dreq_ins" ON public.delivery_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "dreq_upd" ON public.delivery_requests FOR UPDATE USING (true);
CREATE POLICY "dreq_del" ON public.delivery_requests FOR DELETE USING (public.is_admin());

-- returns
CREATE POLICY "ret_sel" ON public.returns FOR SELECT
  USING (public.is_admin() OR merchant_id IN (SELECT id FROM public.merchants WHERE auth_user_id = auth.uid()));
CREATE POLICY "ret_ins" ON public.returns FOR INSERT WITH CHECK (true);

-- coupons
CREATE POLICY "coup_sel" ON public.coupons FOR SELECT USING (true);
CREATE POLICY "coup_ins" ON public.coupons FOR INSERT WITH CHECK (true);
CREATE POLICY "coup_upd" ON public.coupons FOR UPDATE
  USING (public.is_admin() OR merchant_id IN (SELECT id FROM public.merchants WHERE auth_user_id = auth.uid()));

-- promotions
CREATE POLICY "promo_sel" ON public.promotions FOR SELECT USING (true);
CREATE POLICY "promo_ins" ON public.promotions FOR INSERT WITH CHECK (true);
CREATE POLICY "promo_upd" ON public.promotions FOR UPDATE
  USING (public.is_admin() OR merchant_id IN (SELECT id FROM public.merchants WHERE auth_user_id = auth.uid()));

-- customer_communications
CREATE POLICY "cc_sel" ON public.customer_communications FOR SELECT
  USING (public.is_admin() OR merchant_id IN (SELECT id FROM public.merchants WHERE auth_user_id = auth.uid()));
CREATE POLICY "cc_ins" ON public.customer_communications FOR INSERT WITH CHECK (true);

-- stock_history
CREATE POLICY "sh_sel" ON public.stock_history FOR SELECT
  USING (public.is_admin() OR merchant_id IN (SELECT id FROM public.merchants WHERE auth_user_id = auth.uid()));

-- product_views
CREATE POLICY "pv_sel" ON public.product_views FOR SELECT USING (true);
CREATE POLICY "pv_ins" ON public.product_views FOR INSERT WITH CHECK (true);

-- merchant_analytics
CREATE POLICY "ma_sel" ON public.merchant_analytics FOR SELECT
  USING (public.is_admin() OR merchant_id IN (SELECT id FROM public.merchants WHERE auth_user_id = auth.uid()));

-- product_categories
CREATE POLICY "pc_sel" ON public.product_categories FOR SELECT USING (true);
CREATE POLICY "pc_ins" ON public.product_categories FOR INSERT WITH CHECK (true);

-- merchant_notifications
CREATE POLICY "mn_sel" ON public.merchant_notifications FOR SELECT
  USING (public.is_admin() OR merchant_id IN (SELECT id FROM public.merchants WHERE auth_user_id = auth.uid()));
CREATE POLICY "mn_ins" ON public.merchant_notifications FOR INSERT WITH CHECK (true);

-- products
CREATE POLICY "prods_sel" ON public.products FOR SELECT USING (true);
CREATE POLICY "prods_ins" ON public.products FOR INSERT WITH CHECK (true);

-- reviews
CREATE POLICY "rev_sel" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "rev_ins" ON public.reviews FOR INSERT WITH CHECK (true);

-- price_history
CREATE POLICY "phist_sel" ON public.price_history FOR SELECT USING (true);
CREATE POLICY "phist_ins" ON public.price_history FOR INSERT WITH CHECK (true);

-- prescriptions
CREATE POLICY "prescriptions_all" ON public.prescriptions FOR ALL
  USING (user_id = auth.uid()::text OR user_email = auth.email() OR public.is_admin())
  WITH CHECK (user_id = auth.uid()::text OR user_email = auth.email() OR public.is_admin());

-- sponsored_products
CREATE POLICY "spsel" ON public.sponsored_products FOR SELECT USING (true);
CREATE POLICY "spins" ON public.sponsored_products FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "spupd" ON public.sponsored_products FOR UPDATE USING (public.is_admin());
CREATE POLICY "spdel" ON public.sponsored_products FOR DELETE USING (public.is_admin());

-- analytics
CREATE POLICY "analytics_ins" ON public.analytics FOR INSERT WITH CHECK (true);
CREATE POLICY "analytics_sel" ON public.analytics FOR SELECT USING (public.is_admin());
CREATE POLICY "analytics_upd" ON public.analytics FOR UPDATE USING (public.is_admin());
