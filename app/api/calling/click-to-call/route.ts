import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getThreeCxConfig, makeThreeCxCall } from "@/lib/threecx";

// Long enough to wait for a freshly opened 3CX web client to register.
export const maxDuration = 30;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { data: employee } = await supabase
    .from("employees")
    .select("id, threecx_extension")
    .eq("auth_user_id", user.id)
    .single();
  if (!employee) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  if (!employee.threecx_extension) {
    return NextResponse.json(
      { error: "Your account doesn't have a 3CX extension set. Ask an admin to set it on your employee profile." },
      { status: 400 }
    );
  }

  const config = await getThreeCxConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Calling isn't connected yet. Add 3CX API credentials in Admin > Connectors first." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { toNumber, toName, targetType, targetId, waitForDevice } = body as {
    toNumber: string;
    toName?: string;
    targetType: "client" | "contact" | "employee" | "manual";
    targetId?: string;
    waitForDevice?: boolean;
  };

  if (!toNumber?.trim()) return NextResponse.json({ error: "toNumber is required" }, { status: 400 });

  const result = await makeThreeCxCall(config, employee.threecx_extension, toNumber.trim(), 30, {
    waitForDeviceMs: waitForDevice ? 12_000 : 0,
  });

  const admin = createAdminClient();
  const { data: log } = await admin
    .from("portal_call_logs")
    .insert({
      caller_employee_id: employee.id,
      target_type: targetType ?? "manual",
      target_id: targetId ?? null,
      target_name: toName ?? null,
      target_number: toNumber.trim(),
      status: result.ok ? "initiated" : "failed",
      // "no_device:" prefix lets the call bar offer "open phone & retry".
      error: result.ok ? null : result.code === "no_device" ? `no_device: ${result.error}` : result.error,
    })
    .select("id")
    .single();

  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code, logId: log?.id ?? null }, { status: 502 });
  }
  return NextResponse.json({ ok: true, logId: log?.id ?? null });
}
