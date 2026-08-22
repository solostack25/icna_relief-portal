import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireCopilotAuth, lookupEmployeeByEmail } from "@/lib/copilotAuth";

export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;

  const { requesterEmail, statusFilter } = (await req.json()) as { requesterEmail: string; statusFilter?: "open" | "all" };

  if (!requesterEmail?.trim()) {
    return NextResponse.json({ error: "requesterEmail is required" }, { status: 400 });
  }

  const requester = await lookupEmployeeByEmail(requesterEmail);
  if (!requester) {
    return NextResponse.json({ error: "No employee record found for this requester." }, { status: 404 });
  }

  const admin = createAdminClient();
  let query = admin
    .from("helpdesk_requests")
    .select("id, title, overall_status, created_at")
    .eq("submitted_by_email", requesterEmail)
    .order("created_at", { ascending: false })
    .limit(10);

  if ((statusFilter ?? "open") === "open") {
    query = query.eq("overall_status", "open");
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    tickets: (data ?? []).map((t: { title: string; overall_status: string; created_at: string; id: string }) => ({
      title: t.title,
      status: t.overall_status,
      created_at: t.created_at,
      url: `/helpdesk/${t.id}`,
    })),
  });
}
