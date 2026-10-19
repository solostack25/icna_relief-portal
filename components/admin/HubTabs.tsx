import { createClient } from "@/lib/supabase/server";
import { getAdminAccess } from "@/lib/adminAccess";
import { HUBS, type HubKey } from "@/lib/adminNav";
import SectionTabs from "./SectionTabs";

// Server wrapper: works out which of a hub's tabs this person can see
// (same access flags the sidebar uses) and renders the tab bar.
export default async function HubTabs({ hub }: { hub: HubKey }) {
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
  return <SectionTabs tabs={HUBS[hub].tabs(access)} ariaLabel={hub} />;
}
