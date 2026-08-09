-- Run this ALONE, before the next migration file. Postgres doesn't
-- allow a newly-added enum value to be referenced (in a CHECK
-- constraint, UPDATE, etc.) within the same transaction it was added
-- in -- so this has to be its own migration, committed on its own,
-- before workboard_qa_status_migration.sql can safely use the value.
alter type helpdesk_leg_status add value 'quality_assurance';
