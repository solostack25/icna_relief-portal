import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFlierMarketingAccess } from "@/lib/flierMarketingAccess";

const GUIDELINES_ID = "00000000-0000-0000-0000-000000000001";

export async function GET() {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const supabase = await createClient();
  const { data, error } = await supabase.from("brand_guidelines").select("*").eq("id", GUIDELINES_ID).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ guidelines: data });
}

export async function PUT(req: Request) {
  const access = await getFlierMarketingAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const body = await req.json();
  const { colors, fonts, logoUsageNotes, voiceTone, dos, donts } = body;

  const supabase = await createClient();
  const { error } = await supabase
    .from("brand_guidelines")
    .update({
      colors,
      fonts,
      logo_usage_notes: logoUsageNotes,
      voice_tone: voiceTone,
      dos,
      donts,
      updated_by: access.employeeId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", GUIDELINES_ID);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
