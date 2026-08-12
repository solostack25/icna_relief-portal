import { createClient } from "@/lib/supabase/server";

// Same pattern as lib/inkind/access.ts - single source of truth for who
// can reach the finance admin tools, checked both at the page level and
// independently in every API route (page gate alone doesn't cover
// direct API calls).
export type FinanceAdminAccess =
  | { ok: false; status: 401 | 403 }
  | { ok: true; employeeId: string };

export async function getFinanceAdminAccess(): Promise<FinanceAdminAccess> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };

  const { data: employee } = await supabase
    .from("employees")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();
  if (!employee) return { ok: false, status: 401 };

  if (employee.role === "admin") return { ok: true, employeeId: employee.id };

  const { data: access } = await supabase
    .from("employee_program_access")
    .select("program_slug")
    .eq("employee_id", employee.id)
    .in("program_slug", ["helpdesk-finance", "helpdesk-it"]);
  if (!access || access.length === 0) return { ok: false, status: 403 };

  return { ok: true, employeeId: employee.id };
}
