import { SupabaseClient } from "@supabase/supabase-js";

export type WorkTimer = {
  card_id: string;
  accumulated_seconds: number;
  running_since: string | null;
};

export async function getTimer(supabase: SupabaseClient, cardId: string): Promise<WorkTimer | null> {
  const { data } = await supabase
    .from("workboard_card_timers")
    .select("card_id, accumulated_seconds, running_since")
    .eq("card_id", cardId)
    .maybeSingle();
  return data;
}

// Starts (or resumes) the timer. Idempotent -- calling this while
// already running just no-ops rather than resetting running_since.
export async function startTimer(supabase: SupabaseClient, cardId: string): Promise<{ running_since: string }> {
  const existing = await getTimer(supabase, cardId);
  const runningSince = existing?.running_since ?? new Date().toISOString();

  if (!existing) {
    await supabase.from("workboard_card_timers").insert({ card_id: cardId, running_since: runningSince });
  } else if (!existing.running_since) {
    await supabase
      .from("workboard_card_timers")
      .update({ running_since: runningSince, updated_at: new Date().toISOString() })
      .eq("card_id", cardId);
  }

  return { running_since: runningSince };
}

// Pauses the timer, folding the just-elapsed running segment into
// accumulated_seconds. Idempotent -- calling this while already
// paused (or with no timer row at all) just no-ops.
export async function pauseTimer(supabase: SupabaseClient, cardId: string): Promise<{ accumulated_seconds: number }> {
  const existing = await getTimer(supabase, cardId);
  if (!existing || !existing.running_since) {
    return { accumulated_seconds: existing?.accumulated_seconds ?? 0 };
  }

  const elapsedSinceStart = Math.max(
    0,
    Math.floor((Date.now() - new Date(existing.running_since).getTime()) / 1000)
  );
  const newAccumulated = existing.accumulated_seconds + elapsedSinceStart;

  await supabase
    .from("workboard_card_timers")
    .update({ accumulated_seconds: newAccumulated, running_since: null, updated_at: new Date().toISOString() })
    .eq("card_id", cardId);

  return { accumulated_seconds: newAccumulated };
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
