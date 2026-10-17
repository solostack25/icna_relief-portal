"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type RsceCase = {
  id: string;
  status: "open" | "closed";
  opened_on: string;
  closed_on: string | null;
  closed_reason: string | null;
  arrival_date: string | null;
  referral_source: string | null;
  notes: string | null;
  case_manager_id: string | null;
};

export type RsceService = {
  id: string;
  service_name: string;
  delivered_on: string;
  value: number;
  beneficiaries: number;
  notes: string | null;
  employee_name: string | null;
};

export type RsceServiceType = { id: string; name: string; category: string | null; default_value: number | null };
export type CaseManager = { id: string; name: string };

const REFERRAL_SOURCES = [
  "Resettlement agency",
  "Self / walk-in",
  "Family or friend",
  "Masjid / community",
  "School",
  "Government agency",
  "Other nonprofit",
  "Other",
];

const money = (n: number) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtDate = (d: string | null) => (d ? new Date(d + "T12:00:00").toLocaleDateString() : "—");
const today = () => new Date().toLocaleDateString("en-CA");

// Refugee Services & Community Empowerment on the client profile. Replaces
// the old free-text "Log RSCE Assistance" note with a case (case manager,
// arrival, referral) and a structured service log — the fields the
// program's Power BI report needs, with everything else (office, country
// of origin, ethnicity, household) coming from the client's intake.
export default function RefugeeServicesSection({
  clientId,
  officeId,
  householdSize,
  currentEmployeeId,
  rsceCase,
  services,
  serviceTypes,
  caseManagers,
}: {
  clientId: string;
  officeId: string | null;
  householdSize: number;
  currentEmployeeId: string | null;
  rsceCase: RsceCase | null;
  services: RsceService[];
  serviceTypes: RsceServiceType[];
  caseManagers: CaseManager[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const openCase = rsceCase?.status === "open" ? rsceCase : null;

  const [mode, setMode] = useState<null | "open_case" | "log" | "close_case">(null);
  const [showHistory, setShowHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [caseForm, setCaseForm] = useState({
    case_manager_id: currentEmployeeId ?? "",
    arrival_date: "",
    referral_source: "",
    notes: "",
  });
  const [serviceForm, setServiceForm] = useState({
    service_type_id: "",
    delivered_on: today(),
    value: "",
    beneficiaries: String(householdSize || 1),
    notes: "",
  });
  const [closeReason, setCloseReason] = useState("Goals met / self-sufficient");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMode(null);
    }
    if (mode) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const managerName = (id: string | null) => caseManagers.find((m) => m.id === id)?.name ?? "Unassigned";
  const totalValue = services.reduce((s, x) => s + Number(x.value), 0);

  function close() {
    setMode(null);
    setError(null);
  }

  async function createCase(fields: typeof caseForm) {
    const { data, error } = await supabase
      .from("rsce_cases")
      .insert({
        client_id: clientId,
        office_id: officeId,
        case_manager_id: fields.case_manager_id || null,
        arrival_date: fields.arrival_date || null,
        referral_source: fields.referral_source || null,
        notes: fields.notes.trim() || null,
        created_by: currentEmployeeId,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return { id: null, error: "This client already has an open Refugee Services case." };
      return { id: null, error: error.message };
    }
    return { id: data.id as string, error: null };
  }

  async function submitCase(e: React.FormEvent) {
    e.preventDefault();
    if (!officeId) return setError("This client has no office on file — set one in their intake info first.");
    setSaving(true);
    const { error } = await createCase(caseForm);
    setSaving(false);
    if (error) return setError(error);
    close();
    router.refresh();
  }

  async function submitService(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!officeId) return setError("This client has no office on file — set one in their intake info first.");
    const type = serviceTypes.find((t) => t.id === serviceForm.service_type_id);
    if (!type) return setError("Choose a service.");
    const value = Number(serviceForm.value || 0);
    const beneficiaries = Number(serviceForm.beneficiaries || 0);
    if (!(value >= 0)) return setError("Value can't be negative.");
    if (!Number.isInteger(beneficiaries) || beneficiaries < 0) return setError("Beneficiaries must be a whole number.");
    if (type.name === "Other" && !serviceForm.notes.trim()) return setError("Describe the service in the notes when choosing “Other”.");

    setSaving(true);
    // Logging the first service opens a case automatically, assigned to
    // whoever logged it — no extra step for walk-in help.
    let caseId = openCase?.id ?? null;
    if (!caseId) {
      const created = await createCase({ case_manager_id: currentEmployeeId ?? "", arrival_date: "", referral_source: "", notes: "" });
      if (created.error) {
        setSaving(false);
        return setError(created.error);
      }
      caseId = created.id;
    }

    const { error } = await supabase.from("rsce_services").insert({
      case_id: caseId,
      client_id: clientId,
      office_id: officeId,
      service_type_id: type.id,
      service_name: type.name,
      delivered_on: serviceForm.delivered_on,
      value,
      beneficiaries,
      notes: serviceForm.notes.trim() || null,
      employee_id: currentEmployeeId,
    });
    setSaving(false);
    if (error) return setError(error.message);
    setServiceForm({ service_type_id: "", delivered_on: today(), value: "", beneficiaries: String(householdSize || 1), notes: "" });
    close();
    router.refresh();
  }

  async function submitClose(e: React.FormEvent) {
    e.preventDefault();
    if (!openCase) return;
    setSaving(true);
    const { error } = await supabase
      .from("rsce_cases")
      .update({ status: "closed", closed_on: today(), closed_reason: closeReason, updated_at: new Date().toISOString() })
      .eq("id", openCase.id);
    setSaving(false);
    if (error) return setError(error.message);
    close();
    router.refresh();
  }

  async function updateCaseField(field: "case_manager_id", value: string) {
    if (!openCase) return;
    const { error } = await supabase
      .from("rsce_cases")
      .update({ [field]: value || null, updated_at: new Date().toISOString() })
      .eq("id", openCase.id);
    if (error) return alert(error.message);
    router.refresh();
  }

  async function deleteService(id: string) {
    if (!confirm("Delete this service entry? Use this only for mistakes.")) return;
    const { error } = await supabase.from("rsce_services").delete().eq("id", id);
    if (error) return alert(error.message);
    router.refresh();
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
  const labelClass = "block text-xs mb-1 text-[var(--color-text-dim)]";
  const categories = [...new Set(serviceTypes.map((t) => t.category ?? "Other"))];

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-sm font-medium flex items-center gap-2">
          Refugee Services
          {openCase ? (
            <span className="text-xs font-medium text-[var(--color-accent)] bg-[var(--color-accent)]/10 rounded-full px-2 py-0.5">Open case</span>
          ) : rsceCase ? (
            <span className="text-xs font-medium text-[var(--color-text-dim)] bg-black/5 rounded-full px-2 py-0.5">Closed {fmtDate(rsceCase.closed_on)}</span>
          ) : null}
        </h2>
        <div className="flex gap-2">
          {!openCase && (
            <button
              onClick={() => setMode("open_case")}
              className="rounded-lg border border-[var(--color-border)] text-sm font-medium px-3 py-2 hover:border-[var(--color-accent)]"
            >
              {rsceCase ? "Reopen case" : "Open case"}
            </button>
          )}
          <button
            onClick={() => setMode("log")}
            className="rounded-lg border border-[var(--color-accent)] text-[var(--color-accent)] text-sm font-medium px-4 py-2 hover:bg-[var(--color-accent)]/10"
          >
            Log service
          </button>
        </div>
      </div>
      <p className="text-xs text-[var(--color-text-dim)]">Refugee Services &amp; Community Empowerment</p>

      {openCase && (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <div className="text-xs text-[var(--color-text-dim)]">Case manager</div>
            <select
              value={openCase.case_manager_id ?? ""}
              onChange={(e) => updateCaseField("case_manager_id", e.target.value)}
              className="mt-0.5 w-full rounded border border-[var(--color-border)] bg-white px-2 py-1 text-sm"
            >
              <option value="">Unassigned</option>
              {caseManagers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs text-[var(--color-text-dim)]">Opened</div>
            <div>{fmtDate(openCase.opened_on)}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--color-text-dim)]">Arrived in US</div>
            <div>{fmtDate(openCase.arrival_date)}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--color-text-dim)]">Referred by</div>
            <div>{openCase.referral_source ?? "—"}</div>
          </div>
          {openCase.notes && <div className="col-span-2 text-xs text-[var(--color-text-dim)]">{openCase.notes}</div>}
          <div className="col-span-2">
            <button onClick={() => setMode("close_case")} className="text-xs text-[var(--color-text-dim)] underline">
              Close case
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-[var(--color-text-dim)] mt-3">
        {services.length > 0
          ? `${services.length} service${services.length === 1 ? "" : "s"} · ${money(totalValue)} total · last on ${fmtDate(services[0].delivered_on)}`
          : "No services logged yet."}
      </p>

      {services.length > 0 && (
        <button onClick={() => setShowHistory((v) => !v)} className="text-xs font-medium text-[var(--color-accent)] mt-2 hover:underline">
          {showHistory ? "Hide history ▲" : "Show history ▼"}
        </button>
      )}

      {showHistory && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-2">
          {services.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-3 text-sm border-b border-[var(--color-border)] pb-2 last:border-0">
              <div className="min-w-0">
                <div>
                  {s.service_name}
                  <span className="text-[var(--color-text-dim)]">
                    {" "}· {money(s.value)} · {s.beneficiaries} beneficiar{s.beneficiaries === 1 ? "y" : "ies"}
                  </span>
                </div>
                {(s.notes || s.employee_name) && (
                  <div className="text-xs text-[var(--color-text-dim)]">
                    {s.notes}
                    {s.notes && s.employee_name ? " — " : ""}
                    {s.employee_name}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[var(--color-text-dim)]">{fmtDate(s.delivered_on)}</div>
                <button onClick={() => deleteService(s.id)} className="text-[11px] text-[#B55139] underline">
                  delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {mode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50" onClick={close}>
          <div
            className="w-full max-w-md rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {mode === "open_case" && (
              <form onSubmit={submitCase} className="space-y-3">
                <h3 className="text-base font-semibold">Open Refugee Services case</h3>
                <div>
                  <label className={labelClass}>Case manager</label>
                  <select value={caseForm.case_manager_id} onChange={(e) => setCaseForm({ ...caseForm, case_manager_id: e.target.value })} className={inputClass}>
                    <option value="">Unassigned</option>
                    {caseManagers.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Arrival date in US</label>
                    <input type="date" value={caseForm.arrival_date} onChange={(e) => setCaseForm({ ...caseForm, arrival_date: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Referred by</label>
                    <select value={caseForm.referral_source} onChange={(e) => setCaseForm({ ...caseForm, referral_source: e.target.value })} className={inputClass}>
                      <option value="">Select…</option>
                      {REFERRAL_SOURCES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Notes</label>
                  <textarea rows={3} value={caseForm.notes} onChange={(e) => setCaseForm({ ...caseForm, notes: e.target.value })} className={inputClass} />
                </div>
                <p className="text-xs text-[var(--color-text-dim)]">
                  Country of origin, ethnicity, household and office come from the client's intake record.
                </p>
                {error && <p className="text-sm text-[#B55139]">{error}</p>}
                <div className="flex gap-3">
                  <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-[var(--color-accent)] text-white font-medium py-2 text-sm disabled:opacity-50">
                    {saving ? "Opening..." : "Open case"}
                  </button>
                  <button type="button" onClick={close} className="rounded-lg border border-[var(--color-border)] px-4 text-sm">Cancel</button>
                </div>
              </form>
            )}

            {mode === "log" && (
              <form onSubmit={submitService} className="space-y-3">
                <h3 className="text-base font-semibold">Log service</h3>
                {!openCase && (
                  <p className="text-xs rounded-lg bg-[var(--color-accent)]/10 text-[var(--color-accent)] px-3 py-2">
                    No open case — one will be opened automatically with you as case manager.
                  </p>
                )}
                <div>
                  <label className={labelClass}>Service *</label>
                  <select
                    required
                    value={serviceForm.service_type_id}
                    onChange={(e) => {
                      const t = serviceTypes.find((x) => x.id === e.target.value);
                      setServiceForm({
                        ...serviceForm,
                        service_type_id: e.target.value,
                        value: t?.default_value != null ? String(t.default_value) : serviceForm.value,
                      });
                    }}
                    className={inputClass}
                  >
                    <option value="">Select…</option>
                    {categories.map((c) => (
                      <optgroup key={c} label={c}>
                        {serviceTypes
                          .filter((t) => (t.category ?? "Other") === c)
                          .map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>Date *</label>
                    <input type="date" required value={serviceForm.delivered_on} max={today()} onChange={(e) => setServiceForm({ ...serviceForm, delivered_on: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Value ($)</label>
                    <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="0.00" value={serviceForm.value} onChange={(e) => setServiceForm({ ...serviceForm, value: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Beneficiaries</label>
                    <input type="number" min={0} step={1} value={serviceForm.beneficiaries} onChange={(e) => setServiceForm({ ...serviceForm, beneficiaries: e.target.value })} className={inputClass} />
                  </div>
                </div>
                <p className="text-[11px] text-[var(--color-text-dim)] -mt-1">
                  Beneficiaries defaults to the household size ({householdSize}). Value is the dollar value of what was provided.
                </p>
                <div>
                  <label className={labelClass}>Notes</label>
                  <textarea rows={2} value={serviceForm.notes} onChange={(e) => setServiceForm({ ...serviceForm, notes: e.target.value })} className={inputClass} />
                </div>
                {error && <p className="text-sm text-[#B55139]">{error}</p>}
                <div className="flex gap-3">
                  <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-[var(--color-accent)] text-white font-medium py-2 text-sm disabled:opacity-50">
                    {saving ? "Saving..." : "Log service"}
                  </button>
                  <button type="button" onClick={close} className="rounded-lg border border-[var(--color-border)] px-4 text-sm">Cancel</button>
                </div>
              </form>
            )}

            {mode === "close_case" && (
              <form onSubmit={submitClose} className="space-y-3">
                <h3 className="text-base font-semibold">Close case</h3>
                <div>
                  <label className={labelClass}>Reason</label>
                  <select value={closeReason} onChange={(e) => setCloseReason(e.target.value)} className={inputClass}>
                    {["Goals met / self-sufficient", "Moved away", "Transferred to another office", "Lost contact", "Declined further services", "Other"].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-[var(--color-text-dim)]">Service history stays on the client. You can reopen the case any time.</p>
                {error && <p className="text-sm text-[#B55139]">{error}</p>}
                <div className="flex gap-3">
                  <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-[var(--color-accent)] text-white font-medium py-2 text-sm disabled:opacity-50">
                    {saving ? "Closing..." : "Close case"}
                  </button>
                  <button type="button" onClick={close} className="rounded-lg border border-[var(--color-border)] px-4 text-sm">Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
