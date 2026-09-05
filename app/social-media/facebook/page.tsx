import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FacebookTab from "./FacebookTab";

export default async function FacebookPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  return <FacebookTab />;
}
