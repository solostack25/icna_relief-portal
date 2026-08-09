-- Enables Supabase Realtime (Postgres change broadcasts over
-- websocket) for helpdesk_request_legs -- needed so a status change
-- from dragging a card on the workboard shows up live on an already-
-- open ticket detail page in another tab, without a manual refresh.
--
-- Wrapped in a check so this is safe to run more than once (adding a
-- table to a publication it's already in errors otherwise).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'helpdesk_request_legs'
  ) then
    alter publication supabase_realtime add table helpdesk_request_legs;
  end if;
end $$;
