-- ============================================================
-- IT Helpdesk - Hardware Request: shipping address + grant
--
-- Hardware Request tickets now ask where to ship the equipment and
-- whether it's a grant-related purchase. When it is, the requester
-- picks one of the active grants curated in Grant Management
-- (gm_grants). grant_name (an older free-text column carried over from
-- the SharePoint import) is still filled with "CODE · Name" so older
-- views and exports keep working.
--
-- Run after grant_management_migration.sql.
-- ============================================================

alter table helpdesk_leg_details_it add column if not exists ship_to_name text;
alter table helpdesk_leg_details_it add column if not exists ship_address_line1 text;
alter table helpdesk_leg_details_it add column if not exists ship_address_line2 text;
alter table helpdesk_leg_details_it add column if not exists ship_city text;
alter table helpdesk_leg_details_it add column if not exists ship_state text;
alter table helpdesk_leg_details_it add column if not exists ship_zip text;
alter table helpdesk_leg_details_it add column if not exists is_grant_purchase boolean not null default false;
alter table helpdesk_leg_details_it add column if not exists gm_grant_id uuid references gm_grants(id);

create index if not exists idx_helpdesk_it_gm_grant on helpdesk_leg_details_it(gm_grant_id) where gm_grant_id is not null;
