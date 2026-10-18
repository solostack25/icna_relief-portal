-- Data Quality (applied directly via Supabase MCP).
--
-- The checks the Master Cleaner used to do after the fact, run continuously
-- against live portal data: every record that would have needed cleaning
-- shows up in data_quality_issues until it's fixed or dismissed.

create table if not exists data_quality_dismissals (
  check_key text not null,
  record_id text not null,
  note text,
  dismissed_by uuid references employees(id),
  dismissed_at timestamptz not null default now(),
  primary key (check_key, record_id)
);
alter table data_quality_dismissals enable row level security;
create policy dq_dismissals_admin on data_quality_dismissals for all using (is_admin()) with check (is_admin());

create or replace view data_quality_issues with (security_invoker = true) as
with
digits as (
  select c.*, right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) phone10,
         lower(trim(c.first_name)) fn, lower(trim(c.last_name)) ln
  from clients c
),
dupkeys as (
  select id, 'Same name and date of birth' why, 'n|' || fn || '|' || ln || '|' || dob k from digits where dob is not null and fn <> '' and ln <> ''
  union all
  select id, 'Same name and phone', 'p|' || fn || '|' || ln || '|' || phone10 from digits where length(phone10) = 10 and fn <> '' and ln <> ''
),
issues as (
  -- Clients with no office: they don't count toward any office's numbers
  select 'clients_no_office'::text check_key, c.id::text record_id,
         trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) label,
         coalesce(nullif(trim(concat_ws(', ', c.city, trim(concat_ws(' ', c.state, c.zip)))), ''), 'No address on file') ||
           case when c.legacy_client_id is not null then ' · imported' else '' end detail,
         c.office_id, null::uuid suggested_office_id, coalesce(c.registration_date, c.created_at::date) occurred_on,
         '/clients/' || c.id link, null::text link2
  from clients c where c.office_id is null

  union all
  -- Primary clients with a missing or malformed zip: office matching and
  -- geography reports need it
  select 'clients_bad_zip', c.id::text, trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
         case when c.zip is null or trim(c.zip) = '' then 'No zip' else 'Zip "' || c.zip || '"' end,
         c.office_id, null, coalesce(c.registration_date, c.created_at::date), '/clients/' || c.id, null
  from clients c
  where c.main_client_id is null and (c.zip is null or trim(c.zip) !~ '^\d{5}(-?\d{4})?$')

  union all
  -- Likely duplicate clients
  select distinct on (least(a.id, b.id), greatest(a.id, b.id))
         'duplicate_clients', least(a.id, b.id)::text || '|' || greatest(a.id, b.id)::text,
         trim(coalesce(ca.first_name, '') || ' ' || coalesce(ca.last_name, '')),
         a.why || ' · #' || coalesce(ca.client_number, '—') || ' and #' || coalesce(cb.client_number, '—'),
         ca.office_id, null, greatest(ca.created_at, cb.created_at)::date,
         '/clients/' || least(a.id, b.id), '/clients/' || greatest(a.id, b.id)
  from dupkeys a
  join dupkeys b on a.k = b.k and a.id < b.id
  join clients ca on ca.id = a.id
  join clients cb on cb.id = b.id

  union all
  -- In-kind intake sessions with no office
  select 'inkind_sessions_no_office', s.id::text,
         coalesce(nullif(s.short_description, ''), nullif(s.donor_org_name, ''), 'In-kind donation'),
         'Station: ' || coalesce(s.office, 'unknown') || coalesce(' · ' || s.program, ''),
         s.office_id,
         (select o.id from b2s_offices o where s.office is not null and (o.field_office ilike s.office || ' %' or o.field_office ilike s.office) limit 1),
         s.date_received, '/admin/inkind/weekly', null
  from sessions s where s.status = 'completed' and s.office_id is null

  union all
  -- In-kind items recorded at $0
  select 'inkind_items_no_price', d.id::text, coalesce(d.item_name, d.item_code, 'Item'),
         'Qty ' || coalesce(d.qty, 0) || coalesce(' · ' || d.program, '') || coalesce(' · ' || s.office, ''),
         s.office_id, null, s.date_received, '/admin/inkind/weekly', null
  from donations d join sessions s on s.id = d.session_id
  where s.status = 'completed' and coalesce(d.unit_price, 0) = 0

  union all
  -- Program activity with no office
  select 'activity_no_office', 'hp:' || h.id, 'Food distribution',
         coalesce(h.total_lbs, 0) || ' lbs · ' || coalesce(h.individuals_served, 0) || ' people',
         h.office_id, c.office_id, h.distributed_on, case when h.client_id is not null then '/clients/' || h.client_id end, null
  from hp_food_distributions h left join clients c on c.id = h.client_id where h.office_id is null
  union all
  select 'activity_no_office', 'rsce:' || r.id, coalesce(r.service_name, 'Refugee service'),
         'Refugee Services · $' || coalesce(r.value, 0),
         r.office_id, c.office_id, r.delivered_on, case when r.client_id is not null then '/clients/' || r.client_id end, null
  from rsce_services r left join clients c on c.id = r.client_id where r.office_id is null
  union all
  select 'activity_no_office', 'bulk:' || b.id, coalesce(b.name, 'Bulk distribution'),
         coalesce(b.program, '') || ' · ' || coalesce(b.people_served, 0) || ' people',
         b.office_id, null, b.distributed_on, null, null
  from bulk_distributions b where b.office_id is null

  union all
  -- Grants with no office (they only roll up by region)
  select 'grants_no_office', g.id::text, coalesce(g.title, 'Grant'),
         coalesce(g.funder_name, '') || ' · $' || to_char(coalesce(g.amount, 0), 'FM999,999,999') || coalesce(' · ' || g.region, ''),
         null, null, coalesce(g.received_date, make_date(g.fiscal_year, 1, 1)), '/admin/grants', null
  from grants g where g.stream = 'grant' and g.office_id is null

  union all
  -- IRFAS: paid without a check number / awarded without a funding source
  select 'irfas_paid_no_check', z.id::text, coalesce(z.application_number, 'IRFAS application'),
         'Paid ' || coalesce(to_char(z.paid_at, 'Mon DD, YYYY'), '') || ' · $' || coalesce(z.amount_approved, z.amount_requested, 0),
         z.office_id, null, coalesce(z.paid_at, z.decided_at)::date, '/admin/zakat-finance', null
  from zakat_applications z where z.status = 'paid' and coalesce(trim(z.check_number), '') = '' and z.voided_at is null
  union all
  select 'irfas_no_funding', z.id::text, coalesce(z.application_number, 'IRFAS application'),
         initcap(z.status) || ' · $' || coalesce(z.amount_approved, z.amount_requested, 0),
         z.office_id, null, z.decided_at::date, '/admin/zakat-finance', null
  from zakat_applications z where z.status in ('approved', 'paid') and z.funding_source is null and z.grant_id is null and z.voided_at is null

  union all
  -- Salesforce donations that couldn't be matched to an office
  select 'revenue_no_office', r.id::text, coalesce(r.campaign_name, r.donation_type, 'Donation'),
         '$' || r.amount || ' · ' || coalesce(nullif(concat_ws(' ', r.donor_city, r.donor_state, r.donor_zip), ''), 'no address'),
         null, null, r.received_on, '/admin/geography', null
  from revenue_transactions r where r.office_id is null

  union all
  -- Monthly office reports: offices that reported in the 6 months before
  -- last month but haven't submitted last month's
  select 'missing_monthly_reports', x.program || '|' || x.office_id || '|' || to_char(x.due, 'YYYY-MM'),
         o.field_office, x.program || ' report for ' || to_char(x.due, 'FMMonth YYYY') || ' not submitted',
         x.office_id, null, x.due, '/admin/review', null
  from (
    select p.program, p.office_id, (date_trunc('month', now()) - interval '1 month')::date due
    from (
      select 'Back2School' program, office_id, make_date(year, month, 1) m from b2s_submissions where year is not null and month between 1 and 12
      union all select 'Disaster Relief', office_id, make_date(year, month, 1) from drs_submissions where year is not null and month between 1 and 12
      union all select 'FATE', office_id, make_date(year, month, 1) from fate_submissions where year is not null and month between 1 and 12
    ) p
    where p.office_id is not null
    group by 1, 2
    having bool_or(p.m >= (date_trunc('month', now()) - interval '7 months')::date and p.m < (date_trunc('month', now()) - interval '1 month')::date)
       and not bool_or(p.m = (date_trunc('month', now()) - interval '1 month')::date)
  ) x
  join b2s_offices o on o.id = x.office_id
)
select i.* from issues i
where not exists (select 1 from data_quality_dismissals d where d.check_key = i.check_key and d.record_id = i.record_id);

revoke all on data_quality_issues from anon, authenticated;

create or replace function data_quality_summary() returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(check_key, n) from (select check_key, count(*) n from data_quality_issues group by 1) x), '{}'::jsonb),
    'dismissed', coalesce((select jsonb_object_agg(check_key, n) from (select check_key, count(*) n from data_quality_dismissals group by 1) x), '{}'::jsonb)
  )
$$;

-- Fixes run server-side so a few thousand rows update in one call.

-- Clients: office from zip / city / single-office state (never the
-- multi-office state fallback, which would e.g. send Houston to Dallas);
-- household members follow their main client.
create or replace function dq_assign_client_offices() returns jsonb language plpgsql set search_path = public as $$
declare n_zip int; n_members int;
begin
  with r as (
    select c.id, ro.office_id
    from clients c cross join lateral resolve_office(c.state, c.city, c.zip) ro
    where c.office_id is null and ro.method in ('zip', 'city', 'state') and ro.office_id is not null
  )
  update clients c set office_id = r.office_id from r where c.id = r.id;
  get diagnostics n_zip = row_count;

  update clients m set office_id = h.office_id
  from clients h where m.main_client_id = h.id and m.office_id is null and h.office_id is not null;
  get diagnostics n_members = row_count;

  return jsonb_build_object('fixed', n_zip + n_members, 'by_address', n_zip, 'household_members', n_members);
end $$;

create or replace function dq_fix_session_offices() returns jsonb language plpgsql set search_path = public as $$
declare n int;
begin
  update sessions s set office_id = o.id
  from b2s_offices o
  where s.office_id is null and s.office is not null and (o.field_office ilike s.office || ' %' or o.field_office ilike s.office);
  get diagnostics n = row_count;
  return jsonb_build_object('fixed', n);
end $$;

create or replace function dq_fix_activity_offices() returns jsonb language plpgsql set search_path = public as $$
declare a int; b int;
begin
  update hp_food_distributions h set office_id = c.office_id from clients c where h.client_id = c.id and h.office_id is null and c.office_id is not null;
  get diagnostics a = row_count;
  update rsce_services r set office_id = c.office_id from clients c where r.client_id = c.id and r.office_id is null and c.office_id is not null;
  get diagnostics b = row_count;
  return jsonb_build_object('fixed', a + b);
end $$;

revoke all on function data_quality_summary() from public, anon, authenticated;
revoke all on function dq_assign_client_offices() from public, anon, authenticated;
revoke all on function dq_fix_session_offices() from public, anon, authenticated;
revoke all on function dq_fix_activity_offices() from public, anon, authenticated;
grant execute on function data_quality_summary(), dq_assign_client_offices(), dq_fix_session_offices(), dq_fix_activity_offices() to service_role;
