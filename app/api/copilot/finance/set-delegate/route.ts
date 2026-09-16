import { NextResponse } from "next/server";
import { getGraphToken } from "@/lib/msgraph";
import { createAdminClient } from "@/lib/supabase/server";
import { requireCopilotAuth, lookupEmployeeByEmail } from "@/lib/copilotAuth";

// Same $search mechanics as /api/admin/finance/directory-search -
// duplicated rather than shared, same call every other copilot
// directory lookup in this codebase already made.
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

// This is the narrower, self-service sibling of the admin-only
// POST /api/admin/finance/delegates - same finance_approval_delegates
// table, same coverage mechanism (resolveDelegate() in
// lib/financeTickets.ts already reroutes approvals to whoever's
// covering, at every level, for every category - nothing about that
// changes here). The ENTIRE difference, and the entire point of this
// route existing separately rather than just reusing the admin one,
// is that original_email is hardcoded to the requester's own email
// below and never accepted from the request body - an employee can
// only ever set up coverage for THEIR OWN approvals, never anyone
// else's. The admin route stays admin-only for setting coverage on
// someone else's behalf.
export async function POST(req: Request) {
  const authError = await requireCopilotAuth(req);
  if (authError) return authError;

  const { requesterEmail, delegateName, startsAt, endsAt, note } = (await req.json()) as {
    requesterEmail: string;
    delegateName?: string;
    startsAt?: string;
    endsAt?: string;
    note?: string;
  };

  if (!requesterEmail?.trim()) return NextResponse.json({ error: "requesterEmail is required" }, { status: 400 });
  if (!delegateName?.trim()) return NextResponse.json({ error: "delegateName is required" }, { status: 400 });

  const requester = await lookupEmployeeByEmail(requesterEmail);
  if (!requester) {
    return NextResponse.json({ error: "No employee record found for this requester." }, { status: 404 });
  }

  let matches;
  try {
    matches = await searchDirectory(delegateName.trim());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Directory search failed" }, { status: 500 });
  }
  if (matches.length === 0) {
    return NextResponse.json({ error: `No one found in the directory matching "${delegateName}".` }, { status: 404 });
  }
  if (matches.length > 1) {
    return NextResponse.json({ ambiguous_target: true, candidates: matches.map((m) => m.displayName) });
  }

  const delegate = matches[0];
  const delegateEmail = delegate.mail || delegate.userPrincipalName;

  if (delegateEmail.toLowerCase() === requester.email.toLowerCase()) {
    return NextResponse.json({ error: "You can't set yourself as your own coverage." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("finance_approval_delegates")
    .insert({
      original_email: requester.email,
      original_name: `${requester.first_name} ${requester.last_name}`,
      delegate_email: delegateEmail,
      delegate_name: delegate.displayName,
      starts_at: startsAt || new Date().toISOString().slice(0, 10),
      ends_at: endsAt || null,
      note: note ?? null,
    })
    .select("id, starts_at, ends_at")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Couldn't set up coverage" }, { status: 500 });

  return NextResponse.json({
    delegateName: delegate.displayName,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    message: `${delegate.displayName} will now cover your finance ticket approvals${
      data.ends_at ? ` from ${data.starts_at} through ${data.ends_at}` : ` starting ${data.starts_at}, until removed`
    }.`,
  });
}
