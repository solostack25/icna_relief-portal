import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getDeviceViewer } from "@/lib/devices/access";

// IT-only CRUD for the Portal Assistant's troubleshooting playbooks.
export async function POST(req: Request) {
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const row = {
    title: String(b.title ?? "").trim(),
    category: String(b.category ?? "general").trim(),
    symptoms: String(b.symptoms ?? "").trim(),
    steps: String(b.steps ?? "").trim(),
    escalate_when: String(b.escalateWhen ?? "").trim() || null,
    ticket_category: String(b.ticketCategory ?? "").trim() || null,
    is_published: b.isPublished !== false,
    updated_by: viewer.employeeId,
    updated_at: new Date().toISOString(),
  };
  if (!row.title || !row.symptoms || !row.steps) return NextResponse.json({ error: "Title, symptoms and steps are required." }, { status: 400 });
  const admin = createAdminClient();
  const q = b.id ? admin.from("helpdesk_kb_articles").update(row).eq("id", b.id) : admin.from("helpdesk_kb_articles").insert(row);
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await createAdminClient().from("helpdesk_kb_articles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
