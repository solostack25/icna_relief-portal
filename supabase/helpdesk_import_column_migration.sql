-- Lets the SharePoint import be safely re-run (e.g. to pick up
-- tickets created after the first import) without duplicating rows
-- already brought over.
alter table helpdesk_requests
  add column if not exists source_sharepoint_id text unique;

comment on column helpdesk_requests.source_sharepoint_id is
  'SharePoint list item ID this request was imported from, if any. Null for requests created natively in this app. Unique so re-running the import script is a no-op for already-imported tickets.';
