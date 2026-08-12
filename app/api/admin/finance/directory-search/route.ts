import { NextResponse } from "next/server";
import { getGraphToken } from "@/lib/msgraph";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";

// Live directory search, not scoped to any mapped AD group - this is
// specifically for finding ANYONE in the org (a Regional Director, the
// COO, whoever) to set up a temporary delegate for, which the group-
// scoped tools elsewhere in the portal don't cover.
//
// Uses $search rather than graphGet's plain $filter support, which
// needs the ConsistencyLevel: eventual header - handled directly here
// rather than adding header support to the shared graphGet helper for
// what's currently a single use case.
export async function GET(req: Request) {
  const access = await getFinanceAdminAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ users: [] });
  }

  const token = await getGraphToken();
  const query = `"displayName:${q}" OR "mail:${q}"`;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users?$search=${encodeURIComponent(query)}&$select=id,displayName,mail,userPrincipalName,jobTitle&$top=15`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        ConsistencyLevel: "eventual",
      },
    }
  );
  if (!res.ok) {
    return NextResponse.json({ error: `Graph search failed: ${res.status} ${await res.text()}` }, { status: 500 });
  }
  const body = await res.json();
  const users = (body.value ?? []).map((u: any) => ({
    id: u.id,
    name: u.displayName,
    email: u.mail || u.userPrincipalName,
    jobTitle: u.jobTitle ?? null,
  }));
  return NextResponse.json({ users });
}
