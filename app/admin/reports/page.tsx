import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { modulesForRole } from "@/lib/reports/registry";
import ReportsClient from "./ReportsClient";

export default async function ReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("employees")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();
  if (!me) redirect("/select-app");

  const modules = modulesForRole(me.role);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
        Reports
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Build a custom report, filter it to your office or region, and save it to run again later.
      </p>
      <ReportsClient modules={modules} />
    </div>
  );
}
