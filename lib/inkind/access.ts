import { createClient } from "@/lib/supabase/server";

// Shared authorization for the InKind admin/ops app. The page-level gate
// (app/admin/inkind/layout.tsx) only covers page navigation - it does NOT
// cover direct calls to /api/inkind-admin/* routes, which are independently
// reachable by anyone with a valid portal session. These helpers close that
// gap and are the single place office/program access is decided, so the
// page gate and every API route agree.

export type InkindAccess =
  | { ok: false; status: 401 | 403 }
  | {
      ok: true;
      employeeId: string;
      isAdmin: boolean;
      assignedOfficeId: string | null;
      assignedRegion: string | null;
    };

// Does the current user have any access to /admin/inkind at all (admin,
// or explicitly granted the 'in-kind-donation' program)? Use this at the
// top of every /api/inkind-admin/* route, and in the page layout.
export async function getInkindAccess(): Promise<InkindAccess> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };

  const { data: employee } = await supabase
    .from("employees")
    .select("id, role, assigned_office_id, assigned_region")
    .eq("auth_user_id", user.id)
    .single();
  if (!employee) return { ok: false, status: 401 };

  const isAdmin = employee.role === "admin";

  if (!isAdmin) {
    const { data: access } = await supabase
      .from("employee_program_access")
      .select("program_slug")
      .eq("employee_id", employee.id)
      .eq("program_slug", "in-kind-donation")
      .maybeSingle();
    if (!access) return { ok: false, status: 403 };
  }

  return {
    ok: true,
    employeeId: employee.id,
    isAdmin,
    assignedOfficeId: employee.assigned_office_id,
    assignedRegion: employee.assigned_region,
  };
}

// For routes that act on ONE specific session (invoices, Salesforce push,
// resend-email) - these use the service-role client internally, which
// bypasses the RLS added on sessions/donations, so office scoping has to
// be re-checked explicitly here rather than relied on from the DB layer.
//
// Delegates to the RLS-scoped client rather than re-implementing the
// admin/regional-director/own-office logic a second time: if the session
// is readable through the same RLS policies real dashboard queries use,
// access is allowed; if RLS filters it out, this returns false. Single
// source of truth for the access rule, no risk of the two drifting apart.
export async function assertSessionOfficeAccess(sessionId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("sessions").select("id").eq("id", sessionId).maybeSingle();
  return !!data;
}
