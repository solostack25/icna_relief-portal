# ICNA Volunteer Signups — full build

A SignUpGenius replacement that lives inside the portal, with a WordPress
plugin so each office's page can embed live events without an iframe.

## Install order

### 1. Database (already applied — included here for reference)
`supabase/volunteer_migration.sql` — you already ran this. Nothing to do.

### 2. Portal — copy into your Next.js project at these exact paths
```
app/volunteer/page.tsx
app/volunteer/new/page.tsx
app/volunteer/[id]/page.tsx
app/volunteer/[id]/EventManager.tsx
app/volunteer/public/[slug]/page.tsx
app/volunteer/public/[slug]/SignupForm.tsx
app/api/volunteer/events/route.ts
app/api/volunteer/signup/route.ts
```

### 3. Middleware — replace your existing file
`lib/supabase/middleware.ts` — this is your current file with one change:
`/volunteer/public/*` is now allowed without login (needed for the public
signup page and for the WordPress plugin's server-to-server fetch). If
you've customized this file since, just add the
`isPublicPageRoute` check manually rather than overwriting.

### 4. Register the app so staff can find it
```sql
insert into app_registry (slug, display_name, route, icon, is_active, sort_order)
values ('volunteer', 'Volunteer Signups', '/volunteer', null, true,
        (select coalesce(max(sort_order), 0) + 1 from app_registry));
```
Then give staff access the same way you do for B2S/FATE/DRS — a row per
employee in `employee_program_access` with `program_slug = 'volunteer'`
(admins see it automatically).

### 5. Deploy the portal, then note its URL
e.g. `https://portal.icnarelief.org` — you'll need it in step 6.

### 6. WordPress
Upload `wordpress-plugin/icna-volunteer-signups.php` as a plugin (zip it
into its own folder, or use a "single file plugin" uploader), activate
it, then go to **Settings → ICNA Volunteer** and set the Portal Base URL
from step 5.

On any office's WordPress page, add:
```
[icna_volunteer office="Dallas Office"]
```
(matches `b2s_offices.field_office` exactly) or, for a single event:
```
[icna_volunteer slug="dallas-food-pantry-aug-2026-x7q2"]
```
(the slug shown as the "Public link" on that event's page in the portal).

## How data flows

- **Staff** create/publish events and slots in the portal (`/volunteer`).
- **Public portal page** (`/volunteer/public/[slug]`) reads published
  events directly and writes signups straight into Supabase — no
  WordPress involved.
- **WordPress** never talks to Supabase directly. On page load, WordPress's
  *server* calls `GET /api/volunteer/events` (cached 5 min via transient).
  On signup, the browser posts to WordPress's own `admin-ajax.php`, which
  proxies server-side to `POST /api/volunteer/signup`. No CORS, no
  Supabase keys ever touch the browser on the WordPress side.
- **Overbooking** is blocked by a Postgres trigger
  (`check_volunteer_slot_capacity`) that locks the slot row, so two
  people can't grab the last spot at the same instant — the loser gets a
  clear "that slot just filled up" error from either surface.

## What's not built yet
- No employee-facing edit-signup / cancel-signup flow (only add/delete
  slots and view who signed up).
- No email confirmations on signup (Resend integration exists elsewhere
  in this codebase for donor receipts — same pattern could be reused
  here if you want it).
- No `program_director` RLS policy for volunteer data (easy to add,
  mirrors the B2S/FATE/DRS pattern, once "volunteer" is a program slug
  you assign directors to).

