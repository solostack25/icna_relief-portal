"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Logo from "@/app/inkind/components/Logo";
import StationOfficeBar, { useStationOffice } from "@/app/inkind/components/StationOffice";

type Session = { id: string; name: string; created_at: string; updated_at: string; receiptCount: number };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

// Scan Receipts: each session is its own Excel sheet. Start a new one or
// reopen an older one to keep adding receipts to it.
export default function ReceiptSessionsPage() {
  const router = useRouter();
  const station = useStationOffice();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  const load = useCallback(async () => {
    if (!station.officeId) return;
    const res = await fetch(`/api/inkind/receipts/sessions?officeId=${station.officeId}`);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) return setNeedsSignIn(true);
    if (!res.ok) return setError(data.error ?? "Couldn't load sessions");
    setSessions(data.sessions ?? []);
  }, [station.officeId]);

  useEffect(() => {
    setSessions(null);
    load();
  }, [load]);

  async function startSession() {
    if (!station.officeId) return setError("Choose this station's office first.");
    setCreating(true);
    setError(null);
    const res = await fetch("/api/inkind/receipts/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ officeId: station.officeId, name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.sessionId) {
      setError(data.error ?? "Couldn't start a session");
      setCreating(false);
      return;
    }
    router.push(`/inkind/receipts/${data.sessionId}`);
  }

  if (needsSignIn) return <SignInNeeded />;

  return (
    <main className="min-h-screen flex flex-col items-center gap-6 p-6">
      <div className="w-full max-w-2xl flex items-center justify-between">
        <Link href="/inkind" className="text-sm text-gray-500 underline">
          ← Donation Intake
        </Link>
      </div>
      <Logo />
      <div className="text-center">
        <h1 className="text-3xl font-bold text-brand-dark">Scan Receipts</h1>
        <p className="text-gray-500 mt-2">Each session becomes its own Excel sheet — one row per receipt.</p>
      </div>
      <StationOfficeBar station={station} />

      <div className="w-full max-w-2xl rounded-2xl border-2 border-brand/30 bg-white p-5 shadow-sm">
        <label className="block text-sm font-semibold text-brand-dark mb-2">New session</label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startSession()}
            placeholder="Name (optional) — e.g. Saturday drop-offs, Nov 4"
            className="flex-1 rounded-xl border border-gray-300 px-3 py-3 text-base"
          />
          <button
            onClick={startSession}
            disabled={creating || !station.office}
            className="tap-target rounded-xl bg-brand px-6 py-3 text-lg font-semibold text-white shadow active:scale-95 transition disabled:opacity-50"
          >
            {creating ? "Starting…" : "Start Session"}
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="w-full max-w-2xl">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">Sessions</h2>
        {sessions === null ? (
          <p className="text-gray-400 text-sm">{station.office ? "Loading…" : "Choose an office to see its sessions."}</p>
        ) : sessions.length === 0 ? (
          <p className="text-gray-400 text-sm">No sessions yet.</p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/inkind/receipts/${s.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm hover:border-brand active:scale-[0.99] transition"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-brand-dark truncate">{s.name}</p>
                    <p className="text-xs text-gray-500">Last updated {when(s.updated_at)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold">
                      {s.receiptCount} receipt{s.receiptCount === 1 ? "" : "s"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function SignInNeeded() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-5 p-6 text-center">
      <Logo />
      <h1 className="text-2xl font-bold text-brand-dark">Sign in to scan receipts</h1>
      <p className="text-gray-500 max-w-sm">Scan Receipts keeps your office&apos;s receipt sheets, so it needs your ICNA Relief sign-in.</p>
      <Link href="/" className="tap-target rounded-2xl bg-brand px-8 py-4 text-lg font-semibold text-white shadow">
        Sign in
      </Link>
      <Link href="/inkind" className="text-sm text-gray-500 underline">
        Back to Donation Intake
      </Link>
    </main>
  );
}
