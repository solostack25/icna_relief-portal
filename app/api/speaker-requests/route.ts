import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getSpeakerViewer, escapeLike } from "@/lib/speakerRequestAccess";
import { submitSpeakerRequest, computeRequiresLeadership, LOCAL_HONORARIUM_CAP } from "@/lib/speakerRequests";
import { graphGet } from "@/lib/msgraph";

export const maxDuration = 60;

const LIST_COLUMNS =
  "id, request_number, status, event_type, event_type_other, event_at, event_timezone, speaker_name, region, travel_required, total_cost, coordinator_name, area_manager_name, created_at, agreement_signed_at, w9_needed, w9_received_at, finance_ticket_id";

// GET: { mine: requests I submitted, approvals: steps waiting on me, all?: everything (admin/finance) }
export async function GET(req: Request) {
  const viewer = await getSpeakerViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const scope = new URL(req.url).searchParams.get("scope");

  const { data: mine } = await admin.from("speaker_requests").select(LIST_COLUMNS).eq("coordinator_id", viewer.employeeId).order("created_at", { ascending: false }).limit(200);

  const { data: steps } = await admin
    .from("speaker_request_approvals")
    .select("id, gate, approval_token, created_at, request_id, speaker_requests(" + LIST_COLUMNS + ")")
    .ilike("approver_email", escapeLike(viewer.email))
    .eq("decision", "pending")
    .order("created_at", { ascending: true });

  let all = null;
  if (scope === "all" && (viewer.isAdmin || viewer.canManageFinance)) {
    const { data } = await admin.from("speaker_requests").select(LIST_COLUMNS).order("created_at", { ascending: false }).limit(500);
    all = data;
  }

  return NextResponse.json({ mine: mine ?? [], approvals: steps ?? [], all, canSeeAll: viewer.isAdmin || viewer.canManageFinance });
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function POST(req: Request) {
  const viewer = await getSpeakerViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();

  const errors: string[] = [];
  const region = str(b.region);
  const amName = str(b.area_manager_name);
  const amEmail = str(b.area_manager_email);
  const eventType = b.event_type === "special_program" ? "special_program" : b.event_type === "weekly_jummah" ? "weekly_jummah" : null;
  const travel = b.travel_required === true ? true : b.travel_required === false ? false : null;
  const eventAt = new Date(str(b.event_at));
  const honorarium = num(b.honorarium);

  if (!region) errors.push("Region is required.");
  if (!amName || !isEmail(amEmail)) errors.push("Pick the Area Manager (name and email).");
  if (!eventType) errors.push("Event type is required.");
  if (eventType === "special_program" && !str(b.event_type_other)) errors.push("Describe the special program.");
  if (travel === null) errors.push("Answer whether travel / a flight is required.");
  if (isNaN(eventAt.getTime())) errors.push("Event date and time are required.");
  if (!Number.isFinite(honorarium) || honorarium < 0) errors.push("Enter the speaker honorarium.");
  if (!str(b.speaker_name)) errors.push(travel ? "Which speaker is requested?" : "Enter the speaker's name.");
  if (str(b.speaker_email) && !isEmail(str(b.speaker_email))) errors.push("Speaker email doesn't look valid.");

  let travelCost = 0;
  let hotelCost = 0;
  let w9: boolean | null = null;
  let justification: string | null = null;
  if (travel === false && honorarium > LOCAL_HONORARIUM_CAP) {
    errors.push(`Local speaker honorariums are capped at $${LOCAL_HONORARIUM_CAP}.`);
  }
  if (travel === true) {
    travelCost = num(b.travel_cost);
    hotelCost = num(b.hotel_cost);
    if (!Number.isFinite(travelCost) || travelCost < 0) errors.push("Enter the estimated travel cost (0 if none).");
    if (!Number.isFinite(hotelCost) || hotelCost < 0) errors.push("Enter the estimated hotel cost (0 if none).");
    if (b.w9_on_file !== true && b.w9_on_file !== false) errors.push("Tell us whether the speaker's W-9 is on file.");
    w9 = b.w9_on_file === true;
    justification = str(b.justification);
    const words = justification.split(/\s+/).filter(Boolean).length;
    if (!justification) errors.push("Strategic justification is required when travel is needed.");
    if (words > 250) errors.push("Strategic justification is limited to 250 words.");
    if (!str(b.speaker_email)) errors.push("Speaker email is required for travel speakers (for the agreement and W-9).");
  }
  if (errors.length) return NextResponse.json({ error: errors.join(" "), errors }, { status: 400 });

  const admin = createAdminClient();

  // The AM must be a real person in the org - a portal employee or an
  // enabled account in Entra ID - so the approval gate can't be pointed
  // at an outside address.
  let amVerified = false;
  const { data: amEmp } = await admin.from("employees").select("id").ilike("email", escapeLike(amEmail)).neq("is_active", false).limit(1);
  if ((amEmp ?? []).length > 0) amVerified = true;
  if (!amVerified) {
    try {
      const u = await graphGet(`/users/${encodeURIComponent(amEmail)}?$select=accountEnabled,mail`);
      amVerified = u?.accountEnabled !== false;
    } catch {
      amVerified = false;
    }
  }
  if (!amVerified) {
    return NextResponse.json({ error: "That Area Manager isn't in the ICNA Relief directory. Pick them from the search results." }, { status: 400 });
  }

  // Link to a known speaker ONLY by email, server-side. A speaker id
  // from the browser is never trusted (it would let a request attach
  // itself to someone else's W-9 / payee record).
  const speakerEmail = str(b.speaker_email) || null;
  let speakerId: string | null = null;
  let directoryHasW9 = false;
  if (speakerEmail) {
    const { data: known } = await admin.from("speaker_directory").select("id, w9_on_file").ilike("email", escapeLike(speakerEmail)).limit(1);
    if (known && known[0]) {
      speakerId = known[0].id;
      directoryHasW9 = !!known[0].w9_on_file;
    }
  }
  // Finance can't pay without a W-9. Branch B asks explicitly; Branch A
  // (local) relies on the speaker directory.
  const w9Needed = travel ? w9 !== true : !directoryHasW9;

  let officeId: string | null = str(b.office_id) || null;
  if (officeId) {
    const { data: office } = await admin.from("b2s_offices").select("id, region").eq("id", officeId).maybeSingle();
    if (!office) officeId = null;
  }

  const row = {
    coordinator_id: viewer.employeeId,
    coordinator_name: viewer.name,
    coordinator_email: viewer.email,
    region,
    office_id: officeId,
    area_manager_name: amName,
    area_manager_email: amEmail,
    event_type: eventType,
    event_type_other: eventType === "special_program" ? str(b.event_type_other) : null,
    travel_required: travel,
    event_at: eventAt.toISOString(),
    event_timezone: str(b.event_timezone) || "America/Chicago",
    speaker_id: speakerId,
    speaker_name: str(b.speaker_name),
    speaker_email: speakerEmail,
    w9_needed: w9Needed,
    speaker_phone: str(b.speaker_phone) || null,
    honorarium,
    w9_on_file: w9,
    travel_cost: travelCost,
    hotel_cost: hotelCost,
    justification,
    requires_leadership: computeRequiresLeadership({ travel_required: !!travel, honorarium, travel_cost: travelCost, hotel_cost: hotelCost }),
  };

  const { data: created, error } = await admin.from("speaker_requests").insert(row).select("id, request_number").single();
  if (error || !created) return NextResponse.json({ error: error?.message ?? "Couldn't save the request." }, { status: 500 });

  try {
    await submitSpeakerRequest(created.id);
  } catch (e) {
    return NextResponse.json({
      request: created,
      warning: `Saved, but routing hit a problem: ${e instanceof Error ? e.message : "unknown error"}. Use “Re-send approvals” on the request page.`,
    });
  }
  return NextResponse.json({ request: created });
}
