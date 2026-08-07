"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Request = {
  id: string;
  client_id: string;
  reason: string;
  preferred_house_id: string | null;
  status: string;
  created_at: string;
};
type ClientRow = { id: string; first_name: string; last_name: string };
type House = { id: string; name: string };
type Bed = { id: string; house_id: string; label: string };

export default function ReadmissionsPage() {
  const supabase = createClient();
  const [canReview, setCanReview] = useState<boolean | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [clientsById, setClientsById] = useState<Map<string, ClientRow>>(new Map());
  const [houses, setHouses] = useState<House[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [loading, setLoading] = useState(true);

  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  const [approveHouse, setApproveHouse] = useState("");
  const [approveBed, setApproveBed] = useState("");
  const [approveMoveIn, setApproveMoveIn] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [denyNoteFor, setDenyNoteFor] = useState<string | null>(null);
  const [denyNote, setDenyNote] = useState("");
  const [working, setWorking] = useState(false);

  async function loadAll() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: me } = user
      ? await supabase.from("employees").select("role").eq("auth_user_id", user.id).single()
      : { data: null };
    setCanReview(me?.role === "admin" || me?.role === "program_director");

    const [{ data: reqs }, { data: houseRows }, { data: bedRows }, { data: activeStays }] =
      await Promise.all([
        supabase
          .from("th_readmission_requests")
          .select("id, client_id, reason, preferred_house_id, status, created_at")
          .eq("status", "pending")
          .order("created_at"),
        supabase.from("th_houses").select("id, name").eq("is_active", true).order("name"),
        supabase.from("th_beds").select("id, house_id, label").eq("is_active", true).order("label"),
        supabase.from("th_stays").select("bed_id").eq("status", "active"),
      ]);

    const occupied = new Set((activeStays ?? []).map((s) => s.bed_id));
    setHouses(houseRows ?? []);
    setBeds((bedRows ?? []).filter((b) => !occupied.has(b.id)));
    setRequests(reqs ?? []);

    const clientIds = [...new Set((reqs ?? []).map((r) => r.client_id))];
    if (clientIds.length) {
      const { data: clientRows } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .in("id", clientIds);
      setClientsById(new Map((clientRows ?? []).map((c) => [c.id, c])));
    }

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addMonths(dateStr: string, months: number) {
    const d = new Date(dateStr + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  async function handleApprove(request: Request) {
    if (!approveBed || !approveMoveIn) return;
    setWorking(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user
      ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single()
      : { data: null };

    const { data: newStay, error: stayError } = await supabase
      .from("th_stays")
      .insert({
        client_id: request.client_id,
        bed_id: approveBed,
        case_manager_id: employee?.id ?? null,
        move_in_date: approveMoveIn,
        expected_exit_date: addMonths(approveMoveIn, 6),
        created_by: employee?.id ?? null,
      })
      .select("id")
      .single();

    if (stayError || !newStay) {
      setWorking(false);
      return;
    }

    await supabase
      .from("th_readmission_requests")
      .update({
        status: "approved",
        reviewed_by: employee?.id ?? null,
        reviewed_at: new Date().toISOString(),
        resulting_stay_id: newStay.id,
      })
      .eq("id", request.id);

    setWorking(false);
    setOpenRequestId(null);
    loadAll();
  }

  async function handleDeny(request: Request) {
    setWorking(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user
      ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single()
      : { data: null };

    await supabase
      .from("th_readmission_requests")
      .update({
        status: "denied",
        reviewed_by: employee?.id ?? null,
        reviewed_at: new Date().toISOString(),
        review_note: denyNote.trim() || null,
      })
      .eq("id", request.id);

    setWorking(false);
    setDenyNoteFor(null);
    setDenyNote("");
    loadAll();
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/transitional-housing"
          className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          ← Transitional Housing
        </Link>
        <h1 className="text-xl font-semibold mt-4 mb-6">Readmission Requests</h1>

        {loading ? (
          <p className="text-sm text-[var(--color-text-dim)]">Loading…</p>
        ) : canReview === false ? (
          <p className="text-sm text-[var(--color-text-dim)]">
            You can view requests, but only the Transitional Housing Director or an admin can
            approve or deny them.
          </p>
        ) : null}

        {!loading && requests.length === 0 && (
          <p className="text-sm text-[var(--color-text-dim)]">No pending requests.</p>
        )}

        <ul className="space-y-3">
          {requests.map((r) => {
            const client = clientsById.get(r.client_id);
            const isOpen = openRequestId === r.id;
            return (
              <li key={r.id} className="rounded-xl border border-[var(--color-border)] p-5">
                <p className="text-sm font-medium">
                  {client ? `${client.first_name} ${client.last_name}` : "Unknown client"}
                </p>
                <p className="text-sm text-[var(--color-text-dim)] mt-1">{r.reason}</p>
                <p className="text-xs text-[var(--color-text-dim)] mt-1">
                  Filed {new Date(r.created_at).toLocaleDateString()}
                </p>

                {canReview && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => {
                        setOpenRequestId(isOpen ? null : r.id);
                        setDenyNoteFor(null);
                      }}
                      className="rounded-lg bg-[var(--color-accent)] text-white text-xs font-medium px-3 py-1.5 hover:opacity-90"
                    >
                      Approve…
                    </button>
                    <button
                      onClick={() => {
                        setDenyNoteFor(denyNoteFor === r.id ? null : r.id);
                        setOpenRequestId(null);
                      }}
                      className="rounded-lg border border-[var(--color-border)] text-xs font-medium px-3 py-1.5"
                    >
                      Deny…
                    </button>
                  </div>
                )}

                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-[var(--color-border)] space-y-2.5">
                    <select
                      value={approveHouse}
                      onChange={(e) => {
                        setApproveHouse(e.target.value);
                        setApproveBed("");
                      }}
                      className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:outline-none"
                    >
                      <option value="">Select a house…</option>
                      {houses.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={approveBed}
                      onChange={(e) => setApproveBed(e.target.value)}
                      disabled={!approveHouse}
                      className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:outline-none disabled:opacity-50"
                    >
                      <option value="">Select an open bed…</option>
                      {beds
                        .filter((b) => b.house_id === approveHouse)
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.label}
                          </option>
                        ))}
                    </select>
                    <input
                      type="date"
                      value={approveMoveIn}
                      onChange={(e) => setApproveMoveIn(e.target.value)}
                      className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:outline-none"
                    />
                    <button
                      onClick={() => handleApprove(r)}
                      disabled={!approveBed || working}
                      className="w-full rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-50"
                    >
                      {working ? "Approving…" : "Confirm Approval & Create Stay"}
                    </button>
                  </div>
                )}

                {denyNoteFor === r.id && (
                  <div className="mt-4 pt-4 border-t border-[var(--color-border)] space-y-2.5">
                    <textarea
                      value={denyNote}
                      onChange={(e) => setDenyNote(e.target.value)}
                      placeholder="Reason for denial (optional, goes in the record)"
                      rows={2}
                      className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:outline-none resize-none"
                    />
                    <button
                      onClick={() => handleDeny(r)}
                      disabled={working}
                      className="w-full rounded-lg border border-[var(--color-border)] text-sm font-medium px-4 py-2 disabled:opacity-50"
                    >
                      {working ? "Saving…" : "Confirm Denial"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
