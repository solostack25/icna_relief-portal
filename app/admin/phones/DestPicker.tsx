"use client";

import type { PbxDestination } from "@/lib/threecxAdmin";
import { input } from "./ui";

export type DestOption = { number: string; label: string; kind: "Extension" | "Queue" | "RingGroup" | "IVR" };

const KINDS: { to: string; label: string }[] = [
  { to: "VoiceMail", label: "Voicemail" },
  { to: "Extension", label: "Extension" },
  { to: "Queue", label: "Queue" },
  { to: "RingGroup", label: "Ring group" },
  { to: "IVR", label: "Menu" },
  { to: "External", label: "Outside number" },
  { to: "None", label: "End call" },
];

/** Picks a 3CX destination ({To, Number} or {To:"External", External}). */
export default function DestPicker({
  value,
  onChange,
  options,
  id,
  label,
}: {
  value: PbxDestination | undefined | null;
  onChange: (d: PbxDestination) => void;
  options: DestOption[];
  id: string;
  label: string;
}) {
  const to = value?.To && KINDS.some((k) => k.to === value.To) ? value.To : value?.To ? "Extension" : "VoiceMail";
  const needsPick = ["Extension", "Queue", "RingGroup", "IVR"].includes(to);
  const choices = options.filter((o) => o.kind === to);
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-2" role="group" aria-label={label}>
      <select
        id={id}
        aria-label={`${label}: type`}
        value={to}
        onChange={(e) => onChange({ To: e.target.value, Number: "", External: "" })}
        style={input}
      >
        {KINDS.map((k) => (
          <option key={k.to} value={k.to}>
            {k.label}
          </option>
        ))}
      </select>
      {needsPick ? (
        <select aria-label={`${label}: which`} value={value?.Number ?? ""} onChange={(e) => onChange({ To: to, Number: e.target.value })} style={input}>
          <option value="">Choose…</option>
          {choices.map((o) => (
            <option key={o.number} value={o.number}>
              {o.number} · {o.label}
            </option>
          ))}
          {value?.Number && !choices.some((o) => o.number === value.Number) && <option value={value.Number}>{value.Number}</option>}
        </select>
      ) : to === "External" ? (
        <input aria-label={`${label}: number`} value={value?.External ?? value?.Number ?? ""} onChange={(e) => onChange({ To: "External", External: e.target.value })} placeholder="e.g. 7135550188" style={input} />
      ) : (
        <span />
      )}
    </div>
  );
}

export function describeDest(d: PbxDestination | undefined | null, options: DestOption[]): string {
  if (!d || !d.To) return "—";
  if (d.To === "VoiceMail") return "Voicemail";
  if (d.To === "None") return "End call";
  if (d.To === "External") return `Outside ${d.External || d.Number || ""}`.trim();
  const o = options.find((x) => x.number === d.Number);
  return o ? `${o.label} (${o.number})` : `${d.To} ${d.Number ?? ""}`.trim();
}
