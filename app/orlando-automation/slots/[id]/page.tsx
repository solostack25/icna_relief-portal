import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ORLANDO_OFFICE_ID, ORLANDO_OFFICE_LABEL } from "@/lib/orlandoAutomation/config";

export default async function SlotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: slot } = await supabase
    .from("pickup_slots")
    .select("id, slot_date, start_time, end_time, capacity, office")
    .eq("office_id", ORLANDO_OFFICE_ID)
    .eq("id", id)
    .single();

  if (!slot) redirect("/orlando-automation/slots");

  const { data: bookings } = await supabase
    .from("pickup_bookings")
    .select("id, status, client_id, booked_at")
    .eq("slot_id", id)
    .order("booked_at");

  const clientIds = (bookings ?? []).map((b) => b.client_id);
  const { data: clients } = clientIds.length
    ? await supabase
        .from("clients")
        .select("id, first_name, last_name, client_number, phone")
        .in("id", clientIds)
    : { data: [] };

  const clientById = new Map((clients ?? []).map((c) => [c.id, c]));

  const statusColor: Record<string, string> = {
    booked: "text-[var(--color-accent)]",
    completed: "text-[var(--color-accent)]",
    missed: "text-amber-600",
    expired: "text-red-600",
    cancelled: "text-[var(--color-text-dim)]",
  };

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/orlando-automation/slots"
          className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          ← All slots
        </Link>

        <h1 className="text-xl font-semibold mt-4 mb-1">
          {new Date(slot.slot_date).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </h1>
        <p className="text-sm text-[var(--color-text-dim)] mb-8">
          {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)} ·{" "}
          {(bookings ?? []).length} / {slot.capacity} booked
        </p>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          {(bookings ?? []).length === 0 ? (
            <p className="p-6 text-sm text-[var(--color-text-dim)]">
              No one has booked this slot yet.
            </p>
          ) : (
            bookings!.map((b) => {
              const client = clientById.get(b.client_id);
              return (
                <Link
                  key={b.id}
                  href={`/orlando-automation/clients/${b.client_id}`}
                  className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-input-bg)]"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {client ? `${client.first_name} ${client.last_name}` : "Unknown client"}
                    </div>
                    <div className="text-xs text-[var(--color-text-dim)]">
                      {client?.client_number} {client?.phone ? `· ${client.phone}` : ""}
                    </div>
                  </div>
                  <span className={`text-xs font-medium ${statusColor[b.status] ?? ""}`}>
                    {b.status}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
