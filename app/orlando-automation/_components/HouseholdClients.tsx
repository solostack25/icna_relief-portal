"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ORLANDO_OFFICE_ID } from "@/lib/orlandoAutomation/config";

// Household view for clients registered through the unified household
// intake: each member is a full client record sharing household_key (the
// legacy household_members table is only used for older clients - see
// HouseholdMembers). Same model as the main portal's client profile.
type Row = {
  id: string;
  client_number: string | null;
  first_name: string;
  last_name: string;
  dob: string | null;
  gender: string | null;
  relationship_to_main_client: string | null;
};

function ageFrom(dob: string) {
  const birth = new Date(dob + "T00:00:00");
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

export default function HouseholdClients({ clientId, householdKey }: { clientId: string; householdKey: string }) {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, client_number, first_name, last_name, dob, gender, relationship_to_main_client")
        .eq("household_key", householdKey)
        .eq("office_id", ORLANDO_OFFICE_ID)
        .order("client_number");
      setRows((data ?? []).filter((r) => r.id !== clientId));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, householdKey]);

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium">
          Household ({rows.length + 1} member{rows.length === 0 ? "" : "s"})
        </h2>
        <span className="text-xs text-[var(--color-text-dim)]">Household key: {householdKey}</span>
      </div>
      {loading ? (
        <p className="text-sm text-[var(--color-text-dim)]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--color-text-dim)]">No other household members on record.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((m) => (
            <Link
              key={m.id}
              href={`/orlando-automation/clients/${m.id}`}
              className="flex items-center justify-between border-t border-[var(--color-border)] pt-2 first:border-0 first:pt-0 hover:text-[var(--color-accent)]"
            >
              <div>
                <p className="text-sm font-medium">
                  {m.first_name} {m.last_name}
                </p>
                <p className="text-xs text-[var(--color-text-dim)]">
                  {m.relationship_to_main_client ?? "—"} · {m.client_number ?? "—"}
                  {m.dob ? ` · Age ${ageFrom(m.dob)}` : ""}
                  {m.gender ? ` · ${m.gender}` : ""}
                </p>
              </div>
              <span className="text-xs text-[var(--color-text-dim)]">View →</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
