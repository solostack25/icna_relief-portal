import { createClient } from "@/lib/supabase/server";
import { getAdminAccess } from "@/lib/adminAccess";
import { reportsHubTabs } from "@/lib/adminNav";
import SectionTabs from "./SectionTabs";

// Server wrapper: works out which Reports tabs this person can see
// (same flags the sidebar uses) and renders the tab bar.
export default async function ReportsHubTabs() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase
    .from("employees")
    .select("id, role, assigned_office_id")
    .eq("auth_user_id", user.id)
    .single();
  if (!me) return null;
  const access = await getAdminAccess(supabase, me.id, me.role, me.assigned_office_id);
  return <SectionTabs tabs={reportsHubTabs(access)} ariaLabel="Reports" />;
}
