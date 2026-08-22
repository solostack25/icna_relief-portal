"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Office = { id: string; region: string; field_office: string; state: string | null };
type App = { slug: string; display_name: string };
type Region = { region: string; rsn: number };
type License = { skuId: string; skuPartNumber: string; friendlyName: string; availableUnits: number };
type AdResult = {
  created: boolean;
  tempPassword?: string;
  userPrincipalName?: string;
  warning?: string;
  licenseWarnings?: string[];
};

export default function NewEmployeePage() {
  const supabase = createClient();
  const router = useRouter();

  const [offices, setOffices] = useState<Office[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdResult | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    personalEmail: "",
    role: "staff",
    assignedOfficeId: "",
    assignedRegion: "",
  });
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());
  const [selectedLicenses, setSelectedLicenses] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase
      .from("b2s_offices")
      .select("id, region, field_office, state")
      .eq("is_active", true)
      .order("region")
      .then(({ data }) => setOffices(data ?? []));

    supabase
      .from("b2s_regions")
      .select("region, rsn")
      .order("rsn")
      .then(({ data }) => setRegions(data ?? []));

    supabase
      .from("app_registry")
      .select("slug, display_name")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setApps(data ?? []));

    fetch("/api/admin/graph/licenses")
      .then((r) => r.json())
      .then((body) => setLicenses(body.licenses ?? []))
      .catch(() => setLicenses([]));
  }, []);

  function toggleApp(slug: string) {
    const next = new Set(selectedApps);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setSelectedApps(next);
  }

  function toggleLicense(skuId: string) {
    const next = new Set(selectedLicenses);
    if (next.has(skuId)) next.delete(skuId);
    else next.add(skuId);
    setSelectedLicenses(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.firstName || !form.lastName || !form.email) {
      setError("First name, last name, and email are required.");
      return;
    }

    setSaving(true);

    const res = await fetch("/api/admin/employees/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        role: form.role,
        assignedOfficeId: form.assignedOfficeId || null,
        assignedRegion: form.assignedRegion || null,
        programSlugs: Array.from(selectedApps),
        licenseSkuIds: Array.from(selectedLicenses),
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to create employee.");
      return;
    }

    const data = await res.json();
    // Hold here instead of redirecting immediately if there's a one-time
    // temp password to show, or a warning the admin needs to see - both
    // would be lost forever if we navigated away right now.
    setResult(data.ad);
  }

  function copyPassword() {
    if (!result?.tempPassword) return;
    navigator.clipboard.writeText(result.tempPassword);
    setPasswordCopied(true);
    setTimeout(() => setPasswordCopied(false), 1500);
  }

  function openComposer() {
    setEmailTo(form.personalEmail);
    setEmailSubject(`Welcome to ICNA Relief, ${form.firstName} — your new account details`);
    setEmailBody(
      `Hi ${form.firstName},\n\n` +
        `Welcome to ICNA Relief! Your new account has been created.\n\n` +
        `Email: ${result?.userPrincipalName ?? form.email}\n` +
        `Temporary password: ${result?.tempPassword ?? "(not available)"}\n\n` +
        `You'll be asked to set your own password the first time you sign in at https://portal.office.com — please do this before doing anything else.\n\n` +
        `You should also receive a separate email invite to set up your Staff Portal login — that's a different, separate step from the password above.\n\n` +
        `If you have any trouble getting in, reach out to IT and we'll get you sorted.\n\n` +
        `Welcome to the team!`
    );
    setEmailSent(false);
    setEmailError(null);
    setShowComposer(true);
  }

  async function sendOnboardingEmail() {
    if (!emailTo.trim()) {
      setEmailError("Enter the personal email address to send this to.");
      return;
    }
    setEmailSending(true);
    setEmailError(null);
    const res = await fetch("/api/admin/employees/send-onboarding-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toEmail: emailTo, subject: emailSubject, body: emailBody }),
    });
    const data = await res.json();
    setEmailSending(false);
    if (!res.ok) {
      setEmailError(data.error ?? "Failed to send.");
      return;
    }
    setEmailSent(true);
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
  const labelClass = "block text-sm mb-1 text-[var(--color-text-dim)]";

  if (result) {
    return (
      <div>
        <h1 className="text-xl font-semibold mb-8">
          {form.firstName} {form.lastName} — Created
        </h1>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
          <div>
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-500/10 text-green-700">
              Portal account created — invite email sent
            </span>
          </div>

          {result.created ? (
            <>
              <div>
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-500/10 text-green-700">
                  Active Directory account created
                </span>
                <p className="text-sm text-[var(--color-text-dim)] mt-2">{result.userPrincipalName}</p>
              </div>

              <div className="rounded-lg border border-amber-400/40 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-800 mb-2">
                  Temporary password — shown once, relay it securely
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-mono">
                    {result.tempPassword}
                  </code>
                  <button
                    onClick={copyPassword}
                    className="text-sm rounded-lg border border-[var(--color-border)] px-3 py-2 hover:border-[var(--color-accent)] shrink-0"
                  >
                    {passwordCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="text-xs text-amber-700 mt-2">
                  They'll be forced to set their own password at first Microsoft/Outlook login. This won't be
                  shown again — if lost, reset it directly in Entra ID.
                </p>
              </div>

              {!showComposer && (
                <button
                  onClick={openComposer}
                  className="text-sm rounded-lg border border-[var(--color-accent)]/40 text-[var(--color-accent)] px-4 py-2 hover:border-[var(--color-accent)]"
                >
                  Email New Employee
                </button>
              )}

              {showComposer && (
                <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-3">
                  <h3 className="text-sm font-medium">
                    {emailSent ? "Sent" : "Review before sending — edit anything you'd like"}
                  </h3>

                  {emailSent ? (
                    <p className="text-sm text-green-700">Sent to {emailTo}.</p>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs mb-1 text-[var(--color-text-dim)]">
                          To (their personal email — the new work inbox isn't usable until they log in)
                        </label>
                        <input
                          type="email"
                          value={emailTo}
                          onChange={(e) => setEmailTo(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1 text-[var(--color-text-dim)]">Subject</label>
                        <input
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1 text-[var(--color-text-dim)]">Body</label>
                        <textarea
                          value={emailBody}
                          onChange={(e) => setEmailBody(e.target.value)}
                          rows={12}
                          className={inputClass + " font-mono text-xs"}
                        />
                      </div>
                      {emailError && <p className="text-sm text-[#B55139]">{emailError}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={sendOnboardingEmail}
                          disabled={emailSending}
                          className="text-sm rounded-lg bg-[var(--color-accent)] text-white px-4 py-2 disabled:opacity-50"
                        >
                          {emailSending ? "Sending..." : "Send"}
                        </button>
                        <button
                          onClick={() => setShowComposer(false)}
                          className="text-sm rounded-lg border border-[var(--color-border)] px-4 py-2"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {result.licenseWarnings && result.licenseWarnings.length > 0 && (
                <div className="rounded-lg border border-[#B55139]/30 bg-[#B55139]/5 p-3">
                  <p className="text-sm font-medium text-[#B55139] mb-1">Some licenses didn't assign:</p>
                  {result.licenseWarnings.map((w, i) => (
                    <p key={i} className="text-xs text-[#B55139]">
                      {w}
                    </p>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-[#B55139]/30 bg-[#B55139]/5 p-4">
              <p className="text-sm font-medium text-[#B55139] mb-1">Active Directory account not created</p>
              <p className="text-xs text-[#B55139]">{result.warning}</p>
            </div>
          )}

          <button
            onClick={() => router.push("/admin")}
            className="w-full rounded-lg bg-[var(--color-accent)] text-white font-medium py-3 text-sm mt-2"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-8">Add Employee</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
            <h2 className="text-sm font-medium">Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>First Name *</label>
                <input
                  required
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Last Name *</label>
                <input
                  required
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Email *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className={inputClass}
              />
              <p className="text-xs text-[var(--color-text-dim)] mt-1">
                They'll get an email invite to set their password.
              </p>
            </div>
            <div>
              <label className={labelClass}>Personal Email</label>
              <input
                type="email"
                value={form.personalEmail}
                onChange={(e) => setForm((f) => ({ ...f, personalEmail: e.target.value }))}
                className={inputClass}
                placeholder="For sending their new account details — they can't check the new work inbox yet"
              />
            </div>
            <div>
              <label className={labelClass}>Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className={inputClass}
              >
                <option value="staff">Staff</option>
                <option value="regional_director">Regional Director</option>
                <option value="program_director">Program Director</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </section>

          {form.role === "staff" && (
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
              <h2 className="text-sm font-medium">Office / State Assignment</h2>
              <p className="text-xs text-[var(--color-text-dim)]">
                This person can only submit reports for this office —
                enforced at the database level, not just hidden in the UI.
              </p>
              <select
                value={form.assignedOfficeId}
                onChange={(e) => setForm((f) => ({ ...f, assignedOfficeId: e.target.value }))}
                className={inputClass}
              >
                <option value="">Select an office...</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.region} — {o.field_office}
                    {o.state ? ` (${o.state})` : ""}
                  </option>
                ))}
              </select>
            </section>
          )}

          {form.role === "regional_director" && (
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
              <h2 className="text-sm font-medium">Region Assignment</h2>
              <p className="text-xs text-[var(--color-text-dim)]">
                Sees and reviews every office's submissions within this
                region, across whichever programs they're granted below.
              </p>
              <select
                value={form.assignedRegion}
                onChange={(e) => setForm((f) => ({ ...f, assignedRegion: e.target.value }))}
                className={inputClass}
              >
                <option value="">Select a region...</option>
                {regions.map((r) => (
                  <option key={r.region} value={r.region}>
                    {r.region}
                  </option>
                ))}
              </select>
            </section>
          )}

          {form.role === "program_director" && (
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
              <h2 className="text-sm font-medium mb-1">Program Scope</h2>
              <p className="text-xs text-[var(--color-text-dim)]">
                Sees and reviews every office/region's submissions, but only
                for the program(s) checked below.
              </p>
            </section>
          )}

          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
            <h2 className="text-sm font-medium">App Access</h2>
            <div className="space-y-2">
              {apps.map((app) => (
                <label key={app.slug} className="flex items-center gap-3 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedApps.has(app.slug)}
                    onChange={() => toggleApp(app.slug)}
                    className="accent-[var(--color-accent)]"
                  />
                  {app.display_name}
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 space-y-4">
            <h2 className="text-sm font-medium">Active Directory Account &amp; Licenses</h2>
            <p className="text-xs text-[var(--color-text-dim)]">
              A real Active Directory account is created automatically with a temporary password (shown once
              after creation — they'll set their own at first login). Choose which Microsoft 365 license(s), if
              any, to assign now.
            </p>
            {licenses.length === 0 ? (
              <p className="text-xs text-[var(--color-text-dim)] italic">
                No licenses available to assign — either every license is fully used, or license access hasn't
                been configured yet.
              </p>
            ) : (
              <div className="space-y-2">
                {licenses.map((lic) => (
                  <label key={lic.skuId} className="flex items-center gap-3 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedLicenses.has(lic.skuId)}
                      onChange={() => toggleLicense(lic.skuId)}
                      className="accent-[var(--color-accent)]"
                    />
                    {lic.friendlyName}
                    <span className="text-xs text-[var(--color-text-dim)]">({lic.availableUnits} available)</span>
                  </label>
                ))}
              </div>
            )}
          </section>

          {error && <p className="text-sm text-[#B55139]">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-[var(--color-accent)] text-white font-medium py-3 text-sm disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Employee & Send Invite"}
          </button>
        </form>
    </div>
  );
}
