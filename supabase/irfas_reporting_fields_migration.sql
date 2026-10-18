-- ============================================================
-- IRFAS reporting fields
-- ------------------------------------------------------------
-- What the Master Cleaner's IRFAS report needed that the portal's zakat
-- applications didn't capture:
--   program                   which program the assistance counts toward
--                             (same names as the IRFAS Power BI model)
--   recommended_by_*          staff member, or a free-text name for someone
--                             outside the portal (imam, partner agency)
--   funding_source / grant_id grant vs community money, and which grant
--   void                      new status for an approved/paid application
--                             whose check is voided — kept on record but out
--                             of totals and office limits (those only count
--                             approved + paid)
--
-- Also fixes: finance staff who aren't admins couldn't save anything in
-- the finance queue — the table only had an admin update policy.
--
-- NOT YET APPLIED — apply was cancelled; pending confirmation before running on the live project.
-- ============================================================

alter table zakat_applications
  add column if not exists program text check (program in (
    'Hunger Prevention', 'General', 'Refugee Services & Community Empowerment', 'Transitional Housing',
    'Muslim Family Services', 'Health Services', 'Back 2 School', 'FATE', 'Disaster Relief'
  )),
  add column if not exists recommended_by_employee_id uuid references employees(id),
  add column if not exists recommended_by_name text,
  add column if not exists funding_source text check (funding_source in ('community', 'grant')),
  add column if not exists grant_id uuid references grants(id) on delete set null,
  add column if not exists funding_set_by uuid references employees(id),
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references employees(id),
  add column if not exists void_reason text;

alter table zakat_applications drop constraint if exists zakat_applications_status_check;
alter table zakat_applications add constraint zakat_applications_status_check
  check (status in ('pending', 'approved', 'rejected', 'paid', 'void'));

alter table zakat_applications drop constraint if exists zakat_applications_grant_needs_source;
alter table zakat_applications add constraint zakat_applications_grant_needs_source
  check (grant_id is null or funding_source = 'grant');

create index if not exists idx_zakat_applications_program on zakat_applications (program, status);

-- Finance staff (is_zakat_finance) can update applications in the queue.
drop policy if exists "zakat_applications finance update" on zakat_applications;
create policy "zakat_applications finance update" on zakat_applications for update
  using ((select is_zakat_finance from employees where auth_user_id = auth.uid()) = true)
  with check ((select is_zakat_finance from employees where auth_user_id = auth.uid()) = true);

-- Backfill: recommender = the case manager who submitted it; program from
-- an open Refugee Services case / active housing stay, else left for
-- finance to set.
update zakat_applications set recommended_by_employee_id = coalesce(case_manager_id, submitted_by)
 where recommended_by_employee_id is null and recommended_by_name is null;

update zakat_applications z set program = 'Refugee Services & Community Empowerment'
 where z.program is null and exists (select 1 from rsce_cases c where c.client_id = z.client_id and c.status = 'open');

update zakat_applications z set program = 'Transitional Housing'
 where z.program is null and exists (select 1 from th_stays s where s.client_id = z.client_id and s.status = 'active');
