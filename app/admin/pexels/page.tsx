import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PortalHeader from "@/app/PortalHeader";
import PexelsSettingsClient from "./PexelsSettingsClient";

export default async function AdminPexelsPage() {
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
            Stock Photos
          </h1>
          <Link href="/admin" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            ← Back to Admin
          </Link>
        </div>
        <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
          Powers stock photo search in the Flier Builder. Free at{" "}
          <a href="https://www.pexels.com/api/" target="_blank" rel="noopener noreferrer" className="underline">
            pexels.com/api
          </a>{" "}
          — no approval process, a key is issued immediately.
        </p>
        <PexelsSettingsClient />
      </div>
    </main>
  );
}
