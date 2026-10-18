-- ============================================================
-- In-Kind for every office
-- ------------------------------------------------------------
-- office_settings: per-office in-kind invoice prefix (TXHOU…), cash/check
-- receipt prefix (CCHOU…), and the office's Account in ICNA's Salesforce
-- (the IR_Office__c lookup on InKind_Inven__c). Prefixes are generated as
-- state + first 3 letters of the office; Houston keeps TXHOU / CCHOU and its
-- known Salesforce account. Accounts for other offices are filled in from
-- InKind Admin → Settings (or found automatically on first push).
--
-- Also lets signed-in staff run in-kind intake for their own office —
-- previously only signed-out kiosks and admins could write sessions/donations.
--
-- Already applied directly to the live Supabase project.
-- ============================================================

create table if not exists office_settings (
  office_id uuid primary key references b2s_offices(id) on delete cascade,
  inkind_prefix text not null unique check (inkind_prefix ~ '^[A-Z]{2,8}$'),
  cash_prefix text not null unique check (cash_prefix ~ '^[A-Z]{2,10}$'),
  salesforce_account_id text check (salesforce_account_id is null or salesforce_account_id ~ '^[A-Za-z0-9]{15}([A-Za-z0-9]{3})?$'),
  salesforce_account_name text,
  updated_by uuid references employees(id),
  updated_at timestamptz not null default now()
);

alter table office_settings enable row level security;
create policy "office settings read" on office_settings for select using (auth.role() = 'authenticated');
create policy "office settings admin write" on office_settings for all using (is_admin()) with check (is_admin());
revoke all on office_settings from anon;

insert into office_settings (office_id, inkind_prefix, cash_prefix, salesforce_account_id, salesforce_account_name)
select o.id,
  o.state || upper(substr(regexp_replace(regexp_replace(o.field_office, '( Office|-Statewide| - Statewide)$', ''), '[^A-Za-z]', '', 'g'), 1, 3)),
  case when o.id = 'c2892dfa-dbf4-48f5-b64c-31a8585a0c03' then 'CCHOU'
       else 'CC' || o.state || upper(substr(regexp_replace(regexp_replace(o.field_office, '( Office|-Statewide| - Statewide)$', ''), '[^A-Za-z]', '', 'g'), 1, 3)) end,
  case when o.id = 'c2892dfa-dbf4-48f5-b64c-31a8585a0c03' then '0016O00003EfpmgQAB' end,
  case when o.id = 'c2892dfa-dbf4-48f5-b64c-31a8585a0c03' then 'Houston office (existing in-kind push)' end
from b2s_offices o
on conflict (office_id) do nothing;

create policy "sessions staff manage own office" on sessions for all
  using (office_id = my_assigned_office()) with check (office_id = my_assigned_office());

create policy "donations staff manage own office" on donations for all
  using (exists (select 1 from sessions s where s.id = donations.session_id and s.office_id = my_assigned_office()))
  with check (exists (select 1 from sessions s where s.id = donations.session_id and s.office_id = my_assigned_office()));
