"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createRequestWithFirstLeg, DEPARTMENT_LABELS, type Priority } from "@/lib/helpdesk";
import { WIZARD_GROUPS, URGENCY_OPTIONS, type WizardIntent } from "@/lib/helpdeskWizard";

type Step = "group" | "intent" | "urgency" | "review";

export default function HelpdeskWizardPage() {
  const supabase = createClient();
  const router = useRouter();

  const [step, setStep] = useState<Step>("group");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [intent, setIntent] = useState<WizardIntent | null>(null);
  const [priority, setPriority] = useState<Priority | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submittedBy, setSubmittedBy] = useState("");
  const [submittedByEmail, setSubmittedByEmail] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase
        .from("employees")
        .select("first_name, last_name, email")
        .eq("auth_user_id", user.id)
        .single();
      if (me) {
        setSubmittedBy(`${me.first_name} ${me.last_name}`);
        setSubmittedByEmail(me.email);
      }
    })();
  }, [supabase]);

  function pickIntent(i: WizardIntent) {
    setIntent(i);
    setTitle(i.titleTemplate);
    setDescription("");
    setStep("urgency");
  }

  function pickUrgency(p: Priority) {
    setPriority(p);
    setStep("review");
  }

  function back() {
    if (step === "intent") setStep("group");
    else if (step === "urgency") setStep("intent");
    else if (step === "review") setStep("urgency");
  }

  async function handleSubmit() {
    if (!intent || !priority) return;
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { requestId } = await createRequestWithFirstLeg(supabase, {
        title: title.trim(),
        description: description.trim() || null,
        submitted_by: submittedBy.trim(),
        submitted_by_email: submittedByEmail.trim(),
        department: intent.department,
        category: intent.category,
        priority,
      });

      router.push(`/helpdesk/${requestId}`);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  const activeGroup = WIZARD_GROUPS.find((g) => g.id === groupId) ?? null;

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold">Submit a Request</h1>
          <Link
            href="/helpdesk"
            className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            ← Back
          </Link>
        </div>

        {/* Step 1: pick a department by plain-language description */}
        {step === "group" && (
          <div>
            <p className="text-sm text-[var(--color-text-dim)] mb-5">
              What kind of help do you need?
            </p>
            <div className="space-y-2">
              {WIZARD_GROUPS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    setGroupId(g.id);
                    setStep("intent");
                  }}
                  className="w-full text-left rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 hover:border-[var(--color-accent)] cursor-pointer"
                >
                  <div className="text-sm font-medium">{g.label}</div>
                  <div className="text-xs text-[var(--color-text-dim)] mt-0.5">{g.blurb}</div>
                </button>
              ))}
              <Link
                href="/finance-tickets/new"
                className="block text-left rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 hover:border-[var(--color-accent)]"
              >
                <div className="text-sm font-medium">Finance</div>
                <div className="text-xs text-[var(--color-text-dim)] mt-0.5">
                  Reimbursements, payments, PEX card — opens Finance Tickets
                </div>
              </Link>
            </div>
            <Link
              href="/helpdesk/new"
              className="block text-center text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] mt-6"
            >
              I know exactly what I need — skip the wizard
            </Link>
          </div>
        )}

        {/* Step 2: narrow down to a specific category within that department */}
        {step === "intent" && activeGroup && (
          <div>
            <button
              type="button"
              onClick={back}
              className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] mb-4 cursor-pointer"
            >
              ← Back
            </button>
            <p className="text-sm text-[var(--color-text-dim)] mb-5">
              More specifically, what's going on?
            </p>
            <div className="space-y-2">
              {activeGroup.intents.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => pickIntent(i)}
                  className="w-full text-left rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 hover:border-[var(--color-accent)] cursor-pointer text-sm"
                >
                  {i.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: urgency, in plain language rather than the raw priority enum */}
        {step === "urgency" && (
          <div>
            <button
              type="button"
              onClick={back}
              className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] mb-4 cursor-pointer"
            >
              ← Back
            </button>
            <p className="text-sm text-[var(--color-text-dim)] mb-5">How urgent is this?</p>
            <div className="space-y-2">
              {URGENCY_OPTIONS.map((u) => (
                <button
                  key={u.priority}
                  type="button"
                  onClick={() => pickUrgency(u.priority)}
                  className="w-full text-left rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 hover:border-[var(--color-accent)] cursor-pointer"
                >
                  <div className="text-sm font-medium">{u.label}</div>
                  <div className="text-xs text-[var(--color-text-dim)] mt-0.5">{u.sublabel}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: review the pre-filled request, add specifics, submit */}
        {step === "review" && intent && priority && (
          <div className="space-y-5">
            <button
              type="button"
              onClick={back}
              className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] cursor-pointer"
            >
              ← Back
            </button>

            <div className="flex gap-2 flex-wrap">
              <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                {DEPARTMENT_LABELS[intent.department]}
              </span>
              <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                {intent.category}
              </span>
              <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                {URGENCY_OPTIONS.find((u) => u.priority === priority)?.label}
              </span>
            </div>

            {intent.id === "it-new-employee" && (
              <div className="rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 px-4 py-3 text-sm">
                Once this new employee has portal access, they can use{" "}
                <Link href="/office-apps" className="text-[var(--color-accent)] hover:underline">
                  Office & Apps
                </Link>{" "}
                to sign into Microsoft 365 online or download the desktop
                apps themselves — no need to include that in this ticket.
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Details</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder={intent.descriptionPrompt}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Submitted By</label>
                <input
                  type="text"
                  value={submittedBy}
                  disabled
                  className="w-full rounded-lg border border-[var(--color-border)] bg-black/[0.03] px-3 py-2 text-sm text-[var(--color-text-dim)] cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Email</label>
                <input
                  type="email"
                  value={submittedByEmail}
                  disabled
                  className="w-full rounded-lg border border-[var(--color-border)] bg-black/[0.03] px-3 py-2 text-sm text-[var(--color-text-dim)] cursor-not-allowed"
                />
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-dim)] -mt-3">
              Tickets are tied to your account, so this can't be changed.
            </p>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="w-full rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium py-3 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {saving ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
