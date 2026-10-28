import { NextResponse } from "next/server";
import { getGraphToken, graphGet } from "@/lib/msgraph";
import { requireCopilotAuth } from "@/lib/copilotAuth";
import { findIcnaTeamBio } from "@/lib/icnaTeamPage";
import { createAdminClient } from "@/lib/supabase/server";
import { lookupEmployeeByEmail } from "@/lib/copilotAuth";
import { getDelegatedToken, delegatedGet, DelegatedAccessUnavailable } from "@/lib/msgraphDelegated";

export const maxDuration = 60;

// Same $search mechanics as /api/admin/finance/directory-search (the
// only other place this portal does a live, unscoped AD name search)
// - reused here rather than duplicated logic with different
// field selection, since the two callers just want different shaped
// responses from the same underlying query.
//
// This route lives under /api/copilot/* alongside the portal's other
// tool routes (helpdesk, calling, sms, fliers, etc.) - that naming is
// historical, from when those routes were originally built for a
// Copilot Studio custom connector. The Portal Assistant (lib/ai/)
// that actually calls this today runs on Azure OpenAI directly, not
// Copilot Studio - see lib/copilotStudio.ts for why. Whether the old
// Copilot Studio connector for these specific tool routes is still
// connected to anything in Power Platform is unconfirmed; either way
// it doesn't change how this route itself works.
async function searchDirectory(query: string) {
  const token = await getGraphToken();
  const search = `"displayName:${query}" OR "mail:${query}"`;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users?$search=${encodeURIComponent(search)}&$select=id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation,mobilePhone,businessPhones&$top=10`,
    { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" } }
  );
  if (!res.ok) throw new Error(`Graph search failed: ${res.status}`);
  const body = await res.json();
  return (body.value ?? []) as {
    id: string;
    displayName: string;
    mail: string | null;
    userPrincipalName: string;
    jobTitle: string | null;
    department: string | null;
    officeLocation: string | null;
    mobilePhone: string | null;
    businessPhones: string[];
  }[];
}

export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;

  const { name, email, hint, requesterEmail } = (await req.json()) as { name?: string; email?: string; hint?: string; requesterEmail?: string };
  if (!name?.trim() && !email?.trim()) {
    return NextResponse.json({ error: "name or email is required" }, { status: 400 });
  }

  let matches;
  try {
    matches = await searchDirectory((email ?? name ?? "").trim());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Directory search failed" }, { status: 500 });
  }

  // An email is a pick from a previous ambiguous result - match it exactly.
  if (email?.trim()) {
    const e = email.trim().toLowerCase();
    matches = matches.filter((m) => (m.mail ?? "").toLowerCase() === e || (m.userPrincipalName ?? "").toLowerCase() === e);
  }
  // Same display name twice (e.g. a real account plus a stale/guest one):
  // a hint like "CIO" or "Houston" narrows it by title/department/office.
  // Guest accounts (#EXT# UPNs) never win a tie over a real staff account.
  if (matches.length > 1) {
    const real = matches.filter((m) => !/#EXT#/i.test(m.userPrincipalName ?? ""));
    if (real.length > 0) matches = real;
  }
  if (matches.length > 1 && hint?.trim()) {
    const h = hint.trim().toLowerCase();
    const narrowed = matches.filter((m: any) => [m.jobTitle, m.department, m.officeLocation, m.mail].some((v) => (v ?? "").toLowerCase().includes(h)));
    if (narrowed.length > 0) matches = narrowed;
  }

  if (matches.length === 0) {
    return NextResponse.json({ error: `No one found in the directory matching "${name}".` }, { status: 404 });
  }
  if (matches.length > 1) {
    return NextResponse.json({
      ambiguous_target: true,
      candidates: matches.map((m) => ({ name: m.displayName, title: m.jobTitle ?? null, department: m.department ?? null, office: m.officeLocation ?? null, email: m.mail || m.userPrincipalName })),
      how_to_pick: "Ask which person they mean (show name + title), then call this tool again with that person's exact email in the 'email' parameter.",
    });
  }

  const person = matches[0];

  let manager: { displayName: string; mail: string | null } | null = null;
  try {
    const mgr = await graphGet(`/users/${person.id}/manager?$select=displayName,mail,userPrincipalName`);
    manager = { displayName: mgr.displayName, mail: mgr.mail ?? mgr.userPrincipalName ?? null };
  } catch {
    // No manager on file, or the lookup failed - not fatal, just omit it.
  }

  const personEmail = (person.mail || person.userPrincipalName).toLowerCase();

  // Everything below is best-effort and runs in parallel: a failed piece
  // is simply omitted rather than failing the whole lookup.
  const [teamBio, directReports, m365Profile, portal, together] = await Promise.all([
    findIcnaTeamBio(person.displayName),
    // Direct reports (app-only directory read - same visibility as the org chart).
    graphGet(`/users/${person.id}/directReports?$select=displayName,jobTitle&$top=25`)
      .then((r: any) => (r.value ?? []).map((u: any) => ({ name: u.displayName, title: u.jobTitle ?? null })))
      .catch(() => null),
    // The person's own Microsoft 365 profile ("About me", skills, past
    // projects, responsibilities) - what they chose to publish org-wide.
    graphGet(`/users/${person.id}?$select=aboutMe,skills,pastProjects,responsibilities,interests,hireDate`)
      .then((u: any) => {
        const out = {
          aboutMe: u.aboutMe || null,
          skills: (u.skills ?? []).slice(0, 12),
          pastProjects: (u.pastProjects ?? []).slice(0, 8),
          responsibilities: (u.responsibilities ?? []).slice(0, 8),
          interests: (u.interests ?? []).slice(0, 8),
          hireDate: u.hireDate && !String(u.hireDate).startsWith("0001") ? u.hireDate : null,
        };
        return Object.values(out).some((v) => (Array.isArray(v) ? v.length : v)) ? out : null;
      })
      .catch(() => null),
    portalContext(personEmail),
    requesterEmail ? sharedWithRequester(requesterEmail, person.id, personEmail) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    name: person.displayName,
    email: person.mail || person.userPrincipalName,
    jobTitle: person.jobTitle,
    department: person.department,
    officeLocation: person.officeLocation,
    phone: person.mobilePhone || person.businessPhones?.[0] || null,
    manager,
    directReports,
    m365Profile,
    publicBio:
      teamBio.found === true
        ? { title: teamBio.title, bio: teamBio.bio, source: "ICNA Relief national leadership page" }
        : null,
    portal,
    withYou: together,
    howToAnswer:
      "Write a short 2-4 sentence bio from these facts only (role, department, who they report to, team size, office, M365 profile, public bio), then list what they're working on that's visible to the asker (withYou.sharedFiles / trendingFiles, portal.openTickets, portal.grantsManaged) and upcoming meetings you both have (withYou.upcomingMeetingsTogether). Don't invent anything, don't mention LinkedIn. If withYou.unavailable is set, say in one line that signing out and back in once will add shared files and meetings.",
  });
}

// Portal-only context M365 Copilot can't see: office, open helpdesk work,
// grants they manage.
async function portalContext(email: string) {
  try {
    const admin = createAdminClient();
    const { data: emp } = await admin.from("employees").select("id, assigned_office_id, assigned_region").ilike("email", email).maybeSingle();
    if (!emp) return null;
    const [office, legs, grants] = await Promise.all([
      emp.assigned_office_id ? admin.from("b2s_offices").select("field_office, state, region").eq("id", emp.assigned_office_id).maybeSingle() : Promise.resolve({ data: null }),
      admin
        .from("helpdesk_request_legs")
        .select("status, department, request:helpdesk_requests(title)")
        .eq("assigned_to_employee_id", emp.id)
        .in("status", ["open", "in_progress", "on_hold"])
        .order("created_at", { ascending: false })
        .limit(5),
      admin.from("gm_grant_members").select("role, grant:gm_grants(name, funder, status, end_date)").eq("employee_id", emp.id).eq("role", "grant_manager").limit(8),
    ]);
    return {
      office: office.data ? `${office.data.field_office}${office.data.state ? `, ${office.data.state}` : ""}` : null,
      region: emp.assigned_region ?? (office.data as any)?.region ?? null,
      openTickets: (legs.data ?? []).map((l: any) => ({ title: l.request?.title ?? "(untitled)", department: l.department, status: l.status })),
      grantsManaged: (grants.data ?? [])
        .map((g: any) => g.grant)
        .filter((g: any) => g && g.status !== "closed")
        .map((g: any) => ({ name: g.name, funder: g.funder, ends: g.end_date })),
    };
  } catch {
    return null;
  }
}

// Things the ASKER can see that involve this person, read with the
// asker's own Microsoft token so Microsoft enforces their permissions:
// files this person shared with them, this person's trending files the
// asker has access to, and upcoming meetings on the asker's calendar that
// this person is also invited to.
async function sharedWithRequester(requesterEmail: string, personId: string, personEmail: string) {
  const requester = await lookupEmployeeByEmail(requesterEmail);
  if (!requester) return null;
  if (requester.email.toLowerCase() === personEmail) return null;
  let token: string;
  try {
    token = await getDelegatedToken(requester.id);
  } catch (e) {
    return { unavailable: e instanceof DelegatedAccessUnavailable ? e.message : "Couldn't reach Microsoft for shared items." };
  }
  const now = new Date();
  const in14 = new Date(now.getTime() + 14 * 864e5);
  const [shared, trending, meetings] = await Promise.all([
    delegatedGet(token, `/me/insights/shared?$filter=${encodeURIComponent(`lastShared/sharedBy/address eq '${personEmail.replace(/'/g, "''")}'`)}&$top=8`)
      .then((r: any) =>
        (r.value ?? []).map((i: any) => ({
          name: i.resourceVisualization?.title ?? "(file)",
          type: i.resourceVisualization?.type ?? null,
          sharedOn: i.lastShared?.sharedDateTime ?? null,
          url: i.resourceReference?.webUrl ?? null,
        }))
      )
      .catch(() => null),
    delegatedGet(token, `/users/${personId}/insights/trending?$top=6`)
      .then((r: any) => (r.value ?? []).map((i: any) => ({ name: i.resourceVisualization?.title ?? "(file)", type: i.resourceVisualization?.type ?? null, url: i.resourceReference?.webUrl ?? null })))
      .catch(() => null),
    delegatedGet(
      token,
      `/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${in14.toISOString()}&$select=subject,start,end,attendees,organizer,isCancelled,onlineMeeting&$orderby=start/dateTime&$top=100`,
      { Prefer: 'outlook.timezone="Central Standard Time"' }
    )
      .then((r: any) =>
        (r.value ?? [])
          .filter((ev: any) => !ev.isCancelled)
          .filter(
            (ev: any) =>
              (ev.organizer?.emailAddress?.address ?? "").toLowerCase() === personEmail ||
              (ev.attendees ?? []).some((a: any) => (a.emailAddress?.address ?? "").toLowerCase() === personEmail)
          )
          .slice(0, 6)
          .map((ev: any) => ({ subject: ev.subject, start: ev.start?.dateTime, end: ev.end?.dateTime, organizer: ev.organizer?.emailAddress?.name ?? null }))
      )
      .catch(() => null),
  ]);
  return { sharedFiles: shared, trendingFiles: trending, upcomingMeetingsTogether: meetings };
}
