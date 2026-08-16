import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getSkyetelCreds, sendSkyetelSms } from "@/lib/skyetel";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { data: employee } = await supabase.from("employees").select("id").eq("auth_user_id", user.id).single();
  if (!employee) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const creds = await getSkyetelCreds();
  if (!creds) {
    return NextResponse.json(
      { error: "Texting isn't connected yet. Add Skyetel API credentials in Admin > Connectors first." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { toNumber, toName, targetType, targetId, text } = body as {
    toNumber: string;
    toName?: string;
    targetType: "client" | "contact" | "employee" | "manual";
    targetId?: string;
    text: string;
  };

  if (!toNumber?.trim() || !text?.trim()) {
    return NextResponse.json({ error: "toNumber and text are required" }, { status: 400 });
  }
  if (text.length > 1024) return NextResponse.json({ error: "Text exceeds 1024 characters" }, { status: 400 });

  const result = await sendSkyetelSms(creds, toNumber.trim(), text);

  const admin = createAdminClient();
  await admin.from("quick_texts").insert({
    sender_employee_id: employee.id,
    target_type: targetType ?? "manual",
    target_id: targetId ?? null,
    target_name: toName ?? null,
    target_number: toNumber.trim(),
    body: text,
    status: result.ok ? "sent" : "failed",
    error: result.ok ? null : result.error,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
