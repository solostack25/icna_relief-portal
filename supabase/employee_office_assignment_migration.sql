-- ============================================================
-- Employee office/state/region assignment
-- Lets an employee be tied to a specific b2s_offices row so their
-- B2S/FATE/DRS submissions auto-select their office instead of
-- asking every time.
-- Already applied directly to the live Supabase project.
-- ============================================================

alter table employees add column assigned_office_id uuid references b2s_offices(id);
