import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getInkindAccess } from "@/lib/inkind/access";
import { listInkindOffices } from "@/lib/inkind/offices";

export const dynamic = "force-dynamic";

// Food bank profiles per office (Admin → InKind → Food Banks).
//   GET   profiles + what the editor needs (offices, Grant Management
//         grants with their budget lines, employees for the ticket requestor)
//   POST  create / update one profile
// Admins edit any office; other in-kind admins only their own office.
export async function GET() {
  const access = await getInkindAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });
  const admin = createAdminClient();

  const offices = (await listInkindOffices()).filter((o) => access.isAdmin || o.id === access.assignedOfficeId);
  const officeIds = offices.map((o) => o.id);

  const [{ data: profiles }, { data: grants }, { data: employees }] = await Promise.all([
    admin.from("inkind_food_banks").select("*").in("office_id", officeIds.length ? officeIds : ["00000000-0000-0000-0000-000000000000"]).order("name"),
    admin.from("gm_grants").select("id, code, name, office_id, status, gm_budget_lines(id, category, subcategory, is_active, sort_order)").in("status", ["draft", "active", "on_hold"]).order("code"),
    admin.from("employees").select("id, first_name, last_name, assigned_office_id, email").eq("is_active", true).order("first_name"),
  ]);

  return NextResponse.json({
    canEditAll: access.isAdmin,
    offices: offices.map((o) => ({ id: o.id, name: o.name, state: o.state })),
    profiles: profiles ?? [],
    grants: ((grants ?? []) as any[]).map((g) => ({
      id: g.id,
      code: g.code,
      name: g.name,
      office_id: g.office_id,
      status: g.status,
      lines: ((g.gm_budget_lines ?? []) as any[])
        .filter((l) => l.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((l) => ({ id: l.id, label: l.subcategory ? `${l.category} › ${l.subcategory}` : l.category })),
    })),
    employees: ((employees ?? []) as any[]).map((e) => ({
      id: e.id,
      name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || e.email,
      office_id: e.assigned_office_id,
    })),
  });
}

export async function POST(req: Request) {
  const access = await getInkindAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const officeId = typeof b.office_id === "string" ? b.office_id : "";
  if (!officeId) return NextResponse.json({ error: "Pick an office" }, { status: 400 });
  if (!access.isAdmin && officeId !== access.assignedOfficeId) return NextResponse.json({ error: "You can only edit your own office" }, { status: 403 });

  const name = typeof b.name === "string" ? b.name.trim().slice(0, 150) : "";
  if (!name) return NextResponse.json({ error: "Name the food bank" }, { status: 400 });

  const aliases = (Array.isArray(b.aliases) ? b.aliases : [])
    .map((a: unknown) => String(a).trim().slice(0, 150))
    .filter(Boolean)
    .slice(0, 10);
  const mappings = (Array.isArray(b.grant_mappings) ? b.grant_mappings : [])
    .map((m: any) => ({
      ref: String(m?.ref ?? "").trim().slice(0, 60),
      gm_grant_id: typeof m?.gm_grant_id === "string" ? m.gm_grant_id : "",
      gm_line_id: typeof m?.gm_line_id === "string" && m.gm_line_id ? m.gm_line_id : null,
    }))
    .filter((m: { ref: string; gm_grant_id: string }) => m.ref && m.gm_grant_id)
    .slice(0, 20);

  const row = {
    office_id: officeId,
    name,
    aliases,
    inkind_rule: b.inkind_rule === "zero_cost_only" ? "zero_cost_only" : "all_lines",
    track_charges: !!b.track_charges,
    ticket_requestor_id: typeof b.ticket_requestor_id === "string" && b.ticket_requestor_id ? b.ticket_requestor_id : null,
    grant_mappings: mappings,
    notes: typeof b.notes === "string" ? b.notes.trim().slice(0, 1000) || null : null,
    is_active: b.is_active !== false,
    updated_by: access.employeeId,
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  if (b.id) {
    const { data: existing } = await admin.from("inkind_food_banks").select("office_id").eq("id", b.id).maybeSingle();
    if (!existing) return NextResponse.json({ error: "Food bank not found" }, { status: 404 });
    if (!access.isAdmin && existing.office_id !== access.assignedOfficeId) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const q = b.id
    ? admin.from("inkind_food_banks").update(row).eq("id", b.id).select("*").single()
    : admin.from("inkind_food_banks").insert(row).select("*").single();
  const { data, error } = await q;
  if (error) {
    const msg = error.code === "23505" ? "That office already has a food bank with this name." : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ success: true, profile: data });
}
