-- ============================================================
-- IT Helpdesk - Hardware Request purchase approval + invoice gate
--
-- Every new IT "Hardware Request" ticket must be approved before
-- anything is bought, and can't be closed without the invoice:
--
--   Stage 1  - the requester's direct supervisor (their manager in
--              Microsoft 365 / Entra - so a Regional or Program
--              Director's ticket goes to whoever they report to, not
--              an Area Manager)
--   Stage 2  - the CIO and the CSO, at the same time; both must approve
--
-- One person never approves the same ticket twice: if the supervisor
-- IS the CSO (or the CIO), their stage-1 approval also counts for that
-- role and stage 2 only goes to whoever is left. A role the requester
-- holds themselves is counted as satisfied, since nobody approves
-- their own purchase. Any denial closes the ticket.
--
-- While approval is pending the leg can only sit in Open / On Hold.
-- Once approved, it can't be closed (or handed off) until an invoice
-- is attached. Both rules are enforced here in the database, so the
-- Close button, a workboard drag, or any other path can't skip them.
--
-- The gate only applies to hardware tickets created after this
-- migration (and never to SharePoint-imported ones) - see
-- hardware_gate below. Older tickets close exactly as before.
--
-- CIO / CSO approver emails are set on Admin -> Workflows
-- (wf_hardware_cio_email / wf_hardware_cso_email in integration_settings).
-- ============================================================

-- ---------- Leg columns ----------
alter table helpdesk_request_legs add column if not exists hardware_gate boolean not null default false;
alter table helpdesk_request_legs add column if not exists hardware_approval_status text
  check (hardware_approval_status in ('pending', 'approved', 'denied'));
alter table helpdesk_request_legs add column if not exists hardware_approved_at timestamptz;

create index if not exists idx_helpdesk_legs_hw_pending on helpdesk_request_legs (hardware_approval_status)
  where hardware_gate;

-- ---------- Approval steps ----------
-- Read/written only through server routes with the service-role
-- client. The one RLS policy lets an approver see their OWN steps
-- (for the "Pending your approval" list on the Help Desk home); the
-- token is the credential for the no-login approval link, so nobody
-- else may read it.
create table if not exists helpdesk_hardware_approvals (
  id uuid primary key default gen_random_uuid(),
  leg_id uuid not null references helpdesk_request_legs(id) on delete cascade,
  request_id uuid not null references helpdesk_requests(id) on delete cascade,
  stage text not null check (stage in ('supervisor', 'executive')),
  -- which roles this one person's decision covers, e.g. {supervisor,cso}
  roles text[] not null,
  approver_name text not null,
  approver_email text not null,
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'denied', 'superseded')),
  notes text,
  approval_token uuid not null unique default gen_random_uuid(),
  decided_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_hw_approvals_leg on helpdesk_hardware_approvals (leg_id);
create index if not exists idx_hw_approvals_email on helpdesk_hardware_approvals (lower(approver_email)) where decision = 'pending';

alter table helpdesk_hardware_approvals enable row level security;
drop policy if exists "approver reads own hardware approvals" on helpdesk_hardware_approvals;
create policy "approver reads own hardware approvals" on helpdesk_hardware_approvals
  for select using (lower(approver_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Timeline shown on the ticket (who was asked, routing decisions,
-- email failures, why it's stuck).
create table if not exists helpdesk_hardware_events (
  id uuid primary key default gen_random_uuid(),
  leg_id uuid not null references helpdesk_request_legs(id) on delete cascade,
  kind text not null,
  message text not null,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_hw_events_leg on helpdesk_hardware_events (leg_id, created_at);
alter table helpdesk_hardware_events enable row level security;

-- ---------- Invoices ----------
-- Reuses the existing (until now unused) helpdesk_attachments table.
-- kind = 'invoice' rows are only ever written by the server route
-- /api/helpdesk/invoices, files live in the private helpdesk-invoices bucket.
alter table helpdesk_attachments add column if not exists kind text not null default 'file';
alter table helpdesk_attachments add column if not exists content_type text;
alter table helpdesk_attachments add column if not exists size_bytes bigint;
create index if not exists idx_helpdesk_attachments_leg_kind on helpdesk_attachments (leg_id, kind);

insert into storage.buckets (id, name, public)
values ('helpdesk-invoices', 'helpdesk-invoices', false)
on conflict (id) do nothing;

-- Browsers (anon / authenticated) may not create, change or remove
-- invoice rows directly - otherwise the close gate could be faked.
create or replace function helpdesk_attachments_invoice_guard() returns trigger
language plpgsql as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if (tg_op in ('INSERT', 'UPDATE') and new.kind = 'invoice')
       or (tg_op in ('UPDATE', 'DELETE') and old.kind = 'invoice') then
      raise exception 'Invoices can only be added or removed from the ticket page.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_helpdesk_attachments_invoice_guard on helpdesk_attachments;
create trigger trg_helpdesk_attachments_invoice_guard
  before insert or update or delete on helpdesk_attachments
  for each row execute function helpdesk_attachments_invoice_guard();

-- ---------- The gate ----------
create or replace function helpdesk_hardware_gate() returns trigger
language plpgsql as $$
declare
  restricted boolean := coalesce(auth.role(), '') in ('authenticated', 'anon');
  imported boolean;
begin
  if tg_op = 'INSERT' then
    -- Clients can never pre-set approval state.
    if restricted then
      new.hardware_gate := false;
      new.hardware_approval_status := null;
      new.hardware_approved_at := null;
    end if;
    if new.department = 'it' and new.category = 'Hardware Request' and not new.hardware_gate then
      select (r.source_sharepoint_id is not null) into imported from helpdesk_requests r where r.id = new.request_id;
      if not coalesce(imported, false) then
        new.hardware_gate := true;
        new.hardware_approval_status := 'pending';
        new.status := 'open';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE
  if restricted then
    if new.hardware_gate is distinct from old.hardware_gate
       or new.hardware_approval_status is distinct from old.hardware_approval_status
       or new.hardware_approved_at is distinct from old.hardware_approved_at then
      raise exception 'Hardware approval can only change through the approval links.';
    end if;
  end if;

  -- A ticket recategorised as a hardware request after it was created
  -- picks up the gate too (IT queue only, never imported tickets).
  if not new.hardware_gate and new.department = 'it' and new.category = 'Hardware Request'
     and new.category is distinct from old.category and new.status not in ('closed', 'handed_off') then
    select (r.source_sharepoint_id is not null) into imported from helpdesk_requests r where r.id = new.request_id;
    if not coalesce(imported, false) then
      new.hardware_gate := true;
      new.hardware_approval_status := 'pending';
    end if;
  end if;

  if new.hardware_gate and new.status is distinct from old.status then
    if new.hardware_approval_status = 'pending' and new.status not in ('open', 'on_hold') then
      raise exception 'HARDWARE_APPROVAL_PENDING: This hardware request is still waiting on purchase approval (supervisor, then CIO and CSO). Nothing can be worked or purchased until it is approved.';
    end if;
    if new.hardware_approval_status = 'denied' and restricted then
      raise exception 'This hardware request was denied and can''t be reopened. Submit a new request instead.';
    end if;
    if new.hardware_approval_status = 'approved' and new.status in ('closed', 'handed_off')
       and not exists (select 1 from helpdesk_attachments a where a.leg_id = new.id and a.kind = 'invoice') then
      raise exception 'HARDWARE_INVOICE_REQUIRED: Upload the invoice for this purchase before closing the ticket.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_helpdesk_hardware_gate on helpdesk_request_legs;
create trigger trg_helpdesk_hardware_gate
  before insert or update on helpdesk_request_legs
  for each row execute function helpdesk_hardware_gate();
