-- Run AFTER workboard_qa_status_enum_migration.sql has been
-- committed on its own.

-- Which ticket status a column drives, when a linked card sits in it.
-- Mapping is per-column (not by name-matching at query time), so
-- renaming a column later doesn't silently break the sync -- e.g.
-- renaming "Quality Assurance" to "QA Review" keeps driving the same
-- quality_assurance status, it doesn't need re-wiring. A column with
-- no mapping (null) just doesn't sync anything -- e.g. any extra
-- column an admin adds beyond the default four.
alter table workboard_columns add column if not exists maps_to_status text
  check (maps_to_status is null or maps_to_status in ('open', 'in_progress', 'on_hold', 'quality_assurance', 'closed'));

-- Rename any existing "Blocked" column (from the old default team-board
-- seed) to "Quality Assurance", case-insensitive.
update workboard_columns set name = 'Quality Assurance' where lower(name) = 'blocked';

-- Backfill the mapping on existing columns by their current name --
-- only for the four standard default names, only where unmapped, so
-- this doesn't clobber anything already set or touch custom columns.
update workboard_columns set maps_to_status = 'open' where lower(name) = 'to do' and maps_to_status is null;
update workboard_columns set maps_to_status = 'in_progress' where lower(name) = 'in progress' and maps_to_status is null;
update workboard_columns set maps_to_status = 'quality_assurance' where lower(name) = 'quality assurance' and maps_to_status is null;
update workboard_columns set maps_to_status = 'closed' where lower(name) = 'done' and maps_to_status is null;
