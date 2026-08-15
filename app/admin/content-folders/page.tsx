import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FoldersClient from "./FoldersClient";

export default async function AdminContentFoldersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") redirect("/select-app");

  return (
    <div>
      <h1
        style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}
      >
        Content Upload Folders
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Categories shown on the Upload Content page. Each maps to a folder of the same name in
        Dropbox — anyone in the portal can upload to any category.
      </p>
      <FoldersClient />
    </div>
  );
}
