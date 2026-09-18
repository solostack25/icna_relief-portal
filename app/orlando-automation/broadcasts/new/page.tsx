"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAlert } from "@/lib/orlandoAutomation/alert";
import { ORLANDO_OFFICE_ID, ORLANDO_STATE } from "@/lib/orlandoAutomation/config";

type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  dietary_preference: string | null;
};

const SMS_SEGMENT_LENGTH = 160;

export default function NewBroadcastPage() {
  const supabase = createClient();
  const router = useRouter();
  const { showAlert } = useAlert();

  const [dietaryFilter, setDietaryFilter] = useState<"all" | "Halal" | "Non-Halal">("all");
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limitInput, setLimitInput] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const debounce = setTimeout(async () => {
      setLoading(true);
      let builder = supabase
        .from("clients")
        .select("id, first_name, last_name, phone, dietary_preference")
        .not("phone", "is", null)
        .eq("is_blocked", false)
        .eq("office_id", ORLANDO_OFFICE_ID);

      if (dietaryFilter !== "all") {
        builder = builder.eq("dietary_preference", dietaryFilter);
      }
      if (search) {
        builder = builder.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`
        );
      }

      const { data } = await builder.order("first_name").limit(500);
      setClients(data ?? []);
      setLoading(false);
    }, 250);

    return () => clearTimeout(debounce);
  }, [dietaryFilter, search, supabase]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      clients.forEach((c) => next.add(c.id));
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function selectFirstN() {
    const n = parseInt(limitInput, 10);
    if (!n || n <= 0) return;
    setSelected(new Set(clients.slice(0, n).map((c) => c.id)));
  }

  const segmentCount = useMemo(
    () => Math.max(1, Math.ceil(body.length / SMS_SEGMENT_LENGTH)),
    [body]
  );

  async function handleSend() {
    if (selected.size === 0 || !body.trim()) return;
    setSending(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user
      ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single()
      : { data: null };

    const filterParts: string[] = [];
    if (dietaryFilter !== "all") filterParts.push(`${dietaryFilter} clients`);
    if (search) filterParts.push(`matching "${search}"`);
    const filterSummary = filterParts.length ? filterParts.join(", ") : "Manually selected";

    const { data: broadcast, error: broadcastError } = await supabase
      .from("broadcasts")
      .insert({
        body: body.trim(),
        filter_summary: filterSummary,
        recipient_count: selected.size,
        created_by: employee?.id ?? null,
        office_id: ORLANDO_OFFICE_ID,
      })
      .select("id")
      .single();

    if (broadcastError || !broadcast) {
      setSending(false);
      showAlert(broadcastError?.message ?? "Couldn't save the broadcast.", "error");
      return;
    }

    const recipientRows = Array.from(selected).map((clientId) => ({
      broadcast_id: broadcast.id,
      client_id: clientId,
    }));
    await supabase.from("broadcast_recipients").insert(recipientRows);

    setSending(false);
    showAlert(
      `Saved — texting isn't connected yet, so this will send through Skyetel to all ${selected.size} recipients once the phone system is wired up.`,
      "info"
    );
    router.push("/orlando-automation/broadcasts");
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/orlando-automation/broadcasts"
          className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          ← Back to bulk messaging
        </Link>

        <h1 className="text-xl font-semibold mt-4 mb-6">New Broadcast</h1>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
          <h2 className="text-sm font-medium mb-3">1. Choose recipients</h2>

          <div className="flex flex-wrap gap-2 mb-3">
            {(["all", "Halal", "Non-Halal"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setDietaryFilter(opt)}
                className={[
                  "rounded-full text-xs font-medium px-3 py-1.5 border transition-colors",
                  dietaryFilter === opt
                    ? "bg-[var(--color-accent-solid)] text-white border-transparent"
                    : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
                ].join(" ")}
              >
                {opt === "all" ? "All clients" : opt}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-sm focus:outline-none mb-3"
          />

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button
              onClick={selectAllVisible}
              className="text-xs font-medium rounded-lg border border-[var(--color-border)] px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              Select all shown ({clients.length})
            </button>
            <button
              onClick={clearSelection}
              className="text-xs font-medium rounded-lg border border-[var(--color-border)] px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              Clear
            </button>
            <div className="flex items-center gap-1.5 ml-auto">
              <input
                type="number"
                min={1}
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                placeholder="60"
                className="w-16 rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-2 py-1.5 text-xs focus:outline-none"
              />
              <button
                onClick={selectFirstN}
                className="text-xs font-medium rounded-lg border border-[var(--color-border)] px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                Select first N
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
            {loading ? (
              <p className="p-4 text-sm text-[var(--color-text-dim)]">Loading…</p>
            ) : clients.length === 0 ? (
              <p className="p-4 text-sm text-[var(--color-text-dim)]">
                No clients match these filters (only clients with a phone number on file
                can be included).
              </p>
            ) : (
              clients.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-3 px-3.5 py-2.5 text-sm cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                  <span className="flex-1">
                    {c.first_name} {c.last_name}
                  </span>
                  {c.dietary_preference && (
                    <span className="text-xs text-[var(--color-text-dim)]">
                      {c.dietary_preference}
                    </span>
                  )}
                  <span className="text-xs text-[var(--color-text-dim)]">{c.phone}</span>
                </label>
              ))
            )}
          </div>

          <p className="text-sm font-medium mt-3">
            {selected.size} client{selected.size === 1 ? "" : "s"} selected
          </p>
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="text-sm font-medium mb-3">2. Write the message</h2>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="We have 60 open slots for a same-day distribution today. Reply or open the app to book your pickup time."
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3.5 py-2.5 text-sm focus:outline-none resize-none"
          />
          <p className="text-xs text-[var(--color-text-dim)] mt-1.5">
            {body.length} characters · {segmentCount} text segment{segmentCount === 1 ? "" : "s"}
          </p>

          <button
            onClick={handleSend}
            disabled={selected.size === 0 || !body.trim() || sending}
            className="mt-4 w-full rounded-lg bg-[var(--color-accent-solid)] text-white text-sm font-medium px-4 py-2.5 hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {sending
              ? "Sending…"
              : `Send to ${selected.size} client${selected.size === 1 ? "" : "s"}`}
          </button>
        </section>
      </div>
    </main>
  );
}
