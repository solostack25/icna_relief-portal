import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PROGRAM_TABLES: Record<string, string> = {
  b2s: "b2s_submissions",
  fate: "fate_submissions",
  drs: "drs_submissions",
};

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: me } = await supabase
    .from("employees")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();

  if (me?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { program, submissionId, status, note } = await request.json();

  const table = PROGRAM_TABLES[program];
  if (!table || !["reviewed", "flagged"].includes(status)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { error } = await supabase
    .from(table)
    .update({
      status,
      review_note: note,
      reviewed_by: me.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submissionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
