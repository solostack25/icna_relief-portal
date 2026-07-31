# Install — ICNA Volunteer Signups

Everything here is meant to be merged straight into your existing portal
repo (the same one with /fate, /drs, /b2s, /admin). Nothing here creates
a new project.

## Step 1 — Copy files (additive, nothing existing gets touched)

Copy these two folders from this package into your portal's repo root,
keeping the exact same paths:

    app/volunteer/...
    app/api/volunteer/...

These are brand new files/folders — they will not collide with anything
you already have.

## Step 2 — Patch middleware.ts (the one file that changes)

Your existing `lib/supabase/middleware.ts` redirects any logged-out
visitor to "/". That would block the public signup page and the
WordPress plugin's fetches. Apply the fix one of two ways:

**Option A — apply the patch (fastest, if your file hasn't diverged):**

    cd your-portal-repo
    git apply middleware.patch

**Option B — copy the whole file over (safe, always works):**

    cp lib/supabase/middleware.ts  your-portal-repo/lib/supabase/middleware.ts

Either way, the only functional change is: `/volunteer/public/*` is now
allowed without login, same as `/` and `/api/*` already were.

## Step 3 — Database

Already done — you ran `supabase/volunteer_migration.sql` earlier.
Nothing to do. (Included here again only for your records.)

## Step 4 — Register the app + grant access

Run in Supabase SQL editor:

    insert into app_registry (slug, display_name, route, icon, is_active, sort_order)
    values ('volunteer', 'Volunteer Signups', '/volunteer', null, true,
            (select coalesce(max(sort_order), 0) + 1 from app_registry));

Then give staff access the same way you do for B2S/FATE/DRS — one row
per employee in `employee_program_access` with `program_slug = 'volunteer'`
(admins see it automatically, no row needed).

## Step 5 — Deploy

Push/deploy the portal like normal. Note its live URL — you need it next.

## Step 6 — WordPress

1. Zip `wordpress-plugin/icna-volunteer-signups.php` into its own folder
   (WordPress expects a folder, not a loose file) — or use a
   "single file plugin" upload tool if your host supports it.
2. Upload + Activate in WordPress admin.
3. Go to **Settings → ICNA Volunteer**, paste your portal's live URL.
4. On any office page, add the shortcode:

       [icna_volunteer office="Dallas Office"]

   (must match `b2s_offices.field_office` exactly) or for a single event:

       [icna_volunteer slug="the-events-slug-from-its-public-link"]

## That's it

Staff create events at `/volunteer` in the portal → publish → they
appear both at `/volunteer/public/[slug]` and on any WordPress page with
the shortcode, with live spot counts on both.
