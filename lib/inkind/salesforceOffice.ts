import { createAdminClient } from "@/lib/supabase/server";
import type { SalesforceAuth } from "./salesforceAuth";
import { PROGRAM_TO_SALESFORCE_PICKLIST, SF_HEADER_FIELD_MAP, SF_HEADER_OBJECT } from "./salesforceMapping";

// Office account + program picklist resolution for in-kind pushes, so any
// office and any program can sync without hand-editing constants.

function escapeSoql(v: string) {
  return v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function sfQuery<T>(auth: SalesforceAuth, soql: string): Promise<T[]> {
  const res = await fetch(`${auth.instanceUrl}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Salesforce query failed: ${JSON.stringify(json).slice(0, 300)}`);
  return json.records as T[];
}

export type AccountCandidate = { id: string; name: string; city: string | null; state: string | null };

// Office Accounts in ICNA's Salesforce are named "TX - Houston …".
export async function findOfficeAccountCandidates(auth: SalesforceAuth, state: string, city: string): Promise<AccountCandidate[]> {
  const rows = await sfQuery<{ Id: string; Name: string; BillingCity: string | null; BillingState: string | null }>(
    auth,
    `SELECT Id, Name, BillingCity, BillingState FROM Account WHERE Name LIKE '${escapeSoql(state)} - ${escapeSoql(city)}%' ORDER BY Name LIMIT 10`
  );
  return rows.map((r) => ({ id: r.Id, name: r.Name, city: r.BillingCity, state: r.BillingState }));
}

// The Account the session's office pushes to. Uses the saved one; otherwise
// looks it up by name and saves it when there's exactly one match.
export async function resolveOfficeAccountId(auth: SalesforceAuth, officeId: string | null): Promise<{ id: string } | { error: string }> {
  if (!officeId) return { error: "This donation has no office — set the station's office and try again." };
  const admin = createAdminClient();
  const [{ data: settings }, { data: office }] = await Promise.all([
    admin.from("office_settings").select("salesforce_account_id").eq("office_id", officeId).maybeSingle(),
    admin.from("b2s_offices").select("field_office, state").eq("id", officeId).maybeSingle(),
  ]);
  if (settings?.salesforce_account_id) return { id: settings.salesforce_account_id };
  if (!office) return { error: "Office not found." };

  const city = office.field_office.replace(/( Office|-Statewide| - Statewide)$/, "");
  const candidates = await findOfficeAccountCandidates(auth, office.state, city);
  if (candidates.length === 1) {
    await admin
      .from("office_settings")
      .update({ salesforce_account_id: candidates[0].id, salesforce_account_name: candidates[0].name, updated_at: new Date().toISOString() })
      .eq("office_id", officeId);
    return { id: candidates[0].id };
  }
  return {
    error:
      candidates.length === 0
        ? `No Salesforce Account found for "${office.state} - ${city}". Set it in InKind Admin → Settings → Offices.`
        : `Several Salesforce Accounts match "${office.state} - ${city}" (${candidates.map((c) => c.name).join(", ")}). Pick one in InKind Admin → Settings → Offices.`,
  };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/helath/g, "health")
    .replace(/[^a-z0-9]/g, "");

// Keyword → which Salesforce picklist value an internal program belongs to.
const PROGRAM_KEYWORDS: [RegExp, string][] = [
  [/fate/i, "fate"],
  [/counsel|muslim\s*family/i, "muslimfamily"],
  [/disaster/i, "disaster"],
  [/hel?a?th|health/i, "health"],
  [/transitional/i, "transitional"],
  [/back\s*(2|to)\s*school/i, "back2school"],
  [/hunger/i, "hunger"],
  [/refugee/i, "refugee"],
  [/general/i, "general"],
];

// Reads Program__c's active picklist values once per push and maps each
// internal program name onto one of them.
export async function makeProgramResolver(auth: SalesforceAuth): Promise<(program: string) => string | null> {
  let values: string[] = [];
  try {
    const res = await fetch(`${auth.instanceUrl}/services/data/v60.0/sobjects/${SF_HEADER_OBJECT}/describe`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });
    const json = await res.json();
    const field = (json.fields as any[] | undefined)?.find((f) => f.name === SF_HEADER_FIELD_MAP.program);
    values = (field?.picklistValues ?? []).filter((p: any) => p.active).map((p: any) => p.value as string);
  } catch {
    values = [];
  }
  const byNorm = new Map(values.map((v) => [norm(v).replace(/backto/, "back2"), v]));

  return (program: string) => {
    const explicit = PROGRAM_TO_SALESFORCE_PICKLIST[program];
    if (explicit && (values.length === 0 || values.includes(explicit))) return explicit;
    if (values.length === 0) return explicit ?? null;
    const exact = byNorm.get(norm(program).replace(/backto/, "back2"));
    if (exact) return exact;
    const rule = PROGRAM_KEYWORDS.find(([re]) => re.test(program));
    if (!rule) return null;
    for (const [n, v] of byNorm) if (n.includes(rule[1])) return v;
    return null;
  };
}
