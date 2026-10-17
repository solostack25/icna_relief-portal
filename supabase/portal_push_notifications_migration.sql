-- Push notifications for the portal phone app (PWA).
--
-- portal_push_subscriptions: one row per phone/browser that turned on
--   notifications, tied to the staff member signed in at the time.
-- portal_push_messages: what the Notification Center sent, to whom, and
--   how many phones it reached (the admin history list).
--
-- Both are read and written only by the portal's server code (service
-- role), so RLS is on with no policies: the browser can't touch them.

create table if not exists public.portal_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0
);
create index if not exists portal_push_subscriptions_employee_idx
  on public.portal_push_subscriptions (employee_id);
alter table public.portal_push_subscriptions enable row level security;

create table if not exists public.portal_push_messages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  url text,
  audience jsonb not null,          -- {"type":"everyone"} | {"type":"office","officeId":…} | {"type":"region","region":…} | {"type":"role","role":…} | {"type":"people","employeeIds":[…]}
  audience_label text not null,     -- human-readable, for the history list
  sent_by uuid references public.employees(id) on delete set null,
  recipients integer not null default 0,   -- people targeted
  devices integer not null default 0,      -- phones/browsers attempted
  delivered integer not null default 0,
  failed integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists portal_push_messages_created_idx
  on public.portal_push_messages (created_at desc);
alter table public.portal_push_messages enable row level security;
