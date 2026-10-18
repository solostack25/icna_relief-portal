"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Office = { id: string; name: string; state: string };
type ZipRow = { id: string; state: string; zip: string | null; city: string | null; county: string | null; office_id: string; source: string };

const card = "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5";
const cell = "rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-sm";
const METHOD_LABEL: Record<string, string> = {
  region: "matched the Salesforce Region alias",
  zip: "matched the zip code",
  city: "matched the city",
  state_default: "no zip/city match — the state's default office",
  state: "the state's office",
  unassigned: "unknown state — Unassigned (HQ)",
};

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/geography", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't save");
  return data;
}

function OfficeSelect({ offices, value, onChange, state }: { offices: Office[]; value: string; onChange: (v: string) => void; state?: string }) {
  const list = state ? [...offices.filter((o) => o.state === state), ...offices.filter((o) => o.state !== state)] : offices;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cell}>
      <option value="">Office…</option>
      {list.map((o) => (
        <option key={o.id} value={o.id}>
          {o.state} – {o.name}
        </option>
      ))}
    </select>
  );
}

export default function GeographyClient({
  offices,
  splits,
  aliases,
  zipCount,
}: {
  offices: Office[];
  splits: { state: string; default_office_id: string }[];
  aliases: { alias: string; office_id: string }[];
  zipCount: number;
}) {
  const router = useRouter();
  const officeName = (id: string | null | undefined) => offices.find((o) => o.id === id)?.name ?? "—";
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (ok: boolean, text: string) => setMsg({ ok, text });

  // test
  const [t, setT] = useState({ state: "", city: "", zip: "", region: "" });
  const [tResult, setTResult] = useState<{ method: string; office: { field_office: string; region: string; chapter: string } | null } | null>(null);
  async function runTest(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/admin/geography?test=1&${new URLSearchParams(t).toString()}`);
    setTResult(await res.json());
  }

  // search / edit
  const [s, setS] = useState({ state: "CA", q: "" });
  const [rows, setRows] = useState<ZipRow[] | null>(null);
  const [edit, setEdit] = useState<Partial<ZipRow> | null>(null);
  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    const res = await fetch(`/api/admin/geography?${new URLSearchParams(s).toString()}`);
    const data = await res.json();
    setRows(data.rows ?? []);
  }
  async function saveRow() {
    if (!edit) return;
    try {
      await post({ action: "save_zip", ...edit });
      flash(true, "Saved.");
      setEdit(null);
      search();
    } catch (e) {
      flash(false, e instanceof Error ? e.message : "Couldn't save");
    }
  }
  async function deleteRow(id: string) {
    if (!confirm("Remove this zip/city rule? Addresses there will fall back to the city or state default.")) return;
    try {
      await post({ action: "delete_zip", id });
      search();
    } catch (e) {
      flash(false, e instanceof Error ? e.message : "Couldn't delete");
    }
  }

  // aliases
  const [newAlias, setNewAlias] = useState({ alias: "", office_id: "" });

  async function act(body: Record<string, unknown>, ok: string) {
    try {
      const r = await post(body);
      flash(true, r.inserted !== undefined ? `${ok} (${r.inserted} rows added)` : ok);
      router.refresh();
    } catch (e) {
      flash(false, e instanceof Error ? e.message : "Couldn't save");
    }
  }

  return (
    <div className="space-y-8">
      {msg && <p className={"text-sm " + (msg.ok ? "text-green-700" : "text-[#B55139]")}>{msg.text}</p>}

      <section>
        <h2 className="text-base font-semibold mb-2">Test an address</h2>
        <form onSubmit={runTest} className={card + " flex flex-wrap items-end gap-3"}>
          <label className="text-xs text-[var(--color-text-dim)]">
            State
            <input value={t.state} onChange={(e) => setT({ ...t, state: e.target.value.toUpperCase().slice(0, 2) })} className={cell + " block w-16 mt-1 uppercase"} />
          </label>
          <label className="text-xs text-[var(--color-text-dim)]">
            City
            <input value={t.city} onChange={(e) => setT({ ...t, city: e.target.value })} className={cell + " block w-40 mt-1"} />
          </label>
          <label className="text-xs text-[var(--color-text-dim)]">
            Zip
            <input value={t.zip} onChange={(e) => setT({ ...t, zip: e.target.value })} className={cell + " block w-24 mt-1"} />
          </label>
          <label className="text-xs text-[var(--color-text-dim)]">
            Salesforce Region (optional)
            <input value={t.region} onChange={(e) => setT({ ...t, region: e.target.value })} className={cell + " block w-36 mt-1"} />
          </label>
          <button className="rounded-full bg-[var(--color-accent)] text-white text-sm font-medium px-4 py-1.5">Check</button>
          {tResult && (
            <div className="w-full text-sm">
              → <strong>{tResult.office?.field_office ?? "—"}</strong>
              <span className="text-[var(--color-text-dim)]">
                {" "}
                ({tResult.office?.region}, {tResult.office?.chapter}) · {METHOD_LABEL[tResult.method] ?? tResult.method}
              </span>
            </div>
          )}
        </form>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-1">Split states — default office</h2>
        <p className="text-sm text-[var(--color-text-dim)] mb-2">Used when an address in these states doesn&apos;t match a zip or city below.</p>
        <div className={card + " grid gap-3 sm:grid-cols-2"}>
          {splits.map((sp) => (
            <label key={sp.state} className="flex items-center gap-3 text-sm">
              <span className="w-8 font-medium">{sp.state}</span>
              <OfficeSelect offices={offices} state={sp.state} value={sp.default_office_id} onChange={(v) => v && act({ action: "set_default", state: sp.state, office_id: v }, `${sp.state} default updated.`)} />
            </label>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-1">Zip codes &amp; cities</h2>
        <p className="text-sm text-[var(--color-text-dim)] mb-2">{zipCount.toLocaleString()} rules. Search by zip or city to change which office an area belongs to.</p>
        <div className={card}>
          <form onSubmit={search} className="flex flex-wrap items-center gap-2 mb-3">
            <select value={s.state} onChange={(e) => setS({ ...s, state: e.target.value })} className={cell}>
              {splits.map((sp) => (
                <option key={sp.state} value={sp.state}>{sp.state}</option>
              ))}
            </select>
            <input placeholder="Zip or city" value={s.q} onChange={(e) => setS({ ...s, q: e.target.value })} className={cell + " flex-1 min-w-[10rem]"} />
            <button className="rounded-full border border-[var(--color-border)] px-4 py-1.5 text-sm">Search</button>
            <button type="button" onClick={() => setEdit({ state: s.state, zip: "", city: "", office_id: "" })} className="text-sm text-[var(--color-accent)] font-medium">
              + Add
            </button>
          </form>

          {edit && (
            <div className="mb-3 rounded-lg border border-[var(--color-border)] p-3 flex flex-wrap items-end gap-2">
              <input placeholder="Zip" value={edit.zip ?? ""} onChange={(e) => setEdit({ ...edit, zip: e.target.value })} className={cell + " w-24"} />
              <input placeholder="City" value={edit.city ?? ""} onChange={(e) => setEdit({ ...edit, city: e.target.value })} className={cell + " w-40"} />
              <OfficeSelect offices={offices} state={edit.state} value={edit.office_id ?? ""} onChange={(v) => setEdit({ ...edit, office_id: v })} />
              <button onClick={saveRow} className="rounded-full bg-[var(--color-accent)] text-white text-sm px-4 py-1.5">Save</button>
              <button onClick={() => setEdit(null)} className="text-sm text-[var(--color-text-dim)] underline">Cancel</button>
              <p className="w-full text-[11px] text-[var(--color-text-dim)]">Leave the zip blank to set a whole city.</p>
            </div>
          )}

          {rows && (
            <div className="divide-y divide-[var(--color-border)] max-h-96 overflow-y-auto">
              {rows.length === 0 && <p className="text-sm text-[var(--color-text-dim)] py-2">No matches.</p>}
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>
                    <span className="font-mono">{r.zip ?? "(city)"}</span> · {r.city}
                    {r.county ? <span className="text-[var(--color-text-dim)]"> · {r.county}</span> : null}
                  </span>
                  <span className="flex items-center gap-3">
                    <span>{officeName(r.office_id)}</span>
                    {r.source === "admin" && <span className="text-[10px] rounded-full bg-black/5 px-2 py-0.5">edited</span>}
                    <button onClick={() => setEdit(r)} className="text-xs underline">edit</button>
                    <button onClick={() => deleteRow(r.id)} className="text-xs underline text-[#B55139]">remove</button>
                  </span>
                </div>
              ))}
              {rows.length === 100 && <p className="text-xs text-[var(--color-text-dim)] py-2">Showing the first 100 — narrow the search.</p>}
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-1">Salesforce &quot;Region&quot; values</h2>
        <p className="text-sm text-[var(--color-text-dim)] mb-2">
          Some Salesforce contacts carry a Region like &quot;SoCal Office&quot; or &quot;KCM&quot;. When a donation has one, it decides the office before the
          address does.
        </p>
        <div className={card}>
          <div className="divide-y divide-[var(--color-border)]">
            {aliases.map((a) => (
              <div key={a.alias} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-mono">{a.alias}</span>
                <span className="flex items-center gap-3">
                  <OfficeSelect offices={offices} value={a.office_id} onChange={(v) => v && act({ action: "save_alias", alias: a.alias, office_id: v }, "Saved.")} />
                  <button onClick={() => confirm(`Remove "${a.alias}"?`) && act({ action: "delete_alias", alias: a.alias }, "Removed.")} className="text-xs underline text-[#B55139]">
                    remove
                  </button>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex flex-wrap items-center gap-2">
            <input placeholder="Region value as it appears in Salesforce" value={newAlias.alias} onChange={(e) => setNewAlias({ ...newAlias, alias: e.target.value })} className={cell + " flex-1 min-w-[12rem]"} />
            <OfficeSelect offices={offices} value={newAlias.office_id} onChange={(v) => setNewAlias({ ...newAlias, office_id: v })} />
            <button
              disabled={!newAlias.alias || !newAlias.office_id}
              onClick={() => act({ action: "save_alias", ...newAlias }, "Added.").then(() => setNewAlias({ alias: "", office_id: "" }))}
              className="rounded-full border border-[var(--color-accent)] text-[var(--color-accent)] text-sm px-4 py-1.5 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-1">Master Cleaner list</h2>
        <p className="text-sm text-[var(--color-text-dim)] mb-2">
          The zip list was loaded from the Master Cleaner. Re-add anything missing from it, or reset it (your edits marked &quot;edited&quot; are
          kept either way).
        </p>
        <div className="flex gap-3">
          <button onClick={() => act({ action: "load_cleaner_list", mode: "missing" }, "Done.")} className="rounded-full border border-[var(--color-border)] px-4 py-1.5 text-sm">
            Re-add missing
          </button>
          <button
            onClick={() => confirm("Reset every zip that came from the Master Cleaner back to its original office? Edited rows are kept.") && act({ action: "load_cleaner_list", mode: "reset" }, "Reset.")}
            className="rounded-full border border-[#B55139]/40 text-[#B55139] px-4 py-1.5 text-sm"
          >
            Reset to cleaner list
          </button>
        </div>
      </section>
    </div>
  );
}
