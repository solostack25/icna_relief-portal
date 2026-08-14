import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";
import PortalHeader from "@/app/PortalHeader";
import TemplatesListClient from "./TemplatesListClient";

export default async function FlierBuilderListPage() {
  const access = await getFlierMarketingAccess();
  if (!access.ok) redirect("/select-app");

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-3xl mx-auto px-4 sm:px-10 py-8 sm:py-10">
        <div className="flex items-center justify-between mb-2">
          <h1
            style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}
          >
            Flier Templates
          </h1>
          <div className="flex items-center gap-4">
            <Link href="/marketing/fliers/images" className="text-sm" style={{ color: "var(--portal-emerald)" }}>
              Approved Images →
            </Link>
            <Link href="/select-app" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
              ← Back
            </Link>
          </div>
        </div>
        <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
          Build templates once — lock the brand elements, mark what field offices should be able
          to fill in, and publish. Offices pick a template, fill in the editable parts, and download.
        </p>
        <TemplatesListClient />
      </div>
    </main>
  );
}
