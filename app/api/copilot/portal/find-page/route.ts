import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireCopilotAuth } from "@/lib/copilotAuth";
import { searchPortalPages } from "@/lib/portalPages";

export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;

  const { query } = (await req.json()) as { query?: string };
  if (!query?.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const pages = searchPortalPages(query).slice(0, 5);

  // Training is a special case worth searching by course title too,
  // not just the static "Training" page entry - "where's the MS365
  // course" should surface the actual course, not just /training.
  const admin = createAdminClient();
  const { data: courses } = await admin
    .from("lms_courses")
    .select("id, title, description, category")
    .eq("is_active", true)
    .ilike("title", `%${query}%`)
    .limit(5);

  return NextResponse.json({
    pages: pages.map((p) => ({ name: p.name, url: p.path, description: p.description })),
    matchingCourses: (courses ?? []).map((c: { title: string; description: string | null; category: string | null; id: string }) => ({
      title: c.title,
      description: c.description,
      category: c.category,
      url: `/training/${c.id}`,
    })),
  });
}
