"use client";

import { useState } from "react";
import PasswordInput from "@/components/PasswordInput";

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 24, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 14,
  background: "#fff",
  outline: "none",
};
const pillButton = (active: boolean): React.CSSProperties => ({
  border: active ? "1.5px solid #8A5FB5" : "1.5px solid rgba(22,48,43,0.12)",
  background: active ? "rgba(138,95,181,0.1)" : "#fff",
  color: active ? "#8A5FB5" : "rgba(22,48,43,0.75)",
  borderRadius: 999,
  padding: "6px 14px",
  fontSize: 13,
  cursor: "pointer",
});

type Office = { id: string; field_office: string; region: string };
type ModuleField = { key: string; label: string; column: string };
type ModuleOption = { slug: string; label: string; dimensions: ModuleField[]; metrics: ModuleField[]; defaultDateColumn: string };
type FieldMap = { sourceColumn: string; salesforceField: string };

type Target = {
  id: string;
  office_id: string;
  food_bank_name: string;
  instance_url: string;
  client_id: string;
  source_module: string;
  object_api_name: string;
  field_mapping: FieldMap[];
  schedule: "daily" | "weekly" | "monthly";
  is_active: boolean;
};

const emptyForm = {
  office_id: "",
  food_bank_name: "",
  instance_url: "",
  client_id: "",
  client_secret: "",
  source_module: "",
  object_api_name: "",
  field_mapping: [] as FieldMap[],
  schedule: "daily" as Target["schedule"],
  is_active: false,
};

export default function SalesforceSyncClient({ offices, modules }: { offices: Office[]; modules: ModuleOption[] }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/salesforce-sync-targets");
    const data = await res.json();
    setTargets(data.targets ?? []);
    setLoaded(true);
  }

  if (!loaded) {
    load();
  }

  const activeModule = modules.find((m) => m.slug === form.source_module);
  const knownColumns = activeModule ? [...activeModule.dimensions.map((d) => d.column), ...activeModule.metrics.map((m) => m.column), activeModule.defaultDateColumn] : [];

  function startNew() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setTestResult(null);
    setShowForm(true);
  }

  function startEdit(t: Target) {
    setEditingId(t.id);
    setForm({
      office_id: t.office_id,
      food_bank_name: t.food_bank_name,
      instance_url: t.instance_url,
      client_id: t.client_id,
      client_secret: "",
      source_module: t.source_module,
      object_api_name: t.object_api_name,
      field_mapping: t.field_mapping ?? [],
      schedule: t.schedule,
      is_active: t.is_active,
    });
    setTestResult(null);
    setShowForm(true);
  }

  function addMappingRow() {
    setForm((f) => ({ ...f, field_mapping: [...f.field_mapping, { sourceColumn: "", salesforceField: "" }] }));
  }
  function updateMappingRow(i: number, key: keyof FieldMap, value: string) {
    setForm((f) => ({ ...f, field_mapping: f.field_mapping.map((m, idx) => (idx === i ? { ...m, [key]: value } : m)) }));
  }
  function removeMappingRow(i: number) {
    setForm((f) => ({ ...f, field_mapping: f.field_mapping.filter((_, idx) => idx !== i) }));
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/salesforce-sync-targets/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingId && !form.client_secret
            ? { target_id: editingId }
            : { instance_url: form.instance_url, client_id: form.client_id, client_secret: form.client_secret }
        ),
      });
      const data = await res.json();
      setTestResult(res.ok ? data : { ok: false, error: data.error });
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        office_id: form.office_id,
        food_bank_name: form.food_bank_name,
        instance_url: form.instance_url,
        client_id: form.client_id,
        source_module: form.source_module,
        object_api_name: form.object_api_name,
        field_mapping: form.field_mapping.filter((m) => m.sourceColumn && m.salesforceField),
        schedule: form.schedule,
        is_active: form.is_active,
      };
      // Never overwrite a stored secret with blank - only send it if
      // the admin actually typed a new one.
      if (form.client_secret) payload.client_secret = form.client_secret;

      const res = editingId
        ? await fetch(`/api/admin/salesforce-sync-targets/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/salesforce-sync-targets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (res.ok) {
        await load();
        setShowForm(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/admin/salesforce-sync-targets/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div style={{ ...cardStyle, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Sync Targets</div>
          <button onClick={startNew} style={pillButton(true)}>
            + New Target
          </button>
        </div>
        {targets.length === 0 ? (
          <div style={{ fontSize: 13, color: "rgba(22,48,43,0.5)" }}>No sync targets configured yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {targets.map((t) => (
              <div
                key={t.id}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", border: "1px solid rgba(22,48,43,0.1)", borderRadius: 12 }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {t.food_bank_name} {t.is_active ? "" : "(inactive)"}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(22,48,43,0.5)" }}>
                    {offices.find((o) => o.id === t.office_id)?.field_office ?? "Unknown office"} · {t.source_module} → {t.object_api_name || "(no object set)"} ·{" "}
                    {t.field_mapping?.length ?? 0} fields mapped
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => startEdit(t)} style={pillButton(false)}>
                    Edit
                  </button>
                  <button onClick={() => remove(t.id)} style={{ ...pillButton(false), color: "#B5566B" }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div style={{ ...cardStyle, padding: 20, display: "grid", gap: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{editingId ? "Edit Target" : "New Target"}</div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Office</div>
              <select value={form.office_id} onChange={(e) => setForm((f) => ({ ...f, office_id: e.target.value }))} style={inputStyle}>
                <option value="">Select office…</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.field_office}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Food Bank Name</div>
              <input value={form.food_bank_name} onChange={(e) => setForm((f) => ({ ...f, food_bank_name: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Source (which ICNA data)</div>
              <select value={form.source_module} onChange={(e) => setForm((f) => ({ ...f, source_module: e.target.value }))} style={inputStyle}>
                <option value="">Select…</option>
                {modules.map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Salesforce Instance URL</div>
            <input
              placeholder="https://foodbank.my.salesforce.com"
              value={form.instance_url}
              onChange={(e) => setForm((f) => ({ ...f, instance_url: e.target.value }))}
              style={{ ...inputStyle, width: "100%" }}
            />
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Client ID</div>
              <input value={form.client_id} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))} style={{ ...inputStyle, width: "100%" }} />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Client Secret {editingId && <span style={{ fontWeight: 400, color: "rgba(22,48,43,0.5)" }}>(leave blank to keep current)</span>}
              </div>
              <PasswordInput value={form.client_secret} onChange={(v) => setForm((f) => ({ ...f, client_secret: v }))} style={{ ...inputStyle, width: "100%" }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button onClick={testConnection} disabled={testing} style={{ ...pillButton(false), opacity: testing ? 0.6 : 1 }}>
              {testing ? "Testing…" : "Test Connection"}
            </button>
            {testResult && (
              <span style={{ fontSize: 13, color: testResult.ok ? "var(--portal-emerald, #16302B)" : "#B5566B" }}>
                {testResult.ok ? "✓ Connected successfully" : `✗ ${testResult.error}`}
              </span>
            )}
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Target Object API Name</div>
            <input
              placeholder="e.g. Distribution__c"
              value={form.object_api_name}
              onChange={(e) => setForm((f) => ({ ...f, object_api_name: e.target.value }))}
              style={inputStyle}
            />
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Field Mapping</div>
              <button onClick={addMappingRow} style={pillButton(false)}>
                + Add Field
              </button>
            </div>
            {form.field_mapping.length === 0 && <div style={{ fontSize: 12, color: "rgba(22,48,43,0.5)" }}>No fields mapped yet.</div>}
            <div style={{ display: "grid", gap: 8 }}>
              {form.field_mapping.map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    list="known-columns"
                    placeholder="ICNA column (e.g. household_size_snapshot)"
                    value={m.sourceColumn}
                    onChange={(e) => updateMappingRow(i, "sourceColumn", e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <span style={{ color: "rgba(22,48,43,0.4)" }}>→</span>
                  <input
                    placeholder="Salesforce field (e.g. Household_Size__c)"
                    value={m.salesforceField}
                    onChange={(e) => updateMappingRow(i, "salesforceField", e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={() => removeMappingRow(i)} style={{ ...pillButton(false), color: "#B5566B" }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <datalist id="known-columns">
              {knownColumns.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Sync Cadence</div>
              <select value={form.schedule} onChange={(e) => setForm((f) => ({ ...f, schedule: e.target.value as Target["schedule"] }))} style={inputStyle}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly (Mondays)</option>
                <option value="monthly">Monthly (1st)</option>
              </select>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 20 }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
              Active (will actually push data)
            </label>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={save} disabled={saving || !form.office_id || !form.food_bank_name || !form.source_module} style={{ ...pillButton(true), opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save Target"}
            </button>
            <button onClick={() => setShowForm(false)} style={pillButton(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
