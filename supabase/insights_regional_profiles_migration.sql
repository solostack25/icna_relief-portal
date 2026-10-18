-- Regional Profiles on Insights (applied directly via Supabase MCP).

create table if not exists insights_goals (
  year int not null,
  scope text not null check (scope in ('org', 'region', 'state')),
  scope_key text not null default '',
  metric text not null default 'value_of_services',
  amount numeric not null check (amount >= 0),
  updated_by uuid references employees(id),
  updated_at timestamptz not null default now(),
  primary key (year, scope, scope_key, metric)
);
alter table insights_goals enable row level security;
create policy insights_goals_admin on insights_goals for all using (is_admin()) with check (is_admin());

create table if not exists insights_state_reference (
  state text primary key,
  muslim_population integer check (muslim_population >= 0),
  mosques integer check (mosques >= 0),
  updated_by uuid references employees(id),
  updated_at timestamptz not null default now()
);
alter table insights_state_reference enable row level security;
create policy insights_state_reference_admin on insights_state_reference for all using (is_admin()) with check (is_admin());

-- Regional Profiles: facts by office × program × metric, plus volunteer
-- headcounts (distinct people can't be summed, so they're counted per level).
create or replace function insights_profile(p_from date, p_to date, p_region text default null)
returns jsonb language sql stable set search_path = public as $$
  with f as (
    select f.office_id, f.program, f.metric, sum(f.value) v
    from insights_facts f left join b2s_offices o on o.id = f.office_id
    where f.fact_date between p_from and p_to and (p_region is null or o.region = p_region)
    group by 1, 2, 3
  ),
  vh as (
    select h.volunteer_id, h.office_id, o.region, o.state
    from volunteer_hours h left join b2s_offices o on o.id = h.office_id
    where h.checked_out_at is not null and h.service_date between p_from and p_to and (p_region is null or o.region = p_region)
  ),
  reported as (
    select s.office_id, sum(s.n) n from (
      select office_id, coalesce(volunteers_engaged, 0) n from drs_submissions
       where coalesce(status, '') <> 'rejected' and make_date(year, month, 1) between date_trunc('month', p_from)::date and p_to
      union all
      select office_id, coalesce(volunteers, 0) from fate_submissions
       where coalesce(status, '') <> 'rejected' and make_date(year, month, 1) between date_trunc('month', p_from)::date and p_to
    ) s left join b2s_offices o on o.id = s.office_id
    where p_region is null or o.region = p_region
    group by 1
  )
  select jsonb_build_object(
    'facts', coalesce((select jsonb_agg(jsonb_build_object('o', office_id, 'p', program, 'm', metric, 'v', v)) from f), '[]'::jsonb),
    'volunteers', jsonb_build_object(
      'by_office', coalesce((select jsonb_object_agg(coalesce(office_id::text, ''), n) from (select office_id, count(distinct volunteer_id) n from vh group by 1) x), '{}'::jsonb),
      'by_state', coalesce((select jsonb_object_agg(coalesce(state, ''), n) from (select state, count(distinct volunteer_id) n from vh group by 1) x), '{}'::jsonb),
      'by_region', coalesce((select jsonb_object_agg(coalesce(region, ''), n) from (select region, count(distinct volunteer_id) n from vh group by 1) x), '{}'::jsonb),
      'total', (select count(distinct volunteer_id) from vh),
      'reported_by_office', coalesce((select jsonb_object_agg(coalesce(office_id::text, ''), n) from reported), '{}'::jsonb)
    )
  )
$$;
revoke all on function insights_profile(date, date, text) from public, anon, authenticated;
grant execute on function insights_profile(date, date, text) to service_role;
