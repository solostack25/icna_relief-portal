"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [invoiceDisclaimer, setInvoiceDisclaimer] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase.from("settings").select("*").eq("id", "global").maybeSingle();
      if (error) {
        setError(error.message);
      } else if (data) {
        setInvoiceDisclaimer(data.invoice_disclaimer ?? "");
        setEmailSubject(data.email_subject ?? "");
        setEmailBody(data.email_body ?? "");
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/inkind-admin/settings/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceDisclaimer,
        emailSubject,
        emailBody,
      }),
    });
    const result = await res.json();
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? "Failed to save");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) {
    return (
      <main className="p-6 max-w-3xl">
        <p className="text-gray-400 text-sm">Loading...</p>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-brand-dark mb-1">Invoice &amp; Email Settings</h1>
      <p className="text-gray-500 text-sm mb-6">
        Changes here apply immediately — no redeploy needed. The disclaimer shows on every donor
        receipt PDF; the email subject/message is used every time a receipt is emailed to a donor.
      </p>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <section className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
        <h2 className="font-semibold text-gray-700 mb-1">Invoice Disclaimer</h2>
        <p className="text-xs text-gray-400 mb-3">
          Printed at the bottom of every donor receipt PDF, below the donor's signature (if one was
          captured).
        </p>
        <textarea
          value={invoiceDisclaimer}
          onChange={(e) => setInvoiceDisclaimer(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-gray-300 p-3 text-sm"
          placeholder="e.g. No goods or services were provided in exchange for this donation..."
        />
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
        <h2 className="font-semibold text-gray-700 mb-1">Receipt Email</h2>
        <p className="text-xs text-gray-400 mb-3">
          Sent automatically when a donor finishes signing and provided an email address. Use{" "}
          <code className="bg-gray-100 px-1 rounded">{"{{invoice}}"}</code> in the subject to insert
          the invoice number. Your message below appears first in the email, followed automatically
          by the receipt confirmation line and the PDF attachment — good place for a thank-you note,
          a seasonal campaign blurb, a newsletter link, or office hours/contact info.
        </p>
        <label className="block text-sm text-gray-600 mb-1">Subject</label>
        <input
          type="text"
          value={emailSubject}
          onChange={(e) => setEmailSubject(e.target.value)}
          placeholder="Your ICNA Relief donation receipt — {{invoice}}"
          className="w-full rounded-lg border border-gray-300 p-3 text-sm mb-4"
        />
        <label className="block text-sm text-gray-600 mb-1">Message</label>
        <textarea
          value={emailBody}
          onChange={(e) => setEmailBody(e.target.value)}
          rows={8}
          className="w-full rounded-lg border border-gray-300 p-3 text-sm"
          placeholder="Thank you for your generous donation to ICNA Relief!"
        />
      </section>

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-xl bg-brand px-6 py-2.5 font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
      {saved && <span className="ml-3 text-sm text-brand-dark font-medium">Saved ✓</span>}
    </main>
  );
}
