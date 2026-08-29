-- ============================================================
-- Finance Tickets - replaces the Finance Approvals feature
-- ============================================================
-- Rebuilt from Travis's uploaded PowerApps/Dataverse solution
-- (TicketManager) and its MainFinanceApproval Power Automate flow,
-- not guessed. The routing logic below is a direct port of that
-- flow's Do_until loop:
--   - Non-C-suite requestor: climb the requestor's OWN manager chain
--     (via Graph, same as the old system) until a manager's own
--     monetary_limit covers the ticket total.
--   - C-suite requestor: <= $5,000 needs no further approval;
--     <= $10,000 self-approves if the requestor's Graph job title is
--     "COO"; anything above that requires a CEO-level approval
--     (routed via a configurable Connectors setting, not a hardcoded
--     user id like the original flow - that's the one deliberate
--     improvement over the source).
-- Old finance_approval_tiers/requests/steps are NOT dropped (real
-- historical approvals may already exist there) - they just stop
-- being used going forward. finance_approval_delegates IS reused
-- as-is: it already implements exactly what the source system's
-- ir_UserOOO (out-of-office reassignment) does.

alter table employees add column if not exists monetary_limit numeric(10, 2);
alter table employees add column if not exists is_csuite boolean not null default false;

comment on column employees.monetary_limit is
  'Dollar amount this employee can approve a finance ticket up to, on their own, without escalating further. Null = cannot approve any amount on their own (routing keeps climbing past them).';
comment on column employees.is_csuite is
  'C-suite requestors get the special-cased approval path (see lib/financeTickets.ts) instead of climbing their own manager chain.';

-- ============================================================
-- Core ticket + approval + log tables
-- ============================================================
-- Ticket type-specific detail (credit card, honorarium, mileage,
-- utility, vendor, PEX new/recharge) and grant/office allocation
-- splitting are a later phase - this table is deliberately built to
-- accept a type-specific detail_id once those tables exist, without
-- a migration to add the column later (jsonb keeps this phase
-- self-contained and non-blocking for the approval engine, which is
-- the highest-risk part to get right).
create table finance_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique,
  title text not null,
  category text not null check (
    category in (
      'credit_card_reimbursement', 'honorarium', 'mileage_reimbursement',
      'pex_new_card_request', 'pex_recharge_request', 'utility_payment', 'vendor_payment'
    )
  ),
  -- Holds the type-specific submitted fields until Phase 2 introduces
  -- dedicated detail tables + grant/office allocation splitting.
  detail jsonb not null default '{}',

  requestor_id uuid not null references employees(id),
  billing_office_id uuid references b2s_offices(id),
  grant_eligible boolean not null default false,

  total numeric(10, 2) not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),

  status text not null default 'draft' check (
    status in ('draft', 'open', 'pending', 'in_progress', 'on_hold', 'fixing', 'processed', 'denied', 'duplicate')
  ),

  -- Set once a finance technician picks this up for processing
  -- (post-approval payment/reimbursement step - separate from the
  -- approval chain itself).
  technician_id uuid references employees(id),
  technician_notes text,
  technician_started_at timestamptz,
  technician_ended_at timestamptz,

  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_finance_tickets_requestor on finance_tickets(requestor_id);
create index idx_finance_tickets_status on finance_tickets(status, submitted_at desc);
create index idx_finance_tickets_office on finance_tickets(billing_office_id);

-- Auto-generated ticket numbers (FT-000001 style) rather than relying
-- on the client to supply one.
create sequence if not exists finance_ticket_number_seq;
create or replace function generate_finance_ticket_number()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.ticket_number is null or new.ticket_number = '' then
    new.ticket_number := 'FT-' || lpad(nextval('finance_ticket_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger trg_finance_ticket_number
  before insert on finance_tickets
  for each row execute function generate_finance_ticket_number();

-- One row per approval step in the chain - mirrors ir_Approvals'
-- shape (approval_level, sequence_status, revision tracking) closely
-- since that's a proven model, not reinvented.
create table finance_approvals (
  id uuid primary key default gen_random_uuid(),
  finance_ticket_id uuid not null references finance_tickets(id) on delete cascade,

  approval_level int not null,
  sequence_status text not null default 'not_started' check (sequence_status in ('not_started', 'active', 'completed', 'skipped')),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected', 'fix')),

  -- The actual person the chain climbed to.
  chain_person_email text not null,
  chain_person_name text not null,
  chain_person_job_title text,
  -- Who's actually deciding, if different (OOO delegate coverage -
  -- reuses finance_approval_delegates, same as the old system).
  approver_email text not null,
  approver_name text not null,
  acting_as_delegate_for_email text,

  approval_amount_threshold numeric(10, 2),
  is_current_step boolean not null default false,
  is_final_approval boolean not null default false,
  returned_to_requester boolean not null default false,
  revision_number int not null default 1,

  comments text,
  action_taken_by uuid references employees(id),
  approval_token uuid not null default gen_random_uuid(),
  date_assigned timestamptz not null default now(),
  decision_date timestamptz,
  due_date timestamptz,

  created_at timestamptz not null default now()
);

create unique index idx_finance_approvals_token on finance_approvals(approval_token);
create index idx_finance_approvals_ticket on finance_approvals(finance_ticket_id, approval_level);

-- Unified comment/status-change/audit trail per ticket - a genuinely
-- new capability the old finance_approval_requests/steps pair didn't
-- have, ported from ir_TicketLog.
create table finance_ticket_log (
  id uuid primary key default gen_random_uuid(),
  finance_ticket_id uuid not null references finance_tickets(id) on delete cascade,
  comment text,
  comment_type text not null default 'comment' check (comment_type in ('comment', 'status_change', 'question', 'response', 'approval')),
  notify_user boolean not null default false,
  created_by uuid references employees(id),
  created_at timestamptz not null default now()
);

create index idx_finance_ticket_log_ticket on finance_ticket_log(finance_ticket_id, created_at desc);

-- ============================================================
-- RLS
-- ============================================================
alter table finance_tickets enable row level security;
alter table finance_approvals enable row level security;
alter table finance_ticket_log enable row level security;

create policy "finance_tickets own or admin" on finance_tickets
  for select using (
    requestor_id = (select id from employees where auth_user_id = auth.uid())
    or technician_id = (select id from employees where auth_user_id = auth.uid())
    or is_admin()
  );

create policy "finance_tickets requestor create" on finance_tickets
  for insert with check (
    requestor_id = (select id from employees where auth_user_id = auth.uid())
  );

create policy "finance_tickets admin full access" on finance_tickets for all using (is_admin());

-- Approval decisions happen exclusively through the token link
-- (service-role API route), same as the old finance_approval_steps -
-- only admins get a direct read here for auditing.
create policy "finance_approvals admin read" on finance_approvals for select using (is_admin());

create policy "finance_ticket_log via ticket" on finance_ticket_log
  for select using (
    exists (
      select 1 from finance_tickets t
      where t.id = finance_ticket_log.finance_ticket_id
      and (
        t.requestor_id = (select id from employees where auth_user_id = auth.uid())
        or t.technician_id = (select id from employees where auth_user_id = auth.uid())
        or is_admin()
      )
    )
  );

create policy "finance_ticket_log admin full access" on finance_ticket_log for all using (is_admin());
