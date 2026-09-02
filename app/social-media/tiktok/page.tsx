import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TikTokTab from "./TikTokTab";

export default async function TikTokPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();

  return <TikTokTab isAdmin={me?.role === "admin"} />;
}
