-- ============================================================
-- HQ Review Workflow
-- Adds review_note to each submission table (status/reviewed_by/
-- reviewed_at already existed from the original module migrations).
-- Already applied directly to the live Supabase project.
-- ============================================================

alter table b2s_submissions add column review_note text;
alter table fate_submissions add column review_note text;
alter table drs_submissions add column review_note text;
