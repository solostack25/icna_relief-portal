import Link from "next/link";
import { createAdminClient } from "@/lib/grantManagement/server";
import { getGmViewer, loadGrantSummaries } from "@/lib/grantManagement/server";
import { fmtDate, isNearBudget, isOverBudget, isUnderspent, money, pct, type GrantSummary } from "@/lib/grantManagement/shared";
import { Card, Empty, Eyebrow, ExpenseStatusPill, GrantStatusPill, PageTitle, SpendBar, Stat, dim, emerald, faint, gold, ink, rose } from "@/components/grantManagement/ui";

export default async function GrantDashboard() {
  const viewer = (await getGmViewer())!;
  const admin = createAdminClient();
  const grants = await loadGrantSummaries(viewer, admin);
  const active = grants.filter((g) => g.status === "active");
  const setup = grants.filter((g) => g.status === "draft");

  const totalAward = sum(active, "award_amount");
  const totalBudget = sum(active, "total_budget");
  const totalSpent = sum(active, "actual");
  const totalPending = sum(active, "pending");
  const remaining = totalBudget - totalSpent;
  const pctSpent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : null;

  const ending = (d: number) => active.filter((g) => g.days_left >= 0 && g.days_left <= d);
  const over = grants.filter((g) => g.status !== "closed" && isOverBudget(g));
  const near = active.filter((g) => !isOverBudget(g) && isNearBudget(g));
  const under = active.filter(isUnderspent);
  const missingDocs = grants.reduce((s, g) => s + g.missing_docs, 0);
  const pastEnd = active.filter((g) => g.days_left < 0);

  const { data: mine } = await admin
    .from("gm_expenses")
    .select("id, expense_date, vendor, description, amount, status, review_note, grant_id")
    .eq("created_by", viewer.employeeId)
    .in("status", ["draft", "returned", "submitted", "rejected"])
    .order("updated_at", { ascending: false })
    .limit(8);
  const grantName = new Map(grants.map((g) => [g.id, g]));

  return (
    <div>
      <PageTitle eyebrow={viewer.isManager ? "Grant Management · national" : "Grant Management"} title={viewer.isManager ? "Portfolio dashboard" : "Your grants"} />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-8">
        <Stat label="Active grants" value={active.length} sub={setup.length ? `${setup.length} being set up` : undefined} href="/grant-management/tracker?status=active" />
        <Stat label="Active funding" value={money(totalAward)} sub={`Budgeted ${money(totalBudget)}`} />
        <Stat label="Spent" value={money(totalSpent)} sub={totalPending ? `+ ${money(totalPending)} pending` : "approved spending"} />
        <Stat label="Remaining" value={money(remaining)} tone={remaining < 0 ? rose : undefined} />
        <Stat label="% spent" value={pct(pctSpent)} />
        <Stat label="Missing docs" value={missingDocs} tone={missingDocs ? gold : undefined} href="/grant-management/reports?report=missing_docs" />
      </div>

      {(mine ?? []).length > 0 && (
        <section className="mb-8">
          <Eyebrow>Your expenses in progress</Eyebrow>
          <Card className="!p-0 overflow-hidden">
            {(mine ?? []).map((e) => (
              <Link key={e.id} href={`/grant-management/expenses/${e.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-[#FDFBF6]" style={{ borderBottom: "1px solid rgba(22,48,43,0.06)" }}>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: ink }}>
                    {e.vendor || e.description} · {money(e.amount, true)}
                  </div>
                  <div className="text-xs truncate" style={{ color: dim }}>
                    {grantName.get(e.grant_id)?.code} · {fmtDate(e.expense_date)}
                    {e.status === "returned" && e.review_note ? ` · "${e.review_note}"` : ""}
                  </div>
                </div>
                <ExpenseStatusPill status={e.status} />
              </Link>
            ))}
          </Card>
        </section>
      )}

      <div className="grid lg:grid-cols-3 gap-4 mb-8">
        <ExceptionCard
          title="Ending soon"
          tone={gold}
          empty="No active grants end in the next 90 days."
          tabs={[
            { label: "30 days", list: ending(30) },
            { label: "60 days", list: ending(60) },
            { label: "90 days", list: ending(90) },
          ]}
          render={(g) => `${g.days_left} days · ${pct(g.pct_spent)} spent`}
          href="/grant-management/reports?report=expiring&days=90"
        />
        <ExceptionCard
          title="Over or near budget"
          tone={rose}
          empty="Nothing over budget or above 90% spent."
          tabs={[
            { label: `Over (${over.length})`, list: over },
            { label: `90%+ (${near.length})`, list: near },
          ]}
          render={(g) => (g.actual > g.total_budget ? `${money(g.actual - g.total_budget)} over` : g.over_budget_lines ? `${g.over_budget_lines} line(s) over` : `${pct(g.pct_spent)} spent`)}
          href="/grant-management/reports?report=budget_risk"
        />
        <ExceptionCard
          title="Underspent"
          tone={"#3E7C9A"}
          empty="Every active grant is spending on pace."
          tabs={[{ label: `Behind pace (${under.length})`, list: under }]}
          render={(g) => `${pct(g.pct_spent)} spent · ${pct(g.pct_time_elapsed)} of period gone`}
          href="/grant-management/reports?report=underspent"
        />
      </div>

      {(pastEnd.length > 0 || setup.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          {pastEnd.length > 0 && (
            <Card>
              <Eyebrow color={rose}>Past end date, still open · {pastEnd.length}</Eyebrow>
              <p className="text-xs mb-3" style={{ color: dim }}>
                Finish posting, then close these out.
              </p>
              <GrantMiniList list={pastEnd} render={(g) => `Ended ${fmtDate(g.end_date)}`} />
            </Card>
          )}
          {setup.length > 0 && (
            <Card>
              <Eyebrow color={gold}>Being set up · {setup.length}</Eyebrow>
              <p className="text-xs mb-3" style={{ color: dim }}>
                Approve the budget and open these for spending.
              </p>
              <GrantMiniList list={setup} render={(g) => (g.budget_version ? "Budget approved" : "Budget not approved yet")} />
            </Card>
          )}
        </div>
      )}

      <section>
        <div className="flex items-end justify-between mb-2">
          <Eyebrow>Active grants</Eyebrow>
          <Link href="/grant-management/tracker" className="text-xs font-semibold" style={{ color: emerald }}>
            Open the tracker →
          </Link>
        </div>
        {active.length === 0 ? (
          <Empty>{viewer.isManager ? "No active grants yet. Create one from the Master Tracker." : "No active grants are assigned to your office yet."}</Empty>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {active.slice(0, 24).map((g) => (
              <Link key={g.id} href={`/grant-management/grants/${g.id}`} className="block transition-transform hover:-translate-y-0.5">
                <Card className="!p-4 h-full">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold" style={{ color: faint, fontFamily: "'IBM Plex Mono', monospace" }}>
                        {g.code}
                      </div>
                      <div className="text-sm font-bold truncate" style={{ color: ink }}>
                        {g.name}
                      </div>
                      <div className="text-xs truncate" style={{ color: dim }}>
                        {g.funder} · {g.office_name ?? g.resolved_region ?? "—"}
                      </div>
                    </div>
                    <GrantStatusPill status={g.status} />
                  </div>
                  <div className="mt-3">
                    <SpendBar pct={g.pct_spent} timePct={g.pct_time_elapsed} />
                  </div>
                  <div className="flex justify-between text-xs mt-2" style={{ color: dim }}>
                    <span>
                      {money(g.actual)} of {money(g.total_budget)}
                    </span>
                    <span>{g.days_left >= 0 ? `${g.days_left} days left` : "Ended"}</span>
                  </div>
                  {g.missing_docs > 0 && (
                    <div className="text-xs mt-1 font-semibold" style={{ color: gold }}>
                      {g.missing_docs} missing document{g.missing_docs === 1 ? "" : "s"}
                    </div>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function sum(list: GrantSummary[], k: "award_amount" | "total_budget" | "actual" | "pending") {
  return list.reduce((s, g) => s + Number(g[k] ?? 0), 0);
}

function GrantMiniList({ list, render }: { list: GrantSummary[]; render: (g: GrantSummary) => string }) {
  return (
    <div className="grid gap-1.5">
      {list.slice(0, 8).map((g) => (
        <Link key={g.id} href={`/grant-management/grants/${g.id}`} className="flex justify-between gap-3 text-sm rounded-lg px-2 py-1.5 hover:bg-[#FDFBF6]">
          <span className="truncate" style={{ color: ink }}>
            <b>{g.code}</b> · {g.name}
          </span>
          <span className="text-xs whitespace-nowrap" style={{ color: dim }}>
            {render(g)}
          </span>
        </Link>
      ))}
      {list.length > 8 && (
        <div className="text-xs px-2" style={{ color: faint }}>
          + {list.length - 8} more
        </div>
      )}
    </div>
  );
}

function ExceptionCard({
  title,
  tone,
  tabs,
  render,
  empty,
  href,
}: {
  title: string;
  tone: string;
  tabs: { label: string; list: GrantSummary[] }[];
  render: (g: GrantSummary) => string;
  empty: string;
  href: string;
}) {
  const total = tabs[tabs.length - 1].list.length;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <Eyebrow color={tone}>{title}</Eyebrow>
        <Link href={href} className="text-xs font-semibold" style={{ color: emerald }}>
          Report →
        </Link>
      </div>
      <div className="flex gap-3 text-xs mb-3" style={{ color: dim }}>
        {tabs.map((t) => (
          <span key={t.label}>
            {t.label}: <b style={{ color: ink }}>{t.list.length}</b>
          </span>
        ))}
      </div>
      {total === 0 && tabs.every((t) => t.list.length === 0) ? (
        <div className="text-sm" style={{ color: faint }}>
          {empty}
        </div>
      ) : (
        <GrantMiniList list={[...new Map(tabs.flatMap((t) => t.list).map((g) => [g.id, g])).values()]} render={render} />
      )}
    </Card>
  );
}
