-- One-off repair for the silent-error bug in closeLeg's final
-- overall_status update (fixed in code) -- any request whose legs are
-- ALL closed/handed_off but whose overall_status never got flipped to
-- 'closed' gets corrected here. Safe to re-run; only touches rows
-- that are actually inconsistent.
update helpdesk_requests r
set overall_status = 'closed'
where r.overall_status != 'closed'
  and exists (select 1 from helpdesk_request_legs l where l.request_id = r.id)
  and not exists (
    select 1 from helpdesk_request_legs l
    where l.request_id = r.id
      and l.status in ('open', 'in_progress', 'on_hold', 'quality_assurance')
  );
