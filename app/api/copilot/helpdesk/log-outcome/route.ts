import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireCopilotAuth, lookupEmployeeByEmail } from "@/lib/copilotAuth";

// Records a troubleshooting conversation that ended WITHOUT a ticket
// (fixed, or the employee gave up), so IT can see what the assistant
// resolves and which articles work. Escalations are recorded by
// create-ticket instead.
export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;
  const body = (await req.json().catch(() => ({}))) as { requesterEmail?: string; issue?: string; category?: string; kbArticleIds?: string[]; stepsTried?: string[]; outcome?: string };
  if (!body.requesterEmail || !body.issue?.trim()) return NextResponse.json({ error: "requesterEmail and issue are required" }, { status: 400 });
  const me = await lookupEmployeeByEmail(body.requesterEmail);
  const outcome = body.outcome === "abandoned" ? "abandoned" : "resolved";
  const ids = (body.kbArticleIds ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const admin = createAdminClient();
  await admin.from("helpdesk_assist_sessions").insert({
    employee_id: me?.id ?? null,
    issue: body.issue.trim().slice(0, 500),
    category: body.category ?? null,
    kb_article_ids: ids,
    steps_tried: (body.stepsTried ?? []).slice(0, 20).map((s) => String(s).slice(0, 300)),
    outcome,
  });
  if (outcome === "resolved" && ids[0]) {
    const { data: row } = await admin.from("helpdesk_kb_articles").select("times_resolved").eq("id", ids[0]).maybeSingle();
    await admin.from("helpdesk_kb_articles").update({ times_resolved: (row?.times_resolved ?? 0) + 1 }).eq("id", ids[0]);
  }
  return NextResponse.json({ ok: true });
}
