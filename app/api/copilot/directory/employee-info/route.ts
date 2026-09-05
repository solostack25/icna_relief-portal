import { NextResponse } from "next/server";
import { getGraphToken, graphGet } from "@/lib/msgraph";
import { requireCopilotAuth } from "@/lib/copilotAuth";
import { findIcnaTeamBio } from "@/lib/icnaTeamPage";

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
      candidates: matches.map((m) => `${m.displayName} (${m.jobTitle ?? "no title on file"})`),
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

  const teamBio = await findIcnaTeamBio(person.displayName);

  return NextResponse.json({
    name: person.displayName,
    email: person.mail || person.userPrincipalName,
    jobTitle: person.jobTitle,
    department: person.department,
    officeLocation: person.officeLocation,
    phone: person.mobilePhone || person.businessPhones?.[0] || null,
    manager,
    publicBio:
      teamBio.found === true
        ? { title: teamBio.title, bio: teamBio.bio, source: "ICNA Relief national leadership page" }
        : null,
  });
}
