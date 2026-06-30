-- Fix merchants UPDATE RLS policy for phone-based auth
DROP POLICY IF EXISTS "merchants_upd" ON public.merchants;

CREATE POLICY "merchants_upd" ON public.merchants FOR UPDATE USING (
    public.is_admin()
    OR auth_user_id = auth.uid()
    OR email = coalesce(auth.email(), '')
    OR phone = coalesce(auth.jwt() ->> 'phone', '')
);
