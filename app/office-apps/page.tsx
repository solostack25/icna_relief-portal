import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Pure link-out page - the portal doesn't control real Microsoft 365
// licensing or entitlements (that's IT/manager-approved separately), so
// this isn't gated by program access. Anyone logged into the portal can
// see it; whether a given link actually gets someone into a working app
// still depends on whether IT has assigned them a license.
//
// Links verified current as of Aug 2026 - Microsoft has been mid-transition
// from office.com/microsoft365.com to the unified m365.cloud.microsoft
// domain, and deprecated the old portal.office.com/account self-install
// page in favor of m365.cloud.microsoft/apps. office.com/microsoft365.com
// auto-redirect to the new domain, so either still works, but linking
// straight to the current domain avoids an extra hop.
const WEB_APPS = [
  {
    name: "Microsoft 365 (all apps)",
    href: "https://m365.cloud.microsoft",
    blurb: "Word, Excel, PowerPoint, OneDrive, and everything else in one place",
  },
  {
    name: "Outlook",
    href: "https://outlook.office.com",
    blurb: "Email and calendar",
  },
  {
    name: "Teams",
    href: "https://teams.microsoft.com",
    blurb: "Chat, meetings, and calls",
  },
];

export default async function OfficeAppsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-semibold">Office & Apps</h1>
          <Link
            href="/select-app"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Back
          </Link>
        </div>
        <p className="text-sm text-[var(--color-text-dim)] mb-8">
          Use Microsoft 365 in your browser, or download the desktop apps to
          your computer. You're signed in with the same account either way
          (the same one you used to log into this portal) — whether an app
          actually opens for you still depends on your manager/IT having
          assigned you a license. If a link asks you to sign in again and
          nothing happens, or says you don't have access, that's an IT
          ticket, not something to keep retrying.
        </p>

        <h2 className="text-sm font-semibold mb-3 text-[var(--color-text-dim)] uppercase tracking-wide">
          Use in your browser
        </h2>
        <div className="space-y-2 mb-8">
          {WEB_APPS.map((app) => (
            <a
              key={app.href}
              href={app.href}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 hover:border-[var(--color-accent)]"
            >
              <div className="text-sm font-medium">{app.name}</div>
              <div className="text-xs text-[var(--color-text-dim)] mt-0.5">{app.blurb}</div>
            </a>
          ))}
        </div>

        <h2 className="text-sm font-semibold mb-3 text-[var(--color-text-dim)] uppercase tracking-wide">
          Download to your computer
        </h2>
        <div className="space-y-2 mb-2">
          <a
            href="https://m365.cloud.microsoft/apps"
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 hover:border-[var(--color-accent)]"
          >
            <div className="text-sm font-medium">Install Microsoft 365 apps</div>
            <div className="text-xs text-[var(--color-text-dim)] mt-0.5">
              Sign in, then use the "Install apps" menu — downloads Word,
              Excel, PowerPoint, Outlook, and Teams for Windows or Mac
            </div>
          </a>
        </div>
        <a
          href="https://support.microsoft.com/en-us/office/download-install-or-reinstall-microsoft-365-or-office-2024-on-a-pc-or-mac-4414eaaf-0478-48be-9c42-23adc4716658"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[var(--color-accent)] hover:underline"
        >
          Step-by-step install guide (Microsoft) →
        </a>

        <div className="mt-10 pt-6 border-t border-[var(--color-border)]">
          <p className="text-sm text-[var(--color-text-dim)]">
            Need a license assigned, or running into an error? Submit an IT request.
          </p>
          <Link
            href="/helpdesk/wizard"
            className="inline-block mt-2 text-sm text-[var(--color-accent)] hover:underline"
          >
            Submit a Request →
          </Link>
        </div>
      </div>
    </main>
  );
}
