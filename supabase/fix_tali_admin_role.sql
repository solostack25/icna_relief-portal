-- One-off fix: Travis got provisioned with a lower-privileged role
-- because provisioning (pre-fix) picked an arbitrary matching AD
-- group instead of the highest-priority one. Run this once after
-- applying ad_role_mappings_priority_migration.sql.

with old as (
  select id, role as old_role from employees where email = 'tali@icnarelief.org'
),
upd as (
  update employees
  set role = 'admin'
  where email = 'tali@icnarelief.org'
  returning id
)
insert into ad_sync_log (employee_id, field_changed, old_value, new_value, ad_group_id)
select old.id, 'role', old.old_role, 'admin', null
from old;
