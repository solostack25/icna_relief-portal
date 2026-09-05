import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreatePostTab from "./CreatePostTab";

export default async function CreatePostPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  return <CreatePostTab />;
}
