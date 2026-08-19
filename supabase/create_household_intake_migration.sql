-- Replaces create_client_with_intake for NEW registrations. Every
-- household member gets their own full clients row (not the old shallow
-- household_members table), linked by household_key + main_client_id.
-- household_members / create_client_with_intake are left in place,
-- untouched, for legacy data -- this is a new, separate function used
-- by the new intake form going forward.

create or replace function create_household_intake(p_members jsonb)
returns table(client_id uuid, client_number text, is_main boolean)
language plpgsql
set search_path to 'public'
as $function$
declare
  v_office_id uuid := my_assigned_office();
  v_registration_date date := current_date;
  v_household_key text;
  v_main_id uuid;
  v_member jsonb;
  v_idx integer := 0;
  v_new_id uuid;
  v_client_number text;
begin
  if v_office_id is null then
    raise exception 'No assigned office found for the current user.';
  end if;

  if jsonb_array_length(p_members) = 0 then
    raise exception 'At least one household member (the main client) is required.';
  end if;

  v_household_key := generate_household_key(v_office_id, v_registration_date);

  for v_member in select * from jsonb_array_elements(p_members)
  loop
    v_idx := v_idx + 1;
    v_client_number := v_household_key || '-' || v_idx;

    insert into clients (
      first_name, middle_initial, last_name, dob, gender, marital_status,
      phone, email, address_line1, apt_unit_no, city, state, zip,
      country_of_birth, country_of_citizenship, snap, wic, chip,
      employed, employment_type, residency_status, race_ethnicity,
      monthly_income_range, household_vehicle_count,
      household_key, relationship_to_main_client, registration_date,
      office_id, client_number
    )
    values (
      v_member->>'first_name', v_member->>'middle_initial', v_member->>'last_name',
      nullif(v_member->>'dob', '')::date, v_member->>'gender', v_member->>'marital_status',
      v_member->>'phone', v_member->>'email', v_member->>'address_line1', v_member->>'apt_unit_no',
      v_member->>'city', v_member->>'state', v_member->>'zip',
      v_member->>'country_of_birth', v_member->>'country_of_citizenship',
      (v_member->>'snap')::boolean, (v_member->>'wic')::boolean, (v_member->>'chip')::boolean,
      (v_member->>'employed')::boolean, v_member->>'employment_type', v_member->>'residency_status',
      v_member->>'race_ethnicity', v_member->>'monthly_income_range',
      nullif(v_member->>'household_vehicle_count', '')::integer,
      v_household_key,
      case when v_idx = 1 then 'Main Client' else v_member->>'relationship_to_main_client' end,
      v_registration_date, v_office_id, v_client_number
    )
    returning id into v_new_id;

    if v_idx = 1 then
      v_main_id := v_new_id;
      update clients set main_client_id = v_new_id where id = v_new_id;
    else
      update clients set main_client_id = v_main_id where id = v_new_id;
    end if;

    client_id := v_new_id;
    client_number := v_client_number;
    is_main := (v_idx = 1);
    return next;
  end loop;
end;
$function$;

comment on function create_household_intake is 'Creates a full household: every member (starting with the main client at index 1) becomes its own clients row, linked by household_key/main_client_id. p_members is a JSON array of member objects matching the clients table field names.';
