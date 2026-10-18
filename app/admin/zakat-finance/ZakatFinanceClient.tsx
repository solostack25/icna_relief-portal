"use client";

import { useEffect, useMemo, useState } from "react";
import { IRFAS_PROGRAMS } from "@/lib/irfas";

type Application = {
  id: string;
  application_number: string | null;
  applicant_name: string;
  category: string;
  program: string | null;
  amount_requested: number;
  amount_approved: number | null;
  payee_name: string | null;
  payee_address: string | null;
  status: string;
  decided_at: string;
  check_number: string | null;
  paid_at: string | null;
  recommended_by: string | null;
  office_name: string | null;
  office_region: string | null;
  funding_source: "community" | "grant" | null;
  grant_id: string | null;
  voided_at: string | null;
  void_reason: string | null;
};

type Grant = {
  id: string;
  title: string;
  funder_name: string | null;
  program: string | null;
  fiscal_year: number | null;
  region: string | null;
  office_id: string | null;
};

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 13,
  background: "#fff",
  outline: "none",
};
const pill = (active: boolean): React.CSSProperties => ({
  border: `1.5px solid ${active ? "#1F6F54" : "rgba(22,48,43,0.15)"}`,
  background: active ? "rgba(31,111,84,0.1)" : "#fff",
  color: active ? "#1F6F54" : "rgba(22,48,43,0.7)",
  borderRadius: 999,
  padding: "5px 12px",
  fontSize: 12,
  fontWeight: 600,
});
const small: React.CSSProperties = { fontSize: 12, color: "rgba(22,48,43,0.5)" };
const money = (n: number) => `$${Number(n).toLocaleString()}`;

// IRFAS programs ↔ the program names used on grants
const GRANT_PROGRAM_ALIASES: Record<string, string[]> = {
  "Back 2 School": ["Back2School", "Back 2 School"],
  "Disaster Relief": ["Disaster Relief Services", "Disaster Relief"],
  "Refugee Services & Community Empowerment": ["Refugee Services", "Refugee Services & Community Empowerment"],
};

function GrantPicker({
  grants,
  app,
  value,
  onChange,
}: {
  grants: Grant[];
  app: Application;
  value: string;
  onChange: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const selected = grants.find((g) => g.id === value) ?? null;

  // Best matches first: same program, then same region, then newest year.
  const ranked = useMemo(() => {
    const programNames = app.program ? GRANT_PROGRAM_ALIASES[app.program] ?? [app.program] : [];
    const term = q.trim().toLowerCase();
    return grants
      .filter((g) => !term || `${g.title} ${g.funder_name ?? ""} ${g.program ?? ""} ${g.fiscal_year ?? ""}`.toLowerCase().includes(term))
      .map((g) => ({
        g,
        score:
          (programNames.includes(g.program ?? "") ? 4 : 0) +
          (app.office_region && g.region === app.office_region ? 2 : 0) +
          ((g.fiscal_year ?? 0) >= new Date().getFullYear() ? 1 : 0),
      }))
      .sort((a, b) => b.score - a.score || (b.g.fiscal_year ?? 0) - (a.g.fiscal_year ?? 0) || a.g.title.localeCompare(b.g.title))
      .slice(0, 8)
      .map((x) => x.g);
  }, [grants, app.program, app.office_region, q]);

  if (selected) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13 }}>
          <strong>{selected.title}</strong>
          <span style={small}>
            {" "}· {selected.funder_name ?? "—"} · FY{selected.fiscal_year}
          </span>
        </span>
        <button onClick={() => onChange("")} style={{ ...small, textDecoration: "underline", background: "none", border: 0 }}>
          change
        </button>
      </div>
    );
  }

  return (
    <div>
      <input placeholder="Search grants by name, funder, program…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
      <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
        {ranked.map((g) => (
          <button
            key={g.id}
            onClick={() => onChange(g.id)}
            style={{ textAlign: "left", border: "1px solid rgba(22,48,43,0.1)", borderRadius: 8, padding: "6px 10px", background: "#fff", fontSize: 13 }}
          >
            {g.title}
            <span style={small}>
              {" "}· {g.funder_name ?? "—"} · {g.program ?? "—"} · FY{g.fiscal_year}
              {g.region ? ` · ${g.region}` : ""}
            </span>
          </button>
        ))}
        {ranked.length === 0 && <div style={small}>No grants match.</div>}
      </div>
    </div>
  );
}

export default function ZakatFinanceClient() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [checkNumbers, setCheckNumbers] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, { program: string; funding: "" | "community" | "grant"; grantId: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/zakat-finance-applications");
    const data = await res.json();
    const apps: Application[] = data.applications ?? [];
    setApplications(apps);
    setGrants(data.grants ?? []);
    setDraft((prev) => {
      const next = { ...prev };
      for (const a of apps) {
        if (!next[a.id]) next[a.id] = { program: a.program ?? "", funding: a.funding_source ?? "", grantId: a.grant_id ?? "" };
      }
      return next;
    });
    setLoaded(true);
  }
  useEffect(() => {
    load();
  }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    setSaving(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    try {
      const res = await fetch(`/api/admin/zakat-finance-applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors((e) => ({ ...e, [id]: data.error ?? "Couldn't save" }));
        return false;
      }
      await load();
      return true;
    } finally {
      setSaving(null);
    }
  }

  function setD(id: string, patchD: Partial<{ program: string; funding: "" | "community" | "grant"; grantId: string }>) {
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patchD } }));
  }

  async function markPaid(a: Application) {
    const d = draft[a.id];
    const checkNumber = checkNumbers[a.id]?.trim();
    if (!checkNumber) return;
    if (!d?.program) return setErrors((e) => ({ ...e, [a.id]: "Choose the program." }));
    if (!d?.funding) return setErrors((e) => ({ ...e, [a.id]: "Choose community or grant funding." }));
    if (d.funding === "grant" && !d.grantId) return setErrors((e) => ({ ...e, [a.id]: "Choose which grant." }));
    await patch(a.id, {
      program: d.program,
      funding_source: d.funding,
      grant_id: d.funding === "grant" ? d.grantId : null,
      check_number: checkNumber,
    });
  }

  async function saveFunding(a: Application) {
    const d = draft[a.id];
    if (!d?.funding) return;
    if (d.funding === "grant" && !d.grantId) return setErrors((e) => ({ ...e, [a.id]: "Choose which grant." }));
    await patch(a.id, {
      ...(d.program && d.program !== a.program ? { program: d.program } : {}),
      funding_source: d.funding,
      grant_id: d.funding === "grant" ? d.grantId : null,
    });
  }

  async function voidApp(a: Application) {
    const reason = prompt(`Void ${a.payee_name || a.applicant_name}'s ${money(a.amount_approved ?? a.amount_requested)}? Enter the reason (e.g. check lost, reissued as #1234):`);
    if (!reason?.trim()) return;
    await patch(a.id, { void: true, void_reason: reason.trim() });
  }

  const grantName = (id: string | null) => grants.find((g) => g.id === id)?.title ?? "Grant";
  const pending = applications.filter((a) => a.status === "approved" && !a.voided_at);
  const paid = applications.filter((a) => a.status === "paid" && !a.voided_at);
  const voided = applications.filter((a) => a.voided_at);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Awaiting Check ({pending.length})</div>
        <div style={{ display: "grid", gap: 10 }}>
          {pending.map((a) => {
            const d = draft[a.id] ?? { program: a.program ?? "", funding: a.funding_source ?? "", grantId: a.grant_id ?? "" };
            return (
              <div key={a.id} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{a.payee_name || a.applicant_name}</div>
                    <div style={small}>
                      {a.category} · {money(a.amount_approved ?? a.amount_requested)}
                      {a.payee_address ? ` · ${a.payee_address}` : ""}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(22,48,43,0.4)" }}>
                      {a.application_number ? `${a.application_number} · ` : ""}
                      {a.office_name ? `${a.office_name} · ` : ""}
                      Approved {new Date(a.decided_at).toLocaleDateString()}
                      {a.recommended_by ? ` · Recommended by ${a.recommended_by}` : ""}
                    </div>
                  </div>
                  <button onClick={() => voidApp(a)} style={{ ...small, textDecoration: "underline", background: "none", border: 0, alignSelf: "flex-start" }}>
                    Void
                  </button>
                </div>

                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(22,48,43,0.08)", display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ ...small, width: 70 }}>Program</span>
                    <select value={d.program} onChange={(e) => setD(a.id, { program: e.target.value })} style={{ ...inputStyle, minWidth: 240 }}>
                      <option value="">Select…</option>
                      {IRFAS_PROGRAMS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ ...small, width: 70 }}>Paid from</span>
                    <button onClick={() => setD(a.id, { funding: "community", grantId: "" })} style={pill(d.funding === "community")}>
                      Community funds
                    </button>
                    <button onClick={() => setD(a.id, { funding: "grant" })} style={pill(d.funding === "grant")}>
                      A grant
                    </button>
                  </div>
                  {d.funding === "grant" && (
                    <div style={{ paddingLeft: 78 }}>
                      <GrantPicker grants={grants} app={{ ...a, program: d.program || a.program }} value={d.grantId} onChange={(id) => setD(a.id, { grantId: id })} />
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ ...small, width: 70 }}>Check #</span>
                    <input
                      placeholder="Check #"
                      value={checkNumbers[a.id] ?? ""}
                      onChange={(e) => setCheckNumbers((prev) => ({ ...prev, [a.id]: e.target.value }))}
                      style={{ ...inputStyle, width: 110 }}
                    />
                    <button
                      onClick={() => markPaid(a)}
                      disabled={saving === a.id || !checkNumbers[a.id]?.trim()}
                      style={{ ...pill(true), padding: "7px 14px", opacity: saving === a.id || !checkNumbers[a.id]?.trim() ? 0.5 : 1 }}
                    >
                      {saving === a.id ? "Saving…" : "Mark Paid"}
                    </button>
                  </div>
                  {errors[a.id] && <div style={{ fontSize: 12, color: "#B5566B" }}>{errors[a.id]}</div>}
                </div>
              </div>
            );
          })}
          {loaded && pending.length === 0 && <div style={{ fontSize: 13, color: "rgba(22,48,43,0.5)" }}>Nothing waiting on a check right now.</div>}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Paid ({paid.length})</div>
        <div style={{ display: "grid", gap: 8 }}>
          {paid.map((a) => {
            const d = draft[a.id] ?? { program: a.program ?? "", funding: a.funding_source ?? "", grantId: a.grant_id ?? "" };
            const missing = !a.program || !a.funding_source;
            return (
              <div key={a.id} style={{ ...cardStyle, opacity: missing ? 1 : 0.8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13 }}>
                    {a.payee_name || a.applicant_name} — {money(a.amount_approved ?? a.amount_requested)}
                    <div style={small}>
                      {a.program ?? "No program"} ·{" "}
                      {a.funding_source === "grant" ? grantName(a.grant_id) : a.funding_source === "community" ? "Community funds" : "Funding not set"}
                      {a.recommended_by ? ` · Rec. ${a.recommended_by}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={small}>Check #{a.check_number}</div>
                    <button onClick={() => voidApp(a)} style={{ ...small, textDecoration: "underline", background: "none", border: 0 }}>
                      Void
                    </button>
                  </div>
                </div>
                {missing && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(22,48,43,0.08)", display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 12, color: "#A57420" }}>Paid before these fields existed — fill in for reporting:</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <select value={d.program} onChange={(e) => setD(a.id, { program: e.target.value })} style={inputStyle}>
                        <option value="">Program…</option>
                        {IRFAS_PROGRAMS.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                      <button onClick={() => setD(a.id, { funding: "community", grantId: "" })} style={pill(d.funding === "community")}>
                        Community
                      </button>
                      <button onClick={() => setD(a.id, { funding: "grant" })} style={pill(d.funding === "grant")}>
                        Grant
                      </button>
                    </div>
                    {d.funding === "grant" && (
                      <GrantPicker grants={grants} app={{ ...a, program: d.program || a.program }} value={d.grantId} onChange={(id) => setD(a.id, { grantId: id })} />
                    )}
                    <div>
                      <button
                        disabled={saving === a.id || !d.funding || (!a.program && !d.program)}
                        onClick={() => saveFunding(a)}
                        style={{ ...pill(true), opacity: saving === a.id || !d.funding || (!a.program && !d.program) ? 0.5 : 1 }}
                      >
                        {saving === a.id ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                )}
                {errors[a.id] && <div style={{ fontSize: 12, color: "#B5566B", marginTop: 6 }}>{errors[a.id]}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {voided.length > 0 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Voided ({voided.length})</div>
          <div style={{ display: "grid", gap: 8 }}>
            {voided.map((a) => (
              <div key={a.id} style={{ ...cardStyle, opacity: 0.6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 13, textDecoration: "line-through" }}>
                    {a.payee_name || a.applicant_name} — {money(a.amount_approved ?? a.amount_requested)}
                  </div>
                  <button onClick={() => patch(a.id, { unvoid: true })} style={{ ...small, textDecoration: "underline", background: "none", border: 0 }}>
                    Undo void
                  </button>
                </div>
                <div style={small}>
                  Voided {new Date(a.voided_at!).toLocaleDateString()}
                  {a.check_number ? ` · check #${a.check_number}` : ""}
                  {a.void_reason ? ` · ${a.void_reason}` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
