-- Secure prescription order creation: customers may only submit rows for their own Auth account.
-- RLS is already enabled on public.prescription_orders.
drop policy if exists prescription_orders_insert on public.prescription_orders;
drop policy if exists rx_orders_insert_own on public.prescription_orders;

create policy rx_orders_insert_own
on public.prescription_orders
for insert
to authenticated
with check ((select auth.uid()) = user_id);
