import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { countAudience, pushConfigured, resolveAudience, sendToEmployees, type PushAudience } from "@/lib/push";

// Notification Center (admins only):
//   POST {preview: true, audience}           → how many people / phones it would reach
//   POST {title, body, url?, audience, label} → send it and log it

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const { data: me } = await supabase.from("employees").select("id, role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  return { employeeId: me.id as string };
}

function parseAudience(a: unknown): PushAudience | null {
  const x = a as Record<string, unknown> | null;
  if (!x || typeof x.type !== "string") return null;
  if (x.type === "everyone") return { type: "everyone" };
  if (x.type === "office" && typeof x.officeId === "string") return { type: "office", officeId: x.officeId };
  if (x.type === "region" && typeof x.region === "string") return { type: "region", region: x.region };
  if (x.type === "role" && typeof x.role === "string") return { type: "role", role: x.role };
  if (x.type === "people" && Array.isArray(x.employeeIds) && x.employeeIds.every((i) => typeof i === "string"))
    return { type: "people", employeeIds: (x.employeeIds as string[]).slice(0, 500) };
  return null;
}

export async function POST(req: Request) {
  const who = await requireAdmin();
  if ("error" in who) return who.error;

  const body = await req.json().catch(() => null);
  const audience = parseAudience(body?.audience);
  if (!audience) return NextResponse.json({ error: "Choose who should get it." }, { status: 400 });

  const admin = createAdminClient();

  if (body?.preview) {
    const counts = await countAudience(admin, audience);
    return NextResponse.json(counts);
  }

  if (!pushConfigured()) {
    return NextResponse.json({ error: "Push isn't set up on the server yet (missing VAPID keys)." }, { status: 500 });
  }

  const title = String(body?.title ?? "").trim().slice(0, 80);
  const text = String(body?.body ?? "").trim().slice(0, 300);
  let url = String(body?.url ?? "").trim();
  if (!title || !text) return NextResponse.json({ error: "Add a title and a message." }, { status: 400 });
  // Only links inside the portal (paths like /helpdesk).
  if (url && !/^\/[^/]/.test(url)) return NextResponse.json({ error: "The link must be a portal page, like /helpdesk." }, { status: 400 });
  url = url || "/select-app";
  const label = String(body?.label ?? audience.type).slice(0, 200);

  const people = await resolveAudience(admin, audience);
  const result = people.length
    ? await sendToEmployees(admin, people, { title, body: text, url })
    : { devices: 0, delivered: 0, failed: 0, removed: 0 };

  const { data: logged, error } = await admin
    .from("portal_push_messages")
    .insert({
      title,
      body: text,
      url,
      audience,
      audience_label: label,
      sent_by: who.employeeId,
      recipients: people.length,
      devices: result.devices,
      delivered: result.delivered,
      failed: result.failed,
    })
    .select("id, created_at")
    .single();
  if (error) console.error("push log failed", error);

  return NextResponse.json({ ok: true, recipients: people.length, ...result, id: logged?.id ?? null });
}
