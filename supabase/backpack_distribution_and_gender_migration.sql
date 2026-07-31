-- ============================================================
-- Backpack distribution moves to the client profile + gender capture
-- Already applied directly to the live Supabase project.
-- ============================================================

-- Link backpack distribution events to a specific client
alter table b2s_submissions add column client_id uuid references clients(id);
create index idx_b2s_submissions_client on b2s_submissions (client_id);

-- Gender on household members — captured at time of backpack
-- distribution (persisted back onto the record once known)
alter table household_members add column gender text check (gender in ('male', 'female'));

-- New lightweight table for non-backpack B2S program activity,
-- reported at the office/month level (not tied to a client)
create table b2s_program_activities (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references b2s_offices(id),
  employee_id uuid references employees(id),
  year int not null,
  month int not null check (month between 1 and 12),

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

  cash_donations numeric(10,2) default 0,
  in_kind_donation_value numeric(10,2) default 0,

  partner_scholarships_count int default 0,
  partner_scholarship_funding numeric(10,2) default 0,
  partner_scholarship_funding_disbursed numeric(10,2) default 0,

  status text not null default 'submitted' check (status in ('submitted', 'reviewed', 'flagged')),
  reviewed_by uuid references employees(id),
  reviewed_at timestamptz,
  review_note text,

  created_at timestamptz not null default now()
);

create index idx_b2s_activities_office_month on b2s_program_activities (office_id, year, month);

alter table b2s_program_activities enable row level security;

create policy "b2s activities admin full access" on b2s_program_activities
  for all using (is_admin());

create policy "b2s activities staff insert own office" on b2s_program_activities
  for insert with check (office_id = my_assigned_office());

create policy "b2s activities staff select own office" on b2s_program_activities
  for select using (office_id = my_assigned_office());

create policy "b2s activities program director select" on b2s_program_activities
  for select using (is_program_director_for('back-to-school'));

create policy "b2s activities program director update" on b2s_program_activities
  for update using (is_program_director_for('back-to-school'));

create policy "b2s activities regional director select" on b2s_program_activities
  for select using (
    exists (select 1 from b2s_offices o where o.id = b2s_program_activities.office_id and is_regional_director_for(o.region))
  );

create policy "b2s activities regional director update" on b2s_program_activities
  for update using (
    exists (select 1 from b2s_offices o where o.id = b2s_program_activities.office_id and is_regional_director_for(o.region))
  );

-- Rebuild the PBI export to combine client-linked backpack
-- distribution (b2s_submissions) with office-level program
-- activity (b2s_program_activities), grouped by office+month
drop view if exists b2s_pbi_export;

create view b2s_pbi_export as
with backpacks as (
  select
    s.year, s.month, s.office_id,
    count(*) as distribution_events,
    sum(s.elementary_backpacks + s.middle_backpacks + s.high_backpacks) as backpacks_distributed,
    sum(s.households_served) as households_served,
    sum(s.elementary_boys) as elementary_boys,
    sum(s.elementary_girls) as elementary_girls,
    sum(s.middle_boys) as middle_boys,
    sum(s.middle_girls) as middle_girls,
    sum(s.high_boys) as high_boys,
    sum(s.high_girls) as high_girls,
    sum(s.elementary_backpacks) as total_elementary,
    sum(s.middle_backpacks) as total_middle,
    sum(s.high_backpacks) as total_high,
    sum(s.race_afghan) as race_afghan,
    sum(s.race_asian) as race_asian,
    sum(s.race_arab_middle_eastern) as race_arab_middle_eastern,
    sum(s.race_native_american_pacific_islander) as race_native_american_pacific_islander,
    sum(s.race_black_african_american) as race_black_african_american,
    sum(s.race_hispanic_latino) as race_hispanic_latino,
    sum(s.race_white_caucasian) as race_white_caucasian,
    sum(s.race_ukrainian) as race_ukrainian,
    sum(s.race_other) as race_other,
    sum(s.value_of_backpacks) as value_of_backpacks,
    sum(s.in_kind_donation_value) as bp_in_kind_donation_value,
    sum(s.cash_donations) as bp_cash_donations,
    sum(s.income_0_19999) as income_0_19999,
    sum(s.income_20000_39999) as income_20000_39999,
    sum(s.income_40000_plus) as income_40000_plus
  from b2s_submissions s
  group by s.year, s.month, s.office_id
),
activities as (
  select
    a.year, a.month, a.office_id,
    sum(a.sfa_individuals_awarded) as sfa_applications_approved,
    sum(a.sfa_amount_disbursed) as sfa_amount_disbursed,
    sum(a.empower_grants_approved) as empower_grants_approved,
    sum(a.empower_amount_disbursed) as eg_amount_disbursed,
    count(*) filter (where a.webinar_conducted) as webinar_sessions,
    string_agg(distinct a.webinar_topic, '; ') filter (where a.webinar_topic is not null) as webinar_session_detail,
    sum(a.webinar_attendees) as webinar_attendees,
    sum(a.partner_scholarships_count) as no_of_partner_scholarships,
    sum(a.partner_scholarship_funding) as partner_scholarship_funding,
    sum(a.partner_scholarship_funding_disbursed) as partner_scholarship_funding_disbursed,
    count(*) filter (where a.elected_officials_attended) as office_holders_participated,
    count(distinct a.employee_id) as collaborators,
    sum(a.ambassador_interested_count) as ambassadors,
    count(*) filter (where a.media_visibility_type is not null) as media_coverage_count,
    sum(a.cash_donations) as act_cash_donations,
    sum(a.in_kind_donation_value) as act_in_kind_donation_value
  from b2s_program_activities a
  group by a.year, a.month, a.office_id
),
combined as (
  select year, month, office_id from backpacks
  union
  select year, month, office_id from activities
)
select
  c.year as "YEAR",
  to_char(to_date(c.month::text, 'MM'), 'Month') as "MONTH",
  c.month as "MSN",
  r.rsn as "RSN",
  o.region as "REGION",
  o.state as "STATE",
  o.chapter as "CHAPTER",
  o.field_office as "FIELD OFFICE",
  coalesce(b.distribution_events, 0) as "DISTRIBUTION EVENTS",
  coalesce(b.backpacks_distributed, 0) as "BACKPACKS DISTRIBUTED",
  coalesce(b.households_served, 0) as "Households served",
  coalesce(b.elementary_boys, 0) as "Elementary Boys",
  coalesce(b.elementary_girls, 0) as "Elementary Girls",
  coalesce(b.middle_boys, 0) as "Middle School Boys",
  coalesce(b.middle_girls, 0) as "Middle School Girls",
  coalesce(b.high_boys, 0) as "High School Boys",
  coalesce(b.high_girls, 0) as "High School Girls",
  coalesce(b.total_elementary, 0) as "TOTAL ELEMENTARY",
  coalesce(b.total_middle, 0) as "TOTAL MIDDLE SCHOOL",
  coalesce(b.total_high, 0) as "TOTAL HIGH SCHOOL",
  coalesce(b.elementary_boys + b.middle_boys + b.high_boys, 0) as "TOTAL BOYS",
  coalesce(b.elementary_girls + b.middle_girls + b.high_girls, 0) as "TOTAL GIRLS",
  coalesce(b.total_elementary + b.total_middle + b.total_high, 0) as "TOTAL STUDENTS",
  coalesce(b.race_afghan, 0) as "Afghan",
  coalesce(b.race_asian, 0) as "Asians",
  coalesce(b.race_arab_middle_eastern, 0) as "Arab / Middle Eastern",
  coalesce(b.race_native_american_pacific_islander, 0) as "Native American or Pacific Islander",
  coalesce(b.race_black_african_american, 0) as "Black or African American",
  coalesce(b.race_hispanic_latino, 0) as "Hispanic/Latino",
  coalesce(b.race_white_caucasian, 0) as "White/Caucasian",
  coalesce(b.race_ukrainian, 0) as "Ukrainian",
  coalesce(b.race_other, 0) as "OTHER",
  coalesce(b.value_of_backpacks, 0) as "VALUE OF BACKPACKS",
  coalesce(b.value_of_backpacks, 0) + coalesce(b.bp_in_kind_donation_value, 0) + coalesce(b.bp_cash_donations, 0)
    + coalesce(act.act_in_kind_donation_value, 0) + coalesce(act.act_cash_donations, 0) as "TOTAL VALUE OF SERVICES",
  coalesce(b.bp_in_kind_donation_value, 0) + coalesce(act.act_in_kind_donation_value, 0) as "IN-KIND DONATION VALUE",
  coalesce(b.bp_cash_donations, 0) + coalesce(act.act_cash_donations, 0) as "CASH DONATIONS",
  coalesce(b.bp_in_kind_donation_value, 0) + coalesce(act.act_in_kind_donation_value, 0)
    + coalesce(b.bp_cash_donations, 0) + coalesce(act.act_cash_donations, 0) as "TOTAL DONATIONS RAISED",
  coalesce(act.sfa_applications_approved, 0) as "SFA APPLICATIONS APPROVED",
  coalesce(act.sfa_amount_disbursed, 0) as "SFA AMOUNT DISBURSED",
  coalesce(act.empower_grants_approved, 0) as "EMPOWER GRANTS APPROVED",
  coalesce(act.eg_amount_disbursed, 0) as "EG AMOUNT DISBURSED",
  coalesce(act.webinar_sessions, 0) as "WEBINAR/SESSIONS",
  act.webinar_session_detail as "WEBINAR SESSION DETAIL",
  coalesce(act.webinar_attendees, 0) as "WEBINAR/SESSION ATTENDEES/VIEWS",
  coalesce(act.no_of_partner_scholarships, 0) as "NO. OF PARTNER SCHOLARSHIPS",
  coalesce(act.partner_scholarship_funding, 0) as "PARTNER SCHOLARSHIP FUNDING",
  coalesce(act.partner_scholarship_funding_disbursed, 0) as "AMOUNT OF PARTNER SCHOLARSHIP FUNDING DISBURSED",
  0 as "DISTRIBUTION LOCATIONS",
  coalesce(act.office_holders_participated, 0) as "OFFICE HOLDERS PARTICIPATED",
  coalesce(act.collaborators, 0) as "COLLABORATORS",
  0 as "SPONSORS",
  coalesce(act.ambassadors, 0) as "AMBASSADORS",
  coalesce(act.media_coverage_count, 0) as "MEDIA COVERAGE COUNT",
  coalesce(b.income_0_19999, 0) as "INCOME $0-$19,999",
  coalesce(b.income_20000_39999, 0) as "INCOME $20,000-$39,999",
  coalesce(b.income_40000_plus, 0) as "INCOME $40,000+"
from combined c
join b2s_offices o on o.id = c.office_id
join b2s_regions r on r.region = o.region
left join backpacks b on b.year = c.year and b.month = c.month and b.office_id = c.office_id
left join activities act on act.year = c.year and act.month = c.month and act.office_id = c.office_id;

grant select on b2s_pbi_export to authenticated;
