-- Ensure the public directory is read-only for API roles.
revoke all on public.merchants_public from public, anon, authenticated;
grant select on public.merchants_public to anon, authenticated;
