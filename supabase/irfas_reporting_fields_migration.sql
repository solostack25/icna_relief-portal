-- ============================================================
-- IRFAS reporting fields
-- ------------------------------------------------------------
-- What the Master Cleaner's IRFAS report needed that the portal's zakat
-- applications didn't capture:
--   program                   which program the assistance counts toward
--                             (same names as the IRFAS Power BI model)
--   recommended_by_*          staff member, or a free-text name for someone
--                             outside the portal (imam, partner agency).
--                             Null on older rows → shown as the case manager.
--   funding_source / grant_id grant vs community money, and which grant
--   voided_at / _by / reason  a voided check. Status is left as-is
--                             (approved/paid); every total, office limit and
--                             export excludes rows where voided_at is set.
--
-- Also fixes: finance staff who aren't admins couldn't save anything in
-- the finance queue — the table only had an admin update policy.
--
-- Applied directly to the live Supabase project (additive only — no
-- existing constraints, policies or rows were changed).
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

create index if not exists idx_zakat_applications_program on zakat_applications (program, status);

alter table zakat_applications add constraint zakat_applications_grant_needs_source
  check (grant_id is null or funding_source = 'grant');

-- Finance staff (is_zakat_finance) can update applications in the queue.
create policy "zakat_applications finance update" on zakat_applications for update
  using ((select is_zakat_finance from employees where auth_user_id = auth.uid()) = true)
  with check ((select is_zakat_finance from employees where auth_user_id = auth.uid()) = true);
