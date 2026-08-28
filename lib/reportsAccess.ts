import { createClient } from "@/lib/supabase/server";

// Same pattern as lib/hungerPreventionAccess.ts. Every report query
// needs to know not just "is this employee allowed in the Reports
// section" but their full scoping context (office/region/role) so
// app/api/reports/run can constrain results correctly per module.
export type ReportsAccess =
  | { ok: false; status: 401 | 403 }
  | {
      ok: true;
      employeeId: string;
      role: "staff" | "regional_director" | "program_director" | "admin";
      isAdmin: boolean;
      assignedOfficeId: string | null;
      assignedRegion: string | null;
    };

export async function getReportsAccess(): Promise<ReportsAccess> {
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

  // Every employee can open the Reports section - which modules and
  // which rows they can actually see is narrowed by modulesForRole()
  // and the scoping logic in app/api/reports/run, not gated here.
  return {
    ok: true,
    employeeId: employee.id,
    role: employee.role,
    isAdmin: employee.role === "admin",
    assignedOfficeId: employee.assigned_office_id,
    assignedRegion: employee.assigned_region,
  };
}
