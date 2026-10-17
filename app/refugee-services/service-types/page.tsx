import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRefugeeServicesAccess } from "@/lib/refugeeServicesAccess";
import ServiceTypesEditor from "./ServiceTypesEditor";

export const dynamic = "force-dynamic";

export default async function RsceServiceTypesPage() {
  const access = await getRefugeeServicesAccess();
  if (!access.ok) redirect(access.status === 401 ? "/" : "/select-app");
  if (!access.isAdmin) redirect("/refugee-services");

  const supabase = await createClient();
  const { data: types } = await supabase
    .from("rsce_service_types")
    .select("id, name, category, default_value, is_active, sort_order")
    .order("sort_order")
    .order("name");

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Service types &amp; values</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              The list staff pick from when logging a Refugee Services service. A default value pre-fills the dollar
              amount; staff can still change it. Renaming a type doesn't change services already logged.
            </p>
          </div>
          <Link href="/refugee-services" className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] shrink-0">
            ← Back
          </Link>
        </div>
        <ServiceTypesEditor
          initial={(types ?? []).map((t) => ({ ...t, default_value: t.default_value === null ? null : Number(t.default_value) }))}
        />
      </div>
    </main>
  );
}
