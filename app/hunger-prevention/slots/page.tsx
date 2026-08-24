import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getHungerPreventionAccess, resolveWorkingOfficeId } from "@/lib/hungerPreventionAccess";
import OfficePicker from "../OfficePicker";
import SlotsClient from "./SlotsClient";

export default async function SlotsPage({ searchParams }: { searchParams: Promise<{ office?: string }> }) {
  const access = await getHungerPreventionAccess();
  if (!access.ok) redirect("/select-app");

  const { office: officeParam } = await searchParams;
  const officeId = resolveWorkingOfficeId(access, officeParam ?? null);

  const supabase = await createClient();
  const { data: offices } = await supabase.from("b2s_offices").select("id, field_office").eq("is_active", true).order("field_office");
  const currentOffice = (offices ?? []).find((o) => o.id === officeId);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link href={`/hunger-prevention${officeId ? `?office=${officeId}` : ""}`} className="text-sm" style={{ color: "rgba(22,48,43,0.45)" }}>
        ← Hunger Prevention
      </Link>
      <div className="flex items-center justify-between mt-3 mb-2">
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 26, margin: 0 }}>
          Pickup Slots
        </h1>
        <OfficePicker offices={offices ?? []} currentOfficeId={officeId} isAdmin={access.isAdmin} currentOfficeName={currentOffice?.field_office ?? null} />
      </div>
      {officeId ? (
        <SlotsClient officeId={officeId} />
      ) : (
        <p className="text-sm mt-6" style={{ color: "rgba(22,48,43,0.5)" }}>
          {access.isAdmin ? "Pick an office above to manage its slots." : "No office is assigned to your account yet."}
        </p>
      )}
    </div>
  );
}
