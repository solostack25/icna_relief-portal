"use client";

import { useCallback, useEffect, useState } from "react";

type Device = { device_key: string; display_name: string | null; manufacturer: string | null; model: string | null; trust_type: string | null; intune_id: string | null; windows_edition: string | null };
type Upgrade = {
  id: string;
  device_key: string;
  device_name: string | null;
  status: string;
  key_id: string | null;
  reported_edition: string | null;
  steps: Record<string, string>;
  blocked_reason: string | null;
  completed_at: string | null;
  key: { license_type: string; key_last5: string } | null;
};

const ink = "#16302B";
const dim = "rgba(22,48,43,0.6)";
const line = "rgba(22,48,43,0.12)";
const emerald = "#1F6F54";
const rose = "#B5566B";
const card: React.CSSProperties = { background: "#fff", border: `1px solid ${line}`, borderRadius: 16 };

async function call(action: string, body: Record<string, unknown> = {}) {
  const res = await fetch("/api/my-device/windows-upgrade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

export default function UpgradeWizard() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [upgrades, setUpgrades] = useState<Upgrade[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/my-device/windows-upgrade").then((x) => x.json());
    setDevices(r.devices ?? []);
    setUpgrades(r.upgrades ?? []);
    const open = (r.upgrades ?? []).find((u: Upgrade) => u.status !== "complete");
    setActiveId((cur) => cur ?? open?.id ?? null);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<any>, after?: (r: any) => void) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fn();
      after?.(r);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!devices) return <p className="text-sm" style={{ color: dim }}>Loading your computers…</p>;

  const active = upgrades.find((u) => u.id === activeId) ?? null;
  const done = upgrades.filter((u) => u.status === "complete");
  const needs = devices.filter((d) => !(d.trust_type === "AzureAd" && d.intune_id && d.windows_edition && d.windows_edition !== "Home") && !upgrades.some((u) => u.device_key === d.device_key && u.status !== "complete"));

  // ---------- pick a PC ----------
  if (!active) {
    return (
      <div className="space-y-4">
        {done.map((u) => (
          <div key={u.id} className="p-4 text-sm" style={{ ...card, borderColor: `${emerald}55` }}>
            ✓ <b>{u.device_name}</b> is on Windows Pro and managed by ICNA Relief. Nothing else to do.
          </div>
        ))}
        {needs.length === 0 && done.length === 0 && (
          <div className="p-5 text-sm space-y-2" style={card}>
            <p>
              <b>We don't see a Windows PC registered to you yet.</b>
            </p>
            <p style={{ color: dim }}>
              If this is a work computer, open <b>Settings → Accounts → Access work or school</b> on it and make sure your ICNA Relief account is listed, then come back here in a few minutes. Or ask the Portal Assistant for help.
            </p>
            <button onClick={() => act(() => call("check"))} disabled={busy} className="text-xs font-bold px-4 py-2 rounded-full text-white" style={{ background: emerald }}>
              {busy ? "Checking…" : "Check again"}
            </button>
          </div>
        )}
        {needs.length > 0 && (
          <div className="p-5" style={card}>
            <p className="text-sm font-bold mb-3">Which computer are you upgrading?</p>
            <div className="space-y-2">
              {needs.map((d) => (
                <button
                  key={d.device_key}
                  disabled={busy}
                  onClick={() => act(() => call("start", { deviceKey: d.device_key }), (r) => setActiveId(r.upgradeId))}
                  className="w-full text-left p-3 rounded-xl flex items-center gap-3 hover:bg-black/[0.02]"
                  style={{ border: `1px solid ${line}` }}
                >
                  <span className="text-2xl" aria-hidden>
                    💻
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-bold">{d.display_name ?? "Windows PC"}</span>
                    <span className="block text-xs" style={{ color: dim }}>
                      {[d.manufacturer, d.model].filter(Boolean).join(" ")} {d.windows_edition ? `· Windows ${d.windows_edition}` : ""}
                    </span>
                  </span>
                  <span className="text-xs font-bold" style={{ color: emerald }}>
                    Start →
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {err && <p className="text-sm" style={{ color: rose }}>{err}</p>}
      </div>
    );
  }

  // ---------- wizard ----------
  const s = active.steps ?? {};
  const editionKnown = !!active.reported_edition;
  const isPro = editionKnown && active.reported_edition !== "Home";
  const onPro = isPro || !!s.upgraded_at;
  const joined = !!s.joined_at || active.status === "joined";

  const step = active.status === "complete" ? 5 : !editionKnown ? 1 : !onPro ? 2 : !joined ? 3 : 4;

  return (
    <div className="space-y-4">
      <Progress step={step} />
      {err && (
        <p className="text-sm p-3 rounded-xl" style={{ background: "#FCE5E0", color: rose }}>
          {err}
        </p>
      )}

      {step === 1 && (
        <Card title="Step 1 · Check which Windows you have" device={active.device_name}>
          <ol className="list-decimal pl-5 space-y-1 text-sm">
            <li>
              On this PC, press <Kbd>Windows</Kbd> + <Kbd>Pause</Kbd>, or open <b>Settings → System → About</b>.
            </li>
            <li>
              Under <b>Windows specifications</b>, look at <b>Edition</b>.
            </li>
          </ol>
          <p className="text-sm font-bold mt-3">What does it say?</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {[
              ["Home", "Windows 11 Home / 10 Home"],
              ["Pro", "Windows 11 Pro / 10 Pro"],
              ["Enterprise", "Enterprise"],
              ["Education", "Education"],
            ].map(([v, l]) => (
              <button key={v} disabled={busy} onClick={() => act(() => call("report_edition", { upgradeId: active.id, edition: v }))} className="text-sm font-bold px-4 py-2.5 rounded-full" style={{ border: `1.5px solid ${emerald}`, color: emerald }}>
                {l}
              </button>
            ))}
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card title="Step 2 · Upgrade to Windows 11 Pro" device={active.device_name}>
          {!key ? (
            <>
              <p className="text-sm">ICNA Relief has a Windows 11 Pro license for this PC. Get your key, then enter it on the PC. Your files and apps stay where they are.</p>
              <button disabled={busy} onClick={() => act(() => call("get_key", { upgradeId: active.id }), (r) => setKey(r.key))} className="mt-3 text-sm font-bold px-5 py-2.5 rounded-full text-white disabled:opacity-60" style={{ background: emerald }}>
                {busy ? "Getting your key…" : "Get my product key"}
              </button>
              <p className="text-[11px] mt-2" style={{ color: dim }}>
                Your key is for this one PC. Don't share it - it's tracked to you.
              </p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl" style={{ background: "#FBF7EF" }}>
                <span className="font-mono text-base font-bold flex-1 break-all">{key}</span>
                <button onClick={() => navigator.clipboard.writeText(key)} className="text-xs font-bold px-3 py-1.5 rounded-full bg-white" style={{ border: `1px solid ${line}` }}>
                  Copy
                </button>
              </div>
              <ol className="list-decimal pl-5 space-y-1 text-sm mt-3">
                <li>Save your work and close your apps.</li>
                <li>
                  Open <b>Settings → System → Activation</b>.
                </li>
                <li>
                  Next to <b>Change product key</b>, click <b>Change</b> and paste the key above.
                </li>
                <li>
                  Click <b>Start</b> when it asks to upgrade. The PC restarts once or twice (about 10 minutes).
                </li>
                <li>
                  When it's back, check <b>Settings → System → About</b> says <b>Pro</b>.
                </li>
              </ol>
              <div className="flex flex-wrap gap-2 mt-3">
                <button disabled={busy} onClick={() => act(() => call("mark_upgraded", { upgradeId: active.id }), () => setKey(null))} className="text-sm font-bold px-5 py-2.5 rounded-full text-white" style={{ background: emerald }}>
                  It says Pro now
                </button>
                <Stuck onStuck={(r) => act(() => call("blocked", { upgradeId: active.id, reason: r }))} />
              </div>
            </>
          )}
          {active.key?.license_type === "mak" && <p className="text-xs mt-2" style={{ color: dim }}>IT will enter this PC's key for you - open a ticket from the Portal Assistant.</p>}
        </Card>
      )}

      {step === 3 && (
        <Card title="Step 3 · Connect this PC to ICNA Relief" device={active.device_name}>
          <p className="text-sm">This lets you sign in to Windows with your ICNA Relief email and lets IT keep the PC secure and updated.</p>
          <div className="text-sm p-3 rounded-xl mt-3" style={{ background: "#FCEFDD" }}>
            <b>Before you start:</b> make sure your files are in OneDrive or a USB drive. After joining you'll sign in as your work account, which starts with a fresh Windows profile (your old files are still on the PC under the old account).
          </div>
          <ol className="list-decimal pl-5 space-y-1 text-sm mt-3">
            <li>
              Open <b>Settings → Accounts → Access work or school</b>.
            </li>
            <li>
              If your ICNA Relief account is already listed there, click it and choose <b>Disconnect</b>, then restart.
            </li>
            <li>
              Click <b>Connect</b>, then the small link <b>Join this device to Microsoft Entra ID</b>.
            </li>
            <li>Sign in with your ICNA Relief email and password, and confirm it's ICNA Relief.</li>
            <li>
              Restart, then on the sign-in screen choose <b>Other user</b> and sign in with your ICNA Relief email.
            </li>
          </ol>
          <div className="flex flex-wrap gap-2 mt-3">
            <button disabled={busy} onClick={() => act(() => call("mark_joined", { upgradeId: active.id }))} className="text-sm font-bold px-5 py-2.5 rounded-full text-white" style={{ background: emerald }}>
              I'm signed in with my work account
            </button>
            <Stuck onStuck={(r) => act(() => call("blocked", { upgradeId: active.id, reason: r }))} />
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card title="Step 4 · Confirming with IT" device={active.device_name}>
          <p className="text-sm">Your PC is setting itself up with ICNA Relief (this can take up to an hour after you first sign in). Keep it on and connected.</p>
          <button
            disabled={busy}
            onClick={() => act(() => call("check"), (r) => setCheckMsg(r.completed ? "Confirmed - you're all set!" : "Not confirmed yet. Give it a little longer and check again; if it's been over an hour, ask the Portal Assistant."))}
            className="mt-3 text-sm font-bold px-5 py-2.5 rounded-full text-white"
            style={{ background: emerald }}
          >
            {busy ? "Checking…" : "Check now"}
          </button>
          {checkMsg && <p className="text-sm mt-2">{checkMsg}</p>}
        </Card>
      )}

      {step === 5 && (
        <div className="p-6 text-center" style={{ ...card, borderColor: `${emerald}55` }}>
          <div className="text-4xl mb-2" aria-hidden>
            🎉
          </div>
          <p className="text-lg font-bold">All done</p>
          <p className="text-sm mt-1" style={{ color: dim }}>
            {active.device_name} is on Windows Pro and managed by ICNA Relief. Thank you!
          </p>
        </div>
      )}

      {active.status === "blocked" && (
        <p className="text-sm p-3 rounded-xl" style={{ background: "#FCEFDD" }}>
          IT has been told this upgrade is stuck{active.blocked_reason ? `: "${active.blocked_reason}"` : ""}. They'll follow up - or ask the Portal Assistant to open a ticket.
        </p>
      )}
      {upgrades.filter((u) => u.status !== "complete").length > 1 && (
        <button onClick={() => setActiveId(null)} className="text-xs underline" style={{ color: dim }}>
          Switch computer
        </button>
      )}
    </div>
  );
}

function Progress({ step }: { step: number }) {
  const labels = ["Check edition", "Upgrade to Pro", "Connect to ICNA", "Confirm"];
  return (
    <div className="flex gap-1.5">
      {labels.map((l, i) => (
        <div key={l} className="flex-1">
          <div className="h-1.5 rounded-full" style={{ background: i + 1 < step || step === 5 ? emerald : i + 1 === step ? "#C99A3D" : line }} />
          <div className="text-[10px] font-bold mt-1" style={{ color: i + 1 <= step ? ink : dim }}>
            {l}
          </div>
        </div>
      ))}
    </div>
  );
}

function Card({ title, device, children }: { title: string; device: string | null; children: React.ReactNode }) {
  return (
    <div className="p-5" style={card}>
      <div className="text-xs font-bold" style={{ color: dim }}>
        {device}
      </div>
      <h2 className="text-base font-extrabold mb-2">{title}</h2>
      {children}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded text-xs font-mono" style={{ border: `1px solid ${line}`, background: "#FBF7EF" }}>
      {children}
    </kbd>
  );
}

function Stuck({ onStuck }: { onStuck: (reason: string) => void }) {
  return (
    <button
      onClick={() => {
        const r = prompt("What happened? (e.g. 'key not accepted', 'no Join link', error message)");
        if (r) onStuck(r);
      }}
      className="text-sm font-bold px-4 py-2.5 rounded-full"
      style={{ border: `1px solid ${line}` }}
    >
      I'm stuck
    </button>
  );
}
