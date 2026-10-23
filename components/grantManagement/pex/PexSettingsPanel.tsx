"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Card, dim, faint, Field, ink, inputStyle, Notice, PillButton } from "@/components/grantManagement/ui";
import { money } from "@/lib/grantManagement/shared";

type Settings = { url: string; token: string | null; webhookSecret: string | null; tagId: string };

// Connection: API token, webhook secret, optional tag write-back, plus
// Test and Sync now. Saved secrets are never shown again, only masked.
export default function PexSettingsPanel({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [s, setS] = useState<Settings | null>(null);
  const [form, setForm] = useState({ url: "", token: "", webhookSecret: "", tagId: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [origin, setOrigin] = useState("");

  async function load() {
    const r = await api<Settings>("/api/grant-management/pex/settings");
    if (!r.error) {
      setS(r);
      setForm((f) => ({ ...f, url: r.url, tagId: r.tagId ?? "" }));
    }
  }
  useEffect(() => {
    load();
    setOrigin(window.location.origin);
  }, []);

  async function save() {
    setBusy("save");
    setMsg(null);
    const r = await api<{ changed: string[] }>("/api/grant-management/pex/settings", { method: "POST", json: form });
    setBusy(null);
    if (r.error) return setMsg({ tone: "error", text: r.error });
    setForm((f) => ({ ...f, token: "", webhookSecret: "" }));
    setMsg({ tone: "ok", text: r.changed.length ? `Saved ${r.changed.join(", ")}.` : "Nothing changed." });
    load();
  }
  async function test() {
    setBusy("test");
    setMsg(null);
    const r = await api<{ balance: number | null }>("/api/grant-management/pex/settings", { method: "POST", json: { test: true } });
    setBusy(null);
    setMsg(r.error ? { tone: "error", text: r.error } : { tone: "ok", text: `Connected to PEX. Business balance ${r.balance != null ? money(r.balance, true) : "unavailable"}.` });
  }
  async function sync() {
    setBusy("sync");
    setMsg({ tone: "info", text: "Syncing cards and the last 45 days of transactions…" });
    const r = await api<{ ok: boolean; stats?: { cards?: { seen: number }; transactions?: { inserted: number; updated: number; settled: number } } }>("/api/grant-management/pex/sync", { method: "POST", json: { days: 45 } });
    setBusy(null);
    if (r.error) return setMsg({ tone: "error", text: r.error });
    const t = r.stats?.transactions;
    setMsg({ tone: "ok", text: `Synced ${r.stats?.cards?.seen ?? 0} cards · ${t?.inserted ?? 0} new transactions, ${t?.updated ?? 0} updated, ${t?.settled ?? 0} settled.` });
    router.refresh();
  }

  async function startDemo() {
    if (!confirm("Turn on PEX demo mode? This adds 6 demo cards (held by real employees, matched by email) and about 90 days of fake transactions, and links some of them to your active grants. You can remove it all later.")) return;
    setBusy("demo");
    setMsg({ tone: "info", text: "Building demo cards and 90 days of transactions…" });
    const r = await api<{ stats?: { cards?: { seen: number }; transactions?: { inserted: number } }; linked: number }>("/api/grant-management/pex/demo", { method: "POST" });
    setBusy(null);
    if (r.error) return setMsg({ tone: "error", text: r.error });
    setMsg({ tone: "ok", text: `Demo is on: ${r.stats?.cards?.seen ?? 0} cards, ${r.stats?.transactions?.inserted ?? 0} transactions, ${r.linked} grant links. Head to the Transactions tab and start coding.` });
    load();
    router.refresh();
  }
  async function clearDemo() {
    if (!confirm("Remove all PEX demo data? This deletes the demo cards, their transactions, and any expenses coded from them (including receipts).")) return;
    setBusy("demo");
    const r = await api<{ transactions: number; expenses: number; cards: number }>("/api/grant-management/pex/demo", { method: "DELETE" });
    setBusy(null);
    if (r.error) return setMsg({ tone: "error", text: r.error });
    setMsg({ tone: "ok", text: `Removed ${r.cards} demo cards, ${r.transactions} transactions and ${r.expenses} coded expenses. Demo mode is off.` });
    load();
    router.refresh();
  }

  const demo = s?.url?.toLowerCase() === "demo";
  const webhookUrl = origin ? `${origin}/api/pex/webhook` : "/api/pex/webhook";
  return (
    <Card>
      <div className="text-sm font-bold mb-1" style={{ color: ink }}>
        PEX connection
      </div>
      <p className="text-xs mb-4" style={{ color: dim }}>
        Uses a PEX API token for a dedicated API admin. Request API access at developer.pexcard.com, then generate the token. Cards and transactions sync nightly and on every PEX webhook.
      </p>
      <div className="space-y-4">
        {demo ? (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "#C99A3D14", border: "1px solid #C99A3D55", color: ink }}>
            <b>Demo mode is on.</b> Cards and transactions come from a built-in fake PEX, so you can try syncing, splitting and coding safely. Real employees hold the demo cards, and anything you code becomes a real draft or submitted expense until you remove the demo data.
            {isAdmin && (
              <div className="mt-2">
                <button type="button" className="text-xs font-bold" style={{ color: "#B5566B" }} disabled={!!busy} onClick={clearDemo}>
                  {busy === "demo" ? "Working…" : "Remove demo data and turn demo off"}
                </button>
              </div>
            )}
          </div>
        ) : (
          !s?.token &&
          isAdmin && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(22,48,43,0.04)", color: ink }}>
              <b>No PEX keys yet?</b> Try it with demo data: fake cards and about 90 days of realistic transactions, including pending holds, refunds and receipts.
              <div className="mt-2">
                <PillButton variant="ghost" onClick={startDemo} disabled={!!busy}>
                  {busy === "demo" ? "Setting up…" : "Try demo data"}
                </PillButton>
              </div>
            </div>
          )
        )}
        <Field label="API URL" hint="Production is https://coreapi.pexcard.com/v4. Use the sandbox URL while testing.">
          <input style={inputStyle} value={form.url} disabled={!isAdmin} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        </Field>
        <Field label="API token" hint={s?.token ? `Saved (${s.token}). Paste a new one to replace it.` : "Not set yet."}>
          <input style={inputStyle} type="password" autoComplete="off" value={form.token} disabled={!isAdmin} placeholder={s?.token ?? "Paste the PEX API token"} onChange={(e) => setForm({ ...form, token: e.target.value })} />
        </Field>
        <Field label="Webhook shared secret" hint={s?.webhookSecret ? `Saved (${s.webhookSecret}).` : "From PEX API Support. Needed before turning on webhooks."}>
          <input style={inputStyle} type="password" autoComplete="off" value={form.webhookSecret} disabled={!isAdmin} placeholder={s?.webhookSecret ?? "Shared secret"} onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })} />
        </Field>
        <Field label="Grant tag ID (optional)" hint="A PEX text tag to write the grant code(s) back to once a transaction is coded. Leave blank to skip.">
          <input style={inputStyle} value={form.tagId} disabled={!isAdmin} onChange={(e) => setForm({ ...form, tagId: e.target.value })} />
        </Field>
        <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: "rgba(22,48,43,0.04)", color: dim }}>
          <b style={{ color: ink }}>Webhook URL</b> for PEX → Business Settings → Developer Tools (use it for every event):
          <div className="mt-1 break-all" style={{ fontFamily: "'IBM Plex Mono', monospace", color: ink }}>
            {webhookUrl}
          </div>
        </div>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <PillButton onClick={save} disabled={!!busy}>
              {busy === "save" ? "Saving…" : "Save"}
            </PillButton>
          )}
          <PillButton variant="ghost" onClick={test} disabled={!!busy}>
            {busy === "test" ? "Testing…" : "Test connection"}
          </PillButton>
          <PillButton variant="ghost" onClick={sync} disabled={!!busy}>
            {busy === "sync" ? "Syncing…" : "Sync now"}
          </PillButton>
        </div>
        {!isAdmin && (
          <p className="text-xs" style={{ color: faint }}>
            Only a Grant Management admin can change these settings.
          </p>
        )}
        <p className="text-xs" style={{ color: faint }}>
          The portal reads from PEX and can tag transactions. It never funds, zeroes or changes cards. That stays in PEX.
        </p>
      </div>
    </Card>
  );
}
