import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  actOnExtensionParticipant,
  getExtensionParticipants,
  getThreeCxConfig,
  getWebClientUrl,
  listDnDevices,
  ThreeCxError,
} from "@/lib/threecx";

// Backs the portal call bar. Every action is scoped to the signed-in
// employee's OWN extension - the 3CX API client is one shared credential,
// so the portal (not 3CX) is what stops someone hanging up another
// person's call.

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("employees")
    .select("id, threecx_extension")
    .eq("auth_user_id", user.id)
    .single();
  return data as { id: string; threecx_extension: string | null } | null;
}

function fail(err: unknown) {
  const status = err instanceof ThreeCxError && err.status ? 502 : 500;
  return NextResponse.json({ error: err instanceof Error ? err.message : "3CX error" }, { status });
}

/**
 * ?mode=config - extension, 3CX web client URL, whether a phone is signed in
 * ?mode=probe  - newest portal-placed call in the last 90s (catches calls the
 *                Portal Assistant placed). DB only - cheap enough to poll.
 * ?mode=live   - live participants on my extension (3CX call control)
 */
export async function GET(req: Request) {
  const emp = await me();
  if (!emp) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const mode = new URL(req.url).searchParams.get("mode") ?? "live";

  if (mode === "probe") {
    const admin = createAdminClient();
    const { data } = await admin
      .from("portal_call_logs")
      .select("id, status, error, target_type, target_id, target_name, target_number, created_at")
      .eq("caller_employee_id", emp.id)
      .gte("created_at", new Date(Date.now() - 90_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return NextResponse.json({ log: data ?? null });
  }

  if (!emp.threecx_extension) return NextResponse.json({ extension: null, participants: [] });
  const config = await getThreeCxConfig();
  if (!config) return NextResponse.json({ extension: emp.threecx_extension, connected: false, participants: [] });

  if (mode === "config") {
    const [webclientUrl, devices] = await Promise.all([getWebClientUrl(config), listDnDevices(config, emp.threecx_extension)]);
    return NextResponse.json({
      extension: emp.threecx_extension,
      connected: true,
      webclientUrl,
      // null = unknown (couldn't read devices)
      hasDevice: devices === null ? null : devices.length > 0,
    });
  }

  try {
    const participants = await getExtensionParticipants(config, emp.threecx_extension);
    return NextResponse.json({ extension: emp.threecx_extension, participants });
  } catch (err) {
    return fail(err);
  }
}

/** { action: "drop" | "transfer", participantId, destination? } */
export async function POST(req: Request) {
  const emp = await me();
  if (!emp?.threecx_extension) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const config = await getThreeCxConfig();
  if (!config) return NextResponse.json({ error: "3CX isn't connected." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    participantId?: number;
    destination?: string;
  };
  const participantId = Number(body.participantId);
  if (!Number.isFinite(participantId)) return NextResponse.json({ error: "participantId is required" }, { status: 400 });

  try {
    // Re-read my own participants and refuse anything that isn't one of them.
    const mine = await getExtensionParticipants(config, emp.threecx_extension);
    const p = mine.find((x) => x.id === participantId);
    if (!p) return NextResponse.json({ error: "That call has already ended." }, { status: 404 });

    if (body.action === "drop") {
      await actOnExtensionParticipant(config, emp.threecx_extension, participantId, "drop");
      return NextResponse.json({ ok: true });
    }

    if (body.action === "transfer") {
      const destination = String(body.destination ?? "").replace(/[\s().-]/g, "");
      if (!/^\+?\d{2,15}$/.test(destination)) {
        return NextResponse.json({ error: "Enter an extension or phone number to transfer to." }, { status: 400 });
      }
      const ringing = !/connect/i.test(p.status);
      await actOnExtensionParticipant(config, emp.threecx_extension, participantId, ringing ? "divert" : "transferto", destination);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return fail(err);
  }
}
