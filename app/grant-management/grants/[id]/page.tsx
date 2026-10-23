import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/grantManagement/server";
import { getGmViewer, grantAccess, loadGrantSummary, loadLineSummaries, nameMap } from "@/lib/grantManagement/server";
import { getVersions } from "@/lib/grantManagement/budget";
import {
  EXPENSE_STATUS_LABELS,
  MEMBER_ROLE_LABELS,
  fmtDate,
  isUnderspent,
  lineLabel,
  money,
  pct,
  periodLabel,
  type GrantSummary,
  type LineSummary,
} from "@/lib/grantManagement/shared";
import { Card, Empty, Eyebrow, ExpenseStatusPill, ExportButtons, GrantStatusPill, Notice, Row, SpendBar } from "@/components/grantManagement/ui";
import { dim, emerald, faint, gold, ink, rose, td, tdNum, th, thNum } from "@/components/grantManagement/styles";
import GrantActions from "./GrantActions";
import TeamEditor from "./TeamEditor";
import GrantPex from "./GrantPex";

const TABS = [
  ["overview", "Budget vs. actual"],
  ["expenses", "Expenses"],
  ["budget", "Budget versions"],
  ["pex", "PEX cards"],
  ["team", "Team & rules"],
  ["history", "History"],
] as const;

export default async function GrantPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "overview";
  const viewer = (await getGmViewer())!;
  const admin = createAdminClient();
  const access = await grantAccess(viewer, id, admin);
  if (!access.canView) notFound();

  const [grant, lines, versions] = await Promise.all([
    loadGrantSummary(id, admin),
    loadLineSummaries([id], admin),
    getVersions(admin, id),
  ]);
  if (!grant) notFound();
  const { data: extra } = await admin.from("gm_grants").select("notes, created_by, closed_at, closed_by").eq("id", id).single();
  const draft = versions.find((v) => v.status === "draft");
  const activeV = versions.find((v) => v.status === "active");

  return (
    <div>
      {sp.created && (
        <div className="mb-4">
          <Notice tone="ok">Grant created. Next: approve its budget, add the team, then open it for spending.</Notice>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <Link href="/grant-management/tracker" className="text-xs print:hidden" style={{ color: faint }}>
            ← Tracker
          </Link>
          <div className="text-xs font-bold mt-2" style={{ color: faint, fontFamily: "'IBM Plex Mono', monospace" }}>
            {grant.code} · {grant.program}
          </div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0, color: ink }}>{grant.name}</h1>
          <div className="text-sm mt-1 flex flex-wrap items-center gap-2" style={{ color: dim }}>
            <span>{grant.funder}</span>·<span>{grant.office_name ?? grant.resolved_region}</span>·<span>{periodLabel(grant.start_date, grant.end_date)}</span>
            <GrantStatusPill status={grant.status} />
          </div>
        </div>
        {access.canManage && <GrantActions grantId={id} status={grant.status} hasActiveBudget={!!activeV} hasDraft={!!draft} isManager={viewer.isManager} />}
      </div>

      {grant.status === "draft" && (
        <div className="mb-4 print:hidden">
          <Notice tone="warn">
            This grant is still being set up. {activeV ? "The budget is approved — open the grant for spending when the team is in place." : draft ? "The budget is a draft — review and approve it." : "Enter the approved budget."}{" "}
            {access.canManage && (
              <Link href={`/grant-management/grants/${id}/budget`} className="font-semibold underline">
                {activeV ? "Review budget" : "Go to budget"}
              </Link>
            )}
          </Notice>
        </div>
      )}
      {grant.status === "closed" && (
        <div className="mb-4">
          <Notice>Closed {fmtDate(extra?.closed_at)}. Everything is kept for audits; no new spending can be entered.</Notice>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-5">
        <Mini label="Award" value={money(grant.award_amount)} />
        <Mini label="Budget" value={money(grant.total_budget)} sub={activeV ? `v${activeV.version_no}` : "not approved"} />
        <Mini label="Spent" value={money(grant.actual)} sub={grant.pending ? `+${money(grant.pending)} pending` : undefined} />
        <Mini label="Remaining" value={money(grant.remaining)} tone={grant.remaining < 0 ? rose : undefined} />
        <Mini label="% spent" value={pct(grant.pct_spent)} sub={`${pct(grant.pct_time_elapsed)} of period`} tone={isUnderspent(grant) ? "#3E7C9A" : undefined} />
        <Mini label="Days left" value={grant.days_left >= 0 ? String(grant.days_left) : "Ended"} sub={`Ends ${fmtDate(grant.end_date)}`} />
      </div>
      <div className="mb-6">
        <SpendBar pct={grant.pct_spent} timePct={grant.status === "active" ? grant.pct_time_elapsed : null} height={10} />
      </div>

      <nav className="flex gap-1 mb-5 overflow-x-auto print:hidden" style={{ borderBottom: "1px solid var(--portal-line)" }}>
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`/grant-management/grants/${id}?tab=${k}`}
            className="px-4 py-2.5 text-sm font-semibold whitespace-nowrap"
            style={{ color: tab === k ? emerald : dim, borderBottom: tab === k ? `2px solid ${emerald}` : "2px solid transparent", marginBottom: -1 }}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <Overview grant={grant} lines={lines} id={id} />}
      {tab === "expenses" && <Expenses id={id} status={sp.status} canEnter={access.canEnter && grant.status === "active"} />}
      {tab === "budget" && <Versions id={id} versions={versions} lines={lines} canManage={access.canManage && grant.status !== "closed"} />}
      {tab === "pex" && <GrantPex id={id} grant={grant} isManager={viewer.isManager} />}
      {tab === "team" && <Team id={id} grant={grant} canManage={access.canManage} lines={lines} notes={extra?.notes ?? null} />}
      {tab === "history" && <History id={id} />}
    </div>
  );
}

function Mini({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <Card className="!p-3">
      <div className="text-[10px] uppercase tracking-wider" style={{ color: faint, fontFamily: "'IBM Plex Mono', monospace" }}>
        {label}
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 600, color: tone ?? ink }}>{value}</div>
      {sub && (
        <div className="text-[11px]" style={{ color: dim }}>
          {sub}
        </div>
      )}
    </Card>
  );
}

function Overview({ grant, lines, id }: { grant: GrantSummary; lines: LineSummary[]; id: string }) {
  const shown = lines.filter((l) => l.is_active || l.actual || l.pending);
  if (!shown.length) return <Empty>No approved budget yet.</Empty>;
  const cats: { category: string; lines: LineSummary[] }[] = [];
  for (const l of shown) {
    const c = cats.find((x) => x.category === l.category);
    if (c) c.lines.push(l);
    else cats.push({ category: l.category, lines: [l] });
  }
  const s = (ls: LineSummary[], k: "budget" | "original_budget" | "actual" | "pending" | "remaining") => ls.reduce((t, l) => t + l[k], 0);
  const elapsed = grant.status === "active" ? grant.pct_time_elapsed : 100;
  const variance = (budget: number, actual: number) => actual - budget * (elapsed / 100);
  const Cells = ({ ls, bold }: { ls: LineSummary[]; bold?: boolean }) => {
    const b = s(ls, "budget");
    const a = s(ls, "actual");
    const p = b > 0 ? (a / b) * 100 : null;
    const v = variance(b, a);
    const st = bold ? { fontWeight: 700 } : {};
    return (
      <>
        <td style={{ ...tdNum, ...st, color: faint }}>{s(ls, "original_budget") !== b ? money(s(ls, "original_budget")) : ""}</td>
        <td style={{ ...tdNum, ...st }}>{money(b)}</td>
        <td style={{ ...tdNum, ...st }}>{money(a)}</td>
        <td style={{ ...tdNum, ...st, color: gold }}>{s(ls, "pending") ? money(s(ls, "pending")) : ""}</td>
        <td style={{ ...tdNum, ...st, color: b - a < 0 ? rose : ink }}>{money(b - a)}</td>
        <td style={{ ...tdNum, ...st, color: v > 0 ? rose : "#3E7C9A" }}>{Math.abs(v) < 0.5 ? "—" : `${v > 0 ? "+" : "-"}${money(Math.abs(v))}`}</td>
        <td style={{ ...tdNum, ...st, minWidth: 110 }}>
          <div style={{ color: p != null && p > 100 ? rose : ink }}>{pct(p)}</div>
          <div className="mt-1">
            <SpendBar pct={p} height={4} />
          </div>
        </td>
      </>
    );
  };
  return (
    <div>
      <div className="flex justify-end mb-3">
        <ExportButtons query={`report=bva&grant_id=${id}`} />
      </div>
      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={th}>Category</th>
                <th style={thNum}>Original</th>
                <th style={thNum}>Approved budget</th>
                <th style={thNum}>Actual</th>
                <th style={thNum}>Pending</th>
                <th style={thNum}>Remaining</th>
                <th style={thNum} title="Actual minus what pro-rata spending would be at this point in the grant period">
                  Variance vs. pace
                </th>
                <th style={thNum}>% spent</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => {
                const single = c.lines.length === 1 && !c.lines[0].subcategory;
                return single ? (
                  <tr key={c.category}>
                    <td style={{ ...td, fontWeight: 700 }}>{c.category}</td>
                    <Cells ls={c.lines} bold />
                  </tr>
                ) : (
                  [
                    <tr key={c.category} style={{ background: "#FDFBF6" }}>
                      <td style={{ ...td, fontWeight: 700 }}>{c.category}</td>
                      <Cells ls={c.lines} bold />
                    </tr>,
                    ...c.lines.map((l) => (
                      <tr key={l.line_id}>
                        <td style={{ ...td, paddingLeft: 28, color: l.is_active ? ink : faint }}>
                          {l.subcategory ?? "(general)"}
                          {!l.is_active && <span className="text-[11px]"> · removed in amendment</span>}
                        </td>
                        <Cells ls={[l]} />
                      </tr>
                    )),
                  ]
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: "#F3EFE4" }}>
                <td style={{ ...td, fontWeight: 800 }}>Total grant</td>
                <Cells ls={shown} bold />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <p className="text-xs mt-3" style={{ color: faint }}>
        Actual = approved expenses. Variance vs. pace compares actual spending to an even spend-down over the grant period ({pct(elapsed)} elapsed): red means ahead of pace, blue means behind.
      </p>
    </div>
  );
}

async function Expenses({ id, status, canEnter }: { id: string; status?: string; canEnter: boolean }) {
  const admin = createAdminClient();
  let q = admin
    .from("gm_expenses")
    .select("id, expense_date, vendor, description, amount, status, kind, doc_required, line_id, created_by, gm_expense_documents(id)")
    .eq("grant_id", id)
    .order("expense_date", { ascending: false })
    .limit(500);
  if (status) q = q.eq("status", status);
  const [{ data }, { data: lines }] = await Promise.all([q, admin.from("gm_budget_lines").select("id, category, subcategory").eq("grant_id", id)]);
  const lineMap = new Map((lines ?? []).map((l) => [l.id, lineLabel(l)]));
  const names = await nameMap(admin, (data ?? []).map((e) => e.created_by));
  const statuses = ["", "submitted", "approved", "returned", "rejected", "draft"];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap gap-1.5">
          {statuses.map((s) => (
            <Link key={s} href={`/grant-management/grants/${id}?tab=expenses${s ? `&status=${s}` : ""}`} className="text-xs rounded-full px-3 py-1.5 font-semibold" style={(status ?? "") === s ? { background: ink, color: "#fff" } : { background: "#fff", border: "1px solid var(--portal-line)", color: dim }}>
              {s ? EXPENSE_STATUS_LABELS[s as keyof typeof EXPENSE_STATUS_LABELS] : "All"}
            </Link>
          ))}
        </div>
        <div className="flex gap-2">
          <ExportButtons query={`report=expenses&grant_id=${id}${status ? `&status=${status}` : ""}`} print={false} />
          {canEnter && (
            <Link href={`/grant-management/expenses/new?grant=${id}`} className="inline-flex items-center rounded-full px-4 py-2.5 text-sm font-bold" style={{ background: emerald, color: "#fff" }}>
              + Add expense
            </Link>
          )}
        </div>
      </div>
      {!data?.length ? (
        <Empty>No expenses{status ? " with this status" : " yet"}.</Empty>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Vendor / description</th>
                  <th style={th}>Category</th>
                  <th style={thNum}>Amount</th>
                  <th style={th}>Docs</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((e) => {
                  const docs = e.gm_expense_documents?.length ?? 0;
                  return (
                    <tr key={e.id} className="hover:bg-[#FDFBF6]">
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(e.expense_date)}</td>
                      <td style={td}>
                        <Link href={`/grant-management/expenses/${e.id}`} className="font-semibold hover:underline" style={{ color: ink }}>
                          {e.vendor || e.description}
                        </Link>
                        <div className="text-xs" style={{ color: dim }}>
                          {e.vendor ? e.description : ""} {names.get(e.created_by) ? `· ${names.get(e.created_by)}` : ""}
                        </div>
                      </td>
                      <td style={td}>{lineMap.get(e.line_id)}</td>
                      <td style={tdNum}>{money(e.amount, true)}</td>
                      <td style={{ ...td, color: e.doc_required && !docs ? gold : dim }}>{docs ? `📎 ${docs}` : e.doc_required ? "Missing" : "n/a"}</td>
                      <td style={td}>
                        <ExpenseStatusPill status={e.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

async function Versions({ id, versions, lines, canManage }: { id: string; versions: Awaited<ReturnType<typeof getVersions>>; lines: LineSummary[]; canManage: boolean }) {
  const admin = createAdminClient();
  const names = await nameMap(admin, versions.flatMap((v) => [v.created_by, v.activated_by]));
  const label = new Map(lines.map((l) => [l.line_id, lineLabel(l)]));
  const draft = versions.find((v) => v.status === "draft");
  return (
    <div>
      {canManage && (
        <div className="flex justify-end mb-3">
          <Link href={`/grant-management/grants/${id}/budget`} className="inline-flex items-center rounded-full px-4 py-2.5 text-sm font-bold" style={{ background: emerald, color: "#fff" }}>
            {draft ? "Continue draft" : versions.length ? "Amend budget" : "Enter budget"}
          </Link>
        </div>
      )}
      {!versions.length && <Empty>No budget entered yet.</Empty>}
      <div className="grid gap-3">
        {[...versions].reverse().map((v, i, arr) => {
          const prev = arr[i + 1];
          const prevAmt = new Map((prev?.gm_budget_amounts ?? []).map((a) => [a.line_id, Number(a.amount)]));
          const total = v.gm_budget_amounts.reduce((s, a) => s + Number(a.amount), 0);
          const changed = prev
            ? [...new Set([...prevAmt.keys(), ...v.gm_budget_amounts.map((a) => a.line_id)])]
                .map((lid) => ({ lid, from: prevAmt.get(lid) ?? 0, to: Number(v.gm_budget_amounts.find((a) => a.line_id === lid)?.amount ?? 0) }))
                .filter((c) => c.from !== c.to)
            : [];
          return (
            <Card key={v.id} className="!p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <div className="font-bold text-sm" style={{ color: ink }}>
                    Version {v.version_no} · {v.kind === "original" ? "Original budget" : "Amendment"}{" "}
                    <span className="text-xs font-semibold ml-1" style={{ color: v.status === "active" ? emerald : v.status === "draft" ? gold : faint }}>
                      {v.status === "active" ? "CURRENT" : v.status === "draft" ? "DRAFT" : "SUPERSEDED"}
                    </span>
                  </div>
                  <div className="text-xs" style={{ color: dim }}>
                    {v.activated_at ? `Approved ${fmtDate(v.activated_at)} by ${names.get(v.activated_by ?? "") ?? "—"}` : `Started ${fmtDate(v.created_at)} by ${names.get(v.created_by ?? "") ?? "—"}`}
                    {v.funder_approved_date ? ` · funder approved ${fmtDate(v.funder_approved_date)}` : ""}
                    {v.effective_date ? ` · effective ${fmtDate(v.effective_date)}` : ""}
                  </div>
                  {v.reason && (
                    <div className="text-sm mt-1" style={{ color: ink }}>
                      {v.reason}
                    </div>
                  )}
                </div>
                <div className="font-bold" style={{ fontFamily: "'IBM Plex Mono', monospace", color: ink }}>
                  {money(total, true)}
                </div>
              </div>
              {changed.length > 0 && (
                <div className="mt-2 grid gap-0.5">
                  {changed.map((c) => (
                    <div key={c.lid} className="text-xs flex justify-between gap-3" style={{ color: dim }}>
                      <span>{label.get(c.lid) ?? "Line"}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                        {money(c.from)} → <b style={{ color: c.to > c.from ? emerald : rose }}>{money(c.to)}</b>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

async function Team({ id, grant, canManage, lines, notes }: { id: string; grant: GrantSummary; canManage: boolean; lines: LineSummary[]; notes: string | null }) {
  const admin = createAdminClient();
  const { data: members } = await admin.from("gm_grant_members").select("employee_id, role, allowed_line_ids").eq("grant_id", id);
  const { data: officeStaff } = grant.office_id
    ? await admin.from("gm_user_roles").select("employee_id, role").contains("office_ids", [grant.office_id]).eq("is_active", true)
    : { data: [] };
  const names = await nameMap(admin, [...(members ?? []).map((m) => m.employee_id), ...(officeStaff ?? []).map((m) => m.employee_id)]);
  const { data: emps } = canManage ? await admin.from("employees").select("id, first_name, last_name, email").eq("is_active", true).order("first_name") : { data: [] };
  const activeLines = lines.filter((l) => l.is_active).map((l) => ({ id: l.line_id, label: lineLabel(l) }));
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        {canManage ? (
          <TeamEditor
            grantId={id}
            initial={(members ?? []).map((m) => ({ employee_id: m.employee_id, name: names.get(m.employee_id) ?? "", role: m.role, allowed_line_ids: m.allowed_line_ids ?? [] }))}
            employees={(emps ?? []).map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}`, email: e.email }))}
            lines={activeLines}
          />
        ) : (
          <Card>
            <Eyebrow>Assigned to this grant</Eyebrow>
            {(members ?? []).map((m) => (
              <Row key={m.employee_id} k={names.get(m.employee_id) ?? "—"} v={MEMBER_ROLE_LABELS[m.role as keyof typeof MEMBER_ROLE_LABELS]} />
            ))}
            {!members?.length && (
              <div className="text-sm" style={{ color: faint }}>
                No one assigned individually.
              </div>
            )}
          </Card>
        )}
        {(officeStaff ?? []).length > 0 && (
          <Card className="mt-4">
            <Eyebrow>Also sees this grant through {grant.office_name}</Eyebrow>
            {(officeStaff ?? []).map((m) => (
              <Row key={m.employee_id} k={names.get(m.employee_id) ?? "—"} v={m.role === "approver" ? "Office approver" : m.role === "office_user" ? "Office user" : m.role} />
            ))}
          </Card>
        )}
      </div>
      <Card>
        <Eyebrow>Grant profile & rules</Eyebrow>
        <Row k="Funder" v={grant.funder} />
        <Row k="Code" v={grant.code} />
        <Row k="Program" v={grant.program} />
        <Row k="Office" v={grant.office_name ?? "—"} />
        <Row k="Region / state" v={[grant.resolved_region, grant.resolved_state].filter(Boolean).join(" · ") || "—"} />
        <Row k="Period" v={`${fmtDate(grant.start_date)} – ${fmtDate(grant.end_date)}`} />
        <Row k="Funder FY / period" v={grant.funder_fiscal_year ?? "—"} />
        <Row k="Approval required" v={grant.approval_required ? "Yes" : "No — auto-approved"} />
        <Row k="Receipt required over" v={money(grant.doc_required_over, true)} />
        {notes && (
          <p className="text-sm mt-3 whitespace-pre-wrap" style={{ color: dim }}>
            {notes}
          </p>
        )}
        {canManage && (
          <Link href={`/grant-management/grants/${id}/edit`} className="inline-block mt-3 text-sm font-semibold" style={{ color: emerald }}>
            Edit profile & rules →
          </Link>
        )}
      </Card>
    </div>
  );
}

async function History({ id }: { id: string }) {
  const admin = createAdminClient();
  const { data } = await admin.from("gm_audit_log").select("id, entity, entity_id, action, actor_id, changes, note, created_at").eq("grant_id", id).order("created_at", { ascending: false }).limit(300);
  const names = await nameMap(admin, (data ?? []).map((a) => a.actor_id));
  if (!data?.length) return <Empty>No history yet.</Empty>;
  return (
    <Card className="!p-0 overflow-hidden">
      {data.map((a) => (
        <div key={a.id} className="px-5 py-3 text-sm" style={{ borderBottom: "1px solid rgba(22,48,43,0.06)" }}>
          <div className="flex flex-wrap justify-between gap-2">
            <div style={{ color: ink }}>
              <b>{names.get(a.actor_id) ?? "System"}</b> {describe(a.entity, a.action)}
              {a.entity === "expense" && a.entity_id && (
                <Link href={`/grant-management/expenses/${a.entity_id}`} className="ml-1 text-xs font-semibold" style={{ color: emerald }}>
                  view
                </Link>
              )}
            </div>
            <div className="text-xs" style={{ color: faint }}>
              {new Date(a.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
            </div>
          </div>
          {a.note && (
            <div className="text-xs mt-0.5" style={{ color: dim }}>
              “{a.note}”
            </div>
          )}
          <ChangeList changes={a.changes} />
        </div>
      ))}
    </Card>
  );
}

function describe(entity: string, action: string) {
  const m: Record<string, string> = {
    "grant:created": "created the grant",
    "grant:updated": "edited the grant",
    "grant:status_changed": "changed the status",
    "grant:closed": "closed the grant",
    "grant:reopened": "reopened the grant",
    "budget:draft_saved": "saved a budget draft",
    "budget:original_approved": "approved the original budget",
    "budget:amendment_approved": "approved a budget amendment",
    "budget:draft_discarded": "discarded a budget draft",
    "member:members_updated": "updated the team",
    "expense:created": "entered an expense",
    "expense:edited": "edited an expense",
    "expense:submitted": "submitted an expense",
    "expense:submitted_auto_approved": "submitted an expense (auto-approved)",
    "expense:approved": "approved an expense",
    "expense:rejected": "rejected an expense",
    "expense:returned": "returned an expense for correction",
    "expense:reopened": "reopened an expense",
    "expense:deleted": "deleted an expense",
    "document:uploaded": "attached a document",
    "document:attached": "attached documents",
    "document:removed": "removed a document",
    "import:imported": "bulk-uploaded expenses",
    "import:import_removed": "removed a bulk upload",
    "pex:coded": "coded a PEX transaction",
  };
  return m[`${entity}:${action}`] ?? `${action.replace(/_/g, " ")} (${entity})`;
}

const SKIP = new Set(["lines", "to", "from"]);
function ChangeList({ changes }: { changes: unknown }) {
  if (!changes || typeof changes !== "object") return null;
  const c = changes as Record<string, unknown>;
  // field diffs { field: { from, to } }
  const diffs = Object.entries(c).filter(([k, v]) => !SKIP.has(k) && v && typeof v === "object" && "from" in (v as object) && "to" in (v as object)) as [string, { from: unknown; to: unknown }][];
  const lines = Array.isArray(c.lines) ? (c.lines as { line: string; from: number; to: number }[]) : [];
  if (!diffs.length && !lines.length) {
    const flat = Object.entries(c).filter(([k, v]) => ["rows", "total", "file", "version", "count", "total_to"].includes(k) && v != null);
    if (!flat.length) return null;
    return (
      <div className="text-xs mt-0.5" style={{ color: dim }}>
        {flat.map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "number" && (k.startsWith("total")) ? money(v, true) : String(v)}`).join(" · ")}
      </div>
    );
  }
  return (
    <div className="text-xs mt-1 grid gap-0.5" style={{ color: dim }}>
      {diffs.map(([k, d]) => (
        <div key={k}>
          {k.replace(/_/g, " ")}: <s>{String(d.from ?? "—")}</s> → <b style={{ color: ink }}>{String(d.to ?? "—")}</b>
        </div>
      ))}
      {lines.map((l) => (
        <div key={l.line}>
          {l.line}: {money(l.from)} → <b style={{ color: ink }}>{money(l.to)}</b>
        </div>
      ))}
    </div>
  );
}
