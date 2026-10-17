"use client";

import { useEffect, useMemo, useState } from "react";

export type PushOffice = { id: string; name: string; region: string | null };
export type PushEmployee = { id: string; name: string; role: string; officeId: string | null; devices: number };
export type PushHistoryRow = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  audienceLabel: string;
  recipients: number;
  devices: number;
  delivered: number;
  failed: number;
  createdAt: string;
  sentBy: string | null;
};

type AudienceType = "everyone" | "office" | "region" | "role" | "people";

// Portal pages a notification can open when tapped.
const PAGES: { path: string; label: string }[] = [
  { path: "/select-app", label: "Portal home" },
  { path: "/helpdesk", label: "Helpdesk" },
  { path: "/finance-tickets", label: "Finance tickets" },
  { path: "/training", label: "Training" },
  { path: "/calendar", label: "Calendar" },
  { path: "/directory", label: "Directory" },
  { path: "/resources", label: "Resources" },
  { path: "/intake", label: "Client intake" },
];

const TITLE_MAX = 80;
const BODY_MAX = 300;

function roleLabel(role: string) {
  if (!role) return "No role";
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const card = "rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-[0_2px_12px_rgba(18,59,45,0.05)]";
const input =
  "w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--color-accent)]";
const labelCls = "block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-dim)] mb-1.5";

export default function PushCenter({
  configured,
  offices,
  employees,
  history: initialHistory,
  totalDevices,
}: {
  configured: boolean;
  offices: PushOffice[];
  employees: PushEmployee[];
  history: PushHistoryRow[];
  totalDevices: number;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [page, setPage] = useState("/select-app");
  const [customPath, setCustomPath] = useState("");

  const [type, setType] = useState<AudienceType>("everyone");
  const [officeId, setOfficeId] = useState(offices[0]?.id ?? "");
  const regions = useMemo(
    () => Array.from(new Set(offices.map((o) => o.region).filter(Boolean) as string[])).sort(),
    [offices]
  );
  const [region, setRegion] = useState(regions[0] ?? "");
  const roles = useMemo(() => Array.from(new Set(employees.map((e) => e.role).filter(Boolean))).sort(), [employees]);
  const [role, setRole] = useState(roles[0] ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [peopleQuery, setPeopleQuery] = useState("");

  const [preview, setPreview] = useState<{ people: number; peopleWithDevices: number; devices: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null);
  const [history, setHistory] = useState(initialHistory);

  const url = page === "custom" ? customPath.trim() : page;

  const audience = useMemo(() => {
    if (type === "office") return { type, officeId };
    if (type === "region") return { type, region };
    if (type === "role") return { type, role };
    if (type === "people") return { type, employeeIds: Array.from(picked) };
    return { type: "everyone" as const };
  }, [type, officeId, region, role, picked]);

  const audienceLabel = useMemo(() => {
    if (type === "office") return `Office: ${offices.find((o) => o.id === officeId)?.name ?? "—"}`;
    if (type === "region") return `Region: ${region}`;
    if (type === "role") return `Role: ${roleLabel(role)}`;
    if (type === "people") {
      const names = employees.filter((e) => picked.has(e.id)).map((e) => e.name);
      return names.length <= 3 ? `People: ${names.join(", ")}` : `People: ${names.slice(0, 3).join(", ")} +${names.length - 3}`;
    }
    return "Everyone";
  }, [type, officeId, region, role, picked, offices, employees]);

  // Live "this will reach…" line.
  useEffect(() => {
    let alive = true;
    setPreview(null);
    if (type === "people" && picked.size === 0) {
      setPreview({ people: 0, peopleWithDevices: 0, devices: 0 });
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch("/api/admin/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: true, audience }),
      }).catch(() => null);
      const data = res && res.ok ? await res.json() : null;
      if (alive && data) setPreview(data);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [audience, type, picked.size]);

  const filteredPeople = useMemo(() => {
    const q = peopleQuery.trim().toLowerCase();
    const officeName = new Map(offices.map((o) => [o.id, o.name]));
    return employees
      .filter((e) => !q || e.name.toLowerCase().includes(q) || (officeName.get(e.officeId ?? "") ?? "").toLowerCase().includes(q))
      .slice(0, 200)
      .map((e) => ({ ...e, officeName: officeName.get(e.officeId ?? "") ?? "" }));
  }, [employees, offices, peopleQuery]);

  const canSend =
    configured &&
    !sending &&
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (!url || /^\/[^/]/.test(url)) &&
    (type !== "people" || picked.size > 0) &&
    (preview?.devices ?? 0) > 0;

  async function send() {
    if (!canSend || !preview) return;
    const ok = window.confirm(
      `Send "${title.trim()}" to ${preview.peopleWithDevices} ${preview.peopleWithDevices === 1 ? "person" : "people"} (${preview.devices} ${preview.devices === 1 ? "phone" : "phones"})?`
    );
    if (!ok) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), url, audience, label: audienceLabel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't send.");
      setResult({
        ok: true,
        text: `Sent to ${data.delivered} of ${data.devices} ${data.devices === 1 ? "phone" : "phones"}${data.failed ? ` · ${data.failed} didn't go through` : ""}.`,
      });
      setHistory((h) => [
        {
          id: data.id ?? String(Date.now()),
          title: title.trim(),
          body: body.trim(),
          url,
          audienceLabel,
          recipients: data.recipients,
          devices: data.devices,
          delivered: data.delivered,
          failed: data.failed,
          createdAt: new Date().toISOString(),
          sentBy: "You",
        },
        ...h,
      ]);
      setTitle("");
      setBody("");
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "Couldn't send." });
    } finally {
      setSending(false);
    }
  }

  function togglePerson(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6 min-w-0">
        {!configured && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Push isn&apos;t switched on for this server yet (the push keys aren&apos;t set in Vercel). You can still
            look around; sending will work once they&apos;re added.
          </div>
        )}

        <section className={card}>
          <h2 className="text-base font-semibold mb-4">Message</h2>
          <div className="space-y-4">
            <div>
              <label className={labelCls} htmlFor="push-title">
                Title
              </label>
              <input
                id="push-title"
                className={input}
                value={title}
                maxLength={TITLE_MAX}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Office closed Monday"
              />
              <div className="mt-1 text-right text-[11px] text-[var(--color-text-dim)]">
                {title.length}/{TITLE_MAX}
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="push-body">
                Message
              </label>
              <textarea
                id="push-body"
                className={`${input} min-h-[96px] resize-y`}
                value={body}
                maxLength={BODY_MAX}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What should staff know?"
              />
              <div className="mt-1 text-right text-[11px] text-[var(--color-text-dim)]">
                {body.length}/{BODY_MAX} · phones show about the first 120 characters
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="push-page">
                Opens when tapped
              </label>
              <select id="push-page" className={input} value={page} onChange={(e) => setPage(e.target.value)}>
                {PAGES.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.label}
                  </option>
                ))}
                <option value="custom">Another portal page…</option>
              </select>
              {page === "custom" && (
                <input
                  className={`${input} mt-2`}
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder="/admin/office-info"
                />
              )}
              {page === "custom" && customPath && !/^\/[^/]/.test(customPath.trim()) && (
                <p className="mt-1 text-xs text-red-700">Use a portal page path starting with /, like /helpdesk.</p>
              )}
            </div>
          </div>
        </section>

        <section className={card}>
          <h2 className="text-base font-semibold mb-4">Who gets it</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {(
              [
                ["everyone", "Everyone"],
                ["office", "An office"],
                ["region", "A region"],
                ["role", "A role"],
                ["people", "Specific people"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setType(k)}
                className={[
                  "rounded-full px-4 py-2 text-sm font-medium border",
                  type === k
                    ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-white"
                    : "bg-white border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent)]",
                ].join(" ")}
              >
                {l}
              </button>
            ))}
          </div>

          {type === "office" && (
            <select className={input} value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.region ? ` · ${o.region}` : ""}
                </option>
              ))}
            </select>
          )}
          {type === "region" && (
            <select className={input} value={region} onChange={(e) => setRegion(e.target.value)}>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
          {type === "role" && (
            <select className={input} value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          )}
          {type === "people" && (
            <div>
              <input
                className={input}
                value={peopleQuery}
                onChange={(e) => setPeopleQuery(e.target.value)}
                placeholder="Search staff by name or office"
              />
              <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                {filteredPeople.length === 0 && <p className="px-3 py-3 text-sm text-[var(--color-text-dim)]">No staff match.</p>}
                {filteredPeople.map((e) => (
                  <label key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--color-bg)]">
                    <input type="checkbox" checked={picked.has(e.id)} onChange={() => togglePerson(e.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{e.name}</span>
                      <span className="block text-xs text-[var(--color-text-dim)] truncate">
                        {[roleLabel(e.role), e.officeName].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className={`text-xs ${e.devices ? "text-[var(--color-accent)]" : "text-[var(--color-text-dim)]"}`}>
                      {e.devices ? `${e.devices} ${e.devices === 1 ? "phone" : "phones"}` : "Not turned on"}
                    </span>
                  </label>
                ))}
              </div>
              {picked.size > 0 && (
                <p className="mt-2 text-xs text-[var(--color-text-dim)]">
                  {picked.size} selected ·{" "}
                  <button type="button" className="underline" onClick={() => setPicked(new Set())}>
                    clear
                  </button>
                </p>
              )}
            </div>
          )}

          <p className="mt-4 text-sm text-[var(--color-text)]">
            {type === "people" && picked.size === 0
              ? "Pick the people who should get it."
              : preview === null
              ? "Counting…"
              : preview.devices === 0
                ? preview.people === 0
                  ? "No active staff in this group."
                  : `${preview.people} ${preview.people === 1 ? "person" : "people"} in this group, but none have notifications turned on yet.`
                : `Reaches ${preview.peopleWithDevices} of ${preview.people} ${preview.people === 1 ? "person" : "people"} (${preview.devices} ${preview.devices === 1 ? "phone" : "phones"}). The rest haven't turned on notifications.`}
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            className="rounded-full bg-[var(--color-accent)] px-6 py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            {sending ? "Sending…" : "Send notification"}
          </button>
          {result && (
            <p className={`text-sm ${result.ok ? "text-[var(--color-accent)]" : "text-red-700"}`} role="status">
              {result.text}
            </p>
          )}
        </div>

        <section className={card}>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-semibold">Sent</h2>
            <span className="text-xs text-[var(--color-text-dim)]">{totalDevices} phones signed up in total</span>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)]">Nothing sent yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {history.map((h) => (
                <li key={h.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="font-medium text-sm">{h.title}</span>
                    <span className="text-xs text-[var(--color-text-dim)]">
                      {new Date(h.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      {h.sentBy ? ` · ${h.sentBy}` : ""}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--color-text-dim)] mt-0.5">{h.body}</p>
                  <p className="text-xs text-[var(--color-text-dim)] mt-1">
                    {h.audienceLabel} · delivered to {h.delivered} of {h.devices} {h.devices === 1 ? "phone" : "phones"}
                    {h.failed ? ` · ${h.failed} failed` : ""}
                    {h.url && h.url !== "/select-app" ? ` · opens ${h.url}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Phone preview */}
      <aside className="lg:sticky lg:top-6 h-fit">
        <p className={labelCls}>Preview</p>
        <div className="rounded-[28px] bg-[linear-gradient(160deg,#123b2d,#1f6f54)] p-4 pb-10">
          <div className="text-center text-white/80 text-xs mb-6 mt-2">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
          <div className="rounded-2xl bg-white/85 backdrop-blur px-3 py-2.5 shadow-lg">
            <div className="flex items-center gap-2 mb-1">
              <img src="/icons/icon-192.png" alt="" className="h-5 w-5 rounded-md" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#16302b]/70">ICNA Relief</span>
              <span className="ml-auto text-[11px] text-[#16302b]/50">now</span>
            </div>
            <div className="text-[13px] font-semibold text-[#16302b] leading-snug">{title.trim() || "Notification title"}</div>
            <div className="text-[13px] text-[#16302b]/80 leading-snug line-clamp-4">
              {body.trim() || "Your message shows here."}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
