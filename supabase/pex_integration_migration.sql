-- ============================================================
-- PEX integration for Grant Management
--
-- Live sync with the PEX API (coreapi.pexcard.com/v4) plus a way to
-- say which PEX cards spend grant money, and to split a card
-- transaction across grants.
--
--   pex_cards               mirror of PEX cardholder accounts (API sync,
--                           or created from a CSV upload's last 4)
--   gm_pex_card_grants      "this card spends on this grant" with
--                           effective dates, so a reassigned card
--                           doesn't drag old spending onto a new grant
--   gm_pex_transactions     (extended) card link, pending/settled,
--                           MCC, suggestions, flags, split tracking
--   pex_sync_runs           every sync, for the dashboard + debugging
--   pex_webhook_events      raw webhook log (replayable)
--
-- Split model: a transaction can be coded to several gm_expenses
-- (each row carries pex_transaction_id). Whatever isn't a grant
-- expense goes in non_grant_amount. Status:
--   unmatched  nothing allocated yet
--   partial    some allocated, some left
--   coded      grant portions + non-grant portion = full amount
--   ignored    entire amount marked not a grant expense
-- Rejected expenses don't count, so their portion goes back to the
-- queue. allocated_amount is kept in step by the API.
--
-- Additive only: safe to run on the live database.
-- ============================================================

-- ---------- cards ----------
create table if not exists pex_cards (
  id uuid primary key default gen_random_uuid(),
  pex_account_id int unique,            -- PEX cardholder AccountId; null for cards known only from a CSV
  first_name text,
  last_name text,
  email text,
  employee_id uuid references employees(id) on delete set null,
  office_id uuid references b2s_offices(id) on delete set null,
  last4 text,
  card_status text,                     -- ACTIVE / BLOCKED / CLOSED / INACTIVE
  account_status text,
  is_virtual boolean not null default false,
  available_balance numeric(14, 2),
  ledger_balance numeric(14, 2),
  custom_id text,
  user_groups jsonb,
  grant_eligible boolean not null default false,
  notes text,
  raw jsonb,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pex_cards_employee on pex_cards (employee_id);
create index if not exists pex_cards_last4 on pex_cards (last4);

-- ---------- card -> grant designations ----------
create table if not exists gm_pex_card_grants (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references pex_cards(id) on delete cascade,
  grant_id uuid not null references gm_grants(id) on delete cascade,
  start_date date not null,
  end_date date,                        -- null = open-ended
  is_default boolean not null default true,
  default_line_id uuid references gm_budget_lines(id) on delete set null,
  note text,
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists gm_pex_card_grants_card on gm_pex_card_grants (card_id, start_date);
create index if not exists gm_pex_card_grants_grant on gm_pex_card_grants (grant_id);

-- ---------- transactions (extend) ----------
alter table gm_pex_transactions add column if not exists card_id uuid references pex_cards(id) on delete set null;
alter table gm_pex_transactions add column if not exists pex_account_id int;
alter table gm_pex_transactions add column if not exists transaction_time timestamptz;
alter table gm_pex_transactions add column if not exists settlement_time timestamptz;
alter table gm_pex_transactions add column if not exists is_pending boolean not null default false;
alter table gm_pex_transactions add column if not exists auth_transaction_id text;
alter table gm_pex_transactions add column if not exists mcc text;
alter table gm_pex_transactions add column if not exists merchant_city text;
alter table gm_pex_transactions add column if not exists merchant_state text;
alter table gm_pex_transactions add column if not exists pex_tags jsonb;
alter table gm_pex_transactions add column if not exists pex_approval_status text;
alter table gm_pex_transactions add column if not exists source text not null default 'upload';
alter table gm_pex_transactions add column if not exists suggested_grant_id uuid references gm_grants(id) on delete set null;
alter table gm_pex_transactions add column if not exists suggested_line_id uuid references gm_budget_lines(id) on delete set null;
alter table gm_pex_transactions add column if not exists flags text[] not null default '{}';
alter table gm_pex_transactions add column if not exists allocated_amount numeric(14, 2) not null default 0;
alter table gm_pex_transactions add column if not exists non_grant_amount numeric(14, 2) not null default 0;
alter table gm_pex_transactions add column if not exists non_grant_note text;
alter table gm_pex_transactions add column if not exists synced_at timestamptz;
alter table gm_pex_transactions add column if not exists updated_at timestamptz not null default now();

alter table gm_pex_transactions drop constraint if exists gm_pex_transactions_source_check;
alter table gm_pex_transactions add constraint gm_pex_transactions_source_check check (source in ('upload', 'api', 'webhook'));
alter table gm_pex_transactions drop constraint if exists gm_pex_transactions_status_check;
alter table gm_pex_transactions add constraint gm_pex_transactions_status_check check (status in ('unmatched', 'partial', 'coded', 'ignored'));

create index if not exists gm_pex_card on gm_pex_transactions (card_id, transaction_date desc);
create index if not exists gm_pex_date on gm_pex_transactions (transaction_date desc);
create index if not exists gm_pex_suggested on gm_pex_transactions (suggested_grant_id, status);
create index if not exists gm_expenses_pex on gm_expenses (pex_transaction_id) where pex_transaction_id is not null;

-- Existing coded rows: allocated = their expense amount.
update gm_pex_transactions t
set allocated_amount = x.total
from (
  select pex_transaction_id, sum(amount) as total
  from gm_expenses where pex_transaction_id is not null and status <> 'rejected'
  group by pex_transaction_id
) x
where x.pex_transaction_id = t.id and t.allocated_amount = 0;

-- Existing "not a grant expense" rows: the whole amount is non-grant.
update gm_pex_transactions
set non_grant_amount = amount, non_grant_note = coalesce(non_grant_note, 'Not a grant expense')
where status = 'ignored' and non_grant_amount = 0;

-- ---------- sync log ----------
create table if not exists pex_sync_runs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('cards', 'transactions', 'full')),
  trigger text not null check (trigger in ('cron', 'manual', 'webhook')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  stats jsonb,
  error text,
  actor_id uuid references employees(id)
);
create index if not exists pex_sync_runs_recent on pex_sync_runs (started_at desc);

create table if not exists pex_webhook_events (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  event_kind text,                      -- transaction / card_status / card_shipment / virtual_card / unknown
  network_type text,                    -- Auth / Settlement / Reversal / Pin
  acct_id int,
  payload jsonb not null,
  processed_at timestamptz,
  error text
);
create index if not exists pex_webhook_events_recent on pex_webhook_events (received_at desc);

-- ---------- audit entity ----------
alter table gm_audit_log drop constraint if exists gm_audit_log_entity_check;
alter table gm_audit_log add constraint gm_audit_log_entity_check
  check (entity in ('grant', 'budget', 'expense', 'member', 'document', 'import', 'pex', 'pex_card', 'role', 'category'));

-- ---------- RLS: reads only, writes via the API ----------
alter table pex_cards enable row level security;
alter table gm_pex_card_grants enable row level security;
alter table pex_sync_runs enable row level security;
alter table pex_webhook_events enable row level security;

drop policy if exists pex_cards_read on pex_cards;
create policy pex_cards_read on pex_cards for select using (gm_is_manager() or employee_id = gm_me());
drop policy if exists gm_pex_card_grants_read on gm_pex_card_grants;
create policy gm_pex_card_grants_read on gm_pex_card_grants for select using (gm_can_view_grant(grant_id));
drop policy if exists pex_sync_runs_read on pex_sync_runs;
create policy pex_sync_runs_read on pex_sync_runs for select using (gm_is_manager());
-- webhook log: no read policy (service role only)

-- Approvers on a grant should see the PEX transactions suggested to it.
drop policy if exists gm_pex_read on gm_pex_transactions;
create policy gm_pex_read on gm_pex_transactions for select using (
  gm_is_manager()
  or employee_id = gm_me()
  or (suggested_grant_id is not null and gm_can_view_grant(suggested_grant_id))
);

-- ---------- PEX app tile (portal home) ----------
-- Admins see every tile; cardholders get "pex" program access
-- automatically when a card is linked to them.
insert into app_registry (slug, display_name, route, icon, is_active, sort_order)
values ('pex', 'PEX Cards', '/pex', 'credit-card', true, 9)
on conflict (slug) do update set display_name = excluded.display_name, route = excluded.route, is_active = true;
