import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getSpeakerViewer, canViewRequest } from "@/lib/speakerRequestAccess";
import { fulfillSpeakerRequest, resendPendingApprovals, logEvent } from "@/lib/speakerRequests";

export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getSpeakerViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();

  const { data: request } = await admin.from("speaker_requests").select("*").eq("id", id).maybeSingle();
  if (!request || !(await canViewRequest(viewer, request))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data: approvals }, { data: events }, { data: office }, { data: ticket }] = await Promise.all([
    admin
      .from("speaker_request_approvals")
      .select("id, gate, approver_name, approver_email, approver_role, decision, notes, decided_at, created_at, approval_token")
      .eq("request_id", id)
      .order("created_at"),
    admin.from("speaker_request_events").select("id, kind, message, ok, created_at").eq("request_id", id).order("created_at"),
    request.office_id ? admin.from("b2s_offices").select("field_office, state").eq("id", request.office_id).maybeSingle() : Promise.resolve({ data: null }),
    request.finance_ticket_id
      ? admin.from("finance_tickets").select("id, ticket_number, status, total").eq("id", request.finance_ticket_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Only expose a decision token to the person it belongs to.
  const me = viewer.email.toLowerCase();
  const safeApprovals = (approvals ?? []).map((a: { approver_email: string; approval_token: string; decision: string }) => ({
    ...a,
    approval_token: a.approver_email.toLowerCase() === me && a.decision === "pending" ? a.approval_token : null,
  }));

  const { speaker_portal_token, agreement_signed_ip, ...rest } = request;
  const isOwnerOrStaff = viewer.isAdmin || viewer.canManageFinance || request.coordinator_id === viewer.employeeId;

  return NextResponse.json({
    request: { ...rest, speaker_portal_url: isOwnerOrStaff ? `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")}/speaker-portal/${speaker_portal_token}` : null },
    approvals: safeApprovals,
    events: events ?? [],
    office,
    financeTicket: ticket,
    viewer: { isCoordinator: request.coordinator_id === viewer.employeeId, isAdmin: viewer.isAdmin, canManageFinance: viewer.canManageFinance },
  });
}

// POST { action: "cancel" | "resend" | "retry" }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getSpeakerViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: request } = await admin.from("speaker_requests").select("id, status, coordinator_id, area_manager_email, finance_ticket_id").eq("id", id).maybeSingle();
  if (!request || !(await canViewRequest(viewer, request))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isCoordinator = request.coordinator_id === viewer.employeeId;
  const isStaff = viewer.isAdmin || viewer.canManageFinance;
  const { action } = await req.json();

  try {
    if (action === "cancel") {
      if (!isCoordinator && !viewer.isAdmin) return NextResponse.json({ error: "Only the coordinator can cancel." }, { status: 403 });
      if (request.status !== "pending_am" && request.status !== "pending_leadership") {
        return NextResponse.json({ error: "Only pending requests can be cancelled. For an approved request, contact Finance about the honorarium ticket." }, { status: 400 });
      }
      const { data: cancelled } = await admin
        .from("speaker_requests")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", id)
        .in("status", ["pending_am", "pending_leadership"])
        .select("id")
        .maybeSingle();
      if (!cancelled) return NextResponse.json({ error: "This request was just decided, so it can't be cancelled." }, { status: 409 });
      await admin.from("speaker_request_approvals").update({ decision: "superseded" }).eq("request_id", id).eq("decision", "pending");
      await logEvent(id, "cancelled", `Cancelled by ${viewer.name}.`);
      return NextResponse.json({ ok: true });
    }
    if (action === "resend") {
      if (!isCoordinator && !isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (request.status !== "pending_am" && request.status !== "pending_leadership") return NextResponse.json({ error: "Nothing is pending." }, { status: 400 });
      const result = await resendPendingApprovals(id);
      return NextResponse.json({ ok: true, result });
    }
    if (action === "retry") {
      if (!isCoordinator && !isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (request.status !== "approved") return NextResponse.json({ error: "Only approved requests run automation." }, { status: 400 });
      await logEvent(id, "retry", `Automation re-run requested by ${viewer.name}.`);
      await fulfillSpeakerRequest(id);
      return NextResponse.json({ ok: true });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 500 });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
