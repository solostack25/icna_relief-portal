-- ============================================================
-- IT Helpdesk - Hardware Request close-out
--
-- Run after helpdesk_hardware_budget_migration.sql.
--
-- When a hardware ticket closes (approved + invoice attached):
--   * the requester is emailed with the invoice(s) attached
--   * if it was a grant purchase, each invoice becomes an expense on
--     that grant in Grant Management (amount, vendor, budget line the
--     IT team picked when uploading), with the invoice file attached,
--     linked back to the ticket
--
-- Invoice rows stay server-written only (see the invoice guard in
-- helpdesk_hardware_approvals_migration.sql), so these amounts can't
-- be changed from a browser.
-- ============================================================

alter table helpdesk_attachments add column if not exists amount numeric(12, 2) check (amount is null or amount > 0);
alter table helpdesk_attachments add column if not exists vendor text;
alter table helpdesk_attachments add column if not exists payment_method text
  check (payment_method is null or payment_method in ('pex', 'corporate_card', 'check', 'ach', 'reimbursement', 'other'));
alter table helpdesk_attachments add column if not exists gm_line_id uuid references gm_budget_lines(id) on delete set null;
alter table helpdesk_attachments add column if not exists gm_expense_id uuid references gm_expenses(id) on delete set null;

-- Grant expense <-> ticket link. One expense per invoice, ever.
alter table gm_expenses add column if not exists helpdesk_request_id uuid references helpdesk_requests(id) on delete set null;
alter table gm_expenses add column if not exists helpdesk_attachment_id uuid references helpdesk_attachments(id) on delete set null;
create unique index if not exists gm_expenses_helpdesk_attachment_uniq on gm_expenses (helpdesk_attachment_id) where helpdesk_attachment_id is not null;

alter table helpdesk_request_legs add column if not exists hardware_closeout_emailed_at timestamptz;

-- Same gate, now also protecting the close-out marker.
create or replace function helpdesk_hardware_gate() returns trigger
language plpgsql set search_path = public as $$
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
      new.hardware_closeout_emailed_at := null;
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
       or new.hardware_approved_amount is distinct from old.hardware_approved_amount
       or new.hardware_closeout_emailed_at is distinct from old.hardware_closeout_emailed_at then
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
