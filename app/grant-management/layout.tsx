import Link from "next/link";
import { redirect } from "next/navigation";
import PortalHeader from "@/app/PortalHeader";
import GmNav, { type NavItem } from "@/components/grantManagement/GmNav";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/grantManagement/server";
import { getGmViewer, visibleGrantIds } from "@/lib/grantManagement/server";
import { GM_ROLE_LABELS } from "@/lib/grantManagement/shared";

export const dynamic = "force-dynamic";

export default async function GrantManagementLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const viewer = await getGmViewer();
  if (!viewer) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
        <PortalHeader />
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 28, margin: 0 }}>Grant Management</h1>
          <p className="text-sm mt-3" style={{ color: "rgba(22,48,43,0.6)" }}>
            You aren&apos;t set up in Grant Management yet. Ask the Grant Management team to add you to your office&apos;s grants.
          </p>
          <Link href="/select-app" className="inline-block mt-6 text-sm font-semibold" style={{ color: "#1F6F54" }}>
            ← Back to portal home
          </Link>
        </div>
      </main>
    );
  }

  // Badges: approvals waiting on me, PEX transactions waiting to be coded.
  const admin = createAdminClient();
  const ids = await visibleGrantIds(viewer, admin);
  const canApprove = viewer.isManager || viewer.role === "approver";
  let approvals = 0;
  if (canApprove && (ids === null || ids.length)) {
    let q = admin.from("gm_expenses").select("id", { count: "exact", head: true }).eq("status", "submitted").neq("created_by", viewer.employeeId);
    if (ids) q = q.in("grant_id", ids);
    approvals = (await q).count ?? 0;
  }
  let pexQ = admin.from("gm_pex_transactions").select("id", { count: "exact", head: true }).in("status", ["unmatched", "partial"]).eq("is_pending", false);
  if (!viewer.isManager) pexQ = pexQ.eq("employee_id", viewer.employeeId);
  const pex = (await pexQ).count ?? 0;
  const { count: returned } = await admin.from("gm_expenses").select("id", { count: "exact", head: true }).eq("created_by", viewer.employeeId).eq("status", "returned");

  const base = "/grant-management";
  const items: NavItem[] = [
    { href: base, label: "Dashboard", exact: true },
    { href: `${base}/tracker`, label: viewer.isManager ? "Master Tracker" : "Grants" },
    { href: `${base}/expenses`, label: "Expenses", badge: returned ?? 0 },
    ...(canApprove ? [{ href: `${base}/approvals`, label: "Approvals", badge: approvals }] : []),
    ...(pex || viewer.isManager ? [{ href: `${base}/pex`, label: "PEX", badge: pex }] : []),
    ...(viewer.isManager ? [{ href: `${base}/import`, label: "Bulk upload" }] : []),
    { href: `${base}/reports`, label: "Reports" },
    ...(viewer.isManager ? [{ href: `${base}/settings`, label: "Settings" }] : []),
  ];

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <div className="print:hidden">
        <PortalHeader subtitle={`${viewer.name} · ${GM_ROLE_LABELS[viewer.role]}`} />
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 pb-16">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 print:hidden">
          <Link href="/select-app" className="text-xs" style={{ color: "rgba(22,48,43,0.45)" }}>
            ← Portal home
          </Link>
          <Link
            href={`${base}/expenses/new`}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold"
            style={{ background: "#1F6F54", color: "#fff", boxShadow: "0 3px 10px rgba(31,111,84,0.3)" }}
          >
            + Add expense
          </Link>
        </div>
        <GmNav items={items} />
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
