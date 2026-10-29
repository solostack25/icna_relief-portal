"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CallLogRow } from "@/lib/threecxAdmin";
import { ErrorNote, Pill, Stat, btn, card, emerald, fmtDuration, fmtPhone, goldBg, goldFg, greenBg, input, ink, muted, rose, roseBg } from "../ui";

/** ISO-8601 duration (PT1M5.3S) -> seconds. */
function secs(d: string | undefined): number {
  if (!d) return 0;
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/.exec(d);
  if (!m) return 0;
  return (Number(m[1] || 0) * 86400) + (Number(m[2] || 0) * 3600) + (Number(m[3] || 0) * 60) + Number(m[4] || 0);
}

const RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];

function rangeFor(key: string): { from: Date; to: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (key === "yesterday") {
    const y = new Date(start);
    y.setDate(y.getDate() - 1);
    return { from: y, to: start };
  }
  if (key === "7d") return { from: new Date(start.getTime() - 6 * 86_400_000), to: now };
  if (key === "30d") return { from: new Date(start.getTime() - 29 * 86_400_000), to: now };
  return { from: start, to: now };
}

function who(name?: string, dn?: string, cid?: string) {
  const main = name || (dn && dn.length <= 6 ? dn : "") || fmtPhone(cid) || fmtPhone(dn) || "Unknown";
  const sub = name && dn ? dn : cid && cid !== main ? fmtPhone(cid) : "";
  return { main, sub };
}

export default function HistoryClient() {
  const [range, setRange] = useState("today");
  const [rows, setRows] = useState<CallLogRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [result, setResult] = useState("any");
  const [direction, setDirection] = useState("any");
  const [open, setOpen] = useState<string | null>(null);
  const [skip, setSkip] = useState(0);

  const load = useCallback(
    async (more = false) => {
      setLoading(true);
      setError(null);
      const { from, to } = rangeFor(range);
      const nextSkip = more ? skip + 200 : 0;
      try {
        const res = await fetch("/api/admin/phones/threecx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "call_log", from: from.toISOString(), to: to.toISOString(), skip: nextSkip }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Couldn't load the call log.");
        setRows((r) => (more ? [...r, ...data.rows] : data.rows));
        setTotal(data.total);
        setSkip(nextSkip);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [range, skip]
  );

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const shown = useMemo(
    () =>
      rows.filter((r) => {
        if (q.trim()) {
          const s = q.toLowerCase().replace(/[()\-\s]/g, "");
          const hay = `${r.SourceDisplayName} ${r.SourceDn} ${r.SourceCallerId} ${r.DestinationDisplayName} ${r.DestinationDn} ${r.DestinationCallerId}`.toLowerCase().replace(/[()\-\s]/g, "");
          if (!hay.includes(s)) return false;
        }
        if (result === "missed" && r.Answered) return false;
        if (result === "answered" && !r.Answered) return false;
        if (result === "recorded" && !(r.SrcRecId || r.DstRecId || r.Recordings?.length || r.RecordingUrl)) return false;
        if (direction !== "any" && !(r.Direction ?? "").toLowerCase().includes(direction)) return false;
        return true;
      }),
    [rows, q, result, direction]
  );

  const answered = rows.filter((r) => r.Answered).length;
  const talk = rows.filter((r) => r.Answered).map((r) => secs(r.TalkingDuration));
  const avg = talk.length ? talk.reduce((a, b) => a + b, 0) / talk.length : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 items-center">
        <select aria-label="Date range" value={range} onChange={(e) => setRange(e.target.value)} style={{ ...input, width: "auto", borderRadius: 999, minHeight: 44 }}>
          {RANGES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        <select aria-label="Direction" value={direction} onChange={(e) => setDirection(e.target.value)} style={{ ...input, width: "auto", borderRadius: 999, minHeight: 44 }}>
          <option value="any">Inbound &amp; outbound</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
          <option value="internal">Internal</option>
        </select>
        <select aria-label="Result" value={result} onChange={(e) => setResult(e.target.value)} style={{ ...input, width: "auto", borderRadius: 999, minHeight: 44 }}>
          <option value="any">Any result</option>
          <option value="answered">Answered</option>
          <option value="missed">Missed / not answered</option>
          <option value="recorded">Has recording</option>
        </select>
        <input aria-label="Search calls" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number, name or extension" style={{ ...input, flex: "1 1 220px", width: "auto", borderRadius: 999, minHeight: 44 }} />
        <button type="button" onClick={() => load(false)} disabled={loading} style={{ ...btn, minHeight: 44 }}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat dark n={total ?? rows.length} label="Calls in range" />
        <Stat n={rows.length ? `${Math.round((answered / rows.length) * 100)}%` : "—"} label="Answered (loaded calls)" />
        <Stat n={avg ? fmtDuration(avg) : "—"} label="Average talk time" />
        <Stat n={rows.length - answered} label="Not answered" color={rows.length - answered ? rose : ink} />
      </div>
      <ErrorNote text={error} />

      <section aria-label="Calls" className="rounded-3xl overflow-x-auto" style={card}>
        <table className="w-full text-sm" style={{ minWidth: 880, borderCollapse: "collapse" }}>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide" style={{ color: muted }}>
              <th className="py-3 px-4 font-bold">Time</th>
              <th className="py-3 px-2 font-bold">From</th>
              <th className="py-3 px-2 font-bold">To</th>
              <th className="py-3 px-2 font-bold">Direction</th>
              <th className="py-3 px-2 font-bold">Talk</th>
              <th className="py-3 px-2 font-bold">Result</th>
              <th className="py-3 px-4 font-bold">Recording</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const key = `${r.CallId}-${r.SegmentId ?? 0}`;
              const recId = r.DstRecId || r.SrcRecId || r.Recordings?.[0]?.Id || 0;
              const isOpen = open === key;
              const from = who(r.SourceDisplayName, r.SourceDn, r.SourceCallerId);
              const to = who(r.DestinationDisplayName, r.DestinationDn, r.DestinationCallerId);
              const hasDetail = !!recId || !!r.Transcription || !!r.Summary;
              return (
                <tr key={key} style={{ borderTop: "1px solid rgba(22,48,43,0.08)", background: isOpen ? "#F7FAF8" : undefined, verticalAlign: "top" }}>
                  <td colSpan={7} className="p-0">
                    <div className="grid items-center gap-2 px-4 py-2.5" style={{ gridTemplateColumns: "110px minmax(0,1.3fr) minmax(0,1.3fr) 100px 70px 140px 120px", paddingLeft: r.Indent ? 16 + r.Indent * 16 : 16 }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>
                        {new Date(r.StartTime).toLocaleString("en-US", range === "today" ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-bold truncate">{from.main}</span>
                        {from.sub && <span className="text-xs" style={{ color: muted }}>{from.sub}</span>}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-bold truncate">{to.main}</span>
                        {(to.sub || r.ActionDnDisplayName) && <span className="text-xs" style={{ color: muted }}>{r.ActionDnDisplayName ? `via ${r.ActionDnDisplayName}` : to.sub}</span>}
                      </span>
                      <span className="text-[13px]" style={{ color: muted }}>{r.Direction ?? r.CallType ?? "—"}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>{fmtDuration(secs(r.TalkingDuration))}</span>
                      <span>
                        {r.Answered ? (
                          <Pill fg={emerald} bg={greenBg}>Answered</Pill>
                        ) : /voice/i.test(`${r.Status} ${r.Reason}`) ? (
                          <Pill fg={goldFg} bg={goldBg}>Voicemail</Pill>
                        ) : (
                          <Pill fg={rose} bg={roseBg}>{r.Status && r.Status.length < 18 ? r.Status : "Not answered"}</Pill>
                        )}
                      </span>
                      <span>
                        {hasDetail && (
                          <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)} style={{ ...btn, minHeight: 32, fontSize: 12, color: emerald, borderColor: "#CFE0D7" }}>
                            {isOpen ? "Hide" : recId ? "▶ Play" : "Details"}
                          </button>
                        )}
                      </span>
                    </div>
                    {isOpen && (
                      <div className="flex flex-wrap gap-4 px-4 pb-4" style={{ paddingLeft: 126 }}>
                        {recId ? (
                          <div className="flex flex-col gap-2" style={{ flex: "1 1 320px" }}>
                            <audio controls preload="none" src={`/api/admin/phones/threecx/recording?id=${recId}`} style={{ width: "100%" }}>
                              Your browser can&apos;t play this recording.
                            </audio>
                            <a href={`/api/admin/phones/threecx/recording?id=${recId}`} download className="text-xs underline" style={{ color: emerald }}>
                              Download recording
                            </a>
                          </div>
                        ) : null}
                        {(r.Summary || r.Transcription) && (
                          <div className="text-[13px] leading-relaxed" style={{ flex: "2 1 380px", color: ink }}>
                            {r.Summary && (
                              <p className="m-0 mb-2">
                                <strong>Summary: </strong>
                                {r.Summary}
                              </p>
                            )}
                            {r.Transcription && <p className="m-0" style={{ color: "rgba(22,48,43,0.85)", whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto" }}>{r.Transcription}</p>}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="py-8 text-center" style={{ color: muted }}>
                  No calls for this range and filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      {total !== null && rows.length < total && (
        <button type="button" onClick={() => load(true)} disabled={loading} style={{ ...btn, alignSelf: "center", minHeight: 44 }}>
          Load more ({rows.length} of {total})
        </button>
      )}
      <p className="text-xs m-0" style={{ color: muted }}>
        Filters apply to the calls loaded so far. Playing a recording is logged.
      </p>
    </div>
  );
}
