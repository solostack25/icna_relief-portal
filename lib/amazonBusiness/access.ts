// Who can see Admin -> Amazon Business: admins, the IT team and the
// Finance team (the same helpdesk queue grants used everywhere else).
import { createClient } from "@/lib/supabase/server";
import { getManagedDepartments } from "@/lib/helpdesk";

export type AmzbViewer = { employeeId: string; email: string; isAdmin: boolean; isIt: boolean; isFinance: boolean };

export async function getAmzbViewer(): Promise<AmzbViewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from("employees").select("id, role, email").eq("auth_user_id", user.id).maybeSingle();
  if (!me) return null;
  const depts = await getManagedDepartments(supabase, me.id, me.role);
  const isAdmin = me.role === "admin";
  const isIt = depts.includes("it");
  const isFinance = depts.includes("finance");
  if (!isAdmin && !isIt && !isFinance) return null;
  return { employeeId: me.id, email: me.email, isAdmin, isIt, isFinance };
}
