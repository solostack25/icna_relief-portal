import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getHungerPreventionAccess, resolveWorkingOfficeId } from "@/lib/hungerPreventionAccess";
import OfficePicker from "../OfficePicker";

function monthStartISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ office?: string }> }) {
  const access = await getHungerPreventionAccess();
  if (!access.ok) redirect("/select-app");

  const { office: officeParam } = await searchParams;
  const officeId = resolveWorkingOfficeId(access, officeParam ?? null);

  const supabase = await createClient();
  const { data: offices } = await supabase.from("b2s_offices").select("id, field_office").eq("is_active", true).order("field_office");
  const currentOffice = (offices ?? []).find((o) => o.id === officeId);

  let cards: { label: string; value: string | number }[] = [];

  if (officeId) {
    const monthStart = monthStartISO();
    const today = new Date().toISOString().slice(0, 10);

    const { data: slotRows } = await supabase.from("pickup_slots").select("id, slot_date").eq("office_id", officeId).gte("slot_date", monthStart);
    const slotIds = (slotRows ?? []).map((s) => s.id);
    const { data: bookingRows } = slotIds.length
      ? await supabase.from("pickup_bookings").select("status").in("slot_id", slotIds)
      : { data: [] as { status: string }[] };

    const { data: upcomingSlotRows } = await supabase.from("pickup_slots").select("id").eq("office_id", officeId).gte("slot_date", today);
    const upcomingSlotIds = (upcomingSlotRows ?? []).map((s) => s.id);
    const { count: upcomingCount } = upcomingSlotIds.length
      ? await supabase.from("pickup_bookings").select("id", { count: "exact", head: true }).eq("status", "booked").in("slot_id", upcomingSlotIds)
      : { count: 0 };

    const { count: waitlistCount } = await supabase
      .from("pickup_waitlist")
      .select("id", { count: "exact", head: true })
      .eq("office_id", officeId)
      .is("notified_at", null);

    const completed = (bookingRows ?? []).filter((b) => b.status === "completed").length;
    const missed = (bookingRows ?? []).filter((b) => b.status === "missed" || b.status === "expired").length;
    const resolved = completed + missed;
    const noShowRate = resolved > 0 ? Math.round((missed / resolved) * 100) : null;

    cards = [
      { label: "Completed this month", value: completed },
      { label: "Missed this month", value: missed },
      { label: "No-show rate this month", value: noShowRate === null ? "—" : `${noShowRate}%` },
      { label: "Upcoming booked pickups", value: upcomingCount ?? 0 },
      { label: "Open waitlist entries", value: waitlistCount ?? 0 },
    ];
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link href={`/hunger-prevention${officeId ? `?office=${officeId}` : ""}`} className="text-sm" style={{ color: "rgba(22,48,43,0.45)" }}>
        ← Hunger Prevention
      </Link>
      <div className="flex items-center justify-between mt-3 mb-2">
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 26, margin: 0 }}>
          Stats
        </h1>
        <OfficePicker offices={offices ?? []} currentOfficeId={officeId} isAdmin={access.isAdmin} currentOfficeName={currentOffice?.field_office ?? null} />
      </div>
      <p className="text-sm mb-6" style={{ color: "rgba(22,48,43,0.5)" }}>
        A quick look at distribution activity this month.
      </p>

      {!officeId ? (
        <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
          {access.isAdmin ? "Pick an office above." : "No office is assigned to your account yet."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {cards.map((c) => (
            <div key={c.label} style={{ background: "#fff", borderRadius: 24, boxShadow: "0 3px 12px rgba(22,48,43,0.06)", padding: "20px 22px" }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#16302B" }}>{c.value}</div>
              <div className="text-xs mt-1" style={{ color: "rgba(22,48,43,0.5)" }}>
                {c.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
