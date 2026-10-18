// Yearly goals & budgets (insights_targets) and how actuals are measured
// against them. Shared by Admin → Goals & Budgets, Insights and the office
// dashboard so every screen agrees on the numbers.

export type TargetMetric = "fundraising" | "value_of_services" | "people_served" | "budget";
export type TargetScope = "org" | "region" | "state" | "office";

export const TARGET_METRICS: { key: TargetMetric; label: string; short: string; unit: "money" | "count"; actualLabel: string; help: string }[] = [
  { key: "fundraising", label: "Fundraising goal", short: "Fundraising", unit: "money", actualLabel: "raised", help: "Donations, grants, cash/checks and in-kind received" },
  { key: "value_of_services", label: "Value of services goal", short: "Value of services", unit: "money", actualLabel: "delivered", help: "Food distributed + program services + financial assistance" },
  { key: "people_served", label: "Individuals served goal", short: "People served", unit: "count", actualLabel: "served", help: "Individuals reached across programs" },
  { key: "budget", label: "Annual budget", short: "Budget", unit: "money", actualLabel: "spent", help: "Spending = finance tickets paid, by billing office" },
];

export const SERVICE_METRICS = ["food_value", "services_value", "financial_assistance"];
export const RAISED_METRICS = ["revenue", "grants", "cash_received", "inkind_value"];

export type Fact = { o: string | null; p: string; m: string; v: number };
export type OfficeMeta = { id: string; region: string | null; state: string | null };
export type Actuals = Record<TargetMetric, number>;
export const emptyActuals = (): Actuals => ({ fundraising: 0, value_of_services: 0, people_served: 0, budget: 0 });

// Actuals keyed "org:", "region:<R>", "state:<S>", "office:<id>"
export function computeActuals(facts: Fact[], offices: OfficeMeta[], spendByOffice: Record<string, number>) {
  const byId = new Map(offices.map((o) => [o.id, o]));
  const out = new Map<string, Actuals>();
  const bump = (key: string, metric: TargetMetric, v: number) => {
    const a = out.get(key) ?? emptyActuals();
    a[metric] += v;
    out.set(key, a);
  };
  const keysFor = (officeId: string | null) => {
    const o = officeId ? byId.get(officeId) : null;
    const keys = ["org:"];
    if (o) {
      keys.push(`office:${o.id}`);
      if (o.region) keys.push(`region:${o.region}`);
      if (o.state) keys.push(`state:${o.state}`);
    }
    return keys;
  };
  for (const f of facts) {
    const v = Number(f.v) || 0;
    const metric: TargetMetric | null = SERVICE_METRICS.includes(f.m) ? "value_of_services" : RAISED_METRICS.includes(f.m) ? "fundraising" : f.m === "people_served" ? "people_served" : null;
    if (!metric) continue;
    for (const k of keysFor(f.o)) bump(k, metric, v);
  }
  for (const [officeId, v] of Object.entries(spendByOffice)) for (const k of keysFor(officeId || null)) bump(k, "budget", Number(v) || 0);
  return out;
}

export type Target = { year: number; scope: TargetScope; scope_key: string; metric: TargetMetric; amount: number; note?: string | null };
export const targetKey = (scope: string, key: string) => `${scope}:${scope === "org" ? "" : key}`;
