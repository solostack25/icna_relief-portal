import type { SupabaseClient } from "@supabase/supabase-js";

export type ResourcesUser = {
  employeeId: string;
  email: string | null;
  name: string;
  role: string | null;
  assignedOfficeId: string | null;
  /** Admin or IT: full access, settings, ticket status management. */
  canManage: boolean;
  /** Can see every office (admin, IT, C-suite). */
  seesAll: boolean;
};

/** The signed-in employee's Resources permissions. The database enforces the same rules (RLS). */
export async function getResourcesUser(supabase: SupabaseClient): Promise<ResourcesUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: e } = await supabase
    .from("employees")
    .select("id, email, first_name, last_name, role, is_cio, is_csuite, assigned_office_id, is_active")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!e || e.is_active === false) return null;
  const canManage = e.role === "admin" || !!e.is_cio;
  return {
    employeeId: e.id,
    email: e.email,
    name: [e.first_name, e.last_name].filter(Boolean).join(" "),
    role: e.role,
    assignedOfficeId: e.assigned_office_id,
    canManage,
    seesAll: canManage || !!e.is_csuite,
  };
}
