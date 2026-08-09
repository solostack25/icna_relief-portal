-- Fixes provisioning picking an arbitrary AD group when a user belongs
-- to more than one mapped group (e.g. "InKind Staff" AND "Admins").
-- Provisioning now orders by priority DESC and takes the first match,
-- so the most-privileged mapping wins deterministically instead of
-- whatever order Postgres happened to return rows in.

alter table ad_role_mappings
  add column if not exists priority int not null default 0;

-- Backfill existing rows so priority matches what the admin UI will
-- now set automatically for each portal_role going forward
-- (see ROLE_PRIORITY in app/admin/ad-mappings/new/page.tsx and [id]/page.tsx).
update ad_role_mappings set priority = 100 where portal_role = 'admin';
update ad_role_mappings set priority = 75  where portal_role = 'program_director';
update ad_role_mappings set priority = 50  where portal_role = 'regional_director';
update ad_role_mappings set priority = 0   where portal_role = 'staff';

comment on column ad_role_mappings.priority is
  'Higher priority wins when a user matches multiple AD group mappings during provisioning. Admin-granting mappings should be highest.';
