"use client";

import Link from "next/link";
import { Card, StatusPill, money, formatWhen, eventLabel, dim, faint, ink, gold, emerald, rose } from "@/components/speaker/ui";

export type ListRow = {
  id: string;
  request_number: string;
  status: string;
  event_type: string;
  event_type_other: string | null;
  event_at: string;
  event_timezone: string | null;
  speaker_name: string;
  region: string;
  travel_required: boolean;
  total_cost: number;
  coordinator_name: string;
  area_manager_name: string;
  created_at: string;
  agreement_signed_at: string | null;
  w9_needed: boolean;
  w9_received_at: string | null;
  finance_ticket_id: string | null;
};

export default function RequestCard({ r }: { r: ListRow }) {
  const paperworkDone = !!r.agreement_signed_at && (!r.w9_needed || !!r.w9_received_at);
  return (
    <Link href={`/speaker-requests/${r.id}`} className="block transition-transform hover:-translate-y-0.5">
      <Card className="!p-4 sm:!p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[15px] font-bold truncate" style={{ color: ink }}>
              {r.speaker_name}
            </div>
            <div className="text-xs mt-0.5" style={{ color: dim }}>
              {eventLabel(r)} · {formatWhen(r.event_at, r.event_timezone)}
            </div>
          </div>
          <StatusPill status={r.status} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs" style={{ color: faint, fontFamily: "'IBM Plex Mono', monospace" }}>
          <span>{r.request_number}</span>
          <span>{r.region}</span>
          <span>{r.travel_required ? "Travel" : "Local"}</span>
          <span style={{ color: ink, fontWeight: 600 }}>{money(r.total_cost)}</span>
          {r.status === "approved" && (
            <>
              <span style={{ color: r.finance_ticket_id ? emerald : rose }}>{r.finance_ticket_id ? "✓ Finance ticket" : "! Finance ticket"}</span>
              <span style={{ color: paperworkDone ? emerald : gold }}>{paperworkDone ? "✓ Speaker paperwork" : "… Speaker paperwork"}</span>
            </>
          )}
        </div>
      </Card>
    </Link>
  );
}

