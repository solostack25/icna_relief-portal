-- ============================================================
-- Phones (3CX + Skyetel) admin
--
-- phone_admin_audit: every change made from Admin > Phones (who, what,
-- which system, whether it worked). Service-role only.
--
-- integration_token_cache: 3CX allows only ONE active access token per
-- API client, so every serverless instance must share one token instead
-- of each fetching its own (which would invalidate the others).
-- ============================================================

create table if not exists phone_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references employees(id),
  actor_name text,
  system text not null check (system in ('3cx', 'skyetel')),
  action text not null,
  target text,
  detail jsonb,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists idx_phone_admin_audit_created on phone_admin_audit (created_at desc);
alter table phone_admin_audit enable row level security;

create table if not exists integration_token_cache (
  key text primary key,
  token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table integration_token_cache enable row level security;
