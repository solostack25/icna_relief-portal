import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body?.slot_id || !body?.name || !body?.email) {
    return NextResponse.json(
      { error: "slot_id, name, and email are required" },
      { status: 400, headers: corsHeaders() }
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.from("volunteer_signups").insert({
    slot_id: body.slot_id,
    name: String(body.name).trim(),
    email: String(body.email).trim(),
    phone: body.phone ? String(body.phone).trim() : null,
    qty: body.qty ? Number(body.qty) : 1,
    notes: body.notes ? String(body.notes).trim() : null,
    waiver_signed: !!body.waiver_signed,
    source: body.source === "wordpress" ? "wordpress" : "portal",
  });

  if (error) {
    // Raised by the check_volunteer_slot_capacity trigger — someone
    // else took the last spot between page load and submit.
    if (error.message?.includes("slot_full")) {
      return NextResponse.json(
        { error: "That slot just filled up — please pick another." },
        { status: 409, headers: corsHeaders() }
      );
    }
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders() }
    );
  }

  return NextResponse.json({ ok: true }, { headers: corsHeaders() });
}
