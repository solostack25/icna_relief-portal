import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSalesforceAuth, isSalesforceConfigured } from "@/lib/inkind/salesforceAuth";

export const dynamic = "force-dynamic";

// GET /api/admin/salesforce/discover?q=bulk
//
// Admin-only, read-only look at ICNA's Salesforce schema, used to wire new
// pushes to the right objects instead of guessing API names. Lists every
// object whose name or label matches `q`, with each one's fields (type,
// lookups, required-on-create, picklist values) and a few recent records.
// Also lists the office Accounts ("TX - Houston …") that lookups point at.
// Never writes anything.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).maybeSingle();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  if (!isSalesforceConfigured()) return NextResponse.json({ error: "Salesforce isn't configured" }, { status: 500 });

  const q = (req.nextUrl.searchParams.get("q") || "bulk").toLowerCase();
  const auth = await getSalesforceAuth();
  const base = `${auth.instanceUrl}/services/data/v60.0`;
  const get = async (path: string) => {
    const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${auth.accessToken}` } });
    const json = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 500));
    return json;
  };

  try {
    const all = await get("/sobjects");
    const matches = (all.sobjects as any[]).filter(
      (o) => o.name.toLowerCase().includes(q) || String(o.label).toLowerCase().includes(q)
    );

    const objects = [];
    for (const o of matches.slice(0, 8)) {
      const d = await get(`/sobjects/${o.name}/describe`);
      const fields = (d.fields as any[])
        .filter((f) => f.createable || f.name === "Id" || f.name === "Name")
        .map((f) => ({
          name: f.name,
          label: f.label,
          type: f.type,
          required: f.createable && !f.nillable && !f.defaultedOnCreate,
          lookup: f.referenceTo?.length ? f.referenceTo : undefined,
          relationshipName: f.relationshipName ?? undefined,
          picklist: f.picklistValues?.length ? f.picklistValues.filter((p: any) => p.active).map((p: any) => p.value) : undefined,
        }));
      const recordTypes = (d.recordTypeInfos as any[])?.filter((r) => r.available && !r.master).map((r) => ({ id: r.recordTypeId, name: r.name }));
      let samples: unknown[] = [];
      try {
        const cols = ["Id", ...fields.filter((f) => f.name !== "Id").slice(0, 20).map((f) => f.name)];
        const r = await get(`/query?q=${encodeURIComponent(`SELECT ${cols.join(",")} FROM ${o.name} ORDER BY CreatedDate DESC LIMIT 3`)}`);
        samples = r.records;
      } catch (e) {
        samples = [{ error: e instanceof Error ? e.message : String(e) }];
      }
      objects.push({ name: o.name, label: o.label, recordTypes, fields, samples });
    }

    const accounts = await get(
      `/query?q=${encodeURIComponent("SELECT Id, Name, BillingCity, BillingState FROM Account WHERE Name LIKE '__ - %' ORDER BY Name LIMIT 200")}`
    );

    return NextResponse.json(
      {
        query: q,
        matchedObjects: matches.map((o) => ({ name: o.name, label: o.label })),
        objects,
        officeAccounts: accounts.records.map((a: any) => ({ id: a.Id, name: a.Name, city: a.BillingCity, state: a.BillingState })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Salesforce error" }, { status: 502 });
  }
}
