import { createClient } from "@/lib/supabase/server";

// Same pattern as lib/flierMarketingAccess.ts - single source of truth,
// checked at page level and independently in every API route. Also
// resolves which office this employee is working the module for, since
// every hunger-prevention page (slots, check-in, waitlist) needs that -
// pulled out here once instead of repeating the same
// admin-picks-vs-staff-is-fixed logic on every page.
export type HungerPreventionAccess =
  | { ok: false; status: 401 | 403 }
  | { ok: true; employeeId: string; role: string; isAdmin: boolean; defaultOfficeId: string | null };

export async function getHungerPreventionAccess(): Promise<HungerPreventionAccess> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };

  const { data: employee } = await supabase
    .from("employees")
    .select("id, role, assigned_office_id")
    .eq("auth_user_id", user.id)
    .single();
  if (!employee) return { ok: false, status: 401 };

  const isAdmin = employee.role === "admin";
  if (!isAdmin) {
    const { data: access } = await supabase
      .from("employee_program_access")
      .select("program_slug")
      .eq("employee_id", employee.id)
      .eq("program_slug", "hunger-prevention")
      .maybeSingle();
    if (!access) return { ok: false, status: 403 };
  }

  return { ok: true, employeeId: employee.id, role: employee.role, isAdmin, defaultOfficeId: employee.assigned_office_id };
}

// Resolves the office a given request/page should operate against:
// explicit ?office=<uuid> query param wins (lets an admin switch
// offices), otherwise falls back to the employee's own assigned
// office. Staff without an assigned office and no query param get
// null - callers should prompt them to pick one rather than silently
// showing empty data.
export function resolveWorkingOfficeId(access: Extract<HungerPreventionAccess, { ok: true }>, queryOfficeId: string | null): string | null {
  if (queryOfficeId) return queryOfficeId;
  return access.defaultOfficeId;
}
