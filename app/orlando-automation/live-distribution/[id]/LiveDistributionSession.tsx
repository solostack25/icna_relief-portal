"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ORLANDO_OFFICE_ID } from "@/lib/orlandoAutomation/config";
import { logAudit } from "@/lib/orlandoAutomation/audit";
import { foodBankQrSrc } from "@/lib/orlandoAutomation/foodBankQr";
import CameraScanner from "./CameraScanner";

type Distribution = {
  id: string;
  name: string;
  distribution_date: string;
  status: "open" | "closed";
};

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  client_number: string | null;
  dietary_preference: string | null;
  is_blocked: boolean | null;
  blocked_reason: string | null;
  food_bank_client_id: string | null;
  phone: string | null;
  address_line1: string | null;
};

type Entry = {
  id: string;
  client_id: string;
  food_distributed: boolean | null;
  poultry_lbs: number | null;
  meat_lbs: number | null;
  grocery_lbs: number | null;
  scanned_at: string;
  salesforce_status: "not_pushed" | "success" | "error";
  salesforce_error: string | null;
};

type WeightField = "poultry_lbs" | "meat_lbs" | "grocery_lbs";
const WEIGHTS: { field: WeightField; label: string }[] = [
  { field: "poultry_lbs", label: "Poultry" },
  { field: "meat_lbs", label: "Meat" },
  { field: "grocery_lbs", label: "Groceries" },
];

const CLIENT_COLUMNS =
  "id, first_name, last_name, client_number, dietary_preference, is_blocked, blocked_reason, food_bank_client_id, phone, address_line1";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function lbs(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function LiveDistributionSession({ distributionId }: { distributionId: string }) {
  const supabase = useMemo(() => createClient(), []);

  const [dist, setDist] = useState<Distribution | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [fbIdInput, setFbIdInput] = useState("");
  const [savingFbId, setSavingFbId] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [clients, setClients] = useState<Map<string, Client>>(new Map());
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [tab, setTab] = useState<"scan" | "served">("scan");

  // Scan state
  const [scanValue, setScanValue] = useState("");
  const [scanMsg, setScanMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [candidates, setCandidates] = useState<Client[] | null>(null);
  const [camera, setCamera] = useState(false);
  const [modal, setModal] = useState<{ entryId: string; repeat: boolean } | null>(null);
  const [answering, setAnswering] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  // Served-list state
  const [drafts, setDrafts] = useState<Map<string, Partial<Record<WeightField, string>>>>(new Map());
  const [bulk, setBulk] = useState<Record<WeightField, string>>({ poultry_lbs: "", meat_lbs: "", grocery_lbs: "" });
  const [applying, setApplying] = useState(false);
  const [pushing, setPushing] = useState<Set<string>>(new Set());
  const [pushMsg, setPushMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const clientsRef = useRef(clients);
  clientsRef.current = clients;

  const loadEntries = useCallback(async () => {
    const { data } = await supabase
      .from("live_distribution_entries")
      .select("id, client_id, food_distributed, poultry_lbs, meat_lbs, grocery_lbs, scanned_at, salesforce_status, salesforce_error")
      .eq("distribution_id", distributionId)
      .order("scanned_at", { ascending: false });
    const rows = (data ?? []) as Entry[];
    setEntries(rows);

    const missing = Array.from(new Set(rows.map((r) => r.client_id))).filter((id) => !clientsRef.current.has(id));
    if (missing.length) {
      const { data: clientRows } = await supabase.from("clients").select(CLIENT_COLUMNS).in("id", missing);
      setClients((prev) => {
        const next = new Map(prev);
        for (const c of (clientRows ?? []) as Client[]) next.set(c.id, c);
        return next;
      });
    }
  }, [supabase, distributionId]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("live_distributions")
        .select("id, name, distribution_date, status")
        .eq("id", distributionId)
        .eq("office_id", ORLANDO_OFFICE_ID)
        .maybeSingle();
      if (!data) {
        setNotFound(true);
        return;
      }
      setDist(data as Distribution);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: emp } = await supabase.from("employees").select("id").eq("auth_user_id", user.id).single();
        setEmployeeId(emp?.id ?? null);
      }
    })();
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distributionId]);

  // Several stations can scan into the same distribution - keep the list fresh.
  useEffect(() => {
    const channel = supabase
      .channel(`live-dist-${distributionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_distribution_entries", filter: `distribution_id=eq.${distributionId}` },
        () => loadEntries()
      )
      .subscribe();
    const poll = setInterval(loadEntries, 20000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [supabase, distributionId, loadEntries]);

  const isOpen = dist?.status === "open";

  function refocus() {
    if (!camera) setTimeout(() => scanRef.current?.focus(), 50);
  }

  // ---------- Scanning ----------

  function escapeLike(v: string) {
    return v.replace(/[%_\\]/g, (ch) => `\\${ch}`);
  }

  // Exact hit from an ID card: client number, or an active card number.
  async function findByIdCard(term: string): Promise<Client | null> {
    const { data: byNumber } = await supabase
      .from("clients")
      .select(CLIENT_COLUMNS)
      .eq("office_id", ORLANDO_OFFICE_ID)
      .ilike("client_number", escapeLike(term))
      .limit(1)
      .maybeSingle();
    if (byNumber) return byNumber as Client;

    const { data: card } = await supabase
      .from("client_id_cards")
      .select("client_id")
      .eq("card_number", term)
      .eq("is_active", true)
      .maybeSingle();
    if (card?.client_id) {
      const { data: byCard } = await supabase
        .from("clients")
        .select(CLIENT_COLUMNS)
        .eq("id", card.client_id)
        .eq("office_id", ORLANDO_OFFICE_ID)
        .maybeSingle();
      if (byCard) return byCard as Client;
    }
    return null;
  }

  // No card? Look the person up by what they can tell you at the car
  // window: email (contains @), phone (7+ digits, any formatting), or
  // street address. Orlando clients only.
  async function searchClients(term: string): Promise<Client[]> {
    const base = () => supabase.from("clients").select(CLIENT_COLUMNS).eq("office_id", ORLANDO_OFFICE_ID).limit(10);

    if (term.includes("@")) {
      const { data } = await base().ilike("email", escapeLike(term));
      return (data ?? []) as Client[];
    }

    const digits = term.replace(/\D/g, "");
    const looksLikePhone = /^[\d\s()+.\-]+$/.test(term) && digits.length >= 7;
    if (looksLikePhone) {
      // Phones are stored however they were typed ("(407) 555-1234",
      // "407.555.1234", "+14075551234") - match the digits in order with
      // anything between them. Last 10 digits drops a leading country code.
      const pattern = `%${digits.slice(-10).split("").join("%")}%`;
      const { data } = await base().ilike("phone", pattern);
      return (data ?? []) as Client[];
    }

    if (term.length < 3) return [];
    const { data } = await base().ilike("address_line1", `%${escapeLike(term)}%`);
    return (data ?? []) as Client[];
  }

  async function handleScan(raw: string) {
    const term = raw.trim();
    if (!term || lookingUp || modal) return;
    if (!isOpen) {
      setScanMsg({ text: "This distribution is closed - reopen it to keep scanning.", ok: false });
      return;
    }
    setLookingUp(true);
    setScanMsg(null);
    setCandidates(null);

    const carded = await findByIdCard(term);
    if (carded) {
      setLookingUp(false);
      setScanValue("");
      await recordScan(carded);
      return;
    }

    const matches = await searchClients(term);
    setLookingUp(false);

    if (matches.length === 0) {
      setScanMsg({ text: `No Orlando client found for "${term}" (client number, card, phone, email, or street address).`, ok: false });
      setScanValue("");
      refocus();
      return;
    }
    setScanValue("");
    if (matches.length === 1) {
      await recordScan(matches[0]);
      return;
    }
    // Several people share that phone/address (households) - let staff pick.
    setCandidates(matches);
  }

  async function recordScan(client: Client) {
    setCandidates(null);
    setClients((prev) => new Map(prev).set(client.id, client));

    const existing = entries.find((e) => e.client_id === client.id);
    if (existing) {
      setModal({ entryId: existing.id, repeat: true });
      return;
    }

    setLookingUp(true);
    const { data: inserted, error } = await supabase
      .from("live_distribution_entries")
      .insert({
        distribution_id: distributionId,
        office_id: ORLANDO_OFFICE_ID,
        client_id: client.id,
        scanned_by: employeeId,
      })
      .select("id, client_id, food_distributed, poultry_lbs, meat_lbs, grocery_lbs, scanned_at, salesforce_status, salesforce_error")
      .single();
    setLookingUp(false);

    if (error || !inserted) {
      // Another station may have scanned the same person a moment ago.
      if (error?.code === "23505") {
        await loadEntries();
        const { data: row } = await supabase
          .from("live_distribution_entries")
          .select("id")
          .eq("distribution_id", distributionId)
          .eq("client_id", client.id)
          .maybeSingle();
        if (row) setModal({ entryId: row.id, repeat: true });
        return;
      }
      setScanMsg({ text: error?.message ?? "Couldn't record the scan.", ok: false });
      refocus();
      return;
    }

    setEntries((prev) => [inserted as Entry, ...prev]);
    setModal({ entryId: inserted.id, repeat: false });
  }

  async function answer(distributed: boolean) {
    if (!modal) return;
    setAnswering(true);
    const { error } = await supabase
      .from("live_distribution_entries")
      .update({ food_distributed: distributed })
      .eq("id", modal.entryId);
    setAnswering(false);
    if (error) {
      setScanMsg({ text: error.message, ok: false });
      return;
    }
    const entry = entries.find((e) => e.id === modal.entryId);
    const client = entry ? clients.get(entry.client_id) : undefined;
    setEntries((prev) => prev.map((e) => (e.id === modal.entryId ? { ...e, food_distributed: distributed } : e)));
    await logAudit(supabase, employeeId, distributed ? "live_distribution_served" : "live_distribution_not_served", "live_distribution_entry", modal.entryId, {
      distribution_id: distributionId,
      client_id: entry?.client_id,
    });
    setScanMsg({
      text: `${client ? `${client.first_name} ${client.last_name}` : "Client"} — ${distributed ? "food distributed ✓" : "marked not distributed"}`,
      ok: distributed,
    });
    setModal(null);
    refocus();
  }

  // Lets staff add a missing food bank ID right at the curb; it's saved to
  // the client profile, so next time the QR is already there.
  async function saveFoodBankId() {
    const value = fbIdInput.trim();
    const entry = modal ? entries.find((e) => e.id === modal.entryId) : undefined;
    if (!value || !entry) return;
    setSavingFbId(true);
    const { error } = await supabase.from("clients").update({ food_bank_client_id: value }).eq("id", entry.client_id);
    setSavingFbId(false);
    if (error) {
      setScanMsg({ text: error.message, ok: false });
      return;
    }
    setClients((prev) => {
      const next = new Map(prev);
      const c = next.get(entry.client_id);
      if (c) next.set(entry.client_id, { ...c, food_bank_client_id: value });
      return next;
    });
    await logAudit(supabase, employeeId, "set_food_bank_id", "client", entry.client_id, { food_bank_client_id: value });
    setFbIdInput("");
  }

  function closeModal() {
    setModal(null);
    setFbIdInput("");
    refocus();
  }

  // Esc closes the serve modal. (No Y/N letter shortcuts on purpose - a USB
  // scanner "types" the next card's number, which could contain either.)
  useEffect(() => {
    if (!modal) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal]);

  async function setStatus(status: "open" | "closed") {
    await supabase
      .from("live_distributions")
      .update({ status, closed_at: status === "closed" ? new Date().toISOString() : null })
      .eq("id", distributionId);
    await logAudit(supabase, employeeId, status === "closed" ? "close_live_distribution" : "reopen_live_distribution", "live_distribution", distributionId);
    setDist((d) => (d ? { ...d, status } : d));
  }

  // ---------- Served list ----------

  const served = entries.filter((e) => e.food_distributed === true);
  const editable = (e: Entry) => e.food_distributed === true && e.salesforce_status !== "success";
  const readyToPush = served.filter((e) => e.salesforce_status !== "success");

  const totals = served.reduce(
    (acc, e) => ({
      poultry: acc.poultry + Number(e.poultry_lbs ?? 0),
      meat: acc.meat + Number(e.meat_lbs ?? 0),
      grocery: acc.grocery + Number(e.grocery_lbs ?? 0),
    }),
    { poultry: 0, meat: 0, grocery: 0 }
  );

  function draftValue(e: Entry, field: WeightField) {
    const d = drafts.get(e.id)?.[field];
    if (d !== undefined) return d;
    return e[field] === null || e[field] === undefined ? "" : String(e[field]);
  }

  function setDraft(entryId: string, field: WeightField, value: string) {
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(entryId, { ...(next.get(entryId) ?? {}), [field]: value });
      return next;
    });
  }

  async function saveWeight(e: Entry, field: WeightField) {
    const raw = drafts.get(e.id)?.[field];
    if (raw === undefined) return;
    const value = raw.trim() === "" ? null : Number(raw);
    if (value !== null && (Number.isNaN(value) || value < 0)) {
      setPushMsg({ text: "Pounds must be a positive number.", ok: false });
      return;
    }
    if (value === (e[field] === null ? null : Number(e[field]))) return;
    const { error } = await supabase.from("live_distribution_entries").update({ [field]: value }).eq("id", e.id);
    if (error) {
      setPushMsg({ text: error.message, ok: false });
      return;
    }
    setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, [field]: value } : x)));
    setDrafts((prev) => {
      const next = new Map(prev);
      const d = { ...(next.get(e.id) ?? {}) };
      delete d[field];
      next.set(e.id, d);
      return next;
    });
  }

  async function applyToAll() {
    const patch: Partial<Record<WeightField, number>> = {};
    for (const { field } of WEIGHTS) {
      const raw = bulk[field].trim();
      if (raw === "") continue;
      const n = Number(raw);
      if (Number.isNaN(n) || n < 0) {
        setPushMsg({ text: "Pounds must be a positive number.", ok: false });
        return;
      }
      patch[field] = n;
    }
    if (Object.keys(patch).length === 0) return;
    const targets = served.filter(editable);
    if (targets.length === 0) {
      setPushMsg({ text: "No served rows left to update (already-pushed rows are locked).", ok: false });
      return;
    }
    setApplying(true);
    const { error } = await supabase.from("live_distribution_entries").update(patch).in("id", targets.map((t) => t.id));
    setApplying(false);
    if (error) {
      setPushMsg({ text: error.message, ok: false });
      return;
    }
    setEntries((prev) => prev.map((e) => (targets.some((t) => t.id === e.id) ? { ...e, ...patch } : e)));
    setDrafts(new Map());
    setBulk({ poultry_lbs: "", meat_lbs: "", grocery_lbs: "" });
    await logAudit(supabase, employeeId, "live_distribution_bulk_weights", "live_distribution", distributionId, { ...patch, rows: targets.length });
    setPushMsg({ text: `Pounds applied to ${targets.length} served ${targets.length === 1 ? "client" : "clients"}.`, ok: true });
  }

  async function push(entryIds: string[]) {
    if (entryIds.length === 0) return;
    setPushMsg(null);
    setPushing((prev) => new Set([...Array.from(prev), ...entryIds]));
    try {
      const res = await fetch("/api/orlando-automation/live-distribution/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPushMsg({ text: data.error ?? "Push failed.", ok: false });
      } else if (entryIds.length === 1) {
        const r = data.results?.[0];
        setPushMsg(
          r?.status === "success"
            ? { text: "Pushed to Salesforce.", ok: true }
            : { text: r?.message ?? "Push failed.", ok: false }
        );
      } else {
        setPushMsg({
          text: `Pushed ${data.pushed}${data.failed ? `, ${data.failed} failed` : ""}${data.skipped ? `, ${data.skipped} skipped` : ""}.`,
          ok: data.failed === 0,
        });
      }
    } catch (err) {
      setPushMsg({ text: err instanceof Error ? err.message : "Push failed.", ok: false });
    }
    setPushing((prev) => {
      const next = new Set(prev);
      entryIds.forEach((id) => next.delete(id));
      return next;
    });
    loadEntries();
  }

  // ---------- Render ----------

  if (notFound) {
    return (
      <main className="min-h-screen px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <p className="text-sm text-[var(--color-text-dim)]">Distribution not found.</p>
          <Link href="/orlando-automation/live-distribution" className="text-sm text-[var(--color-accent)]">
            ← Live Distribution
          </Link>
        </div>
      </main>
    );
  }

  const modalEntry = modal ? entries.find((e) => e.id === modal.entryId) : undefined;
  const modalClient = modalEntry ? clients.get(modalEntry.client_id) : undefined;
  const qrSrc = foodBankQrSrc(modalClient?.food_bank_client_id);

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
  const smallInput =
    "w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50";

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              {dist?.name ?? "Live Distribution"}
              {dist && (
                <span
                  className={[
                    "rounded-full text-xs font-medium px-2.5 py-0.5",
                    isOpen ? "bg-[var(--badge-green-bg)] text-[var(--badge-green-fg)]" : "bg-[var(--color-bg)] text-[var(--color-text-dim)]",
                  ].join(" ")}
                >
                  {isOpen ? "Live" : "Closed"}
                </span>
              )}
            </h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              {dist ? new Date(dist.distribution_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : ""}
              {" · "}
              {served.length} served
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {dist && (
              <button
                type="button"
                onClick={() => setStatus(isOpen ? "closed" : "open")}
                className="text-xs font-medium rounded-lg px-3 py-2 border border-[var(--color-border)] hover:border-[var(--color-accent)]"
              >
                {isOpen ? "Close distribution" : "Reopen"}
              </button>
            )}
            <Link href="/orlando-automation/live-distribution" className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
              ← All distributions
            </Link>
          </div>
        </div>

        <div className="flex gap-2 mb-6 border-b border-[var(--color-border)]">
          {(
            [
              ["scan", "Scan"],
              ["served", `Served (${served.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
                if (key === "scan") refocus();
              }}
              className={[
                "px-4 py-2 text-sm font-medium -mb-px border-b-2",
                tab === key ? "border-[var(--color-accent)] text-[var(--color-accent)]" : "border-transparent text-[var(--color-text-dim)]",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "scan" ? (
          <div className="max-w-xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleScan(scanValue);
              }}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-3"
            >
              <label htmlFor="ld-scan" className="block text-sm font-medium">
                Scan ID card or look up a client
              </label>
              <input
                id="ld-scan"
                ref={scanRef}
                autoFocus
                autoComplete="off"
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                disabled={!isOpen}
                placeholder={isOpen ? "Scan, or type client number, phone, email, or street address" : "Distribution is closed"}
                className={`${inputClass} text-base py-3`}
              />
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={!isOpen || lookingUp || !scanValue.trim()}
                  className="rounded-lg bg-[var(--color-accent-solid)] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                >
                  {lookingUp ? "Looking up…" : "Look up"}
                </button>
                <button
                  type="button"
                  onClick={() => setCamera((c) => !c)}
                  disabled={!isOpen}
                  className="rounded-lg border border-[var(--color-border)] text-sm font-medium px-4 py-2 disabled:opacity-50"
                >
                  {camera ? "Stop camera" : "Scan with camera"}
                </button>
              </div>
              {camera && isOpen && <CameraScanner onScan={handleScan} paused={!!modal || lookingUp} />}
            </form>

            {candidates && (
              <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-sm font-medium">{candidates.length} matches — pick the client at the car</p>
                  <button
                    type="button"
                    onClick={() => {
                      setCandidates(null);
                      refocus();
                    }}
                    className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                  >
                    Cancel
                  </button>
                </div>
                <div className="space-y-1">
                  {candidates.map((c) => {
                    const scanned = entries.some((e) => e.client_id === c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => recordScan(c)}
                        className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-[var(--color-bg)]"
                      >
                        <span>
                          <span className="text-sm font-medium">
                            {c.first_name} {c.last_name}
                          </span>
                          <span className="block text-xs text-[var(--color-text-dim)]">
                            {[c.client_number, c.phone, c.address_line1].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        {scanned && <span className="text-xs text-[var(--color-text-dim)]">Already scanned</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {scanMsg && (
              <p
                role="status"
                className={[
                  "mt-4 text-sm rounded-lg px-3 py-2 border",
                  scanMsg.ok ? "border-[var(--color-accent)]/40 text-[var(--color-accent)] bg-[var(--badge-green-bg)]" : "border-red-200 text-red-700 bg-red-50",
                ].join(" ")}
              >
                {scanMsg.text}
              </p>
            )}

            {entries.length > 0 && (
              <div className="mt-6">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-dim)] mb-2">Recent scans</h2>
                <div className="space-y-1">
                  {entries.slice(0, 6).map((e) => {
                    const c = clients.get(e.client_id);
                    return (
                      <div key={e.id} className="flex items-center justify-between text-sm">
                        <span>
                          {c ? `${c.first_name} ${c.last_name}` : "…"}{" "}
                          <span className="text-[var(--color-text-dim)]">{fmtTime(e.scanned_at)}</span>
                        </span>
                        <span className={e.food_distributed === true ? "text-[var(--color-accent)]" : "text-[var(--color-text-dim)]"}>
                          {e.food_distributed === true ? "Served" : e.food_distributed === false ? "Not served" : "No answer"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 mb-4">
              <div className="flex flex-wrap items-end gap-3">
                {WEIGHTS.map(({ field, label }) => (
                  <div key={field}>
                    <label className="block text-xs mb-1 text-[var(--color-text-dim)]">{label} (lbs)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={bulk[field]}
                      onChange={(e) => setBulk((b) => ({ ...b, [field]: e.target.value }))}
                      className="w-28 rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={applyToAll}
                  disabled={applying || served.length === 0}
                  className="rounded-lg border border-[var(--color-accent)] text-[var(--color-accent)] text-sm font-medium px-4 py-2 disabled:opacity-50"
                >
                  {applying ? "Applying…" : "Apply to all"}
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => push(readyToPush.map((e) => e.id))}
                  disabled={readyToPush.length === 0 || pushing.size > 0}
                  className="rounded-lg bg-[var(--color-accent-solid)] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                >
                  {pushing.size > 1 ? "Pushing…" : `Push all to Salesforce (${readyToPush.length})`}
                </button>
              </div>
              <p className="text-xs text-[var(--color-text-dim)] mt-3">
                Apply to all fills in every served client that hasn&apos;t been pushed yet; blank fields are left as they are.
                Totals: {lbs(totals.poultry)} lbs poultry · {lbs(totals.meat)} lbs meat · {lbs(totals.grocery)} lbs groceries.
              </p>
            </div>

            {pushMsg && (
              <p
                role="status"
                className={[
                  "mb-4 text-sm rounded-lg px-3 py-2 border",
                  pushMsg.ok ? "border-[var(--color-accent)]/40 text-[var(--color-accent)] bg-[var(--badge-green-bg)]" : "border-red-200 text-red-700 bg-red-50",
                ].join(" ")}
              >
                {pushMsg.text}
              </p>
            )}

            {entries.length === 0 ? (
              <p className="text-sm text-[var(--color-text-dim)]">No one scanned yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--color-text-dim)] border-b border-[var(--color-border)]">
                      <th className="px-3 py-2 font-medium">Client</th>
                      <th className="px-3 py-2 font-medium">Time</th>
                      <th className="px-3 py-2 font-medium">Distributed</th>
                      {WEIGHTS.map((w) => (
                        <th key={w.field} className="px-3 py-2 font-medium">
                          {w.label} (lbs)
                        </th>
                      ))}
                      <th className="px-3 py-2 font-medium">Salesforce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => {
                      const c = clients.get(e.client_id);
                      const canEdit = editable(e);
                      const isPushing = pushing.has(e.id);
                      return (
                        <tr key={e.id} className={["border-b border-[var(--color-border)] last:border-0", e.food_distributed === true ? "" : "opacity-60"].join(" ")}>
                          <td className="px-3 py-2">
                            <Link href={`/orlando-automation/clients/${e.client_id}`} className="font-medium hover:underline">
                              {c ? `${c.first_name} ${c.last_name}` : "…"}
                            </Link>
                            <div className="text-xs text-[var(--color-text-dim)]">{c?.client_number ?? ""}</div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{fmtTime(e.scanned_at)}</td>
                          <td className="px-3 py-2">
                            {e.salesforce_status === "success" ? (
                              <span>Yes</span>
                            ) : (
                              <select
                                value={e.food_distributed === null ? "" : e.food_distributed ? "yes" : "no"}
                                onChange={async (ev) => {
                                  const v = ev.target.value === "" ? null : ev.target.value === "yes";
                                  await supabase.from("live_distribution_entries").update({ food_distributed: v }).eq("id", e.id);
                                  setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, food_distributed: v } : x)));
                                }}
                                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-2 py-1 text-sm"
                              >
                                <option value="">—</option>
                                <option value="yes">Yes</option>
                                <option value="no">No</option>
                              </select>
                            )}
                          </td>
                          {WEIGHTS.map(({ field }) => (
                            <td key={field} className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                value={draftValue(e, field)}
                                disabled={!canEdit}
                                onChange={(ev) => setDraft(e.id, field, ev.target.value)}
                                onBlur={() => saveWeight(e, field)}
                                onKeyDown={(ev) => {
                                  if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
                                }}
                                className={smallInput}
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2 whitespace-nowrap">
                            {e.salesforce_status === "success" ? (
                              <span className="rounded-full text-xs font-medium px-2.5 py-0.5 bg-[var(--badge-green-bg)] text-[var(--badge-green-fg)]">Pushed</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => push([e.id])}
                                  disabled={e.food_distributed !== true || isPushing}
                                  className="rounded-lg border border-[var(--color-accent)] text-[var(--color-accent)] text-xs font-medium px-3 py-1.5 disabled:opacity-40"
                                >
                                  {isPushing ? "Pushing…" : e.salesforce_status === "error" ? "Retry" : "Push"}
                                </button>
                                {e.salesforce_status === "error" && (
                                  <span className="text-xs text-red-700" title={e.salesforce_error ?? ""}>
                                    Failed
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true" aria-labelledby="ld-modal-title">
          <div className="w-full max-w-md rounded-2xl bg-[var(--color-surface)] p-6 shadow-xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 id="ld-modal-title" className="text-lg font-semibold">
                  {modalClient ? `${modalClient.first_name} ${modalClient.last_name}` : "Client"}
                </h2>
                <p className="text-sm text-[var(--color-text-dim)]">
                  {modalClient?.client_number ?? ""}
                  {modalClient?.dietary_preference && modalClient.dietary_preference !== "None" ? ` · ${modalClient.dietary_preference}` : ""}
                </p>
              </div>
              <button type="button" onClick={closeModal} aria-label="Close" className="text-[var(--color-text-dim)] text-lg leading-none">
                ✕
              </button>
            </div>

            {modal.repeat && modalEntry && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                Already scanned at {fmtTime(modalEntry.scanned_at)}
                {modalEntry.food_distributed === true ? " - marked as served." : modalEntry.food_distributed === false ? " - marked not served." : "."}
              </p>
            )}
            {modalClient?.is_blocked && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                This client is blocked{modalClient.blocked_reason ? `: ${modalClient.blocked_reason}` : "."}
              </p>
            )}

            <div className="flex flex-col items-center rounded-xl border border-[var(--color-border)] bg-white p-4 mb-5">
              {qrSrc ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrSrc} alt={`Food bank QR code for ID ${modalClient?.food_bank_client_id}`} className="w-56 h-56 object-contain" />
                  <p className="text-xs text-[#5f6e68] mt-2" dir="ltr">
                    Food bank ID {modalClient?.food_bank_client_id} — scan into their system
                  </p>
                </>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveFoodBankId();
                  }}
                  className="w-full py-2"
                >
                  <p className="text-sm text-amber-700 mb-2 text-center">No food bank ID on file for this client.</p>
                  <div className="flex gap-2">
                    <input
                      value={fbIdInput}
                      onChange={(e) => setFbIdInput(e.target.value)}
                      placeholder="Enter their food bank ID"
                      className="flex-1 rounded-lg border border-[#dde4df] bg-white px-3 py-2 text-sm text-[#16302b] outline-none focus:border-[#1f6f54]"
                    />
                    <button
                      type="submit"
                      disabled={savingFbId || !fbIdInput.trim()}
                      className="rounded-lg bg-[#1f6f54] text-white text-sm font-medium px-3 py-2 disabled:opacity-50"
                    >
                      {savingFbId ? "Saving…" : "Save & show QR"}
                    </button>
                  </div>
                </form>
              )}
            </div>

            <p className="text-sm font-medium mb-3 text-center">Was food distributed?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => answer(true)}
                disabled={answering}
                className={[
                  "rounded-xl py-4 text-base font-semibold text-white bg-[var(--color-accent-solid)] disabled:opacity-50",
                  modalEntry?.food_distributed === true ? "ring-4 ring-[var(--color-accent)]/30" : "",
                ].join(" ")}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => answer(false)}
                disabled={answering}
                className={[
                  "rounded-xl py-4 text-base font-semibold border-2 border-[#B55139] text-[#B55139] disabled:opacity-50",
                  modalEntry?.food_distributed === false ? "ring-4 ring-[#B55139]/20" : "",
                ].join(" ")}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
