-- Portal Assistant phase 2: troubleshoot before opening a ticket.
--
-- helpdesk_kb_articles     IT-editable troubleshooting playbooks the
--                          assistant searches and walks people through.
-- helpdesk_assist_sessions one row per troubleshooting conversation:
--                          what was tried, what the diagnostics showed,
--                          and whether it was resolved or escalated -
--                          IT's deflection report reads this.
--
-- RLS on with no policies: read/written only by server routes.

create table if not exists public.helpdesk_kb_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,                 -- sign-in, email, teams, device, printer, network, onedrive, phone, software, security
  symptoms text not null,                 -- how people describe it; used for search
  steps text not null,                    -- numbered steps, one per line, written for non-technical staff
  escalate_when text,                     -- when to stop and open a ticket
  ticket_category text,                   -- category to use if it escalates
  is_published boolean not null default true,
  times_used int not null default 0,
  times_resolved int not null default 0,
  updated_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(symptoms, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(category, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(steps, '')), 'C')
  ) stored
);
create index if not exists helpdesk_kb_search on public.helpdesk_kb_articles using gin (search);
alter table public.helpdesk_kb_articles enable row level security;

create table if not exists public.helpdesk_assist_sessions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  issue text not null,
  category text,
  kb_article_ids uuid[] not null default '{}',
  steps_tried text[] not null default '{}',
  diagnostics jsonb,
  outcome text not null check (outcome in ('resolved', 'escalated', 'abandoned')),
  request_id uuid references public.helpdesk_requests(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists helpdesk_assist_sessions_created on public.helpdesk_assist_sessions (created_at desc);
alter table public.helpdesk_assist_sessions enable row level security;

-- Starter playbooks (standard Microsoft 365 / Windows steps). IT should
-- review and tailor these in Admin > IT Help Articles.
insert into public.helpdesk_kb_articles (title, category, symptoms, steps, escalate_when, ticket_category) values
('Can''t sign in / password not working', 'sign-in',
 'can''t log in, password wrong, locked out, sign in failed, forgot password, account locked, password expired',
 E'Make sure Caps Lock is off and you''re using your full email (name@icnarelief.org).\nTry signing in at office.com in a private/incognito browser window.\nIf you forgot it, reset it yourself at https://aka.ms/sspr (you''ll need your registered phone or authenticator app).\nIf it says the account is locked, wait 15 minutes, then try once more - repeated tries keep it locked.\nAfter a reset, sign in on your phone''s Outlook/Teams again with the new password.',
 'Self-service reset fails, the account shows disabled, or they have no registered method to reset with.', 'Account / Sign-in'),

('MFA / Authenticator prompts not working', 'sign-in',
 'authenticator not working, mfa, two factor, verification code, new phone, approve sign in, number matching',
 E'Open the Microsoft Authenticator app and check for a waiting request - pull down to refresh.\nType the number shown on your computer screen into the app (number matching).\nCheck your phone''s date and time are set to automatic.\nIf you got a new phone, you need IT to reset your sign-in methods - don''t keep retrying.\nIf you see an approval request you did NOT start, tap Deny and report it - someone may have your password.',
 'New phone, lost phone, no prompts arrive after refresh, or they received a sign-in request they did not start (escalate as urgent security).', 'Account / MFA'),

('Outlook not syncing or not receiving email', 'email',
 'outlook not working, no new email, emails stuck in outbox, outlook disconnected, not receiving mail, send receive',
 E'Check Outlook''s bottom bar - if it says Working Offline, go to Send/Receive and turn off Work Offline.\nOpen outlook.office.com in a browser - if mail is there, the problem is just the Outlook app.\nClose Outlook completely and reopen it.\nIf messages are stuck in the Outbox, check for a very large attachment (over 20 MB) and remove it.\nRestart the computer if it still doesn''t sync.',
 'Mail is also missing in outlook.office.com, or the mailbox is full.', 'Email'),

('Teams calls / microphone / camera not working', 'teams',
 'teams audio, can''t hear, mic not working, camera not working, teams call drops, echo, teams video',
 E'In Teams, click ... > Settings > Devices and pick the right speaker, microphone and camera.\nMake a test call from that same Devices screen.\nCheck the headset is plugged in or Bluetooth is connected, and the mute switch on the headset is off.\nClose other apps that may be using the camera (Zoom, browser tabs).\nQuit Teams fully (right-click the tray icon > Quit) and reopen it.',
 'Device not detected at all after a restart, or the headset is broken.', 'Teams'),

('Computer running slow or freezing', 'device',
 'slow computer, laptop slow, freezing, not responding, lagging, hangs, takes forever',
 E'Save your work and restart the computer (Start > Power > Restart, not Shut down).\nCheck free disk space: open File Explorer > This PC. If the C: drive bar is red, empty the Recycle Bin and Downloads folder.\nClose browser tabs you aren''t using - each one uses memory.\nRun Windows Update: Start > Settings > Windows Update > Check for updates, then restart.\nIf it''s still slow, note what you were doing when it froze.',
 'Still slow after updates and a restart, disk is nearly full and they can''t free space, or the device is older than ~5 years.', 'Hardware'),

('Printer not printing', 'printer',
 'printer not working, can''t print, print stuck, printer offline, print queue, paper jam',
 E'Check the printer is on, has paper, and shows no error or jam on its screen.\nOn your computer go to Settings > Bluetooth & devices > Printers & scanners, pick the printer and open the print queue. Cancel any stuck jobs.\nTurn the printer off for 30 seconds and back on.\nMake sure your computer is on the office Wi-Fi/network, not a hotspot.\nTry printing a simple test page.',
 'Error code on the printer, hardware fault, or no one in the office can print.', 'Printer'),

('Wi-Fi or internet not working', 'network',
 'no internet, wifi not working, can''t connect, network down, internet slow, no connection, wifi dropping, keeps disconnecting, wifi drops, internet keeps cutting out, no wifi, wireless',
 E'Check whether other people in the office have internet - if no one does, it''s the office connection.\nTurn Wi-Fi off and back on on your computer, then reconnect to the office network.\nRestart your computer.\nIf it''s just you, try your phone hotspot to confirm the laptop itself works.\nIf the whole office is down, check that the modem/router lights are on and power-cycle it (unplug 30 seconds).',
 'Whole office is down after a router restart (escalate high), or only one computer can''t connect after a restart.', 'Network'),

('OneDrive not syncing / files missing', 'onedrive',
 'onedrive not syncing, files missing, sync error, red x, sharepoint files, can''t find file',
 E'Click the OneDrive cloud icon by the clock and check for a sync error or a paused message - resume if paused.\nOpen onedrive.com or the SharePoint site in a browser - if the file is there, it''s just sync.\nCheck the Recycle Bin on onedrive.com for deleted files (kept 93 days).\nMake sure the file name has no unusual characters and the path isn''t extremely long.\nSign out and back in to OneDrive from its Settings > Account.',
 'Files are missing from the web too and not in the Recycle Bin, or sync errors persist after re-sign-in.', 'OneDrive / SharePoint'),

('Suspicious email / phishing', 'security',
 'phishing, suspicious email, clicked a link, scam email, fake email, gift card request, entered password on a link',
 E'Don''t click links, open attachments, or reply.\nIf you already clicked or entered your password, change your password right away at https://aka.ms/sspr and tell IT now.\nIn Outlook use Report > Report phishing on the message.\nNever buy gift cards or send money because of an email - call the person on a known number to confirm.',
 'Always open an urgent ticket if they clicked a link, entered their password, opened an attachment, or sent money/gift cards.', 'Security'),

('Can''t access a shared folder, site or app', 'software',
 'access denied, need access, permission, can''t open sharepoint, request access, not authorized',
 E'Check you''re signed in with your ICNA Relief account, not a personal one (top-right corner of the browser).\nIf you see a Request access button, use it - it goes to the owner of that site or file.\nAsk the person who shared it to share it again with your work email.',
 'They need access to a system IT manages (Salesforce, finance tools, an office drive) - that is an access request ticket.', 'Access Request'),

('Software install or update needed', 'software',
 'install software, need program, update software, adobe, zoom install, can''t install, admin password',
 E'Open Company Portal (Start menu) - approved apps can be installed from there without IT.\nIf the app isn''t in Company Portal, IT needs to approve it.',
 'The app is not in Company Portal or the install needs admin rights.', 'Software'),

('Phone / desk phone / 3CX not working', 'phone',
 '3cx, desk phone, phone not ringing, can''t make calls, voicemail, extension, softphone',
 E'Check the 3CX app or desk phone shows you as registered/online.\nFor the app: sign out and back in, and check your internet connection.\nFor a desk phone: unplug its network cable and power for 10 seconds and plug back in.\nCheck Do Not Disturb isn''t on.',
 'Whole office phones are down, or the phone stays unregistered after a restart.', 'Phone')
on conflict do nothing;

-- Ranked search used by the assistant (prefix-matching OR over the words
-- in the employee's description, stop words dropped).
create or replace function public.search_helpdesk_kb(q text, max_results int default 3)
returns table (id uuid, title text, category text, steps text, escalate_when text, ticket_category text, rank real)
language sql stable security definer set search_path = public as $$
  with terms as (
    select string_agg(w || ':*', ' | ') as tsq
    from regexp_split_to_table(lower(regexp_replace(coalesce(q, ''), '[^a-zA-Z0-9 ]', ' ', 'g')), '\s+') w
    where length(w) > 2 and w not in ('the','and','not','but','for','with','can','cant','wont','dont','isnt','its','my','this','that','have','from','when','what')
  )
  select a.id, a.title, a.category, a.steps, a.escalate_when, a.ticket_category,
         ts_rank(a.search, to_tsquery('english', t.tsq)) as rank
  from helpdesk_kb_articles a, terms t
  where a.is_published and t.tsq is not null and a.search @@ to_tsquery('english', t.tsq)
  order by rank desc
  limit greatest(1, least(max_results, 5));
$$;
revoke all on function public.search_helpdesk_kb(text, int) from public, anon, authenticated;
