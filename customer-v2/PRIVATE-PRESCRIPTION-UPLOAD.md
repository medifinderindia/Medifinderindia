# Private prescription upload

The V2 upload uses a new private Storage bucket named `customer-prescriptions`.
It does not use the legacy public `user-prescriptions` bucket.

Before enabling uploads, apply `supabase/migrations/202611080001_customer_prescriptions_private.sql`.
The migration creates the private bucket and owner/admin/accepted-merchant read rules.
Files are stored under `<auth.uid()>/<timestamp>-<uuid>.<ext>`; the database stores the private object path, not a public URL.
Customer archive links are signed for five minutes and generated only after authenticated owner-scoped row lookup.

The existing public legacy bucket is intentionally untouched because existing production workflows may depend on it.
