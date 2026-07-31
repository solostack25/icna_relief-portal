# ICNA Volunteer Signups — full build (current as of this download)

Drop straight into your existing portal repo — same one with /fate, /drs,
/b2s, /admin. Nothing here is a separate project.

## What's in this package

    supabase/volunteer_migration.sql        — already run, included for reference
    app/volunteer/page.tsx                  — event list + admin CSV export button
    app/volunteer/new/page.tsx              — create event form
    app/volunteer/[id]/page.tsx             — event detail (server)
    app/volunteer/[id]/EventManager.tsx     — publish/slots/signups (client)
    app/volunteer/public/[slug]/page.tsx    — public, no-login signup page
    app/volunteer/public/[slug]/SignupForm.tsx
    app/api/volunteer/events/route.ts       — public JSON feed (WordPress + public page)
    app/api/volunteer/signup/route.ts       — shared signup endpoint
    app/api/volunteer/export/route.ts       — admin-only CSV export of all signups
    lib/supabase/middleware.ts              — patched to allow /volunteer/public/* without login
    wordpress-plugin/icna-volunteer-signups.php  — shortcode + AJAX proxy plugin
    middleware.patch                        — same middleware change as a git patch

## Step 1 — Copy files (additive, nothing existing gets touched)

Copy `app/volunteer`, `app/api/volunteer` into your repo root at those
exact paths. All new files/folders — zero collisions with what you have.

## Step 2 — Patch middleware.ts (the one file that changes)

Option A (git repo, hasn't diverged): `git apply middleware.patch`
Option B (always safe): overwrite `lib/supabase/middleware.ts` with the
one in this package. The only functional change: `/volunteer/public/*`
is allowed without login, same as `/` and `/api/*` already were.

## Step 3 — Database

Already done. Nothing to run — `volunteer_migration.sql` is here for
your records only.

## Step 4 — Register the app + grant access

Run in Supabase SQL editor:

    insert into app_registry (slug, display_name, route, icon, is_active, sort_order)
    values ('volunteer', 'Volunteer Signups', '/volunteer', null, true,
            (select coalesce(max(sort_order), 0) + 1 from app_registry));

Then give staff access the same way as B2S/FATE/DRS: a row per employee
in `employee_program_access` with `program_slug = 'volunteer'` (admins
see it automatically, no row needed).

## Step 5 — Deploy, note the live URL

## Step 6 — WordPress

1. Zip `wordpress-plugin/icna-volunteer-signups.php` into its own folder
   (or use a single-file plugin uploader) and activate it.
2. Settings → ICNA Volunteer → paste your portal's live URL.
3. Add the shortcode to an office's page **inside a Code/HTML block**
   (not a Text/Visual block — some of those auto-convert straight quotes
   to curly ones and break the office-name match):

       [icna_volunteer office="Austin Office"]

   If that ever silently shows "no events" for no clear reason, use the
   office's UUID instead — it has no spaces, so no editor can mangle it:

       [icna_volunteer office_id="11ff816d-bb32-4d1e-8f6d-9fd6cb4b6d03"]

   Find the UUID by visiting `{portal-url}/api/volunteer/events` in a
   browser, or via `select id, field_office from b2s_offices;` in Supabase.

## How staff see who signed up

- **In the portal:** `/volunteer` → click an event → click directly on a
  slot row (not "Delete") to expand it and see every signup: name,
  email, phone, quantity, notes, source.
- **CSV export:** admins get an "Export Signups (CSV)" button on the
  `/volunteer` list page — one spreadsheet across every office/event/slot.

## Notes on current behavior

- Overbooking is blocked by a Postgres trigger that locks the slot row
  on insert — two people can't take the last spot at the same instant.
- The WordPress plugin caches its events listing for 5 minutes to avoid
  hammering your API, but clears that cache immediately after every
  successful signup, so spot counts don't go stale after someone signs up.
- The WordPress widget is styled (green/amber, dot-based spot counters,
  a "Full" ribbon on filled slots) rather than plain boxes — no extra
  setup needed, it's baked into the plugin's own CSS.
- Not built yet: employee-facing edit/cancel of a signup, email
  confirmations on signup, and a `program_director` RLS policy for
  volunteer data (easy to add later, mirrors the B2S/FATE/DRS pattern).
