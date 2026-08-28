import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getReportsAccess } from "@/lib/reportsAccess";
import { getReportModule } from "@/lib/reports/registry";

export async function GET() {
  const access = await getReportsAccess();
  if (!access.ok) return NextResponse.json({ error: "Unauthorized" }, { status: access.status });

  const supabase = await createClient();
  // RLS (report_definitions owner/shared policies) already narrows
  // this to what the employee can see - no extra filtering needed here.
  const { data, error } = await supabase
    .from("report_definitions")
    .select("id, module_slug, name, description, filters, dimensions, metrics, visibility, schedule, owner_id, updated_at")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reports: data });
}

export async function POST(req: Request) {
  const access = await getReportsAccess();
  if (!access.ok) return NextResponse.json({ error: "Unauthorized" }, { status: access.status });

  const body = await req.json();
  const mod = getReportModule(body.module_slug);
  if (!mod) return NextResponse.json({ error: "Unknown report module" }, { status: 400 });
  if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  // Only admins may publish a report to every employee. Everyone else
  // can share it with a specific role tier at most (e.g. their own
  // regional directors), or keep it private.
  const visibility = body.visibility === "shared_all" && !access.isAdmin ? "shared_role" : body.visibility ?? "private";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_definitions")
    .insert({
      owner_id: access.employeeId,
      module_slug: body.module_slug,
      name: body.name.trim(),
      description: body.description ?? null,
      filters: body.filters ?? {},
      dimensions: body.dimensions ?? [],
      metrics: body.metrics ?? [],
      visibility,
      shared_with_roles: body.shared_with_roles ?? [],
      schedule: body.schedule ?? null,
      schedule_recipients: body.schedule_recipients ?? [],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ report: data });
}
