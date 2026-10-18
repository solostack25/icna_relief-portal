import { createAdminClient } from "@/lib/supabase/server";
import { loadTargetsWithActuals } from "@/lib/insightsTargetsServer";
import { RAISED_METRICS, SERVICE_METRICS } from "@/lib/insightsTargets";
import type { Chart, Kpi, Matrix, MatrixRow, ReportPayload, Unit } from "./catalog";
import { REPORT } from "./catalog";

// Builds every report on the Reports hub from portal data. Each builder gets
// the same filter context and returns the shared ReportPayload shape, so one
// client view renders them all.

type Office = { id: string; name: string; region: string; state: string };
export type Ctx = {
  year: number;
  month: number | null;
  region: string | null;
  state: string | null;
  office: string | null;
  program: string | null;
  lockedRegion: string | null;
  lockedOffice: string | null;
};
type Env = Ctx & {
  admin: ReturnType<typeof createAdminClient>;
  offices: Office[];
  officeById: Map<string, Office>;
  houstonId: string | null;
  from: string; // current period
  to: string;
  compFrom: string; // 3-year comparison window
  inScope: (officeId: string | null | undefined) => boolean;
  inPeriod: (date: string | null | undefined) => boolean;
  years: number[];
};

export const REGION_ORDER = ["DMV", "MIDWEST 1", "MIDWEST 2", "NORTHEAST", "SOUTH CENTRAL", "SOUTHEAST", "WEST"];
export const PROGRAMS = ["Back2School", "Disaster Relief", "Health Services", "Hunger Prevention", "Muslim Family Services", "Refugee Services", "Transitional Housing", "Outreach", "General"];
const n = (v: unknown) => (typeof v === "boolean" ? (v ? 1 : 0) : Number(v) || 0);
const pad = (m: number) => String(m).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

function programOf(p: string | null | undefined): string {
  const s = (p ?? "").toLowerCase();
  if (!s.trim()) return "General";
  if (s.includes("hunger")) return "Hunger Prevention";
  if (s.includes("refugee") || s.startsWith("rsce")) return "Refugee Services";
  if (s.includes("school") || s.includes("b2s") || s.includes("back2")) return "Back2School";
  if (s.includes("disaster")) return "Disaster Relief";
  if (s.includes("fate") || s.includes("muslim family") || s.includes("counsel")) return "Muslim Family Services";
  if (s.includes("health") || s.includes("helath")) return "Health Services";
  if (s.includes("transitional")) return "Transitional Housing";
  if (s.includes("outreach")) return "Outreach";
  return "General";
}

async function pageAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let f = 0; f < 200000; f += 1000) {
    const { data, error } = await q(f, f + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

async function makeEnv(ctx: Ctx): Promise<Env> {
  const admin = createAdminClient();
  const { data: offices } = await admin.from("b2s_offices").select("id, field_office, region, state");
  const list: Office[] = (offices ?? []).map((o: any) => ({ id: o.id, name: o.field_office ?? "—", region: o.region ?? "UNASSIGNED", state: o.state ?? "" }));
  const officeById = new Map(list.map((o) => [o.id, o]));
  const region = ctx.lockedRegion ?? ctx.region;
  const office = ctx.lockedOffice ?? ctx.office;
  const from = ctx.month ? `${ctx.year}-${pad(ctx.month)}-01` : `${ctx.year}-01-01`;
  const to = ctx.month ? `${ctx.year}-${pad(ctx.month)}-${lastDay(ctx.year, ctx.month)}` : `${ctx.year}-12-31`;
  return {
    ...ctx,
    region,
    office,
    admin,
    offices: list,
    officeById,
    houstonId: list.find((o) => o.name === "Houston Office")?.id ?? null,
    from,
    to,
    compFrom: `${ctx.year - 2}-01-01`,
    years: [ctx.year - 2, ctx.year - 1, ctx.year],
    inScope: (id) => {
      const o = id ? officeById.get(id) : undefined;
      if (office) return id === office;
      if (ctx.state && o?.state !== ctx.state) return false;
      if (region && o?.region !== region) return false;
      return true;
    },
    inPeriod: (d) => !!d && d.slice(0, 10) >= from && d.slice(0, 10) <= to,
  };
}

// ─── Shared shapes ──────────────────────────────────────────────────────────
type Cols = { key: string; label: string; unit: Unit }[];
type ByOffice = Map<string, Record<string, number>>; // "" = no office

function bump(map: ByOffice, officeId: string | null | undefined, values: Record<string, number>) {
  const k = officeId ?? "";
  const row = map.get(k) ?? {};
  for (const [c, v] of Object.entries(values)) row[c] = (row[c] ?? 0) + (Number(v) || 0);
  map.set(k, row);
}

function regionMatrix(env: Env, title: string, columns: Cols, byOffice: ByOffice, opts: { note?: string; derive?: (row: Record<string, number | null>) => Record<string, number | null> } = {}): Matrix {
  const derive = opts.derive ?? ((r) => r);
  const regions = new Map<string, MatrixRow>();
  const total: Record<string, number> = {};
  const order = [...REGION_ORDER, "UNASSIGNED"];
  for (const [oid, vals] of byOffice) {
    const o = oid ? env.officeById.get(oid) : undefined;
    const reg = o?.region && o.region !== "UNASSIGNED" ? o.region : "UNASSIGNED";
    const row = regions.get(reg) ?? { key: reg, label: reg, values: {}, children: [] };
    for (const c of columns) {
      row.values[c.key] = (Number(row.values[c.key]) || 0) + (vals[c.key] ?? 0);
      total[c.key] = (total[c.key] ?? 0) + (vals[c.key] ?? 0);
    }
    row.children!.push({ key: oid || "none", label: o ? `${o.name}${o.state ? ` (${o.state})` : ""}` : "No office recorded", values: derive({ ...vals }) });
    regions.set(reg, row);
  }
  // show every region in scope even with no data
  for (const r of REGION_ORDER) if (!regions.has(r) && (!env.region || env.region === r) && !env.office && !env.state) regions.set(r, { key: r, label: r, values: {}, children: [] });
  const rows = [...regions.values()]
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
    .map((r) => ({ ...r, values: derive(r.values), children: r.children!.sort((a, b) => a.label.localeCompare(b.label)) }));
  return { title, dim: "Region", columns, rows, total: derive(total), note: opts.note };
}

function monthsChart(env: Env, title: string, unit: Unit, points: { date: string | null | undefined; value: number }[], note?: string): Chart {
  const data = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, ...Object.fromEntries(env.years.map((y) => [String(y), 0])) })) as any[];
  for (const p of points) {
    if (!p.date) continue;
    const y = Number(p.date.slice(0, 4));
    const m = Number(p.date.slice(5, 7));
    if (!env.years.includes(y) || !(m >= 1 && m <= 12)) continue;
    data[m - 1][String(y)] += Number(p.value) || 0;
  }
  const series = env.years.map(String).filter((y) => data.some((d) => d[y]));
  return { kind: "months", title, unit, series: series.length ? series : [String(env.year)], data, note };
}

function share(title: string, unit: Unit, entries: Iterable<[string, number]>, note?: string): Chart {
  const items = [...entries].filter(([, v]) => v > 0).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  return { kind: "share", title, unit, items, note };
}

function sumBy<T>(rows: T[], key: (r: T) => string, val: (r: T) => number) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + val(r));
  return m;
}

const ym = (y: number, m: number) => `${y}-${pad(m)}-01`;
const asOf = () => new Date().toISOString().slice(0, 10);

// insights_facts: one row per (date, office, program, metric, value)
async function loadFacts(env: Env, opts: { programs?: string[]; metrics?: string[]; from?: string }) {
  return pageAll<any>((f, t) => {
    let q = env.admin.from("insights_facts").select("fact_date, office_id, program, metric, value").gte("fact_date", opts.from ?? env.compFrom).lte("fact_date", env.to.slice(0, 4) + "-12-31");
    if (opts.programs?.length) q = q.in("program", opts.programs);
    if (opts.metrics?.length) q = q.in("metric", opts.metrics);
    return q.range(f, t);
  });
}

// ─── Builders ───────────────────────────────────────────────────────────────
type Builder = (env: Env) => Promise<Omit<ReportPayload, "key" | "title" | "asOf">>;

const back2school: Builder = async (env) => {
  const [subs, acts, clientDist] = await Promise.all([
    pageAll<any>((f, t) => env.admin.from("b2s_submissions").select("*").gte("year", env.year - 2).lte("year", env.year).neq("status", "rejected").range(f, t)),
    pageAll<any>((f, t) => env.admin.from("b2s_program_activities").select("*").gte("year", env.year - 2).lte("year", env.year).neq("status", "rejected").range(f, t)),
    pageAll<any>((f, t) => env.admin.from("b2s_client_distributions").select("backpacks_distributed, distributed_at, clients:client_id(office_id)").gte("distributed_at", env.compFrom).range(f, t)),
  ]);
  const inP = (r: any) => r.year === env.year && (!env.month || r.month === env.month) && env.inScope(r.office_id);
  const cur = subs.filter(inP);
  const curActs = acts.filter(inP);
  const dist: ByOffice = new Map();
  const value: ByOffice = new Map();
  const locations = new Map<string, Set<string>>();
  for (const s of cur) {
    const bp = n(s.elementary_backpacks) + n(s.middle_backpacks) + n(s.high_backpacks);
    bump(dist, s.office_id, { backpacks: bp, events: 1, households: n(s.households_served), officials: n(s.elected_officials_attended) });
    const loc = (s.event_location_name || s.event_street_address || s.distribution_city || "").trim().toLowerCase();
    if (loc) {
      const set = locations.get(s.office_id ?? "") ?? new Set();
      set.add(loc);
      locations.set(s.office_id ?? "", set);
    }
    bump(value, s.office_id, { backpack_value: n(s.value_of_backpacks), sfa: n(s.sfa_amount_disbursed), empower: n(s.empower_amount_disbursed), partner: n(s.partner_scholarship_funding_disbursed) || n(s.partner_scholarship_funding) });
  }
  for (const a of curActs) bump(value, a.office_id, { sfa: n(a.sfa_amount_disbursed), empower: n(a.empower_amount_disbursed), partner: n(a.partner_scholarship_funding_disbursed) || n(a.partner_scholarship_funding) });
  for (const d of clientDist) {
    const oid = d.clients?.office_id ?? null;
    if (env.inPeriod(d.distributed_at) && env.inScope(oid)) bump(dist, oid, { backpacks: n(d.backpacks_distributed), client_backpacks: n(d.backpacks_distributed) });
  }
  for (const [oid, set] of locations) bump(dist, oid || null, { locations: set.size });
  for (const [oid, v] of value) value.set(oid, { ...v, total: (v.backpack_value ?? 0) + (v.sfa ?? 0) + (v.empower ?? 0) + (v.partner ?? 0) });

  const all = [...cur, ...curActs];
  const sum = (rows: any[], f: (r: any) => number) => rows.reduce((s, r) => s + f(r), 0);
  const cash = sum(all, (r) => n(r.cash_donations));
  const inkind = sum(all, (r) => n(r.in_kind_donation_value));
  const totalValue = [...value.values()].reduce((s, v) => s + (v.total ?? 0), 0);
  const sessions = sum(all, (r) => n(r.workshop_conducted) + n(r.webinar_conducted));
  const attendees = sum(all, (r) => n(r.workshop_attendees) + n(r.webinar_attendees));
  const race: [string, number][] = [
    ["Afghan", sum(cur, (r) => n(r.race_afghan))],
    ["Arab / Middle Eastern", sum(cur, (r) => n(r.race_arab_middle_eastern))],
    ["Asian", sum(cur, (r) => n(r.race_asian))],
    ["Black / African American", sum(cur, (r) => n(r.race_black_african_american))],
    ["Hispanic / Latino", sum(cur, (r) => n(r.race_hispanic_latino))],
    ["Native American / Pacific Islander", sum(cur, (r) => n(r.race_native_american_pacific_islander))],
    ["Ukrainian", sum(cur, (r) => n(r.race_ukrainian))],
    ["White / Caucasian", sum(cur, (r) => n(r.race_white_caucasian))],
    ["Other", sum(cur, (r) => n(r.race_other))],
    ["Unknown", sum(cur, (r) => n(r.race_unknown))],
  ];
  return {
    notes: ["Backpacks include monthly office reports plus backpacks handed out from client profiles."],
    kpis: [
      { label: "Backpacks distributed", value: [...dist.values()].reduce((s, v) => s + (v.backpacks ?? 0), 0), unit: "count" },
      { label: "Webinars / trainings / workshops", value: sessions, unit: "count" },
      { label: "Attendees / views", value: attendees, unit: "count" },
      { label: "Total donations raised", value: cash + inkind, unit: "money", sub: "cash + in-kind" },
      { label: "Cash donations", value: cash, unit: "money" },
      { label: "In-kind donation value", value: inkind, unit: "money" },
    ],
    matrices: [
      regionMatrix(env, "Backpack distributions", [
        { key: "backpacks", label: "Backpacks distributed", unit: "count" },
        { key: "events", label: "Distribution events", unit: "count" },
        { key: "locations", label: "Distribution locations", unit: "count" },
        { key: "households", label: "Households served", unit: "count" },
        { key: "officials", label: "Office holders participated", unit: "count" },
      ], dist),
      regionMatrix(env, "Value of services provided", [
        { key: "backpack_value", label: "Value of backpacks distributed", unit: "money" },
        { key: "sfa", label: "SFA amount disbursed", unit: "money" },
        { key: "empower", label: "Empower grant amount disbursed", unit: "money" },
        { key: "partner", label: "Partner scholarship funding", unit: "money" },
        { key: "total", label: "Total value of services", unit: "money" },
      ], value),
    ],
    charts: [
      { kind: "value-addition", title: "Value addition", raised: cash + inkind, services: totalValue },
      share("Clients by race / ethnicity", "count", race),
      share("Clients by annual income", "count", [
        ["$0 – $19,999", sum(cur, (r) => n(r.income_0_19999))],
        ["$20,000 – $39,999", sum(cur, (r) => n(r.income_20000_39999))],
        ["$40,000+", sum(cur, (r) => n(r.income_40000_plus))],
        ["Unknown", sum(cur, (r) => n(r.income_unknown))],
      ]),
      share("Students by gender", "count", [
        ["Boys", sum(cur, (r) => n(r.elementary_boys) + n(r.middle_boys) + n(r.high_boys))],
        ["Girls", sum(cur, (r) => n(r.elementary_girls) + n(r.middle_girls) + n(r.high_girls))],
      ]),
      share("Students by grade", "count", [
        ["Elementary", sum(cur, (r) => n(r.elementary_backpacks))],
        ["Middle school", sum(cur, (r) => n(r.middle_backpacks))],
        ["High school", sum(cur, (r) => n(r.high_backpacks))],
      ]),
      monthsChart(env, "Backpacks by month", "count", subs.filter((s) => env.inScope(s.office_id)).map((s) => ({ date: ym(s.year, s.month), value: n(s.elementary_backpacks) + n(s.middle_backpacks) + n(s.high_backpacks) }))),
    ],
  };
};

const disasterRelief: Builder = async (env) => {
  const rows = await pageAll<any>((f, t) => env.admin.from("drs_submissions").select("*").gte("year", env.year - 2).lte("year", env.year).neq("status", "rejected").range(f, t));
  const cur = rows.filter((r) => r.year === env.year && (!env.month || r.month === env.month) && env.inScope(r.office_id));
  const act: ByOffice = new Map();
  const val: ByOffice = new Map();
  for (const r of cur) {
    bump(act, r.office_id, { activities: n(r.activity_occurred), individuals: n(r.individuals_served), households: n(r.households_served), volunteers: n(r.volunteers_engaged), vol_hours: n(r.volunteer_hours), staff: n(r.staff_engaged), staff_hours: n(r.staff_hours) });
    bump(val, r.office_id, { inkind: n(r.in_kind_value), receipts: n(r.receipts_value), services: n(r.value_of_services) });
  }
  const t = (k: string, m: ByOffice) => [...m.values()].reduce((s, v) => s + (v[k] ?? 0), 0);
  return {
    notes: cur.length ? [] : ["No Disaster Relief monthly reports have been submitted for this period yet."],
    kpis: [
      { label: "Responses / activities", value: t("activities", act), unit: "count" },
      { label: "Individuals served", value: t("individuals", act), unit: "count" },
      { label: "Households served", value: t("households", act), unit: "count" },
      { label: "Volunteers engaged", value: t("volunteers", act), unit: "count" },
      { label: "Volunteer hours", value: t("vol_hours", act), unit: "hours" },
      { label: "Value of services", value: t("services", val), unit: "money" },
    ],
    matrices: [
      regionMatrix(env, "Activities & people", [
        { key: "activities", label: "Activities", unit: "count" },
        { key: "individuals", label: "Individuals served", unit: "count" },
        { key: "households", label: "Households served", unit: "count" },
        { key: "volunteers", label: "Volunteers", unit: "count" },
        { key: "vol_hours", label: "Volunteer hours", unit: "hours" },
        { key: "staff", label: "Staff engaged", unit: "count" },
        { key: "staff_hours", label: "Staff hours", unit: "hours" },
      ], act),
      regionMatrix(env, "Value", [
        { key: "inkind", label: "In-kind value", unit: "money" },
        { key: "receipts", label: "Receipts (cash)", unit: "money" },
        { key: "services", label: "Value of services", unit: "money" },
      ], val),
    ],
    charts: [
      { kind: "value-addition", title: "Value addition", raised: t("inkind", val) + t("receipts", val), services: t("services", val) },
      share("Value of services by activity type", "money", sumBy(cur, (r) => r.activity_type || "Not specified", (r) => n(r.value_of_services))),
      monthsChart(env, "Individuals served by month", "count", rows.filter((r) => env.inScope(r.office_id)).map((r) => ({ date: ym(r.year, r.month), value: n(r.individuals_served) }))),
    ],
  };
};

const fate: Builder = async (env) => {
  const rows = await pageAll<any>((f, t) => env.admin.from("fate_submissions").select("*").gte("year", env.year - 2).lte("year", env.year).neq("status", "rejected").range(f, t));
  const cur = rows.filter((r) => r.year === env.year && (!env.month || r.month === env.month) && env.inScope(r.office_id));
  const ppl: ByOffice = new Map();
  const val: ByOffice = new Map();
  for (const r of cur) {
    bump(ppl, r.office_id, {
      inquiries: n(r.new_inquiries),
      families: n(r.families_served_new) + n(r.families_served_ongoing),
      children: n(r.children_served_new) + n(r.children_served_ongoing),
      people: n(r.people_served_new) + n(r.people_served_ongoing),
      consult_hours: n(r.consultation_hours),
      referrals: n(r.referrals_count),
      workshops: n(r.workshops_events),
      attendees: n(r.workshop_attendees),
    });
    bump(val, r.office_id, {
      consult: n(r.consultation_value),
      referrals_value: n(r.referrals_value),
      other: n(r.other_assistance_value) + n(r.outgoing_donation_value),
      pro: n(r.professional_volunteering_value),
      total: n(r.consultation_value) + n(r.referrals_value) + n(r.other_assistance_value) + n(r.outgoing_donation_value) + n(r.professional_volunteering_value),
    });
  }
  const sum = (f: (r: any) => number) => cur.reduce((s, r) => s + f(r), 0);
  return {
    notes: cur.length ? [] : ["No FATE / Muslim Family Services monthly reports have been submitted for this period yet."],
    kpis: [
      { label: "People served", value: sum((r) => n(r.people_served_new) + n(r.people_served_ongoing)), unit: "count" },
      { label: "Families served", value: sum((r) => n(r.families_served_new) + n(r.families_served_ongoing)), unit: "count" },
      { label: "New inquiries", value: sum((r) => n(r.new_inquiries)), unit: "count" },
      { label: "Licensed Muslim foster families", value: sum((r) => n(r.licensed_muslim_foster_families)), unit: "count" },
      { label: "Certified CASAs", value: sum((r) => n(r.certified_casas)), unit: "count" },
      { label: "Volunteer hours", value: sum((r) => n(r.volunteer_hours) + n(r.professional_volunteer_hours)), unit: "hours" },
    ],
    matrices: [
      regionMatrix(env, "People & activity", [
        { key: "inquiries", label: "New inquiries", unit: "count" },
        { key: "families", label: "Families", unit: "count" },
        { key: "children", label: "Children", unit: "count" },
        { key: "people", label: "People served", unit: "count" },
        { key: "consult_hours", label: "Consultation hrs", unit: "hours" },
        { key: "referrals", label: "Referrals", unit: "count" },
        { key: "workshops", label: "Workshops / events", unit: "count" },
        { key: "attendees", label: "Attendees", unit: "count" },
      ], ppl),
      regionMatrix(env, "Value of services", [
        { key: "consult", label: "Consultations", unit: "money" },
        { key: "referrals_value", label: "Referrals", unit: "money" },
        { key: "other", label: "Other assistance", unit: "money" },
        { key: "pro", label: "Professional volunteering", unit: "money" },
        { key: "total", label: "Total", unit: "money" },
      ], val),
    ],
    charts: [
      { kind: "value-addition", title: "Value addition", raised: sum((r) => n(r.cash_donation) + n(r.in_kind_donation)), services: [...val.values()].reduce((s, v) => s + (v.total ?? 0), 0) },
      monthsChart(env, "People served by month", "count", rows.filter((r) => env.inScope(r.office_id)).map((r) => ({ date: ym(r.year, r.month), value: n(r.people_served_new) + n(r.people_served_ongoing) }))),
    ],
  };
};

const hunger: Builder = async (env) => {
  const facts = await loadFacts(env, { programs: ["Hunger Prevention"] });
  const scoped = facts.filter((f) => env.inScope(f.office_id));
  const cur = scoped.filter((f) => env.inPeriod(f.fact_date));
  const by: ByOffice = new Map();
  for (const f of cur) bump(by, f.office_id, { [f.metric]: n(f.value) });
  const t = (k: string) => cur.filter((f) => f.metric === k).reduce((s, f) => s + n(f.value), 0);
  return {
    notes: ["Includes client food distributions, Orlando live distributions, bulk food drives and completed pickups. Food is valued at the national price list."],
    kpis: [
      { label: "Individuals served", value: t("people_served"), unit: "count" },
      { label: "Food distributions", value: t("food_distributions"), unit: "count" },
      { label: "Pickups completed", value: t("pickups"), unit: "count" },
      { label: "Food distributed", value: t("food_lbs"), unit: "lbs" },
      { label: "Value of food distributed", value: t("food_value"), unit: "money" },
      { label: "In-kind received", value: t("inkind_value"), unit: "money", sub: "Hunger Prevention donations" },
    ],
    matrices: [
      regionMatrix(env, "Hunger Prevention by region", [
        { key: "people_served", label: "Individuals served", unit: "count" },
        { key: "food_distributions", label: "Distributions", unit: "count" },
        { key: "pickups", label: "Pickups", unit: "count" },
        { key: "food_lbs", label: "Food (lbs)", unit: "lbs" },
        { key: "food_value", label: "Food value", unit: "money" },
        { key: "inkind_value", label: "In-kind received", unit: "money" },
        { key: "volunteer_hours", label: "Volunteer hours", unit: "hours" },
      ], by),
    ],
    charts: [
      { kind: "value-addition", title: "Value addition", raised: t("inkind_value") + t("grants") + t("cash_received"), services: t("food_value") },
      monthsChart(env, "Food value by month", "money", scoped.filter((f) => f.metric === "food_value").map((f) => ({ date: f.fact_date, value: n(f.value) }))),
      monthsChart(env, "Individuals served by month", "count", scoped.filter((f) => f.metric === "people_served").map((f) => ({ date: f.fact_date, value: n(f.value) }))),
    ],
  };
};

const refugee: Builder = async (env) => {
  const [services, cases, facts] = await Promise.all([
    pageAll<any>((f, t) => env.admin.from("rsce_services").select("office_id, service_name, delivered_on, value, beneficiaries").gte("delivered_on", env.compFrom).range(f, t)),
    pageAll<any>((f, t) => env.admin.from("rsce_cases").select("office_id, status, opened_on, closed_on").range(f, t)),
    loadFacts(env, { programs: ["Refugee Services"], metrics: ["inkind_value", "grants", "people_served", "services_value", "bulk_distributions"] }),
  ]);
  const curS = services.filter((s) => env.inPeriod(s.delivered_on) && env.inScope(s.office_id));
  const by: ByOffice = new Map();
  for (const s of curS) bump(by, s.office_id, { services: 1, beneficiaries: n(s.beneficiaries), value: n(s.value) });
  for (const c of cases) if (env.inScope(c.office_id)) bump(by, c.office_id, { open_cases: c.status === "open" ? 1 : 0, new_cases: env.inPeriod(c.opened_on) ? 1 : 0 });
  const curF = facts.filter((f) => env.inScope(f.office_id) && env.inPeriod(f.fact_date));
  for (const f of curF) if (f.metric === "inkind_value" || f.metric === "bulk_distributions") bump(by, f.office_id, { [f.metric]: n(f.value) });
  const tf = (k: string) => curF.filter((f) => f.metric === k).reduce((s, f) => s + n(f.value), 0);
  const t = (k: string) => [...by.values()].reduce((s, v) => s + (v[k] ?? 0), 0);
  return {
    notes: ["Services are the case services logged on client profiles; bulk distributions and in-kind come from their own screens."],
    kpis: [
      { label: "Services delivered", value: t("services"), unit: "count" },
      { label: "Beneficiaries", value: t("beneficiaries"), unit: "count" },
      { label: "Value of services", value: tf("services_value"), unit: "money", sub: "case services + bulk" },
      { label: "Open cases", value: t("open_cases"), unit: "count" },
      { label: "New cases this period", value: t("new_cases"), unit: "count" },
      { label: "In-kind received", value: tf("inkind_value"), unit: "money" },
    ],
    matrices: [
      regionMatrix(env, "Refugee Services by region", [
        { key: "services", label: "Services", unit: "count" },
        { key: "beneficiaries", label: "Beneficiaries", unit: "count" },
        { key: "value", label: "Case service value", unit: "money" },
        { key: "open_cases", label: "Open cases", unit: "count" },
        { key: "new_cases", label: "New cases", unit: "count" },
        { key: "bulk_distributions", label: "Bulk distributions", unit: "count" },
        { key: "inkind_value", label: "In-kind received", unit: "money" },
      ], by),
    ],
    charts: [
      { kind: "value-addition", title: "Value addition", raised: tf("inkind_value") + tf("grants"), services: tf("services_value") },
      share("Value by service type", "money", sumBy(curS, (s) => s.service_name || "Other", (s) => n(s.value))),
      monthsChart(env, "Value of services by month", "money", facts.filter((f) => env.inScope(f.office_id) && f.metric === "services_value").map((f) => ({ date: f.fact_date, value: n(f.value) }))),
    ],
  };
};

const housing: Builder = async (env) => {
  const [stays, beds, houses] = await Promise.all([
    pageAll<any>((f, t) => env.admin.from("th_stays").select("bed_id, move_in_date, vacated_at, status, vacated_reason").range(f, t)),
    env.admin.from("th_beds").select("id, house_id, is_active"),
    env.admin.from("th_houses").select("id, office_id, name"),
  ]);
  const houseOf = new Map<string, string>((beds.data ?? []).map((b: any) => [b.id, b.house_id]));
  const officeOfHouse = new Map<string, string>((houses.data ?? []).map((h: any) => [h.id, h.office_id]));
  const officeOfBed = (bid: string): string | null => officeOfHouse.get(houseOf.get(bid) ?? "") ?? null;
  const by: ByOffice = new Map();
  for (const b of beds.data ?? []) if ((b as any).is_active && env.inScope(officeOfBed((b as any).id))) bump(by, officeOfBed((b as any).id), { beds: 1 });
  const fromT = new Date(env.from).getTime();
  const toT = new Date(env.to).getTime() + 86400000;
  for (const s of stays) {
    const oid = officeOfBed(s.bed_id);
    if (!env.inScope(oid)) continue;
    const start = new Date(s.move_in_date).getTime();
    const end = s.vacated_at ? new Date(s.vacated_at).getTime() : Date.now();
    const nights = Math.max(0, Math.round((Math.min(end, toT) - Math.max(start, fromT)) / 86400000));
    bump(by, oid, { admissions: env.inPeriod(s.move_in_date) ? 1 : 0, exits: env.inPeriod(s.vacated_at) ? 1 : 0, active: s.status === "active" ? 1 : 0, nights });
  }
  const t = (k: string) => [...by.values()].reduce((s, v) => s + (v[k] ?? 0), 0);
  return {
    notes: [],
    kpis: [
      { label: "Residents now", value: t("active"), unit: "count" },
      { label: "Active beds", value: t("beds"), unit: "count" },
      { label: "Admissions", value: t("admissions"), unit: "count" },
      { label: "Exits", value: t("exits"), unit: "count" },
      { label: "Bed-nights", value: t("nights"), unit: "count" },
      { label: "Occupancy now", value: t("beds") ? Math.round((t("active") / t("beds")) * 100) : null, unit: "pct" },
    ],
    matrices: [
      regionMatrix(env, "Transitional Housing by region", [
        { key: "beds", label: "Active beds", unit: "count" },
        { key: "active", label: "Residents now", unit: "count" },
        { key: "admissions", label: "Admissions", unit: "count" },
        { key: "exits", label: "Exits", unit: "count" },
        { key: "nights", label: "Bed-nights", unit: "count" },
      ], by),
    ],
    charts: [
      share("Exits by reason", "count", sumBy(stays.filter((s) => env.inPeriod(s.vacated_at) && env.inScope(officeOfBed(s.bed_id))), (s) => s.vacated_reason || "Not recorded", () => 1)),
      monthsChart(env, "Admissions by month", "count", stays.filter((s) => env.inScope(officeOfBed(s.bed_id))).map((s) => ({ date: s.move_in_date, value: 1 }))),
    ],
  };
};

// Program with no activity records of its own (Health Services, Outreach):
// what the portal does know — grants, in-kind and volunteering for it.
const programProfile = (program: string): Builder => async (env) => {
  const facts = await loadFacts(env, { programs: [program], metrics: ["grants", "inkind_value", "volunteer_hours", "volunteer_value", "people_served", "services_value", "financial_assistance"] });
  const scoped = facts.filter((f) => env.inScope(f.office_id));
  const cur = scoped.filter((f) => env.inPeriod(f.fact_date));
  const by: ByOffice = new Map();
  for (const f of cur) bump(by, f.office_id, { [f.metric]: n(f.value) });
  const t = (k: string) => cur.filter((f) => f.metric === k).reduce((s, f) => s + n(f.value), 0);
  return {
    notes: [`The portal doesn't record ${program} activities yet, so this shows the grants, in-kind donations and volunteering tagged to ${program}.`],
    kpis: [
      { label: "Grants", value: t("grants"), unit: "money" },
      { label: "In-kind received", value: t("inkind_value"), unit: "money" },
      { label: "Volunteer hours", value: t("volunteer_hours"), unit: "hours" },
      { label: "Volunteer value", value: t("volunteer_value"), unit: "money" },
    ],
    matrices: [
      regionMatrix(env, `${program} by region`, [
        { key: "grants", label: "Grants", unit: "money" },
        { key: "inkind_value", label: "In-kind", unit: "money" },
        { key: "volunteer_hours", label: "Volunteer hours", unit: "hours" },
      ], by),
    ],
    charts: [monthsChart(env, "Grants by month", "money", scoped.filter((f) => f.metric === "grants").map((f) => ({ date: f.fact_date, value: n(f.value) })))],
  };
};

const kpisPrograms: Builder = async (env) => {
  const prevFrom = env.month ? `${env.year - 1}-${pad(env.month)}-01` : `${env.year - 1}-01-01`;
  const prevTo = env.month ? `${env.year - 1}-${pad(env.month)}-${lastDay(env.year - 1, env.month)}` : `${env.year - 1}-12-31`;
  const facts = await loadFacts(env, { from: prevFrom });
  const metrics = ["people_served", "SERVICES", "RAISED", "inkind_value", "grants", "volunteer_hours"];
  const rowFor = new Map<string, Record<string, number>>();
  for (const f of facts) {
    if (!env.inScope(f.office_id)) continue;
    const d = String(f.fact_date).slice(0, 10);
    const period = d >= env.from && d <= env.to ? "cur" : d >= prevFrom && d <= prevTo ? "prev" : null;
    if (!period) continue;
    const r = rowFor.get(f.program) ?? {};
    const keys = [f.metric, SERVICE_METRICS.includes(f.metric) ? "SERVICES" : null, RAISED_METRICS.includes(f.metric) ? "RAISED" : null].filter(Boolean) as string[];
    for (const k of keys) if (metrics.includes(k)) r[`${k}_${period}`] = (r[`${k}_${period}`] ?? 0) + n(f.value);
    rowFor.set(f.program, r);
  }
  const cols: Matrix["columns"] = [
    { key: "people_served_cur", label: "People served", unit: "count" },
    { key: "people_served_chg", label: "vs last year", unit: "pct" },
    { key: "SERVICES_cur", label: "Value of services", unit: "money" },
    { key: "SERVICES_chg", label: "vs last year", unit: "pct" },
    { key: "inkind_value_cur", label: "In-kind received", unit: "money" },
    { key: "grants_cur", label: "Grants", unit: "money" },
    { key: "volunteer_hours_cur", label: "Volunteer hours", unit: "hours" },
  ];
  const chg = (c?: number, p?: number) => (p ? ((Number(c) || 0) - p) / p * 100 : null);
  const rows: MatrixRow[] = PROGRAMS.map((p) => {
    const r = rowFor.get(p) ?? {};
    return { key: p, label: p, values: { ...r, people_served_chg: chg(r.people_served_cur, r.people_served_prev), SERVICES_chg: chg(r.SERVICES_cur, r.SERVICES_prev) } };
  });
  const total: Record<string, number | null> = {};
  for (const c of cols) if (!c.key.endsWith("_chg")) total[c.key] = rows.reduce((s, r) => s + (Number(r.values[c.key]) || 0), 0);
  return {
    notes: [`Change is against the same period in ${env.year - 1}.`],
    kpis: [
      { label: "People served", value: total.people_served_cur, unit: "count" },
      { label: "Value of services", value: total.SERVICES_cur, unit: "money" },
      { label: "In-kind received", value: total.inkind_value_cur, unit: "money" },
      { label: "Volunteer hours", value: total.volunteer_hours_cur, unit: "hours" },
    ],
    matrices: [{ title: "Programs & services", dim: "Program", columns: cols, rows, total }],
    charts: [],
  };
};

const nationalRevenue: Builder = async (env) => {
  const facts = await loadFacts(env, { metrics: ["revenue", "grants", "cash_received", "inkind_value"] });
  const scoped = facts.filter((f) => env.inScope(f.office_id));
  const cur = scoped.filter((f) => env.inPeriod(f.fact_date));
  const by: ByOffice = new Map();
  for (const f of cur) bump(by, f.office_id, { [f.metric]: n(f.value), total: n(f.value) });
  const t = (k: string) => cur.filter((f) => f.metric === k).reduce((s, f) => s + n(f.value), 0);
  const { data: hist } = await env.admin.from("insights_history").select("year, metric, value").eq("scope", "org").in("metric", ["raised", "community_revenue"]).in("year", env.years);
  return {
    notes: ["Donations come from the Salesforce nightly sync (not connected yet). Grants, cash/checks and in-kind come from the portal.", ...(hist ?? []).filter((h: any) => h.metric === "raised").map((h: any) => `${h.year} total cash + in-kind raised (imported from Power BI): $${Math.round(h.value).toLocaleString()}`)],
    kpis: [
      { label: "Total revenue", value: t("revenue") + t("grants") + t("cash_received") + t("inkind_value"), unit: "money" },
      { label: "Donations (Salesforce)", value: t("revenue"), unit: "money" },
      { label: "Grants", value: t("grants"), unit: "money" },
      { label: "Cash & checks", value: t("cash_received"), unit: "money" },
      { label: "In-kind", value: t("inkind_value"), unit: "money" },
    ],
    matrices: [
      regionMatrix(env, "Revenue by source", [
        { key: "revenue", label: "Donations", unit: "money" },
        { key: "grants", label: "Grants", unit: "money" },
        { key: "cash_received", label: "Cash & checks", unit: "money" },
        { key: "inkind_value", label: "In-kind", unit: "money" },
        { key: "total", label: "Total", unit: "money" },
      ], by),
    ],
    charts: [
      share("Revenue by source", "money", [["Donations", t("revenue")], ["Grants", t("grants")], ["Cash & checks", t("cash_received")], ["In-kind", t("inkind_value")]]),
      monthsChart(env, "Revenue by month", "money", scoped.map((f) => ({ date: f.fact_date, value: n(f.value) }))),
    ],
  };
};

const communityRevenue: Builder = async (env) => {
  const [tx, hist, { data: targets }] = await Promise.all([
    pageAll<any>((f, t) => env.admin.from("revenue_transactions").select("received_on, amount, office_id, record_type").gte("received_on", env.compFrom).range(f, t)),
    env.admin.from("insights_history").select("year, scope, scope_key, value").eq("metric", "community_revenue").in("year", env.years),
    env.admin.from("insights_targets").select("scope, scope_key, amount").eq("year", env.year).eq("metric", "fundraising"),
  ]);
  const community = tx.filter((r) => String(r.record_type ?? "").toLowerCase() !== "grant" && env.inScope(r.office_id));
  const goal = (scope: string, key: string) => (targets ?? []).find((t: any) => t.scope === scope && t.scope_key === key)?.amount ?? null;
  const yearOf = (d: string) => Number(d.slice(0, 4));
  const byRegionYear = new Map<string, Record<number, number>>();
  const byOfficeYear = new Map<string, Record<number, number>>();
  for (const r of community) {
    if (env.month && Number(r.received_on.slice(5, 7)) !== env.month) continue;
    const o = r.office_id ? env.officeById.get(r.office_id) : undefined;
    const reg = o?.region ?? "UNASSIGNED";
    const ry = byRegionYear.get(reg) ?? {};
    ry[yearOf(r.received_on)] = (ry[yearOf(r.received_on)] ?? 0) + n(r.amount);
    byRegionYear.set(reg, ry);
    const oy = byOfficeYear.get(r.office_id ?? "") ?? {};
    oy[yearOf(r.received_on)] = (oy[yearOf(r.received_on)] ?? 0) + n(r.amount);
    byOfficeYear.set(r.office_id ?? "", oy);
  }
  const histVal = (y: number, scope: string, key: string) => {
    const h = (hist.data ?? []).find((x: any) => x.year === y && x.scope === scope && x.scope_key === key);
    return h ? Number(h.value) : null;
  };
  const yCols = env.years.map((y) => ({ key: `y${y}`, label: String(y), unit: "money" as Unit }));
  const cols: Matrix["columns"] = [...yCols, { key: "goal", label: `${env.year} goal`, unit: "money" }, { key: "variance", label: `${env.year} variance`, unit: "money" }, { key: "pct", label: "% to goal", unit: "pct" }];
  const regionsShown = env.office || env.state ? [] : REGION_ORDER.filter((r) => !env.region || r === env.region).concat(env.region ? [] : ["UNASSIGNED"]);
  const rows: MatrixRow[] = regionsShown.map((r) => {
    const values: Record<string, number | null> = {};
    for (const y of env.years) values[`y${y}`] = byRegionYear.get(r)?.[y] ?? (env.month ? null : histVal(y, "region", r));
    values.goal = goal("region", r);
    const cur = Number(values[`y${env.year}`]) || 0;
    values.variance = values.goal != null ? cur - Number(values.goal) : null;
    values.pct = values.goal ? (cur / Number(values.goal)) * 100 : null;
    const children: MatrixRow[] = env.offices
      .filter((o) => o.region === r && env.inScope(o.id))
      .map((o) => {
        const v: Record<string, number | null> = {};
        for (const y of env.years) v[`y${y}`] = byOfficeYear.get(o.id)?.[y] ?? null;
        v.goal = goal("office", o.id);
        const c = Number(v[`y${env.year}`]) || 0;
        v.variance = v.goal != null ? c - Number(v.goal) : null;
        v.pct = v.goal ? (c / Number(v.goal)) * 100 : null;
        return { key: o.id, label: `${o.name} (${o.state})`, values: v };
      })
      .filter((c) => Object.values(c.values).some((x) => x != null));
    return { key: r, label: r, values, children };
  });
  const total: Record<string, number | null> = {};
  for (const y of env.years) total[`y${y}`] = rows.reduce((s, r) => s + (Number(r.values[`y${y}`]) || 0), 0) || (env.month ? null : histVal(y, "org", ""));
  total.goal = env.region ? goal("region", env.region) : goal("org", "");
  const tc = Number(total[`y${env.year}`]) || 0;
  total.variance = total.goal != null ? tc - Number(total.goal) : null;
  total.pct = total.goal ? (tc / Number(total.goal)) * 100 : null;

  const officeGoals = env.offices
    .filter((o) => env.inScope(o.id))
    .map((o) => ({ state: o.state, office: o.name, goal: goal("office", o.id), revenue: byOfficeYear.get(o.id)?.[env.year] ?? 0 }))
    .sort((a, b) => a.state.localeCompare(b.state) || a.office.localeCompare(b.office));
  const top = [...officeGoals].filter((o) => o.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 7);
  return {
    notes: [
      "Community revenue = Salesforce donations excluding grants. Current-year donations appear once the Salesforce sync is connected; 2024 and 2025 region totals are imported from Power BI.",
      ...(officeGoals.some((o) => o.goal == null) ? ["Some offices have no goal yet — set them on Admin → Goals & Budgets."] : []),
    ],
    kpis: [
      { label: `${env.year} community revenue`, value: tc, unit: "money" },
      { label: `${env.year} goal`, value: total.goal, unit: "money" },
      { label: "% to goal", value: total.pct, unit: "pct" },
      { label: `${env.year - 1} community revenue`, value: total[`y${env.year - 1}`], unit: "money" },
    ],
    matrices: [{ title: "Community revenue by region", dim: "Region", columns: cols, rows, total }],
    charts: [
      { kind: "table", title: `${env.year} goals by field office`, columns: [{ key: "state", label: "State" }, { key: "office", label: "Field office" }, { key: "goal", label: `${env.year} goal`, unit: "money" }, { key: "revenue", label: "Revenue", unit: "money" }], rows: officeGoals },
      { kind: "table", title: "Top 7 offices by revenue", columns: [{ key: "office", label: "Field office" }, { key: "revenue", label: "Revenue", unit: "money" }], rows: top, note: top.length ? undefined : "No donations synced yet" },
      monthsChart(env, "Year & month comparison", "money", community.map((r) => ({ date: r.received_on, value: n(r.amount) })), "Monthly detail starts when Salesforce donations sync; earlier years only have annual totals."),
    ],
  };
};

const grantsRevenue: Builder = async (env) => {
  const rows = await pageAll<any>((f, t) => env.admin.from("grants").select("title, funder_name, program, office_id, region, amount, fiscal_year, received_date").eq("stream", "grant").gte("fiscal_year", env.year - 2).range(f, t));
  const dated = rows.map((g) => ({ ...g, date: g.received_date ?? (g.fiscal_year ? `${g.fiscal_year}-01-01` : null), prog: programOf(g.program) }));
  const inScope = (g: any) => (g.office_id ? env.inScope(g.office_id) : !env.office && !env.state && (!env.region || (g.region ?? "").toUpperCase() === env.region)) && (!env.program || g.prog === env.program);
  const scoped = dated.filter(inScope);
  const cur = scoped.filter((g) => env.inPeriod(g.date));
  const by: ByOffice = new Map();
  for (const g of scoped) {
    const y = Number(String(g.date).slice(0, 4));
    if (env.month && Number(String(g.date).slice(5, 7)) !== env.month) continue;
    if (!env.years.includes(y)) continue;
    // grants with only a region roll up to that region's "No office recorded" row
    const key = g.office_id ?? (g.region ? `region:${String(g.region).toUpperCase()}` : null);
    bump(by, key, { [`y${y}`]: n(g.amount), ...(y === env.year ? { count: 1 } : {}) });
  }
  // map region-only keys onto pseudo offices so regionMatrix places them
  for (const k of [...by.keys()]) {
    if (k.startsWith("region:")) {
      const reg = k.slice(7);
      env.officeById.set(k, { id: k, name: `${reg} — no office`, region: reg, state: "" });
    }
  }
  const t = cur.reduce((s, g) => s + n(g.amount), 0);
  const funders = [...sumBy(cur, (g) => g.funder_name || "Unknown funder", (g) => n(g.amount)).entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  return {
    programs: PROGRAMS,
    notes: ["Grants entered on Admin → Grants, by received date (or fiscal year when there's no date)."],
    kpis: [
      { label: `${env.year} grants`, value: t, unit: "money" },
      { label: "Number of grants", value: cur.length, unit: "count" },
      { label: "Average grant", value: cur.length ? t / cur.length : null, unit: "money" },
      { label: `${env.year - 1} grants`, value: scoped.filter((g) => String(g.date).startsWith(String(env.year - 1)) && (!env.month || Number(String(g.date).slice(5, 7)) === env.month)).reduce((s, g) => s + n(g.amount), 0), unit: "money" },
    ],
    matrices: [regionMatrix(env, "Grants by region", [...env.years.map((y) => ({ key: `y${y}`, label: String(y), unit: "money" as Unit })), { key: "count", label: `${env.year} count`, unit: "count" }], by)],
    charts: [
      share("By program", "money", sumBy(cur, (g) => g.prog, (g) => n(g.amount))),
      { kind: "table", title: "Top funders", columns: [{ key: "funder", label: "Funder" }, { key: "amount", label: "Amount", unit: "money" }], rows: funders.map(([funder, amount]) => ({ funder, amount })) },
      monthsChart(env, "Grants by month", "money", scoped.filter((g) => g.received_date).map((g) => ({ date: g.received_date, value: n(g.amount) })), "Grants without a received date are counted in January of their fiscal year."),
    ],
  };
};

const inKind: Builder = async (env) => {
  const rows = await pageAll<any>((f, t) =>
    env.admin.from("donations").select("qty, unit_price, is_manual_price, program, sessions!inner(status, date_received, office_id)").eq("sessions.status", "completed").gte("sessions.date_received", env.compFrom).range(f, t)
  );
  const items = rows.map((d) => ({
    date: d.sessions?.date_received as string,
    office: (d.sessions?.office_id as string) ?? env.houstonId,
    program: programOf(d.program),
    value: d.is_manual_price ? n(d.unit_price) : n(d.unit_price) * n(d.qty),
  }));
  const scoped = items.filter((i) => env.inScope(i.office) && (!env.program || i.program === env.program));
  const cur = scoped.filter((i) => env.inPeriod(i.date));
  const by: ByOffice = new Map();
  for (const i of cur) bump(by, i.office, { [i.program]: i.value, total: i.value });
  const byRegion = sumBy(cur, (i) => env.officeById.get(i.office ?? "")?.region ?? "UNASSIGNED", (i) => i.value);
  const t = cur.reduce((s, i) => s + i.value, 0);
  return {
    programs: PROGRAMS,
    notes: ["Donations logged at in-kind intake stations, valued at the price list. Older sessions without an office are credited to Houston."],
    kpis: [
      { label: "In-kind value", value: t, unit: "money" },
      { label: "Items logged", value: cur.length, unit: "count" },
      { label: `${env.year - 1} in-kind`, value: scoped.filter((i) => i.date?.startsWith(String(env.year - 1))).reduce((s, i) => s + i.value, 0), unit: "money" },
    ],
    matrices: [regionMatrix(env, "In-kind donations by region and program", [...PROGRAMS.filter((p) => p !== "Outreach").map((p) => ({ key: p, label: p, unit: "money" as Unit })), { key: "total", label: "Total", unit: "money" }], by)],
    charts: [
      share("In-kind donations by program", "money", sumBy(cur, (i) => i.program, (i) => i.value)),
      share("In-kind donations by region", "money", byRegion),
      monthsChart(env, "Value of in-kind donations by month", "money", scoped.map((i) => ({ date: i.date, value: i.value }))),
    ],
  };
};

const irfas: Builder = async (env) => {
  const rows = await pageAll<any>((f, t) => env.admin.from("zakat_applications").select("office_id, status, category, program, amount_requested, amount_approved, submitted_at, decided_at, paid_at, voided_at, funding_source").gte("created_at", env.compFrom).range(f, t));
  const scoped = rows.filter((r) => env.inScope(r.office_id) && !r.voided_at);
  const cur = scoped.filter((r) => env.inPeriod(r.submitted_at ?? r.decided_at));
  const by: ByOffice = new Map();
  for (const r of cur) {
    const approved = ["approved", "paid"].includes(r.status);
    bump(by, r.office_id, {
      apps: 1,
      approved: approved ? 1 : 0,
      paid: r.status === "paid" ? 1 : 0,
      requested: n(r.amount_requested),
      approved_amt: approved ? n(r.amount_approved ?? r.amount_requested) : 0,
      paid_amt: r.status === "paid" ? n(r.amount_approved ?? r.amount_requested) : 0,
    });
  }
  const t = (k: string) => [...by.values()].reduce((s, v) => s + (v[k] ?? 0), 0);
  return {
    notes: ["Voided applications are excluded. Amounts use the approved amount when set."],
    kpis: [
      { label: "Applications", value: t("apps"), unit: "count" },
      { label: "Approved", value: t("approved"), unit: "count" },
      { label: "Approved amount", value: t("approved_amt"), unit: "money" },
      { label: "Paid", value: t("paid_amt"), unit: "money" },
      { label: "Average award", value: t("approved") ? t("approved_amt") / t("approved") : null, unit: "money" },
      { label: "Approval rate", value: t("apps") ? (t("approved") / t("apps")) * 100 : null, unit: "pct" },
    ],
    matrices: [
      regionMatrix(env, "IRFAS by region", [
        { key: "apps", label: "Applications", unit: "count" },
        { key: "approved", label: "Approved", unit: "count" },
        { key: "paid", label: "Paid", unit: "count" },
        { key: "requested", label: "Requested", unit: "money" },
        { key: "approved_amt", label: "Approved", unit: "money" },
        { key: "paid_amt", label: "Paid", unit: "money" },
      ], by),
    ],
    charts: [
      share("Approved amount by category", "money", sumBy(cur.filter((r) => ["approved", "paid"].includes(r.status)), (r) => r.category || "Uncategorized", (r) => n(r.amount_approved ?? r.amount_requested))),
      share("Applications by status", "count", sumBy(cur, (r) => String(r.status).replace(/^\w/, (c: string) => c.toUpperCase()), () => 1)),
      monthsChart(env, "Approved amount by month", "money", scoped.filter((r) => ["approved", "paid"].includes(r.status)).map((r) => ({ date: r.decided_at, value: n(r.amount_approved ?? r.amount_requested) }))),
    ],
  };
};

const volunteering: Builder = async (env) => {
  const [hours, hist] = await Promise.all([
    pageAll<any>((f, t) => env.admin.from("volunteer_hours").select("volunteer_id, office_id, event_title, program, service_date, hours, value, checked_out_at").gte("service_date", env.compFrom).not("checked_out_at", "is", null).range(f, t)),
    env.admin.from("insights_history").select("year, scope, scope_key, metric, value").in("metric", ["volunteers", "volunteer_hours"]).eq("year", env.year),
  ]);
  const scoped = hours.filter((h) => env.inScope(h.office_id) && (!env.program || programOf(h.program) === env.program));
  const cur = scoped.filter((h) => env.inPeriod(h.service_date));
  const by: ByOffice = new Map();
  const ids = new Map<string, Set<string>>();
  for (const h of cur) {
    bump(by, h.office_id, { engagements: 1, hours: n(h.hours), value: n(h.value) });
    const s = ids.get(h.office_id ?? "") ?? new Set();
    s.add(h.volunteer_id);
    ids.set(h.office_id ?? "", s);
  }
  for (const [oid, s] of ids) bump(by, oid || null, { volunteers: s.size });
  const t = (k: string) => [...by.values()].reduce((s, v) => s + (v[k] ?? 0), 0);
  const histRows = (hist.data ?? []) as any[];
  const notes = ["Volunteers check in and out on their phones at each event (Volunteer events)."];
  let matrices: Matrix[] = [
    regionMatrix(env, "Volunteering by region", [
      { key: "volunteers", label: "Unique volunteers", unit: "count" },
      { key: "engagements", label: "Engagements", unit: "count" },
      { key: "hours", label: "Hours", unit: "hours" },
      { key: "value", label: "Value", unit: "money" },
    ], by),
  ];
  const kpis: Kpi[] = [
    { label: "Unique volunteers", value: new Set(cur.map((h) => h.volunteer_id)).size, unit: "count" },
    { label: "Engagements", value: t("engagements"), unit: "count" },
    { label: "Volunteer hours", value: t("hours"), unit: "hours" },
    { label: "Value of volunteer time", value: t("value"), unit: "money" },
  ];
  if (!cur.length && histRows.length && !env.month) {
    notes.push(`${env.year} totals imported from the Master Cleaner volunteer export / Power BI.`);
    const regionRows: MatrixRow[] = REGION_ORDER.filter((r) => !env.region || r === env.region).map((r) => ({
      key: r,
      label: r,
      values: {
        engagements: histRows.find((h) => h.scope === "region" && h.scope_key === r && h.metric === "volunteers")?.value ?? null,
        hours: histRows.find((h) => h.scope === "region" && h.scope_key === r && h.metric === "volunteer_hours")?.value ?? null,
      },
      children: env.offices
        .filter((o) => o.region === r)
        .map((o) => o.state)
        .filter((s, i, a) => s && a.indexOf(s) === i)
        .map((s) => ({
          key: s,
          label: s,
          values: {
            engagements: histRows.find((h) => h.scope === "state" && h.scope_key === s && h.metric === "volunteers")?.value ?? null,
            hours: histRows.find((h) => h.scope === "state" && h.scope_key === s && h.metric === "volunteer_hours")?.value ?? null,
          },
        }))
        .filter((c) => c.values.engagements != null),
    }));
    matrices = [{ title: `Volunteering by region (${env.year}, imported)`, dim: "Region", columns: [{ key: "engagements", label: "Volunteers engaged", unit: "count" }, { key: "hours", label: "Hours", unit: "hours" }], rows: regionRows, total: { engagements: histRows.find((h) => h.scope === "org" && h.metric === "volunteers")?.value ?? null, hours: histRows.find((h) => h.scope === "org" && h.metric === "volunteer_hours")?.value ?? null } }];
    kpis[1].value = matrices[0].total!.engagements as number;
    kpis[2].value = matrices[0].total!.hours as number;
    kpis[0].value = null;
    kpis[3].value = null;
  }
  const events = [...sumBy(cur, (h) => h.event_title || "Event", (h) => n(h.hours)).entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  return {
    programs: PROGRAMS,
    notes,
    kpis,
    matrices,
    charts: [
      share("Hours by program", "hours", sumBy(cur, (h) => programOf(h.program), (h) => n(h.hours))),
      { kind: "table", title: "Top events by hours", columns: [{ key: "event", label: "Event" }, { key: "hours", label: "Hours", unit: "hours" }], rows: events.map(([event, h]) => ({ event, hours: h })) },
      monthsChart(env, "Volunteer hours by month", "hours", scoped.map((h) => ({ date: h.service_date, value: n(h.hours) }))),
    ],
  };
};

const calling: Builder = async (env) => {
  const [outcomes, campaigns, emps] = await Promise.all([
    pageAll<any>((f, t) => env.admin.from("donor_call_outcomes").select("campaign_id, caller_employee_id, disposition, pledge_amount, called_at").gte("called_at", env.compFrom).range(f, t)),
    env.admin.from("donor_call_campaigns").select("id, name, status"),
    env.admin.from("employees").select("id, first_name, last_name"),
  ]);
  const cur = outcomes.filter((o) => env.inPeriod(o.called_at));
  const camp = new Map<string, string>((campaigns.data ?? []).map((c: any) => [c.id, c.name]));
  const emp = new Map<string, string>((emps.data ?? []).map((e: any) => [e.id, `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim()]));
  const reached = (d: string) => ["reached", "pledge", "callback_requested", "declined"].includes(d);
  const group = (key: (o: any) => string) => {
    const m = new Map<string, { calls: number; reached: number; pledges: number; amount: number }>();
    for (const o of cur) {
      const k = key(o);
      const r = m.get(k) ?? { calls: 0, reached: 0, pledges: 0, amount: 0 };
      r.calls++;
      if (reached(o.disposition)) r.reached++;
      if (o.disposition === "pledge") r.pledges++;
      r.amount += n(o.pledge_amount);
      m.set(k, r);
    }
    return [...m.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.amount - a.amount || b.calls - a.calls);
  };
  const tot = group(() => "all")[0] ?? { calls: 0, reached: 0, pledges: 0, amount: 0 };
  return {
    notes: ["From Marketing → Donor Calling. Pledges are what donors committed on the call."],
    kpis: [
      { label: "Calls made", value: tot.calls, unit: "count" },
      { label: "Donors reached", value: tot.reached, unit: "count" },
      { label: "Pledges", value: tot.pledges, unit: "count" },
      { label: "Pledged", value: tot.amount, unit: "money" },
      { label: "Reach rate", value: tot.calls ? (tot.reached / tot.calls) * 100 : null, unit: "pct" },
    ],
    matrices: [],
    charts: [
      { kind: "table", title: "By campaign", columns: [{ key: "label", label: "Campaign" }, { key: "calls", label: "Calls", unit: "count" }, { key: "reached", label: "Reached", unit: "count" }, { key: "pledges", label: "Pledges", unit: "count" }, { key: "amount", label: "Pledged", unit: "money" }], rows: group((o) => camp.get(o.campaign_id) ?? "No campaign") },
      { kind: "table", title: "By caller", columns: [{ key: "label", label: "Caller" }, { key: "calls", label: "Calls", unit: "count" }, { key: "reached", label: "Reached", unit: "count" }, { key: "pledges", label: "Pledges", unit: "count" }, { key: "amount", label: "Pledged", unit: "money" }], rows: group((o) => emp.get(o.caller_employee_id) || "Unknown") },
      share("Call outcomes", "count", sumBy(cur, (o) => String(o.disposition ?? "unknown").replace(/_/g, " "), () => 1)),
      monthsChart(env, "Pledged by month", "money", outcomes.map((o) => ({ date: o.called_at, value: n(o.pledge_amount) }))),
    ],
  };
};

const ramadan: Builder = async (env) => {
  const tx = await pageAll<any>((f, t) => env.admin.from("revenue_transactions").select("received_on, amount, office_id, campaign_name").ilike("campaign_name", "%ramadan%").gte("received_on", env.compFrom).range(f, t));
  const scoped = tx.filter((r) => env.inScope(r.office_id));
  const cur = scoped.filter((r) => env.inPeriod(r.received_on));
  const by: ByOffice = new Map();
  for (const r of cur) bump(by, r.office_id, { amount: n(r.amount), gifts: 1 });
  return {
    notes: ["Ramadan revenue = Salesforce donations whose campaign name contains “Ramadan”. This fills in once the Salesforce sync is connected."],
    kpis: [
      { label: "Ramadan donations", value: cur.reduce((s, r) => s + n(r.amount), 0), unit: "money" },
      { label: "Gifts", value: cur.length, unit: "count" },
    ],
    matrices: [regionMatrix(env, "Ramadan donations by region", [{ key: "amount", label: "Donations", unit: "money" }, { key: "gifts", label: "Gifts", unit: "count" }], by)],
    charts: [share("By campaign", "money", sumBy(cur, (r) => r.campaign_name, (r) => n(r.amount))), monthsChart(env, "Ramadan donations by month", "money", scoped.map((r) => ({ date: r.received_on, value: n(r.amount) })))],
  };
};

const officeRankings: Builder = async (env) => {
  const [facts, spend, { data: targets }] = await Promise.all([
    loadFacts(env, { from: env.from }),
    pageAll<any>((f, t) => env.admin.from("finance_tickets").select("billing_office_id, total, technician_ended_at").eq("status", "processed").gte("technician_ended_at", env.from).lte("technician_ended_at", `${env.to}T23:59:59`).range(f, t)),
    env.admin.from("insights_targets").select("scope_key, metric, amount").eq("year", env.year).eq("scope", "office"),
  ]);
  const by = new Map<string, Record<string, number>>();
  for (const f of facts) {
    if (!f.office_id || !env.inScope(f.office_id) || !env.inPeriod(f.fact_date)) continue;
    const r = by.get(f.office_id) ?? {};
    const v = n(f.value);
    if (SERVICE_METRICS.includes(f.metric)) r.services = (r.services ?? 0) + v;
    if (RAISED_METRICS.includes(f.metric)) r.raised = (r.raised ?? 0) + v;
    if (f.metric === "people_served") r.people = (r.people ?? 0) + v;
    if (f.metric === "inkind_value") r.inkind = (r.inkind ?? 0) + v;
    if (f.metric === "volunteer_hours") r.vol = (r.vol ?? 0) + v;
    by.set(f.office_id, r);
  }
  for (const s of spend) if (s.billing_office_id && env.inScope(s.billing_office_id)) {
    const r = by.get(s.billing_office_id) ?? {};
    r.spent = (r.spent ?? 0) + n(s.total);
    by.set(s.billing_office_id, r);
  }
  const goal = (oid: string) => (targets ?? []).find((t: any) => t.scope_key === oid && t.metric === "fundraising")?.amount;
  const rows = env.offices
    .filter((o) => o.region !== "UNASSIGNED" && env.inScope(o.id))
    .map((o) => {
      const r = by.get(o.id) ?? {};
      const g = goal(o.id);
      return { office: o.name, region: o.region, state: o.state, services: r.services ?? 0, people: r.people ?? 0, raised: r.raised ?? 0, inkind: r.inkind ?? 0, vol: r.vol ?? 0, goal_pct: g ? ((r.raised ?? 0) / Number(g)) * 100 : null, spent: r.spent ?? 0 };
    });
  const rankBy = (k: keyof (typeof rows)[number]) => {
    const sorted = [...rows].sort((a, b) => Number(b[k] ?? -1) - Number(a[k] ?? -1));
    return new Map(sorted.map((r, i) => [r.office, i + 1]));
  };
  const rs = rankBy("services");
  const rp = rankBy("people");
  const rr = rankBy("raised");
  const ranked = rows
    .map((r) => ({ ...r, overall: Math.round(((rs.get(r.office)! + rp.get(r.office)! + rr.get(r.office)!) / 3) * 10) / 10 }))
    .sort((a, b) => a.overall - b.overall)
    .map((r, i) => ({ rank: i + 1, ...r }));
  return {
    notes: ["Overall rank averages each office's rank on value of services, people served and funds raised. % to goal uses the office's fundraising goal."],
    kpis: [
      { label: "Offices ranked", value: ranked.length, unit: "count" },
      { label: "Offices with activity", value: ranked.filter((r) => r.services || r.people || r.raised).length, unit: "count" },
    ],
    matrices: [],
    charts: [
      {
        kind: "table",
        title: "Office rankings",
        columns: [
          { key: "rank", label: "#" },
          { key: "office", label: "Office" },
          { key: "region", label: "Region" },
          { key: "services", label: "Value of services", unit: "money" },
          { key: "people", label: "People served", unit: "count" },
          { key: "raised", label: "Raised", unit: "money" },
          { key: "goal_pct", label: "% to goal", unit: "pct" },
          { key: "inkind", label: "In-kind", unit: "money" },
          { key: "vol", label: "Volunteer hrs", unit: "hours" },
          { key: "spent", label: "Spent", unit: "money" },
        ],
        rows: ranked,
      },
    ],
  };
};

const expenditure: Builder = async (env) => {
  const [tickets, { data: targets }] = await Promise.all([
    pageAll<any>((f, t) => env.admin.from("finance_tickets").select("billing_office_id, total, category, technician_ended_at").eq("status", "processed").gte("technician_ended_at", env.compFrom).range(f, t)),
    env.admin.from("insights_targets").select("scope, scope_key, amount").eq("year", env.year).eq("metric", "budget"),
  ]);
  const scoped = tickets.filter((t) => env.inScope(t.billing_office_id));
  const cur = scoped.filter((t) => env.inPeriod(t.technician_ended_at));
  const by: ByOffice = new Map();
  for (const t of cur) bump(by, t.billing_office_id, { spent: n(t.total), tickets: 1 });
  for (const t of targets ?? []) if ((t as any).scope === "office" && env.inScope((t as any).scope_key)) bump(by, (t as any).scope_key, { budget: n((t as any).amount) });
  const label = (c: string) => c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  const total = cur.reduce((s, t) => s + n(t.total), 0);
  return {
    notes: ["Spending = finance tickets marked paid, by billing office. Payroll and other accounting entries will be added when the accounting system is connected."],
    kpis: [
      { label: "Spent", value: total, unit: "money" },
      { label: "Tickets paid", value: cur.length, unit: "count" },
      { label: "Average ticket", value: cur.length ? total / cur.length : null, unit: "money" },
    ],
    matrices: [
      regionMatrix(env, "Spending by region", [
        { key: "tickets", label: "Tickets paid", unit: "count" },
        { key: "spent", label: "Spent", unit: "money" },
        { key: "budget", label: `${env.year} budget`, unit: "money" },
        { key: "pct", label: "% of budget", unit: "pct" },
      ], by, { derive: (r) => ({ ...r, pct: r.budget ? ((Number(r.spent) || 0) / Number(r.budget)) * 100 : null }) }),
    ],
    charts: [share("By category", "money", sumBy(cur, (t) => label(t.category ?? "other"), (t) => n(t.total))), monthsChart(env, "Spending by month", "money", scoped.map((t) => ({ date: t.technician_ended_at, value: n(t.total) })))],
  };
};

const kpisRegions: Builder = async (env) => {
  const { targets, actuals } = await loadTargetsWithActuals(env.year, { region: env.lockedRegion });
  const goal = (scope: string, key: string, m: string) => targets.find((t) => t.scope === scope && (scope === "org" || t.scope_key === key) && t.metric === m)?.amount ?? null;
  const vals = (scope: string, key: string) => {
    const a = actuals[`${scope}:${scope === "org" ? "" : key}`] ?? { fundraising: 0, value_of_services: 0, people_served: 0, budget: 0 };
    const out: Record<string, number | null> = {};
    for (const m of ["fundraising", "value_of_services", "people_served", "budget"] as const) {
      const g = goal(scope, key, m);
      out[`${m}_a`] = a[m];
      out[`${m}_g`] = g;
      out[`${m}_p`] = g ? (a[m] / g) * 100 : null;
    }
    return out;
  };
  const cols: Matrix["columns"] = [
    { key: "fundraising_a", label: "Raised", unit: "money" },
    { key: "fundraising_g", label: "Goal", unit: "money" },
    { key: "fundraising_p", label: "%", unit: "pct" },
    { key: "value_of_services_a", label: "Services", unit: "money" },
    { key: "value_of_services_g", label: "Goal", unit: "money" },
    { key: "value_of_services_p", label: "%", unit: "pct" },
    { key: "people_served_a", label: "People", unit: "count" },
    { key: "people_served_g", label: "Goal", unit: "count" },
    { key: "people_served_p", label: "%", unit: "pct" },
    { key: "budget_a", label: "Spent", unit: "money" },
    { key: "budget_g", label: "Budget", unit: "money" },
    { key: "budget_p", label: "%", unit: "pct" },
  ];
  const rows: MatrixRow[] = REGION_ORDER.filter((r) => !env.region || r === env.region).map((r) => ({
    key: r,
    label: r,
    values: vals("region", r),
    children: env.offices.filter((o) => o.region === r && env.inScope(o.id)).map((o) => ({ key: o.id, label: `${o.name} (${o.state})`, values: vals("office", o.id) })),
  }));
  return {
    notes: ["Goals and budgets are set on Admin → Goals & Budgets. Actuals use the same definitions as Insights; spending is finance tickets paid."],
    kpis: [],
    matrices: [{ title: `${env.year} goals & budget by region and office`, dim: "Region", columns: cols, rows, total: env.region ? undefined : vals("org", "") }],
    charts: [],
  };
};

const BUILDERS: Record<string, Builder> = {
  back2school,
  "disaster-relief": disasterRelief,
  "health-services": programProfile("Health Services"),
  "hunger-prevention": hunger,
  "muslim-family-services": fate,
  "refugee-services": refugee,
  "transitional-housing": housing,
  "kpis-programs": kpisPrograms,
  "national-revenue": nationalRevenue,
  "community-revenue": communityRevenue,
  "grants-revenue": grantsRevenue,
  "in-kind": inKind,
  irfas,
  volunteering,
  "calling-campaign": calling,
  ramadan,
  outreach: programProfile("Outreach"),
  "office-rankings": officeRankings,
  expenditure,
  "kpis-regions": kpisRegions,
};

export async function buildReport(key: string, ctx: Ctx): Promise<ReportPayload> {
  const def = REPORT.get(key);
  const builder = BUILDERS[key];
  if (!def || !builder) throw new Error("Unknown report");
  const env = await makeEnv(ctx);
  const body = await builder(env);
  return { key, title: def.title, asOf: asOf(), ...body };
}
