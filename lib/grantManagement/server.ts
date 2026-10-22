import * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient as rawAdmin, createClient } from "@/lib/supabase/server";
import {
  NO_RECEIPT_KINDS,
  type ExpenseKind,
  type GmRole,
  type GrantSummary,
  type LineSummary,
  type MemberRole,
} from "./shared";

// React.cache dedupes per request in server components; fall back to a
// plain call wherever it isn't available (scripts, older React builds).
const cache: <T extends (...a: never[]) => unknown>(fn: T) => T = (React as unknown as { cache?: <T>(fn: T) => T }).cache ?? ((fn) => fn);

// Typed (loosely) so query rows come back as `any` rows rather than an
// untyped `any` client, which keeps callbacks type-checked.
export const createAdminClient = (): SupabaseClient => rawAdmin() as SupabaseClient;

// Grant Management - server-side access and data helpers.
//
// Who sees what:
//   gm_admin / grant_manager (and every portal admin): every grant.
//   approver / office_user: grants whose office is one of the offices on
//     their gm_user_roles row, plus any grant they're a member of.
// Grant membership can also raise access on one grant (e.g. an office
// user named approver on a single grant) and limit which budget lines
// they may code to.
//
// All writes go through the service-role client after these checks;
// RLS on the gm_ tables only allows reads, scoped the same way.

export const GM_BUCKET = "grant-documents";

export type GmViewer = {
  employeeId: string;
  name: string;
  email: string;
  role: GmRole;
  isManager: boolean;
  isAdmin: boolean;
  officeIds: string[];
  assignedOfficeId: string | null;
};

export type GrantAccess = {
  canView: boolean;
  canEnter: boolean;
  canApprove: boolean;
  canManage: boolean;
  allowedLineIds: string[] | null; // null = all lines
};

type Admin = ReturnType<typeof createAdminClient>;

// cache(): the layout and the page both need it on the same request.
export const getGmViewer = cache(async function getGmViewer(): Promise<GmViewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: emp } = await admin
    .from("employees")
    .select("id, first_name, last_name, email, role, is_active, assigned_office_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!emp || emp.is_active === false) return null;

  const isAdmin = emp.role === "admin";
  const { data: r } = await admin.from("gm_user_roles").select("role, office_ids, is_active").eq("employee_id", emp.id).maybeSingle();

  let role: GmRole | null = null;
  if (isAdmin) role = "gm_admin";
  else if (r?.is_active) role = r.role as GmRole;
  if (!role) {
    // Not set up in Grant Management, but named on a grant - give them
    // an office-user view limited to those grants.
    const { count } = await admin.from("gm_grant_members").select("grant_id", { count: "exact", head: true }).eq("employee_id", emp.id);
    if (!count) return null;
    role = "office_user";
  }

  return {
    employeeId: emp.id,
    name: `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim(),
    email: emp.email,
    role,
    isAdmin: isAdmin || role === "gm_admin",
    isManager: role === "gm_admin" || role === "grant_manager",
    officeIds: (r?.is_active ? (r.office_ids as string[]) : []) ?? [],
    assignedOfficeId: emp.assigned_office_id ?? null,
  };
});

// Paginate past PostgREST's 1,000-row cap.
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}

// Grant ids this person can see; null means all grants.
export async function visibleGrantIds(viewer: GmViewer, admin: Admin = createAdminClient()): Promise<string[] | null> {
  if (viewer.isManager) return null;
  const ids = new Set<string>();
  const { data: mem } = await admin.from("gm_grant_members").select("grant_id").eq("employee_id", viewer.employeeId);
  (mem ?? []).forEach((m: { grant_id: string }) => ids.add(m.grant_id));
  if (viewer.officeIds.length) {
    const { data: g } = await admin.from("gm_grants").select("id").in("office_id", viewer.officeIds);
    (g ?? []).forEach((x: { id: string }) => ids.add(x.id));
  }
  return [...ids];
}

const RANK: Record<string, number> = { viewer: 1, office_user: 2, approver: 3, grant_manager: 4 };

export async function grantAccess(viewer: GmViewer, grantId: string, admin: Admin = createAdminClient()): Promise<GrantAccess> {
  if (viewer.isManager) return { canView: true, canEnter: true, canApprove: true, canManage: true, allowedLineIds: null };
  const none: GrantAccess = { canView: false, canEnter: false, canApprove: false, canManage: false, allowedLineIds: null };

  const [{ data: grant }, { data: member }] = await Promise.all([
    admin.from("gm_grants").select("office_id").eq("id", grantId).maybeSingle(),
    admin.from("gm_grant_members").select("role, allowed_line_ids").eq("grant_id", grantId).eq("employee_id", viewer.employeeId).maybeSingle(),
  ]);
  if (!grant) return none;

  let rank = 0;
  if (grant.office_id && viewer.officeIds.includes(grant.office_id)) {
    rank = viewer.role === "approver" ? RANK.approver : RANK.office_user;
  }
  if (member) rank = Math.max(rank, RANK[member.role as MemberRole] ?? 0);
  if (!rank) return none;

  return {
    canView: true,
    canEnter: rank >= RANK.office_user,
    canApprove: rank >= RANK.approver,
    canManage: rank >= RANK.grant_manager,
    allowedLineIds: member?.allowed_line_ids && (member.allowed_line_ids as string[]).length ? (member.allowed_line_ids as string[]) : null,
  };
}

export async function loadGrantSummaries(viewer: GmViewer, admin: Admin = createAdminClient()): Promise<GrantSummary[]> {
  const ids = await visibleGrantIds(viewer, admin);
  if (ids && ids.length === 0) return [];
  const rows = await fetchAll<GrantSummary>((from, to) => {
    let q = admin.from("gm_grant_summary").select("*").order("end_date").range(from, to);
    if (ids) q = q.in("id", ids);
    return q;
  });
  return rows.map(numify);
}

export async function loadLineSummaries(grantIds: string[] | null, admin: Admin = createAdminClient()): Promise<LineSummary[]> {
  if (grantIds && grantIds.length === 0) return [];
  const rows = await fetchAll<LineSummary>((from, to) => {
    let q = admin.from("gm_line_summary").select("*").order("sort_order").range(from, to);
    if (grantIds) q = q.in("grant_id", grantIds);
    return q;
  });
  return rows.map(numify);
}

const NUM_KEYS = [
  "award_amount",
  "doc_required_over",
  "total_budget",
  "actual",
  "pending",
  "remaining",
  "pct_spent",
  "pct_time_elapsed",
  "days_left",
  "missing_docs",
  "expense_count",
  "over_budget_lines",
  "budget",
  "original_budget",
];
function numify<T>(row: T): T {
  const r = { ...(row as Record<string, unknown>) };
  for (const k of NUM_KEYS) if (k in r && r[k] != null) r[k] = Number(r[k]);
  return r as T;
}

// ---------- audit ----------
export async function audit(
  admin: Admin,
  e: { entity: string; entityId?: string | null; grantId?: string | null; action: string; actorId: string; changes?: unknown; note?: string | null }
) {
  await admin.from("gm_audit_log").insert({
    entity: e.entity,
    entity_id: e.entityId ?? null,
    grant_id: e.grantId ?? null,
    action: e.action,
    actor_id: e.actorId,
    changes: e.changes ?? null,
    note: e.note ?? null,
  });
}

export function diff(before: Record<string, unknown>, after: Record<string, unknown>, keys: string[]) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of keys) {
    if (!(k in after)) continue;
    const a = before[k] ?? null;
    const b = after[k] ?? null;
    if (String(a) !== String(b)) out[k] = { from: a, to: b };
  }
  return out;
}

// ---------- expense validation ----------
export type ExpenseInput = {
  grant_id: string;
  line_id: string;
  expense_date: string;
  vendor?: string | null;
  amount: number;
  description: string;
  office_id?: string | null;
  program?: string | null;
  kind?: ExpenseKind;
  payment_method?: string | null;
  external_ref?: string | null;
};

type GrantRow = {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  office_id: string | null;
  program: string;
  doc_required_over: number;
  approval_required: boolean;
};

export function cleanExpenseInput(body: Record<string, unknown>): { input?: ExpenseInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const amount = Math.round(Number(body.amount) * 100) / 100;
  const date = str(body.expense_date);
  const kind = (str(body.kind) ?? "purchase") as ExpenseKind;
  if (!str(body.grant_id)) errors.grant_id = "Pick the grant.";
  if (!str(body.line_id)) errors.line_id = "Pick the budget category.";
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.expense_date = "Enter the expense date.";
  if (!Number.isFinite(amount) || amount === 0) errors.amount = "Enter the amount.";
  if (!str(body.description)) errors.description = "Say what this was for.";
  if (!["purchase", "payroll", "fringe", "allocation", "indirect", "other"].includes(kind)) errors.kind = "Unknown expense type.";
  if (kind === "purchase" && !str(body.vendor)) errors.vendor = "Enter the vendor.";
  const pm = str(body.payment_method);
  if (pm && !["pex", "corporate_card", "check", "ach", "reimbursement", "payroll", "journal", "other"].includes(pm)) errors.payment_method = "Unknown payment method.";
  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    input: {
      grant_id: str(body.grant_id)!,
      line_id: str(body.line_id)!,
      expense_date: date!,
      vendor: str(body.vendor),
      amount,
      description: str(body.description)!.slice(0, 500),
      office_id: str(body.office_id),
      program: str(body.program),
      kind,
      payment_method: pm,
      external_ref: str(body.external_ref),
    },
  };
}

// Checks against the grant itself. Returns field errors, plus the
// computed doc_required flag.
export async function checkExpenseAgainstGrant(
  admin: Admin,
  input: ExpenseInput,
  access: GrantAccess
): Promise<{ errors: Record<string, string>; grant?: GrantRow; docRequired: boolean }> {
  const errors: Record<string, string> = {};
  const [{ data: grant }, { data: line }] = await Promise.all([
    admin.from("gm_grants").select("id, status, start_date, end_date, office_id, program, doc_required_over, approval_required").eq("id", input.grant_id).maybeSingle(),
    admin.from("gm_budget_lines").select("id, grant_id, is_active").eq("id", input.line_id).maybeSingle(),
  ]);
  if (!grant || !access.canEnter) {
    errors.grant_id = "You can't enter expenses on that grant.";
    return { errors, docRequired: true };
  }
  if (grant.status !== "active") errors.grant_id = grant.status === "closed" ? "This grant is closed." : "This grant isn't open for spending yet.";
  if (!line || line.grant_id !== grant.id || !line.is_active) errors.line_id = "That category isn't in this grant's budget.";
  else if (access.allowedLineIds && !access.allowedLineIds.includes(line.id)) errors.line_id = "You aren't set up to code expenses to that category.";
  if (input.expense_date < grant.start_date || input.expense_date > grant.end_date) {
    errors.expense_date = `Must be within the grant period (${grant.start_date} to ${grant.end_date}).`;
  }
  const docRequired = docRequiredFor(input.kind ?? "purchase", input.amount, Number(grant.doc_required_over));
  return { errors, grant: grant as GrantRow, docRequired };
}

export function docRequiredFor(kind: ExpenseKind, amount: number, threshold: number) {
  if (NO_RECEIPT_KINDS.includes(kind)) return false;
  return Math.abs(amount) > threshold;
}

// Employees by id -> display name.
export async function nameMap(admin: Admin, ids: (string | null | undefined)[]) {
  const uniq = [...new Set(ids.filter(Boolean) as string[])];
  if (!uniq.length) return new Map<string, string>();
  const { data } = await admin.from("employees").select("id, first_name, last_name").in("id", uniq);
  return new Map((data ?? []).map((e: { id: string; first_name: string; last_name: string }) => [e.id, `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim()]));
}

export async function loadOffices(admin: Admin = createAdminClient()) {
  const { data } = await admin.from("b2s_offices").select("id, field_office, region, state, chapter").eq("is_active", true).order("field_office");
  return (data ?? []) as { id: string; field_office: string; region: string; state: string | null; chapter: string | null }[];
}

// Makes the Grant Management tile show on the person's portal home.
export async function ensureAppAccess(admin: Admin, employeeIds: string[]) {
  if (!employeeIds.length) return;
  await admin
    .from("employee_program_access")
    .upsert(
      employeeIds.map((id) => ({ employee_id: id, program_slug: "grant-management" })),
      { onConflict: "employee_id,program_slug", ignoreDuplicates: true }
    );
}

export async function loadGrantSummary(id: string, admin: Admin = createAdminClient()): Promise<GrantSummary | null> {
  const { data } = await admin.from("gm_grant_summary").select("*").eq("id", id).maybeSingle();
  return data ? numify(data as GrantSummary) : null;
}

export type EntryGrant = {
  id: string;
  code: string;
  name: string;
  office_id: string | null;
  program: string;
  start_date: string;
  end_date: string;
  doc_required_over: number;
  status: string;
  lines: { id: string; category: string; subcategory: string | null }[];
};

// Grants this person can enter expenses on, with the budget lines they
// may use. includeIds keeps an expense's current grant in the list even
// if it's no longer open (so an edit form can still show it).
export async function loadEntryGrants(viewer: GmViewer, includeIds: string[] = [], admin: Admin = createAdminClient()): Promise<EntryGrant[]> {
  const ids = await visibleGrantIds(viewer, admin);
  if (ids && !ids.length && !includeIds.length) return [];
  let q = admin.from("gm_grants").select("id, code, name, office_id, program, start_date, end_date, doc_required_over, status").order("code");
  if (ids) q = q.in("id", [...new Set([...ids, ...includeIds])]);
  const { data: grants } = await q;
  const list = (grants ?? []).filter((g: { status: string; id: string }) => g.status === "active" || includeIds.includes(g.id));
  if (!list.length) return [];

  const { data: members } = viewer.isManager ? { data: [] } : await admin.from("gm_grant_members").select("grant_id, role, allowed_line_ids").eq("employee_id", viewer.employeeId);
  const mem = new Map((members ?? []).map((m: { grant_id: string; role: string; allowed_line_ids: string[] | null }) => [m.grant_id, m]));
  const { data: lines } = await admin
    .from("gm_budget_lines")
    .select("id, grant_id, category, subcategory, sort_order")
    .in("grant_id", list.map((g: { id: string }) => g.id))
    .eq("is_active", true)
    .order("sort_order");

  const out: EntryGrant[] = [];
  for (const g of list as (Omit<EntryGrant, "lines">)[]) {
    let allowed: string[] | null = null;
    if (!viewer.isManager) {
      const m = mem.get(g.id);
      const viaOffice = !!g.office_id && viewer.officeIds.includes(g.office_id);
      const canEnter = viaOffice || (m && m.role !== "viewer");
      if (!canEnter && !includeIds.includes(g.id)) continue;
      allowed = m?.allowed_line_ids?.length ? m.allowed_line_ids : null;
    }
    out.push({
      ...g,
      doc_required_over: Number(g.doc_required_over),
      lines: (lines ?? [])
        .filter((l: { grant_id: string; id: string }) => l.grant_id === g.id && (!allowed || allowed.includes(l.id)))
        .map((l: { id: string; category: string; subcategory: string | null }) => ({ id: l.id, category: l.category, subcategory: l.subcategory })),
    });
  }
  return out;
}
