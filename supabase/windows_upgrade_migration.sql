-- Windows 11 Pro upgrade program.
--
-- it_devices.windows_*      edition per device (Intune SKU where managed,
--                           or what the employee/IT reported on the PC)
-- win_license_keys          purchased keys, AES-256-GCM encrypted by the
--                           app; only the last 5 characters are stored in
--                           the clear for display
-- win_upgrades              one upgrade per PC: plan -> key assigned ->
--                           upgraded to Pro -> joined to Entra/Intune ->
--                           confirmed complete by the device sync
-- win_upgrade_audit         every key reveal, assignment and status change
--
-- RLS on with no policies everywhere: server routes only.

alter table public.it_devices
  add column if not exists windows_edition text,      -- Home | Pro | Enterprise | Education | Pro Education | Pro for Workstations | Enterprise LTSC | Unknown
  add column if not exists windows_sku int,
  add column if not exists edition_source text,       -- intune | reported
  add column if not exists edition_checked_at timestamptz;

create table if not exists public.win_license_keys (
  id uuid primary key default gen_random_uuid(),
  product text not null default 'Windows 11 Pro',
  license_type text not null check (license_type in ('retail', 'csp_perpetual', 'oem', 'mak')),
  key_enc text not null,
  key_last5 text not null,
  key_hash text not null unique,                     -- sha256 of the normalized key, prevents duplicates
  activations_total int not null default 1,          -- MAK keys cover many devices; retail/CSP = 1
  activations_used int not null default 0,
  status text not null default 'available' check (status in ('available', 'exhausted', 'revoked')),
  purchase_ref text,                                 -- PO / invoice / reseller order
  notes text,
  added_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);
alter table public.win_license_keys enable row level security;

create table if not exists public.win_upgrades (
  id uuid primary key default gen_random_uuid(),
  device_key text not null,
  device_name text,
  serial_number text,
  employee_id uuid references public.employees(id) on delete set null,
  office_id uuid,
  key_id uuid references public.win_license_keys(id),
  status text not null default 'planned' check (status in ('planned', 'key_assigned', 'upgraded', 'joined', 'complete', 'blocked', 'cancelled')),
  reported_edition text,
  joined_device_key text,                            -- the NEW Entra-joined device record once joined
  blocked_reason text,
  steps jsonb not null default '{}'::jsonb,          -- {key_revealed_at, upgraded_at, joined_at, ...}
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index if not exists win_upgrades_one_open on public.win_upgrades (device_key) where status not in ('complete', 'cancelled');
create index if not exists win_upgrades_employee on public.win_upgrades (employee_id);
create index if not exists win_upgrades_status on public.win_upgrades (status);
alter table public.win_upgrades enable row level security;

create table if not exists public.win_upgrade_audit (
  id uuid primary key default gen_random_uuid(),
  upgrade_id uuid references public.win_upgrades(id) on delete set null,
  key_id uuid references public.win_license_keys(id) on delete set null,
  actor_id uuid references public.employees(id),
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists win_upgrade_audit_created on public.win_upgrade_audit (created_at desc);
alter table public.win_upgrade_audit enable row level security;

-- Assistant help article pointing staff at the self-service wizard.
insert into public.helpdesk_kb_articles (title, category, symptoms, steps, escalate_when, ticket_category) values
('Upgrade my PC to Windows 11 Pro / sign in with my work account', 'device',
 'windows home, upgrade to pro, windows 11 pro, product key, can''t sign in to windows with work account, local account, join entra, join azure ad, access work or school, upgrade my computer, need pro',
 E'Open the Upgrade my PC page in the portal ON the computer you''re upgrading: /devices/upgrade\nStep 1: it asks what Windows edition you have (Settings > System > About > Edition).\nStep 2 (Home only): click Get my product key, then Settings > System > Activation > Change product key, paste it, and let the PC restart.\nStep 3: Settings > Accounts > Access work or school > Connect > Join this device to Microsoft Entra ID, sign in with your ICNA Relief email, restart, and sign in as your work account.\nSave your files to OneDrive first - signing in with the work account starts a fresh Windows profile.\nStep 4: press Check now on the page; it can take up to an hour to confirm.',
 'The key isn''t accepted, there''s no Join link, or it''s not confirmed after an hour - press I''m stuck on the page (it opens a ticket automatically).', 'Windows Upgrade');

-- Most device owners haven't signed into the portal yet (no employees
-- row), so upgrades are also tracked by the owner's sign-in email.
alter table public.win_upgrades add column if not exists owner_upn text;
create index if not exists win_upgrades_owner_upn on public.win_upgrades (lower(owner_upn));
