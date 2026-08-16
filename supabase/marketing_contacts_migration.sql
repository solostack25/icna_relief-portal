-- ============================================================
-- Marketing Contacts Platform
-- Independent contacts/segments layer (replaces Pardot for
-- marketing purposes). Donation amounts sync in read-only from
-- Salesforce for dynamic segment rules like "Top Donors";
-- Salesforce remains the system of record for gifts themselves.
-- ============================================================

-- ---------- CONTACTS ----------
create table contacts (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  first_name text,
  last_name text,
  salesforce_contact_id text,
  source text not null default 'manual' check (source in ('manual', 'import', 'portal')),
  email_opt_out boolean not null default false,
  sms_opt_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dedup key: email is the primary matching key for import/upsert.
-- Partial unique index (not a plain unique constraint) so multiple
-- null emails are allowed - phone-only contacts are valid.
create unique index contacts_email_unique_idx on contacts (lower(email)) where email is not null;

-- ---------- CONTACT CUSTOM FIELDS ----------
-- Flexible key/value for fields that don't map to a fixed column
-- (e.g. Pardot custom fields carried over during import).
create table contact_fields (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  field_key text not null,
  field_value text,
  created_at timestamptz not null default now(),
  unique (contact_id, field_key)
);

-- ---------- TAGS ----------
create table contact_tags (
  contact_id uuid not null references contacts(id) on delete cascade,
  tag text not null,
  tagged_at timestamptz not null default now(),
  primary key (contact_id, tag)
);
create index contact_tags_tag_idx on contact_tags (tag);

-- ---------- DONOR GIFTS (synced read-only from Salesforce) ----------
-- Named donor_gifts (not "donations") because that table name is
-- already used by the InKind in-kind item donation system.
create table donor_gifts (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete set null,
  salesforce_id text unique not null,
  amount numeric(12,2) not null,
  gift_date date not null,
  campaign text,
  synced_at timestamptz not null default now()
);
create index donor_gifts_contact_idx on donor_gifts (contact_id);
create index donor_gifts_gift_date_idx on donor_gifts (gift_date);

-- ---------- SEGMENTS ----------
create table segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  type text not null check (type in ('static', 'dynamic')),
  -- For dynamic segments: a small structured rule tree, e.g.
  -- {"op":"and","rules":[{"field":"tag","op":"eq","value":"top_donor"},
  --                       {"field":"donation_total_12mo","op":"gte","value":500}]}
  rules jsonb,
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Explicit membership for static segments (and a cache/snapshot
-- point for dynamic ones if we ever want to freeze a send list).
create table segment_members (
  segment_id uuid not null references segments(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (segment_id, contact_id)
);

-- ---------- IMPORT BATCHES (CSV upload audit trail) ----------
create table contact_import_batches (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  column_mapping jsonb not null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  rows_created int not null default 0,
  rows_updated int not null default 0,
  rows_skipped int not null default 0,
  error_summary text,
  imported_by uuid references employees(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ---------- updated_at trigger (reuse if one already exists globally) ----------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists contacts_set_updated_at on contacts;
create trigger contacts_set_updated_at
before update on contacts
for each row execute function set_updated_at();

drop trigger if exists segments_set_updated_at on segments;
create trigger segments_set_updated_at
before update on segments
for each row execute function set_updated_at();

-- ---------- RLS ----------
alter table contacts enable row level security;
alter table contact_fields enable row level security;
alter table contact_tags enable row level security;
alter table donor_gifts enable row level security;
alter table segments enable row level security;
alter table segment_members enable row level security;
alter table contact_import_batches enable row level security;

-- Access gated the same way as flier-marketing: employees with the
-- 'marketing-contacts' program_slug, or role = 'admin'.
create or replace function has_marketing_contacts_access(p_auth_user_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_employee_id uuid;
  v_role text;
  v_has_access boolean;
begin
  select id, role into v_employee_id, v_role
  from employees where auth_user_id = p_auth_user_id;

  if v_employee_id is null then
    return false;
  end if;

  if v_role = 'admin' then
    return true;
  end if;

  select exists (
    select 1 from employee_program_access
    where employee_id = v_employee_id
      and program_slug = 'marketing-contacts'
  ) into v_has_access;

  return coalesce(v_has_access, false);
end;
$$;

create policy contacts_access on contacts
  for all using (has_marketing_contacts_access(auth.uid()))
  with check (has_marketing_contacts_access(auth.uid()));

create policy contact_fields_access on contact_fields
  for all using (has_marketing_contacts_access(auth.uid()))
  with check (has_marketing_contacts_access(auth.uid()));

create policy contact_tags_access on contact_tags
  for all using (has_marketing_contacts_access(auth.uid()))
  with check (has_marketing_contacts_access(auth.uid()));

create policy donor_gifts_access on donor_gifts
  for all using (has_marketing_contacts_access(auth.uid()))
  with check (has_marketing_contacts_access(auth.uid()));

create policy segments_access on segments
  for all using (has_marketing_contacts_access(auth.uid()))
  with check (has_marketing_contacts_access(auth.uid()));

create policy segment_members_access on segment_members
  for all using (has_marketing_contacts_access(auth.uid()))
  with check (has_marketing_contacts_access(auth.uid()));

create policy contact_import_batches_access on contact_import_batches
  for all using (has_marketing_contacts_access(auth.uid()))
  with check (has_marketing_contacts_access(auth.uid()));

-- ---------- APP REGISTRY ENTRY ----------
insert into app_registry (slug, display_name, route, sort_order) values
  ('marketing-contacts', 'Contacts & Campaigns', '/marketing/contacts', 65)
on conflict (slug) do nothing;
