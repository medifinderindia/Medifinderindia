-- MediFinder Customer V2: private prescription documents.
-- Apply this migration to the Supabase project before enabling the upload UI.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-prescriptions', 'customer-prescriptions', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "customer_prescriptions_owner_insert" on storage.objects;
create policy "customer_prescriptions_owner_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'customer-prescriptions'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "customer_prescriptions_owner_read" on storage.objects;
create policy "customer_prescriptions_owner_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'customer-prescriptions'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
    or exists (
      select 1 from public.prescription_orders po
      where po.prescription_url = name
        and po.accepted_by in (select public.my_merchant_ids())
    )
  )
);

drop policy if exists "customer_prescriptions_owner_delete" on storage.objects;
create policy "customer_prescriptions_owner_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'customer-prescriptions'
  and (storage.foldername(name))[1] = auth.uid()::text
);
