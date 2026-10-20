-- Intake duplicate check: same first + last name at the same street address.
--
-- The household intake (/intake/new-household) calls find_intake_duplicates
-- while the employee types the street address. Names alone are not unique
-- (many people share a name), but the same name at the same address is
-- almost always the same person, so the form blocks the intake and shows a
-- modal linking to the existing client profile(s).
--
-- Matching:
--   * names: case/space/punctuation-insensitive exact match ("Al-Amin" =
--     "al amin");
--   * address: normalized (lowercase, punctuation stripped, common street
--     suffixes and directionals abbreviated, so "123 North Main Street" =
--     "123 n main st"). Because it runs as the employee types, a typed
--     address also matches when it is a whole-word prefix of a stored one
--     ("123 main" matches "123 main st", but not "123 maine ave"). Nothing is
--     checked until the typed address has a house number and at least two
--     letters of street name.
--
-- SECURITY DEFINER so a duplicate registered at another office is still
-- caught (clients RLS would otherwise hide it). To limit what crosses office
-- lines, it only returns what the employee already typed (name, address)
-- plus client number and office name; can_view says whether the employee
-- may open the profile under the normal clients policies.

create or replace function public.normalize_street_address(p text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(string_agg(
    case w
      when 'street' then 'st'     when 'avenue' then 'ave'   when 'av' then 'ave'
      when 'drive' then 'dr'      when 'road' then 'rd'      when 'lane' then 'ln'
      when 'boulevard' then 'blvd' when 'court' then 'ct'    when 'circle' then 'cir'
      when 'place' then 'pl'      when 'parkway' then 'pkwy' when 'highway' then 'hwy'
      when 'freeway' then 'fwy'   when 'terrace' then 'ter'  when 'trail' then 'trl'
      when 'apartment' then 'apt' when 'suite' then 'ste'
      when 'north' then 'n'       when 'south' then 's'      when 'east' then 'e'
      when 'west' then 'w'
      else w
    end, ' ' order by ord), '')
  from unnest(string_to_array(
         trim(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', ' ', 'g')), ' '
       )) with ordinality as t(w, ord)
  where w <> ''
$$;

comment on function public.normalize_street_address is
  'Lowercases a street address, strips punctuation and abbreviates common suffixes/directionals so equivalent spellings compare equal. Used by find_intake_duplicates.';

create index if not exists idx_clients_normalized_address
  on clients (normalize_street_address(address_line1) text_pattern_ops);

create or replace function public.find_intake_duplicates(
  p_first_name text,
  p_last_name text,
  p_address_line1 text
)
returns table(
  client_id uuid,
  client_number text,
  first_name text,
  last_name text,
  address_line1 text,
  apt_unit_no text,
  city text,
  zip text,
  office_name text,
  registration_date date,
  can_view boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_first text := regexp_replace(lower(coalesce(p_first_name, '')), '[^a-z]', '', 'g');
  v_last  text := regexp_replace(lower(coalesce(p_last_name, '')), '[^a-z]', '', 'g');
  v_addr  text := normalize_street_address(p_address_line1);
  v_is_admin boolean;
  v_my_office uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Need both names and a house number + start of a street name.
  if v_first = '' or v_last = '' or v_addr is null or v_addr !~ '^[0-9]+[a-z]? [a-z0-9]{2,}' then
    return;
  end if;

  v_is_admin := is_admin();
  v_my_office := my_assigned_office();

  return query
  select c.id, c.client_number, c.first_name, c.last_name,
         c.address_line1, c.apt_unit_no, c.city, c.zip,
         o.field_office, coalesce(c.registration_date, c.created_at::date),
         (v_is_admin
           or (c.office_id is not null and c.office_id = v_my_office)
           or (o.region is not null and is_regional_director_for(o.region)))
  from clients c
  left join b2s_offices o on o.id = c.office_id
  where (normalize_street_address(c.address_line1) = v_addr
         or normalize_street_address(c.address_line1) like v_addr || ' %')
    and regexp_replace(lower(coalesce(c.first_name, '')), '[^a-z]', '', 'g') = v_first
    and regexp_replace(lower(coalesce(c.last_name, '')), '[^a-z]', '', 'g') = v_last
  order by coalesce(c.registration_date, c.created_at::date) desc
  limit 10;
end;
$function$;

revoke all on function public.find_intake_duplicates(text, text, text) from public, anon;
grant execute on function public.find_intake_duplicates(text, text, text) to authenticated;
