import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getSkyetelCreds, sendSkyetelSms } from "@/lib/skyetel";
import { requireCopilotAuth, lookupEmployeeByEmail } from "@/lib/copilotAuth";
import { resolveTargetByName } from "@/lib/copilotResolveTarget";

export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const { requesterEmail, toNumber, targetName, text } = body as {
    requesterEmail: string;
    toNumber?: string;
    targetName?: string;
    text: string;
  };

  if (!requesterEmail?.trim()) {
    return NextResponse.json({ error: "requesterEmail is required" }, { status: 400 });
  }
  if (!text?.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (text.length > 1024) {
    return NextResponse.json({ error: "Text exceeds 1024 characters" }, { status: 400 });
  }
  if (!toNumber?.trim() && !targetName?.trim()) {
    return NextResponse.json({ error: "Provide either toNumber or targetName" }, { status: 400 });
  }

  const requester = await lookupEmployeeByEmail(requesterEmail);
  if (!requester) {
    return NextResponse.json({ error: `No employee found with email ${requesterEmail}` }, { status: 404 });
  }

  const creds = await getSkyetelCreds();
  if (!creds) {
    return NextResponse.json(
      { error: "Texting isn't connected yet. Add Skyetel API credentials in Admin > Connectors first." },
      { status: 400 }
    );
  }

  let resolvedNumber = toNumber?.trim() || null;
  let resolvedName = targetName?.trim() || null;
  let targetType: "client" | "contact" | "manual" = "manual";
  let targetId: string | null = null;

  if (!resolvedNumber && targetName) {
    const matches = await resolveTargetByName(targetName);
    if (matches.length === 0) {
      return NextResponse.json(
        { error: `No contact or client found matching "${targetName}" with a phone number on file.` },
        { status: 404 }
      );
    }
    if (matches.length > 1) {
      return NextResponse.json(
        {
          error: "ambiguous_target",
          message: `Found multiple matches for "${targetName}". Ask the requester which one they meant, then call again with the exact name.`,
          candidates: matches.map((m) => ({ name: m.name, type: m.targetType })),
        },
        { status: 409 }
      );
    }
    const match = matches[0];
    resolvedNumber = match.phone;
    resolvedName = match.name;
    targetType = match.targetType;
    targetId = match.targetId;
  }

  const result = await sendSkyetelSms(creds, resolvedNumber!, text);

  const admin = createAdminClient();
  await admin.from("quick_texts").insert({
    sender_employee_id: requester.id,
    target_type: targetType,
    target_id: targetId,
    target_name: resolvedName,
    target_number: resolvedNumber,
    body: text,
    status: result.ok ? "sent" : "failed",
    error: result.ok ? null : result.error,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({
    ok: true,
    message: `Text sent to ${resolvedName ?? resolvedNumber}.`,
  });
}
