-- create_household_intake: optional target office + dietary preference.
--
-- Houston_Automation and Orlando Automation now use the portal's unified
-- household intake. Those apps are tied to one office regardless of who is
-- signed in (an admin registering a client in Orlando Automation may have no
-- assigned office, or a different one), so the RPC takes an optional
-- p_office_id. When omitted it falls back to my_assigned_office() exactly as
-- before, so the portal's own /intake/new-household call is unchanged.
--
-- Still SECURITY INVOKER: the clients INSERT policy keeps applying, so a
-- non-admin can only ever create clients in their own assigned office no
-- matter what p_office_id they pass.
--
-- dietary_preference is also read from each member (Halal/Non-Halal drives
-- which distribution slots a client can book). Absent/blank -> NULL, which is
-- what the portal's form already produces.

drop function if exists public.create_household_intake(jsonb);

create or replace function public.create_household_intake(p_members jsonb, p_office_id uuid default null)
returns table(client_id uuid, client_number text, is_main boolean)
language plpgsql
set search_path to 'public'
as $function$
declare
  v_office_id uuid := coalesce(p_office_id, my_assigned_office());
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
      monthly_income_range, household_vehicle_count, dietary_preference,
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
      nullif(v_member->>'dietary_preference', ''),
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

grant execute on function public.create_household_intake(jsonb, uuid) to authenticated;
