-- InKind "Scan Receipts": staff open a scan session, photograph receipts
-- one after another, and the portal reads each receipt (OCR via Azure
-- OpenAI vision) into one row. Each session downloads as its own Excel
-- sheet (row 1 = first receipt, row 2 = next, ...). Sessions stay open so
-- staff can come back later and keep adding receipts to an older session.

create table if not exists public.inkind_receipt_sessions (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.b2s_offices(id),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inkind_receipt_sessions_office_idx
  on public.inkind_receipt_sessions (office_id, updated_at desc);

create table if not exists public.inkind_receipts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.inkind_receipt_sessions(id) on delete cascade,
  merchant text,
  merchant_address text,
  receipt_date date,
  receipt_time text,
  receipt_number text,
  payment_method text,
  card_last4 text,
  subtotal numeric(12, 2),
  tax numeric(12, 2),
  tip numeric(12, 2),
  discount numeric(12, 2),
  total numeric(12, 2),
  items jsonb not null default '[]'::jsonb,   -- [{ description, qty, unit_price, amount }]
  notes text,
  image_paths text[],                          -- photos in the inkind-receipts bucket
  created_at timestamptz not null default now()
);

create index if not exists inkind_receipts_session_idx
  on public.inkind_receipts (session_id, created_at);

-- Only the service role (API routes) touches these.
alter table public.inkind_receipt_sessions enable row level security;
alter table public.inkind_receipts enable row level security;

-- Private bucket for receipt photos. No storage policies: service role only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inkind-receipts', 'inkind-receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
