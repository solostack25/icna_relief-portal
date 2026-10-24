-- ============================================================
-- IT Helpdesk - Hardware Request budget + grant line items
--
-- Run after helpdesk_hardware_approvals_migration.sql.
--
-- * The direct supervisor sets the approved amount when they approve
--   (stored on their approval step). The CIO and CSO approve that
--   amount, and once they both have it becomes the ticket's budget
--   (helpdesk_request_legs.hardware_approved_amount).
-- * Grant orders can list line items: device, quantity, price each.
--   Requesters add them when they submit; after that they're locked
--   so what the approvers saw is what gets bought.
-- ============================================================

alter table helpdesk_hardware_approvals add column if not exists approved_amount numeric(12, 2)
  check (approved_amount is null or approved_amount > 0);

alter table helpdesk_request_legs add column if not exists hardware_approved_amount numeric(12, 2)
  check (hardware_approved_amount is null or hardware_approved_amount > 0);

create table if not exists helpdesk_hardware_line_items (
  id uuid primary key default gen_random_uuid(),
  leg_id uuid not null references helpdesk_request_legs(id) on delete cascade,
  description text not null check (length(trim(description)) > 0),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_hw_line_items_leg on helpdesk_hardware_line_items (leg_id, sort_order);

alter table helpdesk_hardware_line_items enable row level security;
drop policy if exists "staff add hardware line items" on helpdesk_hardware_line_items;
create policy "staff add hardware line items" on helpdesk_hardware_line_items
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "staff read hardware line items" on helpdesk_hardware_line_items;
create policy "staff read hardware line items" on helpdesk_hardware_line_items
  for select using (auth.role() = 'authenticated');

-- Browsers can only add items to a ticket that hasn't been decided on
-- by anyone yet, and can never change or remove them afterwards.
-- security definer so the check can see approval steps the requester
-- isn't allowed to read under RLS.
create or replace function helpdesk_hardware_line_items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    -- Cascading delete of the whole ticket (e.g. a failed submit being
    -- rolled back) is fine: the leg is already gone by this point.
    if tg_op = 'DELETE' and not exists (select 1 from helpdesk_request_legs l where l.id = old.leg_id) then
      return old;
    end if;
    if tg_op <> 'INSERT' then
      raise exception 'Line items can''t be changed once the request is submitted.';
    end if;
    if not exists (select 1 from helpdesk_request_legs l where l.id = new.leg_id and l.hardware_approval_status = 'pending')
       or exists (select 1 from helpdesk_hardware_approvals a where a.leg_id = new.leg_id and a.decision <> 'pending') then
      raise exception 'Line items can''t be changed once approval has started.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_helpdesk_hardware_line_items_guard on helpdesk_hardware_line_items;
create trigger trg_helpdesk_hardware_line_items_guard
  before insert or update or delete on helpdesk_hardware_line_items
  for each row execute function helpdesk_hardware_line_items_guard();

-- Same gate as before, now also protecting the approved budget.
create or replace function helpdesk_hardware_gate() returns trigger
language plpgsql as $$
declare
  restricted boolean := coalesce(auth.role(), '') in ('authenticated', 'anon');
  imported boolean;
begin
  if tg_op = 'INSERT' then
    if restricted then
      new.hardware_gate := false;
      new.hardware_approval_status := null;
      new.hardware_approved_at := null;
      new.hardware_approved_amount := null;
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

  if restricted then
    if new.hardware_gate is distinct from old.hardware_gate
       or new.hardware_approval_status is distinct from old.hardware_approval_status
       or new.hardware_approved_at is distinct from old.hardware_approved_at
       or new.hardware_approved_amount is distinct from old.hardware_approved_amount then
      raise exception 'Hardware approval can only change through the approval links.';
    end if;
  end if;

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

-- Hardening (Supabase security advisor): fixed search_path on the
-- trigger functions, and the security-definer guard can't be called
-- directly over the API (it only ever runs as a trigger).
alter function helpdesk_hardware_gate() set search_path = public;
alter function helpdesk_attachments_invoice_guard() set search_path = public;
revoke execute on function helpdesk_hardware_line_items_guard() from public, anon, authenticated;
