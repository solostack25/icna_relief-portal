import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function requireAccess(supabase: Awaited<ReturnType<typeof createClient>>, fundraiserId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: me } = await supabase
    .from("employees")
    .select("id, role, assigned_office_id, is_cio")
    .eq("auth_user_id", user.id)
    .single();
  if (!me) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  const { data: fundraiser } = await supabase
    .from("fundraisers")
    .select("*")
    .eq("id", fundraiserId)
    .single();
  if (!fundraiser) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };

  if (me.role !== "admin" && fundraiser.office_id !== me.assigned_office_id) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { me, fundraiser };
}

// Staff-only detail read — for the portal manage screen. (Public reads
// of published fundraisers go through /api/fundraisers, not this route.)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const result = await requireAccess(supabase, id);
  if ("error" in result) return result.error;

  const { data: totals } = await supabase
    .from("fundraiser_totals")
    .select("raised_amount, donation_count")
    .eq("fundraiser_id", id)
    .maybeSingle();

  return NextResponse.json({
    fundraiser: { ...result.fundraiser, raised_amount: totals?.raised_amount ?? 0, donation_count: totals?.donation_count ?? 0 },
  });
}

// Publish/unpublish and simple field edits. Restricted to admin/CIO since
// is_published is now controlled by the approval workflow, not staff.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const result = await requireAccess(supabase, id);
  if ("error" in result) return result.error;

  if (!(result.me.role === "admin" || (result.me as any).is_cio)) {
    return NextResponse.json({ error: "Only a designated approver can change publish status" }, { status: 403 });
  }

  const body = await request.json();
  const allowed = ["is_published"] as const;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  if (update.is_published === true && result.fundraiser.approval_status !== "approved") {
    return NextResponse.json({ error: "Can't publish a fundraiser that hasn't been approved yet." }, { status: 400 });
  }

  const { error } = await supabase.from("fundraisers").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const result = await requireAccess(supabase, id);
  if ("error" in result) return result.error;

  if (!(result.me.role === "admin" || (result.me as any).is_cio)) {
    return NextResponse.json({ error: "Only a designated approver can unpublish a live fundraiser" }, { status: 403 });
  }

  // Soft-delete pattern to match CharityStack's own "Returns 410 Gone"
  // behavior — unpublish rather than hard-delete, so historical
  // donation_events rows keep a valid fundraiser_id to join against.
  const { error } = await supabase
    .from("fundraisers")
    .update({ is_published: false })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
