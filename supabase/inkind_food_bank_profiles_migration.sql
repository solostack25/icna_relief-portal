-- Per-office food bank profiles. Every office runs its pantry differently
-- depending on its relationship with its food bank:
--   Houston: everything received is in-kind, nothing is billed.
--   Orlando (Second Harvest): invoices mix $0 donated product (in-kind)
--     with purchased product, plus shared-maintenance fees. Part of the
--     bill is covered by a grant credit printed on the invoice; ICNA
--     Relief pays the rest ("Amount Owed").
--
-- A profile tells the food bank intake how to split one of those
-- invoices:
--   inkind_rule = 'all_lines'        every line is in-kind
--               = 'zero_cost_only'   only $0-cost lines are in-kind;
--                                    purchased lines are left out
--   track_charges                    post the charges:
--     grant credit  -> Grant Management expense on the mapped grant
--     amount owed   -> Vendor Payment finance ticket billed to the office

create table if not exists public.inkind_food_banks (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.b2s_offices(id) on delete cascade,
  name text not null,
  aliases text[] not null default '{}',             -- other names it prints, for matching the invoice
  inkind_rule text not null default 'all_lines' check (inkind_rule in ('all_lines', 'zero_cost_only')),
  track_charges boolean not null default false,
  -- whose name the Vendor Payment ticket is opened under when the
  -- intake is done on a signed-out kiosk (signed-in staff use themselves)
  ticket_requestor_id uuid references public.employees(id) on delete set null,
  -- grant reference as printed on the invoice -> Grant Management grant + line
  --   [{ "ref": "500889_31", "gm_grant_id": uuid, "gm_line_id": uuid }]
  grant_mappings jsonb not null default '[]',
  notes text,
  is_active boolean not null default true,
  updated_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists inkind_food_banks_office_name_uniq on public.inkind_food_banks (office_id, lower(name));

alter table public.inkind_food_banks enable row level security;
-- No policies: read/written only through API routes (service role).

-- What was billed on a food bank invoice and where each part was posted.
--   { total_charges, amount_owed, purchased_value,
--     grant_credits: [{ ref, label, amount, gm_grant_id, gm_expense_id, error }],
--     finance_ticket_id, finance_ticket_number, ticket_error }
alter table public.sessions
  add column if not exists food_bank_id uuid references public.inkind_food_banks(id) on delete set null,
  add column if not exists charges jsonb;

-- Grant expenses created from a food bank intake (one per grant credit).
alter table public.gm_expenses
  add column if not exists inkind_session_id uuid references public.sessions(id) on delete set null;
create unique index if not exists gm_expenses_inkind_session_grant_uniq
  on public.gm_expenses (inkind_session_id, grant_id) where inkind_session_id is not null;

-- Invoices can now be uploaded as PDFs too.
update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], file_size_limit = 15728640
  where id = 'inkind-foodbank-invoices';

-- Orlando's profile (Second Harvest Food Bank of Central Florida).
insert into public.inkind_food_banks (office_id, name, aliases, inkind_rule, track_charges, notes)
select o.id, 'Second Harvest Food Bank of Central Florida', array['Second Harvest', 'Second Harvest Food Bank'], 'zero_cost_only', true,
       '$0-cost lines are in-kind. Grant credit on the invoice posts to the mapped grant; Amount Owed goes to Finance as a vendor payment.'
from public.b2s_offices o where o.field_office = 'Orlando Office'
on conflict do nothing;
