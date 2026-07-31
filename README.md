# ICNA Relief Portal

Main portal app: one login, one shared client database across every ICNA Relief
program (Transitional Housing, Hunger Prevention, Back to School, etc.), an
admin panel to manage employees + which apps they can access, and a
post-login launcher screen.

## What's scaffolded

- `app/page.tsx` — login
- `app/select-app/page.tsx` — post-login launcher, shows only the apps the
  employee has access to (admins see everything + the Admin Portal tile)
- `app/admin/page.tsx` — employee list (admin-only)
- `app/admin/employees/[id]/page.tsx` + `AccessEditor.tsx` — per-employee
  checkbox list of program access + "send password reset" button
- `app/api/admin/employees/route.ts` — PATCH endpoint that rewrites an
  employee's `employee_program_access` rows
- `app/api/admin/reset-password/route.ts` — admin-triggered password reset
  email, uses the Supabase service role key server-side only
- `lib/supabase/{client,server,middleware}.ts` — standard SSR auth pattern
- `middleware.ts` — redirects unauthenticated requests to `/`
- `supabase/schema.sql` — full schema: `clients`, `client_programs`,
  `employees`, `employee_program_access`, `app_registry`, `th_intakes`
  (first migrated module), plus RLS policies and a seed of the 3 known
  programs

## Setup

```bash
npm install
cp .env.local.example .env.local
# fill in your Supabase project URL + keys
```

Run the schema against a fresh Supabase project:

```bash
# in the Supabase SQL editor, or via CLI:
supabase db push --file supabase/schema.sql
```

Then create your first admin employee manually:
1. Create the user in Supabase Auth (dashboard or `admin.auth.admin.createUser`)
2. Insert a row into `employees` with `role = 'admin'` and that user's
   `auth_user_id`

```bash
npm run dev
```

## Not built yet (next steps)

- **Client search/match component** — the "search existing client by
  phone/DOB/name before creating a new one" flow. This is the piece every
  program's intake screen will import, so build it once, share everywhere.
- **Transitional Housing intake migration** — port the existing barcode
  scanner + invoice number generator (`TXHOU-MMDDYYYY-001`) + canvas
  signature capture from the standalone app into `app/transitional-housing/`,
  pointing writes at `th_intakes` (client_id FK) instead of the old
  standalone schema.
- **Data migration script** — one-time script to backfill `clients` from
  the existing `mbllwbbyofqnbfrpiqne` Supabase project's TH intake records.
- **Salesforce sync** — extend the existing push-stub pattern from the old
  admin dashboard; one Salesforce Contact per client_id, child objects per
  program.
- **New program modules** (Hunger Prevention, Back to School) — once the
  client search component exists, each new program is: a route, an intake
  table, an `app_registry` row.
- Password reset currently sends a Supabase reset email; you'll want a
  `/reset-password` page to handle the callback (not scaffolded here).

## Notes

- Every multi-table read uses two separate queries merged in memory
  (`select-app` and admin pages) — matches the known issue where relational
  join syntax silently fails with the `sb_publishable_` key format.
- RLS currently allows any authenticated employee to read/write the shared
  `clients` table, since the whole point is cross-program lookup. Tighten
  per-program only if ICNA specifically wants stricter separation later.
