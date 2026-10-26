import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { sendPortalEmail, emailLayout, escapeHtml, type EmailAttachment } from "@/lib/portalEmail";
import { ORG_APP_BASE_URL } from "@/lib/orgConfig";
import { TARGET_METRICS, type TargetMetric } from "@/lib/insightsTargets";

// Office goal agreements.
//
// Upper management sets each office's yearly goals on Settings → Goals &
// Budgets (or inline on Insights). Saving an office goal, or changing one,
// sends the office's area manager a document to sign agreeing to it. Each
// document is one insights_goal_agreements row; a changed goal supersedes the
// older unsigned one, so the Goals page keeps a full record of who agreed to
// which amount and when.
//
// Every goal write goes through saveTarget() here so the Goals page and the
// Insights editor behave the same way.

export const METRICS: TargetMetric[] = ["fundraising", "value_of_services", "people_served", "budget"];
const SCOPES = ["org", "region", "state", "office"];
const BUCKET = "goal-agreements";

export type Agreement = {
  id: string;
  year: number;
  office_id: string;
  metric: TargetMetric;
  amount: number;
  previous_amount: number | null;
  kind: "new" | "modified";
  status: "pending" | "signed" | "superseded";
  recipient_employee_id: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  created_by: string | null;
  created_at: string;
  email_status: "sent" | "failed" | "no_recipient" | null;
  email_error: string | null;
  emailed_at: string | null;
  signed_by: string | null;
  signed_name: string | null;
  signed_at: string | null;
  signed_ip: string | null;
  pdf_path: string | null;
  superseded_at: string | null;
};

export type Me = { id: string; role: string; assigned_office_id: string | null; email: string | null; name: string };

export async function getMe(): Promise<Me | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createAdminClient()
    .from("employees")
    .select("id, role, assigned_office_id, email, first_name, last_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    role: (data.role as string) ?? "",
    assigned_office_id: (data.assigned_office_id as string) ?? null,
    email: (data.email as string) ?? null,
    name: `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim() || (data.email as string) || "Staff",
  };
}

const metricInfo = (m: TargetMetric) => TARGET_METRICS.find((x) => x.key === m)!;
export const formatGoal = (m: TargetMetric, n: number) =>
  metricInfo(m).unit === "money" ? `$${Math.round(Number(n)).toLocaleString("en-US")}` : Math.round(Number(n)).toLocaleString("en-US");

function commitmentPhrase(m: TargetMetric, amount: number, year: number) {
  const v = formatGoal(m, amount);
  switch (m) {
    case "fundraising":
      return `raise ${v} in ${year}`;
    case "value_of_services":
      return `deliver ${v} in value of services in ${year}`;
    case "people_served":
      return `serve ${v} individuals in ${year}`;
    case "budget":
      return `keep ${year} spending within an annual budget of ${v}`;
  }
}

// ---------------------------------------------------------------- saving

export type SaveResult = { ok: true; changed: boolean; agreement?: { id: string; email_status: string | null } } | { ok: false; status: number; error: string };

/**
 * Save (or clear) one goal. For office goals, a new or changed amount sends
 * the area manager an agreement to sign; clearing a goal retires any
 * unsigned agreement for it.
 */
export async function saveTarget(input: { year: number; scope: string; scope_key: string; metric: string; amount: unknown; actorId: string }): Promise<SaveResult> {
  const { year, scope, metric, actorId } = input;
  const scope_key = scope === "org" ? "" : String(input.scope_key ?? "").trim();
  if (!(year >= 2000 && year <= 2100) || !SCOPES.includes(scope) || !METRICS.includes(metric as TargetMetric) || (scope !== "org" && !scope_key)) {
    return { ok: false, status: 400, error: "Bad goal" };
  }
  const admin = createAdminClient();
  const { data: existing } = await admin.from("insights_targets").select("amount").match({ year, scope, scope_key, metric }).maybeSingle();
  const prev = existing ? Number(existing.amount) : null;

  if (input.amount === null || input.amount === "" || input.amount === undefined) {
    const { error } = await admin.from("insights_targets").delete().match({ year, scope, scope_key, metric });
    if (error) return { ok: false, status: 500, error: error.message };
    if (scope === "office") await supersedePending(year, scope_key, metric as TargetMetric);
    return { ok: true, changed: prev !== null };
  }

  const amount = Number(String(input.amount).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, status: 400, error: "Enter a number" };
  if (prev !== null && prev === amount) return { ok: true, changed: false };

  const { error } = await admin
    .from("insights_targets")
    .upsert({ year, scope, scope_key, metric, amount, updated_by: actorId, updated_at: new Date().toISOString() });
  if (error) return { ok: false, status: 500, error: error.message };

  if (scope !== "office") return { ok: true, changed: true };
  const [a] = await createAgreements(scope_key, year, [{ metric: metric as TargetMetric, amount, previous: prev }], actorId);
  return { ok: true, changed: true, agreement: a ? { id: a.id, email_status: a.email_status } : undefined };
}

async function supersedePending(year: number, officeId: string, metric: TargetMetric) {
  await createAdminClient()
    .from("insights_goal_agreements")
    .update({ status: "superseded", superseded_at: new Date().toISOString() })
    .match({ year, office_id: officeId, metric, status: "pending" });
}

type Manager = { id: string; email: string; name: string };
async function areaManagers(officeId: string): Promise<Manager[]> {
  const { data } = await createAdminClient()
    .from("employees")
    .select("id, email, first_name, last_name")
    .eq("role", "area_manager")
    .eq("assigned_office_id", officeId)
    .neq("is_active", false);
  return ((data ?? []) as { id: string; email: string | null; first_name: string | null; last_name: string | null }[])
    .filter((e) => e.email)
    .map((e) => ({ id: e.id as string, email: e.email as string, name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || (e.email as string) }));
}

async function officeName(officeId: string) {
  const { data } = await createAdminClient().from("b2s_offices").select("field_office").eq("id", officeId).maybeSingle();
  return (data?.field_office as string) ?? "Office";
}

/**
 * Create one agreement per goal for an office and email the area manager(s)
 * a single message covering all of them (one goal on a normal save; several
 * when copying last year's goals).
 */
export async function createAgreements(
  officeId: string,
  year: number,
  items: { metric: TargetMetric; amount: number; previous: number | null }[],
  actorId: string
): Promise<Agreement[]> {
  if (!items.length) return [];
  const admin = createAdminClient();
  for (const it of items) await supersedePending(year, officeId, it.metric);
  const ams = await areaManagers(officeId);
  const rows = items.map((it) => ({
    year,
    office_id: officeId,
    metric: it.metric,
    amount: it.amount,
    previous_amount: it.previous,
    kind: it.previous === null ? "new" : "modified",
    status: "pending",
    recipient_employee_id: ams[0]?.id ?? null,
    recipient_email: ams.map((a) => a.email).join(", ") || null,
    recipient_name: ams.map((a) => a.name).join(", ") || null,
    created_by: actorId,
  }));
  const { data, error } = await admin.from("insights_goal_agreements").insert(rows).select("*");
  if (error || !data) throw new Error(error?.message ?? "Couldn't create agreement");
  const agreements = data as Agreement[];
  await emailAgreements(agreements, ams);
  const { data: fresh } = await admin.from("insights_goal_agreements").select("*").in("id", agreements.map((a) => a.id));
  return (fresh ?? agreements) as Agreement[];
}

/** Re-send a pending agreement, to whoever is the office's area manager now. */
export async function resendAgreement(id: string): Promise<{ ok: boolean; error?: string; email_status?: string | null }> {
  const admin = createAdminClient();
  const { data } = await admin.from("insights_goal_agreements").select("*").eq("id", id).maybeSingle();
  if (!data) return { ok: false, error: "Agreement not found" };
  const a = data as Agreement;
  if (a.status !== "pending") return { ok: false, error: "Only unsigned agreements can be re-sent" };
  const ams = await areaManagers(a.office_id);
  await admin
    .from("insights_goal_agreements")
    .update({
      recipient_employee_id: ams[0]?.id ?? null,
      recipient_email: ams.map((x) => x.email).join(", ") || null,
      recipient_name: ams.map((x) => x.name).join(", ") || null,
    })
    .eq("id", id);
  const status = await emailAgreements([a], ams);
  return { ok: status === "sent", email_status: status, error: status === "no_recipient" ? "This office has no active area manager in the portal." : status === "failed" ? "The email didn't go out - try again." : undefined };
}

/** For a goal that was set before agreements existed (or was copied): send it now. */
export async function requestSignature(year: number, officeId: string, metric: TargetMetric, actorId: string) {
  const admin = createAdminClient();
  const { data: t } = await admin.from("insights_targets").select("amount").match({ year, scope: "office", scope_key: officeId, metric }).maybeSingle();
  if (!t) return { ok: false as const, error: "Set the goal first" };
  const { data: open } = await admin.from("insights_goal_agreements").select("id").match({ year, office_id: officeId, metric }).in("status", ["pending", "signed"]).eq("amount", t.amount).limit(1);
  if (open?.length) return { ok: false as const, error: "There's already an agreement for this amount" };
  const [a] = await createAgreements(officeId, year, [{ metric, amount: Number(t.amount), previous: null }], actorId);
  return { ok: true as const, agreement: a };
}

async function emailAgreements(agreements: Agreement[], ams: { id: string; email: string; name: string }[]): Promise<Agreement["email_status"]> {
  const admin = createAdminClient();
  const ids = agreements.map((a) => a.id);
  if (!ams.length) {
    await admin.from("insights_goal_agreements").update({ email_status: "no_recipient", email_error: "No active area manager for this office" }).in("id", ids);
    return "no_recipient";
  }
  const office = await officeName(agreements[0].office_id);
  const year = agreements[0].year;
  const modified = agreements.some((a) => a.kind === "modified");
  const attachments: EmailAttachment[] = [];
  for (const a of agreements) {
    attachments.push({ filename: pdfFilename(office, a), content: await buildGoalAgreementPdf(a, office), contentType: "application/pdf" });
  }
  const single = agreements.length === 1 ? agreements[0] : null;
  const link = single ? `${ORG_APP_BASE_URL}/goal-agreements/${single.id}` : `${ORG_APP_BASE_URL}/goal-agreements`;
  const rows: [string, string][] = [["Office", office], ["Year", String(year)]];
  for (const a of agreements) {
    const m = metricInfo(a.metric);
    rows.push([m.label, a.kind === "modified" && a.previous_amount !== null ? `${formatGoal(a.metric, a.amount)} (was ${formatGoal(a.metric, a.previous_amount)})` : formatGoal(a.metric, a.amount)]);
  }
  const subject = modified
    ? `${office}: your ${year} goal was changed - please sign the new agreement`
    : `${office}: please sign your ${year} goal agreement${agreements.length > 1 ? "s" : ""}`;
  const intro = modified
    ? `Upper management changed ${single ? "a" : "your"} ${year} goal for <b>${escapeHtml(office)}</b>. The earlier agreement no longer applies, so a new agreement needs your signature.`
    : `Upper management set ${single ? "a" : "your"} ${year} goal${single ? "" : "s"} for <b>${escapeHtml(office)}</b>. Please review the attached agreement${single ? "" : "s"} and sign in the portal to confirm you agree.`;
  const res = await sendPortalEmail({
    to: ams.map((a) => a.email),
    subject,
    html: emailLayout({ eyebrow: "ICNA Relief · Goals & Budgets", heading: modified ? "Goal changed - new agreement to sign" : "Goal agreement to sign", intro, rows, button: { label: single ? "Review & sign" : "Review & sign agreements", href: link } }),
    attachments,
  });
  const status = res.ok ? "sent" : "failed";
  await admin
    .from("insights_goal_agreements")
    .update({ email_status: status, email_error: res.ok ? null : res.error ?? "Email failed", emailed_at: res.ok ? new Date().toISOString() : null })
    .in("id", ids);
  return status;
}

// ---------------------------------------------------------------- reading

/** Agreements for every office goal in a year (for the Goals page). */
export async function agreementsForYear(year: number) {
  const { data } = await createAdminClient().from("insights_goal_agreements").select("*").eq("year", year).order("created_at", { ascending: false });
  return (data ?? []) as Agreement[];
}

export function canSign(me: Me, a: Agreement) {
  return a.status === "pending" && ((me.role === "area_manager" && me.assigned_office_id === a.office_id) || me.id === a.recipient_employee_id);
}
export function canView(me: Me, a: Agreement) {
  return me.role === "admin" || canSign(me, a) || a.signed_by === me.id || (me.role === "area_manager" && me.assigned_office_id === a.office_id);
}

export async function getAgreement(id: string) {
  const { data } = await createAdminClient().from("insights_goal_agreements").select("*").eq("id", id).maybeSingle();
  return (data as Agreement) ?? null;
}

/** Agreements an area manager should see on their signing page. */
export async function agreementsForManager(me: Me) {
  const admin = createAdminClient();
  let q = admin.from("insights_goal_agreements").select("*").neq("status", "superseded").order("created_at", { ascending: false }).limit(100);
  if (me.role === "area_manager" && me.assigned_office_id) q = q.or(`office_id.eq.${me.assigned_office_id},recipient_employee_id.eq.${me.id}`);
  else q = q.eq("recipient_employee_id", me.id);
  const { data } = await q;
  return (data ?? []) as Agreement[];
}

export async function viewModel(a: Agreement) {
  const office = await officeName(a.office_id);
  let setBy: string | null = null;
  if (a.created_by) {
    const { data } = await createAdminClient().from("employees").select("first_name, last_name").eq("id", a.created_by).maybeSingle();
    setBy = data ? `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim() : null;
  }
  return { agreement: a, office, setBy, metricLabel: metricInfo(a.metric).label, sections: agreementSections(a, office) };
}

// ---------------------------------------------------------------- signing

export async function signAgreement(id: string, me: Me, signatureName: string, ip: string | null) {
  const name = signatureName.trim().replace(/\s+/g, " ");
  if (name.length < 3) return { ok: false as const, error: "Type your full name to sign." };
  const admin = createAdminClient();
  const a = await getAgreement(id);
  if (!a) return { ok: false as const, error: "Agreement not found" };
  if (a.status === "signed") return { ok: false as const, error: "This agreement is already signed." };
  if (a.status === "superseded") return { ok: false as const, error: "This goal was changed after this agreement was sent. Please sign the newer agreement." };
  if (!canSign(me, a)) return { ok: false as const, error: "Only this office's area manager can sign this agreement." };

  const office = await officeName(a.office_id);
  const signedAt = new Date();
  const pdf = await buildGoalAgreementPdf(a, office, { name, signedAt, ip });
  const path = `${a.year}/${a.office_id}/${a.id}.pdf`;
  const up = await admin.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) return { ok: false as const, error: `Couldn't store the signed copy: ${up.error.message}` };

  // Only flip a still-pending row, so a goal changed mid-signing can't be marked agreed.
  const { data: updated, error } = await admin
    .from("insights_goal_agreements")
    .update({ status: "signed", signed_by: me.id, signed_name: name, signed_at: signedAt.toISOString(), signed_ip: ip, pdf_path: path })
    .eq("id", a.id)
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false as const, error: error.message };
  if (!updated?.length) return { ok: false as const, error: "This goal was changed while you were signing. Please sign the newer agreement." };

  // Signed copy to the signer, cc whoever set the goal.
  let cc: string[] = [];
  if (a.created_by) {
    const { data } = await admin.from("employees").select("email").eq("id", a.created_by).maybeSingle();
    if (data?.email) cc = [data.email as string];
  }
  const m = metricInfo(a.metric);
  await sendPortalEmail({
    to: me.email ? [me.email] : cc,
    cc: me.email ? cc : [],
    subject: `${office}: ${a.year} ${m.short.toLowerCase()} goal agreement signed`,
    html: emailLayout({
      eyebrow: "ICNA Relief · Goals & Budgets",
      heading: "Goal agreement signed",
      intro: `${escapeHtml(name)} signed the ${a.year} goal agreement for <b>${escapeHtml(office)}</b>. The signed copy is attached and kept on the Goals &amp; Budgets page.`,
      rows: [
        ["Goal", `${m.label}: ${formatGoal(a.metric, a.amount)}`],
        ["Signed", signedAt.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" }) + " CT"],
      ],
    }),
    attachments: [{ filename: pdfFilename(office, a, true), content: pdf, contentType: "application/pdf" }],
  });
  return { ok: true as const };
}

/** The PDF for an agreement: the stored signed copy, or an unsigned copy built on the fly. */
export async function agreementPdf(a: Agreement): Promise<{ buffer: Buffer; filename: string }> {
  const office = await officeName(a.office_id);
  if (a.status === "signed" && a.pdf_path) {
    const { data } = await createAdminClient().storage.from(BUCKET).download(a.pdf_path);
    if (data) return { buffer: Buffer.from(await data.arrayBuffer()), filename: pdfFilename(office, a, true) };
  }
  return { buffer: await buildGoalAgreementPdf(a, office), filename: pdfFilename(office, a) };
}

// ---------------------------------------------------------------- document

const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
function pdfFilename(office: string, a: Agreement, signed = false) {
  return `${fileSafe(office)}-${a.year}-${fileSafe(metricInfo(a.metric).short)}-goal-agreement${signed ? "-signed" : ""}.pdf`;
}

export function agreementSections(a: Agreement, office: string): { title: string; body: string }[] {
  const m = metricInfo(a.metric);
  const s: { title: string; body: string }[] = [
    {
      title: "1. Goal",
      body: `ICNA Relief USA upper management has set the following ${a.year} goal for the ${office} office: ${m.label}, ${formatGoal(a.metric, a.amount)}. By signing, the area manager agrees that the ${office} office will work to ${commitmentPhrase(a.metric, a.amount, a.year)}.`,
    },
  ];
  if (a.kind === "modified" && a.previous_amount !== null) {
    s.push({
      title: "2. Change to an earlier goal",
      body: `This agreement replaces the earlier ${a.year} ${m.short.toLowerCase()} goal of ${formatGoal(a.metric, a.previous_amount)}. Any earlier agreement for this goal no longer applies.`,
    });
  }
  const n = s.length;
  s.push(
    {
      title: `${n + 1}. How progress is measured`,
      body: `Progress is measured from data entered in the ICNA Relief Staff Portal (${m.help.toLowerCase()}) and is shown on Insights and on the office dashboard throughout the year. Keeping the office's portal data complete and up to date is part of this agreement.`,
    },
    {
      title: `${n + 2}. Responsibilities`,
      body: "The area manager will plan the office's work toward this goal, review progress regularly, and raise any risk to meeting it with their regional director as early as possible.",
    },
    {
      title: `${n + 3}. Changes`,
      body: "Upper management may revise this goal during the year. Any change will be sent as a new agreement for the area manager to sign.",
    },
    {
      title: `${n + 4}. Electronic signature`,
      body: "By typing their full name and signing in the ICNA Relief Staff Portal while signed in with their ICNA Relief account, the area manager agrees that this electronic signature is the legal equivalent of a handwritten signature.",
    }
  );
  return s;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
// pdf-lib standard fonts are WinAnsi only.
const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

export async function buildGoalAgreementPdf(a: Agreement, office: string, signature?: { name: string; signedAt: Date; ip: string | null }): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const ink = rgb(0.086, 0.188, 0.169);
  const emerald = rgb(0.122, 0.435, 0.329);
  const dim = rgb(0.4, 0.47, 0.45);
  let page: PDFPage = pdf.addPage([612, 792]);
  const margin = 56;
  const width = 612 - margin * 2;
  let y = 792 - margin;
  const ensure = (h: number) => {
    if (y - h < margin) {
      page = pdf.addPage([612, 792]);
      y = 792 - margin;
    }
  };
  const text = (t: string, f: PDFFont, size: number, color = ink, gap = 4) => {
    for (const line of wrap(safe(t), f, size, width)) {
      ensure(size + gap);
      page.drawText(line, { x: margin, y: y - size, size, font: f, color });
      y -= size + gap;
    }
  };
  const m = metricInfo(a.metric);
  text("ICNA RELIEF USA", bold, 10, emerald, 6);
  text(`${a.year} Office Goal Agreement`, italic, 24, ink, 8);
  text(`${office} - ${m.label}: ${formatGoal(a.metric, a.amount)}`, bold, 12, ink, 4);
  text(`Reference ${a.id.slice(0, 8).toUpperCase()}${a.kind === "modified" ? " - revised goal" : ""} - issued ${new Date(a.created_at).toISOString().slice(0, 10)}`, font, 9.5, dim, 14);
  for (const s of agreementSections(a, office)) {
    y -= 6;
    text(s.title, bold, 12, ink, 6);
    text(s.body, font, 10.5, ink, 4);
  }
  y -= 28;
  ensure(90);
  page.drawLine({ start: { x: margin, y }, end: { x: margin + 260, y }, thickness: 0.8, color: dim });
  if (signature) page.drawText(safe(signature.name), { x: margin + 4, y: y + 6, size: 20, font: italic, color: ink });
  y -= 14;
  text(`Area manager signature${signature ? ` - signed electronically by ${signature.name}` : ""}`, font, 9, dim, 3);
  if (signature) text(`Signed ${signature.signedAt.toISOString().replace("T", " ").slice(0, 19)} UTC${signature.ip ? ` from IP ${signature.ip}` : ""}`, font, 9, dim, 3);
  else text("Not yet signed - sign in the ICNA Relief Staff Portal under Goal Agreements.", font, 9, dim, 3);
  return Buffer.from(await pdf.save());
}
