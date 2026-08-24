import { redirect } from "next/navigation";
import Link from "next/link";
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
      <div className="flex items-start justify-between mb-2">
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}>
          Entra Directory
        </h1>
        <Link
          href="/admin/entra-directory/new"
          className="text-sm font-bold px-5 py-2.5 rounded-full flex-shrink-0 hover:scale-105 active:scale-95 transition-transform duration-150"
          style={{ background: "var(--portal-emerald, #2F6D46)", color: "#fff", boxShadow: "0 3px 10px rgba(31,111,84,0.3)" }}
        >
          + Onboard New Employee
        </Link>
      </div>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Edits here write directly to Microsoft Entra ID (Job Title, Department, Office Location, Manager) — not
        just the portal. Changes take effect immediately, no deploy needed.
      </p>
      <EntraDirectoryClient />
    </div>
  );
}
