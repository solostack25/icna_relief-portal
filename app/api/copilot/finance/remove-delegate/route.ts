import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireCopilotAuth, lookupEmployeeByEmail } from "@/lib/copilotAuth";

// Same scoping principle as set-delegate: this only ever deletes rows
// where original_email matches the REQUESTER's own email, resolved
// server-side from their session-injected email - never from an id
// the model could have made up or seen elsewhere. An employee can
// only ever cancel coverage they set up for themselves.
export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;

  const { requesterEmail, delegateName } = (await req.json()) as { requesterEmail: string; delegateName?: string };
  if (!requesterEmail?.trim()) return NextResponse.json({ error: "requesterEmail is required" }, { status: 400 });

  const requester = await lookupEmployeeByEmail(requesterEmail);
  if (!requester) {
    return NextResponse.json({ error: "No employee record found for this requester." }, { status: 404 });
  }

  const admin = createAdminClient();
  let query = admin
    .from("finance_approval_delegates")
    .select("id, delegate_name, starts_at, ends_at")
    .ilike("original_email", requester.email);
  if (delegateName?.trim()) {
    query = query.ilike("delegate_name", `%${delegateName.trim()}%`);
  }
  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!rows || rows.length === 0) {
    return NextResponse.json({
      error: delegateName
        ? `No coverage found matching "${delegateName}" for you.`
        : "You don't have any coverage set up right now.",
    });
  }
  if (rows.length > 1) {
    return NextResponse.json({
      ambiguous_target: true,
      candidates: rows.map((r: { delegate_name: string | null; starts_at: string; ends_at: string | null }) => `${r.delegate_name} (${r.starts_at}${r.ends_at ? ` – ${r.ends_at}` : ", until removed"})`),
    });
  }

  const target = rows[0];
  const { error: deleteErr } = await admin.from("finance_approval_delegates").delete().eq("id", target.id);
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

  return NextResponse.json({ message: `Removed ${target.delegate_name}'s coverage of your finance approvals.` });
}
