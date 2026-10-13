import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getSpeakerViewer, escapeLike } from "@/lib/speakerRequestAccess";

// Admin-managed Gate 2 (joint leadership) approvers for Speaker
// Requests. The region's Regional Director is added automatically on
// top of this list at routing time.
export async function GET() {
  const viewer = await getSpeakerViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!viewer.isAdmin && !viewer.canManageFinance) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = createAdminClient();
  const { data } = await admin.from("speaker_leadership_approvers").select("id, full_name, email, role_label").eq("is_active", true).order("full_name");
  const { data: rds } = await admin.from("employees").select("first_name, last_name, email, assigned_region").eq("role", "regional_director").neq("is_active", false);
  return NextResponse.json({ approvers: data ?? [], regionalDirectors: rds ?? [], canEdit: viewer.isAdmin });
}

// body: { full_name, email, role_label } to add, or { email, remove: true }
export async function POST(request: NextRequest) {
  const viewer = await getSpeakerViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!viewer.isAdmin) return NextResponse.json({ error: "Only admins can change approvers." }, { status: 403 });
  const { full_name, email, role_label, remove } = await request.json();
  if (!email || !String(email).includes("@")) return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  const admin = createAdminClient();
  if (remove) {
    const { error } = await admin.from("speaker_leadership_approvers").update({ is_active: false }).ilike("email", escapeLike(String(email)));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (!String(full_name ?? "").trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const { error } = await admin
    .from("speaker_leadership_approvers")
    .upsert({ email: String(email).trim().toLowerCase(), full_name: String(full_name).trim(), role_label: String(role_label ?? "").trim() || null, is_active: true, added_by: viewer.employeeId }, { onConflict: "email" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
