-- Orlando Automation (/orlando-automation) - office scoping for the
-- Houston_Automation tables that had no office column yet.
--
-- pickup_slots / pickup_waitlist / blackout_days / clients already carry
-- office_id. These three didn't, so a second office running the same
-- screens would have shared one broadcast history, one donor campaign
-- contact list, and one audit trail with Houston.
--
-- Additive + nullable: existing rows (all Houston_Automation's) stay
-- NULL, and Houston_Automation itself keeps working untouched since it
-- never filters on these columns.

alter table broadcasts             add column if not exists office_id uuid references b2s_offices(id);
alter table campaign_contacts      add column if not exists office_id uuid references b2s_offices(id);
alter table distribution_audit_log add column if not exists office_id uuid references b2s_offices(id);

create index if not exists broadcasts_office_id_idx             on broadcasts (office_id);
create index if not exists campaign_contacts_office_id_idx      on campaign_contacts (office_id);
create index if not exists distribution_audit_log_office_id_idx on distribution_audit_log (office_id);
