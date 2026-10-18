import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WorkflowsClient from "./WorkflowsClient";

export const dynamic = "force-dynamic";

// Every approval / ticket / request flow in the portal, with live counts and
// the approvers, limits and mailboxes editable in one place. Admin only.
export default async function WorkflowsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).maybeSingle();
  if (me?.role !== "admin") redirect("/admin");
  return <WorkflowsClient />;
}
