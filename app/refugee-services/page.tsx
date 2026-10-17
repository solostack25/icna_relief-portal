import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRefugeeServicesAccess, RSCE_PROGRAM } from "@/lib/refugeeServicesAccess";
import BulkDistributions from "@/components/bulk/BulkDistributions";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtDate = (d: string | null) => (d ? new Date(d + "T12:00:00").toLocaleDateString() : "—");

export default async function RefugeeServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ office?: string; mine?: string }>;
}) {
  const access = await getRefugeeServicesAccess();
  if (!access.ok) redirect(access.status === 401 ? "/" : "/select-app");
  const { office: officeParam, mine } = await searchParams;
  const supabase = await createClient();

  const { data: offices } = await supabase
    .from("b2s_offices")
    .select("id, field_office, region, state")
    .eq("is_active", true)
    .order("field_office");

  // Admins can look across offices (or all); staff work their own office.
  const officeId = access.isAdmin ? officeParam ?? "" : access.officeId ?? "";
  const officeName = officeId ? offices?.find((o) => o.id === officeId)?.field_office ?? "Office" : "All offices";

  const now = new Date();
  const year = now.getFullYear();
  const monthStart = new Date(year, now.getMonth(), 1).toLocaleDateString("en-CA");
  const yearStart = `${year}-01-01`;

  let casesQ = supabase
    .from("rsce_cases")
    .select("id, client_id, case_manager_id, opened_on, arrival_date, office_id")
    .eq("status", "open");
  let servicesQ = supabase.from("rsce_services").select("client_id, delivered_on, value, beneficiaries").gte("delivered_on", yearStart);
  let bulkQ = supabase
    .from("bulk_distributions")
    .select("id, office_id, name, distributed_on, people_served, households_served, total_value, items_description, location, food, salesforce_synced, salesforce_error")
    .eq("program", RSCE_PROGRAM);
  if (officeId) {
    casesQ = casesQ.eq("office_id", officeId);
    servicesQ = servicesQ.eq("office_id", officeId);
    bulkQ = bulkQ.eq("office_id", officeId);
  }

  const [{ data: openCases }, { data: ytdServices }, { data: bulk }] = await Promise.all([
    casesQ.order("opened_on", { ascending: false }),
    servicesQ,
    bulkQ.order("distributed_on", { ascending: false }).limit(50),
  ]);

  const cases = (openCases ?? []).filter((c) => (mine ? c.case_manager_id === access.employeeId : true));
  const clientIds = [...new Set(cases.map((c) => c.client_id))];
  const managerIds = [...new Set(cases.map((c) => c.case_manager_id).filter(Boolean))];
  const [{ data: clients }, { data: managers }, { data: lastServices }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, first_name, last_name, client_number, country_of_birth")
      .in("id", clientIds.length ? clientIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase
      .from("employees")
      .select("id, first_name, last_name")
      .in("id", managerIds.length ? managerIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase
      .from("rsce_services")
      .select("client_id, delivered_on")
      .in("client_id", clientIds.length ? clientIds : ["00000000-0000-0000-0000-000000000000"])
      .order("delivered_on", { ascending: false }),
  ]);
  const clientMap = new Map((clients ?? []).map((c) => [c.id, c]));
  const managerMap = new Map((managers ?? []).map((m) => [m.id, `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim()]));
  const lastServiceMap = new Map<string, string>();
  const serviceCount = new Map<string, number>();
  for (const s of lastServices ?? []) {
    if (!lastServiceMap.has(s.client_id)) lastServiceMap.set(s.client_id, s.delivered_on);
    serviceCount.set(s.client_id, (serviceCount.get(s.client_id) ?? 0) + 1);
  }

  const services = (ytdServices ?? []) as { client_id: string; delivered_on: string; value: number; beneficiaries: number }[];
  const thisMonth = services.filter((s) => s.delivered_on >= monthStart);
  const sum = (rows: typeof services, k: "value" | "beneficiaries") => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const bulkRows = (bulk ?? []) as any[];
  const bulkYtdPeople = bulkRows.filter((b) => b.distributed_on >= yearStart).reduce((a, b) => a + (b.people_served ?? 0), 0);

  const stats = [
    { label: "Open cases", value: String((openCases ?? []).length) },
    { label: "Services this month", value: `${thisMonth.length} · ${money(sum(thisMonth, "value"))}` },
    { label: `Services ${year}`, value: `${services.length} · ${money(sum(services, "value"))}` },
    { label: `People helped ${year}`, value: `${sum(services, "beneficiaries").toLocaleString()} + ${bulkYtdPeople.toLocaleString()} bulk` },
  ];

  const link = (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { office: officeParam, mine, ...params };
    Object.entries(merged).forEach(([k, v]) => v && q.set(k, v));
    const s = q.toString();
    return `/refugee-services${s ? `?${s}` : ""}`;
  };

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-semibold">Refugee Services</h1>
            <p className="text-sm text-[var(--color-text-dim)]">Refugee Services &amp; Community Empowerment · {officeName}</p>
          </div>
          <Link href="/select-app" className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
            ← Back
          </Link>
        </div>

        {access.isAdmin && (
          <form className="mb-5 flex items-center gap-2" action="/refugee-services">
            <select name="office" defaultValue={officeId} className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm">
              <option value="">All offices</option>
              {(offices ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.field_office}</option>
              ))}
            </select>
            <button className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">View</button>
          </form>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div className="text-xs text-[var(--color-text-dim)]">{s.label}</div>
              <div className="text-base font-semibold mt-0.5">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <Link href="/clients" className="rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium px-4 py-2.5">
            Find or add a client
          </Link>
          <a
            href={`/api/refugee-services/export?year=${year}${officeId ? `&office=${officeId}` : ""}`}
            className="rounded-lg border border-[var(--color-accent)]/40 text-[var(--color-accent)] text-sm font-medium px-4 py-2.5"
          >
            Export {year} (Power BI)
          </a>
          {access.isAdmin && (
            <Link href="/refugee-services/service-types" className="rounded-lg border border-[var(--color-border)] text-sm px-4 py-2.5">
              Service types &amp; values
            </Link>
          )}
        </div>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium">Open cases ({cases.length})</h2>
            <div className="flex gap-3 text-xs">
              <Link href={link({ mine: undefined })} className={!mine ? "font-semibold text-[var(--color-accent)]" : "text-[var(--color-text-dim)]"}>
                All
              </Link>
              <Link href={link({ mine: "1" })} className={mine ? "font-semibold text-[var(--color-accent)]" : "text-[var(--color-text-dim)]"}>
                My cases
              </Link>
            </div>
          </div>
          {cases.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)]">
              No open cases. Open one from a client's profile — logging their first service opens a case automatically.
            </p>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {cases.map((c) => {
                const cl = clientMap.get(c.client_id);
                const last = lastServiceMap.get(c.client_id) ?? null;
                const stale = !last || (Date.now() - new Date(last + "T12:00:00").getTime()) / 86_400_000 > 30;
                return (
                  <Link key={c.id} href={`/clients/${c.client_id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-black/[0.02] -mx-2 px-2 rounded">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {cl ? `${cl.first_name} ${cl.last_name}` : "Client"}
                        <span className="text-xs font-normal text-[var(--color-text-dim)]"> · {cl?.client_number}</span>
                      </div>
                      <div className="text-xs text-[var(--color-text-dim)] truncate">
                        {managerMap.get(c.case_manager_id) ?? "Unassigned"}
                        {cl?.country_of_birth ? ` · ${cl.country_of_birth}` : ""}
                        {c.arrival_date ? ` · arrived ${fmtDate(c.arrival_date)}` : ""}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs">{serviceCount.get(c.client_id) ?? 0} services</div>
                      <div className={"text-[11px] " + (stale ? "text-[#B55139]" : "text-[var(--color-text-dim)]")}>
                        {last ? `last ${fmtDate(last)}` : "no services yet"}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <BulkDistributions
          program={RSCE_PROGRAM}
          defaultName="Bulk Household Items"
          rows={bulkRows.map((b) => ({ ...b, office_name: offices?.find((o) => o.id === b.office_id)?.field_office ?? "" }))}
          officeId={officeId || null}
          offices={(offices ?? []).map((o) => ({ id: o.id, name: o.field_office }))}
          employeeId={access.employeeId}
        />
      </div>
    </main>
  );
}
