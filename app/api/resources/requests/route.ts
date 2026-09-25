import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResourcesUser } from "@/lib/resources/access";
import { ASSET_TITLE_SELECT, embeddedAssetTitle, friendlyDbError, toCsv } from "@/lib/resources/db";
import { OPEN_STATUSES, statusLabel } from "@/lib/resources/schema";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const me = await getResourcesUser(supabase);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const view = request.nextUrl.searchParams.get("view") ?? "open";
  let q = supabase
    .from("res_insurance_requests")
    .select(`*, b2s_offices(field_office), ${ASSET_TITLE_SELECT}`)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (view === "open") q = q.in("status", OPEN_STATUSES);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 });
  const rows = (data ?? []).map((r: any) => ({
    ...r,
    asset: embeddedAssetTitle(r),
    office_name: r.b2s_offices?.field_office ?? "",
    res_vehicles: undefined,
    res_properties: undefined,
    res_drivers: undefined,
  }));
  if (request.nextUrl.searchParams.get("format") === "csv") {
    const flat = rows.map((r) => ({ ...r, asset_title: r.asset.title, status_label: statusLabel(r.status) }));
    const csv = toCsv(flat, [
      { key: "ticket_number", label: "Ticket" },
      { key: "office_name", label: "Office" },
      { key: "asset_title", label: "Asset" },
      { key: "request_type", label: "Type" },
      { key: "status_label", label: "Status" },
      { key: "requested_effective_date", label: "Effective date requested" },
      { key: "carrier_name", label: "Insurance company" },
      { key: "carrier_reference", label: "Carrier reference" },
      { key: "submitted_at", label: "Submitted" },
      { key: "responded_at", label: "Response" },
      { key: "bound_at", label: "Coverage confirmed" },
      { key: "created_at", label: "Created" },
    ]);
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="insurance-requests.csv"` },
    });
  }
  return NextResponse.json({ rows, canManage: me.canManage });
}
