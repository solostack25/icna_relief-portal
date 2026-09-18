-- Per-client food bank ID (correction to live_distribution_migration.sql).
--
-- The local food bank identifies each client by its own ID number, not one
-- shared office code. Staff record it on the client profile; the Live
-- Distribution scan popup renders it as a QR code (via
-- /api/orlando-automation/qr) to scan into the food bank's system.
-- The office-level live_distribution_settings table (one QR per office)
-- is dropped - it was never populated.

alter table clients add column if not exists food_bank_client_id text;
create index if not exists clients_food_bank_client_id_idx on clients (food_bank_client_id) where food_bank_client_id is not null;

drop table if exists live_distribution_settings;
