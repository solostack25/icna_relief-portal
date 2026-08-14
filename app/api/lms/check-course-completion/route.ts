import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Called client-side right after any module is marked complete. Uses
// the employee's own RLS-scoped client throughout (not service-role) -
// this only ever reads/writes the calling employee's own rows, which
// the "lms progress own" / "lms completions own" policies already allow.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!employee) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { courseId } = await req.json();
  if (!courseId) return NextResponse.json({ error: "courseId is required" }, { status: 400 });

  const { data: modules } = await supabase
    .from("lms_course_modules")
    .select("id")
    .eq("course_id", courseId);
  const moduleIds = (modules ?? []).map((m) => m.id);
  if (moduleIds.length === 0) return NextResponse.json({ complete: false });

  const { data: progress } = await supabase
    .from("lms_module_progress")
    .select("module_id, status, quiz_score")
    .eq("employee_id", employee.id)
    .in("module_id", moduleIds);

  const completedIds = new Set((progress ?? []).filter((p) => p.status === "completed").map((p) => p.module_id));
  const allComplete = moduleIds.every((id) => completedIds.has(id));

  if (allComplete) {
    const scores = (progress ?? []).map((p) => p.quiz_score).filter((s): s is number => s != null);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    await supabase.from("lms_course_completions").insert({
      employee_id: employee.id,
      course_id: courseId,
      score: avgScore,
    });
  }

  return NextResponse.json({ complete: allComplete });
}
