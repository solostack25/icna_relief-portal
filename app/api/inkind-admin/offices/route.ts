import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getInkindAccess } from "@/lib/inkind/access";
import { getSalesforceAuth, isSalesforceConfigured } from "@/lib/inkind/salesforceAuth";
import { findOfficeAccountCandidates } from "@/lib/inkind/salesforceOffice";
import { shortOfficeName } from "@/lib/inkind/offices";

export const dynamic = "force-dynamic";

// Per-office in-kind settings: invoice prefix, cash/check receipt prefix,
// Salesforce office Account. Anyone with in-kind admin access can view;
// only admins can change.
//   GET                         list
//   GET ?find=<office_id>       Salesforce Accounts named "ST - City…"
//   POST { office_id, inkind_prefix?, cash_prefix?, salesforce_account_id?, salesforce_account_name? }
export async function GET(req: NextRequest) {
  const access = await getInkindAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });
  const admin = createAdminClient();

  const find = req.nextUrl.searchParams.get("find");
  if (find) {
    if (!isSalesforceConfigured()) return NextResponse.json({ error: "Salesforce isn't configured" }, { status: 500 });
    const { data: office } = await admin.from("b2s_offices").select("field_office, state").eq("id", find).maybeSingle();
    if (!office) return NextResponse.json({ error: "Office not found" }, { status: 404 });
    try {
      const auth = await getSalesforceAuth();
      let candidates = await findOfficeAccountCandidates(auth, office.state, shortOfficeName(office.field_office));
      if (candidates.length === 0) candidates = await findOfficeAccountCandidates(auth, office.state, "");
      return NextResponse.json({ candidates });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Salesforce error" }, { status: 502 });
    }
  }

  const [{ data: offices }, { data: settings }] = await Promise.all([
    admin.from("b2s_offices").select("id, field_office, state, region, is_active").eq("is_active", true).order("state").order("field_office"),
    admin.from("office_settings").select("office_id, inkind_prefix, cash_prefix, salesforce_account_id, salesforce_account_name, updated_at"),
  ]);
  const byOffice = new Map((settings ?? []).map((s: any) => [s.office_id, s]));
  return NextResponse.json({
    canEdit: access.isAdmin,
    offices: (offices ?? [])
      .filter((o: any) => o.state !== "HQ")
      .map((o: any) => ({ id: o.id, name: o.field_office, state: o.state, region: o.region, ...(byOffice.get(o.id) ?? {}) })),
  });
}

export async function POST(req: Request) {
  const access = await getInkindAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });
  if (!access.isAdmin) return NextResponse.json({ error: "Only admins can change office settings" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!body.office_id) return NextResponse.json({ error: "office_id required" }, { status: 400 });
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: access.employeeId };

  if (body.inkind_prefix !== undefined) {
    const p = String(body.inkind_prefix).trim().toUpperCase();
    if (!/^[A-Z]{2,8}$/.test(p)) return NextResponse.json({ error: "Invoice prefix must be 2–8 letters" }, { status: 400 });
    updates.inkind_prefix = p;
  }
  if (body.cash_prefix !== undefined) {
    const p = String(body.cash_prefix).trim().toUpperCase();
    if (!/^[A-Z]{2,10}$/.test(p)) return NextResponse.json({ error: "Receipt prefix must be 2–10 letters" }, { status: 400 });
    updates.cash_prefix = p;
  }
  if (body.salesforce_account_id !== undefined) {
    const id = String(body.salesforce_account_id ?? "").trim();
    if (id && !/^[A-Za-z0-9]{15}([A-Za-z0-9]{3})?$/.test(id)) {
      return NextResponse.json({ error: "That doesn't look like a Salesforce record ID (15 or 18 characters)" }, { status: 400 });
    }
    updates.salesforce_account_id = id || null;
    updates.salesforce_account_name = id ? String(body.salesforce_account_name ?? "").trim() || null : null;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("office_settings").update(updates).eq("office_id", body.office_id);
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Another office already uses that prefix" }, { status: 400 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
