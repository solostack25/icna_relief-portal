-- ============================================================
-- Customizable home screen
--
-- One row per employee who has customized the home page. No row means
-- the default layout. For each section we store:
--   *_order  - every tile key the person saw when they saved, in order
--   *_hidden - the tile keys they switched off
-- Tiles added to the portal later aren't in *_order, so the home page
-- appends them using the tile's own default (on/off). Keys the person
-- no longer has access to are ignored when the page renders, so this
-- table never grants access to anything.
-- ============================================================

create table if not exists employee_home_layouts (
  employee_id uuid primary key references employees(id) on delete cascade,
  quick_actions_order text[] not null default '{}',
  quick_actions_hidden text[] not null default '{}',
  programs_order text[] not null default '{}',
  programs_hidden text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table employee_home_layouts enable row level security;

drop policy if exists "employee_home_layouts own read" on employee_home_layouts;
create policy "employee_home_layouts own read" on employee_home_layouts for select using (
  employee_id = (select id from employees where auth_user_id = auth.uid())
);

drop policy if exists "employee_home_layouts own insert" on employee_home_layouts;
create policy "employee_home_layouts own insert" on employee_home_layouts for insert with check (
  employee_id = (select id from employees where auth_user_id = auth.uid())
);

drop policy if exists "employee_home_layouts own update" on employee_home_layouts;
create policy "employee_home_layouts own update" on employee_home_layouts for update using (
  employee_id = (select id from employees where auth_user_id = auth.uid())
) with check (
  employee_id = (select id from employees where auth_user_id = auth.uid())
);

drop policy if exists "employee_home_layouts own delete" on employee_home_layouts;
create policy "employee_home_layouts own delete" on employee_home_layouts for delete using (
  employee_id = (select id from employees where auth_user_id = auth.uid())
);
