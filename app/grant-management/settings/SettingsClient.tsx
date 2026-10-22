"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GM_ROLE_LABELS, fmtDate, type GmRole } from "@/lib/grantManagement/shared";
import type { LibraryCategory } from "@/lib/grantManagement/library";
import { Card, Eyebrow, Notice, PillButton, api, dim, emerald, faint, ink, inputStyle, rose, selectStyle } from "@/components/grantManagement/ui";

type Person = { employee_id: string; name: string; email: string; role: string; office_ids: string[] };
type Emp = { id: string; name: string; email: string; assigned_office_id: string | null };
type Office = { id: string; name: string; region: string };

const ROLE_HELP: Record<GmRole, string> = {
  gm_admin: "Everything, including system settings and API keys.",
  grant_manager: "Create grants and budgets, manage users, see and approve everything, run all reports, bulk upload.",
  approver: "Enter expenses and approve/reject/return them for their offices' grants.",
  office_user: "Enter expenses and upload receipts for their offices' grants. Can't change budgets or grants.",
};

export default function SettingsClient({
  isAdmin,
  people,
  portalAdmins,
  employees,
  offices,
  library,
  apiKeyCreated,
}: {
  isAdmin: boolean;
  people: Person[];
  portalAdmins: { id: string; name: string; email: string }[];
  employees: Emp[];
  offices: Office[];
  library: LibraryCategory[];
  apiKeyCreated: string | null;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [editing, setEditing] = useState<{ employee_id: string; name: string; role: string; office_ids: string[] } | null>(null);
  const [q, setQ] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [catName, setCatName] = useState("");
  const [catParent, setCatParent] = useState("");
  const officeName = useMemo(() => new Map(offices.map((o) => [o.id, o.name])), [offices]);

  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (n.length < 2) return [];
    return employees.filter((e) => `${e.name} ${e.email}`.toLowerCase().includes(n)).slice(0, 8);
  }, [q, employees]);

  async function post(json: Record<string, unknown>, ok?: string) {
    setMsg(null);
    const r = await api<{ key?: string }>("/api/grant-management/settings", { method: "POST", json });
    if (r.error) {
      setMsg({ tone: "error", text: r.error });
      return null;
    }
    if (ok) setMsg({ tone: "ok", text: ok });
    router.refresh();
    return r;
  }

  async function saveRole() {
    if (!editing) return;
    const r = await post({ action: "set_role", ...editing }, `${editing.name} saved.`);
    if (r) setEditing(null);
  }

  return (
    <div className="grid gap-5">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <Card>
        <Eyebrow>People & access</Eyebrow>
        <p className="text-xs mb-3" style={{ color: dim }}>
          Everyone has their own portal login. Office users and approvers only see grants for the offices you tick (plus any grant they&apos;re added to individually). Adding someone puts Grant Management on their portal home.
        </p>
        <div className="relative mb-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a person: type a name or email…" style={inputStyle} />
          {matches.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 rounded-xl bg-white overflow-hidden" style={{ border: "1px solid var(--portal-line)", boxShadow: "0 8px 24px rgba(22,48,43,0.12)" }}>
              {matches.map((e) => {
                const existing = people.find((p) => p.employee_id === e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-[#FDFBF6]"
                    onClick={() => {
                      setEditing(existing ? { ...existing } : { employee_id: e.id, name: e.name, role: "office_user", office_ids: e.assigned_office_id ? [e.assigned_office_id] : [] });
                      setQ("");
                    }}
                  >
                    <b>{e.name}</b> <span style={{ color: faint }}>{e.email}</span>
                    {existing && <span style={{ color: emerald }}> · {GM_ROLE_LABELS[existing.role as GmRole]}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {editing && (
          <div className="rounded-2xl p-4 mb-4" style={{ border: `1.5px solid ${emerald}55`, background: "rgba(31,111,84,0.04)" }}>
            <div className="font-bold text-sm mb-2" style={{ color: ink }}>
              {editing.name}
            </div>
            <div className="grid sm:grid-cols-2 gap-2 mb-3">
              {(Object.keys(GM_ROLE_LABELS) as GmRole[])
                .filter((r) => r !== "gm_admin" || isAdmin)
                .map((r) => (
                  <label key={r} className="flex gap-2 items-start rounded-xl p-2.5 cursor-pointer" style={{ border: "1px solid var(--portal-line)", background: editing.role === r ? "#fff" : "transparent" }}>
                    <input type="radio" checked={editing.role === r} onChange={() => setEditing({ ...editing, role: r })} className="mt-1" />
                    <span>
                      <span className="block text-sm font-semibold" style={{ color: ink }}>
                        {GM_ROLE_LABELS[r]}
                      </span>
                      <span className="block text-xs" style={{ color: dim }}>
                        {ROLE_HELP[r]}
                      </span>
                    </span>
                  </label>
                ))}
            </div>
            {(editing.role === "approver" || editing.role === "office_user") && (
              <div className="mb-3">
                <div className="text-xs font-semibold mb-1" style={{ color: ink }}>
                  Offices whose grants they can see
                </div>
                <div className="grid sm:grid-cols-3 gap-1 max-h-56 overflow-y-auto rounded-xl p-2 bg-white" style={{ border: "1px solid var(--portal-line)" }}>
                  {offices.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-xs" style={{ color: ink }}>
                      <input
                        type="checkbox"
                        checked={editing.office_ids.includes(o.id)}
                        onChange={(e) => setEditing({ ...editing, office_ids: e.target.checked ? [...editing.office_ids, o.id] : editing.office_ids.filter((x) => x !== o.id) })}
                      />
                      {o.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <PillButton onClick={saveRole}>Save</PillButton>
              <PillButton variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </PillButton>
            </div>
          </div>
        )}

        <div className="grid gap-1">
          {portalAdmins.map((p) => (
            <div key={p.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm" style={{ borderBottom: "1px dashed var(--portal-line)" }}>
              <span>
                <b style={{ color: ink }}>{p.name}</b> <span style={{ color: faint }}>{p.email}</span>
              </span>
              <span className="text-xs" style={{ color: dim }}>
                Administrator (portal admin)
              </span>
            </div>
          ))}
          {people
            .filter((p) => !portalAdmins.some((a) => a.id === p.employee_id))
            .map((p) => (
              <div key={p.employee_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" style={{ borderBottom: "1px dashed var(--portal-line)" }}>
                <span>
                  <b style={{ color: ink }}>{p.name}</b> <span style={{ color: faint }}>{p.email}</span>
                  {p.office_ids.length > 0 && (
                    <span className="block text-xs" style={{ color: dim }}>
                      {p.office_ids.map((id) => officeName.get(id) ?? "?").join(", ")}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs font-semibold" style={{ color: emerald }}>
                    {GM_ROLE_LABELS[p.role as GmRole]}
                  </span>
                  {(p.role !== "gm_admin" || isAdmin) && (
                    <>
                      <button type="button" className="text-xs" style={{ color: dim }} onClick={() => setEditing({ ...p })}>
                        Edit
                      </button>
                      <button type="button" className="text-xs" style={{ color: rose }} onClick={() => confirm(`Remove ${p.name}'s Grant Management access?`) && post({ action: "remove_role", employee_id: p.employee_id }, "Access removed.")}>
                        Remove
                      </button>
                    </>
                  )}
                </span>
              </div>
            ))}
        </div>
      </Card>

      <Card>
        <Eyebrow>Budget category library</Eyebrow>
        <p className="text-xs mb-3" style={{ color: dim }}>
          The categories offered when building a grant&apos;s budget. Each grant still keeps its own structure; turning one off here only hides it from new budgets.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {library.map((c) => (
            <div key={c.id} className="rounded-xl p-3" style={{ border: "1px solid var(--portal-line)", opacity: c.is_active ? 1 : 0.5 }}>
              <div className="flex justify-between gap-2">
                <b className="text-sm" style={{ color: ink }}>
                  {c.name}
                </b>
                <button type="button" className="text-xs" style={{ color: c.is_active ? rose : emerald }} onClick={() => post({ action: "toggle_category", id: c.id, is_active: !c.is_active })}>
                  {c.is_active ? "Turn off" : "Turn on"}
                </button>
              </div>
              {c.children.map((s) => (
                <div key={s.id} className="flex justify-between text-xs py-0.5" style={{ color: s.is_active ? dim : faint }}>
                  <span>
                    › {s.name}
                    {!s.is_active ? " (off)" : ""}
                  </span>
                  <button type="button" style={{ color: s.is_active ? rose : emerald }} onClick={() => post({ action: "toggle_category", id: s.id, is_active: !s.is_active })}>
                    {s.is_active ? "off" : "on"}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <select value={catParent} onChange={(e) => setCatParent(e.target.value)} style={{ ...selectStyle, width: "auto" }}>
            <option value="">New top-level category</option>
            {library.map((c) => (
              <option key={c.id} value={c.id}>
                Subcategory of {c.name}
              </option>
            ))}
          </select>
          <input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Name" style={{ ...inputStyle, maxWidth: 240 }} />
          <PillButton
            variant="ghost"
            onClick={async () => {
              if (await post({ action: "add_category", name: catName, parent_id: catParent || null }, "Category added.")) setCatName("");
            }}
          >
            Add
          </PillButton>
        </div>
      </Card>

      {isAdmin && (
        <Card>
          <Eyebrow>Integrations API (Power BI, Salesforce, SharePoint)</Eyebrow>
          <p className="text-xs mb-3" style={{ color: dim }}>
            A read-only key that returns any report as JSON. In Power BI use <b>Get data → Web</b> with the URL below. {apiKeyCreated ? `Current key created ${fmtDate(apiKeyCreated)}.` : "No key yet."} Creating a new key stops the old one working.
          </p>
          <code className="block text-xs rounded-xl p-3 mb-3 break-all" style={{ background: "#F3EFE4", color: ink }}>
            https://&lt;portal address&gt;/api/grant-management/v1?report=master&amp;key=YOUR_KEY
          </code>
          <p className="text-xs mb-3" style={{ color: faint }}>
            Reports: master, bva, expenses, by_category, by_office, by_region, by_funder, by_program, expiring, underspent, budget_risk, missing_docs. Same filters as the Reports page (office_id, region, program, funder, status, grant_id, date_from, date_to).
          </p>
          {newKey && (
            <div className="mb-3">
              <Notice tone="warn">
                Copy this key now; it won&apos;t be shown again:
                <code className="block mt-1 break-all font-bold">{newKey}</code>
              </Notice>
            </div>
          )}
          <PillButton
            variant="ghost"
            onClick={async () => {
              if (apiKeyCreated && !confirm("Create a new key? The current key will stop working.")) return;
              const r = await post({ action: "rotate_api_key" });
              if (r?.key) setNewKey(r.key);
            }}
          >
            {apiKeyCreated ? "Create new key" : "Create API key"}
          </PillButton>
        </Card>
      )}
    </div>
  );
}
