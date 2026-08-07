"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type ClientRow = { id: string; first_name: string; last_name: string };
type House = { id: string; name: string };

function NewReadmissionForm() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = searchParams.get("client");

  const [client, setClient] = useState<ClientRow | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [reason, setReason] = useState("");
  const [preferredHouseId, setPreferredHouseId] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      const [{ data: c }, { data: h }] = await Promise.all([
        supabase.from("clients").select("id, first_name, last_name").eq("id", clientId).single(),
        supabase.from("th_houses").select("id, name").eq("is_active", true).order("name"),
      ]);
      setClient(c);
      setHouses(h ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !reason.trim()) return;
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user
      ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single()
      : { data: null };

    const { error } = await supabase.from("th_readmission_requests").insert({
      client_id: clientId,
      requested_by: employee?.id ?? null,
      reason: reason.trim(),
      preferred_house_id: preferredHouseId || null,
    });

    setSaving(false);
    if (!error) {
      setSubmitted(true);
      setTimeout(() => router.push("/transitional-housing"), 1800);
    }
  }

  if (!clientId) {
    return (
      <p className="text-sm text-[var(--color-text-dim)]">
        No client selected. Start from{" "}
        <Link href="/transitional-housing/admit" className="underline">
          Admit Client
        </Link>{" "}
        instead.
      </p>
    );
  }

  return (
    <>
      <Link
        href="/transitional-housing"
        className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
      >
        ← Transitional Housing
      </Link>
      <h1 className="text-xl font-semibold mt-4 mb-6">Readmission Request</h1>

      {submitted ? (
        <div className="rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-4 py-3 text-sm text-[var(--color-accent)]">
          Request submitted — the Transitional Housing Director will need to approve it before
          a new stay can be created.
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-[var(--color-border)] p-6 space-y-3"
        >
          <p className="text-sm font-medium">
            {client ? `${client.first_name} ${client.last_name}` : "Loading…"}
          </p>

          <div>
            <label htmlFor="reason" className="block text-xs text-[var(--color-text-dim)] mb-1">
              Why does this client need to be readmitted?
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={4}
              placeholder="Explain the circumstances for the Director's review…"
              className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none resize-none"
            />
          </div>

          <div>
            <label htmlFor="house" className="block text-xs text-[var(--color-text-dim)] mb-1">
              Preferred house (optional)
            </label>
            <select
              id="house"
              value={preferredHouseId}
              onChange={(e) => setPreferredHouseId(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none"
            >
              <option value="">No preference</option>
              {houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={saving || !reason.trim()}
            className="w-full rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-4 py-2.5 hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Submitting…" : "Submit for Director Approval"}
          </button>
        </form>
      )}
    </>
  );
}

export default function NewReadmissionPage() {
  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Suspense fallback={<p className="text-sm text-[var(--color-text-dim)]">Loading…</p>}>
          <NewReadmissionForm />
        </Suspense>
      </div>
    </main>
  );
}
