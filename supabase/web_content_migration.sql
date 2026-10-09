-- Website content editor (Admin > Website).
--
-- Lets a short list of people edit what the public website (icnarelief.org rebuild) says: campaign copy,
-- impact numbers, photos and video, the Zakat page and unit costs. The website reads the public view
-- web_site_content with its publishable key, checks every value, and falls back to its own built-in
-- content for anything missing or invalid.
--
-- Safe to run more than once. Table names carry the web_ prefix used for everything the website reads.

-- ---------- Who may edit ----------
-- Being a portal admin is not enough: you must be on this list. It is changed from the SQL editor for now.
create table if not exists web_content_editors (
  employee_id uuid primary key references employees(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table web_content_editors enable row level security;

-- security definer so the check works from inside policies without recursing through RLS.
create or replace function is_web_content_editor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from web_content_editors e
    join employees emp on emp.id = e.employee_id
    where emp.auth_user_id = auth.uid() and emp.is_active
  );
$$;

drop policy if exists "web_content_editors: editors can read" on web_content_editors;
create policy "web_content_editors: editors can read" on web_content_editors
  for select to authenticated using (is_web_content_editor());
-- No insert, update or delete policy on purpose: nobody can add themselves from the app.

-- ---------- The content ----------
-- One row per section of the editor (campaign, impact, media, zakat, giving). A missing row means
-- "use the website's built-in content" for that section.
create table if not exists web_content (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  value jsonb not null check (jsonb_typeof(value) = 'object' and pg_column_size(value) < 400000),
  updated_at timestamptz not null default now(),
  updated_by uuid references employees(id) on delete set null
);
alter table web_content enable row level security;

drop policy if exists "web_content: editors read" on web_content;
create policy "web_content: editors read" on web_content
  for select to authenticated using (is_web_content_editor());
drop policy if exists "web_content: editors insert" on web_content;
create policy "web_content: editors insert" on web_content
  for insert to authenticated with check (is_web_content_editor());
drop policy if exists "web_content: editors update" on web_content;
create policy "web_content: editors update" on web_content
  for update to authenticated using (is_web_content_editor()) with check (is_web_content_editor());
drop policy if exists "web_content: editors delete" on web_content;
create policy "web_content: editors delete" on web_content
  for delete to authenticated using (is_web_content_editor());

-- ---------- History ----------
-- Every save and reset is kept, so a bad edit can be put back by hand.
create table if not exists web_content_history (
  id bigint generated always as identity primary key,
  key text not null,
  value jsonb, -- null = the section was reset to the website's built-in content
  saved_at timestamptz not null default now(),
  saved_by uuid references employees(id) on delete set null
);
create index if not exists web_content_history_key_idx on web_content_history (key, saved_at desc);
alter table web_content_history enable row level security;

drop policy if exists "web_content_history: editors read" on web_content_history;
create policy "web_content_history: editors read" on web_content_history
  for select to authenticated using (is_web_content_editor());

create or replace function web_content_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into web_content_history (key, value, saved_by)
    values (old.key, null, (select id from employees where auth_user_id = auth.uid()));
    return old;
  end if;
  insert into web_content_history (key, value, saved_by) values (new.key, new.value, new.updated_by);
  return new;
end;
$$;

drop trigger if exists web_content_log on web_content;
create trigger web_content_log
  after insert or update or delete on web_content
  for each row execute function web_content_log();

-- ---------- What the website reads ----------
-- Same pattern as web_offices: the view is the only thing the publishable key can read.
create or replace view web_site_content as
  select key, value, updated_at from web_content;
-- Read-only for everyone. Supabase grants full rights on new objects in public by default, and a simple
-- view like this one can be written through, so those rights are taken away before read access is given.
revoke all on web_site_content from anon, authenticated;
grant select on web_site_content to anon, authenticated;

-- ---------- Uploads ----------
-- Public bucket for photos and video shown on the website. Anyone can view a file by its address;
-- only editors can add, replace or remove files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('web-media', 'web-media', true, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4'])
on conflict (id) do nothing;

drop policy if exists "web-media: editors list" on storage.objects;
create policy "web-media: editors list" on storage.objects
  for select to authenticated using (bucket_id = 'web-media' and is_web_content_editor());
drop policy if exists "web-media: editors upload" on storage.objects;
create policy "web-media: editors upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'web-media' and is_web_content_editor());
drop policy if exists "web-media: editors update" on storage.objects;
create policy "web-media: editors update" on storage.objects
  for update to authenticated using (bucket_id = 'web-media' and is_web_content_editor());
drop policy if exists "web-media: editors delete" on storage.objects;
create policy "web-media: editors delete" on storage.objects
  for delete to authenticated using (bucket_id = 'web-media' and is_web_content_editor());

-- ---------- The first editor ----------
insert into web_content_editors (employee_id)
select id from employees where lower(email) = 'tali@icnarelief.org'
on conflict (employee_id) do nothing;

-- Shows who can edit after this runs. Expect exactly one row.
select emp.first_name, emp.last_name, emp.email, e.added_at
from web_content_editors e
join employees emp on emp.id = e.employee_id;
