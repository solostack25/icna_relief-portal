-- Applied directly (Supabase MCP), 2026-10-18.
-- One-tap approval emails: track automatic reminders.
alter table public.finance_approvals add column if not exists last_reminded_at timestamptz;

-- Receipt photos attached to finance tickets (private bucket; read via
-- signed URLs from API routes after an access check).
insert into storage.buckets (id, name, public, file_size_limit)
values ('finance-receipts', 'finance-receipts', false, 15728640)
on conflict (id) do nothing;

create table if not exists public.finance_ticket_receipts (
  id uuid primary key default gen_random_uuid(),
  finance_ticket_id uuid references public.finance_tickets(id) on delete cascade,
  uploaded_by uuid references public.employees(id),
  storage_path text not null unique,
  content_type text,
  extracted jsonb,
  created_at timestamptz not null default now()
);
create index if not exists finance_ticket_receipts_ticket_idx on public.finance_ticket_receipts(finance_ticket_id);
alter table public.finance_ticket_receipts enable row level security; -- service role only
