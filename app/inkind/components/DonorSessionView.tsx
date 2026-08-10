"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import InvoiceBadge from "@/app/inkind/components/InvoiceBadge";
import Logo from "@/app/inkind/components/Logo";

type DonationLine = {
  item_code: string;
  item_name: string;
  condition: "new" | "used" | "na";
  qty: number;
  notes: string | null;
};

type Tally = Record<string, DonationLine>; // keyed by `${item_code}:${condition}`

function lineKey(itemCode: string, condition: string) {
  return `${itemCode}:${condition}`;
}

export default function DonorSessionView({
  sessionId,
  onSessionComplete,
}: {
  sessionId: string;
  // Provided by the mounted-kiosk screen (/donor-kiosk) so it knows when
  // to reset back to idle and wait for the next donation. Left
  // undefined on the standalone /donor/[sessionId] route, which just
  // stays on the thank-you screen — no auto-reset needed there since
  // that URL is scoped to one specific donation.
  onSessionComplete?: () => void;
}) {
  const supabase = createClient();
  const [tally, setTally] = useState<Tally>({});
  const [status, setStatus] = useState("active");
  const [submitted, setSubmitted] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [resetCountdown, setResetCountdown] = useState(12);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [taxOptIn, setTaxOptIn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "skipped" | "failed">("idle");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasSignature = useRef(false);

  useEffect(() => {
    async function load() {
      const [{ data: donationRows }, { data: sessionRow }] = await Promise.all([
        supabase
          .from("donations")
          .select("item_code, item_name, condition, qty, notes")
          .eq("session_id", sessionId),
        supabase.from("sessions").select("status, invoice_id").eq("id", sessionId).single(),
      ]);
      const t: Tally = {};
      (donationRows as DonationLine[] | null)?.forEach(
        (row) => (t[lineKey(row.item_code, row.condition)] = row)
      );
      setTally(t);
      if (sessionRow) {
        setStatus(sessionRow.status);
        setInvoiceId(sessionRow.invoice_id);
      }
    }
    load();

    // Realtime should push updates instantly, but some networks (guest
    // wifi, tablet firewalls) block or throttle WebSocket upgrades while
    // allowing normal HTTPS through — the page loads fine but never gets
    // live updates. This poll is a fallback so the donor screen still
    // self-heals within a few seconds even if realtime never connects.
    const pollInterval = setInterval(load, 3000);

    const channel = supabase
      .channel(`donor-${sessionId}`)
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

  // Kiosk mode: once the donor's submitted, count down and hand control
  // back to the parent so it can reset to the idle "waiting" screen and
  // pick up the next donation automatically.
  useEffect(() => {
    if (!submitted || !onSessionComplete) return;
    setResetCountdown(12);
    const interval = setInterval(() => {
      setResetCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onSessionComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [submitted, onSessionComplete]);

  // --- simple canvas signature pad, no external library needed ---
  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const point = "touches" in e ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    drawing.current = true;
    hasSignature.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  function endDraw() {
    drawing.current = false;
  }

  function clearSignature() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasSignature.current = false;
  }

  async function submit() {
    if (!hasSignature.current) {
      alert("Please sign before submitting.");
      return;
    }
    setSaving(true);
    const signatureData = canvasRef.current!.toDataURL("image/png");

    await supabase.from("donors").insert({
      session_id: sessionId,
      name,
      email,
      phone,
      address,
      tax_receipt_opt_in: taxOptIn,
      signature_data: signatureData,
    });
    await supabase.from("sessions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", sessionId);

    setSaving(false);
    setSubmitted(true);

    // Fire the receipt email in the background — never blocks the
    // donor from seeing "thank you", and a failure here shouldn't
    // interrupt their flow. If they didn't give an email, or Resend
    // isn't configured yet, the route just reports "skipped".
    if (email) {
      setEmailStatus("sending");
      try {
        const res = await fetch("/api/inkind/send-donor-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const result = await res.json();
        setEmailStatus(result.success ? "sent" : result.skipped ? "skipped" : "failed");
      } catch {
        setEmailStatus("failed");
      }
    } else {
      setEmailStatus("skipped");
    }
  }

  const activeLines = Object.values(tally).filter((l) => l.qty > 0);
  const totalItems = activeLines.reduce((a, l) => a + l.qty, 0);

  if (submitted) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <InvoiceBadge invoiceId={invoiceId} />
        <Logo className="h-9 w-auto" />
        <h1 className="text-3xl font-bold text-brand-dark">Thank you! 🎉</h1>
        <p className="text-gray-500">Your donation of {totalItems} items has been recorded.</p>
        {emailStatus === "sending" && <p className="text-xs text-gray-400">Emailing you a copy of your receipt...</p>}
        {emailStatus === "sent" && <p className="text-xs text-gray-400">A copy of your receipt was emailed to you.</p>}
        {emailStatus === "failed" && (
          <p className="text-xs text-gray-400">We couldn't email your receipt — ask staff for a printed copy.</p>
        )}
        {onSessionComplete && (
          <p className="text-xs text-gray-400">Ready for the next donor in {resetCountdown}s...</p>
        )}
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-lg mx-auto">
      <InvoiceBadge invoiceId={invoiceId} />
      <Logo className="h-8 w-auto mb-4" />
      <h1 className="text-2xl font-bold text-brand-dark mb-1">Your Donation</h1>
      <p className="text-gray-500 mb-4 text-sm">Items appear here live as they're scanned.</p>

      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-6">
        {activeLines.length === 0 ? (
          <p className="text-gray-400 text-sm">Waiting for the first item to be scanned...</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {activeLines.map((l) => (
              <li key={lineKey(l.item_code, l.condition)} className="flex justify-between py-2 text-sm">
                <span>
                  {l.item_name}
                  {l.notes ? ` — ${l.notes}` : ""}
                  {l.condition !== "na" ? ` (${l.condition})` : ""}
                </span>
                <span className="font-semibold">{l.qty}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-between pt-3 mt-2 border-t border-gray-200 font-bold">
          <span>Total items</span>
          <span>{totalItems}</span>
        </div>
      </div>

      {status === "active" && (
        <p className="text-center text-gray-400 text-sm">
          Your donor info form will appear once the employee finishes scanning.
        </p>
      )}

      {(status === "awaiting_signature" || status === "completed") && (
        <div className="space-y-4">
          <input
            className="w-full rounded-lg border border-gray-300 p-3"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-full rounded-lg border border-gray-300 p-3"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="w-full rounded-lg border border-gray-300 p-3"
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <input
            className="w-full rounded-lg border border-gray-300 p-3"
            placeholder="Address (for tax receipt)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={taxOptIn} onChange={(e) => setTaxOptIn(e.target.checked)} />
            Email me a tax-deductible donation receipt
          </label>

          <div>
            <p className="text-sm text-gray-600 mb-1">Signature</p>
            <canvas
              ref={canvasRef}
              width={400}
              height={140}
              className="w-full border border-gray-300 rounded-lg bg-white touch-none"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
            <button onClick={clearSignature} className="text-xs text-gray-400 mt-1">
              Clear signature
            </button>
          </div>

          <button
            onClick={submit}
            disabled={saving}
            className="w-full rounded-xl bg-brand py-4 font-semibold text-white active:scale-95 transition disabled:opacity-50"
          >
            {saving ? "Submitting..." : "Submit Donation"}
          </button>
        </div>
      )}
    </main>
  );
}
