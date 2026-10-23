"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../devices/ui";
import { dim, ink, line, rose } from "../../devices/style";

// Assign / work / resolve a Defender incident from the portal.
export default function IncidentActions({ id, status, assignedTo, me }: { id: string; status: string | null; assignedTo: string | null; me: string }) {
  const router = useRouter();
  const [resolving, setResolving] = useState(false);
  const [classification, setClassification] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/security/incidents/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setResolving(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const mine = (assignedTo ?? "").toLowerCase() === me.toLowerCase();
  return (
    <div className="mt-3 grid gap-2">
      <div className="flex flex-wrap gap-2">
        {status !== "resolved" && !mine && (
          <Button small onClick={() => send("assign")} disabled={busy}>
            Assign to me
          </Button>
        )}
        {status === "active" && (
          <Button small onClick={() => send("in_progress")} disabled={busy}>
            Start working
          </Button>
        )}
        {status !== "resolved" && (
          <Button small variant="primary" onClick={() => setResolving((v) => !v)} disabled={busy}>
            Resolve…
          </Button>
        )}
        {status === "resolved" && (
          <Button small onClick={() => send("reopen")} disabled={busy}>
            Reopen
          </Button>
        )}
      </div>
      {resolving && (
        <div className="rounded-xl p-3 grid gap-2" style={{ border: `1.5px solid ${line}` }}>
          <div className="text-xs" style={{ color: dim }}>
            What did it turn out to be?
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["truePositive", "Real threat (handled)"],
                ["informationalExpectedActivity", "Expected activity"],
                ["falsePositive", "False alarm"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setClassification(k)}
                className="text-xs font-bold rounded-full px-3 py-1.5 cursor-pointer"
                style={{ border: `1.5px solid ${line}`, background: classification === k ? ink : "#fff", color: classification === k ? "#fff" : ink }}
              >
                {label}
              </button>
            ))}
          </div>
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What you found / did (saved as a comment in Defender)" className="w-full rounded-xl px-3 py-2 text-sm bg-white outline-none" style={{ border: `1.5px solid ${line}` }} />
          <div>
            <Button small variant="primary" onClick={() => send("resolve", { classification, comment })} disabled={busy || !classification || comment.trim().length < 5}>
              {busy ? "Saving…" : "Resolve incident"}
            </Button>
          </div>
        </div>
      )}
      {err && (
        <div className="text-xs" style={{ color: rose }}>
          {err}
        </div>
      )}
    </div>
  );
}
