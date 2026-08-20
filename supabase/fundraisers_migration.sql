-- ============================================================
-- Fundraisers module ("CharityStack forms, managed from the portal")
--
-- Mirrors the volunteer_events pattern: office-scoped records the
-- portal owns, published ones exposed read-only to the WordPress
-- plugin via /api/fundraisers. Deliberately does NOT store any
-- donor-identifiable data (name, email, address, payment method) —
-- CharityStack remains the system of record for donor identity and
-- PCI-scoped payment data. This table only ever holds:
--   (a) the form's own configuration/metadata (title, goal, funds...)
--   (b) a reference back to CharityStack's formID for API lookups
--   (c) aggregate dollar totals rolled up from webhook events
-- ============================================================

-- ---------- FUNDRAISERS ----------
create table fundraisers (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references b2s_offices(id),
  employee_id uuid references employees(id),   -- who created it

  slug text not null unique,                    -- public URL + WP shortcode key

  -- CharityStack linkage. Null until the connector API key exists and
  -- the create-form call has actually succeeded — see status below.
  charitystack_form_id text unique,
  charitystack_form_url text,
  charitystack_embed_html text,

  -- Mirror of the fields CharityStack's form object accepts, kept here
  -- so the portal UI can show/edit configuration without a live API
  -- round trip, and so a fundraiser can be fully drafted before a
  -- CharityStack API key is ever configured.
  title text not null,
  description text,
  form_type text not null default 'fundraising' check (form_type in ('fundraising', 'event')),
  amount_type text default 'standard' check (amount_type in ('standard', 'giving_level', 'sponsorship')),
  funds text[] not null default '{}',
  frequencies text[] not null default '{ONE_TIME}',
  color text default '#10B981',
  header_image text,
  goal numeric(12,2),
  event_date date,
  start_time text,
  end_time text,
  location text,

  -- draft: not yet sent to CharityStack (e.g. no API key configured yet)
  -- synced: CharityStack form created, charitystack_form_id populated
  -- error: the CharityStack API call failed — see sync_error
  sync_status text not null default 'draft' check (sync_status in ('draft', 'synced', 'error')),
  sync_error text,

  is_published boolean not null default false,  -- must be true to appear on public page / WP widget
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_fundraisers_office on fundraisers (office_id);
create index idx_fundraisers_slug on fundraisers (slug);
create index idx_fundraisers_charitystack_form_id on fundraisers (charitystack_form_id);

-- ---------- DONATION EVENTS (aggregate only, no PII) ----------
-- Fed exclusively by /api/webhooks/charitystack. The handler must
-- destructure only these whitelisted fields out of the incoming
-- payload before insert — donor name/email/address/payment method
-- must never reach this table or any log around it.
create table charitystack_donation_events (
  id uuid primary key default gen_random_uuid(),
  fundraiser_id uuid references fundraisers(id) on delete set null,

  charitystack_form_id text not null,
  charitystack_payment_id text,          -- reference ID only, not PII — lets staff
                                          -- look the transaction up in CharityStack's
                                          -- own dashboard/API if they need donor detail
  event_type text not null,              -- donation.created, donation.updated,
                                          -- subscription.created, subscription.updated,
                                          -- subscription.cancelled, etc.
  amount numeric(12,2),
  fund text,
  frequency text,
  status text,
  event_timestamp timestamptz,
  created_at timestamptz not null default now()
);

create index idx_cs_events_fundraiser on charitystack_donation_events (fundraiser_id);
create index idx_cs_events_form on charitystack_donation_events (charitystack_form_id);
create index idx_cs_events_type on charitystack_donation_events (event_type);

-- ---------- Aggregate view (what the exec dashboard / fundraiser page reads) ----------
create view fundraiser_totals as
select
  f.id as fundraiser_id,
  f.office_id,
  coalesce(sum(e.amount) filter (
    where e.event_type = 'donation.created' and coalesce(e.status, 'completed') <> 'refunded'
  ), 0)::numeric(12,2) as raised_amount,
  count(*) filter (where e.event_type = 'donation.created') as donation_count
from fundraisers f
left join charitystack_donation_events e on e.fundraiser_id = f.id
group by f.id, f.office_id;

grant select on fundraiser_totals to authenticated, anon;

-- ============================================================
-- RLS
-- ============================================================

alter table fundraisers enable row level security;
alter table charitystack_donation_events enable row level security;

-- Fundraisers -----------------------------------------------
create policy "fundraisers admin full access" on fundraisers
  for all using (is_admin());

create policy "fundraisers staff insert own office" on fundraisers
  for insert with check (office_id = my_assigned_office());

create policy "fundraisers staff select own office" on fundraisers
  for select using (office_id = my_assigned_office());

create policy "fundraisers staff update own office" on fundraisers
  for update using (office_id = my_assigned_office());

create policy "fundraisers regional director select" on fundraisers
  for select using (is_regional_director_for((select region from b2s_offices where id = fundraisers.office_id)));

-- Public (anon key — portal public page + WordPress plugin) only ever
-- sees published fundraisers, and only read access. No donation-event
-- table is exposed to anon at all — dollar totals go through the
-- fundraiser_totals view, not raw rows, and even that view isn't
-- queried by the WP plugin (it hits /api/fundraisers instead).
create policy "public read published fundraisers" on fundraisers
  for select using (is_published = true);

-- Donation events ----------------------------------------------
-- Staff can view aggregate rows for their own office's fundraisers
-- (e.g. for a reporting screen); nobody outside admin/assigned-office
-- gets any access, and there is no public/anon policy at all — this
-- table is never read by the WordPress plugin or the public site.
create policy "cs events admin full access" on charitystack_donation_events
  for all using (is_admin());

create policy "cs events staff select own office" on charitystack_donation_events
  for select using (
    exists (
      select 1 from fundraisers f
      where f.id = charitystack_donation_events.fundraiser_id
      and f.office_id = my_assigned_office()
    )
  );

-- Only the webhook route (service-role/admin client) ever inserts here —
-- intentionally no insert policy for authenticated/anon roles.
