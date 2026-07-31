-- ============================================================
-- Regional Director / Program Director roles + real data isolation
-- Already applied directly to the live Supabase project.
-- ============================================================

alter table employees drop constraint employees_role_check;
alter table employees add constraint employees_role_check
  check (role in ('staff', 'regional_director', 'program_director', 'admin'));

alter table employees add column assigned_region text references b2s_regions(region);

create or replace function my_assigned_office()
returns uuid
language sql security definer set search_path = public stable
as $$
  select assigned_office_id from employees where auth_user_id = auth.uid() limit 1;
$$;

create or replace function is_regional_director_for(office_region text)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from employees
    where auth_user_id = auth.uid()
    and role = 'regional_director'
    and assigned_region = office_region
  );
$$;

create or replace function is_program_director_for(program text)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from employees e
    join employee_program_access epa on epa.employee_id = e.id
    where e.auth_user_id = auth.uid()
    and e.role = 'program_director'
    and epa.program_slug = program
  );
$$;

-- B2S
drop policy if exists "authenticated staff manage b2s_submissions" on b2s_submissions;
create policy "b2s admin full access" on b2s_submissions for all using (is_admin());
create policy "b2s staff insert own office" on b2s_submissions for insert with check (office_id = my_assigned_office());
create policy "b2s staff select own office" on b2s_submissions for select using (office_id = my_assigned_office());
create policy "b2s program director select" on b2s_submissions for select using (is_program_director_for('back-to-school'));
create policy "b2s program director update" on b2s_submissions for update using (is_program_director_for('back-to-school'));
create policy "b2s regional director select" on b2s_submissions for select using (
  exists (select 1 from b2s_offices o where o.id = b2s_submissions.office_id and is_regional_director_for(o.region))
);
create policy "b2s regional director update" on b2s_submissions for update using (
  exists (select 1 from b2s_offices o where o.id = b2s_submissions.office_id and is_regional_director_for(o.region))
);

-- FATE
drop policy if exists "authenticated staff manage fate_submissions" on fate_submissions;
create policy "fate admin full access" on fate_submissions for all using (is_admin());
create policy "fate staff insert own office" on fate_submissions for insert with check (office_id = my_assigned_office());
create policy "fate staff select own office" on fate_submissions for select using (office_id = my_assigned_office());
create policy "fate program director select" on fate_submissions for select using (is_program_director_for('fate'));
create policy "fate program director update" on fate_submissions for update using (is_program_director_for('fate'));
create policy "fate regional director select" on fate_submissions for select using (
  exists (select 1 from b2s_offices o where o.id = fate_submissions.office_id and is_regional_director_for(o.region))
);
create policy "fate regional director update" on fate_submissions for update using (
  exists (select 1 from b2s_offices o where o.id = fate_submissions.office_id and is_regional_director_for(o.region))
);

-- DRS
drop policy if exists "authenticated staff manage drs_submissions" on drs_submissions;
create policy "drs admin full access" on drs_submissions for all using (is_admin());
create policy "drs staff insert own office" on drs_submissions for insert with check (office_id = my_assigned_office());
create policy "drs staff select own office" on drs_submissions for select using (office_id = my_assigned_office());
create policy "drs program director select" on drs_submissions for select using (is_program_director_for('drs'));
create policy "drs program director update" on drs_submissions for update using (is_program_director_for('drs'));
create policy "drs regional director select" on drs_submissions for select using (
  exists (select 1 from b2s_offices o where o.id = drs_submissions.office_id and is_regional_director_for(o.region))
);
create policy "drs regional director update" on drs_submissions for update using (
  exists (select 1 from b2s_offices o where o.id = drs_submissions.office_id and is_regional_director_for(o.region))
);
