-- Scan Receipts now reads ICNA Relief's handwritten donation receipts
-- (donor name/phone/email/address, receipt #, received by, items with
-- qty + used/new) instead of store receipts. The old store columns stay
-- but are no longer filled in.
alter table public.inkind_receipts
  add column if not exists donor_name text,
  add column if not exists donor_phone text,
  add column if not exists donor_email text,
  add column if not exists donor_address text,
  add column if not exists received_by text;

notify pgrst, 'reload schema';
