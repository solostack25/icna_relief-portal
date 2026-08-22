import Link from "next/link";
import PortalHeader from "@/app/PortalHeader";

// /marketing/* pages (Campaigns, Contacts, Segments, Sequences, SMS,
// Donor Calling, Flier Builder, etc.) are linked FROM the admin
// sidebar's "Marketing & Content" section, but live at their own
// top-level URLs — Next.js layouts only wrap their own route segment,
// so navigating here leaves the persistent /admin sidebar behind
// entirely (same situation as /helpdesk, /workboards before those were
// moved under /admin/*). Until now these pages had no PortalHeader
// (no logo/logout) and no way back except the browser's back button.
// Each page keeps its own max-w-* container for its content — this
// layout only adds the header and a single back link above it.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="px-4 sm:px-10 pt-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          ← Back to Admin Portal
        </Link>
      </div>
      {children}
    </main>
  );
}
