import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getResourcesUser } from "@/lib/resources/access";
import { ASSET_TITLE_SELECT, embeddedAssetTitle, friendlyDbError } from "@/lib/resources/db";
import { REQUEST_STATUSES, statusLabel } from "@/lib/resources/schema";
import { notifyResources } from "@/lib/resources/notify";

type P = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: P) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getResourcesUser(supabase);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: r } = await supabase.from("res_insurance_requests").select(`*, b2s_offices(field_office), ${ASSET_TITLE_SELECT}`).eq("id", id).maybeSingle();
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const asset = embeddedAssetTitle(r);
  const fk = r.vehicle_id ? "vehicle_id" : r.property_id ? "property_id" : "driver_id";
  const assetId = r.vehicle_id ?? r.property_id ?? r.driver_id;

  const [{ data: events }, { data: docs }, { data: assetRow }, { data: canWrite }] = await Promise.all([
    supabase.from("res_insurance_request_events").select("*").eq("request_id", id).order("at"),
    supabase.from("res_documents").select("id, title, doc_type, version, uploaded_at, expires_on").eq(fk, assetId).is("deleted_at", null).order("uploaded_at", { ascending: false }),
    supabase.from(fk === "vehicle_id" ? "res_vehicles" : fk === "property_id" ? "res_properties" : "res_drivers").select("*").eq("id", assetId).maybeSingle(),
    supabase.rpc("res_can_write_office", { p_office: r.office_id }),
  ]);

  // Names for people in the timeline and the owner picker (employees table isn't readable to everyone).
  const admin = createAdminClient();
  const actorIds = Array.from(new Set((events ?? []).map((e) => e.actor).filter(Boolean)));
  const { data: actors } = actorIds.length
    ? await admin.from("employees").select("auth_user_id, first_name, last_name").in("auth_user_id", actorIds)
    : { data: [] as any[] };
  const names = Object.fromEntries((actors ?? []).map((a: any) => [a.auth_user_id, `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim()]));
  const { data: staff } = me.canManage
    ? await admin.from("employees").select("id, first_name, last_name").neq("is_active", false).order("first_name")
    : { data: [] as any[] };
  const { data: owner } = r.owner_employee_id ? await admin.from("employees").select("first_name, last_name").eq("id", r.owner_employee_id).maybeSingle() : { data: null };

  return NextResponse.json({
    request: {
      ...r,
      asset,
      asset_row: assetRow,
      office_name: (r as any).b2s_offices?.field_office ?? "",
      owner_name: owner ? `${owner.first_name ?? ""} ${owner.last_name ?? ""}`.trim() : null,
      res_vehicles: undefined,
      res_properties: undefined,
      res_drivers: undefined,
    },
    events: (events ?? []).map((e) => ({ ...e, actor_name: e.actor ? names[e.actor] ?? "Staff" : "System" })),
    documents: docs ?? [],
    staff: (staff ?? []).map((s: any) => ({ id: s.id, name: `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() })),
    canManage: me.canManage,
    canWrite: !!canWrite,
  });
}

export async function PATCH(request: NextRequest, { params }: P) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getResourcesUser(supabase);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as Record<string, any>;
  const { data: before } = await supabase.from("res_insurance_requests").select(`*, ${ASSET_TITLE_SELECT}`).eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const s = (v: unknown) => (typeof v === "string" ? v.trim() || null : v ?? null);
  const patch: Record<string, unknown> = {};
  if (b.status !== undefined) {
    if (!REQUEST_STATUSES.some((x) => x.value === b.status)) return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    patch.status = b.status;
  }
  for (const k of ["carrier_name", "carrier_reference", "requested_effective_date", "notes"]) if (b[k] !== undefined) patch[k] = s(b[k]);
  if (b.owner_employee_id !== undefined && me.canManage) patch.owner_employee_id = s(b.owner_employee_id);

  const fieldChanges = Object.keys(patch).filter((k) => k !== "status" && String(patch[k] ?? "") !== String((before as any)[k] ?? ""));
  const statusChanged = patch.status !== undefined && patch.status !== before.status;
  if (fieldChanges.length || statusChanged) {
    const { error } = await supabase.from("res_insurance_requests").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });
  }
  if (fieldChanges.length) {
    await supabase.from("res_insurance_request_events").insert({
      request_id: id,
      kind: "update",
      body: `Updated ${fieldChanges.map((k) => k.replace(/_/g, " ")).join(", ")}`,
      actor: (await supabase.auth.getUser()).data.user?.id,
    });
  }
  const comment = typeof b.comment === "string" ? b.comment.trim() : "";
  if (comment) {
    await supabase.from("res_insurance_request_events").insert({ request_id: id, kind: "comment", body: comment.slice(0, 4000), actor: (await supabase.auth.getUser()).data.user?.id });
  }

  if (statusChanged) {
    const asset = embeddedAssetTitle(before);
    let ownerEmail: string[] = [];
    const ownerId = (patch.owner_employee_id as string) ?? before.owner_employee_id;
    if (ownerId) {
      const { data: o } = await createAdminClient().from("employees").select("email").eq("id", ownerId).maybeSingle();
      if (o?.email) ownerEmail = [o.email];
    }
    await notifyResources({
      event: "request_status",
      officeId: before.office_id,
      subject: `${before.ticket_number}: ${statusLabel(before.status)} → ${statusLabel(patch.status as string)}`,
      heading: `Insurance request ${before.ticket_number} is now "${statusLabel(patch.status as string)}"`,
      rows: [
        ["Asset", asset.title],
        ["Request type", before.request_type],
        ["Status", `${statusLabel(before.status)} → ${statusLabel(patch.status as string)}`],
        ["Carrier reference", (patch.carrier_reference as string) ?? before.carrier_reference],
        ["Note", comment || null],
        ["Updated by", me.name || me.email],
      ],
      path: `/resources/requests/${id}`,
      related: { request_id: id },
      extraRecipients: ownerEmail,
    });
  }
  return NextResponse.json({ ok: true });
}
