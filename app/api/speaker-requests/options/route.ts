import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getSpeakerViewer } from "@/lib/speakerRequestAccess";
import { wfNumber } from "@/lib/workflowSettings";

// Everything the request form needs in one call: the coordinator's own
// details (auto-populated), regions, offices, the Area Managers the
// portal knows about per region, and - with ?speaker=q - speaker
// directory matches so a returning speaker's W-9 status is known.
export async function GET(req: Request) {
  const viewer = await getSpeakerViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const q = new URL(req.url).searchParams.get("speaker")?.trim();

  if (q) {
    if (q.length < 2) return NextResponse.json({ speakers: [] });
    const safe = q.replace(/[%,()]/g, "");
    const { data } = await admin
      .from("speaker_directory")
      .select("id, full_name, email, phone, w9_on_file")
      .or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`)
      .order("full_name")
      .limit(8);
    return NextResponse.json({ speakers: data ?? [] });
  }

  const [{ data: regions }, { data: offices }, { data: ams }] = await Promise.all([
    admin.from("b2s_regions").select("region, rsn").neq("region", "UNASSIGNED").order("rsn"),
    admin.from("b2s_offices").select("id, region, state, field_office").eq("is_active", true).order("field_office"),
    admin.from("employees").select("first_name, last_name, email, assigned_office_id, assigned_region").eq("role", "area_manager").neq("is_active", false),
  ]);

  const officeRegion = new Map((offices ?? []).map((o: { id: string; region: string }) => [o.id, o.region]));
  const areaManagers = (ams ?? [])
    .filter((a: { email: string | null }) => !!a.email)
    .map((a: { first_name: string | null; last_name: string | null; email: string; assigned_office_id: string | null; assigned_region: string | null }) => ({
      name: `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || a.email,
      email: a.email,
      region: a.assigned_region ?? (a.assigned_office_id ? officeRegion.get(a.assigned_office_id) ?? null : null),
    }));

  const myRegion = viewer.assignedRegion ?? (viewer.assignedOfficeId ? officeRegion.get(viewer.assignedOfficeId) ?? null : null);

  return NextResponse.json({
    leadershipThreshold: await wfNumber("wf_speaker_leadership_threshold"),
    me: { name: viewer.name, email: viewer.email, role: viewer.role, officeId: viewer.assignedOfficeId, region: myRegion },
    regions: (regions ?? []).map((r: { region: string }) => r.region),
    offices: offices ?? [],
    areaManagers,
  });
}
