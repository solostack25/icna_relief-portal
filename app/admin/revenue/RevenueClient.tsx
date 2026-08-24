"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

type StreamSummary = { key: string; label: string; total: number; auto: boolean };
type RegionStack = { region: string; grants: number; giving: number; calling: number; volunteering: number; manual: number };
type Office = { id: string; field_office: string; region: string };

const MANUAL_STREAMS = [
  { key: "in_kind", label: "In-Kind Donation" },
  { key: "irfas", label: "IRFAS" },
  { key: "ramadan", label: "Ramadan" },
  { key: "outreach", label: "Outreach" },
];

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 24, boxShadow: "0 3px 12px rgba(22,48,43,0.06)" };
const inputStyle: React.CSSProperties = {
  border: "1.5px solid var(--portal-line, rgba(22,48,43,0.12))",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 14,
  background: "#fff",
  outline: "none",
};

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

const STREAM_COLOR: Record<string, string> = {
  grant: "#2F6D46",
  general_community: "#3E7FBF",
  calling_campaign: "#8A5FB5",
  volunteering: "#E2892F",
  in_kind: "#B5566B",
  irfas: "#3E9E8F",
  ramadan: "#A57420",
  outreach: "#7A9186",
};

export default function RevenueClient({
  totalRevenue,
  communityRevenue,
  grantsTotal,
  volunteerHoursTotal,
  volunteerHourValue,
  streams,
  byRegionStack,
  offices,
  currentYear,
}: {
  totalRevenue: number;
  communityRevenue: number;
  grantsTotal: number;
  volunteerHoursTotal: number;
  volunteerHourValue: number;
  streams: StreamSummary[];
  byRegionStack: RegionStack[];
  offices: Office[];
  currentYear: number;
}) {
  const supabase = createClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    stream: "in_kind",
    title: "",
    funder_name: "",
    office_id: "",
    region: "",
    amount: "",
    received_date: "",
    notes: "",
  });

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.amount || (!form.office_id && !form.region)) return;
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: employee } = user ? await supabase.from("employees").select("id").eq("auth_user_id", user.id).single() : { data: null };

    const { error } = await supabase.from("grants").insert({
      title: form.title,
      funder_name: form.funder_name || null,
      program: "General",
      office_id: form.office_id || null,
      region: form.office_id ? null : form.region,
      amount: Number(form.amount),
      fiscal_year: currentYear,
      received_date: form.received_date || null,
      notes: form.notes || null,
      created_by: employee?.id ?? null,
      stream: form.stream,
    });

    setSaving(false);
    if (!error) {
      setShowAddForm(false);
      window.location.reload();
    }
  }

  const regions = [...new Set([...offices.map((o) => o.region), ...byRegionStack.map((r) => r.region)])].sort();

  return (
    <div>
      <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div style={{ ...cardStyle, padding: "20px 22px", background: "#16302B" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#fff" }}>{money(totalRevenue)}</div>
          <div className="text-xs font-semibold mt-1" style={{ color: "#B8D4C4" }}>
            Total Revenue ({currentYear})
          </div>
        </div>
        <div style={{ ...cardStyle, padding: "20px 22px" }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#16302B" }}>{money(grantsTotal)}</div>
          <div className="text-xs font-semibold mt-1" style={{ color: STREAM_COLOR.grant }}>
            Grants Revenue
          </div>
        </div>
        <div style={{ ...cardStyle, padding: "20px 22px" }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#16302B" }}>{money(communityRevenue)}</div>
          <div className="text-xs font-semibold mt-1" style={{ color: "#3E7FBF" }}>
            Community Revenue
          </div>
        </div>
        <div style={{ ...cardStyle, padding: "20px 22px" }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#16302B" }}>{Math.round(volunteerHoursTotal).toLocaleString()}</div>
          <div className="text-xs font-semibold mt-1" style={{ color: STREAM_COLOR.volunteering }}>
            Volunteer Hours
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "rgba(22,48,43,0.4)" }}>
            valued at ${volunteerHourValue}/hr
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: "22px 24px", marginBottom: 24 }}>
        <h2 className="text-sm font-bold mb-4" style={{ color: "#2F4A3E" }}>
          Revenue by Stream
        </h2>
        <div className="space-y-2.5">
          {streams
            .filter((s) => s.total > 0)
            .sort((a, b) => b.total - a.total)
            .map((s) => {
              const pct = totalRevenue > 0 ? (s.total / totalRevenue) * 100 : 0;
              return (
                <div key={s.key}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-semibold">
                      {s.label}
                      {!s.auto && (
                        <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#F4F3EE", color: "rgba(22,48,43,0.4)" }}>
                          manual
                        </span>
                      )}
                    </span>
                    <span style={{ color: STREAM_COLOR[s.key] ?? "#666" }}>{money(s.total)}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "#F4F3EE" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: STREAM_COLOR[s.key] ?? "#999" }} />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      <div style={{ ...cardStyle, padding: "22px 24px", marginBottom: 24 }}>
        <h2 className="text-sm font-bold mb-4" style={{ color: "#2F4A3E" }}>
          Revenue by Region
        </h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={byRegionStack} margin={{ left: 0 }}>
            <XAxis dataKey="region" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v / 1000}k`} />
            <Tooltip formatter={(v) => money(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="grants" name="Grants" stackId="a" fill={STREAM_COLOR.grant} />
            <Bar dataKey="giving" name="Community Giving" stackId="a" fill={STREAM_COLOR.general_community} />
            <Bar dataKey="calling" name="Calling Campaign" stackId="a" fill={STREAM_COLOR.calling_campaign} />
            <Bar dataKey="volunteering" name="Volunteering" stackId="a" fill={STREAM_COLOR.volunteering} />
            <Bar dataKey="manual" name="Other (manual)" stackId="a" fill="#B5566B" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...cardStyle, padding: "22px 24px" }}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold" style={{ color: "#2F4A3E" }}>
            Manual Entries
          </h2>
          <button
            onClick={() => setShowAddForm((s) => !s)}
            className="text-xs font-bold rounded-full px-4 py-2 text-white cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-150"
            style={{ background: "var(--portal-emerald, #2F6D46)" }}
          >
            {showAddForm ? "Cancel" : "+ Add Entry"}
          </button>
        </div>
        <p className="text-xs mb-4" style={{ color: "rgba(22,48,43,0.5)" }}>
          In-Kind Donation, IRFAS, Ramadan, and Outreach don&apos;t have a native portal source yet — enter them
          here until they do.
        </p>

        {showAddForm && (
          <form onSubmit={handleAdd} className="grid grid-cols-2 gap-3 pt-2" style={{ borderTop: "1px solid var(--portal-line, rgba(22,48,43,0.08))" }}>
            <select value={form.stream} onChange={(e) => setForm((f) => ({ ...f, stream: e.target.value }))} style={inputStyle} className="col-span-2">
              {MANUAL_STREAMS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <input required placeholder="Title / description" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} style={inputStyle} className="col-span-2" />
            <input placeholder="Source / funder (optional)" value={form.funder_name} onChange={(e) => setForm((f) => ({ ...f, funder_name: e.target.value }))} style={inputStyle} />
            <select value={form.office_id} onChange={(e) => setForm((f) => ({ ...f, office_id: e.target.value, region: "" }))} style={inputStyle}>
              <option value="">No specific office…</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.field_office}
                </option>
              ))}
            </select>
            {!form.office_id && (
              <select value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} style={inputStyle} className="col-span-2">
                <option value="">Region (required if no office)…</option>
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}
            <input required type="number" min={0} placeholder="Amount ($)" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} style={inputStyle} />
            <input type="date" value={form.received_date} onChange={(e) => setForm((f) => ({ ...f, received_date: e.target.value }))} style={inputStyle} />
            <input placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={inputStyle} className="col-span-2" />
            <button
              type="submit"
              disabled={saving}
              className="col-span-2 rounded-full text-white text-sm font-bold px-5 py-2.5 disabled:opacity-50 cursor-pointer"
              style={{ background: "var(--portal-emerald, #2F6D46)" }}
            >
              {saving ? "Saving…" : "Add Entry"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
