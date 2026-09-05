import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InstagramTab from "./InstagramTab";

export default async function InstagramPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  return <InstagramTab />;
}
