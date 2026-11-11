-- Secure merchant self-registration and prevent self-approval.
drop policy if exists merchants_ins on public.merchants;
create policy merchants_ins on public.merchants
for insert to authenticated
with check (
  auth.uid() is not null
  and auth_user_id = (select auth.uid())
  and (user_id is null or user_id = (select auth.uid()))
  and coalesce(status, 'pending') = 'pending'
  and coalesce(license_status, 'unverified') not in ('verified','approved')
  and coalesce(bank_status, 'unverified') not in ('verified','approved')
  and coalesce(kyc_status, 'not_started') in ('not_started','pending')
);

drop policy if exists merchants_upd on public.merchants;
create policy merchants_upd on public.merchants
for update to authenticated
using (
  (select is_admin())
  or auth_user_id = (select auth.uid())
  or user_id = (select auth.uid())
)
with check (
  (select is_admin())
  or (
    auth_user_id = (select auth.uid())
    and (user_id is null or user_id = (select auth.uid()))
  )
);

create or replace function public.guard_merchant_registration_fields()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null or new.auth_user_id is distinct from auth.uid() then
      raise exception 'Merchant registration must belong to the signed-in account';
    end if;
    if new.user_id is not null and new.user_id is distinct from auth.uid() then
      raise exception 'Merchant user ownership mismatch';
    end if;
    new.status := 'pending';
    new.license_status := 'unverified';
    new.bank_status := 'unverified';
    new.kyc_status := 'not_started';
    new.kyc_submitted_at := null;
    new.kyc_rejection_reason := '';
    return new;
  end if;

  if not (select is_admin()) then
    if new.auth_user_id is distinct from old.auth_user_id
       or new.user_id is distinct from old.user_id
       or new.status is distinct from old.status
       or new.license_status is distinct from old.license_status
       or new.bank_status is distinct from old.bank_status
       or new.kyc_status is distinct from old.kyc_status
       or new.kyc_submitted_at is distinct from old.kyc_submitted_at
       or new.kyc_rejection_reason is distinct from old.kyc_rejection_reason then
      raise exception 'Only MediFinder admin can change merchant verification or ownership fields';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists merchants_guard_registration_fields on public.merchants;
create trigger merchants_guard_registration_fields
before insert or update on public.merchants
for each row execute function public.guard_merchant_registration_fields();

revoke insert on public.merchants from anon;
grant insert on public.merchants to authenticated;

