import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { SyncStatus } from "../ui";
import { card, dim, emerald, faint, gold, ink, line, relTime, rose } from "../style";
import { loadLastSync } from "../data";

export const dynamic = "force-dynamic";

const INACTIVE_DAYS = 60;

type Sku = { sku_id: string; sku_part_number: string; friendly_name: string; enabled_units: number; consumed_units: number; includes_intune: boolean; includes_entra_p1: boolean };
type DirUser = { entra_user_id: string; upn: string; display_name: string | null; account_enabled: boolean | null; sku_ids: string[]; has_intune: boolean; last_sign_in: string | null };

export default async function LicensesPage() {
  const admin = createAdminClient();
  const [{ data: skuData }, run] = await Promise.all([admin.from("it_license_skus").select("*").order("friendly_name"), loadLastSync()]);
  const skus = ((skuData ?? []) as Sku[]).filter((s) => s.enabled_units > 0 || s.consumed_units > 0);

  const users: DirUser[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("it_directory_users")
      .select("entra_user_id, upn, display_name, account_enabled, sku_ids, has_intune, last_sign_in")
      .range(from, from + 999);
    users.push(...((data ?? []) as DirUser[]));
    if (!data || data.length < 1000) break;
  }

  const devices: { owner_entra_user_id: string | null; owner_upn: string | null; coverage: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("it_devices").select("owner_entra_user_id, owner_upn, coverage").is("removed_at", null).in("coverage", ["unlicensed", "registered", "licensed_not_enrolled"]).range(from, from + 999);
    devices.push(...((data ?? []) as typeof devices));
    if (!data || data.length < 1000) break;
  }

  const skuName = new Map(skus.map((s) => [s.sku_id, s.friendly_name]));
  const intuneSkus = skus.filter((s) => s.includes_intune);
  const haveSignIns = users.some((u) => u.last_sign_in);
  const cutoff = Date.now() - INACTIVE_DAYS * 86_400_000;

  // E3/E5-type seats on people who haven't signed in for 60+ days (or whose account is off).
  const idleIntune = users
    .filter((u) => u.has_intune && (u.account_enabled === false || (haveSignIns && (!u.last_sign_in || new Date(u.last_sign_in).getTime() < cutoff))))
    .sort((a, b) => (a.last_sign_in ?? "").localeCompare(b.last_sign_in ?? ""));

  // People on a non-Intune license who have a company (joined) device.
  const devCountByUser = new Map<string, number>();
  // Computers (joined, or registered-only Windows/Mac) whose owner has no Intune license.
  const intuneUser = new Set(users.filter((u) => u.has_intune).flatMap((u) => [u.entra_user_id, u.upn.toLowerCase()]));
  for (const d of devices) {
    if (d.coverage === "licensed_not_enrolled") continue;
    if ((d.owner_entra_user_id && intuneUser.has(d.owner_entra_user_id)) || intuneUser.has((d.owner_upn ?? "").toLowerCase())) continue;
    if (!d.owner_entra_user_id && !d.owner_upn) continue;
    const k = d.owner_entra_user_id ?? (d.owner_upn ?? "").toLowerCase();
    devCountByUser.set(k, (devCountByUser.get(k) ?? 0) + 1);
  }
  const needIntune = users
    .filter((u) => devCountByUser.has(u.entra_user_id) || devCountByUser.has(u.upn.toLowerCase()))
    .map((u) => ({ ...u, devices: devCountByUser.get(u.entra_user_id) ?? devCountByUser.get(u.upn.toLowerCase()) ?? 0 }))
    .sort((a, b) => b.devices - a.devices || (a.display_name ?? "").localeCompare(b.display_name ?? ""));

  const unused = skus.filter((s) => s.enabled_units - s.consumed_units > 0 && !/free|trial/i.test(s.friendly_name ?? ""));
  // People = enabled accounts holding at least one license (skips shared
  // mailboxes, guests and disabled leavers).
  const people = users.filter((u) => u.account_enabled !== false && u.sku_ids.length > 0);
  const licensedIntune = people.filter((u) => u.has_intune).length;

  const th = "px-4 py-2.5 font-semibold text-left";
  const td = "px-4 py-2.5";

  return (
    <div className="max-w-6xl">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}>Licenses</h1>
      <p className="text-sm mt-1 mb-2" style={{ color: dim }}>
        What ICNA Relief pays for in Microsoft 365, who has Intune, and where seats could be put to better use.
      </p>
      <SyncStatus run={run} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-6">
        {[
          { n: licensedIntune, label: "People licensed for Intune", hint: intuneSkus.map((s) => s.friendly_name).join(", ") || "E3 / E5 / Business Premium", color: emerald },
          { n: people.length - licensedIntune, label: "People without Intune", hint: "Can't have managed devices yet", color: rose },
          { n: needIntune.length, label: "Unlicensed people with a company device", hint: "Upgrade candidates", color: gold },
          { n: unused.reduce((s, x) => s + (x.enabled_units - x.consumed_units), 0), label: "Unused paid seats", hint: unused.map((s) => s.friendly_name).join(", ") || "None", color: ink },
        ].map((t) => (
          <div key={t.label} className="p-3.5" style={card}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 500, color: t.color, lineHeight: 1 }}>{t.n}</div>
            <div className="text-xs font-bold mt-1.5" style={{ color: ink }}>
              {t.label}
            </div>
            <div className="text-[11px] truncate" style={{ color: faint }} title={t.hint}>
              {t.hint}
            </div>
          </div>
        ))}
      </div>

      <section className="mb-8" style={{ ...card, overflow: "hidden" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr className="text-xs" style={{ background: "rgba(22,48,43,0.03)", color: dim }}>
                <th className={th}>License</th>
                <th className={`${th} text-right`}>Purchased</th>
                <th className={`${th} text-right`}>Assigned</th>
                <th className={`${th} text-right`}>Unused</th>
                <th className={th}>Includes</th>
              </tr>
            </thead>
            <tbody>
              {skus.map((s) => {
                const free = s.enabled_units - s.consumed_units;
                return (
                  <tr key={s.sku_id} style={{ borderTop: `1px solid ${line}` }}>
                    <td className={td}>
                      <div className="font-bold" style={{ color: ink }}>
                        {s.friendly_name}
                      </div>
                      <div className="text-[11px]" style={{ color: faint }}>
                        {s.sku_part_number}
                      </div>
                    </td>
                    <td className={`${td} text-right`}>{s.enabled_units.toLocaleString()}</td>
                    <td className={`${td} text-right`}>{s.consumed_units.toLocaleString()}</td>
                    <td className={`${td} text-right font-bold`} style={{ color: free > 0 ? gold : faint }}>
                      {free > 0 ? free.toLocaleString() : "0"}
                    </td>
                    <td className={`${td} text-xs`}>
                      {[s.includes_intune && "Intune", s.includes_entra_p1 && "Entra ID P1"].filter(Boolean).join(" · ") || <span style={{ color: faint }}>—</span>}
                    </td>
                  </tr>
                );
              })}
              {skus.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center" style={{ color: dim }}>
                    No license data yet. Run a sync from the Devices tab.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-5">
        <section className="p-5" style={card}>
          <div className="text-sm font-bold" style={{ color: ink }}>
            Intune-licensed but inactive · {idleIntune.length}
          </div>
          <p className="text-xs mt-1 mb-3" style={{ color: dim }}>
            {haveSignIns
              ? `E3/E5-type seats held by people who haven't signed in for ${INACTIVE_DAYS}+ days, or whose account is disabled. Reassign these to staff with company laptops.`
              : "Needs the AuditLog.Read.All permission to see sign-in dates. Disabled accounts are listed meanwhile."}
          </p>
          <PeopleList rows={idleIntune.map((u) => ({ id: u.entra_user_id, name: u.display_name ?? u.upn, sub: `${u.sku_ids.map((s) => skuName.get(s) ?? "").filter(Boolean).join(", ")} · ${u.account_enabled === false ? "account disabled" : `last sign-in ${relTime(u.last_sign_in)}`}` }))} />
        </section>

        <section className="p-5" style={card}>
          <div className="text-sm font-bold" style={{ color: ink }}>
            Company device, no Intune license · {needIntune.length}
          </div>
          <p className="text-xs mt-1 mb-3" style={{ color: dim }}>
            These people use an ICNA computer (joined or registered-only) but have a license without Intune (Business Basic/Standard). Give them Intune Plan 1, Business Premium, or a freed-up E3.
          </p>
          <PeopleList
            rows={needIntune.map((u) => ({
              id: u.entra_user_id,
              name: u.display_name ?? u.upn,
              sub: `${u.sku_ids.map((s) => skuName.get(s) ?? "").filter(Boolean).join(", ") || "No license"} · ${u.devices} device${u.devices === 1 ? "" : "s"}`,
              href: `/admin/devices?q=${encodeURIComponent(u.upn)}`,
            }))}
          />
        </section>
      </div>
    </div>
  );
}

function PeopleList({ rows }: { rows: { id: string; name: string; sub: string; href?: string }[] }) {
  if (!rows.length)
    return (
      <p className="text-sm" style={{ color: faint }}>
        Nobody right now.
      </p>
    );
  return (
    <div className="grid gap-1.5 max-h-[420px] overflow-y-auto pr-1">
      {rows.slice(0, 300).map((r) => (
        <div key={r.id} className="text-sm pb-1.5" style={{ borderBottom: `1px solid ${line}` }}>
          {r.href ? (
            <Link href={r.href} className="font-semibold hover:underline" style={{ color: ink }}>
              {r.name}
            </Link>
          ) : (
            <span className="font-semibold" style={{ color: ink }}>
              {r.name}
            </span>
          )}
          <div className="text-xs" style={{ color: dim }}>
            {r.sub}
          </div>
        </div>
      ))}
    </div>
  );
}
