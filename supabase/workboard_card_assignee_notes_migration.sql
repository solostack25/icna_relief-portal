alter table workboard_cards add column if not exists assigned_to_employee_id uuid references employees(id);

-- Running note log per card, shown in the expanded card view -- so
-- anyone who comes along later can see what's happened on this card
-- without needing to dig through the linked ticket (if any).
create table workboard_card_notes (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references workboard_cards(id) on delete cascade,
  author_employee_id uuid references employees(id),
  body text not null,
  created_at timestamptz not null default now()
);

alter table workboard_card_notes enable row level security;

-- Same access rule as the board itself, reached via the card's
-- board_id -- reuses helpdesk_can_access_board() from the original
-- workboard schema migration.
create policy "workboard_card_notes access" on workboard_card_notes
  for all using (
    exists (
      select 1 from workboard_cards c
      where c.id = workboard_card_notes.card_id
        and helpdesk_can_access_board(c.board_id)
    )
  );
