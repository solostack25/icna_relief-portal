import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireCopilotAuth, lookupEmployeeByEmail } from "@/lib/copilotAuth";
import { startHardwareApproval } from "@/lib/helpdeskHardware";

const VALID_DEPARTMENTS = ["it", "hr", "marketing", "finance"];
const VALID_PRIORITIES = ["low", "normal", "high", "urgent"];

export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const { requesterEmail, title, description, department, priority, category } = body as {
    requesterEmail: string;
    title: string;
    description?: string;
    department: string;
    priority?: string;
    category?: string;
  };

  if (!requesterEmail?.trim() || !title?.trim() || !department) {
    return NextResponse.json({ error: "requesterEmail, title, and department are required" }, { status: 400 });
  }
  if (!VALID_DEPARTMENTS.includes(department)) {
    return NextResponse.json({ error: `department must be one of: ${VALID_DEPARTMENTS.join(", ")}` }, { status: 400 });
  }
  const resolvedPriority = priority && VALID_PRIORITIES.includes(priority) ? priority : "normal";

  const requester = await lookupEmployeeByEmail(requesterEmail);
  if (!requester) {
    return NextResponse.json({ error: `No employee found with email ${requesterEmail}` }, { status: 404 });
  }

  const admin = createAdminClient();

  const { data: request, error: requestError } = await admin
    .from("helpdesk_requests")
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      submitted_by: `${requester.first_name} ${requester.last_name}`,
      submitted_by_email: requester.email,
      overall_status: "open",
    })
    .select("id")
    .single();

  if (requestError || !request) {
    return NextResponse.json({ error: requestError?.message ?? "Could not create ticket" }, { status: 500 });
  }

  const { data: leg, error: legError } = await admin
    .from("helpdesk_request_legs")
    .insert({
      request_id: request.id,
      department,
      status: "open",
      priority: resolvedPriority,
      category: category?.trim() || null,
    })
    .select("*")
    .single();

  if (legError || !leg) {
    return NextResponse.json({ error: legError?.message ?? "Could not create ticket" }, { status: 500 });
  }

  // Hardware purchases need supervisor + CIO/CSO approval first (the
  // database gates the leg; this sends the first approval email).
  let approvalNote = "";
  if (leg.hardware_gate) {
    await startHardwareApproval(leg.id).catch(() => null);
    approvalNote = " It needs approval from their supervisor, then the CIO and CSO, before IT can purchase anything.";
  }

  return NextResponse.json({
    ticketId: request.id,
    message: `Ticket created: "${title}" routed to ${department.toUpperCase()}, priority ${resolvedPriority}.${approvalNote}`,
  });
}
