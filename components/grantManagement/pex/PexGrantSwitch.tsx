"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, dim, rose, sky } from "@/components/grantManagement/ui";

// "Used for grants" switch on a PEX card. On: the card's spending goes
// to Grant Management for coding. Off is refused while the card is
// still linked to a grant.
export default function PexGrantSwitch({ cardId, on, canEdit, compact }: { cardId: string; on: boolean; canEdit: boolean; compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(on);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function toggle() {
    if (!canEdit || busy) return;
    const next = !value;
    setBusy(true);
    setErr(null);
    setValue(next);
    const r = await api(`/api/pex/cards/${cardId}`, { method: "PATCH", json: { grant_eligible: next } });
    setBusy(false);
    if (r.error) {
      setValue(!next);
      setErr(r.error);
      return;
    }
    router.refresh();
  }
  return (
    <div className="inline-flex flex-col items-start">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={!canEdit || busy}
        onClick={toggle}
        className="inline-flex items-center gap-2 disabled:cursor-default"
        title={canEdit ? (value ? "Turn off: stop sending this card's spending to Grant Management" : "Turn on: send this card's spending to Grant Management") : undefined}
      >
        <span className="relative inline-block rounded-full transition-colors" style={{ width: 36, height: 20, background: value ? sky : "rgba(22,48,43,0.18)", opacity: busy ? 0.6 : 1 }}>
          <span className="absolute top-[2px] rounded-full bg-white transition-all" style={{ width: 16, height: 16, left: value ? 18 : 2, boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
        </span>
        {!compact && (
          <span className="text-xs font-semibold" style={{ color: value ? sky : dim }}>
            {value ? "Used for grants" : "Not for grants"}
          </span>
        )}
      </button>
      {err && (
        <span className="text-xs mt-1 max-w-[240px]" style={{ color: rose }}>
          {err}
        </span>
      )}
    </div>
  );
}
