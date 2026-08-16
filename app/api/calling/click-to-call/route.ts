import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getThreeCxConfig, makeThreeCxCall } from "@/lib/threecx";

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
  const { toNumber, toName, targetType, targetId } = body as {
    toNumber: string;
    toName?: string;
    targetType: "client" | "contact" | "employee" | "manual";
    targetId?: string;
  };

  if (!toNumber?.trim()) return NextResponse.json({ error: "toNumber is required" }, { status: 400 });

  const result = await makeThreeCxCall(config, employee.threecx_extension, toNumber.trim());

  const admin = createAdminClient();
  await admin.from("portal_call_logs").insert({
    caller_employee_id: employee.id,
    target_type: targetType ?? "manual",
    target_id: targetId ?? null,
    target_name: toName ?? null,
    target_number: toNumber.trim(),
    status: result.ok ? "initiated" : "failed",
    error: result.ok ? null : result.error,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
