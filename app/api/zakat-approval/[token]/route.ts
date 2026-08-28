import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: step } = await admin
    .from("zakat_application_approvals")
    .select("id, application_id, approver_name, approver_email, decision, decided_at, notes")
    .eq("approval_token", token)
    .single();
  if (!step) return NextResponse.json({ error: "Invalid or expired approval link" }, { status: 404 });

  const { data: application } = await admin
    .from("zakat_applications")
    .select("applicant_name, category, amount_requested, reason, status, submitted_at")
    .eq("id", step.application_id)
    .single();

  const { data: otherSteps } = await admin
    .from("zakat_application_approvals")
    .select("approver_name, decision, decided_at")
    .eq("application_id", step.application_id)
    .neq("id", step.id);

  return NextResponse.json({ step, application, otherSteps });
}
