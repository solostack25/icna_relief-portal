-- Trello-style task boards. Two kinds:
--   private -- owned by one employee, visible only to them
--   team    -- scoped to a department (only 'it' created for now),
--              visible to anyone who manages that department's queue
--
-- A card can optionally link back to a helpdesk ticket
-- (linked_leg_id) -- that's what "move ticket to workboard" creates.
-- The card's own created_at is the "time on this board" clock,
-- deliberately separate from the ticket's own age timer (see
-- helpdesk_request_legs.created_at / formatTicketAge) -- moving a
-- ticket to a board doesn't touch the ticket's own timers or status,
-- it's an additive personal/team tracking layer on top.

create type workboard_type as enum ('private', 'team');

create table workboards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type workboard_type not null,
  owner_employee_id uuid references employees(id), -- set for private boards
  team_department helpdesk_department, -- set for team boards
  created_at timestamptz not null default now(),
  check (
    (type = 'private' and owner_employee_id is not null and team_department is null)
    or
    (type = 'team' and team_department is not null and owner_employee_id is null)
  )
);

create table workboard_columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references workboards(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table workboard_cards (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references workboards(id) on delete cascade,
  column_id uuid not null references workboard_columns(id) on delete cascade,
  title text not null,
  description text,
  linked_leg_id uuid references helpdesk_request_legs(id) on delete set null,
  sort_order int not null default 0,
  created_by_employee_id uuid references employees(id),
  created_at timestamptz not null default now()
);

create index idx_workboard_columns_board on workboard_columns(board_id);
create index idx_workboard_cards_board on workboard_cards(board_id);
create index idx_workboard_cards_column on workboard_cards(column_id);

alter table workboards enable row level security;
alter table workboard_columns enable row level security;
alter table workboard_cards enable row level security;

-- workboards' own policy references its OWN columns directly (type,
-- owner_employee_id, team_department) rather than subquerying
-- workboards itself -- that's what makes INSERT work correctly (a
-- self-referential subquery on the table being inserted into can't
-- see the not-yet-committed row, which would otherwise make every
-- insert fail the check).
create policy "workboard access" on workboards
  for all using (
    (type = 'private' and owner_employee_id = (select id from employees where auth_user_id = auth.uid()))
    or (type = 'team' and exists (
      select 1 from employee_program_access epa
      join employees e on e.id = epa.employee_id
      where e.auth_user_id = auth.uid()
        and epa.program_slug = 'helpdesk-' || team_department::text
    ))
    or exists (select 1 from employees where auth_user_id = auth.uid() and role = 'admin')
  );

-- Columns and cards reference an ALREADY-EXISTING board (created in a
-- prior statement), so a subquery back to workboards is safe here --
-- no chicken-and-egg problem like workboards' own policy would have.
create or replace function helpdesk_can_access_board(p_board_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from workboards b
    where b.id = p_board_id
    and (
      (b.type = 'private' and b.owner_employee_id = (select id from employees where auth_user_id = auth.uid()))
      or (b.type = 'team' and exists (
        select 1 from employee_program_access epa
        join employees e on e.id = epa.employee_id
        where e.auth_user_id = auth.uid()
          and epa.program_slug = 'helpdesk-' || b.team_department::text
      ))
      or exists (select 1 from employees where auth_user_id = auth.uid() and role = 'admin')
    )
  );
$$;

create policy "workboard_columns access" on workboard_columns
  for all using (helpdesk_can_access_board(board_id));
create policy "workboard_cards access" on workboard_cards
  for all using (helpdesk_can_access_board(board_id));
