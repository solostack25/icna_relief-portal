"use client";

import { useEffect, useState } from "react";
import { Phone, PhoneIncoming, PhoneOutgoing, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type CallLog = {
  id: string;
  direction: "inbound" | "outbound";
  status: string | null;
  duration_seconds: number | null;
  started_at: string;
};

type SmsMessage = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  created_at: string;
};

type TimelineItem =
  | { kind: "call"; at: string; data: CallLog }
  | { kind: "sms"; at: string; data: SmsMessage };

export default function CommsHistory({
  clientId,
  campaignContactId,
}: {
  clientId?: string;
  campaignContactId?: string;
}) {
  const [items, setItems] = useState<TimelineItem[] | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const column = clientId ? "client_id" : "campaign_contact_id";
      const value = clientId ?? campaignContactId;
      if (!value) return;

      const [{ data: calls }, { data: texts }] = await Promise.all([
        supabase
          .from("call_logs")
          .select("id, direction, status, duration_seconds, started_at")
          .eq(column, value)
          .order("started_at", { ascending: false })
          .limit(50),
        supabase
          .from("sms_messages")
          .select("id, direction, body, created_at")
          .eq(column, value)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      const merged: TimelineItem[] = [
        ...(calls ?? []).map((c): TimelineItem => ({ kind: "call", at: c.started_at, data: c })),
        ...(texts ?? []).map((m): TimelineItem => ({ kind: "sms", at: m.created_at, data: m })),
      ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

      setItems(merged);
    }

    load();
  }, [clientId, campaignContactId]);

  if (items === null) {
    return <p className="text-sm text-[var(--color-text-dim)]">Loading history…</p>;
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-dim)]">
        No calls or texts yet. Once the phone system is connected, activity will show up here
        automatically.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={`${item.kind}-${item.data.id}`}
          className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5"
        >
          <span
            className={[
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full mt-0.5",
              item.kind === "call"
                ? "bg-[var(--badge-green-bg)] text-[var(--badge-green-fg)]"
                : "bg-[var(--badge-blue-bg)] text-[var(--badge-blue-fg)]",
            ].join(" ")}
          >
            {item.kind === "call" ? (
              item.data.direction === "inbound" ? (
                <PhoneIncoming size={13} strokeWidth={2} aria-hidden="true" />
              ) : (
                <PhoneOutgoing size={13} strokeWidth={2} aria-hidden="true" />
              )
            ) : (
              <MessageSquare size={13} strokeWidth={2} aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            {item.kind === "call" ? (
              <p className="text-sm">
                {item.data.direction === "inbound" ? "Inbound call" : "Outbound call"}
                {item.data.status ? ` · ${item.data.status}` : ""}
                {item.data.duration_seconds != null
                  ? ` · ${Math.round(item.data.duration_seconds / 60)} min`
                  : ""}
              </p>
            ) : (
              <p className="text-sm break-words">{item.data.body}</p>
            )}
            <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
              {new Date(item.at).toLocaleString()}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
