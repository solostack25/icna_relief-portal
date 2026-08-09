-- The timer moves from the ticket to the card -- a ticket can be
-- linked on more than one card/board, and "am I actively working"
-- is really a per-card concept (this specific piece of work on this
-- specific board), not a per-ticket one. helpdesk_work_timers
-- (leg-keyed) is fully superseded by this; nothing meaningful was
-- ever tracked in it yet, so it's just dropped rather than migrated.
drop table if exists helpdesk_work_timers;

create table workboard_card_timers (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references workboard_cards(id) on delete cascade unique,
  accumulated_seconds int not null default 0,
  running_since timestamptz,
  updated_at timestamptz not null default now()
);

alter table workboard_card_timers enable row level security;

create policy "workboard_card_timers access" on workboard_card_timers
  for all using (
    exists (
      select 1 from workboard_cards c
      where c.id = workboard_card_timers.card_id
        and helpdesk_can_access_board(c.board_id)
    )
  );
