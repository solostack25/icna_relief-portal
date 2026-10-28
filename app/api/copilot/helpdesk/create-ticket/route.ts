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
  const { requesterEmail, title, description, department, priority, category, stepsTried, diagnosticsSummary, kbArticleIds } = body as {
    requesterEmail: string;
    title: string;
    description?: string;
    department: string;
    priority?: string;
    category?: string;
    // From assistant troubleshooting (phase 2): what was already tried and
    // what the checks found, so IT doesn't repeat it.
    stepsTried?: string[];
    diagnosticsSummary?: string;
    kbArticleIds?: string[];
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

  const tried = (Array.isArray(stepsTried) ? stepsTried : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 20);
  const troubleshooting = [
    diagnosticsSummary?.trim() ? `Portal Assistant checks:\n${diagnosticsSummary.trim()}` : "",
    tried.length ? `Already tried with the Portal Assistant:\n${tried.map((t) => `- ${t}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const fullDescription = [description?.trim(), troubleshooting].filter(Boolean).join("\n\n---\n") || null;

  const { data: request, error: requestError } = await admin
    .from("helpdesk_requests")
    .insert({
      title: title.trim(),
      description: fullDescription,
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

  if (tried.length || diagnosticsSummary?.trim()) {
    await admin
      .from("helpdesk_assist_sessions")
      .insert({
        employee_id: requester.id,
        issue: title.trim().slice(0, 500),
        category: category?.trim() || null,
        kb_article_ids: (kbArticleIds ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(x)),
        steps_tried: tried,
        diagnostics: diagnosticsSummary ? { summary: diagnosticsSummary.slice(0, 2000) } : null,
        outcome: "escalated",
        request_id: request.id,
      })
      .then(() => null, () => null);
  }

  return NextResponse.json({
    ticketId: request.id,
    message: `Ticket created: "${title}" routed to ${department.toUpperCase()}, priority ${resolvedPriority}.${approvalNote}`,
  });
}
