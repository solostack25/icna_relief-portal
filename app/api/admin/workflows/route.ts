import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { EDITABLE_SETTINGS, type ListKey } from "@/lib/workflows";
import { WF_DEFAULTS } from "@/lib/workflowSettings";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from("employees").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  return me?.role === "admin" ? me : null;
}

type ListMode = "employees" | "people" | "limits" | "recipients" | "readonly" | "delegates";
type ListRow = { id: string; primary: string; secondary?: string | null; active?: boolean; limit?: number | null; csuite?: boolean; emails?: string[] };

const name = (e: any) => `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || e.email;
const HELPDESK_LISTS: Record<string, string> = { helpdesk_it: "helpdesk-it", helpdesk_hr: "helpdesk-hr", helpdesk_marketing: "helpdesk-marketing", helpdesk_finance: "helpdesk-finance" };
const EMP_FLAG_LISTS: Record<string, "is_zakat_finance" | "is_cio"> = { zakat_finance_staff: "is_zakat_finance", fundraiser_approvers: "is_cio" };
const UUID = /^[0-9a-f-]{36}$/i;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

async function count(q: PromiseLike<{ count: number | null }>) {
  return (await q).count ?? 0;
}

// GET                → counts, settings and every list for the Workflows screen
// GET ?search=name   → employee search for adding people to a list
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const admin = createAdminClient();

  const search = req.nextUrl.searchParams.get("search");
  if (search !== null) {
    const q = search.trim().replace(/[%,()]/g, "");
    if (q.length < 2) return NextResponse.json({ employees: [] });
    const { data } = await admin
      .from("employees")
      .select("id, first_name, last_name, email, job_title")
      .neq("is_active", false)
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
      .order("first_name")
      .limit(8);
    return NextResponse.json({ employees: (data ?? []).map((e: any) => ({ id: e.id, name: name(e), email: e.email, title: e.job_title })) });
  }

  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const legs = (status: string | string[]) => {
    let q = admin.from("helpdesk_request_legs").select("id", { count: "exact", head: true }).neq("department", "finance");
    q = Array.isArray(status) ? q.in("status", status) : q.eq("status", status);
    return q;
  };

  const [
    hd_open, hd_in_progress, hd_on_hold, hd_closed_30d,
    fin_awaiting, fin_fixing, fin_ready, fin_processing, fin_paid_30d,
    irfas_pending, irfas_approved, irfas_paid_30d,
    spk_pending_am, spk_pending_leadership, spk_approved,
    b2s_sub, drs_sub, fate_sub, b2s_flag, drs_flag, fate_flag,
    fund_pending, fund_approved, th_pending,
    res_submitted, res_review, res_carrier, res_bound,
    vol_upcoming, ik_active, ik_signature, ik_completed_30d,
    hw_pending_steps, hw_approved_legs,
  ] = await Promise.all([
    count(legs("open")),
    count(legs("in_progress")),
    count(legs(["on_hold", "quality_assurance"])),
    count(admin.from("helpdesk_request_legs").select("id", { count: "exact", head: true }).neq("department", "finance").eq("status", "closed").gte("closed_at", since30)),
    count(admin.from("finance_tickets").select("id", { count: "exact", head: true }).eq("status", "pending")),
    count(admin.from("finance_tickets").select("id", { count: "exact", head: true }).eq("status", "fixing")),
    count(admin.from("finance_tickets").select("id", { count: "exact", head: true }).eq("status", "open")),
    count(admin.from("finance_tickets").select("id", { count: "exact", head: true }).eq("status", "in_progress")),
    count(admin.from("finance_tickets").select("id", { count: "exact", head: true }).eq("status", "processed").gte("technician_ended_at", since30)),
    count(admin.from("zakat_applications").select("id", { count: "exact", head: true }).eq("status", "pending").is("voided_at", null)),
    count(admin.from("zakat_applications").select("id", { count: "exact", head: true }).eq("status", "approved").is("voided_at", null)),
    count(admin.from("zakat_applications").select("id", { count: "exact", head: true }).eq("status", "paid").gte("paid_at", since30)),
    count(admin.from("speaker_requests").select("id", { count: "exact", head: true }).eq("status", "pending_am")),
    count(admin.from("speaker_requests").select("id", { count: "exact", head: true }).eq("status", "pending_leadership")),
    count(admin.from("speaker_requests").select("id", { count: "exact", head: true }).eq("status", "approved").gte("event_at", new Date().toISOString())),
    count(admin.from("b2s_submissions").select("id", { count: "exact", head: true }).eq("status", "submitted")),
    count(admin.from("drs_submissions").select("id", { count: "exact", head: true }).eq("status", "submitted")),
    count(admin.from("fate_submissions").select("id", { count: "exact", head: true }).eq("status", "submitted")),
    count(admin.from("b2s_submissions").select("id", { count: "exact", head: true }).eq("status", "flagged")),
    count(admin.from("drs_submissions").select("id", { count: "exact", head: true }).eq("status", "flagged")),
    count(admin.from("fate_submissions").select("id", { count: "exact", head: true }).eq("status", "flagged")),
    count(admin.from("fundraisers").select("id", { count: "exact", head: true }).eq("approval_status", "pending_review")),
    count(admin.from("fundraisers").select("id", { count: "exact", head: true }).eq("approval_status", "approved")),
    count(admin.from("th_readmission_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
    count(admin.from("res_insurance_requests").select("id", { count: "exact", head: true }).eq("status", "submitted")),
    count(admin.from("res_insurance_requests").select("id", { count: "exact", head: true }).in("status", ["under_review", "needs_correction"])),
    count(admin.from("res_insurance_requests").select("id", { count: "exact", head: true }).in("status", ["sent_to_carrier", "pending_response"])),
    count(admin.from("res_insurance_requests").select("id", { count: "exact", head: true }).in("status", ["bound", "closed"])),
    count(admin.from("volunteer_events").select("id", { count: "exact", head: true }).eq("is_published", true).gte("starts_at", new Date().toISOString())),
    count(admin.from("sessions").select("id", { count: "exact", head: true }).eq("status", "active")),
    count(admin.from("sessions").select("id", { count: "exact", head: true }).eq("status", "awaiting_signature")),
    count(admin.from("sessions").select("id", { count: "exact", head: true }).eq("status", "completed").gte("completed_at", since30)),
    // Hardware purchases (tables may not exist until the migration runs - treat as empty).
    Promise.resolve(admin.from("helpdesk_hardware_approvals").select("stage, leg_id").eq("decision", "pending")).then((r) => r.data ?? []),
    Promise.resolve(
      admin.from("helpdesk_request_legs").select("id").eq("hardware_gate", true).eq("hardware_approval_status", "approved").not("status", "in", "(closed,handed_off)")
    ).then((r) => r.data ?? []),
  ]);
  const hwLegIds = (hw_approved_legs as { id: string }[]).map((l) => l.id);
  const { data: hwInvoiced } = hwLegIds.length
    ? await admin.from("helpdesk_attachments").select("leg_id").eq("kind", "invoice").in("leg_id", hwLegIds)
    : { data: [] as { leg_id: string }[] };
  const hwInvoicedSet = new Set(((hwInvoiced ?? []) as { leg_id: string }[]).map((r) => r.leg_id));

  const counts = {
    hd_open, hd_in_progress, hd_on_hold, hd_closed_30d,
    fin_awaiting, fin_fixing, fin_ready, fin_processing, fin_paid_30d,
    irfas_pending, irfas_approved, irfas_paid_30d,
    spk_pending_am, spk_pending_leadership, spk_approved,
    rev_submitted: b2s_sub + drs_sub + fate_sub,
    rev_flagged: b2s_flag + drs_flag + fate_flag,
    fund_pending, fund_approved, th_pending,
    res_submitted, res_review, res_carrier, res_bound,
    vol_upcoming, ik_active, ik_signature, ik_completed_30d,
    hw_pending_supervisor: new Set((hw_pending_steps as { stage: string; leg_id: string }[]).filter((s) => s.stage === "supervisor").map((s) => s.leg_id)).size,
    hw_pending_executive: new Set((hw_pending_steps as { stage: string; leg_id: string }[]).filter((s) => s.stage === "executive").map((s) => s.leg_id)).size,
    hw_needs_invoice: hwLegIds.filter((id) => !hwInvoicedSet.has(id)).length,
  };

  // Settings (allow-listed keys only — never the credential rows)
  const { data: settingRows } = await admin.from("integration_settings").select("key, value, updated_at").in("key", [...EDITABLE_SETTINGS]);
  const saved = new Map((settingRows ?? []).map((r: any) => [r.key, r]));
  const settings = Object.fromEntries(
    EDITABLE_SETTINGS.map((k) => {
      const def = (WF_DEFAULTS as Record<string, string>)[k] ?? "";
      const row: any = saved.get(k);
      return [k, { value: row?.value ?? "", default: def, updated_at: row?.updated_at ?? null }];
    })
  );

  // Lists
  const [limits, delegates, zApprovers, flagged, leaders, rds, access, recipients, reviewers, ams] = await Promise.all([
    admin.from("employees").select("id, first_name, last_name, email, job_title, monetary_limit, is_csuite").or("monetary_limit.not.is.null,is_csuite.eq.true").order("monetary_limit", { ascending: false, nullsFirst: false }),
    admin.from("finance_approval_delegates").select("id, original_name, original_email, delegate_name, delegate_email, starts_at, ends_at").or(`ends_at.is.null,ends_at.gte.${new Date().toISOString()}`),
    admin.from("zakat_approvers").select("id, full_name, email, is_active").order("full_name"),
    admin.from("employees").select("id, first_name, last_name, email, job_title, is_zakat_finance, is_cio").or("is_zakat_finance.eq.true,is_cio.eq.true"),
    admin.from("speaker_leadership_approvers").select("id, full_name, email, role_label, is_active").order("full_name"),
    admin.from("employees").select("id, first_name, last_name, email, assigned_region").eq("role", "regional_director").neq("is_active", false).order("assigned_region"),
    admin.from("employee_program_access").select("employee_id, program_slug, employees:employee_id(first_name, last_name, email, job_title)").in("program_slug", Object.values(HELPDESK_LISTS)),
    admin.from("res_notification_recipients").select("department, emails").order("department"),
    admin.from("employees").select("id, first_name, last_name, email, role, assigned_region").in("role", ["admin", "regional_director", "program_director"]).neq("is_active", false).order("role"),
    admin.from("employees").select("id, first_name, last_name, email, assigned_region").eq("role", "area_manager").neq("is_active", false).order("assigned_region"),
  ]);

  const lists: Record<ListKey, { mode: ListMode; rows: ListRow[] }> = {
    finance_limits: {
      mode: "limits",
      rows: (limits.data ?? []).map((e: any) => ({ id: e.id, primary: name(e), secondary: e.job_title ?? e.email, limit: e.monetary_limit == null ? null : Number(e.monetary_limit), csuite: !!e.is_csuite })),
    },
    finance_delegates: {
      mode: "delegates",
      rows: (delegates.data ?? []).map((d: any) => ({
        id: d.id,
        primary: `${d.delegate_name ?? d.delegate_email} covers ${d.original_name ?? d.original_email}`,
        secondary: `${new Date(d.starts_at).toLocaleDateString()} – ${d.ends_at ? new Date(d.ends_at).toLocaleDateString() : "until removed"}`,
      })),
    },
    zakat_approvers: { mode: "people", rows: (zApprovers.data ?? []).map((r: any) => ({ id: r.id, primary: r.full_name, secondary: r.email, active: r.is_active })) },
    zakat_finance_staff: { mode: "employees", rows: (flagged.data ?? []).filter((e: any) => e.is_zakat_finance).map((e: any) => ({ id: e.id, primary: name(e), secondary: e.job_title ?? e.email })) },
    fundraiser_approvers: { mode: "employees", rows: (flagged.data ?? []).filter((e: any) => e.is_cio).map((e: any) => ({ id: e.id, primary: name(e), secondary: e.job_title ?? e.email })) },
    speaker_leadership: { mode: "people", rows: (leaders.data ?? []).map((r: any) => ({ id: r.id, primary: r.full_name, secondary: [r.role_label, r.email].filter(Boolean).join(" · "), active: r.is_active })) },
    speaker_regional_directors: { mode: "readonly", rows: (rds.data ?? []).map((e: any) => ({ id: e.id, primary: name(e), secondary: e.assigned_region ?? "No region assigned" })) },
    helpdesk_it: { mode: "employees", rows: [] },
    helpdesk_hr: { mode: "employees", rows: [] },
    helpdesk_marketing: { mode: "employees", rows: [] },
    helpdesk_finance: { mode: "employees", rows: [] },
    resource_recipients: { mode: "recipients", rows: (recipients.data ?? []).map((r: any) => ({ id: r.department, primary: r.department, emails: r.emails ?? [] })) },
    reviewers: { mode: "readonly", rows: (reviewers.data ?? []).map((e: any) => ({ id: e.id, primary: name(e), secondary: `${String(e.role).replace(/_/g, " ")}${e.assigned_region ? ` · ${e.assigned_region}` : ""}` })) },
    area_managers: { mode: "readonly", rows: (ams.data ?? []).map((e: any) => ({ id: e.id, primary: name(e), secondary: e.assigned_region ?? "No region assigned" })) },
  };
  for (const [listKey, slug] of Object.entries(HELPDESK_LISTS)) {
    lists[listKey as ListKey].rows = (access.data ?? [])
      .filter((a: any) => a.program_slug === slug && a.employees)
      .map((a: any) => ({ id: a.employee_id, primary: name(a.employees), secondary: a.employees.job_title ?? a.employees.email }))
      .sort((x: ListRow, y: ListRow) => x.primary.localeCompare(y.primary));
  }

  return NextResponse.json({ counts, settings, lists });
}

// POST actions:
//   { action: "set_setting", key, value }            value "" resets to default
//   { action: "list_add", list, employee_id? , full_name?, email?, role_label?, limit? }
//   { action: "list_remove", list, id }
//   { action: "list_toggle", list, id, active }
//   { action: "set_limit", id, limit, csuite? }       finance approver dollar limit
//   { action: "set_recipients", department, emails }
export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient();
  const list = String(body.list ?? "");

  try {
    if (body.action === "set_setting") {
      const key = String(body.key ?? "");
      if (!(EDITABLE_SETTINGS as readonly string[]).includes(key)) return NextResponse.json({ error: "That setting can't be edited here" }, { status: 400 });
      const value = String(body.value ?? "").trim();
      if (value === "") {
        const { error } = await admin.from("integration_settings").delete().eq("key", key);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, reset: true });
      }
      if (/(_email|_mailbox)$/.test(key) && !EMAIL.test(value)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
      if (key === "zakat_finance_emails" && !value.split(",").every((e) => EMAIL.test(e.trim()))) return NextResponse.json({ error: "Enter email addresses separated by commas" }, { status: 400 });
      if (/(_limit|_threshold|_hours)$/.test(key) && !(Number(value) > 0)) return NextResponse.json({ error: "Enter a number above zero" }, { status: 400 });
      const { error } = await admin.from("integration_settings").upsert({ key, value, updated_by: me.id, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "set_limit") {
      if (!UUID.test(String(body.id))) return NextResponse.json({ error: "Pick an employee" }, { status: 400 });
      const limit = body.limit === null || body.limit === "" ? null : Number(body.limit);
      if (limit !== null && !(limit >= 0)) return NextResponse.json({ error: "Enter a dollar amount" }, { status: 400 });
      const updates: Record<string, unknown> = { monetary_limit: limit };
      if (typeof body.csuite === "boolean") updates.is_csuite = body.csuite;
      const { error } = await admin.from("employees").update(updates).eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "set_recipients") {
      const emails: string[] = (Array.isArray(body.emails) ? body.emails : String(body.emails ?? "").split(/[,\n;]/)).map((e: string) => e.trim()).filter(Boolean);
      if (!emails.every((e) => EMAIL.test(e))) return NextResponse.json({ error: "One of those isn't a valid email" }, { status: 400 });
      const { error } = await admin.from("res_notification_recipients").update({ emails, updated_by: me.id, updated_at: new Date().toISOString() }).eq("department", String(body.department));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "list_add") {
      if (list === "zakat_approvers" || list === "speaker_leadership") {
        const full_name = String(body.full_name ?? "").trim();
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!full_name || !EMAIL.test(email)) return NextResponse.json({ error: "Enter a name and a valid email" }, { status: 400 });
        const row: Record<string, unknown> = { full_name, email, is_active: true, added_by: me.id };
        if (list === "speaker_leadership") row.role_label = String(body.role_label ?? "").trim() || null;
        const { error } = await admin.from(list === "zakat_approvers" ? "zakat_approvers" : "speaker_leadership_approvers").insert(row);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }
      const empId = String(body.employee_id ?? "");
      if (!UUID.test(empId)) return NextResponse.json({ error: "Pick an employee" }, { status: 400 });
      if (HELPDESK_LISTS[list]) {
        const { error } = await admin.from("employee_program_access").upsert({ employee_id: empId, program_slug: HELPDESK_LISTS[list] }, { onConflict: "employee_id,program_slug" });
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }
      if (EMP_FLAG_LISTS[list]) {
        const { error } = await admin.from("employees").update({ [EMP_FLAG_LISTS[list]]: true }).eq("id", empId);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }
      if (list === "finance_limits") {
        const limit = Number(body.limit);
        if (!(limit >= 0)) return NextResponse.json({ error: "Enter their approval limit" }, { status: 400 });
        const { error } = await admin.from("employees").update({ monetary_limit: limit }).eq("id", empId);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ error: "People can't be added to this list here" }, { status: 400 });
    }

    if (body.action === "list_remove") {
      const id = String(body.id ?? "");
      if (list === "zakat_approvers" || list === "speaker_leadership") {
        const { error } = await admin.from(list === "zakat_approvers" ? "zakat_approvers" : "speaker_leadership_approvers").delete().eq("id", id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }
      if (!UUID.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
      if (HELPDESK_LISTS[list]) {
        const { error } = await admin.from("employee_program_access").delete().eq("employee_id", id).eq("program_slug", HELPDESK_LISTS[list]);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }
      if (EMP_FLAG_LISTS[list]) {
        const { error } = await admin.from("employees").update({ [EMP_FLAG_LISTS[list]]: false }).eq("id", id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }
      if (list === "finance_limits") {
        const { error } = await admin.from("employees").update({ monetary_limit: null, is_csuite: false }).eq("id", id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ error: "People can't be removed from this list here" }, { status: 400 });
    }

    if (body.action === "list_toggle") {
      if (list !== "zakat_approvers" && list !== "speaker_leadership") return NextResponse.json({ error: "Not supported" }, { status: 400 });
      const { error } = await admin
        .from(list === "zakat_approvers" ? "zakat_approvers" : "speaker_leadership_approvers")
        .update({ is_active: !!body.active })
        .eq("id", String(body.id));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
