"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ORLANDO_OFFICE_ID } from "@/lib/orlandoAutomation/config";
import { logAudit } from "@/lib/orlandoAutomation/audit";

type Distribution = {
  id: string;
  name: string;
  distribution_date: string;
  status: "open" | "closed";
  created_at: string;
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function defaultName() {
  return `Live Distribution — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export default function LiveDistributionHome() {
  const supabase = createClient();
  const router = useRouter();

  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [counts, setCounts] = useState<Map<string, { served: number; scanned: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(defaultName());
  const [date, setDate] = useState(todayISO());
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data: rows } = await supabase
      .from("live_distributions")
      .select("id, name, distribution_date, status, created_at")
      .eq("office_id", ORLANDO_OFFICE_ID)
      .order("distribution_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);
    const list = (rows ?? []) as Distribution[];
    setDistributions(list);

    const ids = list.map((d) => d.id);
    const { data: entries } = ids.length
      ? await supabase.from("live_distribution_entries").select("distribution_id, food_distributed").in("distribution_id", ids)
      : { data: [] as { distribution_id: string; food_distributed: boolean | null }[] };
    const map = new Map<string, { served: number; scanned: number }>();
    for (const e of entries ?? []) {
      const c = map.get(e.distribution_id) ?? { served: 0, scanned: 0 };
      c.scanned += 1;
      if (e.food_distributed === true) c.served += 1;
      map.set(e.distribution_id, c);
    }
    setCounts(map);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    setStarting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user
      ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single()
      : { data: null };

    const { data, error: insertError } = await supabase
      .from("live_distributions")
      .insert({ office_id: ORLANDO_OFFICE_ID, name: name.trim(), distribution_date: date, created_by: employee?.id ?? null })
      .select("id")
      .single();

    if (insertError || !data) {
      setStarting(false);
      setError(insertError?.message ?? "Couldn't start the distribution.");
      return;
    }
    await logAudit(supabase, employee?.id ?? null, "start_live_distribution", "live_distribution", data.id, { name: name.trim() });
    router.push(`/orlando-automation/live-distribution/${data.id}`);
  }

  const open = distributions.filter((d) => d.status === "open");
  const closed = distributions.filter((d) => d.status === "closed");

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

  function row(d: Distribution) {
    const c = counts.get(d.id) ?? { served: 0, scanned: 0 };
    return (
      <Link
        key={d.id}
        href={`/orlando-automation/live-distribution/${d.id}`}
        className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 hover:border-[var(--color-accent)] transition-colors"
      >
        <div>
          <p className="text-sm font-medium">{d.name}</p>
          <p className="text-xs text-[var(--color-text-dim)]">
            {new Date(d.distribution_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            {" · "}
            {c.served} served{c.scanned !== c.served ? ` (${c.scanned} scanned)` : ""}
          </p>
        </div>
        <span
          className={[
            "rounded-full text-xs font-medium px-2.5 py-0.5",
            d.status === "open"
              ? "bg-[var(--badge-green-bg)] text-[var(--badge-green-fg)]"
              : "bg-[var(--color-bg)] text-[var(--color-text-dim)]",
          ].join(" ")}
        >
          {d.status === "open" ? "Live" : "Closed"}
        </span>
      </Link>
    );
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Live Distribution</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Scan each client&apos;s ID card as their car pulls up
            </p>
          </div>
          <Link href="/orlando-automation" className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
            ← Home
          </Link>
        </div>

        <form
          onSubmit={start}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 mb-6 space-y-3"
        >
          <h2 className="text-sm font-medium">Start a live distribution</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs mb-1 text-[var(--color-text-dim)]">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className="block text-xs mb-1 text-[var(--color-text-dim)]">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={inputClass} />
            </div>
          </div>
          {error && <p className="text-sm text-[#B55139]">{error}</p>}
          <button
            type="submit"
            disabled={starting}
            className="w-full rounded-lg bg-[var(--color-accent-solid)] text-white text-sm font-medium py-2.5 disabled:opacity-50"
          >
            {starting ? "Starting…" : "Start Live Distribution"}
          </button>
        </form>

        {loading ? (
          <p className="text-sm text-[var(--color-text-dim)]">Loading…</p>
        ) : (
          <>
            {open.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-dim)] mb-2">Live now</h2>
                <div className="space-y-2">{open.map(row)}</div>
              </div>
            )}
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-dim)] mb-2">Past distributions</h2>
            {closed.length === 0 ? (
              <p className="text-sm text-[var(--color-text-dim)]">None yet.</p>
            ) : (
              <div className="space-y-2">{closed.map(row)}</div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
