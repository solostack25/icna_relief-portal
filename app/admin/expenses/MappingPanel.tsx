"use client";

import { useEffect, useState } from "react";
import { api, Btn, C, Card, inputStyle, Notice, td, th } from "./ui";
import { TARGET_LABEL } from "./ImportPanel";

type Mapping = { qb_class: string; target: string; office_name: string | null; department: string | null; subhead: string | null; also_office: boolean; updated_at: string };
type Data = { mappings: Mapping[]; offices: { id: string; name: string }[]; departments: { department: string; subhead: string }[] };

// Where each QuickBooks class's expenses land. New classes get a suggestion
// the first time they show up in an import; anything marked "Needs a
// decision" is left out of imports until it's set here.
export default function MappingPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const load = () => api<Data>("/api/admin/expenses/mapping").then(setData).catch((e) => setErr(String(e)));
  useEffect(() => {
    load();
  }, []);

  if (!data) return <p className="text-sm" style={{ color: C.soft }}>{err ?? "Loading…"}</p>;
  const review = data.mappings.filter((m) => m.target === "review").length;
  const list = data.mappings
    .filter((m) => !filter || m.target === filter)
    .filter((m) => !q || `${m.qb_class} ${m.office_name ?? ""} ${m.department ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.target === "review") - Number(a.target === "review") || a.qb_class.localeCompare(b.qb_class));

  return (
    <div>
      {review > 0 && <Notice ok="warn">{review} class{review === 1 ? "" : "es"} need a decision. Their expenses are left out of imports until you pick where they go.</Notice>}
      <Card
        title={`QuickBooks classes (${data.mappings.length})`}
        right={
          <div className="flex flex-wrap gap-2">
            <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle, width: 180 }} />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} style={inputStyle}>
              <option value="">All</option>
              {Object.entries(TARGET_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        }
      >
        {!data.mappings.length ? (
          <p className="text-sm" style={{ color: C.soft }}>Classes appear here after the first QuickBooks import or pull.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead>
                <tr>
                  <th style={th}>QuickBooks class</th>
                  <th style={th}>Goes to</th>
                  <th style={th}>Office / department</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {list.map((m) => <MapRow key={m.qb_class} m={m} data={data} onSaved={load} />)}
              </tbody>
            </table>
          </div>
        )}
        <datalist id="map-offices">{data.offices.map((o) => <option key={o.id} value={o.name} />)}</datalist>
        <datalist id="map-depts">{[...new Set(data.departments.map((d) => d.department))].map((d) => <option key={d} value={d} />)}</datalist>
        <datalist id="map-subs">{[...new Set(data.departments.map((d) => d.subhead))].map((d) => <option key={d} value={d} />)}</datalist>
      </Card>
    </div>
  );
}

function MapRow({ m, data, onSaved }: { m: Mapping; data: Data; onSaved: () => void }) {
  const [target, setTarget] = useState(m.target);
  const [office, setOffice] = useState(m.office_name ?? "");
  const [dept, setDept] = useState(m.department ?? "");
  const [sub, setSub] = useState(m.subhead ?? "");
  const [also, setAlso] = useState(m.also_office);
  const [state, setState] = useState<"idle" | "saving" | "saved" | string>("idle");
  const dirty = target !== m.target || office !== (m.office_name ?? "") || dept !== (m.department ?? "") || sub !== (m.subhead ?? "") || also !== m.also_office;
  void data;

  async function save() {
    setState("saving");
    try {
      await api("/api/admin/expenses/mapping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qb_class: m.qb_class, target, office_name: office, department: dept, subhead: sub, also_office: also }),
      });
      setState("saved");
      onSaved();
    } catch (e) {
      setState(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <tr style={{ background: m.target === "review" ? "#FFFBF0" : undefined }}>
      <td style={{ ...td, fontSize: 12, maxWidth: 340 }}>{m.qb_class}</td>
      <td style={td}>
        <select value={target} onChange={(e) => setTarget(e.target.value)} style={inputStyle}>
          {Object.entries(TARGET_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </td>
      <td style={td}>
        {(target === "office" || target === "grant") && (
          <div className="flex flex-wrap items-center gap-2">
            <input list="map-offices" value={office} onChange={(e) => setOffice(e.target.value)} placeholder="Office" style={{ ...inputStyle, width: 200 }} />
            {target === "grant" && (
              <label className="text-xs flex items-center gap-1" style={{ color: C.soft }}>
                <input type="checkbox" checked={also} onChange={(e) => setAlso(e.target.checked)} /> also count in the office
              </label>
            )}
          </div>
        )}
        {target === "central" && (
          <div className="flex flex-wrap gap-2">
            <input list="map-depts" value={dept} onChange={(e) => setDept(e.target.value.toUpperCase())} placeholder="Department" style={{ ...inputStyle, width: 170 }} />
            <input list="map-subs" value={sub} onChange={(e) => setSub(e.target.value.toUpperCase())} placeholder="Subhead" style={{ ...inputStyle, width: 200 }} />
          </div>
        )}
      </td>
      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
        {dirty ? (
          <Btn small onClick={save} disabled={state === "saving"}>{state === "saving" ? "Saving…" : "Save"}</Btn>
        ) : state === "saved" ? (
          <span className="text-xs" style={{ color: C.good }}>Saved</span>
        ) : null}
        {state !== "idle" && state !== "saving" && state !== "saved" && <span className="text-xs block" style={{ color: C.bad }}>{state}</span>}
      </td>
    </tr>
  );
}
