-- ============================================================
-- DRS (Disaster Relief Services) module
-- Event-driven: each row is one activity/response, not a routine count.
-- Reuses b2s_offices / b2s_regions for the office directory.
-- Already applied directly to the live Supabase project.
-- ============================================================

create table drs_activity_types (
  type_name text primary key,
  id_prefix text not null,
  event_sn int not null
);

insert into drs_activity_types (type_name, id_prefix, event_sn) values
  ('URBAN FIRE', 'DDRFR', 1),
  ('FLOODING', 'DDRFD', 2),
  ('HURRICANE', 'DDRHR', 3),
  ('TORNADO', 'DDRTR', 4),
  ('WINTER STORM', 'DDRSS', 5),
  ('WIND STORM', 'DDRWS', 6),
  ('PUBLIC UTILITY CRISIS', 'DDRUT', 7),
  ('COMMUNITY PROJECT', 'CPJRR', 8),
  ('PREPAREDNESS TRAINING', 'TWSDP', 9),
  ('MARC', 'DDRMC', 9),
  ('WILDFIRE', 'DDRWF', 10),
  ('OUTREACH EVENT', 'ORFRE', 11),
  ('HEALTH FAIR', 'DRSHF', 12),
  ('GRANT FUNDED ACTIVITY', 'CFPRR', 99);

create table drs_submissions (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references b2s_offices(id),
  employee_id uuid references employees(id),
  year int not null,
  month int not null check (month between 1 and 12),

  activity_occurred boolean not null default false,
  activity_type text references drs_activity_types(type_name),
  city_or_town text,
  activity_name text,
  response_location text,
  chapter text,
  state text,

  event_id text,
  response_no int,

  activity_began_on date,
  demobilized_on date,

  individuals_served int default 0,
  households_served int default 0,
  volunteers_engaged int default 0,
  volunteer_hours numeric(10,2) default 0,
  staff_engaged int default 0,
  staff_hours numeric(10,2) default 0,

  in_kind_value numeric(10,2) default 0,
  receipts_value numeric(10,2) default 0,
  value_of_services numeric(10,2) default 0,

  status text not null default 'submitted' check (status in ('submitted', 'reviewed', 'flagged')),
  reviewed_by uuid references employees(id),
  reviewed_at timestamptz,

  created_at timestamptz not null default now()
);

create index idx_drs_submissions_office_month on drs_submissions (office_id, year, month);

alter table drs_submissions enable row level security;
alter table drs_activity_types enable row level security;

create policy "authenticated staff manage drs_submissions" on drs_submissions
  for all using (auth.role() = 'authenticated');

create policy "authenticated staff read drs_activity_types" on drs_activity_types
  for select using (auth.role() = 'authenticated');

create view drs_pbi_export as
select
  o.region as "REGION",
  o.chapter as "CHAPTER",
  s.state as "STATE",
  o.field_office as "FIELD OFFICE",
  s.response_location as "RESPONSE LOCATION",
  s.event_id as "EVENT ID",
  s.response_no as "RESPONSE NO",
  s.activity_name as "RESPONSE ACTIVITY NAME",
  s.activity_type as "RESPONSE/ACTIVITY TYPE",
  s.year as "YEAR",
  to_char(to_date(s.month::text, 'MM'), 'Month') as "MONTH",
  case
    when s.month between 1 and 3 then 'Q1'
    when s.month between 4 and 6 then 'Q2'
    when s.month between 7 and 9 then 'Q3'
    else 'Q4'
  end as "QUARTER",
  s.individuals_served as "INDIVIDUALS SERVED",
  s.households_served as "HOUSEHOLDS SERVED",
  s.volunteers_engaged as "VOLUNTEERS ENGAGED",
  s.volunteer_hours as "VOLUNTEER HOURS UTILIZED",
  s.value_of_services as "VALUE OF SERVICES PROVIDED",
  s.month as "MSN",
  r.rsn as "RSN",
  t.event_sn as "EVENT-SN",
  s.receipts_value as "CASH RAISED",
  s.in_kind_value as "IN-KIND RAISED",
  (s.receipts_value + s.in_kind_value)::numeric as "TOTAL RAISED"
from drs_submissions s
join b2s_offices o on o.id = s.office_id
join b2s_regions r on r.region = o.region
left join drs_activity_types t on t.type_name = s.activity_type
where s.activity_occurred = true;

grant select on drs_pbi_export to authenticated;

insert into app_registry (slug, display_name, route, sort_order) values
  ('drs', 'D.R.S.', '/drs', 5);
