-- Upgrades the client data model to support full per-household-member
-- intake (SNAP/WIC/CHIP, employment, residency, race/ethnicity, etc. on
-- EVERY household member, not just the primary registrant) and the new
-- state+office+date Client ID format, while leaving all 6,964 existing
-- legacy/Salesforce-linked clients untouched.
--
-- Existing legacy clients keep their ICNA-###### client_number exactly
-- as-is. Only NEW registrations from here forward get the new
-- STATE+OFFICE+YY+MM+SEQ-N format. Both formats coexist in the same
-- client_number column indefinitely -- there's no migration/renumbering
-- of legacy records, since that would break salesforce_contact_id /
-- legacy_client_id linkage and existing ID cards.
--
-- household_members (the old shallow name/dob/relationship-only table)
-- is left in place for legacy data and is simply not used for new
-- registrations going forward -- new registrations give every household
-- member their own full row in `clients` instead, linked by
-- household_key. This is the actual structural change: household
-- members become first-class client records.

-- === New columns on clients ===

alter table clients add column if not exists middle_initial text;
alter table clients add column if not exists apt_unit_no text;
alter table clients add column if not exists country_of_birth text;
alter table clients add column if not exists country_of_citizenship text;
alter table clients add column if not exists gender text;
alter table clients add column if not exists marital_status text;
alter table clients add column if not exists snap boolean;
alter table clients add column if not exists wic boolean;
alter table clients add column if not exists chip boolean;
alter table clients add column if not exists employed boolean;
alter table clients add column if not exists employment_type text; -- 'FT' | 'PT' | 'NA'
alter table clients add column if not exists residency_status text; -- Citizen, Green Card, Asylum, TPS, Student, Visit Visa, Other, Prefer not to answer
alter table clients add column if not exists race_ethnicity text;
alter table clients add column if not exists monthly_income_range text; -- replaces numeric monthly_income for NEW records going forward; old numeric field stays untouched for legacy rows
alter table clients add column if not exists household_vehicle_count integer;
alter table clients add column if not exists household_key text; -- shared across every member of a household, e.g. 'VAALE2607001'
alter table clients add column if not exists main_client_id uuid references clients(id);
alter table clients add column if not exists relationship_to_main_client text;
alter table clients add column if not exists registration_date date; -- the actual intake date, distinct from created_at (row-insert timestamp)

comment on column clients.household_key is 'Groups household members together. Format: STATE(2) + OFFICE(3) + YY + MM + SEQ(3), e.g. VAALE2607001. Null for legacy clients.';
comment on column clients.main_client_id is 'Self-reference to the household''s primary registrant (the -1 member). A client is the main client when main_client_id = id.';

create index if not exists idx_clients_household_key on clients(household_key);
create index if not exists idx_clients_dob on clients(dob);
create index if not exists idx_clients_zip on clients(zip);
create index if not exists idx_clients_city_state on clients(city, state);

-- Backfill: country_of_origin -> country_of_birth for existing rows,
-- per direction to map the old single field onto the new "birth" field
-- specifically (citizenship stays blank for legacy records -- there's
-- no source data to infer it from, a case manager fills it in later).
update clients
set country_of_birth = country_of_origin
where country_of_birth is null and country_of_origin is not null;

-- === Client ID generation ===
--
-- Household sequence counters, one row per office. The 3-digit segment
-- in the ID (e.g. the '001' in VAALE2607001) is a running count of
-- households registered at that office, independent of month -- it does
-- NOT reset monthly. `for update` row locking makes concurrent
-- registrations at the same office safe (two case managers registering
-- households at the same office at the same moment won't collide).
create table if not exists household_id_sequences (
  office_id uuid primary key references b2s_offices(id),
  next_seq integer not null default 1
);

create or replace function generate_household_key(p_office_id uuid, p_registration_date date default current_date)
returns text
language plpgsql
set search_path to 'public'
as $function$
declare
  v_state text;
  v_office_abbr text;
  v_seq integer;
begin
  select state, upper(left(regexp_replace(field_office, '[^A-Za-z]', '', 'g'), 3))
  into v_state, v_office_abbr
  from b2s_offices
  where id = p_office_id;

  if v_state is null then
    raise exception 'No office found for office_id %', p_office_id;
  end if;

  insert into household_id_sequences (office_id, next_seq)
  values (p_office_id, 2)
  on conflict (office_id) do update set next_seq = household_id_sequences.next_seq + 1
  returning next_seq - 1 into v_seq;

  return v_state || v_office_abbr
    || to_char(p_registration_date, 'YY') || to_char(p_registration_date, 'MM')
    || lpad(v_seq::text, 3, '0');
end;
$function$;

comment on function generate_household_key is 'Generates a new household_key (without the -N member suffix) for a given office, e.g. VAALE2607001. Concurrency-safe via the household_id_sequences counter table.';
