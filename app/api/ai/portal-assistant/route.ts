import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runPortalAssistant } from "@/lib/ai/portalAssistant";

// Identity here comes from the portal's own logged-in session (same
// Supabase auth every other page in this app uses) — not from MSAL or
// any client-supplied identifier. This is simpler than the previous
// Copilot Studio integration by construction: there's no separate
// token-acquisition step, because the employee is already
// authenticated to reach this route at all.

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: employee } = await supabase
    .from("employees")
    .select("first_name, last_name, email")
    .eq("auth_user_id", user.id)
    .single();
  if (!employee) return NextResponse.json({ error: "No employee record found for this account." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const history = body?.messages as { role: "user" | "assistant"; content: string }[] | undefined;
  if (!Array.isArray(history) || history.length === 0) {
    return NextResponse.json({ error: "Expected a non-empty 'messages' array." }, { status: 400 });
  }

  const baseUrl = new URL(req.url).origin;
  const requesterName = `${employee.first_name} ${employee.last_name}`.trim();

  try {
    const reply = await runPortalAssistant(history, employee.email, requesterName, baseUrl);
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The assistant hit an unexpected error." },
      { status: 500 }
    );
  }
}
