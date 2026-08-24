import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getHungerPreventionAccess, resolveWorkingOfficeId } from "@/lib/hungerPreventionAccess";
import OfficePicker from "../OfficePicker";

function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default async function NoShowsPage({ searchParams }: { searchParams: Promise<{ office?: string }> }) {
  const access = await getHungerPreventionAccess();
  if (!access.ok) redirect("/select-app");

  const { office: officeParam } = await searchParams;
  const officeId = resolveWorkingOfficeId(access, officeParam ?? null);

  const supabase = await createClient();
  const { data: offices } = await supabase.from("b2s_offices").select("id, field_office").eq("is_active", true).order("field_office");
  const currentOffice = (offices ?? []).find((o) => o.id === officeId);

  let sorted: { id: string; status: string; client_id: string; slot_date: string; start_time: string }[] = [];
  let clientById = new Map<string, { first_name: string; last_name: string; client_number: string | null; phone: string | null }>();

  if (officeId) {
    const cutoff = daysAgoISO(30);
    const { data: slotRows } = await supabase
      .from("pickup_slots")
      .select("id, slot_date, start_time")
      .eq("office_id", officeId)
      .gte("slot_date", cutoff)
      .order("slot_date", { ascending: false });

    const slotMap = new Map((slotRows ?? []).map((s) => [s.id, s]));
    const slotIds = (slotRows ?? []).map((s) => s.id);

    const { data: bookingRows } = slotIds.length
      ? await supabase.from("pickup_bookings").select("id, status, client_id, slot_id").in("slot_id", slotIds).in("status", ["missed", "expired"])
      : { data: [] };

    const clientIds = (bookingRows ?? []).map((b) => b.client_id);
    const { data: clientRows } = clientIds.length
      ? await supabase.from("clients").select("id, first_name, last_name, client_number, phone").in("id", clientIds)
      : { data: [] };
    clientById = new Map((clientRows ?? []).map((c) => [c.id, c]));

    sorted = (bookingRows ?? [])
      .map((b) => ({ ...b, slot_date: slotMap.get(b.slot_id)?.slot_date ?? "", start_time: slotMap.get(b.slot_id)?.start_time ?? "" }))
      .sort((a, b) => b.slot_date.localeCompare(a.slot_date));
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link href={`/hunger-prevention${officeId ? `?office=${officeId}` : ""}`} className="text-sm" style={{ color: "rgba(22,48,43,0.45)" }}>
        ← Hunger Prevention
      </Link>
      <div className="flex items-center justify-between mt-3 mb-2">
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 26, margin: 0 }}>
          No-Shows
        </h1>
        <OfficePicker offices={offices ?? []} currentOfficeId={officeId} isAdmin={access.isAdmin} currentOfficeName={currentOffice?.field_office ?? null} />
      </div>
      <p className="text-sm mb-6" style={{ color: "rgba(22,48,43,0.5)" }}>
        Missed pickups in the last 30 days.
      </p>

      {!officeId ? (
        <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
          {access.isAdmin ? "Pick an office above." : "No office is assigned to your account yet."}
        </p>
      ) : (
        <div style={{ background: "#fff", borderRadius: 24, boxShadow: "0 3px 12px rgba(22,48,43,0.06)", overflow: "hidden" }}>
          {sorted.length === 0 ? (
            <p className="p-6 text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>
              No missed pickups in the last 30 days.
            </p>
          ) : (
            sorted.map((b, i) => {
              const client = clientById.get(b.client_id);
              return (
                <div
                  key={b.id}
                  className="flex items-center justify-between px-5 py-3.5"
                  style={{ borderTop: i === 0 ? "none" : "1px solid var(--portal-line, rgba(22,48,43,0.06))" }}
                >
                  <div>
                    <div className="text-sm font-bold">{client ? `${client.first_name} ${client.last_name}` : "Unknown client"}</div>
                    <div className="text-xs" style={{ color: "rgba(22,48,43,0.45)" }}>
                      {b.slot_date ? new Date(b.slot_date + "T00:00:00").toLocaleDateString() : ""} · {client?.client_number}
                      {client?.phone ? (
                        <>
                          {" · "}
                          <a href={`tel:${client.phone}`} style={{ color: "var(--portal-emerald, #2F6D46)" }}>
                            {client.phone}
                          </a>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <span
                    className="text-xs font-bold rounded-full px-2.5 py-1 flex-shrink-0"
                    style={{ background: b.status === "expired" ? "#FBE9EC" : "#FCEFDD", color: b.status === "expired" ? "#B5566B" : "#A57420" }}
                  >
                    {b.status}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
