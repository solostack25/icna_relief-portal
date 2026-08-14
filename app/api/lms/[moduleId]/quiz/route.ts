import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// Strips correct_option_index/explanation before the questions ever
// reach the browser - see the schema comment on lms_quiz_questions for
// why this can't just be an RLS policy (RLS is row-level, not
// column-level, so "admin sees the answer, employee doesn't" on the
// same row needs to happen in application code instead).
export async function GET(_req: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { moduleId } = await params;
  const admin = createAdminClient();
  const { data: questions, error } = await admin
    .from("lms_quiz_questions")
    .select("id, question_order, question_text, options")
    .eq("module_id", moduleId)
    .order("question_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ questions });
}
