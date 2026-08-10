-- Extends the existing office/region scoping pattern (already proven
-- on fate_submissions, drs_submissions, b2s_submissions -- see
-- regional_program_director_migration.sql) to clients. Reuses the
-- same helper functions (is_admin, my_assigned_office,
-- is_regional_director_for) rather than inventing a new mechanism.
--
-- Note on existing data: ~6,961 legacy-imported clients have
-- office_id = null (they only ever had a free-text state field).
-- Under this policy, non-admin staff won't see a client with a null
-- office_id -- same strict behavior as the FATE/DRS pattern already
-- has. Admins see everything regardless. Backfilling office_id onto
-- existing clients (e.g. by matching state -> office) is a separate
-- follow-up, not attempted here since the mapping isn't unambiguous
-- from the data alone (many offices can share a state).

alter table clients add column if not exists office_id uuid references b2s_offices(id);

-- New clients get their creating employee's own office automatically.
create or replace function create_client_with_intake(
  p_first_name text, p_last_name text, p_dob date, p_phone text, p_email text,
  p_address_line1 text, p_address_line2 text, p_city text, p_state text, p_zip text,
  p_photo_id_number text, p_id_type text, p_monthly_income numeric, p_food_stamps_amount numeric,
  p_dietary_preference text, p_ethnicity text, p_country_of_origin text, p_household_members jsonb
)
returns table(client_id uuid, client_number text, card_number text)
language plpgsql
set search_path to 'public'
as $function$
declare
  v_client_id uuid;
  v_client_number text;
  v_card_number text;
  v_member jsonb;
begin
  insert into clients (
    first_name, last_name, dob, phone, email,
    address_line1, address_line2, city, state, zip,
    photo_id_number, id_type, monthly_income, food_stamps_amount,
    dietary_preference, ethnicity, country_of_origin, office_id
  )
  values (
    p_first_name, p_last_name, p_dob, p_phone, p_email,
    p_address_line1, p_address_line2, p_city, p_state, p_zip,
    p_photo_id_number, p_id_type, p_monthly_income, p_food_stamps_amount,
    p_dietary_preference, p_ethnicity, p_country_of_origin, my_assigned_office()
  )
  returning id, clients.client_number into v_client_id, v_client_number;

  if p_household_members is not null then
    for v_member in select * from jsonb_array_elements(p_household_members)
    loop
      insert into household_members (client_id, first_name, last_name, dob, relationship)
      values (
        v_client_id,
        v_member->>'first_name',
        v_member->>'last_name',
        (v_member->>'dob')::date,
        v_member->>'relationship'
      );
    end loop;
  end if;

  insert into client_id_cards (client_id)
  values (v_client_id)
  returning client_id_cards.card_number into v_card_number;

  return query select v_client_id, v_client_number, v_card_number;
end;
$function$;

drop policy if exists "authenticated staff manage clients" on clients;

create policy "clients admin full access" on clients for all using (is_admin());
create policy "clients staff select own office" on clients for select using (office_id = my_assigned_office());
create policy "clients staff insert own office" on clients for insert with check (office_id = my_assigned_office());
create policy "clients staff update own office" on clients for update using (office_id = my_assigned_office());
create policy "clients regional director select" on clients for select using (
  exists (select 1 from b2s_offices o where o.id = clients.office_id and is_regional_director_for(o.region))
);
create policy "clients regional director update" on clients for update using (
  exists (select 1 from b2s_offices o where o.id = clients.office_id and is_regional_director_for(o.region))
);
