-- Food bank invoice intake (OCR). When an office receives pallets from
-- its food bank, staff photograph the food bank's invoice; the portal
-- reads it, staff review the lines, and it's saved as a completed in-kind
-- session (organization donor = the food bank, no donor signature) and
-- pushed straight to Salesforce.

alter table public.sessions
  add column if not exists source text not null default 'kiosk',          -- 'kiosk' | 'food_bank'
  add column if not exists vendor_invoice_number text,                    -- the food bank's own invoice #
  add column if not exists invoice_image_paths text[];                    -- photos in the inkind-foodbank-invoices bucket

create index if not exists sessions_source_office_idx on public.sessions (source, office_id);

-- Private bucket for invoice photos. No storage policies: only the
-- service role (API routes) reads/writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inkind-foodbank-invoices', 'inkind-foodbank-invoices', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
