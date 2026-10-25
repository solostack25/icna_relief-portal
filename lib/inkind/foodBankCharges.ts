// Posts the billed part of a food bank invoice (Orlando / Second Harvest
// style). The in-kind part is the session's donation lines; the charges
// live on sessions.charges and get split two ways:
//
//   grant credit ("LESS Grant: 500889_31 … $691.52")
//     -> a Grant Management expense on the mapped grant, auto-approved
//        (the food bank already applied the credit), invoice attached
//   amount owed ("Amount Owed: $225.79")
//     -> a Vendor Payment finance ticket billed to the office, invoice
//        attached, routed for approval like any other ticket, so Finance
//        pays the food bank and it reaches QuickBooks as the office's expense
//
// Idempotent: every posted part records its id on sessions.charges, so
// the InKind dashboard's "Post charges" retry only does what's missing
// (e.g. after the grant is registered and mapped).

import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { GM_BUCKET } from "@/lib/grantManagement/server";
import { RECEIPT_BUCKET } from "@/lib/financeReceipts";
import { startFinanceTicketApproval } from "@/lib/financeTickets";
import { FOOD_BANK_BUCKET, mappingFor, type FoodBankProfile } from "./foodBank";

export type ChargeGrantCredit = {
  ref: string;
  label: string;
  amount: number;
  gm_grant_id?: string | null;
  gm_grant_code?: string | null;
  gm_expense_id?: string | null;
  error?: string | null;
};

export type SessionCharges = {
  total_charges: number | null;
  amount_owed: number;
  purchased_value: number; // product cost of the purchased (not in-kind) lines
  purchased_lines: { description: string; product_cost: number }[];
  grant_credits: ChargeGrantCredit[];
  finance_ticket_id?: string | null;
  finance_ticket_number?: string | null;
  ticket_error?: string | null;
};

export function chargesPending(c: SessionCharges | null | undefined): boolean {
  if (!c) return false;
  return c.grant_credits.some((g) => !g.gm_expense_id) || (c.amount_owed > 0 && !c.finance_ticket_id);
}

const todayChicago = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function invoiceFiles(paths: string[] | null) {
  const admin = createAdminClient();
  const all = paths ?? [];
  const pdf = all.filter((p) => p.endsWith(".pdf"));
  const use = pdf.length ? pdf : all;
  const out: { buf: Buffer; contentType: string; ext: string }[] = [];
  for (const p of use) {
    const { data } = await admin.storage.from(FOOD_BANK_BUCKET).download(p);
    if (!data) continue;
    const ext = p.endsWith(".pdf") ? "pdf" : "jpg";
    out.push({ buf: Buffer.from(await data.arrayBuffer()), contentType: ext === "pdf" ? "application/pdf" : "image/jpeg", ext });
  }
  return out;
}

// Budget line for food purchases on a grant: the mapping's pick, else the
// first line that looks like food / supplies.
async function foodLineFor(grantId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("gm_budget_lines")
    .select("id, category, subcategory")
    .eq("grant_id", grantId)
    .eq("is_active", true)
    .order("sort_order");
  const rows = (data ?? []) as { id: string; category: string; subcategory: string | null }[];
  const text = (l: { category: string; subcategory: string | null }) => `${l.category} ${l.subcategory ?? ""}`.toLowerCase();
  return (
    rows.find((l) => /food|grocer|pantry|nutrition/.test(text(l)))?.id ??
    rows.find((l) => /suppl|program|operat|direct/.test(text(l)))?.id ??
    (rows.length === 1 ? rows[0].id : null)
  );
}

export async function postFoodBankCharges(sessionId: string, actorEmployeeId: string | null) {
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("sessions")
    .select("id, invoice_id, office, office_id, food_bank_id, donor_org_name, date_received, vendor_invoice_number, invoice_image_paths, charges")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) throw new Error("Intake not found");
  const charges = session.charges as SessionCharges | null;
  if (!charges) return { charges: null, warnings: [] as string[] };

  let profile: FoodBankProfile | null = null;
  if (session.food_bank_id) {
    const { data } = await admin.from("inkind_food_banks").select("*").eq("id", session.food_bank_id).maybeSingle();
    if (data) profile = { ...(data as any), grant_mappings: Array.isArray((data as any).grant_mappings) ? (data as any).grant_mappings : [] };
  }

  const foodBank = session.donor_org_name ?? profile?.name ?? "Food bank";
  const invLabel = session.vendor_invoice_number ? `invoice #${session.vendor_invoice_number}` : "invoice";
  const ref = `${session.invoice_id} (InKind food bank ${invLabel})`;
  const purchasedText = charges.purchased_lines.length
    ? ` Purchased: ${charges.purchased_lines.map((l) => `${l.description} ${usd(l.product_cost)}`).join("; ")}.`
    : "";
  let files: Awaited<ReturnType<typeof invoiceFiles>> | null = null;
  const getFiles = async () => (files ??= await invoiceFiles(session.invoice_image_paths));
  const warnings: string[] = [];

  // ---------- 1. Grant credits -> Grant Management ----------
  for (const credit of charges.grant_credits) {
    if (credit.gm_expense_id) continue;
    const mapping = mappingFor(profile, credit.ref, credit.label);
    if (!mapping) {
      credit.error = `Grant ${credit.ref || credit.label} isn't mapped yet. Register it in Grant Management, then map it under InKind → Food Banks.`;
      continue;
    }
    const { data: grant } = await admin.from("gm_grants").select("id, code, program, office_id, status").eq("id", mapping.gm_grant_id).maybeSingle();
    if (!grant) {
      credit.error = `The grant mapped for ${credit.ref} no longer exists in Grant Management.`;
      continue;
    }
    const lineId = mapping.gm_line_id ?? (await foodLineFor(grant.id));
    if (!lineId) {
      credit.error = `${grant.code} has no food/supplies budget line. Pick one in the food bank's grant mapping.`;
      continue;
    }
    const now = new Date().toISOString();
    const { data: exp, error } = await admin
      .from("gm_expenses")
      .insert({
        grant_id: grant.id,
        line_id: lineId,
        expense_date: session.date_received ?? todayChicago(),
        vendor: foodBank,
        amount: credit.amount,
        description: `Food bank grant credit on ${foodBank} ${invLabel} (${session.office ?? "office"} pantry).${purchasedText}`.slice(0, 500),
        office_id: session.office_id ?? grant.office_id,
        program: grant.program,
        kind: "purchase",
        payment_method: "other", // credit applied by the food bank on its invoice
        doc_required: true,
        status: "approved",
        source: "manual",
        external_ref: ref.slice(0, 200),
        inkind_session_id: session.id,
        created_by: actorEmployeeId,
        submitted_by: actorEmployeeId,
        submitted_at: now,
        reviewed_by: actorEmployeeId,
        reviewed_at: now,
        review_note: "Auto-approved: grant credit already applied by the food bank on its invoice.",
      })
      .select("id")
      .single();
    if (error || !exp) {
      if (error?.code === "23505") {
        const { data: existing } = await admin.from("gm_expenses").select("id").eq("inkind_session_id", session.id).eq("grant_id", grant.id).maybeSingle();
        credit.gm_expense_id = existing?.id ?? null;
        credit.error = null;
        continue;
      }
      credit.error = `Couldn't post to ${grant.code}: ${error?.message ?? "unknown error"}`;
      continue;
    }
    credit.gm_expense_id = exp.id;
    credit.gm_grant_id = grant.id;
    credit.gm_grant_code = grant.code;
    credit.error = null;

    for (const f of await getFiles()) {
      const path = `${exp.id}/${randomUUID()}.${f.ext}`;
      const up = await admin.storage.from(GM_BUCKET).upload(path, f.buf, { contentType: f.contentType, upsert: false });
      if (up.error) {
        warnings.push(`Posted to ${grant.code}, but couldn't attach the invoice: ${up.error.message}`);
        continue;
      }
      await admin.from("gm_expense_documents").insert({
        expense_id: exp.id,
        storage_path: path,
        file_name: `${foodBank} ${invLabel}.${f.ext}`.slice(0, 150),
        content_type: f.contentType,
        size_bytes: f.buf.length,
        doc_type: "invoice",
        uploaded_by: actorEmployeeId,
      });
    }
    await admin.from("gm_audit_log").insert({
      entity: "expense",
      entity_id: exp.id,
      grant_id: grant.id,
      action: "submitted_auto_approved",
      actor_id: actorEmployeeId,
      changes: { source: "inkind_food_bank", session: session.invoice_id, amount: credit.amount, vendor: foodBank, grant_ref: credit.ref },
      note: "Created from a food bank invoice intake",
    });
  }

  // ---------- 2. Amount owed -> Vendor Payment ticket ----------
  if (charges.amount_owed > 0 && !charges.finance_ticket_id) {
    const requestor = actorEmployeeId ?? profile?.ticket_requestor_id ?? null;
    if (!requestor) {
      charges.ticket_error = "No one to open the Vendor Payment ticket under. Sign in before saving, or set a ticket requestor on the food bank under InKind → Food Banks.";
    } else {
      try {
        const { data: vendor, error: vErr } = await admin
          .from("finance_vendors")
          .insert({
            requestor_id: requestor,
            vendor_name: foodBank,
            vendor_type: "food_bank",
            billing_office_id: session.office_id,
            billing_programs: ["Hunger Prevention"],
            expense_date: session.date_received ?? todayChicago(),
            grant_eligible: false,
            total_amount: charges.amount_owed,
            notes: `Amount owed on ${foodBank} ${invLabel} (InKind ${session.invoice_id}). Total charges ${usd(charges.total_charges ?? 0)}${
              charges.grant_credits.length ? `, less grant credit ${charges.grant_credits.map((g) => `${g.ref} ${usd(g.amount)}`).join(", ")}` : ""
            }.`.slice(0, 1000),
          })
          .select("id")
          .single();
        if (vErr || !vendor) throw new Error(vErr?.message ?? "Couldn't create the vendor detail");

        const { data: ticket, error: tErr } = await admin
          .from("finance_tickets")
          .insert({
            title: `${foodBank} — ${invLabel}`.slice(0, 200),
            category: "vendor_payment",
            requestor_id: requestor,
            billing_office_id: session.office_id,
            grant_eligible: false,
            priority: "normal",
            submitted_at: new Date().toISOString(),
            vendor_id: vendor.id,
            total: charges.amount_owed,
            detail: { source: "inkind_food_bank", inkind_session_id: session.id, inkind_invoice: session.invoice_id, vendor_invoice_number: session.vendor_invoice_number },
          })
          .select("id, ticket_number")
          .single();
        if (tErr || !ticket) throw new Error(tErr?.message ?? "Couldn't create the ticket");
        charges.finance_ticket_id = ticket.id;
        charges.finance_ticket_number = ticket.ticket_number;
        charges.ticket_error = null;

        for (const f of await getFiles()) {
          const path = `foodbank/${ticket.id}/${randomUUID()}.${f.ext}`;
          const up = await admin.storage.from(RECEIPT_BUCKET).upload(path, f.buf, { contentType: f.contentType, upsert: false });
          if (up.error) {
            warnings.push(`Ticket ${ticket.ticket_number} opened, but couldn't attach the invoice: ${up.error.message}`);
            continue;
          }
          await admin.from("finance_ticket_receipts").insert({
            finance_ticket_id: ticket.id,
            uploaded_by: requestor,
            storage_path: path,
            content_type: f.contentType,
          });
        }
        try {
          await startFinanceTicketApproval(ticket.id);
        } catch (e) {
          warnings.push(`Ticket ${ticket.ticket_number} opened, but approval routing failed: ${e instanceof Error ? e.message : "unknown error"}`);
        }
      } catch (e) {
        charges.ticket_error = e instanceof Error ? e.message : "Couldn't open the Vendor Payment ticket";
      }
    }
  }

  await admin.from("sessions").update({ charges }).eq("id", session.id);
  return { charges, warnings };
}
