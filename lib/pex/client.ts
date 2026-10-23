import { getIntegrationSetting } from "@/lib/integrationSettings";

// Thin client for the PEX REST API (https://developer.pexcard.com).
//
// Base URL:  https://coreapi.pexcard.com/v4  (sandbox base comes with the
//            developer account; set pex_api_url to point at it)
// Auth:      "Authorization: Token <api token>", the scheme PEX's own SDK
//            and MCP server use. The token belongs to a dedicated PEX
//            admin user created for the API, per PEX's recommendation.
//
// Credentials live in integration_settings (rotatable from the PEX
// dashboard's settings tab) with Vercel env vars as the fallback:
//   pex_api_url / PEX_API_URL
//   pex_api_token / PEX_API_TOKEN
//   pex_webhook_secret / PEX_WEBHOOK_SECRET   (from PEX API Support)
//   pex_grant_tag_id / PEX_GRANT_TAG_ID       (optional: write grant codes back to a PEX tag)
//
// This client only reads, plus the optional tag write-back. Money
// movement (funding, zeroing, card status) is deliberately not wired up.

export const PEX_DEFAULT_URL = "https://coreapi.pexcard.com/v4";

export type PexConfig = { baseUrl: string; token: string };

export async function getPexConfig(): Promise<PexConfig | null> {
  const [url, token] = await Promise.all([
    getIntegrationSetting("pex_api_url", process.env.PEX_API_URL),
    getIntegrationSetting("pex_api_token", process.env.PEX_API_TOKEN),
  ]);
  if (!token) return null;
  return { baseUrl: (url || PEX_DEFAULT_URL).replace(/\/+$/, ""), token };
}

export class PexError extends Error {
  constructor(message: string, public readonly status: number, public readonly body?: string) {
    super(message);
    this.name = "PexError";
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

async function request<T>(cfg: PexConfig, method: "GET" | "POST", path: string, query?: Query, body?: unknown): Promise<T> {
  const url = new URL(`${cfg.baseUrl}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Token ${cfg.token}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  };
  let res: Response | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(45_000) });
    if (res.status !== 429 && res.status < 500) break;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 600 * 2 ** (attempt - 1)));
  }
  if (!res!.ok) {
    const text = await res!.text().catch(() => "");
    throw new PexError(errorMessage(res!.status, text), res!.status, text.slice(0, 500));
  }
  if (res!.status === 204) return undefined as T;
  const type = res!.headers.get("content-type") ?? "";
  return (type.includes("json") ? await res!.json() : await res!.text()) as T;
}

function errorMessage(status: number, body: string) {
  if (status === 401) return "PEX rejected the API token. It may have expired - generate a new one and save it in PEX settings.";
  if (status === 403) return "The PEX API user doesn't have permission for that. Check the API admin's role in PEX.";
  if (status === 404) return "PEX couldn't find that record.";
  if (status === 429) return "PEX is rate-limiting requests. Try again in a few minutes.";
  let msg = body;
  try {
    const j = JSON.parse(body);
    msg = j.Message ?? j.message ?? body;
  } catch {
    /* plain text */
  }
  return `PEX API error ${status}${msg ? `: ${String(msg).slice(0, 200)}` : ""}`;
}

// PEX takes local datetimes ("yyyy-MM-ddTHH:mm:ss", Eastern).
const startOf = (d: string) => `${d}T00:00:00`;
const endOf = (d: string) => `${d}T23:59:59`;

// ---------- types (fields we use; PEX returns more) ----------
export type PexCardholder = {
  AccountId: number;
  FirstName?: string | null;
  LastName?: string | null;
  Email?: string | null;
  LedgerBalance?: number | null;
  AvailableBalance?: number | null;
  AccountStatus?: string | null;
  IsVirtual?: boolean | null;
  CardholderType?: string | null;
  CustomId?: string | null;
  UserGroups?: { Id?: number; Name?: string }[] | null;
  CardStatus?: string | null;
  CardNumber4Digits?: string | null;
};

export type PexTag = { FieldId: string; Name?: string | null; Value: unknown };

export type PexTransaction = {
  TransactionId: number;
  AcctId: number;
  TransactionTime: string;
  SettlementTime?: string | null;
  HoldTime?: string | null;
  AuthTransactionId?: number | null;
  TransactionAmount: number;
  TransactionType: string | number;
  Description?: string | null;
  TransactionNotes?: { NoteText?: string; Note?: string }[] | null;
  IsPending?: boolean;
  IsDecline?: boolean;
  MerchantName?: string | null;
  MerchantNameNormalized?: string | null;
  MerchantCity?: string | null;
  MerchantState?: string | null;
  MCCCode?: string | null;
  TransactionTags?: { Tags?: PexTag[] | null } | null;
  MetadataApprovalStatus?: string | null;
};

// ---------- reads ----------
export async function pexPing(cfg: PexConfig) {
  return request<unknown>(cfg, "GET", "/Business/Profile");
}

export async function pexBusinessBalance(cfg: PexConfig): Promise<number | null> {
  const r = await request<{ BusinessAccountBalance?: number }>(cfg, "GET", "/Business/Balance");
  return typeof r?.BusinessAccountBalance === "number" ? r.BusinessAccountBalance : null;
}

export async function pexCardholders(cfg: PexConfig): Promise<PexCardholder[]> {
  const r = await request<{ CHAccountList?: PexCardholder[] }>(cfg, "GET", "/Details/AccountDetails");
  return r?.CHAccountList ?? [];
}

// Every cardholder's transactions in a date range (settled, plus pending
// holds). Declines are left out - they never cost anything.
export async function pexAllTransactions(cfg: PexConfig, from: string, to: string): Promise<PexTransaction[]> {
  const r = await request<{ TransactionList?: PexTransaction[] }>(cfg, "GET", "/Details/AllCardholderTransactions", {
    StartDate: startOf(from),
    EndDate: endOf(to),
    IncludePendings: true,
    IncludeDeclines: false,
  });
  return r?.TransactionList ?? [];
}

export async function pexCardholderTransactions(cfg: PexConfig, accountId: number, from: string, to: string): Promise<PexTransaction[]> {
  const r = await request<{ TransactionList?: PexTransaction[] }>(cfg, "GET", `/Details/TransactionDetails/${accountId}`, {
    StartDate: startOf(from),
    EndDate: endOf(to),
    IncludePendings: true,
    IncludeDeclines: false,
  });
  return r?.TransactionList ?? [];
}

export type PexAttachmentInfo = { AttachmentId: string; Type?: string | number; Size?: number; CreatedDateUtc?: string };

export async function pexAttachments(cfg: PexConfig, transactionId: string | number): Promise<PexAttachmentInfo[]> {
  try {
    const r = await request<{ Attachments?: PexAttachmentInfo[] }>(cfg, "GET", `/Transactions/${transactionId}/Attachments`);
    return r?.Attachments ?? [];
  } catch (e) {
    if (e instanceof PexError && e.status === 404) return [];
    throw e;
  }
}

// Downloads one receipt. PEX returns either base64 content or a link,
// depending on the link type, so handle both.
export async function pexAttachmentFile(cfg: PexConfig, transactionId: string | number, attachmentId: string): Promise<{ buffer: Buffer; contentType: string }> {
  const r = await request<{ Content?: string | null }>(cfg, "GET", `/Transactions/${transactionId}/Attachment/${attachmentId}`, { AttachmentLinkType: "Full" });
  const content = r?.Content ?? "";
  if (!content) throw new PexError("PEX returned an empty attachment.", 502);
  if (/^https?:\/\//i.test(content)) {
    const f = await fetch(content, { signal: AbortSignal.timeout(45_000) });
    if (!f.ok) throw new PexError(`Couldn't download the receipt from PEX (${f.status}).`, f.status);
    return { buffer: Buffer.from(await f.arrayBuffer()), contentType: f.headers.get("content-type") ?? "application/octet-stream" };
  }
  const m = /^data:([^;]+);base64,([\s\S]*)$/.exec(content);
  const b64 = m ? m[2] : content;
  const buffer = Buffer.from(b64, "base64");
  return { buffer, contentType: m?.[1] ?? sniffType(buffer) };
}

function sniffType(b: Buffer) {
  if (b.subarray(0, 4).toString("hex") === "25504446") return "application/pdf";
  if (b.subarray(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
  if (b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  return "application/octet-stream";
}

// ---------- optional write-back ----------
// Puts the grant code(s) on a PEX text tag so PEX's own reports and
// accounting exports match the portal. Only runs when pex_grant_tag_id
// is configured.
export async function pexSetTransactionTag(cfg: PexConfig, transactionId: string | number, tagId: string, value: string) {
  const current = await request<{ ConcurrencyKey?: string }>(cfg, "GET", `/Transactions/${transactionId}/Tags`).catch(() => null);
  await request(cfg, "POST", `/Transactions/${transactionId}/Tags`, { force: true }, {
    ConcurrencyKey: current?.ConcurrencyKey ?? null,
    Values: [{ TagId: tagId, Value: value }],
  });
}
