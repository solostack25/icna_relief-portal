import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getHungerPreventionAccess, resolveWorkingOfficeId } from "@/lib/hungerPreventionAccess";
import OfficePicker from "./OfficePicker";

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 24,
  boxShadow: "0 3px 12px rgba(22,48,43,0.06)",
};

export default async function HungerPreventionHome({ searchParams }: { searchParams: Promise<{ office?: string }> }) {
  const access = await getHungerPreventionAccess();
  if (!access.ok) redirect("/select-app");

  const { office: officeParam } = await searchParams;
  const officeId = resolveWorkingOfficeId(access, officeParam ?? null);

  const supabase = await createClient();
  const { data: offices } = await supabase.from("b2s_offices").select("id, field_office").eq("is_active", true).order("field_office");
  const currentOffice = (offices ?? []).find((o) => o.id === officeId);

  let todaySlots: { id: string; start_time: string; end_time: string; capacity: number; booked: number }[] = [];
  let waitlistCount = 0;

  if (officeId) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: slots } = await supabase
      .from("pickup_slots")
      .select("id, start_time, end_time, capacity")
      .eq("office_id", officeId)
      .eq("slot_date", today)
      .order("start_time");

    const slotIds = (slots ?? []).map((s) => s.id);
    const { data: bookings } = slotIds.length
      ? await supabase.from("pickup_bookings").select("slot_id, status").in("slot_id", slotIds)
      : { data: [] };
    const bookedCount = new Map<string, number>();
    for (const b of bookings ?? []) {
      if (b.status === "booked" || b.status === "completed") bookedCount.set(b.slot_id, (bookedCount.get(b.slot_id) ?? 0) + 1);
    }
    todaySlots = (slots ?? []).map((s) => ({ ...s, booked: bookedCount.get(s.id) ?? 0 }));

    const { count } = await supabase
      .from("pickup_waitlist")
      .select("id", { count: "exact", head: true })
      .eq("office_id", officeId)
      .is("notified_at", null);
    waitlistCount = count ?? 0;
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-2">
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: 0 }}>
          Hunger Prevention
        </h1>
        <OfficePicker offices={offices ?? []} currentOfficeId={officeId} isAdmin={access.isAdmin} currentOfficeName={currentOffice?.field_office ?? null} />
      </div>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Food pantry scheduling — slots, client pickups, and check-in.
      </p>

      {!officeId ? (
        <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
          {access.isAdmin ? "Pick an office above to get started." : "No office is assigned to your account yet — ask an admin."}
        </p>
      ) : (
        <>
          <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            <div style={{ ...cardStyle, padding: "20px 22px" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#16302B" }}>{todaySlots.length}</div>
              <div className="text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>
                Time slots today
              </div>
            </div>
            <div style={{ ...cardStyle, padding: "20px 22px" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#16302B" }}>
                {todaySlots.reduce((sum, s) => sum + s.booked, 0)} / {todaySlots.reduce((sum, s) => sum + s.capacity, 0)}
              </div>
              <div className="text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>
                Booked today
              </div>
            </div>
            <div style={{ ...cardStyle, padding: "20px 22px" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#16302B" }}>{waitlistCount}</div>
              <div className="text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>
                On waitlist
              </div>
            </div>
          </div>

          <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            {[
              { href: "/hunger-prevention/check-in", label: "Today's Check-In", desc: "Scan or search to check clients in", color: "#2F6D46" },
              { href: "/hunger-prevention/slots", label: "Manage Slots", desc: "Add and view upcoming pickup times", color: "#3E7FBF" },
              { href: "/hunger-prevention/waitlist", label: "Waitlist", desc: "Clients waiting for a fully booked day", color: "#E2892F" },
            ].map((item) => (
              <Link
                key={item.href}
                href={`${item.href}${officeId ? `?office=${officeId}` : ""}`}
                className="hover:scale-[1.02] active:scale-95 transition-transform duration-150"
                style={{ ...cardStyle, padding: "20px 22px", display: "block" }}
              >
                <div className="text-sm font-bold mb-1" style={{ color: item.color }}>
                  {item.label}
                </div>
                <div className="text-xs" style={{ color: "rgba(22,48,43,0.5)" }}>
                  {item.desc}
                </div>
              </Link>
            ))}
          </div>

          {todaySlots.length > 0 && (
            <div style={{ ...cardStyle, padding: "22px 24px" }}>
              <h2 className="text-sm font-bold mb-3" style={{ color: "#2F4A3E" }}>
                Today&apos;s Slots
              </h2>
              <div className="space-y-2">
                {todaySlots.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <span>
                      {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                    </span>
                    <span style={{ color: "rgba(22,48,43,0.5)" }}>
                      {s.booked} / {s.capacity} booked
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
