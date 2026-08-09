-- Department-level manage access for the helpdesk, reusing the same
-- app_registry + employee_program_access mechanism every other app
-- uses -- so it's grantable through the existing AD mapping UI and
-- the per-employee admin UI, no new admin screen needed.
--
-- These are deliberately is_active = true (so they show up as
-- checkboxes in /admin/ad-mappings and /admin/employees, same as any
-- other app) but are filtered out of the launcher tile grid in
-- app/select-app/page.tsx by slug prefix, since they're permission
-- flags for department queues inside /helpdesk, not separate apps.
insert into app_registry (slug, display_name, route, is_active, sort_order) values
  ('helpdesk-it', 'Help Desk — IT Queue', '/helpdesk?dept=it', true, 90),
  ('helpdesk-hr', 'Help Desk — HR Queue', '/helpdesk?dept=hr', true, 91),
  ('helpdesk-marketing', 'Help Desk — Marketing Queue', '/helpdesk?dept=marketing', true, 92),
  ('helpdesk-finance', 'Help Desk — Finance Queue', '/helpdesk?dept=finance', true, 93);
