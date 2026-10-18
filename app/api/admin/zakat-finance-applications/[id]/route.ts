import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { IRFAS_PROGRAMS } from "@/lib/irfas";

// Finance queue updates on one approved application.
//   { amount_approved }                          adjust the approved amount
//   { program }                                  set/fix the program
//   { funding_source, grant_id? }                community or grant (+ which grant)
//   { check_number }                             mark paid (needs program + funding set)
//   { void: true, void_reason }                  void an approved/paid application
//   { unvoid: true }                             undo a void
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("employees").select("id, role, is_zakat_finance").eq("auth_user_id", user.id).single();
  if (!me || (me.role !== "admin" && !me.is_zakat_finance)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const { data: current } = await supabase
    .from("zakat_applications")
    .select("id, status, program, funding_source, grant_id, voided_at")
    .eq("id", id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  if (current.status !== "approved" && current.status !== "paid") {
    return NextResponse.json({ error: "Only approved or paid applications can be changed here" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.void) {
    const reason = String(body.void_reason ?? "").trim();
    if (!reason) return NextResponse.json({ error: "Give a reason for voiding" }, { status: 400 });
    updates.voided_at = new Date().toISOString();
    updates.voided_by = me.id;
    updates.void_reason = reason.slice(0, 300);
  } else if (body.unvoid) {
    updates.voided_at = null;
    updates.voided_by = null;
    updates.void_reason = null;
  } else {
    if (current.voided_at) return NextResponse.json({ error: "This application is voided — undo the void first" }, { status: 400 });

    if (body.amount_approved !== undefined) {
      const amt = Number(body.amount_approved);
      if (!(amt >= 0)) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
      updates.amount_approved = amt;
    }

    if (body.program !== undefined) {
      if (!(IRFAS_PROGRAMS as readonly string[]).includes(body.program)) {
        return NextResponse.json({ error: "Unknown program" }, { status: 400 });
      }
      updates.program = body.program;
    }

    if (body.funding_source !== undefined) {
      if (body.funding_source !== "community" && body.funding_source !== "grant") {
        return NextResponse.json({ error: "Funding source must be community or grant" }, { status: 400 });
      }
      updates.funding_source = body.funding_source;
      updates.funding_set_by = me.id;
      if (body.funding_source === "community") {
        updates.grant_id = null;
      } else {
        if (!body.grant_id) return NextResponse.json({ error: "Choose which grant pays for this" }, { status: 400 });
        const { data: grant } = await supabase.from("grants").select("id").eq("id", body.grant_id).eq("stream", "grant").maybeSingle();
        if (!grant) return NextResponse.json({ error: "Grant not found" }, { status: 400 });
        updates.grant_id = grant.id;
      }
    }

    if (body.check_number !== undefined) {
      const check = String(body.check_number).trim();
      if (!check) return NextResponse.json({ error: "Enter the check number" }, { status: 400 });
      const program = (updates.program as string | undefined) ?? current.program;
      const funding = (updates.funding_source as string | undefined) ?? current.funding_source;
      if (!program) return NextResponse.json({ error: "Set the program before marking paid" }, { status: 400 });
      if (!funding) return NextResponse.json({ error: "Set grant or community funding before marking paid" }, { status: 400 });
      updates.check_number = check.slice(0, 40);
      updates.status = "paid";
      updates.paid_at = new Date().toISOString();
      updates.paid_by = me.id;
    }
  }

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase.from("zakat_applications").update(updates).eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "You don't have permission to update this application" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
