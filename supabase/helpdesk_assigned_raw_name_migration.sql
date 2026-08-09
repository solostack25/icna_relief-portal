alter table helpdesk_request_legs
  add column if not exists assigned_to_raw_name text;

comment on column helpdesk_request_legs.assigned_to_raw_name is
  'Technician name as it appeared in the source system, kept even when it could not be matched to an employees row. Display fallback so historical assignment is not silently shown as Unassigned.';
