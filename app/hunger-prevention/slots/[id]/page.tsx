import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getHungerPreventionAccess } from "@/lib/hungerPreventionAccess";

const statusColor: Record<string, string> = {
  booked: "#2F6D46",
  completed: "#2F6D46",
  missed: "#A57420",
  expired: "#B5566B",
  cancelled: "rgba(22,48,43,0.4)",
};

export default async function SlotDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ office?: string }> }) {
  const { id } = await params;
  const { office } = await searchParams;
  const access = await getHungerPreventionAccess();
  if (!access.ok) redirect("/select-app");

  const supabase = await createClient();
  const { data: slot } = await supabase.from("pickup_slots").select("id, slot_date, start_time, end_time, capacity, office_id").eq("id", id).single();
  if (!slot) redirect(`/hunger-prevention/slots${office ? `?office=${office}` : ""}`);

  const { data: bookings } = await supabase
    .from("pickup_bookings")
    .select("id, status, client_id, booked_at")
    .eq("slot_id", id)
    .order("booked_at");

  const clientIds = (bookings ?? []).map((b) => b.client_id);
  const { data: clients } = clientIds.length
    ? await supabase.from("clients").select("id, first_name, last_name, client_number, phone").in("id", clientIds)
    : { data: [] };
  const clientById = new Map((clients ?? []).map((c) => [c.id, c]));

  const backHref = `/hunger-prevention/slots${slot.office_id ? `?office=${slot.office_id}` : ""}`;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link href={backHref} className="text-sm" style={{ color: "rgba(22,48,43,0.45)" }}>
        ← All slots
      </Link>

      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 26, margin: "12px 0 4px" }}>
        {new Date(slot.slot_date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
      </h1>
      <p className="text-sm mb-6" style={{ color: "rgba(22,48,43,0.5)" }}>
        {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)} · {(bookings ?? []).length} / {slot.capacity} booked
      </p>

      <div style={{ background: "#fff", borderRadius: 24, boxShadow: "0 3px 12px rgba(22,48,43,0.06)", overflow: "hidden" }}>
        {(bookings ?? []).length === 0 ? (
          <p className="p-6 text-sm" style={{ color: "rgba(22,48,43,0.4)" }}>
            No one has booked this slot yet.
          </p>
        ) : (
          bookings!.map((b, i) => {
            const client = clientById.get(b.client_id);
            return (
              <Link
                key={b.id}
                href={`/clients/${b.client_id}`}
                className="flex items-center justify-between px-5 py-3.5"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--portal-line, rgba(22,48,43,0.06))" }}
              >
                <div>
                  <div className="text-sm font-bold">{client ? `${client.first_name} ${client.last_name}` : "Unknown client"}</div>
                  <div className="text-xs" style={{ color: "rgba(22,48,43,0.45)" }}>
                    {client?.client_number} {client?.phone ? `· ${client.phone}` : ""}
                  </div>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: statusColor[b.status] ?? "#666", background: "#F4F3EE" }}>
                  {b.status}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
