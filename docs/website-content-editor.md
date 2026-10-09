# Website content editor (Admin > Website)

Lets the people on a short list edit what the public website says, without a code change or a deploy:
campaign copy, impact numbers, photos and the homepage video, the Zakat page, and unit costs.

## Set up (once)

1. Run `supabase/web_content_migration.sql` in the Supabase SQL editor. It is safe to run again.
   It creates `web_content`, `web_content_history`, `web_content_editors`, the public view
   `web_site_content`, and the public `web-media` storage bucket, and puts tali@icnarelief.org on the
   editors list. The last statement prints the list.
2. The public website must be running a version that has `/api/content/schema`. Until it is, the page says
   "The website didn't answer" and nothing can be changed.

`NEXT_PUBLIC_PUBLIC_WEBSITE_URL` and `OFFICES_REVALIDATE_SECRET` are the same variables the office listings
already use. No new environment variables.

## Who can edit

Only employees in `web_content_editors`. Being a portal admin is not enough, and nobody can add
themselves from the app. To add or remove someone, run in the SQL editor:

```sql
insert into web_content_editors (employee_id) select id from employees where lower(email) = 'someone@icnarelief.org';
delete from web_content_editors where employee_id = (select id from employees where lower(email) = 'someone@icnarelief.org');
```

The Website link in the admin sidebar only appears for people on the list.

## How it works

- The website describes what is editable (sections, fields, and its own built-in value for each) at
  `/api/content/schema`. This portal builds its forms from that, so **adding an editable field is a change to
  the website repo only**.
- Saving a section upserts one row in `web_content` (key = section) and asks the website to refresh, so the
  change is live at once. If the refresh call fails, the website catches up within the hour.
- The website checks every saved value before showing it (type, length, allowed photo and video hosts) and
  falls back to its built-in content for anything it refuses. The editor runs the same checks first and lists
  what would be refused.
- "Reset section" deletes the row, which puts that section back to the website's built-in content.
- Every save and reset is kept in `web_content_history`. To put back an earlier version by hand:

```sql
select id, key, saved_at from web_content_history where key = 'campaign' order by saved_at desc;
update web_content set value = (select value from web_content_history where id = <id>), updated_at = now() where key = 'campaign';
```

Then press "Open the website" after a minute, or save any section to trigger a refresh.

## Uploads

Photos (JPG, PNG, WebP, AVIF up to 10 MB) and videos (MP4 up to 50 MB) go to the public `web-media` bucket
under `site/`. Anyone with the address can view a file; only editors can add or remove files.
