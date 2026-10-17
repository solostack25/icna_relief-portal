import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRefugeeServicesAccess } from "@/lib/refugeeServicesAccess";

export const dynamic = "force-dynamic";

// POST /api/refugee-services/bulk/<id>/salesforce
//
// Push one bulk distribution to ICNA's Salesforce. The button and sync
// columns (salesforce_synced / _record_id / _synced_at / _error) are in
// place; the object + field mapping is wired once the Bulk Distribution
// objects are confirmed via /api/admin/salesforce/discover?q=bulk.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getRefugeeServicesAccess();
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: access.status });

  const { id } = await params;
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("bulk_distributions")
    .select("id, salesforce_synced, salesforce_record_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.salesforce_synced) {
    return NextResponse.json({ ok: true, already: true, salesforceRecordId: row.salesforce_record_id });
  }

  return NextResponse.json(
    { error: "Salesforce push for bulk distributions isn't connected yet." },
    { status: 501 }
  );
}
