-- ============================================================
-- Mileage Tracker -> Grant Management
--
-- A tracked trip can be charged to an active grant curated in Grant
-- Management (gm_grants). The driver picks the grant on the trip
-- sheet; the budget line is chosen automatically (Travel > Mileage,
-- else the grant's Travel line). When the trips are submitted, each
-- grant-funded trip also becomes a gm_expenses row (payment method
-- "reimbursement", no receipt needed) so it shows up in the grant's
-- budget vs. actual and the Grant Management approvals queue.
--
-- Run after mileage_tracker_migration.sql and grant_management_migration.sql.
-- ============================================================

alter table finance_mileage_drives add column if not exists gm_grant_id uuid references gm_grants(id);
alter table finance_mileage_drives add column if not exists gm_line_id uuid references gm_budget_lines(id);
alter table finance_mileage_drives add column if not exists gm_expense_id uuid references gm_expenses(id) on delete set null;

create index if not exists idx_mileage_drives_gm_grant on finance_mileage_drives(gm_grant_id) where gm_grant_id is not null;
