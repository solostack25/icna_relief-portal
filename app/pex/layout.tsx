import Link from "next/link";
import { redirect } from "next/navigation";
import PortalHeader from "@/app/PortalHeader";
import GmNav, { type NavItem } from "@/components/grantManagement/GmNav";
import { createClient } from "@/lib/supabase/server";
import { getPexViewer, pexAdmin } from "@/lib/pex/access";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import { isDemoUrl } from "@/lib/pex/demo";

export const dynamic = "force-dynamic";

// PEX - organization-wide card spending. Finance / PEX admins see every
// card; cardholders see their own. Coding grant-card spending to grants
// happens in Grant Management.
export default async function PexLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const viewer = await getPexViewer();
  const db = pexAdmin();
  const { count: myCards } = viewer ? await db.from("pex_cards").select("id", { count: "exact", head: true }).eq("employee_id", viewer.employeeId) : { count: 0 };

  if (!viewer || (!viewer.isAdmin && !myCards)) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
        <PortalHeader />
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 28, margin: 0 }}>PEX cards</h1>
          <p className="text-sm mt-3" style={{ color: "rgba(22,48,43,0.6)" }}>
            You don&apos;t have a PEX card linked to your portal account. If you have one, ask Finance to link it.
          </p>
          <Link href="/select-app" className="inline-block mt-6 text-sm font-semibold" style={{ color: "#1F6F54" }}>
            ← Back to portal home
          </Link>
        </div>
      </main>
    );
  }

  const demo = isDemoUrl(await getIntegrationSetting("pex_api_url", process.env.PEX_API_URL));
  const items: NavItem[] = viewer.isAdmin
    ? [
        { href: "/pex", label: "Dashboard", exact: true },
        { href: "/pex/transactions", label: "Transactions" },
        { href: "/pex/cards", label: "Cards" },
        { href: "/pex/connection", label: "Connection & sync" },
      ]
    : [
        { href: "/pex", label: "My card", exact: true },
        { href: "/pex/transactions", label: "My transactions" },
      ];

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader subtitle={`${viewer.name} · ${viewer.isAdmin ? "PEX admin" : "Cardholder"}`} />
      <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 pb-16">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <Link href="/select-app" className="text-xs" style={{ color: "rgba(22,48,43,0.45)" }}>
            ← Portal home
          </Link>
          {(viewer.isGrantManager || viewer.isAdmin) && (
            <Link href="/grant-management/pex" className="text-xs font-semibold" style={{ color: "#1F6F54" }}>
              Grant coding in Grant Management →
            </Link>
          )}
        </div>
        {demo && (
          <div className="mb-4 rounded-xl px-4 py-2.5 text-sm" style={{ background: "#C99A3D14", border: "1px solid #C99A3D55", color: "#16302B" }}>
            <b>Demo mode:</b> these PEX cards and transactions are fake, for trying things out.{" "}
            {viewer.isAdmin && (
              <Link href="/pex/connection" className="font-bold" style={{ color: "#1F6F54" }}>
                Manage demo →
              </Link>
            )}
          </div>
        )}
        <GmNav items={items} />
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
