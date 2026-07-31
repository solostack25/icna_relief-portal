-- ============================================================
-- FATE (Foster Care & Adoption) module
-- Reuses b2s_offices / b2s_regions for the office directory.
-- Already applied directly to the live Supabase project.
-- ============================================================

create table fate_submissions (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references b2s_offices(id),
  employee_id uuid references employees(id),
  year int not null,
  month int not null check (month between 1 and 12),

  state text,
  city text,
  liaison_name text,

  new_inquiries int default 0,

  families_served_new int default 0,
  families_served_ongoing int default 0,
  children_served_new int default 0,
  children_served_ongoing int default 0,
  people_served_new int default 0,
  people_served_ongoing int default 0,

  consultation_hours numeric(10,2) default 0,
  consultation_value numeric(10,2) default 0,
  referrals_count int default 0,
  referrals_value numeric(10,2) default 0,
  outgoing_donation_value numeric(10,2) default 0,
  other_assistance_type text,
  other_assistance_value numeric(10,2) default 0,

  volunteers int default 0,
  volunteer_hours numeric(10,2) default 0,
  professional_volunteers int default 0,
  professional_volunteer_hours numeric(10,2) default 0,
  professional_volunteering_value numeric(10,2) default 0,

  workshops_events int default 0,
  workshop_event_cost numeric(10,2) default 0,
  workshop_attendees int default 0,
  workshop_attendee_value numeric(10,2) default 0,

  licensed_muslim_foster_families int default 0,
  certified_casas int default 0,
  outreach_collaboration int default 0,

  cash_donation numeric(10,2) default 0,
  in_kind_donation numeric(10,2) default 0,

  status text not null default 'submitted' check (status in ('submitted', 'reviewed', 'flagged')),
  reviewed_by uuid references employees(id),
  reviewed_at timestamptz,

  created_at timestamptz not null default now()
);

create index idx_fate_submissions_office_month on fate_submissions (office_id, year, month);

alter table fate_submissions enable row level security;

create policy "authenticated staff manage fate_submissions" on fate_submissions
  for all using (auth.role() = 'authenticated');

create view fate_pbi_export as
select
  s.year as "YEAR",
  to_char(to_date(s.month::text, 'MM'), 'Month') as "MONTH",
  s.month as "MSN",
  o.region as "REGION",
  r.rsn as "RSN",
  o.field_office as "FIELD OFFICE",
  s.state as "STATES",
  s.city as "CITY",
  s.liaison_name as "LIAISON NAME",
  sum(s.new_inquiries) as "New Inquiries",
  sum(s.families_served_new) as "Families Served (New)",
  sum(s.families_served_ongoing) as "Families Served (Ongoing)",
  sum(s.children_served_new) as "Children Served (New)",
  sum(s.children_served_ongoing) as "Children Served (Ongoing)",
  sum(s.people_served_new) as "People Served (New)",
  sum(s.people_served_ongoing) as "People Served (Ongoing)",
  sum(s.consultation_hours) as "Consultation/Case Management (Hours)",
  sum(s.consultation_value) as "Consultation/Case Management (Value)",
  sum(s.referrals_count) as "Referals (Count)",
  sum(s.referrals_value) as "Referals (Value)",
  sum(s.outgoing_donation_value) as "Outgoing Donation (Value)",
  string_agg(distinct s.other_assistance_type, '; ') filter (where s.other_assistance_type is not null) as "Other Assistance (Legal)",
  sum(s.other_assistance_value) as "Other Assistance (Value)",
  sum(s.professional_volunteers) as "Professional Volunteers",
  sum(s.professional_volunteer_hours) as "Professional Volunteer hours",
  sum(s.professional_volunteering_value) as "Professional Volunteering Value",
  sum(s.workshops_events) as "Workshops/Events",
  sum(s.workshop_event_cost) as "Event/ Workshop Cost",
  sum(s.workshop_attendees) as "Workshop/Event attendees",
  sum(s.workshop_attendee_value) as "Workshop/Event Attendee Value",
  max(s.licensed_muslim_foster_families) as "Licensed Muslim Foster Families",
  max(s.certified_casas) as "Certified CASAs",
  sum(s.outreach_collaboration) as "Outreach/Collaboration",
  sum(s.people_served_new + s.people_served_ongoing + s.workshop_attendees)::numeric as "TOTAL INDIVIDUALS SERVED",
  sum(s.consultation_value + s.referrals_value + s.outgoing_donation_value + coalesce(s.other_assistance_value, 0) + s.professional_volunteering_value + s.workshop_event_cost + s.workshop_attendee_value)::numeric as "TOTAL VALUE OF SERVICES",
  sum(s.cash_donation) as "Cash Donation",
  sum(s.in_kind_donation) as "In-Kind Donation",
  sum(s.cash_donation + s.in_kind_donation)::numeric as "Total Donation"
from fate_submissions s
join b2s_offices o on o.id = s.office_id
join b2s_regions r on r.region = o.region
group by s.year, s.month, o.region, r.rsn, o.field_office, s.state, s.city, s.liaison_name;

grant select on fate_pbi_export to authenticated;

-- Register the app in the launcher
insert into app_registry (slug, display_name, route, sort_order) values
  ('fate', 'F.A.T.E.', '/fate', 4);
