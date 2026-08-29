-- ============================================================
-- Lets a requestor edit their own single-record detail row while
-- their ticket is in 'fixing' status (an approver requested changes)
-- - previously only admins could update these rows at all, so a
-- requestor literally could not act on "please fix X and resubmit".
--
-- Scoped narrowly on purpose: the update is only allowed while the
-- PARENT ticket's status is 'fixing', not at any time - once
-- approved (or even just pending), the detail a requestor submitted
-- shouldn't be silently editable out from under the approval chain
-- that's reviewing it.
--
-- Only the five single-record categories get this (Honorarium,
-- Utility, Vendor, PEX New/Recharge Request) - Credit Card and
-- Mileage's line-item editing is out of scope for this pass; those
-- two still resubmit as-is.
-- ============================================================

create policy "finance_honorariums own update while fixing" on finance_honorariums
  for update using (
    requestor_id = (select id from employees where auth_user_id = auth.uid())
    and exists (select 1 from finance_tickets t where t.honorarium_id = finance_honorariums.id and t.status = 'fixing')
  );

create policy "finance_utilities own update while fixing" on finance_utilities
  for update using (
    requestor_id = (select id from employees where auth_user_id = auth.uid())
    and exists (select 1 from finance_tickets t where t.utility_id = finance_utilities.id and t.status = 'fixing')
  );

create policy "finance_vendors own update while fixing" on finance_vendors
  for update using (
    requestor_id = (select id from employees where auth_user_id = auth.uid())
    and exists (select 1 from finance_tickets t where t.vendor_id = finance_vendors.id and t.status = 'fixing')
  );

create policy "finance_pex_new_requests own update while fixing" on finance_pex_new_requests
  for update using (
    requestor_id = (select id from employees where auth_user_id = auth.uid())
    and exists (select 1 from finance_tickets t where t.pex_new_request_id = finance_pex_new_requests.id and t.status = 'fixing')
  );

create policy "finance_pex_recharge_requests own update while fixing" on finance_pex_recharge_requests
  for update using (
    requestor_id = (select id from employees where auth_user_id = auth.uid())
    and exists (select 1 from finance_tickets t where t.pex_recharge_request_id = finance_pex_recharge_requests.id and t.status = 'fixing')
  );

-- The ticket's own title is also fine to edit while fixing.
create policy "finance_tickets own update while fixing" on finance_tickets
  for update using (
    requestor_id = (select id from employees where auth_user_id = auth.uid())
    and status = 'fixing'
  );
