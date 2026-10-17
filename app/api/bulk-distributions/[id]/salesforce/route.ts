import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BULK_PROGRAM_SLUG } from "@/lib/bulkDistributions";

export const dynamic = "force-dynamic";

// POST /api/bulk-distributions/<id>/salesforce
//
// Push one bulk distribution (Refugee Services or Hunger Prevention) to
// ICNA's Salesforce. The button and sync columns (salesforce_synced /
// _record_id / _synced_at / _error) are in place; the object + field
// mapping gets wired once the Bulk Distribution objects are confirmed via
// /api/admin/salesforce/discover?q=bulk.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  // RLS limits this to admins and staff of the distribution's office.
  const { data: row } = await supabase
    .from("bulk_distributions")
    .select("id, program, salesforce_synced, salesforce_record_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: me } = await supabase.from("employees").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  if (me?.role !== "admin") {
    const slug = BULK_PROGRAM_SLUG[row.program];
    const { data: access } = slug
      ? await supabase
          .from("employee_program_access")
          .select("program_slug")
          .eq("employee_id", me?.id ?? "")
          .eq("program_slug", slug)
          .maybeSingle()
      : { data: null };
    if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (row.salesforce_synced) {
    return NextResponse.json({ ok: true, already: true, salesforceRecordId: row.salesforce_record_id });
  }

  return NextResponse.json({ error: "Salesforce push for bulk distributions isn't connected yet." }, { status: 501 });
}
