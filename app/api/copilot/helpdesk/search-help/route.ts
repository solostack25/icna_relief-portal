import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireCopilotAuth } from "@/lib/copilotAuth";

// Searches IT's troubleshooting playbooks (Admin > IT Help Articles).
export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;
  const { query } = (await req.json().catch(() => ({}))) as { query?: string };
  if (!query?.trim()) return NextResponse.json({ error: "query is required" }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("search_helpdesk_kb", { q: query.trim(), max_results: 3 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const articles = (data ?? []).map((a: any) => ({
    id: a.id,
    title: a.title,
    category: a.category,
    steps: String(a.steps).split("\n").map((s: string) => s.trim()).filter(Boolean),
    escalateWhen: a.escalate_when,
    ticketCategory: a.ticket_category,
  }));
  if (articles[0]) {
    const { data: row } = await admin.from("helpdesk_kb_articles").select("times_used").eq("id", articles[0].id).maybeSingle();
    await admin.from("helpdesk_kb_articles").update({ times_used: (row?.times_used ?? 0) + 1 }).eq("id", articles[0].id);
  }
  return NextResponse.json({
    articles,
    howToUse: articles.length
      ? "Use the best-matching article. Give the employee ONE or TWO steps at a time in plain language, then ask whether it worked before giving the next. Skip steps the diagnostics already ruled out. Stop and offer a ticket as soon as an escalateWhen condition is met."
      : "No playbook matched. Ask one clarifying question, or use general troubleshooting (restart the app/computer, try the web version), then offer a ticket.",
  });
}
