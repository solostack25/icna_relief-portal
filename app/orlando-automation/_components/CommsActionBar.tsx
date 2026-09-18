"use client";

import { useState } from "react";
import { Phone, MessageSquare, FileText } from "lucide-react";
import { useAlert } from "@/lib/orlandoAutomation/alert";

/**
 * Shared call / text / transcript action row for a contact — used on both
 * the client profile (Client Comms) and campaign contact detail (Donor
 * Campaigns) pages.
 *
 * NOT WIRED YET: buttons are fully styled and clickable, but there's no
 * live 3CX xAPI or Skyetel connection behind them. Clicking shows a clear
 * "not connected" notice instead of silently failing. Swap the button
 * handlers for real calls once the API keys are in and the xAPI/Skyetel
 * clients (lib/comms/) are wired up.
 */
export default function CommsActionBar({
  phone,
  showTranscriptAccess = false,
}: {
  phone: string | null;
  showTranscriptAccess?: boolean;
}) {
  const { showAlert } = useAlert();
  const [pending, setPending] = useState<"call" | "text" | null>(null);

  function handleCall() {
    if (!phone) return;
    setPending("call");
    setTimeout(() => {
      setPending(null);
      showAlert(
        "Calling isn't connected yet — this will dial through 3CX once the phone system is wired up.",
        "info"
      );
    }, 300);
  }

  function handleText() {
    if (!phone) return;
    setPending("text");
    setTimeout(() => {
      setPending(null);
      showAlert(
        "Texting isn't connected yet — this will send through Skyetel once the phone system is wired up.",
        "info"
      );
    }, 300);
  }

  if (!phone) {
    return (
      <p className="text-sm text-[var(--color-text-dim)]">
        No phone number on file — add one to enable calling and texting.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button
        onClick={handleCall}
        disabled={pending !== null}
        className="flex items-center gap-2 rounded-lg border border-[var(--color-accent)]/40 text-[var(--color-accent)] text-sm font-medium px-4 py-2 hover:border-[var(--color-accent)] disabled:opacity-50 transition-colors"
      >
        <Phone size={15} strokeWidth={2} aria-hidden="true" />
        Call
      </button>
      <button
        onClick={handleText}
        disabled={pending !== null}
        className="flex items-center gap-2 rounded-lg border border-[var(--badge-blue-fg)]/40 text-[var(--badge-blue-fg)] text-sm font-medium px-4 py-2 hover:border-[var(--badge-blue-fg)] disabled:opacity-50 transition-colors"
      >
        <MessageSquare size={15} strokeWidth={2} aria-hidden="true" />
        Text
      </button>
      {showTranscriptAccess && (
        <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-dim)] ml-1">
          <FileText size={13} strokeWidth={2} aria-hidden="true" />
          Transcripts appear here once calls are recorded
        </span>
      )}
    </div>
  );
}
