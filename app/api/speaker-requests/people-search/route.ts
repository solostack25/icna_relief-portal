import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getSpeakerViewer } from "@/lib/speakerRequestAccess";
import { graphGet } from "@/lib/msgraph";

// Area Manager picker. Most AMs won't have logged into the portal yet
// (so aren't in employees), so this merges portal employees with a
// live Entra ID lookup - the same directory the Employee Directory
// page reads.
export async function GET(req: Request) {
  const viewer = await getSpeakerViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ people: [] });
  const safe = q.replace(/[%,()']/g, "");

  const results = new Map<string, { name: string; email: string; jobTitle: string | null }>();

  const admin = createAdminClient();
  const { data: emps } = await admin
    .from("employees")
    .select("first_name, last_name, email, job_title")
    .or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%`)
    .neq("is_active", false)
    .limit(8);
  for (const e of emps ?? []) {
    if (!e.email) continue;
    results.set(e.email.toLowerCase(), { name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || e.email, email: e.email, jobTitle: e.job_title ?? null });
  }

  try {
    const filter = encodeURIComponent(`startswith(displayName,'${safe}') or startswith(givenName,'${safe}') or startswith(surname,'${safe}') or startswith(mail,'${safe}')`);
    const data = await graphGet(`/users?$filter=${filter}&$select=displayName,mail,userPrincipalName,jobTitle,accountEnabled&$top=10`);
    for (const u of data.value ?? []) {
      const email = u.mail || u.userPrincipalName;
      if (!email || u.accountEnabled === false || email.includes("#EXT#")) continue;
      if (!results.has(email.toLowerCase())) results.set(email.toLowerCase(), { name: u.displayName ?? email, email, jobTitle: u.jobTitle ?? null });
    }
  } catch {
    // Graph unavailable - portal employees only.
  }

  return NextResponse.json({ people: [...results.values()].slice(0, 10) });
}
