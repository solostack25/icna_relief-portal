-- Per-employee Microsoft Graph delegated refresh tokens, captured at SSO
-- sign-in. Used so Portal Assistant lookups (shared files, shared
-- meetings) run AS the person asking and only ever see what they can see.
-- Token is AES-256-GCM encrypted by the app before it's stored; RLS is on
-- with no policies, so only the service role can read or write it.
create table if not exists public.employee_graph_tokens (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  refresh_token_enc text not null,
  scopes text,
  updated_at timestamptz not null default now()
);
alter table public.employee_graph_tokens enable row level security;
