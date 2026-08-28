import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ZakatFinanceClient from "./ZakatFinanceClient";

export default async function ZakatFinancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase.from("employees").select("role, is_zakat_finance").eq("auth_user_id", user.id).single();
  if (!me || (me.role !== "admin" && !me.is_zakat_finance)) redirect("/select-app");

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}>
        Approved Applications
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Fully-approved IRFAS applications ready for a check. Marking one paid records the check number and closes it out.
      </p>
      <ZakatFinanceClient />
    </div>
  );
}
