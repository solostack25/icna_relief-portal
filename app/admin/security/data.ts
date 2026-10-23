import { createAdminClient } from "@/lib/supabase/server";

// Server loaders shared by the Security pages.

export type SecRun = { started_at: string; finished_at: string | null; status: string; errors: Record<string, string> | null; counts: Record<string, number> | null };

export async function lastSecuritySync(): Promise<SecRun | null> {
  const { data } = await createAdminClient()
    .from("sec_sync_runs")
    .select("started_at, finished_at, status, errors, counts")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SecRun) ?? null;
}

export async function fetchAllRows<T>(table: string, select: string, build?: (q: any) => any): Promise<T[]> {
  const admin = createAdminClient();
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = admin.from(table).select(select);
    if (build) q = build(q);
    const { data, error } = await q.range(from, from + 999);
    if (error) break;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export type MfaPerson = {
  user_id: string;
  upn: string;
  name: string;
  office: string | null;
  department: string | null;
  isAdmin: boolean;
  registered: boolean;
  capable: boolean;
  methods: string[];
  defaultMethod: string | null;
  lastSignIn: string | null;
  hasIntune: boolean;
};

// Licensed, enabled staff accounts with their MFA registration. Guests,
// shared mailboxes and leavers (no license / disabled) are left out.
export async function loadMfaPeople(): Promise<MfaPerson[]> {
  type Reg = { user_id: string; upn: string; display_name: string | null; is_admin: boolean | null; is_mfa_registered: boolean | null; is_mfa_capable: boolean | null; methods: string[]; default_method: string | null; user_type: string | null };
  type Dir = { entra_user_id: string; office_location: string | null; department: string | null; account_enabled: boolean | null; sku_ids: string[]; last_sign_in: string | null; has_intune: boolean };
  const [regs, dir] = await Promise.all([
    fetchAllRows<Reg>("sec_mfa_registration", "user_id, upn, display_name, is_admin, is_mfa_registered, is_mfa_capable, methods, default_method, user_type"),
    fetchAllRows<Dir>("it_directory_users", "entra_user_id, office_location, department, account_enabled, sku_ids, last_sign_in, has_intune"),
  ]);
  const byId = new Map(dir.map((d) => [d.entra_user_id, d]));
  return regs
    .filter((r) => (r.user_type ?? "member").toLowerCase() === "member")
    .map((r) => ({ r, d: byId.get(r.user_id) }))
    .filter(({ r, d }) => (d ? d.account_enabled !== false && d.sku_ids.length > 0 : !!r.is_admin))
    .map(({ r, d }) => ({
      user_id: r.user_id,
      upn: r.upn,
      name: r.display_name ?? r.upn,
      office: d?.office_location ?? null,
      department: d?.department ?? null,
      isAdmin: !!r.is_admin,
      registered: !!r.is_mfa_registered,
      capable: !!r.is_mfa_capable,
      methods: r.methods ?? [],
      defaultMethod: r.default_method,
      lastSignIn: d?.last_sign_in ?? null,
      hasIntune: !!d?.has_intune,
    }));
}

export { METHOD_LABELS } from "./methods";
