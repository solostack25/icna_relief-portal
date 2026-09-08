import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OfficeLimitsClient from "./OfficeLimitsClient";

export default async function IrfasOfficeLimitsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") redirect("/irfas");

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: "0 0 8px" }}>
        IRFAS Office Limits
      </h1>
      <p className="text-sm mb-6" style={{ color: "rgba(22,48,43,0.55)" }}>
        Set how much each office can give out in zakat assistance. Shown on that office&apos;s dashboard alongside how
        much they&apos;ve given so far.
      </p>
      <OfficeLimitsClient />
    </div>
  );
}
