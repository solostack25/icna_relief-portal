-- Refugee Services: a case must be opened (with an ID uploaded) before any
-- service can be logged.
--
--   * rsce_cases gets the identification document staff upload when opening
--     the case (type + file in the private rsce-documents bucket).
--   * A new case can't be inserted without an ID document.
--   * A service can't be inserted unless it belongs to an OPEN case for the
--     same client. (Previously, logging a service auto-opened a case.)
--
-- Both rules are insert-only triggers, so existing rows (one legacy service
-- copied from the old free-text log, no case) are left alone and editing or
-- closing a case never trips them.
--
-- Files live at rsce-documents/<office_id>/<client_id>/<file>. Storage
-- policies mirror rsce_cases: admins everywhere, staff in their own office,
-- regional directors read-only in their region. No public access; the
-- profile opens a file through a short-lived signed URL.

alter table rsce_cases
  add column if not exists id_document_type text,
  add column if not exists id_document_path text,
  add column if not exists id_document_name text,
  add column if not exists id_uploaded_at timestamptz,
  add column if not exists id_uploaded_by uuid references employees(id);

comment on column rsce_cases.id_document_path is 'Path in the private rsce-documents bucket: <office_id>/<client_id>/<file>. Required to open a case.';

-- ---------- Case must have an ID ----------
create or replace function public.rsce_cases_require_id()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if coalesce(trim(new.id_document_path), '') = '' or coalesce(trim(new.id_document_type), '') = '' then
    raise exception 'Upload a form of identification to open a Refugee Services case.'
      using errcode = 'P0001';
  end if;
  new.id_uploaded_at := coalesce(new.id_uploaded_at, now());
  return new;
end;
$$;

drop trigger if exists trg_rsce_cases_require_id on rsce_cases;
create trigger trg_rsce_cases_require_id
  before insert on rsce_cases
  for each row execute function public.rsce_cases_require_id();

-- ---------- Service must belong to an open case ----------
create or replace function public.rsce_services_require_open_case()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.case_id is null or not exists (
    select 1 from rsce_cases c
    where c.id = new.case_id and c.client_id = new.client_id and c.status = 'open'
  ) then
    raise exception 'Open a Refugee Services case for this client before logging services.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rsce_services_require_open_case on rsce_services;
create trigger trg_rsce_services_require_open_case
  before insert on rsce_services
  for each row execute function public.rsce_services_require_open_case();

-- ---------- Private bucket for case documents ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rsce-documents', 'rsce-documents', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "rsce documents insert own office" on storage.objects;
create policy "rsce documents insert own office" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'rsce-documents'
    and (public.is_admin() or (storage.foldername(name))[1] = public.my_assigned_office()::text)
  );

drop policy if exists "rsce documents read" on storage.objects;
create policy "rsce documents read" on storage.objects for select to authenticated
  using (
    bucket_id = 'rsce-documents'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = public.my_assigned_office()::text
      or exists (
        select 1 from public.b2s_offices o
        where o.id::text = (storage.foldername(name))[1] and public.is_regional_director_for(o.region)
      )
    )
  );

drop policy if exists "rsce documents admin delete" on storage.objects;
create policy "rsce documents admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'rsce-documents' and public.is_admin());
