import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { assignKey, revealKey, setStep, refreshEmployeeDevices, PRO_OR_BETTER, audit } from "@/lib/devices/windowsUpgrade";

export const maxDuration = 60;

// Self-service: an employee upgrading THEIR OWN PC. Every action checks the
// upgrade belongs to the signed-in employee.
async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createAdminClient().from("employees").select("id, email, assigned_office_id").eq("auth_user_id", user.id).maybeSingle();
  return data;
}

export async function GET() {
  const emp = await me();
  if (!emp) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createAdminClient();
  const [{ data: devices }, { data: upgrades }] = await Promise.all([
    admin
      .from("it_devices")
      .select("device_key, display_name, manufacturer, model, serial_number, trust_type, coverage, intune_id, windows_edition, edition_source, approx_last_sign_in")
      .is("removed_at", null)
      .ilike("operating_system", "%windows%")
      .or(`employee_id.eq.${emp.id},owner_upn.ilike.${emp.email},primary_user_upn.ilike.${emp.email}`),
    admin
      .from("win_upgrades")
      .select("id, device_key, device_name, status, key_id, reported_edition, steps, blocked_reason, completed_at, key:win_license_keys(license_type, key_last5)")
      .or(`employee_id.eq.${emp.id},owner_upn.ilike.${emp.email}`)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false }),
  ]);
  return NextResponse.json({ devices: devices ?? [], upgrades: upgrades ?? [] });
}

export async function POST(req: Request) {
  const emp = await me();
  if (!emp) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const admin = createAdminClient();

  async function ownUpgrade(id: string) {
    const { data } = await admin.from("win_upgrades").select("id, employee_id, owner_upn").eq("id", id).maybeSingle();
    const mine = data && (data.employee_id === emp!.id || (data.owner_upn ?? "").toLowerCase() === emp!.email.toLowerCase());
    if (!mine) throw new Error("That upgrade isn't yours.");
    // Planned by IT before this person had a portal account: link it now.
    if (!data.employee_id) await admin.from("win_upgrades").update({ employee_id: emp!.id }).eq("id", id);
  }

  try {
    switch (b.action) {
      case "start": {
        // Start an upgrade for one of my own Windows PCs (if IT hasn't already).
        const { data: d } = await admin.from("it_devices").select("device_key, display_name, serial_number, employee_id, owner_upn, primary_user_upn, windows_edition, trust_type, intune_id").eq("device_key", b.deviceKey).maybeSingle();
        const mine = d && (d.employee_id === emp.id || (d.owner_upn ?? "").toLowerCase() === emp.email.toLowerCase() || (d.primary_user_upn ?? "").toLowerCase() === emp.email.toLowerCase());
        if (!d || !mine) throw new Error("That PC isn't registered to you.");
        if (d.windows_edition && PRO_OR_BETTER.has(d.windows_edition) && d.trust_type === "AzureAd" && d.intune_id) throw new Error(`This PC already runs Windows ${d.windows_edition} and is managed by ICNA Relief - nothing to do.`);
        const { data: existing } = await admin.from("win_upgrades").select("id").eq("device_key", d.device_key).not("status", "in", "(complete,cancelled)").maybeSingle();
        if (existing) return NextResponse.json({ upgradeId: existing.id });
        const { data: up, error } = await admin
          .from("win_upgrades")
          .insert({ device_key: d.device_key, device_name: d.display_name, serial_number: d.serial_number, employee_id: emp.id, owner_upn: emp.email, office_id: emp.assigned_office_id, reported_edition: d.windows_edition, created_by: emp.id })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        await audit({ upgradeId: up.id, actorId: emp.id, action: "self_started" });
        return NextResponse.json({ upgradeId: up.id });
      }
      case "report_edition":
        await ownUpgrade(b.upgradeId);
        if (!["Home", "Pro", "Enterprise", "Education", "Pro Education"].includes(b.edition)) throw new Error("Pick the edition shown on your PC.");
        await setStep(b.upgradeId, emp.id, "reported_edition", b.edition);
        return NextResponse.json({ ok: true });
      case "get_key": {
        await ownUpgrade(b.upgradeId);
        const { data: up } = await admin.from("win_upgrades").select("reported_edition").eq("id", b.upgradeId).maybeSingle();
        if (up?.reported_edition && PRO_OR_BETTER.has(up.reported_edition)) throw new Error("Your PC already runs Pro - no key needed. Go to the next step.");
        await assignKey(b.upgradeId, emp.id, { allowMak: false });
        return NextResponse.json(await revealKey(b.upgradeId, emp.id, { isIt: false }));
      }
      case "mark_upgraded":
        await ownUpgrade(b.upgradeId);
        await setStep(b.upgradeId, emp.id, "upgraded");
        return NextResponse.json({ ok: true });
      case "mark_joined":
        await ownUpgrade(b.upgradeId);
        await setStep(b.upgradeId, emp.id, "joined");
        return NextResponse.json({ ok: true });
      case "blocked": {
        await ownUpgrade(b.upgradeId);
        const reason = String(b.reason ?? "").slice(0, 300);
        await setStep(b.upgradeId, emp.id, "blocked", reason);
        // Tell IT right away with everything they need.
        const { data: up } = await admin.from("win_upgrades").select("device_name, reported_edition, status, steps, key:win_license_keys(license_type, key_last5)").eq("id", b.upgradeId).maybeSingle();
        const { data: who } = await admin.from("employees").select("first_name, last_name, email").eq("id", emp.id).maybeSingle();
        const { data: reqRow } = await admin
          .from("helpdesk_requests")
          .insert({
            title: `Windows 11 Pro upgrade stuck - ${up?.device_name ?? "PC"}`,
            description: [
              `Employee reported: "${reason}"`,
              `PC: ${up?.device_name ?? "?"} · was ${up?.reported_edition ?? "unknown edition"} · stage: ${up?.status ?? "?"}`,
              (up as any)?.key ? `Assigned key: ${(up as any).key.license_type} …${(up as any).key.key_last5}` : "No key assigned yet",
              `Steps: ${JSON.stringify(up?.steps ?? {})}`,
              "Open Admin → Devices → Windows 11 Pro to use Tech mode.",
            ].join("\n"),
            submitted_by: `${who?.first_name ?? ""} ${who?.last_name ?? ""}`.trim() || emp.email,
            submitted_by_email: emp.email,
            overall_status: "open",
          })
          .select("id")
          .single();
        if (reqRow) await admin.from("helpdesk_request_legs").insert({ request_id: reqRow.id, department: "it", status: "open", priority: "normal", category: "Windows Upgrade" });
        return NextResponse.json({ ok: true, ticketCreated: !!reqRow });
      }
      case "check":
        return NextResponse.json(await refreshEmployeeDevices(emp.id));
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Action failed" }, { status: 400 });
  }
}
