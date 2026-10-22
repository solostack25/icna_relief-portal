"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MEMBER_ROLE_LABELS, type MemberRole } from "@/lib/grantManagement/shared";
import { Card, Eyebrow, Notice, PillButton, api, dim, faint, ink, inputStyle, rose, selectStyle } from "@/components/grantManagement/ui";

type Member = { employee_id: string; name: string; role: string; allowed_line_ids: string[] };

export default function TeamEditor({ grantId, initial, employees, lines }: { grantId: string; initial: Member[]; employees: { id: string; name: string; email: string }[]; lines: { id: string; label: string }[] }) {
  const router = useRouter();
  const [members, setMembers] = useState(initial);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [openLimits, setOpenLimits] = useState<string | null>(null);

  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (n.length < 2) return [];
    return employees.filter((e) => !members.some((m) => m.employee_id === e.id) && `${e.name} ${e.email}`.toLowerCase().includes(n)).slice(0, 8);
  }, [q, employees, members]);

  const update = (id: string, patch: Partial<Member>) => setMembers((ms) => ms.map((m) => (m.employee_id === id ? { ...m, ...patch } : m)));

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await api(`/api/grant-management/grants/${grantId}/members`, { method: "PUT", json: { members } });
    setBusy(false);
    if (r.error) return setMsg({ tone: "error", text: r.error });
    setMsg({ tone: "ok", text: "Team saved." });
    router.refresh();
  }

  return (
    <Card>
      <Eyebrow>People on this grant</Eyebrow>
      <p className="text-xs mb-3" style={{ color: dim }}>
        Add anyone outside the grant&apos;s office who needs it, or raise someone&apos;s access on this one grant. You can also limit which budget categories a person may code to.
      </p>
      <div className="grid gap-2">
        {members.map((m) => (
          <div key={m.employee_id} className="rounded-xl px-3 py-2" style={{ border: "1px solid var(--portal-line)" }}>
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="text-sm font-semibold" style={{ color: ink }}>
                {m.name}
              </div>
              <div className="flex items-center gap-2">
                <select value={m.role} onChange={(e) => update(m.employee_id, { role: e.target.value })} style={{ ...selectStyle, padding: "6px 10px", fontSize: 13, width: "auto" }}>
                  {(Object.keys(MEMBER_ROLE_LABELS) as MemberRole[]).map((r) => (
                    <option key={r} value={r}>
                      {MEMBER_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                {lines.length > 0 && (m.role === "office_user" || m.role === "approver") && (
                  <button type="button" onClick={() => setOpenLimits(openLimits === m.employee_id ? null : m.employee_id)} className="text-xs" style={{ color: dim }}>
                    {m.allowed_line_ids.length ? `${m.allowed_line_ids.length} categories` : "All categories"} ▾
                  </button>
                )}
                <button type="button" onClick={() => setMembers((ms) => ms.filter((x) => x.employee_id !== m.employee_id))} className="text-lg leading-none" style={{ color: rose }} title="Remove">
                  ×
                </button>
              </div>
            </div>
            {openLimits === m.employee_id && (
              <div className="mt-2 grid sm:grid-cols-2 gap-1">
                <div className="sm:col-span-2 text-xs" style={{ color: faint }}>
                  Tick the categories this person may code to. None ticked = all.
                </div>
                {lines.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 text-xs" style={{ color: ink }}>
                    <input
                      type="checkbox"
                      checked={m.allowed_line_ids.includes(l.id)}
                      onChange={(e) => update(m.employee_id, { allowed_line_ids: e.target.checked ? [...m.allowed_line_ids, l.id] : m.allowed_line_ids.filter((x) => x !== l.id) })}
                    />
                    {l.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
        {!members.length && (
          <div className="text-sm" style={{ color: faint }}>
            No one assigned individually yet.
          </div>
        )}
      </div>
      <div className="relative mt-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a person: type a name or email…" style={inputStyle} />
        {matches.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 rounded-xl bg-white overflow-hidden" style={{ border: "1px solid var(--portal-line)", boxShadow: "0 8px 24px rgba(22,48,43,0.12)" }}>
            {matches.map((e) => (
              <button
                key={e.id}
                type="button"
                className="block w-full text-left px-3 py-2 text-sm hover:bg-[#FDFBF6]"
                onClick={() => {
                  setMembers((ms) => [...ms, { employee_id: e.id, name: e.name, role: "office_user", allowed_line_ids: [] }]);
                  setQ("");
                }}
              >
                <b>{e.name}</b> <span style={{ color: faint }}>{e.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {msg && (
        <div className="mt-3">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}
      <div className="mt-3">
        <PillButton onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save team"}
        </PillButton>
      </div>
    </Card>
  );
}
