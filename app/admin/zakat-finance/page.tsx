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
        Fully-approved IRFAS applications ready for a check. Set the program and whether it's paid from community funds or a grant, then record the check number. Voided checks stay on record but drop out of totals and office limits.
      </p>
      <div className="mb-6">
        <a
          href={`/api/admin/zakat-finance-applications/export?year=${new Date().getFullYear()}`}
          className="inline-block rounded-full border border-[#1F6F54]/40 text-[#1F6F54] text-xs font-semibold px-4 py-2"
        >
          Export IRFAS {new Date().getFullYear()} (Power BI)
        </a>
      </div>
      <ZakatFinanceClient />
    </div>
  );
}
