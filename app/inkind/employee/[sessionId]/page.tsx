"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ACTIONS,
  Condition,
  InventoryItem,
  fetchActiveItems,
  parseBarcode,
  priceFor,
} from "@/lib/inkind/items";
import { programsInUse } from "@/lib/inkind/programs";
import InvoiceBadge from "@/app/inkind/components/InvoiceBadge";
import Logo from "@/app/inkind/components/Logo";

type DonationLine = {
  item_code: string;
  item_name: string;
  condition: "new" | "used" | "na";
  program: string;
  program_code: string;
  unit_price: number;
  is_manual_price: boolean;
  qty: number;
  notes: string | null;
  goods_type: string | null;
  sf_category: string | null;
};

type Tally = Record<string, DonationLine>; // keyed by `${item_code}:${condition}`

export default function EmployeeScreen({
  params,
}: {
  params: { sessionId: string };
}) {
  const { sessionId } = params;
  const router = useRouter();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [buffer, setBuffer] = useState("");
  const [tally, setTally] = useState<Tally>({});
  const [status, setStatus] = useState("active");
  const [flash, setFlash] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [programFilter, setProgramFilter] = useState<string>("");
  const [manualPrompt, setManualPrompt] = useState<InventoryItem | null>(null);
  const [manualAmount, setManualAmount] = useState("");
  const [manualNoteText, setManualNoteText] = useState("");
  const [notePrompt, setNotePrompt] = useState<{ item: InventoryItem; condition: Condition } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [completeCountdown, setCompleteCountdown] = useState(10);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 9;

  const allPrograms = useMemo(() => programsInUse(items.map((i) => i.program)), [items]);

  // Load the live price catalog on mount, and keep it fresh — an admin
  // could add/reprice/remove an item mid-shift via the admin dashboard's
  // Items page, and this picks it up without needing a page reload.
  useEffect(() => {
    fetchActiveItems().then((its) => {
      setItems(its);
      setItemsLoaded(true);
    });
    const interval = setInterval(() => {
      fetchActiveItems().then(setItems);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Once the donor finishes signing, show a completion screen for 10
  // seconds, then bounce back to the home screen to start the next
  // donation.
  useEffect(() => {
    if (status !== "completed") return;
    setCompleteCountdown(10);
    const interval = setInterval(() => {
      setCompleteCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          router.push("/inkind");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  // Keep the hidden input focused so the handheld scanner (acting as a
  // keyboard) always types into it, even if someone taps elsewhere.
  useEffect(() => {
    const refocus = () => {
      if (manualPrompt || notePrompt) return;
      // Don't steal focus from the search box, category dropdown, or the
      // manual-price modal's amount field — only re-grab the hidden
      // scanner input when nothing else is actively being used.
      const active = document.activeElement;
      const isTypingElsewhere =
        active &&
        active !== inputRef.current &&
        (active.tagName === "INPUT" || active.tagName === "SELECT" || active.tagName === "TEXTAREA");
      if (isTypingElsewhere) return;
      inputRef.current?.focus();
    };
    refocus();
    const interval = setInterval(refocus, 800);
    window.addEventListener("click", refocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("click", refocus);
    };
  }, [manualPrompt, notePrompt]);

  function lineKey(itemCode: string, condition: string) {
    return `${itemCode}:${condition}`;
  }

  function tallyFromRows(rows: DonationLine[]) {
    const t: Tally = {};
    rows.forEach((row) => (t[lineKey(row.item_code, row.condition)] = row));
    return t;
  }

  // Initial load + realtime subscription
  useEffect(() => {
    async function load() {
      const [{ data: donationRows }, { data: sessionRow }] = await Promise.all([
        supabase.from("donations").select("*").eq("session_id", sessionId),
        supabase.from("sessions").select("status, invoice_id").eq("id", sessionId).single(),
      ]);
      if (donationRows) setTally(tallyFromRows(donationRows as DonationLine[]));
      if (sessionRow) {
        setStatus(sessionRow.status);
        setInvoiceId(sessionRow.invoice_id);
      }
    }
    load();

    // Same fallback as the donor screen — realtime should be instant, but
    // this keeps things in sync even on networks that block/throttle
    // WebSocket upgrades.
    const pollInterval = setInterval(load, 3000);

    const channel = supabase
      .channel(`session-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "donations", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as DonationLine | undefined;
          const oldRow = payload.old as DonationLine | undefined;
          if (payload.eventType === "DELETE" && oldRow) {
            setTally((prev) => {
              const next = { ...prev };
              delete next[lineKey(oldRow.item_code, oldRow.condition)];
              return next;
            });
          } else if (row) {
            setTally((prev) => ({ ...prev, [lineKey(row.item_code, row.condition)]: row }));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as { status: string };
          if (row?.status) setStatus(row.status);
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  async function upsertLine(next: DonationLine) {
    setTally((prev) => ({ ...prev, [lineKey(next.item_code, next.condition)]: next }));
    if (next.qty <= 0) {
      await supabase
        .from("donations")
        .delete()
        .eq("session_id", sessionId)
        .eq("item_code", next.item_code)
        .eq("condition", next.condition);
    } else {
      await supabase.from("donations").upsert(
        { session_id: sessionId, ...next },
        { onConflict: "session_id,item_code,condition" }
      );
    }
  }

  function appendNote(existing: string | null | undefined, note: string): string {
    const trimmed = note.trim();
    if (!existing) return trimmed;
    const parts = existing.split(",").map((s) => s.trim());
    if (parts.includes(trimmed)) return existing;
    return `${existing}, ${trimmed}`;
  }

  async function addFixedItem(item: InventoryItem, condition: Condition, note?: string) {
    const price = priceFor(item, condition);
    if (price == null) return; // shouldn't happen for non-manual items
    const key = lineKey(item.code, condition);
    const existing = tally[key];
    const next: DonationLine = {
      item_code: item.code,
      item_name: item.name,
      condition,
      program: item.program,
      program_code: item.programCode,
      unit_price: price,
      is_manual_price: false,
      qty: (existing?.qty ?? 0) + 1,
      notes: note ? appendNote(existing?.notes, note) : existing?.notes ?? null,
      goods_type: item.goodsType,
      sf_category: item.sfCategory,
    };
    await upsertLine(next);
    await supabase
      .from("sessions")
      .update({ last_line_key: key, last_amount: price })
      .eq("id", sessionId);
    showFlash(`+1 ${item.name} (${condition})`);
  }

  function handleTileClick(item: InventoryItem, condition: Condition) {
    if (item.requiresNote) {
      setNoteText("");
      setNotePrompt({ item, condition });
      return;
    }
    addFixedItem(item, condition);
  }

  async function confirmNote() {
    if (!notePrompt) return;
    await addFixedItem(notePrompt.item, notePrompt.condition, noteText.trim() || undefined);
    setNotePrompt(null);
  }

  function openManualPrompt(item: InventoryItem) {
    setManualAmount("");
    setManualNoteText("");
    setManualPrompt(item);
  }

  async function confirmManualAmount() {
    if (!manualPrompt) return;
    const amount = parseFloat(manualAmount);
    if (isNaN(amount) || amount < 0) return;
    const item = manualPrompt;
    const key = lineKey(item.code, "na");
    const existing = tally[key];
    const next: DonationLine = {
      item_code: item.code,
      item_name: item.name,
      condition: "na",
      program: item.program,
      program_code: item.programCode,
      unit_price: (existing?.unit_price ?? 0) + amount,
      is_manual_price: true,
      qty: (existing?.qty ?? 0) + 1,
      notes:
        item.requiresNote && manualNoteText.trim()
          ? appendNote(existing?.notes, manualNoteText)
          : existing?.notes ?? null,
      goods_type: item.goodsType,
      sf_category: item.sfCategory,
    };
    await upsertLine(next);
    await supabase
      .from("sessions")
      .update({ last_line_key: key, last_amount: amount })
      .eq("id", sessionId);
    showFlash(`+$${amount.toFixed(2)} ${item.name}`);
    setManualPrompt(null);
  }

  async function finishSession() {
    await supabase.from("sessions").update({ status: "awaiting_signature" }).eq("id", sessionId);
    setStatus("awaiting_signature");
  }

  async function undoLast() {
    const { data } = await supabase
      .from("sessions")
      .select("last_line_key, last_amount")
      .eq("id", sessionId)
      .single();
    const key = data?.last_line_key as string | undefined;
    const amount = data?.last_amount as number | undefined;
    if (!key) return;
    const [itemCode, condition] = key.split(":");
    const existing = tally[key];
    if (!existing) return;

    const nextQty = existing.qty - 1;
    const nextUnitPrice = existing.is_manual_price
      ? Math.max(0, existing.unit_price - (amount ?? 0))
      : existing.unit_price;

    await upsertLine({ ...existing, qty: nextQty, unit_price: nextUnitPrice });
    showFlash(`Undid last: ${existing.item_name}`);
    // Clear last_line_key so a second undo press doesn't repeat the same line
    // (we don't track full history, just the single most recent scan).
    await supabase.from("sessions").update({ last_line_key: null, last_amount: null }).eq("id", sessionId);
  }

  function showFlash(text: string) {
    setFlash(text);
    setTimeout(() => setFlash(null), 1200);
  }

  async function handleScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;

    if (trimmed === ACTIONS.FINISH) {
      await finishSession();
      showFlash("Finishing donation...");
      return;
    }
    if (trimmed === ACTIONS.UNDO) {
      await undoLast();
      return;
    }
    const parsed = parseBarcode(items, trimmed);
    if (!parsed) {
      showFlash(`Unrecognized code: ${trimmed}`);
      return;
    }
    if (parsed.item.manualPrice) {
      openManualPrompt(parsed.item);
      return;
    }
    if (parsed.condition) {
      if (parsed.item.requiresNote) {
        setNoteText("");
        setNotePrompt({ item: parsed.item, condition: parsed.condition });
        return;
      }
      await addFixedItem(parsed.item, parsed.condition);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleScan(buffer);
      setBuffer("");
    }
  }

  const lines = Object.values(tally).filter((l) => l.qty > 0);
  const totalItems = lines.reduce((a, l) => a + l.qty, 0);
  const totalValue = lines.reduce((a, l) => a + l.unit_price * (l.is_manual_price ? 1 : l.qty), 0);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (programFilter && i.program !== programFilter) return false;
      if (q && !i.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, programFilter]);

  useEffect(() => {
    setPage(0);
  }, [search, programFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pageItems = filteredItems.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const linesByProgram = useMemo(() => {
    const groups: Record<string, DonationLine[]> = {};
    lines.forEach((l) => {
      groups[l.program] = groups[l.program] || [];
      groups[l.program].push(l);
    });
    return groups;
  }, [lines]);

  if (status === "completed") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <Logo className="h-9 w-auto mb-6" />
        <div className="w-16 h-16 rounded-full bg-brand-light flex items-center justify-center mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-8 h-8 text-brand-dark"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-brand-dark mb-2">Donation Complete</h1>
        <p className="text-gray-500 mb-1">
          {invoiceId ?? sessionId.slice(0, 8)} · {totalItems} items · ${totalValue.toFixed(2)}
        </p>
        <p className="text-gray-400 text-sm mb-8">Thank you on behalf of ICNA Relief!</p>
        <button
          onClick={() => router.push("/inkind")}
          className="rounded-xl bg-brand px-6 py-3 font-semibold text-white active:scale-95 transition mb-3"
        >
          Start New Donation Now
        </button>
        <p className="text-xs text-gray-400">
          Returning to the home screen in {completeCountdown}s...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto">
      <InvoiceBadge invoiceId={invoiceId} />
      <Logo className="h-8 w-auto mb-4" />
      {/* Hidden input catches the barcode scanner's keystrokes. inputMode
          "none" stops iPad/mobile browsers from popping the on-screen
          keyboard every time this stays focused — a physical USB/Bluetooth
          scanner (which types via real keyboard events) still works fine,
          since that attribute only suppresses the *virtual* keyboard. */}
      <input
        ref={inputRef}
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onKeyDown={onKeyDown}
        className="opacity-0 absolute -z-10 h-0 w-0"
        inputMode="none"
        autoFocus
      />

      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Scanning Station</h1>
          <p className="text-gray-500 text-sm">
            Session {sessionId.slice(0, 8)} · {totalItems} items · ${totalValue.toFixed(2)}
          </p>
        </div>
        <span className="text-xs px-3 py-1 rounded-full bg-brand-light text-brand-dark font-medium">
          {status.replace("_", " ")}
        </span>
      </header>

      {flash && (
        <div className="mb-4 rounded-xl bg-brand text-white text-center py-3 font-semibold animate-pulse">
          {flash}
        </div>
      )}

      {status === "active" && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
          The donor screen updates automatically — no need to scan anything.
        </div>
      )}
      {(status === "active" || status === "awaiting_signature") && (
        <a
          href={`/inkind/donor/${sessionId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block mb-6 text-xs text-gray-400 hover:text-gray-600"
        >
          Donor tablet not working? Open this donation's form directly →
        </a>
      )}

      {/* Manual price modal */}
      {manualPrompt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-bold text-brand-dark mb-1">{manualPrompt.name}</h2>
            <p className="text-sm text-gray-500 mb-4">
              This item is priced at intake. Enter the $ value for this donation.
            </p>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              autoFocus
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !manualPrompt.requiresNote && confirmManualAmount()}
              placeholder="0.00"
              className="w-full rounded-lg border border-gray-300 p-3 text-lg mb-4"
            />
            {manualPrompt.requiresNote && (
              <>
                <p className="text-sm text-gray-500 mb-1">What kind? (e.g. rice, pasta, beans) — optional</p>
                <input
                  type="text"
                  value={manualNoteText}
                  onChange={(e) => setManualNoteText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmManualAmount()}
                  placeholder="e.g. Rice"
                  className="w-full rounded-lg border border-gray-300 p-3 mb-4"
                />
              </>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setManualPrompt(null)}
                className="flex-1 rounded-xl bg-gray-100 py-3 font-semibold text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmManualAmount}
                disabled={!manualAmount || isNaN(parseFloat(manualAmount))}
                className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note prompt (e.g. DRY GROCERY / LBS -> "Rice", "Pasta") */}
      {notePrompt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-bold text-brand-dark mb-1">{notePrompt.item.name}</h2>
            <p className="text-sm text-gray-500 mb-4">
              What kind? (e.g. rice, pasta, beans) — optional
            </p>
            <input
              type="text"
              autoFocus
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmNote()}
              placeholder="e.g. Rice"
              className="w-full rounded-lg border border-gray-300 p-3 text-lg mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setNotePrompt(null)}
                className="flex-1 rounded-xl bg-gray-100 py-3 font-semibold text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmNote}
                className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search + category dropdown for the touchscreen path */}
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items (e.g. aquarium, bakery, stroller)..."
          className="w-full rounded-lg border border-gray-300 p-3"
        />
        <select
          value={programFilter}
          onChange={(e) => setProgramFilter(e.target.value)}
          className="w-full rounded-lg border border-gray-300 p-3 bg-white"
        >
          <option value="">All categories</option>
          {allPrograms.map((p) => (
            <option key={p.code} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        {itemsLoaded && filteredItems.length === 0 && (
          <p className="p-4 text-sm text-gray-400 text-center rounded-xl border border-gray-200 bg-white">
            No items match your search.
          </p>
        )}
        {!itemsLoaded && (
          <p className="p-4 text-sm text-gray-400 text-center rounded-xl border border-gray-200 bg-white">
            Loading item catalog...
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {pageItems.map((item) => {
            const newQty = tally[lineKey(item.code, "new")]?.qty ?? 0;
            const usedQty = tally[lineKey(item.code, "used")]?.qty ?? 0;
            const naLine = tally[lineKey(item.code, "na")];
            const hasUsedOption = item.usedPrice !== null;
            return (
              <div
                key={item.code}
                className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col items-center text-center gap-2"
              >
                <p className="font-medium text-gray-800 text-sm leading-tight min-h-[2.5em] flex items-center">
                  {item.name}
                </p>
                {item.manualPrice ? (
                  <button
                    onClick={() => openManualPrompt(item)}
                    className="tap-target w-full rounded-lg bg-brand-light text-brand-dark px-2 py-2 text-xs font-semibold active:scale-95 transition"
                  >
                    + Add{naLine ? ` · $${naLine.unit_price.toFixed(2)} (${naLine.qty})` : ""}
                  </button>
                ) : (
                  <div className="w-full flex flex-col gap-1.5">
                    <button
                      onClick={() => handleTileClick(item, "new")}
                      className="tap-target w-full rounded-lg bg-brand text-white px-2 py-2 text-xs font-semibold active:scale-95 transition"
                    >
                      New ${item.newPrice?.toFixed(2)}
                      {newQty > 0 ? ` (${newQty})` : ""}
                    </button>
                    {hasUsedOption && (
                      <button
                        onClick={() => handleTileClick(item, "used")}
                        className="tap-target w-full rounded-lg bg-gray-700 text-white px-2 py-2 text-xs font-semibold active:scale-95 transition"
                      >
                        Used ${item.usedPrice?.toFixed(2)}
                        {usedQty > 0 ? ` (${usedQty})` : ""}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {filteredItems.length > 0 && (
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="tap-target rounded-lg bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-xs text-gray-400">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="tap-target rounded-lg bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}

      {/* Running tally, grouped by program */}
      {lines.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-500 mb-2">Current donation</h2>
          {Object.entries(linesByProgram).map(([program, progLines]) => (
            <div key={program} className="mb-3 last:mb-0">
              <p className="text-xs font-semibold text-brand-dark mb-1">{program}</p>
              <ul className="divide-y divide-gray-100">
                {progLines.map((l) => (
                  <li key={lineKey(l.item_code, l.condition)} className="flex justify-between py-1.5 text-sm">
                    <span>
                      {l.item_name}
                      {l.notes ? ` — ${l.notes}` : ""}
                      {l.condition !== "na" ? ` (${l.condition})` : ""} × {l.qty}
                    </span>
                    <span className="font-semibold">
                      ${(l.unit_price * (l.is_manual_price ? 1 : l.qty)).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="flex justify-between pt-2 mt-2 border-t border-gray-200 font-bold">
            <span>Total</span>
            <span>${totalValue.toFixed(2)}</span>
          </div>
        </div>
      )}

      <div className="flex gap-3 mt-6">
        <button
          onClick={undoLast}
          className="flex-1 rounded-xl bg-gray-100 py-4 font-semibold text-gray-700 active:scale-95 transition"
        >
          Undo Last
        </button>
        <button
          onClick={finishSession}
          disabled={status !== "active" || totalItems === 0}
          className="flex-1 rounded-xl bg-brand py-4 font-semibold text-white active:scale-95 transition disabled:opacity-40"
        >
          Finish Donation
        </button>
      </div>

      <p className="text-xs text-gray-400 mt-4 text-center">
        Tip: scanning the printed barcode sheet is the fast path — the list above is the touchscreen fallback.
      </p>
    </main>
  );
}
