-- Grants employees holding the "helpdesk-finance" program access
-- (the same grant that already puts the Finance Guild queue in their
-- Help Desk nav, via helpdesk_department_access_migration.sql) real
-- read access to finance_tickets/finance_approvals and their detail
-- tables — not just admins, and not just "my own ticket".
--
-- Without this, the Finance Guild board could show a ticket exists
-- but RLS would silently return nothing for the ticket's own detail
-- (finance_utilities, finance_honorariums, etc.) the moment a
-- non-admin finance staffer opened it — same "own or admin" policies
-- every single-record detail table already has.
--
-- Purely additive: existing "own" and "admin" policies are untouched,
-- Postgres RLS just OR's multiple permissive policies together.

create or replace function has_helpdesk_department_access(dept text)
returns boolean
language sql security definer set search_path = public stable
as $$
  select
    exists (
      select 1 from employees e
      join employee_program_access epa on epa.employee_id = e.id
      where e.auth_user_id = auth.uid()
      and epa.program_slug = 'helpdesk-' || dept
    )
    or is_admin();
$$;

create policy "finance_tickets finance dept read" on finance_tickets
  for select using (has_helpdesk_department_access('finance'));
create policy "finance_approvals finance dept read" on finance_approvals
  for select using (has_helpdesk_department_access('finance'));
create policy "finance_honorariums finance dept read" on finance_honorariums
  for select using (has_helpdesk_department_access('finance'));
create policy "finance_utilities finance dept read" on finance_utilities
  for select using (has_helpdesk_department_access('finance'));
create policy "finance_vendors finance dept read" on finance_vendors
  for select using (has_helpdesk_department_access('finance'));
create policy "finance_pex_new_requests finance dept read" on finance_pex_new_requests
  for select using (has_helpdesk_department_access('finance'));
create policy "finance_pex_recharge_requests finance dept read" on finance_pex_recharge_requests
  for select using (has_helpdesk_department_access('finance'));
create policy "finance_credit_card_statements finance dept read" on finance_credit_card_statements
  for select using (has_helpdesk_department_access('finance'));
create policy "finance_credit_card_transactions finance dept read" on finance_credit_card_transactions
  for select using (has_helpdesk_department_access('finance'));
create policy "finance_mileage_batches finance dept read" on finance_mileage_batches
  for select using (has_helpdesk_department_access('finance'));
create policy "finance_mileage_trips finance dept read" on finance_mileage_trips
  for select using (has_helpdesk_department_access('finance'));
