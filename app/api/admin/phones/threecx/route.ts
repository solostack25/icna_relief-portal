import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { errorMessage, phoneAudit, requirePhonesViewer } from "@/lib/phonesAdmin";
import {
  callControlParticipants,
  createHoliday,
  createUser,
  deleteHoliday,
  dropActiveCall,
  getCallLog,
  getOfficeHours,
  getSystemStatus,
  getUser,
  listActiveCalls,
  listQueues,
  listUsersLite,
  sendWelcomeEmail,
  setQueueStatus,
  transferParticipant,
  updateOfficeHours,
  updateQueue,
  updateReceptionist,
  updateRingGroup,
  updateUser,
  type PbxDestination,
} from "@/lib/threecxAdmin";

// Admin > Phones (3CX). IT only; every change is audited.

const DEST_TO = new Set(["None", "VoiceMail", "Extension", "Queue", "RingGroup", "IVR", "External", "VoiceMailOfDestination", "Boomerang"]);
const IVR_FWD = new Set(["EndCall", "Extension", "RingGroup", "Queue", "IVR", "VoiceMail", "CallByName", "RepeatPrompt"]);
const POLLING = new Set(["Hunt", "RingAll", "HuntRandomStart", "NextAgent", "LongestWaiting", "LeastTalkTime", "FewestAnswered", "HuntBy3s", "First3Available"]);
const RING = new Set(["Hunt", "RingAll", "Paging"]);
const DAYS = new Set(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
const digits = (v: unknown) => String(v ?? "").replace(/[^\d*#+]/g, "").slice(0, 20);
const int = (v: unknown, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
};
const str = (v: unknown, max = 100) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);

function dest(v: unknown): PbxDestination | undefined {
  if (!v || typeof v !== "object") return undefined;
  const d = v as Record<string, unknown>;
  const to = String(d.To ?? "");
  if (!DEST_TO.has(to)) return undefined;
  if (to === "External") return { To: "External", External: digits(d.External ?? d.Number) };
  if (to === "None" || to === "VoiceMail") return { To: to, Number: d.Number ? digits(d.Number) : undefined };
  return { To: to, Number: digits(d.Number) };
}

function members(v: unknown, withSkill = false) {
  if (!Array.isArray(v)) return undefined;
  return v
    .map((m) => digits((m as { Number?: string })?.Number ?? m))
    .filter(Boolean)
    .slice(0, 200)
    .map((Number) => (withSkill ? { Number, SkillGroup: "1" } : { Number }));
}

export async function GET(req: Request) {
  const viewer = await requirePhonesViewer();
  if (viewer instanceof NextResponse) return viewer;
  const view = new URL(req.url).searchParams.get("view");
  if (view !== "live") return NextResponse.json({ error: "Unknown view." }, { status: 400 });

  const [calls, participants, status, queues, users] = await Promise.allSettled([
    listActiveCalls(),
    callControlParticipants(),
    getSystemStatus(),
    listQueues(),
    listUsersLite(),
  ]);
  const v = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
  const e = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? errorMessage(r.reason) : null);
  return NextResponse.json({
    calls: v(calls) ?? [],
    participants: v(participants) ?? [],
    status: v(status),
    queues: v(queues) ?? [],
    users: (v(users) ?? []).map((u) => ({ Id: u.Id, Number: u.Number, FirstName: u.FirstName, LastName: u.LastName, QueueStatus: u.QueueStatus, CurrentProfileName: u.CurrentProfileName, IsRegistered: u.IsRegistered })),
    errors: { calls: e(calls), participants: e(participants), status: e(status), queues: e(queues), users: e(users) },
    at: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  const viewer = await requirePhonesViewer();
  if (viewer instanceof NextResponse) return viewer;
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  let target = "";
  let detail: unknown = null;

  const done = async (payload: Record<string, unknown> = {}) => {
    await phoneAudit({ actor: viewer, system: "3cx", action, target, detail, ok: true });
    return NextResponse.json({ ok: true, ...payload });
  };

  try {
    switch (action) {
      case "drop_call": {
        target = `call ${body.id}`;
        await dropActiveCall(Number(body.id));
        return done();
      }
      case "transfer": {
        const destination = digits(body.destination);
        if (!body.dn || !body.participantId || !destination) return NextResponse.json({ error: "Pick where to transfer to." }, { status: 400 });
        target = `${body.dn} participant ${body.participantId}`;
        detail = { destination };
        await transferParticipant(String(body.dn), Number(body.participantId), destination, !!body.ringing);
        return done();
      }
      case "queue_status": {
        target = `user ${body.userId}`;
        detail = { loggedIn: !!body.loggedIn };
        await setQueueStatus(Number(body.userId), !!body.loggedIn);
        return done();
      }
      case "update_user": {
        const p = body.patch ?? {};
        const patch: Record<string, unknown> = {};
        for (const k of ["FirstName", "LastName", "EmailAddress", "OutboundCallerID"] as const) if (str(p[k], 120) !== undefined) patch[k] = str(p[k], 120);
        if (p.Mobile !== undefined) patch.Mobile = digits(p.Mobile);
        for (const k of ["Enabled", "VMEnabled", "RecordCalls"] as const) if (typeof p[k] === "boolean") patch[k] = p[k];
        if (typeof p.CurrentProfileName === "string" && ["Available", "Away", "Out of office", "Custom 1", "Custom 2"].includes(p.CurrentProfileName)) {
          patch.CurrentProfileName = p.CurrentProfileName;
        }
        if (Array.isArray(p.ForwardingProfiles)) {
          // 3CX replaces the whole collection on PATCH, so merge the edits
          // into the full current profiles instead of sending partial ones.
          const current = (await getUser(Number(body.id))).ForwardingProfiles ?? [];
          const edits = new Map<number, Record<string, unknown>>(p.ForwardingProfiles.map((fp: Record<string, unknown>) => [Number(fp.Id), fp]));
          patch.ForwardingProfiles = current.map((cur) => {
            const fp = edits.get(cur.Id);
            if (!fp) return cur;
            const ar = (fp.AvailableRoute ?? {}) as Record<string, unknown>;
            const aw = (fp.AwayRoute ?? {}) as Record<string, unknown>;
            const next = { ...cur } as typeof cur;
            if (fp.NoAnswerTimeout !== undefined) next.NoAnswerTimeout = int(fp.NoAnswerTimeout, 5, 120);
            if (fp.AvailableRoute) {
              next.AvailableRoute = {
                ...cur.AvailableRoute,
                ...(dest(ar.NoAnswerExternal) ? { NoAnswerExternal: dest(ar.NoAnswerExternal), NoAnswerInternal: dest(ar.NoAnswerInternal ?? ar.NoAnswerExternal) } : {}),
                ...(dest(ar.BusyExternal) ? { BusyExternal: dest(ar.BusyExternal), BusyInternal: dest(ar.BusyInternal ?? ar.BusyExternal) } : {}),
              };
            }
            if (fp.AwayRoute) {
              next.AwayRoute = {
                ...cur.AwayRoute,
                ...(dest(aw.External) ? { External: dest(aw.External), Internal: dest(aw.Internal ?? aw.External) } : {}),
              };
            }
            return next;
          });
        }
        target = `extension ${body.number ?? body.id}`;
        detail = { ...patch, ForwardingProfiles: patch.ForwardingProfiles ? "updated" : undefined };
        await updateUser(Number(body.id), patch);
        return done();
      }
      case "reset_vm_pin": {
        const pin = String(randomInt(1000, 10000));
        target = `extension ${body.number ?? body.id}`;
        await updateUser(Number(body.id), { VMPIN: pin });
        return done({ pin });
      }
      case "welcome_email": {
        target = `extension ${body.number ?? body.id}`;
        await sendWelcomeEmail(Number(body.id));
        return done();
      }
      case "create_user": {
        const FirstName = str(body.FirstName, 60);
        const LastName = str(body.LastName, 60);
        const EmailAddress = str(body.EmailAddress, 120);
        if (!FirstName || !LastName || !EmailAddress || !EmailAddress.includes("@")) return NextResponse.json({ error: "First name, last name and email are required." }, { status: 400 });
        const created = await createUser({ FirstName, LastName, EmailAddress, Number: body.Number ? digits(body.Number) : undefined, Mobile: body.Mobile ? digits(body.Mobile) : undefined });
        target = `extension ${created?.Number ?? "?"}`;
        detail = { FirstName, LastName, EmailAddress };
        return done({ user: created });
      }
      case "link_employee": {
        const ext = digits(body.extension);
        target = `extension ${ext}`;
        detail = { employeeId: body.employeeId ?? null };
        const admin = createAdminClient();
        // One extension belongs to one employee.
        await admin.from("employees").update({ threecx_extension: null }).eq("threecx_extension", ext);
        if (body.employeeId) {
          const { error } = await admin.from("employees").update({ threecx_extension: ext }).eq("id", String(body.employeeId));
          if (error) throw new Error(error.message);
        }
        return done();
      }
      case "update_queue": {
        const p = body.patch ?? {};
        const patch: Record<string, unknown> = {};
        if (str(p.Name)) patch.Name = str(p.Name);
        if (POLLING.has(p.PollingStrategy)) patch.PollingStrategy = p.PollingStrategy;
        if (p.RingTimeout !== undefined) patch.RingTimeout = int(p.RingTimeout, 5, 600);
        if (p.MasterTimeout !== undefined) patch.MasterTimeout = int(p.MasterTimeout, 10, 7200);
        if (p.MaxCallersInQueue !== undefined) patch.MaxCallersInQueue = int(p.MaxCallersInQueue, 1, 500);
        if (p.ForwardNoAnswer) patch.ForwardNoAnswer = dest(p.ForwardNoAnswer);
        if (p.Agents) patch.Agents = members(p.Agents, true);
        target = `queue ${body.number ?? body.id}`;
        detail = patch;
        await updateQueue(Number(body.id), patch);
        return done();
      }
      case "update_ring_group": {
        const p = body.patch ?? {};
        const patch: Record<string, unknown> = {};
        if (str(p.Name)) patch.Name = str(p.Name);
        if (RING.has(p.RingStrategy)) patch.RingStrategy = p.RingStrategy;
        if (p.RingTime !== undefined) patch.RingTime = int(p.RingTime, 5, 600);
        if (p.ForwardNoAnswer) patch.ForwardNoAnswer = dest(p.ForwardNoAnswer);
        if (p.Members) patch.Members = members(p.Members);
        target = `ring group ${body.number ?? body.id}`;
        detail = patch;
        await updateRingGroup(Number(body.id), patch);
        return done();
      }
      case "update_receptionist": {
        const p = body.patch ?? {};
        const patch: Record<string, unknown> = {};
        if (str(p.Name)) patch.Name = str(p.Name);
        if (p.Timeout !== undefined) patch.Timeout = int(p.Timeout, 1, 120);
        if (p.TimeoutForwardType && IVR_FWD.has(p.TimeoutForwardType)) {
          patch.TimeoutForwardType = p.TimeoutForwardType;
          patch.TimeoutForwardDN = digits(p.TimeoutForwardDN);
        }
        if (Array.isArray(p.Forwards)) {
          patch.Forwards = p.Forwards.slice(0, 12)
            .filter((f: Record<string, unknown>) => /^[0-9*#]$/.test(String(f.Input)) && IVR_FWD.has(String(f.ForwardType)))
            .map((f: Record<string, unknown>) => ({ Input: String(f.Input), ForwardType: String(f.ForwardType), ForwardDN: digits(f.ForwardDN) }));
        }
        target = `menu ${body.number ?? body.id}`;
        detail = patch;
        await updateReceptionist(Number(body.id), patch);
        return done();
      }
      case "update_office_hours": {
        const periods = Array.isArray(body.periods) ? body.periods : [];
        const clean = periods
          .filter((x: Record<string, unknown>) => DAYS.has(String(x.DayOfWeek)) && /^\d{2}:\d{2}(:\d{2})?$/.test(String(x.Start)) && /^\d{2}:\d{2}(:\d{2})?$/.test(String(x.Stop)))
          .map((x: Record<string, unknown>) => ({ DayOfWeek: String(x.DayOfWeek), Start: String(x.Start).slice(0, 5) + ":00", Stop: String(x.Stop).slice(0, 5) + ":00" }));
        target = "system office hours";
        detail = { periods: clean };
        // Keep 3CX's existing schedule type/holiday setting; only the periods change.
        const current = await getOfficeHours().catch(() => null);
        await updateOfficeHours({ Hours: { ...(current?.Hours ?? {}), Periods: clean } });
        return done();
      }
      case "add_holiday": {
        const [y, m, d] = String(body.date ?? "").split("-").map(Number);
        const [y2, m2, d2] = String(body.endDate ?? body.date ?? "").split("-").map(Number);
        const Name = str(body.name, 60);
        if (!Name || !y || !m || !d) return NextResponse.json({ error: "Give the holiday a name and date." }, { status: 400 });
        target = `holiday ${Name}`;
        detail = { date: body.date, endDate: body.endDate, recurring: !!body.recurring };
        const h = await createHoliday({ Name, Day: d, Month: m, Year: y, DayEnd: d2 || d, MonthEnd: m2 || m, YearEnd: y2 || y, IsRecurrent: !!body.recurring });
        return done({ holiday: h });
      }
      case "delete_holiday": {
        target = `holiday ${body.id}`;
        await deleteHoliday(Number(body.id));
        return done();
      }
      case "call_log": {
        const from = new Date(String(body.from));
        const to = new Date(String(body.to));
        if (isNaN(from.getTime()) || isNaN(to.getTime())) return NextResponse.json({ error: "Bad date range." }, { status: 400 });
        const r = await getCallLog(from.toISOString().replace(/\.\d{3}Z$/, "Z"), to.toISOString().replace(/\.\d{3}Z$/, "Z"), 200, int(body.skip, 0, 100000) ?? 0);
        return NextResponse.json({ ok: true, ...r });
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (err) {
    const msg = errorMessage(err);
    if (action !== "call_log") await phoneAudit({ actor: viewer, system: "3cx", action, target, detail, ok: false, error: msg });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
