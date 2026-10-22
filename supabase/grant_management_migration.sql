-- ============================================================
-- Grant Management (budget tracking) - replaces the per-grant Excel
-- budget trackers kept by the Grant Management team.
--
-- This is NOT the Revenue -> Grants page (table `grants`, grant
-- *revenue* by region). This module tracks each awarded grant's
-- approved budget and the spending coded against it:
--
--   gm_grants            one row per award (profile, period, status)
--   gm_grant_members     people assigned to a grant (+ optional line limits)
--   gm_user_roles        a person's role in this app + offices they cover
--   gm_categories        org-wide category/subcategory library
--   gm_budget_lines      a grant's budget lines (stable identity)
--   gm_budget_versions   original budget + each funder-approved amendment
--   gm_budget_amounts    line amounts per version
--   gm_expenses          spending coded to a grant + budget line
--   gm_expense_documents receipts/invoices/POs attached to an expense
--   gm_import_batches    bulk uploads (payroll, fringe, allocations, PEX)
--   gm_pex_transactions  PEX card transactions waiting to be coded
--   gm_audit_log         who did what, when, and what changed
--
-- Every write goes through the API (service role) so it can be
-- validated and audited; RLS only grants reads, scoped per grant.
-- ============================================================

-- ---------- roles ----------
create table if not exists gm_user_roles (
  employee_id uuid primary key references employees(id) on delete cascade,
  role text not null check (role in ('gm_admin', 'grant_manager', 'approver', 'office_user')),
  -- offices whose grants this person can see (approver / office_user)
  office_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- category library ----------
create table if not exists gm_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references gm_categories(id) on delete cascade,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists gm_categories_name_uniq on gm_categories (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- ---------- grants ----------
create table if not exists gm_grants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  funder text not null,
  code text not null,
  program text not null,
  office_id uuid references b2s_offices(id),
  region text,
  state text,
  award_amount numeric(14, 2) not null default 0 check (award_amount >= 0),
  start_date date not null,
  end_date date not null,
  funder_fiscal_year text,
  status text not null default 'draft' check (status in ('draft', 'active', 'on_hold', 'closed')),
  -- spending rules
  approval_required boolean not null default true,
  doc_required_over numeric(14, 2) not null default 0, -- receipts needed on purchases above this
  notes text,
  revenue_grant_id uuid references grants(id) on delete set null,
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references employees(id),
  check (end_date >= start_date)
);
create unique index if not exists gm_grants_code_uniq on gm_grants (lower(code));
create index if not exists gm_grants_office on gm_grants (office_id);
create index if not exists gm_grants_status on gm_grants (status, end_date);

create table if not exists gm_grant_members (
  grant_id uuid not null references gm_grants(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  role text not null check (role in ('grant_manager', 'approver', 'office_user', 'viewer')),
  -- null = every budget line; otherwise this person can only code to these
  allowed_line_ids uuid[],
  added_by uuid references employees(id),
  created_at timestamptz not null default now(),
  primary key (grant_id, employee_id)
);
create index if not exists gm_grant_members_emp on gm_grant_members (employee_id);

-- ---------- budget ----------
create table if not exists gm_budget_lines (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references gm_grants(id) on delete cascade,
  category text not null,
  subcategory text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists gm_budget_lines_uniq on gm_budget_lines (grant_id, lower(category), lower(coalesce(subcategory, '')));

create table if not exists gm_budget_versions (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references gm_grants(id) on delete cascade,
  version_no int not null,
  kind text not null check (kind in ('original', 'amendment')),
  status text not null default 'draft' check (status in ('draft', 'active', 'superseded')),
  effective_date date,
  funder_approved_date date,
  reason text,
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  activated_by uuid references employees(id),
  activated_at timestamptz,
  unique (grant_id, version_no)
);
create unique index if not exists gm_budget_versions_one_active on gm_budget_versions (grant_id) where status = 'active';
create unique index if not exists gm_budget_versions_one_draft on gm_budget_versions (grant_id) where status = 'draft';

create table if not exists gm_budget_amounts (
  version_id uuid not null references gm_budget_versions(id) on delete cascade,
  line_id uuid not null references gm_budget_lines(id) on delete cascade,
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  primary key (version_id, line_id)
);

-- ---------- imports / PEX ----------
create table if not exists gm_import_batches (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('expenses', 'pex')),
  file_name text,
  row_count int not null default 0,
  total numeric(14, 2) not null default 0,
  status text not null default 'applied' check (status in ('applied', 'removed')),
  created_by uuid references employees(id),
  created_at timestamptz not null default now()
);

create table if not exists gm_pex_transactions (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  card_holder text,
  card_last4 text,
  employee_id uuid references employees(id),
  transaction_date date not null,
  merchant text,
  amount numeric(14, 2) not null,
  memo text,
  status text not null default 'unmatched' check (status in ('unmatched', 'coded', 'ignored')),
  expense_id uuid,
  batch_id uuid references gm_import_batches(id) on delete set null,
  raw jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists gm_pex_external_uniq on gm_pex_transactions (external_id) where external_id is not null;
create index if not exists gm_pex_status on gm_pex_transactions (status, employee_id);

-- ---------- expenses ----------
create table if not exists gm_expenses (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references gm_grants(id),
  line_id uuid not null references gm_budget_lines(id),
  expense_date date not null,
  vendor text,
  amount numeric(14, 2) not null check (amount <> 0),
  description text not null,
  office_id uuid references b2s_offices(id),
  program text,
  kind text not null default 'purchase'
    check (kind in ('purchase', 'payroll', 'fringe', 'allocation', 'indirect', 'other')),
  payment_method text
    check (payment_method in ('pex', 'corporate_card', 'check', 'ach', 'reimbursement', 'payroll', 'journal', 'other')),
  doc_required boolean not null default true,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'rejected', 'returned')),
  source text not null default 'manual' check (source in ('manual', 'import', 'pex')),
  external_ref text,
  import_batch_id uuid references gm_import_batches(id) on delete set null,
  pex_transaction_id uuid references gm_pex_transactions(id) on delete set null,
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_by uuid references employees(id),
  submitted_at timestamptz,
  reviewed_by uuid references employees(id),
  reviewed_at timestamptz,
  review_note text
);
create index if not exists gm_expenses_grant on gm_expenses (grant_id, status);
create index if not exists gm_expenses_line on gm_expenses (line_id, status);
create index if not exists gm_expenses_creator on gm_expenses (created_by, status);
create index if not exists gm_expenses_date on gm_expenses (expense_date);
create index if not exists gm_expenses_batch on gm_expenses (import_batch_id);

alter table gm_pex_transactions drop constraint if exists gm_pex_expense_fk;
alter table gm_pex_transactions add constraint gm_pex_expense_fk foreign key (expense_id) references gm_expenses(id) on delete set null;

create table if not exists gm_expense_documents (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid references gm_expenses(id) on delete cascade,
  storage_path text not null unique,
  file_name text,
  content_type text,
  size_bytes int,
  doc_type text not null default 'receipt'
    check (doc_type in ('receipt', 'invoice', 'purchase_order', 'contract', 'approval', 'timesheet', 'other')),
  extracted jsonb,
  uploaded_by uuid references employees(id),
  created_at timestamptz not null default now()
);
create index if not exists gm_docs_expense on gm_expense_documents (expense_id);
create index if not exists gm_docs_pending on gm_expense_documents (uploaded_by) where expense_id is null;

-- ---------- audit ----------
create table if not exists gm_audit_log (
  id bigint generated always as identity primary key,
  entity text not null check (entity in ('grant', 'budget', 'expense', 'member', 'document', 'import', 'pex', 'role', 'category')),
  entity_id uuid,
  grant_id uuid references gm_grants(id) on delete cascade,
  action text not null,
  actor_id uuid references employees(id),
  changes jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists gm_audit_entity on gm_audit_log (entity, entity_id, created_at desc);
create index if not exists gm_audit_grant on gm_audit_log (grant_id, created_at desc);

-- ============================================================
-- Access helpers
-- ============================================================
create or replace function gm_me() returns uuid
language sql stable security definer set search_path = public as $$
  select id from employees where auth_user_id = auth.uid() and coalesce(is_active, true) limit 1;
$$;

create or replace function gm_role() returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from employees where auth_user_id = auth.uid() and role = 'admin') then 'gm_admin'
    else (select r.role from gm_user_roles r where r.employee_id = gm_me() and r.is_active)
  end;
$$;

create or replace function gm_is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(gm_role() in ('gm_admin', 'grant_manager'), false);
$$;

create or replace function gm_can_view_grant(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select gm_is_manager()
    or exists (select 1 from gm_grant_members m where m.grant_id = gid and m.employee_id = gm_me())
    or exists (
      select 1 from gm_grants g
      join gm_user_roles r on r.employee_id = gm_me() and r.is_active
      where g.id = gid and g.office_id is not null and g.office_id = any (r.office_ids)
    );
$$;

-- ============================================================
-- RLS: reads only. Writes go through the API (service role).
-- ============================================================
alter table gm_user_roles enable row level security;
alter table gm_categories enable row level security;
alter table gm_grants enable row level security;
alter table gm_grant_members enable row level security;
alter table gm_budget_lines enable row level security;
alter table gm_budget_versions enable row level security;
alter table gm_budget_amounts enable row level security;
alter table gm_expenses enable row level security;
alter table gm_expense_documents enable row level security;
alter table gm_import_batches enable row level security;
alter table gm_pex_transactions enable row level security;
alter table gm_audit_log enable row level security;

drop policy if exists gm_user_roles_read on gm_user_roles;
create policy gm_user_roles_read on gm_user_roles for select using (employee_id = gm_me() or gm_is_manager());
drop policy if exists gm_categories_read on gm_categories;
create policy gm_categories_read on gm_categories for select using (gm_role() is not null);
drop policy if exists gm_grants_read on gm_grants;
create policy gm_grants_read on gm_grants for select using (gm_can_view_grant(id));
drop policy if exists gm_members_read on gm_grant_members;
create policy gm_members_read on gm_grant_members for select using (gm_can_view_grant(grant_id));
drop policy if exists gm_lines_read on gm_budget_lines;
create policy gm_lines_read on gm_budget_lines for select using (gm_can_view_grant(grant_id));
drop policy if exists gm_versions_read on gm_budget_versions;
create policy gm_versions_read on gm_budget_versions for select using (gm_can_view_grant(grant_id));
drop policy if exists gm_amounts_read on gm_budget_amounts;
create policy gm_amounts_read on gm_budget_amounts for select using (
  exists (select 1 from gm_budget_versions v where v.id = version_id and gm_can_view_grant(v.grant_id))
);
drop policy if exists gm_expenses_read on gm_expenses;
create policy gm_expenses_read on gm_expenses for select using (gm_can_view_grant(grant_id) or created_by = gm_me());
drop policy if exists gm_docs_read on gm_expense_documents;
create policy gm_docs_read on gm_expense_documents for select using (
  uploaded_by = gm_me()
  or exists (select 1 from gm_expenses e where e.id = expense_id and gm_can_view_grant(e.grant_id))
);
drop policy if exists gm_batches_read on gm_import_batches;
create policy gm_batches_read on gm_import_batches for select using (gm_is_manager());
drop policy if exists gm_pex_read on gm_pex_transactions;
create policy gm_pex_read on gm_pex_transactions for select using (gm_is_manager() or employee_id = gm_me());
drop policy if exists gm_audit_read on gm_audit_log;
create policy gm_audit_read on gm_audit_log for select using (gm_is_manager() or (grant_id is not null and gm_can_view_grant(grant_id)));

-- ============================================================
-- Rollups. security_invoker so they respect the RLS above.
-- Actual = approved spending. Pending = submitted, not yet decided.
-- ============================================================
create or replace view gm_line_summary with (security_invoker = true) as
select
  l.id as line_id,
  l.grant_id,
  l.category,
  l.subcategory,
  l.sort_order,
  l.is_active,
  coalesce(a.amount, 0)::numeric(14, 2) as budget,
  coalesce(o.amount, 0)::numeric(14, 2) as original_budget,
  coalesce(x.actual, 0)::numeric(14, 2) as actual,
  coalesce(x.pending, 0)::numeric(14, 2) as pending,
  (coalesce(a.amount, 0) - coalesce(x.actual, 0))::numeric(14, 2) as remaining,
  case when coalesce(a.amount, 0) > 0 then round(coalesce(x.actual, 0) / a.amount * 100, 1) end as pct_spent
from gm_budget_lines l
left join gm_budget_versions av on av.grant_id = l.grant_id and av.status = 'active'
left join gm_budget_amounts a on a.version_id = av.id and a.line_id = l.id
left join gm_budget_versions ov on ov.grant_id = l.grant_id and ov.version_no = 1
left join gm_budget_amounts o on o.version_id = ov.id and o.line_id = l.id
left join (
  select line_id,
    sum(amount) filter (where status = 'approved') as actual,
    sum(amount) filter (where status = 'submitted') as pending
  from gm_expenses group by line_id
) x on x.line_id = l.id;

create or replace view gm_grant_summary with (security_invoker = true) as
select
  g.id, g.name, g.funder, g.code, g.program, g.office_id, g.region, g.state,
  o.field_office as office_name,
  coalesce(g.region, o.region) as resolved_region,
  coalesce(g.state, o.state) as resolved_state,
  g.award_amount, g.start_date, g.end_date, g.funder_fiscal_year, g.status,
  g.approval_required, g.doc_required_over, g.created_at, g.closed_at,
  coalesce(b.budget, 0)::numeric(14, 2) as total_budget,
  coalesce(x.actual, 0)::numeric(14, 2) as actual,
  coalesce(x.pending, 0)::numeric(14, 2) as pending,
  (coalesce(b.budget, 0) - coalesce(x.actual, 0))::numeric(14, 2) as remaining,
  case when coalesce(b.budget, 0) > 0 then round(coalesce(x.actual, 0) / b.budget * 100, 1) end as pct_spent,
  -- share of the grant period that has elapsed, for burn-rate checks
  round(least(1, greatest(0,
    (current_date - g.start_date)::numeric / nullif((g.end_date - g.start_date) + 1, 0)
  )) * 100, 1) as pct_time_elapsed,
  (g.end_date - current_date) as days_left,
  coalesce(x.missing_docs, 0) as missing_docs,
  coalesce(x.expense_count, 0) as expense_count,
  coalesce(ol.over_lines, 0) as over_budget_lines,
  av.version_no as budget_version
from gm_grants g
left join b2s_offices o on o.id = g.office_id
left join gm_budget_versions av on av.grant_id = g.id and av.status = 'active'
left join (
  select version_id, sum(amount) as budget from gm_budget_amounts group by version_id
) b on b.version_id = av.id
left join (
  select e.grant_id,
    sum(e.amount) filter (where e.status = 'approved') as actual,
    sum(e.amount) filter (where e.status = 'submitted') as pending,
    count(*) filter (where e.status in ('submitted', 'approved')) as expense_count,
    count(*) filter (
      where e.status in ('submitted', 'approved') and e.doc_required
        and not exists (select 1 from gm_expense_documents d where d.expense_id = e.id)
    ) as missing_docs
  from gm_expenses e group by e.grant_id
) x on x.grant_id = g.id
left join (
  select grant_id, count(*) as over_lines from gm_line_summary where actual > budget and budget >= 0 and actual > 0 group by grant_id
) ol on ol.grant_id = g.id;

grant select on gm_line_summary, gm_grant_summary to authenticated;

-- ============================================================
-- Seed: category library (from the Grant Management requirements)
-- ============================================================
do $$
declare
  cats jsonb := '[
    ["Personnel", ["Salaries/Wages", "FICA", "Unemployment Insurance", "Health Insurance"]],
    ["Travel", ["Mileage", "Gas", "Airfare", "Hotel", "Rental Car"]],
    ["Occupancy", ["Rent", "Telephone", "Office-related costs"]],
    ["Contractual Services", []],
    ["Operational", []],
    ["Building & Equipment", []],
    ["Community Education & Outreach", []],
    ["Direct Client Assistance", []],
    ["Indirect Costs", []],
    ["Other", []]
  ]';
  c jsonb;
  pid uuid;
  i int := 0;
  j int;
  s text;
begin
  if exists (select 1 from gm_categories) then return; end if;
  for c in select * from jsonb_array_elements(cats) loop
    i := i + 1;
    insert into gm_categories (name, sort_order) values (c->>0, i * 10) returning id into pid;
    j := 0;
    for s in select * from jsonb_array_elements_text(c->1) loop
      j := j + 1;
      insert into gm_categories (name, parent_id, sort_order) values (s, pid, j);
    end loop;
  end loop;
end $$;

-- ---------- storage + app tile ----------
insert into storage.buckets (id, name, public)
values ('grant-documents', 'grant-documents', false)
on conflict (id) do nothing;

insert into app_registry (slug, display_name, route, icon, is_active, sort_order)
values ('grant-management', 'Grant Management', '/grant-management', 'wallet', true, 8)
on conflict (slug) do update set display_name = excluded.display_name, route = excluded.route, is_active = true;
