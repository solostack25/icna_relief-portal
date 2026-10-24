// Amazon Business API client (server only).
//
// Auth is Login with Amazon: a refresh token (from the one-time admin
// consent on Admin -> Connectors) is swapped for a one-hour access token,
// sent as x-amz-access-token. Two APIs are used:
//   Reconciliation  GET  /reconciliation/2021-01-08/transactions
//                   POST /reconciliation/2021-01-08/invoices/batch/paymentDetails
//   Reports/Document POST /reports/2021-09-30/reports  (GET_AB_INVOICE_PDF)
//                   GET  /reports/2021-09-30/reports/{id}
//                   GET  /reports/2021-09-30/documents/{id}
// Docs: https://docs.business.amazon.com/docs/reconciliation-api-overview
//       https://docs.business.amazon.com/docs/downloading-invoices-in-na

import { gunzipSync, unzipSync } from "fflate";
import { getIntegrationSetting, setIntegrationSetting } from "@/lib/integrationSettings";

export const AMZB_DEFAULT_BASE = "https://na.business-api.amazon.com";
export const AMZB_US_MARKETPLACE = "ATVPDKIKX0DER";
export const AMZB_CONSENT_URL = "https://www.amazon.com/b2b/abws/oauth";
const TOKEN_URL = "https://api.amazon.com/auth/O2/token";

export type AmzbConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  baseUrl: string;
  marketplaceId: string;
};

export class AmzbError extends Error {
  constructor(message: string, public readonly status: number, public readonly body?: string) {
    super(message);
    this.name = "AmzbError";
  }
}

export async function getAmzbSettings() {
  const [clientId, clientSecret, refreshToken, baseUrl, marketplaceId, applicationId] = await Promise.all([
    getIntegrationSetting("amazon_business_client_id", process.env.AMAZON_BUSINESS_CLIENT_ID),
    getIntegrationSetting("amazon_business_client_secret", process.env.AMAZON_BUSINESS_CLIENT_SECRET),
    getIntegrationSetting("amazon_business_refresh_token", process.env.AMAZON_BUSINESS_REFRESH_TOKEN),
    getIntegrationSetting("amazon_business_api_base", process.env.AMAZON_BUSINESS_API_BASE),
    getIntegrationSetting("amazon_business_marketplace_id", process.env.AMAZON_BUSINESS_MARKETPLACE_ID),
    getIntegrationSetting("amazon_business_application_id", process.env.AMAZON_BUSINESS_APPLICATION_ID),
  ]);
  return { clientId, clientSecret, refreshToken, baseUrl, marketplaceId, applicationId };
}

export async function getAmzbConfig(): Promise<AmzbConfig | null> {
  const s = await getAmzbSettings();
  if (!s.clientId || !s.clientSecret || !s.refreshToken) return null;
  return {
    clientId: s.clientId,
    clientSecret: s.clientSecret,
    refreshToken: s.refreshToken,
    baseUrl: (s.baseUrl || AMZB_DEFAULT_BASE).replace(/\/+$/, ""),
    marketplaceId: s.marketplaceId || AMZB_US_MARKETPLACE,
  };
}

// ---------- tokens ----------
let cached: { token: string; expires: number; key: string } | null = null;

async function lwa(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (!res.ok || !json?.access_token) {
    throw new AmzbError(`Amazon sign-in failed (${res.status}): ${json?.error_description ?? json?.error ?? text.slice(0, 200)}`, res.status, text);
  }
  return json as { access_token: string; refresh_token?: string; expires_in?: number };
}

async function accessToken(cfg: AmzbConfig): Promise<string> {
  const key = cfg.clientId + cfg.refreshToken.slice(-12);
  if (cached && cached.key === key && cached.expires > Date.now() + 60_000) return cached.token;
  const t = await lwa({ grant_type: "refresh_token", refresh_token: cfg.refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret });
  cached = { token: t.access_token, expires: Date.now() + (t.expires_in ?? 3600) * 1000, key };
  return t.access_token;
}

// One-time admin consent: swap the OAuth code for a refresh token and save it.
export async function exchangeConsentCode(code: string, redirectUri: string, updatedBy: string) {
  const s = await getAmzbSettings();
  if (!s.clientId || !s.clientSecret) throw new Error("Save the Amazon Business client ID and secret first.");
  const t = await lwa({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: s.clientId, client_secret: s.clientSecret });
  if (!t.refresh_token) throw new Error("Amazon didn't return a refresh token.");
  await setIntegrationSetting("amazon_business_refresh_token", t.refresh_token, updatedBy);
  cached = null;
}

// ---------- requests ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(cfg: AmzbConfig, method: "GET" | "POST", path: string, opts: { query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  const url = new URL(cfg.baseUrl + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        "x-amz-access-token": await accessToken(cfg),
        accept: "application/json",
        ...(opts.body ? { "content-type": "application/json" } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
    // Rate limit is 2 req/s with a burst of 10 - back off and retry.
    if (res.status === 429 || res.status >= 500) {
      await sleep(600 * (attempt + 1));
      continue;
    }
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 300);
      try {
        const j = JSON.parse(text);
        msg = j?.errors?.[0]?.message ?? j?.message ?? msg;
      } catch {}
      if (res.status === 401 || res.status === 403) cached = null;
      throw new AmzbError(`Amazon Business API ${res.status}: ${msg}`, res.status, text);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }
  throw new AmzbError("Amazon Business API is rate-limiting; try again shortly.", 429);
}

// ---------- Reconciliation ----------
export type Money = { currencyCode: string; amount: string };
export type AmzbLineItem = {
  totalAmount?: Money;
  principalAmount?: Money;
  tax?: Money;
  unitPrice?: Money;
  orderId?: string;
  orderLineItemId?: string;
  shipmentId?: string;
  shipmentDate?: string;
  purchaseOrderNumber?: string;
  asin?: string;
  productTitle?: string;
  itemQuantity?: number;
  merchantLegalName?: string;
};
export type AmzbTransaction = {
  marketplaceId?: string;
  transactionDate?: string;
  feedDate?: string;
  transactionType?: "CHARGE" | "REFUND" | "OVERREFUND";
  transactionId?: string;
  invoiceNumber?: string;
  amount?: Money;
  paymentInstrumentType?: string;
  paymentInstrumentLast4Digits?: string;
  buyer?: { id: string; name?: string; email?: string };
  payer?: { id: string; name?: string; email?: string };
  transactionLineItems?: AmzbLineItem[];
};

export async function getTransactions(cfg: AmzbConfig, start: Date, end: Date): Promise<AmzbTransaction[]> {
  const out: AmzbTransaction[] = [];
  let next: string | null = null;
  for (let page = 0; page < 200; page++) {
    const query: Record<string, string> = next ? { nextPageToken: next } : { feedStartDate: start.toISOString(), feedEndDate: end.toISOString() };
    const r: { transactions?: AmzbTransaction[]; nextPageToken?: string | null } = await call(cfg, "GET", "/reconciliation/2021-01-08/transactions", { query });
    out.push(...(r.transactions ?? []));
    next = r.nextPageToken || null;
    if (!next) break;
    await sleep(550);
  }
  return out;
}

// Invoice numbers for order line items (when a transaction didn't carry one). Max 25 per call.
export async function getInvoiceNumbers(cfg: AmzbConfig, items: { orderId: string; orderLineItemId: string; shipmentId: string }[]) {
  const found = new Map<string, string>(); // `${orderId}|${orderLineItemId}|${shipmentId}` -> invoice number
  for (let i = 0; i < items.length; i += 25) {
    const r: { invoiceDetailsByOrderLineItems?: { orderLineItem: { orderId: string; orderLineItemId: string; shipmentId: string }; invoiceDetails?: { invoiceNumber: string; invoiceType?: string }[] }[] } =
      await call(cfg, "POST", "/reconciliation/2021-01-08/invoices", { body: { orderLineItems: items.slice(i, i + 25) } });
    for (const d of r.invoiceDetailsByOrderLineItems ?? []) {
      const inv = (d.invoiceDetails ?? []).find((x) => (x.invoiceType ?? "STANDARD") !== "CREDIT") ?? d.invoiceDetails?.[0];
      if (inv?.invoiceNumber) found.set(`${d.orderLineItem.orderId}|${d.orderLineItem.orderLineItemId}|${d.orderLineItem.shipmentId}`, inv.invoiceNumber);
    }
    await sleep(550);
  }
  return found;
}

// Pay by Invoice payment status: Issued, Past Due, Payment Processing, Closed.
export async function getPaymentDetails(cfg: AmzbConfig, invoiceIds: string[]) {
  const out = new Map<string, { status: string; dueDate: string | null }>();
  for (let i = 0; i < invoiceIds.length; i += 25) {
    const r: { invoicePaymentDetailsResults?: { invoiceId: string; resultType: string; paymentDetails?: { status: string; dueDate?: string } }[] } = await call(
      cfg,
      "POST",
      "/reconciliation/2021-01-08/invoices/batch/paymentDetails",
      { body: { invoiceIds: invoiceIds.slice(i, i + 25) } }
    );
    for (const x of r.invoicePaymentDetailsResults ?? []) {
      if (x.resultType === "SUCCESS" && x.paymentDetails) out.set(x.invoiceId, { status: x.paymentDetails.status, dueDate: x.paymentDetails.dueDate ?? null });
    }
    await sleep(550);
  }
  return out;
}

// ---------- Invoice PDFs (Reports / Document API) ----------
export async function requestInvoicePdf(cfg: AmzbConfig, opts: { invoiceId?: string; orderId?: string }): Promise<string> {
  const reportOptions = opts.invoiceId ? { invoiceId: opts.invoiceId, documentType: "Invoice" } : { orderId: opts.orderId!, documentType: "OrderSummary" };
  const r: { reportId?: string } = await call(cfg, "POST", "/reports/2021-09-30/reports", {
    body: { reportType: "GET_AB_INVOICE_PDF", marketplaceIds: [cfg.marketplaceId], reportOptions },
  });
  if (!r.reportId) throw new AmzbError("Amazon didn't return a report id.", 500);
  return r.reportId;
}

export async function getReportStatus(cfg: AmzbConfig, reportId: string): Promise<{ status: string; documentId: string | null }> {
  const r: { processingStatus?: string; reportDocumentId?: string } = await call(cfg, "GET", `/reports/2021-09-30/reports/${encodeURIComponent(reportId)}`);
  return { status: r.processingStatus ?? "UNKNOWN", documentId: r.reportDocumentId ?? null };
}

const isPdf = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
const isGzip = (b: Uint8Array) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;
const isZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

// The file comes back compressed twice (gzip around a zip around the PDF).
// Peel layers by their magic bytes until we reach the PDF, so it also
// copes if Amazon ever drops a layer. Never written to disk.
export function extractPdf(bytes: Uint8Array): Buffer {
  let b = bytes;
  for (let i = 0; i < 4; i++) {
    if (isPdf(b)) return Buffer.from(b);
    if (isGzip(b)) {
      b = gunzipSync(b);
      continue;
    }
    if (isZip(b)) {
      const files = unzipSync(b);
      const name = Object.keys(files).find((n) => n.toLowerCase().endsWith(".pdf")) ?? Object.keys(files)[0];
      if (!name) break;
      b = files[name];
      continue;
    }
    break;
  }
  const text = Buffer.from(b.slice(0, 400)).toString("utf8");
  throw new AmzbError(`Amazon sent something other than a PDF: ${text.replace(/\s+/g, " ").slice(0, 200)}`, 422);
}

export async function downloadReportPdf(cfg: AmzbConfig, documentId: string): Promise<Buffer> {
  const r: { url?: string } = await call(cfg, "GET", `/reports/2021-09-30/documents/${encodeURIComponent(documentId)}`);
  if (!r.url) throw new AmzbError("Amazon didn't return a download link.", 500);
  // Presigned and good for five minutes.
  const res = await fetch(r.url, { cache: "no-store" });
  if (!res.ok) throw new AmzbError(`Couldn't download the invoice (${res.status}).`, res.status);
  return extractPdf(new Uint8Array(await res.arrayBuffer()));
}

export async function testConnection(cfg: AmzbConfig) {
  const end = new Date();
  const start = new Date(end.getTime() - 2 * 86400000);
  await call(cfg, "GET", "/reconciliation/2021-01-08/transactions", { query: { feedStartDate: start.toISOString(), feedEndDate: end.toISOString() } });
}
