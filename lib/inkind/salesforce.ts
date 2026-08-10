import {
  SF_HEADER_OBJECT,
  SF_HEADER_FIELD_MAP,
  SF_LINE_ITEM_OBJECT,
  SF_LINE_ITEM_FIELD_MAP,
  SF_HOUSTON_OFFICE_ACCOUNT_ID,
  PROGRAM_TO_SALESFORCE_PICKLIST,
  CONDITION_LABEL,
} from "./salesforceMapping";
import { getSalesforceAuth, isSalesforceConfigured, type SalesforceAuth } from "./salesforceAuth";
import { findOrCreateDonorContact, findOrCreateDonorAccount } from "./salesforceDonor";
import { renderBackendInvoicesPdf } from "./renderInvoicePdf";
import type { BackendInvoiceData } from "./invoices";

export { isSalesforceConfigured };

export type SessionForSync = {
  id: string;
  office: string | null;
  short_description: string | null;
  date_received: string | null;
  donor_kind: string | null; // "individual" | "organization" | "anonymous"
  donor_org_name: string | null;
  invoice_id: string | null; // base invoice number, e.g. TXHOU-07202026-005
};

export type DonorForSync = {
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
} | null;

export type DonationLineForSync = {
  item_name: string;
  item_code: string;
  condition: "new" | "used" | "na";
  qty: number;
  unit_price: number;
  is_manual_price: boolean;
  notes: string | null;
  program: string;
  program_code: string;
  goods_type: string | null;
  sf_category: string | null;
};

export type ProgramPushResult = {
  program: string;
  programCode: string;
  success: boolean;
  salesforceHeaderId?: string;
  error?: string;
};

function buildItemDescription(line: DonationLineForSync): string {
  const label = CONDITION_LABEL[line.condition];
  const desc = label ? `${line.item_name} (${label})` : line.item_name;
  return desc.slice(0, 150);
}

function lineTotal(line: DonationLineForSync): number {
  return line.is_manual_price ? line.unit_price : line.unit_price * line.qty;
}

function donorLabelFor(session: SessionForSync, donor: DonorForSync): string {
  if (session.donor_kind === "anonymous") return "Anonymous Individual";
  return donor?.name || session.donor_org_name || "Anonymous";
}

async function sfCreate(auth: SalesforceAuth, sobject: string, fields: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${auth.instanceUrl}/services/data/v60.0/sobjects/${sobject}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(fields),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(JSON.stringify(json));
  }
  return json.id;
}

async function sfCreateComposite(auth: SalesforceAuth, records: Record<string, unknown>[]): Promise<any[]> {
  const res = await fetch(`${auth.instanceUrl}/services/data/v60.0/composite/sobjects`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ allOrNone: false, records }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(JSON.stringify(json));
  }
  return json;
}

/**
 * Uploads a PDF and attaches it to a record's Files related list —
 * ContentVersion (the actual file bytes) + ContentDocumentLink (what
 * shares it onto the record). This is the modern "Files" attachment
 * mechanism, not the older/deprecated Attachment object.
 */
async function sfAttachFile(
  auth: SalesforceAuth,
  recordId: string,
  filename: string,
  pdfBytes: Uint8Array
): Promise<void> {
  const versionId = await sfCreate(auth, "ContentVersion", {
    Title: filename,
    PathOnClient: `${filename}.pdf`,
    VersionData: Buffer.from(pdfBytes).toString("base64"),
  });

  // The ContentDocumentId isn't returned by the create call — look it
  // up from the ContentVersion we just made.
  const queryRes = await fetch(
    `${auth.instanceUrl}/services/data/v60.0/query?q=${encodeURIComponent(
      `SELECT ContentDocumentId FROM ContentVersion WHERE Id = '${versionId}'`
    )}`,
    { headers: { Authorization: `Bearer ${auth.accessToken}` } }
  );
  const queryJson = await queryRes.json();
  if (!queryRes.ok || !queryJson.records?.[0]?.ContentDocumentId) {
    throw new Error(`Couldn't look up ContentDocumentId: ${JSON.stringify(queryJson)}`);
  }
  const contentDocumentId = queryJson.records[0].ContentDocumentId;

  await sfCreate(auth, "ContentDocumentLink", {
    ContentDocumentId: contentDocumentId,
    LinkedEntityId: recordId,
    ShareType: "V",
    Visibility: "AllUsers",
  });
}

/**
 * Pushes one donation session to Salesforce as ONE HEADER RECORD PER
 * PROGRAM touched in that session (Program__c is a single-select
 * picklist on the header, so a session spanning 2 programs becomes 2
 * separate InKind_Inven__c records — matching how the admin dashboard
 * already splits sessions into per-program rows/invoices), each with
 * its own child line-item records.
 *
 * Donor resolution happens once per session (not per program) — the
 * same Contact/Account gets linked to every header this session
 * produces.
 */
export async function pushSessionToSalesforce(
  session: SessionForSync,
  donor: DonorForSync,
  lines: DonationLineForSync[]
): Promise<{ success: boolean; results: ProgramPushResult[]; error?: string }> {
  if (!isSalesforceConfigured()) {
    return {
      success: false,
      results: [],
      error:
        "Salesforce isn't configured yet. Add SALESFORCE_INSTANCE_URL, SALESFORCE_CLIENT_ID, and SALESFORCE_CLIENT_SECRET.",
    };
  }

  let auth: SalesforceAuth;
  try {
    auth = await getSalesforceAuth();
  } catch (err: any) {
    return { success: false, results: [], error: err.message ?? String(err) };
  }

  // Resolve donor once — reused across every program header this
  // session produces.
  let donorOrgId: string | null = null;
  let donorPersonId: string | null = null;
  try {
    if (session.donor_kind === "organization" && session.donor_org_name) {
      donorOrgId = await findOrCreateDonorAccount(auth, session.donor_org_name);
    } else if (session.donor_kind === "individual" && donor) {
      donorPersonId = await findOrCreateDonorContact(auth, donor);
    }
    // "anonymous" (or no donor_kind) -> leave both null, no lookup.
  } catch (err: any) {
    return { success: false, results: [], error: `Donor resolution failed: ${err.message ?? err}` };
  }

  // Group line items by program — one header per group.
  const byProgram = new Map<string, DonationLineForSync[]>();
  lines
    .filter((l) => l.qty > 0)
    .forEach((l) => {
      if (!byProgram.has(l.program)) byProgram.set(l.program, []);
      byProgram.get(l.program)!.push(l);
    });

  const results: ProgramPushResult[] = [];
  const baseInvoiceNumber = session.invoice_id ?? session.id.slice(0, 8);

  for (const [program, programLines] of byProgram.entries()) {
    const programCode = programLines[0]?.program_code ?? "GEN";
    const sfProgramValue = PROGRAM_TO_SALESFORCE_PICKLIST[program];

    if (!sfProgramValue) {
      results.push({
        program,
        programCode,
        success: false,
        error: `"${program}" isn't mapped to a Salesforce Program picklist value yet — see PROGRAM_TO_SALESFORCE_PICKLIST in lib/salesforceMapping.ts`,
      });
      continue;
    }

    try {
      const headerFields: Record<string, unknown> = {
        [SF_HEADER_FIELD_MAP.dateReceived]: session.date_received,
        [SF_HEADER_FIELD_MAP.description]: session.short_description,
        [SF_HEADER_FIELD_MAP.office]: SF_HOUSTON_OFFICE_ACCOUNT_ID,
        [SF_HEADER_FIELD_MAP.program]: sfProgramValue,
        [SF_HEADER_FIELD_MAP.transactionId]: `${baseInvoiceNumber}-${programCode}`,
      };
      if (donorOrgId) headerFields[SF_HEADER_FIELD_MAP.donorOrg] = donorOrgId;
      if (donorPersonId) headerFields[SF_HEADER_FIELD_MAP.donorPerson] = donorPersonId;

      const headerId = await sfCreate(auth, SF_HEADER_OBJECT, headerFields);

      const lineRecords = programLines.map((l) => ({
        attributes: { type: SF_LINE_ITEM_OBJECT },
        [SF_LINE_ITEM_FIELD_MAP.parentLookup]: headerId,
        [SF_LINE_ITEM_FIELD_MAP.itemDescription]: buildItemDescription(l),
        [SF_LINE_ITEM_FIELD_MAP.quantity]: l.qty,
        [SF_LINE_ITEM_FIELD_MAP.fairMarketValue]: lineTotal(l),
        [SF_LINE_ITEM_FIELD_MAP.goodsType]: l.goods_type ?? "Accessories",
        [SF_LINE_ITEM_FIELD_MAP.category]: l.sf_category ?? undefined,
        [SF_LINE_ITEM_FIELD_MAP.referenceId]: l.item_code,
        [SF_LINE_ITEM_FIELD_MAP.dateReceived]: session.date_received,
        [SF_LINE_ITEM_FIELD_MAP.donorDeclaredValue]: false,
      }));

      let lineError: string | undefined;
      if (lineRecords.length > 0) {
        const compositeResult = await sfCreateComposite(auth, lineRecords);
        const failed = compositeResult.filter((r: any) => !r.success);
        if (failed.length > 0) {
          lineError = `${failed.length} of ${lineRecords.length} line items failed: ${JSON.stringify(failed)}`;
        }
      }

      // Attach this program's invoice PDF to the header record. A
      // failure here shouldn't undo the header/line items that already
      // synced successfully — just note it in the result.
      let attachError: string | undefined;
      try {
        const invoiceNumber = `${baseInvoiceNumber}-${programCode}`;
        const invoiceData: BackendInvoiceData = {
          invoiceNumber,
          program,
          programCode,
          office: session.office,
          dateReceived: session.date_received,
          donorLabel: donorLabelFor(session, donor),
          lines: programLines.map((l) => ({
            name: l.item_name,
            condition: l.condition,
            qty: l.qty,
            notes: l.notes,
            unitPrice: l.unit_price,
            isManualPrice: l.is_manual_price,
            total: lineTotal(l),
          })),
          subtotal: programLines.reduce((a, l) => a + lineTotal(l), 0),
        };
        const pdfBytes = await renderBackendInvoicesPdf([invoiceData]);
        await sfAttachFile(auth, headerId, invoiceNumber, pdfBytes);
      } catch (err: any) {
        attachError = `Invoice PDF attachment failed: ${err.message ?? err}`;
      }

      results.push({
        program,
        programCode,
        success: true,
        salesforceHeaderId: headerId,
        error: [lineError, attachError].filter(Boolean).join(" | ") || undefined,
      });
    } catch (err: any) {
      results.push({ program, programCode, success: false, error: err.message ?? String(err) });
    }
  }

  const anySuccess = results.some((r) => r.success);
  return { success: anySuccess, results };
}
