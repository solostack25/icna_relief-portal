import { createAdminClient } from "@/lib/supabase/server";
import { getResendClient } from "@/lib/resendClient";
import { getIntegrationSetting } from "@/lib/integrationSettings";

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

// Fans out one approval row + email per currently-active approver.
// Unanimous by design (per Travis) - the application only moves to
// 'approved' once every row created here is individually 'approved'.
export async function submitZakatApplication(applicationId: string) {
  const admin = createAdminClient();

  const { data: application } = await admin
    .from("zakat_applications")
    .select("id, applicant_name, amount_requested, category, office_id")
    .eq("id", applicationId)
    .single();
  if (!application) throw new Error("Application not found");

  const { data: approvers } = await admin.from("zakat_approvers").select("email, full_name").eq("is_active", true);
  if (!approvers || approvers.length === 0) {
    // Nothing configured yet - leave the application pending rather
    // than silently auto-approving it. Admin/Connectors page is where
    // this gets fixed.
    return { approversNotified: 0 };
  }

  const rows = approvers.map((a: { email: string; full_name: string }) => ({
    application_id: applicationId,
    approver_email: a.email,
    approver_name: a.full_name,
  }));
  const { data: inserted, error } = await admin.from("zakat_application_approvals").insert(rows).select("id, approver_email, approver_name, approval_token");
  if (error) throw new Error(error.message);

  const resend = await getResendClient();
  if (resend) {
    for (const step of inserted ?? []) {
      const link = `${siteUrl()}/zakat-approval/${step.approval_token}`;
      await resend.client.emails.send({
        from: resend.fromAddress,
        to: step.approver_email,
        subject: `Zakat Application Approval Needed — ${application.applicant_name}`,
        html: `<p>A financial assistance application for <strong>${application.applicant_name}</strong> (${application.category}, $${application.amount_requested.toLocaleString()} requested) needs your review.</p><p><a href="${link}">Review and decide</a></p>`,
      });
    }
  }

  return { approversNotified: inserted?.length ?? 0 };
}

export async function decideZakatApproval(params: { token: string; decision: "approve" | "reject"; notes?: string }) {
  const admin = createAdminClient();

  const { data: step } = await admin
    .from("zakat_application_approvals")
    .select("id, application_id, decision")
    .eq("approval_token", params.token)
    .single();
  if (!step) throw new Error("Invalid or expired approval link");
  if (step.decision !== "pending") throw new Error("This application has already been decided by you");

  const decision = params.decision === "approve" ? "approved" : "rejected";
  await admin
    .from("zakat_application_approvals")
    .update({ decision, notes: params.notes ?? null, decided_at: new Date().toISOString() })
    .eq("id", step.id);

  // A single rejection halts the application immediately - the
  // remaining approvers' rows are left as-is (their own decision
  // history stays accurate) but the application itself stops moving.
  if (decision === "rejected") {
    await admin.from("zakat_applications").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", step.application_id);
    return { outcome: "rejected" as const };
  }

  const { data: allSteps } = await admin.from("zakat_application_approvals").select("decision").eq("application_id", step.application_id);
  const allApproved = (allSteps ?? []).every((s: { decision: string }) => s.decision === "approved");

  if (!allApproved) {
    return { outcome: "approved_pending_others" as const };
  }

  await admin.from("zakat_applications").update({ status: "approved", decided_at: new Date().toISOString() }).eq("id", step.application_id);

  const { data: application } = await admin
    .from("zakat_applications")
    .select("applicant_name, amount_requested, amount_approved, category")
    .eq("id", step.application_id)
    .single();

  const resend = await getResendClient();
  const financeEmails = (await getIntegrationSetting("zakat_finance_emails", ""))?.split(",").map((e) => e.trim()).filter(Boolean) ?? [];
  if (resend && application && financeEmails.length > 0) {
    const amount = application.amount_approved ?? application.amount_requested;
    await resend.client.emails.send({
      from: resend.fromAddress,
      to: financeEmails,
      subject: `Approved for Payment — ${application.applicant_name}`,
      html: `<p>A zakat application for <strong>${application.applicant_name}</strong> (${application.category}, $${amount.toLocaleString()}) has been fully approved and is ready for a check.</p><p><a href="${siteUrl()}/admin/zakat-finance">View in Approved Applications</a></p>`,
    });
  }

  return { outcome: "approved" as const };
}
