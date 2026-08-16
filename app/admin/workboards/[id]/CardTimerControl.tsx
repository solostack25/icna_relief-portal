"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { startTimer, pauseTimer, formatDuration } from "@/lib/workTimer";

// Lives on the card itself, not the ticket -- a ticket can be linked
// on more than one board, and "am I actively working right now" is a
// per-card thing, not a per-ticket one. stopPropagation on both
// buttons so a click here never gets picked up as the start of a
// drag by dnd-kit's listeners on the card's outer wrapper.
export default function CardTimerControl({
  cardId,
  initialAccumulatedSeconds,
  initialRunningSince,
}: {
  cardId: string;
  initialAccumulatedSeconds: number;
  initialRunningSince: string | null;
}) {
  const supabase = createClient();
  const [accumulatedSeconds, setAccumulatedSeconds] = useState(initialAccumulatedSeconds);
  const [runningSince, setRunningSince] = useState<string | null>(initialRunningSince);
  const [displaySeconds, setDisplaySeconds] = useState(initialAccumulatedSeconds);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!runningSince) {
      setDisplaySeconds(accumulatedSeconds);
      return;
    }
    const tick = () => {
      const elapsed = Math.max(0, (Date.now() - new Date(runningSince).getTime()) / 1000);
      setDisplaySeconds(accumulatedSeconds + elapsed);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [runningSince, accumulatedSeconds]);

  async function handleStart(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try {
      const { running_since } = await startTimer(supabase, cardId);
      setRunningSince(running_since);
    } catch {
      // stays paused visually; harmless to retry
    } finally {
      setBusy(false);
    }
  }

  async function handlePause(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try {
      const { accumulated_seconds } = await pauseTimer(supabase, cardId);
      setAccumulatedSeconds(accumulated_seconds);
      setRunningSince(null);
    } catch {
      // leave it running visually; harmless to retry
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 6,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 6,
      }}
    >
      <span style={{ fontSize: 9.5, fontWeight: 700, color: runningSince ? "#5FFFAE" : "#7A6FAE" }}>
        {runningSince ? "🟢 " : "⏱ "}
        {formatDuration(displaySeconds)}
      </span>
      {runningSince ? (
        <button
          onClick={handlePause}
          disabled={busy}
          style={{
            fontSize: 9.5,
            fontWeight: 800,
            padding: "3px 8px",
            borderRadius: 20,
            border: "1px solid #4A3B7A",
            background: "transparent",
            color: "#B5A8E8",
            cursor: "pointer",
            opacity: busy ? 0.5 : 1,
          }}
        >
          ⏸ Pause
        </button>
      ) : (
        <button
          onClick={handleStart}
          disabled={busy}
          style={{
            fontSize: 9.5,
            fontWeight: 800,
            padding: "3px 8px",
            borderRadius: 20,
            border: "none",
            background: "linear-gradient(90deg,#FF3EA5,#7B3EFF)",
            color: "#fff",
            cursor: "pointer",
            opacity: busy ? 0.5 : 1,
          }}
        >
          ⚔️ {accumulatedSeconds > 0 ? "Resume" : "Start"}
        </button>
      )}
    </div>
  );
}
