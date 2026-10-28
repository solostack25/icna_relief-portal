import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { getDeviceViewer } from "@/lib/devices/access";
import HelpArticlesClient from "./HelpArticlesClient";

export const dynamic = "force-dynamic";

export default async function HelpArticlesPage() {
  const viewer = await getDeviceViewer();
  if (!viewer) redirect("/select-app");
  const admin = createAdminClient();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [{ data: articles }, { data: sessions }] = await Promise.all([
    admin.from("helpdesk_kb_articles").select("id, title, category, symptoms, steps, escalate_when, ticket_category, is_published, times_used, times_resolved, updated_at").order("category").order("title"),
    admin
      .from("helpdesk_assist_sessions")
      .select("id, issue, category, outcome, steps_tried, request_id, created_at, employee:employees(first_name, last_name)")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  return <HelpArticlesClient articles={articles ?? []} sessions={(sessions as any[]) ?? []} />;
}
