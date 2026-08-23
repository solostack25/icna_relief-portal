import { createClient } from "@/lib/supabase/server";

// Every office runs donor calling campaigns - this used to require an
// explicit employee_program_access grant (program_slug =
// "marketing-contacts"), but since it's meant to be baseline access
// for all staff rather than a selectively-granted permission, any
// authenticated employee now passes. Left as its own function (rather
// than inlining an auth check at each call site) so the policy lives
// in one place if it ever needs to change back to gated access.
export type MarketingContactsAccess = { ok: false; status: 401 | 403 } | { ok: true; employeeId: string };

export async function getMarketingContactsAccess(): Promise<MarketingContactsAccess> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };

  const { data: employee } = await supabase.from("employees").select("id").eq("auth_user_id", user.id).single();
  if (!employee) return { ok: false, status: 401 };

  return { ok: true, employeeId: employee.id };
}
