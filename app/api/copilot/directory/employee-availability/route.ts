import { NextResponse } from "next/server";
import { getGraphToken } from "@/lib/msgraph";
import { requireCopilotAuth } from "@/lib/copilotAuth";

// Same $search mechanics as /api/copilot/directory/employee-info -
// duplicated rather than shared, same call as that route already made
// (see its own comment) about not refactoring working, tested lookups
// on the way through.
async function searchDirectory(query: string) {
  const token = await getGraphToken();
  const search = `"displayName:${query}" OR "mail:${query}"`;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users?$search=${encodeURIComponent(search)}&$select=id,displayName,mail,userPrincipalName&$top=10`,
    { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" } }
  );
  if (!res.ok) throw new Error(`Graph search failed: ${res.status}`);
  const body = await res.json();
  return (body.value ?? []) as { id: string; displayName: string; mail: string | null; userPrincipalName: string }[];
}

// "YYYY-MM-DDTHH:mm:ss" in Central time, no offset - same convention
// as lib/msgraph.ts's calendar functions (see the comment there on
// why: paired with a Central timeZone on the Graph request, this is
// interpreted as wall-clock Central rather than UTC).
function centralDateTimeString(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;

  const { name } = (await req.json()) as { name?: string };
  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  let matches;
  try {
    matches = await searchDirectory(name.trim());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Directory search failed" }, { status: 500 });
  }

  if (matches.length === 0) {
    return NextResponse.json({ error: `No one found in the directory matching "${name}".` }, { status: 404 });
  }
  if (matches.length > 1) {
    return NextResponse.json({
      ambiguous_target: true,
      candidates: matches.map((m) => m.displayName),
    });
  }

  const person = matches[0];
  const email = person.mail || person.userPrincipalName;

  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    const token = await getGraphToken();
    // getSchedule (not calendarView) is deliberate: it's the Graph
    // endpoint built for exactly this - free/busy status blocks, never
    // meeting subjects/locations, regardless of what permission scope
    // is granted. Using it instead of fetching real events and
    // stripping fields ourselves means there's no field to
    // accidentally forget to strip later.
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/calendar/getSchedule`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        schedules: [email],
        startTime: { dateTime: centralDateTimeString(now), timeZone: "Central Standard Time" },
        endTime: { dateTime: centralDateTimeString(endOfDay), timeZone: "Central Standard Time" },
        availabilityViewInterval: 15,
      }),
    });
    if (!res.ok) throw new Error(`Graph getSchedule failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const schedule = data.value?.[0];
    const items: { status: string; start: { dateTime: string }; end: { dateTime: string } }[] = schedule?.scheduleItems ?? [];

    const nowStr = centralDateTimeString(now);
    const current = items.find(
      (it) => it.start.dateTime <= nowStr && nowStr < it.end.dateTime && it.status.toLowerCase() !== "free"
    );

    return NextResponse.json({
      name: person.displayName,
      isCurrentlyBusy: !!current,
      status: current ? current.status : "Free",
      nextAvailable: current ? current.end.dateTime : null,
    });
  } catch (err) {
    return NextResponse.json({
      name: person.displayName,
      isCurrentlyBusy: null,
      error: `Couldn't check calendar availability: ${err instanceof Error ? err.message : "unknown error"}`,
    });
  }
}
