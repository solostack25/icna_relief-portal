import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// A phone turning push notifications on (POST) or off (DELETE). The
// subscription is tied to the staff member signed in right now; if a
// different person signs in on the same phone and turns them on, the
// phone moves to them.

async function currentEmployeeId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from("employees").select("id").eq("auth_user_id", user.id).single();
  return (me?.id as string | undefined) ?? null;
}

export async function POST(req: Request) {
  const employeeId = await currentEmployeeId();
  if (!employeeId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const sub = body?.subscription;
  const endpoint: unknown = sub?.endpoint;
  const p256dh: unknown = sub?.keys?.p256dh;
  const auth: unknown = sub?.keys?.auth;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || typeof p256dh !== "string" || typeof auth !== "string") {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("portal_push_subscriptions").upsert(
    {
      employee_id: employeeId,
      endpoint,
      p256dh,
      auth,
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
      failure_count: 0,
    },
    { onConflict: "endpoint" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const employeeId = await currentEmployeeId();
  if (!employeeId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  const admin = createAdminClient();
  await admin.from("portal_push_subscriptions").delete().eq("endpoint", body.endpoint).eq("employee_id", employeeId);
  return NextResponse.json({ ok: true });
}
