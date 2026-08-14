import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PortalHeader from "@/app/PortalHeader";
import DropboxSettingsClient from "./DropboxSettingsClient";

export default async function AdminDropboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") redirect("/select-app");

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-lg mx-auto px-4 sm:px-10 py-8 sm:py-10">
        <div className="flex items-center justify-between mb-2">
          <h1
            style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}
          >
            Dropbox Connection
          </h1>
          <Link href="/admin" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            ← Back to Admin
          </Link>
        </div>
        <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
          Powers the Upload Content tool. Update these if the connected Dropbox app is ever
          reauthorized or its credentials rotated — no code deploy needed, changes take effect
          immediately.
        </p>
        <DropboxSettingsClient />
      </div>
    </main>
  );
}
