"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ORLANDO_OFFICE_ID, ORLANDO_STATE } from "@/lib/orlandoAutomation/config";

type Broadcast = {
  id: string;
  body: string;
  filter_summary: string | null;
  recipient_count: number;
  created_at: string;
};

export default function BroadcastsPage() {
  const supabase = createClient();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("broadcasts")
        .select("id, body, filter_summary, recipient_count, created_at")
        .eq("office_id", ORLANDO_OFFICE_ID)
        .order("created_at", { ascending: false })
        .limit(50);
      setBroadcasts(data ?? []);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/orlando-automation"
          className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          ← Back to home
        </Link>

        <div className="flex items-center justify-between mt-4 mb-6">
          <div>
            <h1 className="text-xl font-semibold">Bulk Messaging</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              Text a batch of clients at once — a same-day distribution, an extra pallet
              that just came in, anything time-sensitive.
            </p>
          </div>
          <Link
            href="/orlando-automation/broadcasts/new"
            className="shrink-0 flex items-center gap-2 rounded-lg bg-[var(--color-accent-solid)] text-white text-sm font-medium px-4 py-2 hover:opacity-90 transition-opacity"
          >
            <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
            New Broadcast
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--color-text-dim)]">Loading…</p>
        ) : broadcasts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
            <Megaphone
              size={22}
              strokeWidth={1.5}
              className="mx-auto mb-2 text-[var(--color-text-dim)]"
              aria-hidden="true"
            />
            <p className="text-sm text-[var(--color-text-dim)]">
              No broadcasts sent yet. Create one to message multiple clients at once.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {broadcasts.map((b) => (
              <li
                key={b.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">
                    {b.recipient_count} recipient{b.recipient_count === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-[var(--color-text-dim)] shrink-0">
                    {new Date(b.created_at).toLocaleString()}
                  </p>
                </div>
                {b.filter_summary && (
                  <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                    {b.filter_summary}
                  </p>
                )}
                <p className="text-sm mt-1.5 break-words">{b.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
