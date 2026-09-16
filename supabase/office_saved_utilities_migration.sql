-- Office Utility Bills: each field office saves its recurring
-- utilities ONCE (vendor, service address, POC, etc - the same
-- static fields a one-off Utility Payment finance ticket already
-- asks for, see lib/financeTicketForms.ts UTILITY_FIELDS) and then
-- pays any subset of them each billing period with one click,
-- entering only that period's amount. Editing a saved utility here
-- never touches past finance_tickets/finance_utilities rows - those
-- are independent historical records created at payment time.

create table office_saved_utilities (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references b2s_offices(id),
  vendor_name text not null,
  utility_type text check (utility_type in ('electricity', 'water_sewer', 'gas_heating', 'internet_phone', 'security_alarm', 'trash_recycling', 'other')),
  other_utility_name text,
  billing_programs text[],
  grant_eligible boolean not null default false,
  grant_id uuid references grants(id),
  poc_is_icna_member boolean not null default false,
  poc_user_id uuid references employees(id),
  poc_name text,
  service_location_name text,
  service_address_line1 text,
  service_city text,
  service_zip_code text,
  pin_number text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index office_saved_utilities_office_id_idx on office_saved_utilities(office_id);

alter table office_saved_utilities enable row level security;

-- Same shape as office_hours/office_info_notes: an office's own
-- assigned staff (my_assigned_office()) or an admin can manage it.
create policy "office_saved_utilities own office select" on office_saved_utilities
  for select using (office_id = my_assigned_office() or is_admin());
create policy "office_saved_utilities own office insert" on office_saved_utilities
  for insert with check (office_id = my_assigned_office() or is_admin());
create policy "office_saved_utilities own office update" on office_saved_utilities
  for update using (office_id = my_assigned_office() or is_admin());
create policy "office_saved_utilities own office delete" on office_saved_utilities
  for delete using (office_id = my_assigned_office() or is_admin());
