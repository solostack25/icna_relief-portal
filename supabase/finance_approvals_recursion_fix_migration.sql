-- Fixes an infinite-recursion bug introduced by
-- finance_approvals_approver_access_migration.sql: that migration's
-- "finance_tickets approver read" policy checks finance_approvals
-- directly via a raw EXISTS subquery, and the pre-existing
-- "finance_approvals own ticket read" policy checks finance_tickets
-- right back the same way — each table's RLS evaluation re-triggers
-- the other table's, forever.
--
-- Fix: wrap both cross-table checks in SECURITY DEFINER functions,
-- same pattern already used everywhere else in this app for exactly
-- this reason (is_admin(), my_assigned_office(),
-- has_helpdesk_department_access()) — the function body runs as its
-- owner, which bypasses RLS, so the inner lookup never re-triggers
-- the other table's policies and the cycle terminates immediately.

create or replace function is_finance_ticket_requestor(p_ticket_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from finance_tickets t
    where t.id = p_ticket_id
    and t.requestor_id = (select id from employees where auth_user_id = auth.uid())
  );
$$;

create or replace function is_finance_approver_for_ticket(p_ticket_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from finance_approvals fa
    where fa.finance_ticket_id = p_ticket_id
    and lower(fa.approver_email) = lower((select email from employees where auth_user_id = auth.uid()))
  );
$$;

drop policy "finance_approvals own ticket read" on finance_approvals;
create policy "finance_approvals own ticket read" on finance_approvals
  for select using (is_finance_ticket_requestor(finance_approvals.finance_ticket_id));

drop policy "finance_tickets approver read" on finance_tickets;
create policy "finance_tickets approver read" on finance_tickets
  for select using (is_finance_approver_for_ticket(finance_tickets.id));
