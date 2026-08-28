import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { REPORT_MODULES, isDurationMetric } from "@/lib/reports/registry";
import SalesforceSyncClient from "./SalesforceSyncClient";

export default async function SalesforceSyncPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") redirect("/admin");

  const { data: offices } = await supabase.from("b2s_offices").select("id, field_office, region").eq("is_active", true).order("field_office");

  // Only office-scoped modules make sense as a sync source - a target
  // is fundamentally "this office's data, into this office's food
  // bank's org", so modules with no office concept (helpdesk, finance
  // approvals) are left out of the picker.
  const officeScopedModules = REPORT_MODULES.filter((m) => m.scope.type === "direct" || m.scope.type === "chain");

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
        Food Bank Salesforce Sync
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Push an office&apos;s data straight into their local food bank&apos;s own Salesforce org, so staff only enter it once.
        Each target needs a Connected App (Client Credentials Flow) from that food bank&apos;s Salesforce admin — nothing syncs
        until real credentials and a field mapping are filled in and the target is turned on.
      </p>
      <SalesforceSyncClient
        offices={offices ?? []}
        modules={officeScopedModules.map((m) => ({
          slug: m.slug,
          label: m.label,
          dimensions: m.dimensions.map((d) => ({ key: d.key, label: d.label, column: d.column })),
          metrics: m.metrics.filter((met) => !isDurationMetric(met)).map((met) => ({ key: met.key, label: met.label, column: met.column })),
          defaultDateColumn: m.defaultDateColumn,
        }))}
      />
    </div>
  );
}
