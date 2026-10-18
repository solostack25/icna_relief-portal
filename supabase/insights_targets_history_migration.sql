-- Goals & budgets + pre-portal history (applied directly via Supabase MCP).

-- Yearly goals and budgets set by upper management, per org / region / state / office.
create table if not exists insights_targets (
  year int not null check (year between 2000 and 2100),
  scope text not null check (scope in ('org', 'region', 'state', 'office')),
  scope_key text not null default '',
  metric text not null check (metric in ('fundraising', 'value_of_services', 'people_served', 'budget')),
  amount numeric not null check (amount >= 0),
  note text,
  updated_by uuid references employees(id),
  updated_at timestamptz not null default now(),
  primary key (year, scope, scope_key, metric)
);
alter table insights_targets enable row level security;
create policy insights_targets_admin on insights_targets for all using (is_admin()) with check (is_admin());
create policy insights_targets_read on insights_targets for select using (auth.uid() is not null);

-- Annual totals from before the portal (Power BI / Master Cleaner era).
create table if not exists insights_history (
  year int not null,
  scope text not null check (scope in ('org', 'region', 'state', 'office')),
  scope_key text not null default '',
  metric text not null,
  value numeric not null,
  source text not null,
  imported_at timestamptz not null default now(),
  primary key (year, scope, scope_key, metric)
);
alter table insights_history enable row level security;
create policy insights_history_admin on insights_history for all using (is_admin()) with check (is_admin());

-- Carry over anything entered in the first goals table
insert into insights_targets (year, scope, scope_key, metric, amount, updated_by, updated_at)
select year, scope, scope_key, 'value_of_services', amount, updated_by, updated_at from insights_goals
on conflict do nothing;

-- 2025 history import (applied directly). Region/org totals from the 2025 Power BI
-- Regional Profiles page; state volunteer totals from '2025 Volunteering Data.csv'
-- in solostack25/master-cleaner.
insert into insights_history (year, scope, scope_key, metric, value, source) values
(2025,'state','AZ','volunteers',961,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','AZ','volunteer_hours',2743.0,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','CA','volunteers',805,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','CA','volunteer_hours',2606.1,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','FL','volunteers',1318,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','FL','volunteer_hours',11762.5,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','GA','volunteers',763,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','GA','volunteer_hours',1757.0,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','IA','volunteers',12,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','IA','volunteer_hours',33.0,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','IL','volunteers',1212,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','IL','volunteer_hours',4500.75,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','IN','volunteers',10,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','IN','volunteer_hours',54.5,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','KS','volunteers',11,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','KS','volunteer_hours',23.22,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','LA','volunteers',188,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','LA','volunteer_hours',807.0,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','MA','volunteers',194,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','MA','volunteer_hours',946.95,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','MD','volunteers',75,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','MD','volunteer_hours',163.0,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','MI','volunteers',16,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','MI','volunteer_hours',61.0,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','MN','volunteers',119,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','MN','volunteer_hours',451.5,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','NC','volunteers',111,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','NC','volunteer_hours',384.0,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','NJ','volunteers',392,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','NJ','volunteer_hours',1395.77,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','NY','volunteers',1880,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','NY','volunteer_hours',6935.5,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','OK','volunteers',4,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','OK','volunteer_hours',19.0,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','PA','volunteers',546,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','PA','volunteer_hours',1518.5,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','RI','volunteers',11,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','RI','volunteer_hours',33.0,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','SC','volunteers',2895,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','SC','volunteer_hours',19078.51,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','TX','volunteers',402,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','TX','volunteer_hours',1303.3,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','VA','volunteers',834,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','VA','volunteer_hours',2602.55,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','WA','volunteers',156,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','WA','volunteer_hours',607.5,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','WI','volunteers',2,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'state','WI','volunteer_hours',6.0,'2025 Volunteering Data.csv (Master Cleaner)'),
(2025,'region','DMV','value_of_services',6552785,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','DMV','people_served',107808,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','DMV','volunteers',913,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','DMV','volunteer_hours',2789,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','MIDWEST 1','value_of_services',8650034,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','MIDWEST 1','people_served',144920,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','MIDWEST 1','volunteers',1254,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','MIDWEST 1','volunteer_hours',4637,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','MIDWEST 2','value_of_services',3467559,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','MIDWEST 2','people_served',56625,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','MIDWEST 2','volunteers',161,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','MIDWEST 2','volunteer_hours',741,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','NORTHEAST','value_of_services',10345924,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','NORTHEAST','people_served',190979,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','NORTHEAST','volunteers',3064,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','NORTHEAST','volunteer_hours',10962,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','SOUTH CENTRAL','value_of_services',15240068,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','SOUTH CENTRAL','people_served',186009,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','SOUTH CENTRAL','volunteers',433,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','SOUTH CENTRAL','volunteer_hours',1410,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','SOUTHEAST','value_of_services',24627983,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','SOUTHEAST','people_served',308319,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','SOUTHEAST','volunteers',5169,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','SOUTHEAST','volunteer_hours',33110,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','WEST','value_of_services',9656181,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','WEST','people_served',148403,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','WEST','volunteers',1925,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','WEST','volunteer_hours',6152,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','UNASSIGNED','value_of_services',82519,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'region','UNASSIGNED','people_served',2014,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'org','','value_of_services',78623053,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'org','','people_served',1145077,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'org','','volunteers',12919,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'org','','volunteer_hours',59801,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'org','','raised',69234742,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'org','','inkind_value',36182742,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'org','','donors_total',60400,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'org','','donors_unique',24108,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'org','','muslim_population',4325816,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'org','','mosques',2108,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'org','','fundraising',33386887,'Power BI Regional Profiles, data through 2025-12-31'),
(2025,'org','','services:Hunger Prevention',55240557,'Power BI Regional Profiles, data through 2025-12-31 (program share)'),
(2025,'org','','services:Health Services',10826394,'Power BI Regional Profiles, data through 2025-12-31 (program share)'),
(2025,'org','','services:Refugee Services',7571400,'Power BI Regional Profiles, data through 2025-12-31 (program share)'),
(2025,'org','','services:Back2School',676158,'Power BI Regional Profiles, data through 2025-12-31 (program share)'),
(2025,'org','','services:Other programs',4308544,'Power BI Regional Profiles, data through 2025-12-31 (program share)')
on conflict (year, scope, scope_key, metric) do update set value = excluded.value, source = excluded.source, imported_at = now();
insert into insights_targets (year, scope, scope_key, metric, amount, note) values (2025,'org','','fundraising',35689658,'Revised goal from the 2025 Power BI Regional Profiles page') on conflict (year, scope, scope_key, metric) do update set amount = excluded.amount;

-- Also applied: 2026 fundraising goals from the Power BI Community Revenue page
-- (33 offices visible on the page — offices from North Dakota onward were cut
-- off in the screenshot and still need entering), the 7 region goals and the
-- org total ($28,644,873); and 2024/2025 community revenue by region
-- (metric 'community_revenue') from the same page.
