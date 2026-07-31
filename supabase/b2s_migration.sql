-- ============================================================
-- Back2School module
-- Office directory + monthly activity submissions + PBI export view
-- Already applied directly to the live Supabase project.
-- ============================================================

create table b2s_regions (
  region text primary key,
  rsn int not null unique
);

insert into b2s_regions (region, rsn) values
  ('DMV', 1),
  ('MIDWEST 1', 2),
  ('MIDWEST 2', 3),
  ('NORTHEAST', 4),
  ('SOUTH CENTRAL', 5),
  ('SOUTHEAST', 6),
  ('WEST', 7),
  ('NATIONAL', 8);

create table b2s_offices (
  id uuid primary key default gen_random_uuid(),
  region text not null references b2s_regions(region),
  state text,
  chapter text,
  field_office text not null,
  is_active boolean not null default true
);

insert into b2s_offices (region, field_office) values
  ('DMV', 'District of Columbia'),
  ('DMV', 'Alexandria Office'),
  ('DMV', 'Baltimore Office'),
  ('DMV', 'Richmond Office'),
  ('DMV', 'West Virginia Statewide'),
  ('MIDWEST 1', 'Chicago Office'),
  ('MIDWEST 1', 'Detroit Office'),
  ('MIDWEST 2', 'Iowa Statewide'),
  ('MIDWEST 2', 'Indiana Statewide'),
  ('MIDWEST 2', 'Kentucky Statewide'),
  ('MIDWEST 2', 'Minneapolis Office'),
  ('MIDWEST 2', 'Nebraska Statewide'),
  ('MIDWEST 2', 'North Dakota Statewide'),
  ('MIDWEST 2', 'Ohio Statewide'),
  ('MIDWEST 2', 'South Dakota Statewide'),
  ('MIDWEST 2', 'St. Louis Office'),
  ('MIDWEST 2', 'Wisconsin Statewide'),
  ('NORTHEAST', 'Connecticut Statewide'),
  ('NORTHEAST', 'Boston Office'),
  ('NORTHEAST', 'Delaware Statewide'),
  ('NORTHEAST', 'Maine Statewide'),
  ('NORTHEAST', 'New Hampshire Statewide'),
  ('NORTHEAST', 'New Jersey Office'),
  ('NORTHEAST', 'New York Office'),
  ('NORTHEAST', 'Philadelphia Office'),
  ('NORTHEAST', 'Rhode Island Statewide'),
  ('NORTHEAST', 'Vermont Statewide'),
  ('SOUTH CENTRAL', 'Arkansas Statewide'),
  ('SOUTH CENTRAL', 'Austin Office'),
  ('SOUTH CENTRAL', 'Dallas Office'),
  ('SOUTH CENTRAL', 'Kansas City Office'),
  ('SOUTH CENTRAL', 'New Mexico Statewide'),
  ('SOUTH CENTRAL', 'Oklahoma City Office'),
  ('SOUTHEAST', 'Alabama - Statewide'),
  ('SOUTHEAST', 'Atlanta Office'),
  ('SOUTHEAST', 'Charleston Office'),
  ('SOUTHEAST', 'Memphis Office'),
  ('SOUTHEAST', 'Mississippi Statewide'),
  ('SOUTHEAST', 'New Orleans Office'),
  ('SOUTHEAST', 'North Carolina Office'),
  ('SOUTHEAST', 'Orlando Office'),
  ('SOUTHEAST', 'South Florida Office'),
  ('SOUTHEAST', 'Tampa Office'),
  ('WEST', 'Alaska Statewide'),
  ('WEST', 'Colorado Office'),
  ('WEST', 'Hawaii Statewide'),
  ('WEST', 'Idaho Statewide'),
  ('WEST', 'Montana Statewide'),
  ('WEST', 'Nevada Statewide'),
  ('WEST', 'Northern California'),
  ('WEST', 'Oregon Statewide'),
  ('WEST', 'Phoenix Office'),
  ('WEST', 'Seattle Office'),
  ('WEST', 'Southern California'),
  ('WEST', 'Utah Statewide'),
  ('WEST', 'Wyoming Statewide'),
  ('NATIONAL', 'Unassigned');

create table b2s_submissions (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references b2s_offices(id),
  employee_id uuid references employees(id),
  year int not null,
  month int not null check (month between 1 and 12),

  distribution_city text,
  distribution_zip text,
  distribution_type text,
  event_location_name text,
  event_street_address text,
  is_mega_distribution_day boolean,

  elementary_backpacks int default 0,
  middle_backpacks int default 0,
  high_backpacks int default 0,
  households_served int default 0,
  elementary_boys int default 0,
  elementary_girls int default 0,
  middle_boys int default 0,
  middle_girls int default 0,
  high_boys int default 0,
  high_girls int default 0,

  income_0_19999 int default 0,
  income_20000_39999 int default 0,
  income_40000_plus int default 0,
  income_unknown int default 0,

  race_afghan int default 0,
  race_asian int default 0,
  race_arab_middle_eastern int default 0,
  race_native_american_pacific_islander int default 0,
  race_black_african_american int default 0,
  race_hispanic_latino int default 0,
  race_white_caucasian int default 0,
  race_ukrainian int default 0,
  race_other int default 0,
  race_unknown int default 0,

  workshop_conducted boolean default false,
  workshop_topic text,
  workshop_attendees int default 0,
  workshop_demographics_collected boolean,

  webinar_conducted boolean default false,
  webinar_topic text,
  webinar_attendees int default 0,
  webinar_hosted_by text,
  webinar_demographics_collected boolean,

  invited_elected_officials boolean,
  elected_officials_attended boolean,
  elected_official_name_title text,
  elected_official_visit_purpose text,

  sfa_activity_type text,
  sfa_individuals_awarded int default 0,
  sfa_amount_disbursed numeric(10,2) default 0,

  ambassador_recruitment_conducted boolean,
  ambassador_interested_count int default 0,
  ambassador_registered_volunteer_hub boolean,

  media_visibility_type text,
  media_shared_where text,
  media_links text,

  empower_grants_approved int default 0,
  empower_amount_disbursed numeric(10,2) default 0,

  in_kind_donation_value numeric(10,2) default 0,
  cash_donations numeric(10,2) default 0,
  value_of_backpacks numeric(10,2) default 0,

  partner_scholarships_count int default 0,
  partner_scholarship_funding numeric(10,2) default 0,
  partner_scholarship_funding_disbursed numeric(10,2) default 0,

  status text not null default 'submitted' check (status in ('submitted', 'reviewed', 'flagged')),
  reviewed_by uuid references employees(id),
  reviewed_at timestamptz,

  created_at timestamptz not null default now()
);

create index idx_b2s_submissions_office_month on b2s_submissions (office_id, year, month);

alter table b2s_submissions enable row level security;

create policy "authenticated staff manage b2s_submissions" on b2s_submissions
  for all using (auth.role() = 'authenticated');

alter table b2s_offices enable row level security;
alter table b2s_regions enable row level security;

create policy "authenticated staff read b2s_offices" on b2s_offices
  for select using (auth.role() = 'authenticated');

create policy "authenticated staff read b2s_regions" on b2s_regions
  for select using (auth.role() = 'authenticated');

-- PBI export view: sums submissions per office+month into the flat,
-- computed-totals row shape the existing PBI file expects.
create view b2s_pbi_export as
select
  s.year as "YEAR",
  to_char(to_date(s.month::text, 'MM'), 'Month') as "MONTH",
  s.month as "MSN",
  r.rsn as "RSN",
  o.region as "REGION",
  o.state as "STATE",
  o.chapter as "CHAPTER",
  o.field_office as "FIELD OFFICE",
  count(*)::numeric as "DISTRIBUTION EVENTS",
  sum(s.elementary_backpacks + s.middle_backpacks + s.high_backpacks)::numeric as "BACKPACKS DISTRIBUTED",
  sum(s.households_served) as "Households served",
  sum(s.elementary_boys) as "Elementary Boys",
  sum(s.elementary_girls) as "Elementary Girls",
  sum(s.middle_boys) as "Middle School Boys",
  sum(s.middle_girls) as "Middle School Girls",
  sum(s.high_boys) as "High School Boys",
  sum(s.high_girls) as "High School Girls",
  sum(s.elementary_boys + s.elementary_girls)::numeric as "TOTAL ELEMENTARY",
  sum(s.middle_boys + s.middle_girls)::numeric as "TOTAL MIDDLE SCHOOL",
  sum(s.high_boys + s.high_girls)::numeric as "TOTAL HIGH SCHOOL",
  sum(s.elementary_boys + s.middle_boys + s.high_boys)::numeric as "TOTAL BOYS",
  sum(s.elementary_girls + s.middle_girls + s.high_girls)::numeric as "TOTAL GIRLS",
  sum(s.elementary_boys + s.elementary_girls + s.middle_boys + s.middle_girls + s.high_boys + s.high_girls)::numeric as "TOTAL STUDENTS",
  sum(s.race_afghan) as "Afghan",
  sum(s.race_asian) as "Asians",
  sum(s.race_arab_middle_eastern) as "Arab / Middle Eastern",
  sum(s.race_native_american_pacific_islander) as "Native American or Pacific Islander",
  sum(s.race_black_african_american) as "Black or African American",
  sum(s.race_hispanic_latino) as "Hispanic/Latino",
  sum(s.race_white_caucasian) as "White/Caucasian",
  sum(s.race_ukrainian) as "Ukrainian",
  sum(s.race_other) as "OTHER",
  sum(s.value_of_backpacks)::numeric as "VALUE OF BACKPACKS",
  sum(s.value_of_backpacks + s.in_kind_donation_value + s.cash_donations)::numeric as "TOTAL VALUE OF SERVICES",
  sum(s.in_kind_donation_value) as "IN-KIND DONATION VALUE",
  sum(s.cash_donations) as "CASH DONATIONS",
  sum(s.in_kind_donation_value + s.cash_donations)::numeric as "TOTAL DONATIONS RAISED",
  sum(s.sfa_individuals_awarded) as "SFA APPLICATIONS APPROVED",
  sum(s.sfa_amount_disbursed) as "SFA AMOUNT DISBURSED",
  sum(s.empower_grants_approved) as "EMPOWER GRANTS APPROVED",
  sum(s.empower_amount_disbursed) as "EG AMOUNT DISBURSED",
  count(*) filter (where s.webinar_conducted) as "WEBINAR/SESSIONS",
  string_agg(distinct s.webinar_topic, '; ') filter (where s.webinar_topic is not null) as "WEBINAR SESSION DETAIL",
  sum(s.webinar_attendees) as "WEBINAR/SESSION ATTENDEES/VIEWS",
  sum(s.partner_scholarships_count) as "NO. OF PARTNER SCHOLARSHIPS",
  sum(s.partner_scholarship_funding) as "PARTNER SCHOLARSHIP FUNDING",
  sum(s.partner_scholarship_funding_disbursed) as "AMOUNT OF PARTNER SCHOLARSHIP FUNDING DISBURSED",
  count(distinct s.event_location_name) filter (where s.event_location_name is not null) as "DISTRIBUTION LOCATIONS",
  count(*) filter (where s.elected_officials_attended) as "OFFICE HOLDERS PARTICIPATED",
  count(distinct s.employee_id) as "COLLABORATORS",
  0 as "SPONSORS",
  sum(s.ambassador_interested_count) as "AMBASSADORS",
  count(*) filter (where s.media_visibility_type is not null) as "MEDIA COVERAGE COUNT",
  sum(s.income_0_19999) as "INCOME $0-$19,999",
  sum(s.income_20000_39999) as "INCOME $20,000-$39,999",
  sum(s.income_40000_plus) as "INCOME $40,000+"
from b2s_submissions s
join b2s_offices o on o.id = s.office_id
join b2s_regions r on r.region = o.region
group by s.year, s.month, r.rsn, o.region, o.state, o.chapter, o.field_office;

grant select on b2s_pbi_export to authenticated;
