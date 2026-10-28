"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Article = {
  id: string;
  title: string;
  category: string;
  symptoms: string;
  steps: string;
  escalate_when: string | null;
  ticket_category: string | null;
  is_published: boolean;
  times_used: number;
  times_resolved: number;
  updated_at: string;
};
type Session = {
  id: string;
  issue: string;
  category: string | null;
  outcome: "resolved" | "escalated" | "abandoned";
  steps_tried: string[];
  request_id: string | null;
  created_at: string;
  employee: { first_name: string | null; last_name: string | null } | null;
};

const CATEGORIES = ["sign-in", "email", "teams", "device", "printer", "network", "onedrive", "phone", "software", "security", "general"];
const card = { background: "#fff", border: "1px solid var(--portal-line)", borderRadius: 16 } as const;
const dim = "rgba(22,48,43,0.55)";

export default function HelpArticlesClient({ articles, sessions }: { articles: Article[]; sessions: Session[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<Article> | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"articles" | "activity">("articles");

  const stats = useMemo(() => {
    const resolved = sessions.filter((s) => s.outcome === "resolved").length;
    const escalated = sessions.filter((s) => s.outcome === "escalated").length;
    const abandoned = sessions.filter((s) => s.outcome === "abandoned").length;
    const total = sessions.length;
    return { resolved, escalated, abandoned, total, rate: total ? Math.round((resolved / total) * 100) : 0 };
  }, [sessions]);

  async function save() {
    if (!editing) return;
    setSaving(true);
    setErr(null);
    const res = await fetch("/api/admin/helpdesk/help-articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing.id,
        title: editing.title,
        category: editing.category,
        symptoms: editing.symptoms,
        steps: editing.steps,
        escalateWhen: editing.escalate_when,
        ticketCategory: editing.ticket_category,
        isPublished: editing.is_published !== false,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setErr(body.error ?? "Save failed");
    setEditing(null);
    router.refresh();
  }
  async function remove(id: string) {
    if (!confirm("Delete this article? The assistant will stop using it.")) return;
    await fetch("/api/admin/helpdesk/help-articles", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    router.refresh();
  }

  const input = "w-full rounded-lg px-3 py-2 text-sm outline-none";
  const inputStyle = { border: "1px solid var(--portal-line)" };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-2">
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}>IT Help Articles</h1>
          <p className="text-sm mt-1" style={{ color: dim }}>
            The Portal Assistant walks staff through these before opening a ticket. Write steps the way you'd say them on the phone — one per line.
          </p>
        </div>
        <button onClick={() => setEditing({ category: "general", is_published: true })} className="text-sm font-bold px-4 py-2.5 rounded-full text-white" style={{ background: "var(--portal-emerald)" }}>
          + New article
        </button>
      </div>

      <div className="grid gap-3 my-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <Stat label="Conversations (30 days)" value={stats.total} />
        <Stat label="Fixed without a ticket" value={stats.resolved} accent />
        <Stat label="Became a ticket" value={stats.escalated} />
        <Stat label="Self-fix rate" value={`${stats.rate}%`} accent />
      </div>

      <div className="flex gap-1.5 mb-4">
        {(["articles", "activity"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="text-xs font-bold px-3.5 py-2 rounded-full capitalize" style={{ background: tab === t ? "#16302B" : "#fff", color: tab === t ? "#fff" : "#16302B", border: "1px solid var(--portal-line)" }}>
            {t === "articles" ? `Articles (${articles.length})` : `Recent activity (${sessions.length})`}
          </button>
        ))}
      </div>

      {tab === "articles" ? (
        <div className="space-y-2">
          {articles.map((a) => {
            const rate = a.times_used ? Math.round((a.times_resolved / a.times_used) * 100) : null;
            return (
              <div key={a.id} className="p-4 flex flex-wrap items-center gap-3" style={card}>
                <span className="text-[10px] font-extrabold uppercase px-2 py-1 rounded-full" style={{ background: "#E8F4EE", color: "var(--portal-emerald)" }}>
                  {a.category}
                </span>
                <div className="flex-1 min-w-[200px]">
                  <div className="text-sm font-bold">
                    {a.title} {!a.is_published && <span className="text-[10px] font-bold ml-1" style={{ color: "#B55139" }}>DRAFT</span>}
                  </div>
                  <div className="text-xs truncate" style={{ color: dim }}>
                    {a.steps.split("\n").length} steps · used {a.times_used}× {rate !== null ? `· fixed it ${rate}% of the time` : ""}
                  </div>
                </div>
                <button onClick={() => setEditing(a)} className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ border: "1px solid var(--portal-line)" }}>
                  Edit
                </button>
                <button onClick={() => remove(a.id)} className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ color: "#B55139" }}>
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.length === 0 && (
            <p className="text-sm" style={{ color: dim }}>
              No troubleshooting conversations yet.
            </p>
          )}
          {sessions.map((s) => (
            <div key={s.id} className="p-4" style={card}>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-[10px] font-extrabold uppercase px-2 py-1 rounded-full" style={{ background: s.outcome === "resolved" ? "#E8F4EE" : s.outcome === "escalated" ? "#FCEFDD" : "#F0F4F1", color: s.outcome === "resolved" ? "var(--portal-emerald)" : s.outcome === "escalated" ? "#8A5A1E" : dim }}>
                  {s.outcome === "resolved" ? "Fixed" : s.outcome === "escalated" ? "Ticket" : "Dropped"}
                </span>
                <span className="text-sm font-bold">{s.issue}</span>
                <span className="text-xs ml-auto" style={{ color: dim }}>
                  {[s.employee?.first_name, s.employee?.last_name].filter(Boolean).join(" ")} · {new Date(s.created_at).toLocaleString()}
                </span>
              </div>
              {s.steps_tried?.length > 0 && (
                <ul className="text-xs list-disc pl-5" style={{ color: dim }}>
                  {s.steps_tried.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(22,48,43,0.5)" }} onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-xl max-h-[90vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold">{editing.id ? "Edit article" : "New article"}</h2>
            <label className="block text-xs font-semibold" style={{ color: dim }}>
              Title
              <input className={input} style={inputStyle} value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. VPN won't connect" />
            </label>
            <label className="block text-xs font-semibold" style={{ color: dim }}>
              Category
              <select className={input} style={inputStyle} value={editing.category ?? "general"} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold" style={{ color: dim }}>
              How people describe it (comma-separated — used to find this article)
              <textarea className={input} style={inputStyle} rows={2} value={editing.symptoms ?? ""} onChange={(e) => setEditing({ ...editing, symptoms: e.target.value })} placeholder="vpn not connecting, can't reach shared drive from home, forticlient error" />
            </label>
            <label className="block text-xs font-semibold" style={{ color: dim }}>
              Steps (one per line, plain language)
              <textarea className={input} style={inputStyle} rows={7} value={editing.steps ?? ""} onChange={(e) => setEditing({ ...editing, steps: e.target.value })} />
            </label>
            <label className="block text-xs font-semibold" style={{ color: dim }}>
              Open a ticket when…
              <textarea className={input} style={inputStyle} rows={2} value={editing.escalate_when ?? ""} onChange={(e) => setEditing({ ...editing, escalate_when: e.target.value })} />
            </label>
            <label className="block text-xs font-semibold" style={{ color: dim }}>
              Ticket category
              <input className={input} style={inputStyle} value={editing.ticket_category ?? ""} onChange={(e) => setEditing({ ...editing, ticket_category: e.target.value })} placeholder="e.g. Network" />
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input type="checkbox" checked={editing.is_published !== false} onChange={(e) => setEditing({ ...editing, is_published: e.target.checked })} />
              Published (the assistant uses it)
            </label>
            {err && <p className="text-xs text-red-600">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditing(null)} className="text-sm px-4 py-2 rounded-full" style={{ border: "1px solid var(--portal-line)" }}>
                Cancel
              </button>
              <button onClick={save} disabled={saving} className="text-sm font-bold px-4 py-2 rounded-full text-white disabled:opacity-60" style={{ background: "var(--portal-emerald)" }}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="p-4" style={card}>
      <div className="text-2xl font-extrabold" style={{ color: accent ? "var(--portal-emerald)" : "#16302B" }}>
        {value}
      </div>
      <div className="text-[11px] font-semibold" style={{ color: dim }}>
        {label}
      </div>
    </div>
  );
}
