import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { financeGate, isResponse } from "@/lib/finance/access";
import { loadOffices, officeKey } from "@/lib/finance/expenses";

export const dynamic = "force-dynamic";

// QuickBooks class → office / grant / central department.
export async function GET() {
  const gate = await financeGate();
  if (isResponse(gate)) return gate;
  const admin = createAdminClient();
  const [{ data }, { list: offices }, { data: depts }] = await Promise.all([
    admin.from("fin_qb_class_map").select("*").order("qb_class"),
    loadOffices(),
    admin.from("fin_expense_rows").select("department, subhead").eq("scope", "central").limit(2000),
  ]);
  const departments = [...new Map<string, { department: string; subhead: string }>((depts ?? []).map((d: any) => [`${d.department}|${d.subhead}`, { department: d.department as string, subhead: d.subhead as string }])).values()].sort(
    (a, b) => a.department.localeCompare(b.department) || a.subhead.localeCompare(b.subhead)
  );
  return NextResponse.json({ mappings: data ?? [], offices, departments });
}

// PUT { qb_class, target, office_name?, department?, subhead?, also_office? }
export async function PUT(req: NextRequest) {
  const gate = await financeGate();
  if (isResponse(gate)) return gate;
  const b = await req.json().catch(() => ({}));
  const qb_class = String(b.qb_class ?? "").trim();
  const target = String(b.target ?? "");
  if (!qb_class || !["office", "grant", "central", "ignore", "review"].includes(target)) return NextResponse.json({ error: "Bad mapping" }, { status: 400 });
  let office_id: string | null = null;
  let office_name: string | null = null;
  if (target === "office" || target === "grant") {
    const { byKey } = await loadOffices();
    const o = byKey.get(officeKey(String(b.office_name ?? "")));
    office_name = o?.name ?? (String(b.office_name ?? "").trim() || null);
    office_id = o?.id ?? null;
    if (!office_name) return NextResponse.json({ error: "Pick an office" }, { status: 400 });
  }
  if (target === "central" && !String(b.department ?? "").trim()) return NextResponse.json({ error: "Enter the central department" }, { status: 400 });
  const { error } = await createAdminClient()
    .from("fin_qb_class_map")
    .upsert(
      {
        qb_class,
        target,
        office_id,
        office_name,
        department: target === "central" ? String(b.department).trim().toUpperCase() : null,
        subhead: target === "central" ? String(b.subhead || b.department).trim().toUpperCase() : null,
        also_office: b.also_office !== false,
        updated_by: gate.employeeId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "qb_class" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
