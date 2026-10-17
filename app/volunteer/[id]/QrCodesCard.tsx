"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function QrCodesCard({
  eventId,
  slug,
  isPublished,
}: {
  eventId: string;
  slug: string;
  isPublished: boolean;
}) {
  const supabase = createClient();
  const [version, setVersion] = useState(0);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState(false);

  const signupLink = typeof window !== "undefined" ? `${window.location.origin}/volunteer/public/${slug}` : "";

  async function rotateCheckinCode() {
    if (
      !confirm(
        "Make a new check-in code? Printed check-in signs for this event will stop working — you'll need to print the new one."
      )
    )
      return;
    setRotating(true);
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await supabase.from("volunteer_events").update({ checkin_token: token }).eq("id", eventId);
    setRotating(false);
    if (error) return alert(error.message);
    setVersion((v) => v + 1);
  }

  const card = (kind: "signup" | "checkin") => (
    <div className="rounded-lg border border-[var(--color-border)] p-4 flex flex-col items-center text-center">
      <div className="text-sm font-medium">{kind === "signup" ? "Sign-up QR" : "Check-in / check-out QR"}</div>
      <p className="text-xs text-[var(--color-text-dim)] mt-1 min-h-[2.5rem]">
        {kind === "signup"
          ? "Share anywhere — fliers, social, the office door."
          : "Post only at the event. Volunteers scan it to check in, and again to check out."}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={`${kind}-${version}`}
        src={`/api/volunteer/qr?event=${eventId}&kind=${kind}&v=${version}`}
        alt=""
        className={"my-3 h-40 w-40 " + (kind === "signup" && !isPublished ? "opacity-30" : "")}
      />
      {kind === "signup" && !isPublished && (
        <p className="text-xs text-[#B55139] -mt-1 mb-2">Publish the event for this code to work.</p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <a
          href={`/volunteer/${eventId}/poster?kind=${kind}`}
          className="rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white"
        >
          Print sign
        </a>
        <a
          href={`/api/volunteer/qr?event=${eventId}&kind=${kind}&download=1&v=${version}`}
          className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs"
        >
          Download PNG
        </a>
        {kind === "signup" ? (
          <button
            onClick={() => {
              navigator.clipboard?.writeText(signupLink);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
        ) : (
          <button
            onClick={rotateCheckinCode}
            disabled={rotating}
            className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {rotating ? "Making…" : "New code"}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="text-sm font-medium mb-4">QR codes</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {card("signup")}
        {card("checkin")}
      </div>
    </section>
  );
}
