-- Expose only approved, verified pharmacy directory fields.
-- This view intentionally remains security-invoker=false so the public directory
-- can read approved listings without exposing the underlying merchants table.
-- Owner identity and signature fields are deliberately excluded.
drop view if exists public.merchants_public;

create view public.merchants_public
with (security_invoker = false)
as
select
  id,
  merchant_name,
  shop_name,
  merchant_avatar,
  avatar_url,
  license_status,
  pincode,
  city,
  district,
  state,
  address,
  resolved_address,
  latitude,
  longitude,
  cod_available,
  business_category,
  about_shop,
  phone
from public.merchants
where status in ('active', 'approved')
  and lower(coalesce(license_status, '')) in ('verified', 'approved');

revoke all on public.merchants_public from public, anon, authenticated;
grant select on public.merchants_public to anon, authenticated;
