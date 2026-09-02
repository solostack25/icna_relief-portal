import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import YouTubeTab from "./YouTubeTab";

export default async function YouTubePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  return <YouTubeTab />;
}
