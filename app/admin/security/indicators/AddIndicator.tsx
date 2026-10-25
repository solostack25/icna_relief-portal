"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../devices/ui";
import { dim, emerald, line, rose } from "../../devices/style";
import { INDICATOR_TYPES, checkIndicator, type IndicatorType } from "@/lib/security/indicators";

export default function AddIndicator() {
  const router = useRouter();
  const [type, setType] = useState<IndicatorType>("Url");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("90");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const local = value.trim() ? checkIndicator(type, value) : {};
  const field = "rounded-xl px-3 py-2 text-sm bg-white outline-none";

  async function add() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/security/indicators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", type, value, reason, days: Number(days) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setMsg(`Blocked. Defender pushes it to PCs within about an hour.`);
      setValue("");
      setReason("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="grid sm:grid-cols-[180px_1fr] gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as IndicatorType)} className={field} style={{ border: `1.5px solid ${line}` }}>
          {Object.entries(INDICATOR_TYPES).map(([k, t]) => (
            <option key={k} value={k}>
              {t.label}
            </option>
          ))}
        </select>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={INDICATOR_TYPES[type].hint} className={field} style={{ border: `1.5px solid ${local.error ? rose : line}` }} />
      </div>
      {local.error && (
        <div className="text-xs" style={{ color: rose }}>
          {local.error}
        </div>
      )}
      <div className="grid sm:grid-cols-[1fr_180px] gap-2">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? (required, e.g. phishing link in incident 1234)" className={field} style={{ border: `1.5px solid ${line}` }} />
        <select value={days} onChange={(e) => setDays(e.target.value)} className={field} style={{ border: `1.5px solid ${line}` }}>
          <option value="30">Expires in 30 days</option>
          <option value="90">Expires in 90 days</option>
          <option value="365">Expires in 1 year</option>
          <option value="0">Never expires</option>
        </select>
      </div>
      {err && (
        <div className="text-xs" style={{ color: rose }}>
          {err}
        </div>
      )}
      {msg && (
        <div className="text-xs" style={{ color: emerald }}>
          {msg}
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button variant="danger" onClick={add} disabled={busy || !value.trim() || !!local.error || reason.trim().length < 5}>
          {busy ? "Blocking…" : "Block on every PC"}
        </Button>
        <span className="text-xs" style={{ color: dim }}>
          {type.startsWith("File") ? "The file is blocked and removed wherever it's found." : "Needs network protection on (block mode) and custom network indicators turned on in Defender."}
        </span>
      </div>
    </div>
  );
}
