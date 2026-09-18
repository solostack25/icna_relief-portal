import { createClient } from "@/lib/supabase/server";
import { ORLANDO_OFFICE_ID } from "./config";

// Orlando Automation is launched from the Orlando office dashboard
// (/admin/office-info/<orlando id>), so it follows that page's gate
// exactly: admins, plus area managers whose assigned office is Orlando.
// Checked in the module layout and independently in the API route.
export type OrlandoAutomationAccess =
  | { ok: false; status: 401 | 403 }
  | { ok: true; employeeId: string; role: string; isAdmin: boolean; firstName: string | null };

export async function getOrlandoAutomationAccess(): Promise<OrlandoAutomationAccess> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };

  const { data: me } = await supabase
    .from("employees")
    .select("id, role, assigned_office_id, first_name")
    .eq("auth_user_id", user.id)
    .single();
  if (!me) return { ok: false, status: 401 };

  const isAdmin = me.role === "admin";
  const isOrlandoManager = me.role === "area_manager" && me.assigned_office_id === ORLANDO_OFFICE_ID;
  if (!isAdmin && !isOrlandoManager) return { ok: false, status: 403 };

  return { ok: true, employeeId: me.id, role: me.role, isAdmin, firstName: me.first_name ?? null };
}
