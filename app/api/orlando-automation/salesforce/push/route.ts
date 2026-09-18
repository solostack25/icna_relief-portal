import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ORLANDO_OFFICE_ID } from "@/lib/orlandoAutomation/config";
import { getOrlandoAutomationAccess } from "@/lib/orlandoAutomation/access";

export const dynamic = "force-dynamic";

// TODO_REPLACE__: real Salesforce object + field API names for Hunger Prevention intakes.
// This mirrors the Client Credentials OAuth pattern used in the ICNA Relief donation
// intake app's lib/salesforce.ts — wire that same helper in here once the HP Case
// object/fields are confirmed with the Salesforce admin contact.
async function getSalesforceToken() {
  const instanceUrl = process.env.SALESFORCE_INSTANCE_URL;
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;

  if (!instanceUrl || !clientId || !clientSecret) {
    throw new Error(
      "Salesforce env vars not configured (SALESFORCE_INSTANCE_URL / SALESFORCE_CLIENT_ID / SALESFORCE_CLIENT_SECRET)"
    );
  }

  const res = await fetch(`${instanceUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Salesforce auth failed: ${text}`);
  }

  return res.json() as Promise<{ access_token: string; instance_url: string }>;
}

export async function POST(req: NextRequest) {
  const access = await getOrlandoAutomationAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.status === 401 ? "Not authenticated" : "Forbidden" }, { status: access.status });
  }
  const supabase = await createClient();

  const { intakeId } = await req.json();
  if (!intakeId) {
    return NextResponse.json({ error: "intakeId is required" }, { status: 400 });
  }

  const { data: intake } = await supabase
    .from("hp_intakes")
    .select("id, client_id, intake_data, salesforce_synced, clients!inner(office_id)")
    .eq("id", intakeId)
    .eq("clients.office_id", ORLANDO_OFFICE_ID)
    .maybeSingle();

  if (!intake) {
    return NextResponse.json({ error: "Intake not found" }, { status: 404 });
  }

  try {
    const { access_token, instance_url } = await getSalesforceToken();

    // TODO_REPLACE__: build the real Case (or whichever object) payload here from
    // intake.intake_data + the linked client record, then POST it:
    //
    // const res = await fetch(`${instance_url}/services/data/v59.0/sobjects/Case`, {
    //   method: "POST",
    //   headers: {
    //     Authorization: `Bearer ${access_token}`,
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({ ...mappedFields }),
    // });
    // const result = await res.json();
    //
    // For now this route authenticates successfully but does not create a record yet —
    // field mapping needs confirming with the Salesforce admin contact first.

    void access_token;
    void instance_url;

    return NextResponse.json(
      {
        error:
          "Salesforce auth succeeded, but field mapping isn't wired up yet — no record was created. See TODO_REPLACE__ in app/api/orlando-automation/salesforce/push/route.ts.",
      },
      { status: 501 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown Salesforce error" },
      { status: 500 }
    );
  }
}
