"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import InvoiceBadge from "@/app/inkind/components/InvoiceBadge";
import Logo from "@/app/inkind/components/Logo";

type DonorKind = "organization" | "individual" | "anonymous";

export default function IntakeScreen({
  params,
}: {
  params: { sessionId: string };
}) {
  const { sessionId } = params;
  const router = useRouter();
  const supabase = createClient();

  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [shortDescription, setShortDescription] = useState("");
  const [dateReceived, setDateReceived] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [donorKind, setDonorKind] = useState<DonorKind>("individual");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("sessions")
      .select("invoice_id")
      .eq("id", sessionId)
      .single()
      .then(({ data }) => {
        if (data) setInvoiceId(data.invoice_id);
      });
  }, [sessionId]);

  const canSubmit = dateReceived;

  async function handleNext() {
    if (!canSubmit) {
      setError("Please fill in the required fields.");
      return;
    }
    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("sessions")
      .update({
        short_description: shortDescription || null,
        date_received: dateReceived,
        donor_kind: donorKind,
      })
      .eq("id", sessionId);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    router.push(`/inkind/employee/${sessionId}`);
  }

  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto">
      <InvoiceBadge invoiceId={invoiceId} />
      <Logo className="h-8 w-auto mb-4" />
      <h1 className="text-2xl font-bold text-brand-dark mb-1">Create InKind Gift Inventory</h1>
      <p className="text-gray-500 text-sm mb-6">In-Kind Gift Inventory Flow</p>

      <div className="mb-4">
        <label className="text-sm text-gray-600">Short Description</label>
        <input
          value={shortDescription}
          onChange={(e) => setShortDescription(e.target.value)}
          className="w-full mt-1 rounded-lg border border-gray-300 p-3"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-sm text-gray-600">
            <span className="text-red-500">*</span> Date Received
          </label>
          <input
            type="date"
            value={dateReceived}
            onChange={(e) => setDateReceived(e.target.value)}
            className="w-full mt-1 rounded-lg border border-gray-300 p-3"
          />
        </div>
        <div>
          <label className="text-sm text-gray-600">
            <span className="text-red-500">*</span> Company/Org or Individual
          </label>
          <div className="mt-2 space-y-2">
            {(
              [
                ["organization", "Organization"],
                ["individual", "Individual"],
                ["anonymous", "Anonymous Individual"],
              ] as [DonorKind, string][]
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm font-medium text-gray-800">
                <input
                  type="radio"
                  name="donorKind"
                  checked={donorKind === value}
                  onChange={() => setDonorKind(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <div className="border-t border-gray-200 pt-4 flex justify-end">
        <button
          onClick={handleNext}
          disabled={saving}
          className="rounded-xl bg-brand px-8 py-3 font-semibold text-white active:scale-95 transition disabled:opacity-50"
        >
          {saving ? "Saving..." : "Next"}
        </button>
      </div>
    </main>
  );
}
