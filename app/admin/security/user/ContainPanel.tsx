"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../devices/ui";
import { dim, emerald, faint, gold, ink, line, rose } from "../../devices/style";

type Step = { key: string; label: string; status: "ok" | "failed" | "skipped"; note?: string };

const ICON = { ok: "✓", failed: "✗", skipped: "–" } as const;
const COLOR = { ok: emerald, failed: rose, skipped: faint } as const;

// "This account is compromised" button: runs the containment playbook
// and shows each step's result.
export default function ContainPanel({ userId, name, hasOnboardedPc }: { userId: string; name: string; hasOnboardedPc: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [clearMfa, setClearMfa] = useState(true);
  const [disableRules, setDisableRules] = useState(true);
  const [isolateDevices, setIsolateDevices] = useState(false);
  const [openTicket, setOpenTicket] = useState(true);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ steps: Step[]; contained: boolean; ticket: string | null } | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/security/users/${userId}/contain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, clearMfa, disableRules, isolateDevices, openTicket }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setResult({ steps: d.steps, contained: d.contained, ticket: d.ticket });
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const Check = ({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: string; hint: string }) => (
    <label className="flex gap-2 items-start text-sm cursor-pointer">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="mt-1" />
      <span>
        <b style={{ color: ink }}>{label}</b>
        <span className="block text-xs" style={{ color: dim }}>
          {hint}
        </span>
      </span>
    </label>
  );

  return (
    <div className="grid gap-3">
      {result && (
        <div className="rounded-xl p-3 grid gap-1.5" style={{ border: `1.5px solid ${result.contained ? emerald : rose}55`, background: `${result.contained ? emerald : rose}08` }}>
          <div className="text-sm font-bold" style={{ color: result.contained ? emerald : rose }}>
            {result.contained ? "Account contained." : "Containment incomplete: the account may still be usable. Fix the failed steps in Entra right away."}
            {result.ticket && <span style={{ color: ink }}> Ticket {result.ticket} opened.</span>}
          </div>
          {result.steps.map((s) => (
            <div key={s.key} className="text-sm flex gap-2">
              <b style={{ color: COLOR[s.status], width: 14 }}>{ICON[s.status]}</b>
              <span>
                <span style={{ color: ink }}>{s.label}</span>
                {s.note && (
                  <span className="block text-xs" style={{ color: s.status === "failed" ? rose : dim }}>
                    {s.note}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {!open ? (
        <div>
          <Button variant="danger" onClick={() => setOpen(true)}>
            This account is compromised…
          </Button>
          <div className="text-xs mt-1.5" style={{ color: dim }}>
            One click to block the account, kill every session, scramble the password, clear sign-in methods, switch off forwarding rules and open a ticket.
          </div>
        </div>
      ) : (
        <div className="rounded-xl p-4 grid gap-3" style={{ border: `1.5px solid ${rose}55`, background: `${rose}06` }}>
          <div className="text-sm font-bold" style={{ color: rose }}>
            Contain {name}&apos;s account
          </div>
          <div className="text-xs" style={{ color: dim }}>
            Always runs: block sign-in, sign out everywhere, reset the password to a random one nobody knows, and mark compromised in Entra ID Protection (if licensed). They&apos;ll have no access until you restore it below.
          </div>
          <div className="grid gap-2">
            <Check on={clearMfa} set={setClearMfa} label="Remove all sign-in methods" hint="Attackers often register their own Authenticator or phone. They'll set MFA up again with a Temporary Access Pass." />
            <Check on={disableRules} set={setDisableRules} label="Switch off suspicious inbox rules" hint="Forwarding outside ICNA, or rules that hide/delete replies. Switched off, not deleted, so they stay as evidence." />
            <Check
              on={isolateDevices}
              set={setIsolateDevices}
              label="Isolate their PCs"
              hint={hasOnboardedPc ? "Only if the PC itself may be infected (malware, remote-access tool). Cuts it off from the network." : "None of their PCs are onboarded to Defender for Endpoint, so this will be skipped."}
            />
            <Check on={openTicket} set={setOpenTicket} label="Open an urgent IT ticket" hint="With every step's result and a follow-up checklist." />
          </div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What happened? (required, e.g. incident #, clicked phishing link)" className="w-full rounded-xl px-3 py-2 text-sm bg-white outline-none" style={{ border: `1.5px solid ${line}` }} />
          <div className="text-xs" style={{ color: gold }}>
            Type <b>CONTAIN</b> to confirm.
          </div>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="CONTAIN" className="w-40 rounded-xl px-3 py-2 text-sm bg-white outline-none" style={{ border: `1.5px solid ${line}` }} />
          {err && (
            <div className="text-xs" style={{ color: rose }}>
              {err}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="danger" onClick={run} disabled={busy || reason.trim().length < 5 || confirm.trim().toUpperCase() !== "CONTAIN"}>
              {busy ? "Containing…" : "Run playbook"}
            </Button>
            <Button onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
