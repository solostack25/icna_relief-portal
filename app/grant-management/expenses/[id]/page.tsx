import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/grantManagement/server";
import { getGmViewer, grantAccess, nameMap } from "@/lib/grantManagement/server";
import { DOC_TYPE_LABELS, EXPENSE_KIND_LABELS, PAYMENT_METHOD_LABELS, fmtDate, lineLabel, money } from "@/lib/grantManagement/shared";
import { Card, Eyebrow, ExpenseStatusPill, Notice, Row } from "@/components/grantManagement/ui";
import { dim, emerald, faint, gold, ink } from "@/components/grantManagement/styles";
import ExpenseActions from "./ExpenseActions";
import AddDocs from "./AddDocs";

export default async function ExpensePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const viewer = (await getGmViewer())!;
  const admin = createAdminClient();
  const { data: e } = await admin.from("gm_expenses").select("*").eq("id", id).maybeSingle();
  if (!e) notFound();
  const access = await grantAccess(viewer, e.grant_id, admin);
  const isOwner = e.created_by === viewer.employeeId;
  if (!access.canView && !isOwner) notFound();

  const [{ data: grant }, { data: line }, { data: docs }, { data: log }, { data: office }] = await Promise.all([
    admin.from("gm_grants").select("id, code, name, funder, status").eq("id", e.grant_id).single(),
    admin.from("gm_budget_lines").select("category, subcategory").eq("id", e.line_id).single(),
    admin.from("gm_expense_documents").select("id, file_name, doc_type, content_type, created_at, uploaded_by").eq("expense_id", id).order("created_at"),
    admin.from("gm_audit_log").select("id, action, actor_id, note, changes, created_at, entity").eq("entity_id", id).in("entity", ["expense", "document"]).order("created_at"),
    e.office_id ? admin.from("b2s_offices").select("field_office").eq("id", e.office_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const names = await nameMap(admin, [e.created_by, e.reviewed_by, e.submitted_by, ...(log ?? []).map((l) => l.actor_id)]);

  const canEdit = access.canManage || (isOwner && ["draft", "returned"].includes(e.status));
  const canDelete = (access.canManage || isOwner) && ["draft", "returned", "rejected"].includes(e.status);
  const canSubmit = (isOwner || access.canManage) && ["draft", "returned"].includes(e.status);
  const canReview = access.canApprove && e.status === "submitted" && (!isOwner || viewer.isManager);
  const canReopen = access.canManage && ["approved", "rejected"].includes(e.status);
  const canAddDocs = access.canManage || access.canApprove || (isOwner && e.status !== "rejected");
  const missingDoc = e.doc_required && !(docs ?? []).length;

  return (
    <div className="max-w-4xl">
      <Link href="/grant-management/expenses" className="text-xs" style={{ color: faint }}>
        ← Expenses
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mt-2 mb-5">
        <div>
          <div className="text-xs font-bold" style={{ color: faint, fontFamily: "'IBM Plex Mono', monospace" }}>
            <Link href={`/grant-management/grants/${grant!.id}`} className="hover:underline">
              {grant!.code}
            </Link>{" "}
            · {line ? lineLabel(line) : ""}
          </div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: 0, color: ink }}>
            {e.vendor || e.description} · {money(e.amount, true)}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <ExpenseStatusPill status={e.status} />
            {e.source !== "manual" && (
              <span className="text-xs" style={{ color: dim }}>
                {e.source === "pex" ? "From PEX" : "Bulk upload"}
              </span>
            )}
          </div>
        </div>
        {canEdit && (
          <Link href={`/grant-management/expenses/${id}/edit`} className="rounded-full px-4 py-2 text-sm font-bold" style={{ background: "#fff", border: "1.5px solid var(--portal-line)", color: ink }}>
            Edit
          </Link>
        )}
      </div>

      <div className="grid gap-3 mb-4">
        {sp.warning && <Notice tone="warn">{sp.warning}</Notice>}
        {sp.saved && e.status === "draft" && <Notice>Saved as a draft. Submit it when it&apos;s ready.</Notice>}
        {sp.saved && e.status === "submitted" && <Notice tone="ok">Submitted. Your approver has been notified in their Approvals list.</Notice>}
        {e.status === "returned" && e.review_note && (
          <Notice tone="warn">
            Returned by {names.get(e.reviewed_by) ?? "an approver"}: “{e.review_note}” Fix it and submit again.
          </Notice>
        )}
        {e.status === "rejected" && e.review_note && <Notice tone="error">Rejected by {names.get(e.reviewed_by) ?? "an approver"}: “{e.review_note}”</Notice>}
        {missingDoc && e.status !== "draft" && <Notice tone="warn">This expense still needs its receipt or invoice.</Notice>}
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        <div className="md:col-span-3 grid gap-4 content-start">
          <Card>
            <Eyebrow>Details</Eyebrow>
            <Row k="Grant" v={`${grant!.code} · ${grant!.name}`} />
            <Row k="Funder" v={grant!.funder} />
            <Row k="Budget category" v={line ? lineLabel(line) : "—"} />
            <Row k="Date" v={fmtDate(e.expense_date)} />
            <Row k="Amount" v={money(e.amount, true)} />
            <Row k="Vendor / payee" v={e.vendor ?? "—"} />
            <Row k="Type" v={EXPENSE_KIND_LABELS[e.kind as keyof typeof EXPENSE_KIND_LABELS] ?? e.kind} />
            <Row k="Paid by" v={e.payment_method ? PAYMENT_METHOD_LABELS[e.payment_method] ?? e.payment_method : "—"} />
            <Row k="Office / program" v={[office?.field_office, e.program].filter(Boolean).join(" · ") || "—"} />
            {e.external_ref && <Row k="Reference" v={e.external_ref} />}
            {e.helpdesk_request_id && (
              <Row
                k="IT ticket"
                v={
                  <Link href={`/helpdesk/${e.helpdesk_request_id}`} className="hover:underline" style={{ color: emerald, fontWeight: 600 }}>
                    Open the hardware ticket →
                  </Link>
                }
              />
            )}
            <div className="text-sm mt-3" style={{ color: ink }}>
              <div className="text-xs mb-1" style={{ color: dim }}>
                Business purpose
              </div>
              {e.description}
            </div>
          </Card>
          <Card>
            <Eyebrow color={missingDoc ? gold : emerald}>Supporting documents · {(docs ?? []).length}</Eyebrow>
            {(docs ?? []).map((d) => (
              <a key={d.id} href={`/api/grant-management/documents/${d.id}`} target="_blank" rel="noreferrer" className="flex justify-between gap-2 py-2 text-sm hover:underline" style={{ borderBottom: "1px dashed var(--portal-line)", color: ink }}>
                <span>
                  📎 <b>{DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type}</b> · {d.file_name}
                </span>
                <span className="text-xs" style={{ color: faint }}>
                  {fmtDate(d.created_at)}
                </span>
              </a>
            ))}
            {!(docs ?? []).length && (
              <div className="text-sm" style={{ color: faint }}>
                {e.doc_required ? "None attached yet." : "Not required for this expense."}
              </div>
            )}
            {canAddDocs && (
              <div className="mt-3">
                <AddDocs expenseId={id} />
              </div>
            )}
          </Card>
        </div>
        <div className="md:col-span-2 grid gap-4 content-start">
          <ExpenseActions id={id} canSubmit={canSubmit} canReview={canReview} canReopen={canReopen} canDelete={canDelete} missingDoc={missingDoc} />
          <Card>
            <Eyebrow>Audit trail</Eyebrow>
            {(log ?? []).map((l) => (
              <div key={l.id} className="py-2 text-xs" style={{ borderBottom: "1px dashed var(--portal-line)" }}>
                <div style={{ color: ink }}>
                  <b>{names.get(l.actor_id) ?? "System"}</b> {l.entity === "document" ? `${l.action} a document` : l.action.replace(/_/g, " ")}
                </div>
                <div style={{ color: faint }}>{new Date(l.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                {l.note && <div style={{ color: dim }}>“{l.note}”</div>}
                {l.action === "edited" && l.changes && (
                  <div style={{ color: dim }}>
                    {Object.entries(l.changes as Record<string, { from: unknown; to: unknown }>)
                      .map(([k, c]) => `${k.replace(/_/g, " ")}: ${String(c?.from ?? "—")} → ${String(c?.to ?? "—")}`)
                      .join(" · ")}
                  </div>
                )}
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
