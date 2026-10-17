"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/app/inkind/components/Logo";

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Second screen: after "Start New Donation", staff pick whether this
  // is a cash/check gift or physical in-kind items.
  const [choosing, setChoosing] = useState(false);

  async function startSession() {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data: invoiceId, error: invoiceError } = await supabase.rpc("next_invoice_id", {
      prefix: "TXHOU",
    });
    if (invoiceError || !invoiceId) {
      setError(invoiceError?.message ?? "Could not generate an invoice number");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("sessions")
      .insert({
        status: "active",
        invoice_id: invoiceId,
        office: "Houston",
        // Only one InKind kiosk exists today (Houston), so this is
        // hardcoded the same way `office` above is. If a second office
        // ever gets its own kiosk, this needs to come from per-device
        // config instead of a constant.
        office_id: "c2892dfa-dbf4-48f5-b64c-31a8585a0c03",
        donor_kind: "individual",
      })
      .select("id")
      .single();

    if (error || !data) {
      setError(error?.message ?? "Could not start a session");
      setLoading(false);
      return;
    }

    router.push(`/inkind/intake/${data.id}`);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-6 text-center">
      <Logo />
      <div>
        <h1 className="text-3xl font-bold text-brand-dark">Donation Intake</h1>
        <p className="text-gray-500 mt-2">This is the employee scanning station.</p>
      </div>
      {!choosing ? (
        <button
          onClick={() => setChoosing(true)}
          className="tap-target rounded-2xl bg-brand px-10 py-6 text-xl font-semibold text-white shadow-lg active:scale-95 transition"
        >
          Start New Donation
        </button>
      ) : (
        <div className="w-full max-w-md space-y-4">
          <p className="text-gray-600 font-medium">What kind of donation is this?</p>
          <button
            onClick={() => router.push("/inkind/cash-check")}
            className="tap-target w-full rounded-2xl bg-brand px-8 py-6 text-left text-white shadow-lg active:scale-95 transition"
          >
            <span className="block text-xl font-semibold">Cash / Check</span>
            <span className="block text-sm opacity-80">Money received in person</span>
          </button>
          <button
            onClick={startSession}
            disabled={loading}
            className="tap-target w-full rounded-2xl border-2 border-brand bg-white px-8 py-6 text-left text-brand-dark shadow-lg active:scale-95 transition disabled:opacity-50"
          >
            <span className="block text-xl font-semibold">{loading ? "Starting..." : "In-Kind Items"}</span>
            <span className="block text-sm text-gray-500">Goods scanned into inventory</span>
          </button>
          <button onClick={() => setChoosing(false)} className="text-sm text-gray-500 underline">
            Back
          </button>
        </div>
      )}
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </main>
  );
}
