"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import CommsActionBar from "@/app/orlando-automation/_components/CommsActionBar";
import CommsHistory from "@/app/orlando-automation/_components/CommsHistory";

type Contact = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  organization: string | null;
  list_tag: string | null;
  notes: string | null;
  do_not_call: boolean;
};

const DISPOSITIONS = [
  { value: "no_answer", label: "No answer" },
  { value: "left_voicemail", label: "Left voicemail" },
  { value: "callback", label: "Requested callback" },
  { value: "pledged", label: "Pledged" },
  { value: "declined", label: "Declined" },
  { value: "wrong_number", label: "Wrong number" },
  { value: "other", label: "Other" },
];

type LoggedCall = {
  id: string;
  disposition: string | null;
  notes: string | null;
  called_at: string;
};

export default function ContactDetailView({ contact }: { contact: Contact }) {
  const supabase = createClient();
  const [disposition, setDisposition] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loggedCalls, setLoggedCalls] = useState<LoggedCall[]>([]);
  const [doNotCall, setDoNotCall] = useState(contact.do_not_call);

  async function loadCalls() {
    const { data } = await supabase
      .from("campaign_calls")
      .select("id, disposition, notes, called_at")
      .eq("contact_id", contact.id)
      .order("called_at", { ascending: false });
    setLoggedCalls(data ?? []);
  }

  useEffect(() => {
    loadCalls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogCall(e: React.FormEvent) {
    e.preventDefault();
    if (!disposition) return;
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user
      ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single()
      : { data: null };

    await supabase.from("campaign_calls").insert({
      contact_id: contact.id,
      employee_id: employee?.id ?? null,
      disposition,
      notes: notes.trim() || null,
    });

    setDisposition("");
    setNotes("");
    setSaving(false);
    loadCalls();
  }

  async function toggleDoNotCall() {
    const next = !doNotCall;
    setDoNotCall(next);
    await supabase.from("campaign_contacts").update({ do_not_call: next }).eq("id", contact.id);
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/orlando-automation/campaigns"
          className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          ← Back to campaigns
        </Link>

        <div className="flex items-center justify-between mt-4 mb-6">
          <div>
            <h1 className="text-xl font-semibold">
              {contact.first_name} {contact.last_name ?? ""}
            </h1>
            {contact.organization && (
              <p className="text-sm text-[var(--color-text-dim)]">{contact.organization}</p>
            )}
          </div>
          {contact.list_tag && (
            <span className="rounded-full bg-[var(--badge-purple-bg)] text-[var(--badge-purple-fg)] text-xs font-medium px-2.5 py-1">
              {contact.list_tag}
            </span>
          )}
        </div>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
          <h2 className="text-sm font-medium mb-4">Contact Info</h2>
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-[var(--color-text-dim)]">Phone</dt>
            <dd>{contact.phone ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">Email</dt>
            <dd>{contact.email ?? "—"}</dd>
          </dl>
          {contact.notes && (
            <p className="text-sm text-[var(--color-text-dim)] mt-3 pt-3 border-t border-[var(--color-border)]">
              {contact.notes}
            </p>
          )}
          <label className="flex items-center gap-2 mt-4 pt-4 border-t border-[var(--color-border)] text-sm">
            <input type="checkbox" checked={doNotCall} onChange={toggleDoNotCall} />
            Do not call this contact
          </label>
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
          <h2 className="text-sm font-medium mb-4">Comms</h2>
          <div className="mb-4">
            <CommsActionBar phone={contact.phone} showTranscriptAccess />
          </div>
          <CommsHistory campaignContactId={contact.id} />
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="text-sm font-medium mb-4">Log a Call Attempt</h2>
          <form onSubmit={handleLogCall} className="space-y-3 mb-5">
            <div>
              <label htmlFor="disposition" className="block text-xs text-[var(--color-text-dim)] mb-1">
                Outcome
              </label>
              <select
                id="disposition"
                value={disposition}
                onChange={(e) => setDisposition(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">Select an outcome…</option>
                {DISPOSITIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="callNotes" className="block text-xs text-[var(--color-text-dim)] mb-1">
                Notes
              </label>
              <textarea
                id="callNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm focus:outline-none resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={!disposition || saving}
              className="rounded-lg bg-[var(--color-accent-solid)] text-white text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? "Saving…" : "Log Call"}
            </button>
          </form>

          {loggedCalls.length > 0 && (
            <div className="space-y-2 pt-4 border-t border-[var(--color-border)]">
              {loggedCalls.map((c) => (
                <div key={c.id} className="text-sm">
                  <p>
                    <span className="font-medium">
                      {DISPOSITIONS.find((d) => d.value === c.disposition)?.label ??
                        c.disposition}
                    </span>
                    <span className="text-[var(--color-text-dim)]">
                      {" "}
                      · {new Date(c.called_at).toLocaleString()}
                    </span>
                  </p>
                  {c.notes && <p className="text-[var(--color-text-dim)]">{c.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
