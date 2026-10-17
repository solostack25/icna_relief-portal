import { createClient } from "@/lib/supabase/server";

// Same pattern as lib/hungerPreventionAccess.ts — checked at page level
// and again in every API route. Admins always pass; everyone else needs
// the 'refugee-services' row in employee_program_access. (Logging a
// service from a client's profile stays open to the client's office
// staff, like the old RSCE log — RLS scopes that to their office.)
export const RSCE_PROGRAM = "Refugee Services & Community Empowerment";
export const RSCE_SLUG = "refugee-services";

export type RefugeeServicesAccess =
  | { ok: false; status: 401 | 403 }
  | { ok: true; employeeId: string; role: string; isAdmin: boolean; officeId: string | null };

export async function getRefugeeServicesAccess(): Promise<RefugeeServicesAccess> {
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
      .eq("program_slug", RSCE_SLUG)
      .maybeSingle();
    if (!access) return { ok: false, status: 403 };
  }

  return { ok: true, employeeId: employee.id, role: employee.role, isAdmin, officeId: employee.assigned_office_id };
}
