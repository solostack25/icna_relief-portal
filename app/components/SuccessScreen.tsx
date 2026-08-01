"use client";

import Confetti from "./Confetti";

export default function SuccessScreen({
  emoji,
  message,
  subtext,
  onDone,
  doneLabel = "Done",
}: {
  emoji: string;
  message: string;
  subtext?: string;
  onDone: () => void;
  doneLabel?: string;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="relative w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 overflow-hidden">
        <Confetti />
        <div className="text-center py-6">
          <div className="text-4xl mb-3">{emoji}</div>
          <p className="text-base font-medium mb-2">{message}</p>
          {subtext && (
            <p className="text-xs text-[var(--color-text-dim)] mb-6">{subtext}</p>
          )}
          <button
            onClick={onDone}
            className="rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-6 py-2 mt-2"
          >
            {doneLabel}
          </button>
        </div>
      </div>
    </main>
  );
}
