# Security actions: setup

New response actions in **Admin → Security** (IT only: portal admins and the `helpdesk-it` grant).
Every action needs a reason and is written to the Response log.

| Where | What it does |
|---|---|
| Security → Find a person → **This account is compromised…** | Playbook: block sign-in, sign out everywhere, scramble the password, remove all sign-in methods, mark compromised in ID Protection, switch off suspicious inbox rules, optionally isolate their PCs, open an urgent IT ticket |
| Person page → Respond | Reset password (shown once), sign out everywhere, block/unblock, confirm/dismiss risk |
| Person page → Restore access / MFA | Temporary Access Pass (1 h one-use or 8 h reusable), require MFA re-registration |
| Person page → Sign-in methods | See each registered method and remove one |
| Person page → Recent sign-ins | Last 14 days, sign-ins abroad highlighted |
| Person page / Mailbox rules tab | Inbox rules that forward outside ICNA or hide/delete mail; switch off, delete, or mark fine |
| Sign-ins tab | Tenant-wide: sign-ins from outside the US, password-spray IPs, repeated failures, risky sign-ins |
| Blocked items tab | Block a file hash, URL, domain or IP on every Defender-onboarded PC |
| Device page → Respond | Restrict apps (only Microsoft-signed programs run) / lift restriction |

## 1. Run the migration

`supabase/security_actions_migration.sql` in the SQL editor (after `security_response_migration.sql`).

## 2. Grant permissions on the Portal app registration

Entra → App registrations → ICNA Relief Staff Portal → API permissions → Add → **Application** permissions, then **Grant admin consent**.

**Microsoft Graph**

| Permission | Used for |
|---|---|
| `User-PasswordProfile.ReadWrite.All` | Reset password |
| `UserAuthenticationMethod.ReadWrite.All` | List/remove sign-in methods, Temporary Access Pass |
| `MailboxSettings.ReadWrite` | Read, switch off and delete inbox rules (nightly scan + actions) |
| `AuditLog.Read.All` | Sign-in logs (already granted for the MFA report) |

**WindowsDefenderATP** (APIs my organization uses)

| Permission | Used for |
|---|---|
| `Ti.ReadWrite.All` | Blocked items (custom indicators) |
| `Machine.RestrictExecution` | Restrict apps on a PC |

## 3. Directory role for password resets

Graph also requires the app itself to hold a role to reset passwords:
Entra → Roles and administrators → **Authentication Administrator** → Add assignment → the Portal app.
(Use **Privileged Authentication Administrator** only if IT must reset *admin* passwords from the portal; that role is very powerful.)

Accounts synced from on-prem Active Directory can't have their password reset in the cloud unless **password writeback** is on in Entra Connect; the portal says so when it hits one.

## 4. Turn on what the features rely on

- **Temporary Access Pass**: Entra → Protection → Authentication methods → Temporary Access Pass → Enable for all users (or an IT-managed group). Allow one-time use and lifetimes up to 8 hours.
- **Blocking URLs, domains, IPs**: Defender portal → Settings → Endpoints → Advanced features → *Custom network indicators* on, and network protection in block mode (Intune → Endpoint security → Attack surface reduction). File hashes work without this.

## Licensing notes

- Sign-in logs need Entra ID P1 on the tenant (Business Premium, E3, E5).
- Risky users / "Mark as compromised" need Entra ID P2 (E5). Without it that step fails and the rest of the playbook still runs.
- Isolation, restrict apps and blocked items only reach PCs onboarded to Defender for Endpoint.
- Mailbox-level forwarding set by an admin in Exchange is not visible to Graph; only inbox rules are scanned.
