"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, Card, dim, emerald, ink, Notice, PillButton, selectStyle } from "@/components/grantManagement/ui";
import { fmtDate } from "@/lib/grantManagement/shared";

// Quick link from the grant page: card spends on this grant for the
// whole grant period (from today if the grant already started). The
// card page has the full options (dates, usual category, default).
export default function GrantPexLink({ grantId, grantStart, grantEnd, cards }: { grantId: string; grantStart: string; grantEnd: string; cards: { id: string; label: string }[] }) {
  const router = useRouter();
  const [card, setCard] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);
  async function link() {
    setBusy(true);
    setMsg(null);
    const r = await api<{ resuggested: number; warning: string | null }>(`/api/grant-management/pex/cards/${card}/grants`, {
      method: "POST",
      json: { grant_id: grantId, start_date: grantStart, end_date: grantEnd, is_default: true },
    });
    setBusy(false);
    if (r.error) return setMsg({ tone: "error", text: r.error });
    setMsg({ tone: "ok", text: `Linked. ${r.resuggested} waiting transaction${r.resuggested === 1 ? "" : "s"} re-checked.` });
    setCard("");
    router.refresh();
  }
  if (!cards.length)
    return (
      <p className="text-xs" style={{ color: dim }}>
        Every known card is already linked. New cards appear after a PEX sync, or add one from <Link href="/grant-management/pex?tab=cards" className="underline">PEX → Cards</Link>.
      </p>
    );
  return (
    <Card>
      <div className="text-sm font-bold mb-1" style={{ color: ink }}>
        Link a PEX card to this grant
      </div>
      <p className="text-xs mb-3" style={{ color: dim }}>
        Covers the grant period ({fmtDate(grantStart)} to {fmtDate(grantEnd)}) as the card&apos;s default grant.
      </p>
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[240px]">
          <select style={selectStyle} value={card} onChange={(e) => setCard(e.target.value)}>
            <option value="">Pick a card…</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <PillButton disabled={!card || busy} onClick={link}>
          {busy ? "Linking…" : "Link card"}
        </PillButton>
        {card && (
          <Link href={`/grant-management/pex/cards/${card}?grant=${grantId}`} className="text-xs font-semibold" style={{ color: emerald }}>
            Other dates / options →
          </Link>
        )}
      </div>
      {msg && (
        <div className="mt-3">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}
    </Card>
  );
}
