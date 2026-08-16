import { createClient } from "@/lib/supabase/server";

// Same pattern as lib/flierMarketingAccess.ts / lib/financeAdminAccess.ts -
// single source of truth, checked at both the page level and
// independently in every API route.
export type MarketingContactsAccess = { ok: false; status: 401 | 403 } | { ok: true; employeeId: string };

export async function getMarketingContactsAccess(): Promise<MarketingContactsAccess> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };

  const { data: employee } = await supabase.from("employees").select("id, role").eq("auth_user_id", user.id).single();
  if (!employee) return { ok: false, status: 401 };
  if (employee.role === "admin") return { ok: true, employeeId: employee.id };

  const { data: access } = await supabase
    .from("employee_program_access")
    .select("program_slug")
    .eq("employee_id", employee.id)
    .eq("program_slug", "marketing-contacts")
    .maybeSingle();
  if (!access) return { ok: false, status: 403 };

  return { ok: true, employeeId: employee.id };
}
