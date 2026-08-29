-- ============================================================
-- Ticket numbers, consistently, across every request/ticket-style
-- system in the portal - previously only finance_tickets had one
-- (FT-000001); the general Helpdesk system and IRFAS both only had
-- raw UUIDs, with no human-readable identifier a person could
-- reference in an email or read over the phone.
-- ============================================================

alter table helpdesk_requests add column if not exists ticket_number text unique;

create sequence if not exists helpdesk_ticket_number_seq;
create or replace function generate_helpdesk_ticket_number()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.ticket_number is null or new.ticket_number = '' then
    new.ticket_number := 'HD-' || lpad(nextval('helpdesk_ticket_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger trg_helpdesk_ticket_number
  before insert on helpdesk_requests
  for each row execute function generate_helpdesk_ticket_number();

revoke execute on function generate_helpdesk_ticket_number() from public, anon, authenticated;

alter table zakat_applications add column if not exists application_number text unique;

create sequence if not exists zakat_application_number_seq;
create or replace function generate_zakat_application_number()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.application_number is null or new.application_number = '' then
    new.application_number := 'IRFAS-' || lpad(nextval('zakat_application_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger trg_zakat_application_number
  before insert on zakat_applications
  for each row execute function generate_zakat_application_number();

revoke execute on function generate_zakat_application_number() from public, anon, authenticated;

-- Backfill existing rows that predate this migration, in creation
-- order, so nothing is left without a number.
do $$
declare
  r record;
begin
  for r in select id from helpdesk_requests where ticket_number is null order by created_at asc loop
    update helpdesk_requests set ticket_number = 'HD-' || lpad(nextval('helpdesk_ticket_number_seq')::text, 6, '0') where id = r.id;
  end loop;
  for r in select id from zakat_applications where application_number is null order by created_at asc loop
    update zakat_applications set application_number = 'IRFAS-' || lpad(nextval('zakat_application_number_seq')::text, 6, '0') where id = r.id;
  end loop;
end $$;
