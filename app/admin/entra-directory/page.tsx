import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EntraDirectoryClient from "./EntraDirectoryClient";

export default async function EntraDirectoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") redirect("/select-app");

  return (
    <div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
        Entra Directory
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Edits here write directly to Microsoft Entra ID (Job Title, Department, Office Location, Manager) — not
        just the portal. Changes take effect immediately, no deploy needed.
      </p>
      <EntraDirectoryClient />
    </div>
  );
}
