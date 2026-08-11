import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HelpdeskView } from "@/app/helpdesk/HelpdeskView";

// The quest-themed IT board, now living purely as an Admin Portal tool
// rather than something anyone might land on from the regular /helpdesk
// home page. Admin-gated the same way as every other /admin/* page -
// HelpdeskView itself doesn't enforce a role, it just renders whichever
// theme it's told to, so that check has to happen here.
export default async function AdminHelpdeskQuestPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; status?: string }>;
}) {
  const { dept, status } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("employees")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/select-app");

  return <HelpdeskView dept={dept} status={status} forceTheme="quest" />;
}
