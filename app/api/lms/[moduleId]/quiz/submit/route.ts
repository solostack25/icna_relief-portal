import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// Pass threshold for a quiz module to count as complete. Below this,
// the module stays in_progress and the person can retake it.
const PASS_THRESHOLD = 0.8;

export async function POST(req: Request, { params }: { params: Promise<{ moduleId: string }> }) {
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

  const { moduleId } = await params;
  const { answers } = await req.json(); // { [questionId]: selectedOptionIndex }

  const admin = createAdminClient();
  const { data: questions, error } = await admin
    .from("lms_quiz_questions")
    .select("id, correct_option_index, explanation")
    .eq("module_id", moduleId);
  if (error || !questions || questions.length === 0) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  type ResultRow = { questionId: string; correct: boolean; correctOptionIndex: number; explanation: string | null };
  const results: ResultRow[] = questions.map((q: { id: string; correct_option_index: number; explanation: string | null }) => ({
    questionId: q.id,
    correct: answers?.[q.id] === q.correct_option_index,
    correctOptionIndex: q.correct_option_index,
    explanation: q.explanation,
  }));
  const correctCount = results.filter((r) => r.correct).length;
  const scorePercent = Math.round((correctCount / questions.length) * 100);
  const passed = correctCount / questions.length >= PASS_THRESHOLD;

  await supabase.from("lms_module_progress").upsert(
    {
      employee_id: employee.id,
      module_id: moduleId,
      status: passed ? "completed" : "in_progress",
      quiz_score: scorePercent,
      completed_at: passed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "employee_id,module_id" }
  );

  return NextResponse.json({ results, scorePercent, passed });
}
