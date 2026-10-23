
// Demo PEX: a stand-in for the PEX API so the whole PEX module can be
// tried before real API keys exist. Turned on by setting the PEX API URL
// to "demo" (the "Try demo data" button does that). Everything else in
// the portal - sync, suggestions, splitting, receipts, approvals - runs
// exactly as it would against PEX.
//
// The fake data is deterministic (seeded by date + card), so re-syncing
// updates rather than duplicates, and it behaves like PEX does:
//   - spending comes back as negative amounts, refunds as positive
//   - the last ~2 days are pending holds; after that each hold settles
//     under a new TransactionId with AuthTransactionId pointing at the
//     hold (gas and restaurant holds settle at a different amount)
//   - about half of settled purchases have a receipt in "the PEX app"
// Cardholders are made-up names; the demo endpoint assigns every demo
// card to the admin who turned demo on.
//
// Demo cards use PEX account ids 9100001+; demo transaction ids start
// at 9,000,000,000. "Remove demo data" deletes exactly those.

export const DEMO_URL = "demo";
export const DEMO_ACCOUNT_MIN = 9100000;
export const DEMO_ACCOUNT_MAX = 9199999;
const TX_BASE = 9_000_000_000;

export const isDemoUrl = (url: string | null | undefined) => (url ?? "").trim().toLowerCase() === DEMO_URL;

// ---------- deterministic randomness ----------
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const dayNum = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 864e5);
const dayStr = (n: number) => new Date(n * 864e5).toISOString().slice(0, 10);
const todayNum = () => dayNum(new Date().toISOString().slice(0, 10));

// ---------- cardholders ----------
const LAST4 = ["4417", "2093", "8361", "5528", "7140", "3302"];
const FALLBACK = [
  ["Amina", "Rahman"],
  ["Yusuf", "Khan"],
  ["Sara", "Ahmed"],
  ["Omar", "Siddiqui"],
  ["Huda", "Malik"],
  ["Bilal", "Hassan"],
];

type DemoHolder = { AccountId: number; FirstName: string; LastName: string; Email: string | null; idx: number };

// Made-up cardholders with no email, so the sync never matches them to
// real staff. The "Try demo data" endpoint routes every demo card to
// the admin who turned demo on, so only they see the demo queue.
async function holders(): Promise<DemoHolder[]> {
  return LAST4.map((_, i) => ({ AccountId: DEMO_ACCOUNT_MIN + 1 + i, FirstName: FALLBACK[i][0], LastName: `${FALLBACK[i][1]} (demo)`, Email: null, idx: i }));
}

// ---------- merchants ----------
type Merchant = { name: string; mcc: string; city: string; min: number; max: number; weight: number; holdDiffers?: "gas" | "tip"; refundable?: boolean; note?: string };
const MERCHANTS: Merchant[] = [
  { name: "H-E-B #482", mcc: "5411", city: "HOUSTON", min: 40, max: 420, weight: 9, note: "Food pantry restock" },
  { name: "Costco Whse #1105", mcc: "5300", city: "HOUSTON", min: 120, max: 900, weight: 5, note: "Bulk pantry items" },
  { name: "Office Depot #2231", mcc: "5943", city: "SUGAR LAND", min: 12, max: 260, weight: 6, refundable: true, note: "Office supplies" },
  { name: "Shell Oil 57442", mcc: "5541", city: "KATY", min: 28, max: 75, weight: 7, holdDiffers: "gas" },
  { name: "Exxon Mobil 4471", mcc: "5542", city: "HOUSTON", min: 25, max: 70, weight: 4, holdDiffers: "gas" },
  { name: "Marriott Courtyard", mcc: "7011", city: "AUSTIN", min: 140, max: 420, weight: 2, note: "Conference lodging" },
  { name: "Southwest Airlines", mcc: "3066", city: "DALLAS", min: 120, max: 480, weight: 1 },
  { name: "Enterprise Rent-A-Car", mcc: "7512", city: "HOUSTON", min: 60, max: 260, weight: 1 },
  { name: "Verizon Wireless", mcc: "4814", city: "ONLINE", min: 45, max: 180, weight: 2 },
  { name: "The Home Depot #6512", mcc: "5200", city: "HOUSTON", min: 18, max: 340, weight: 3, refundable: true },
  { name: "Amazon.com", mcc: "5942", city: "SEATTLE", min: 15, max: 220, weight: 5, refundable: true },
  { name: "Chili's Grill & Bar", mcc: "5812", city: "HOUSTON", min: 35, max: 160, weight: 2, holdDiffers: "tip", note: "Volunteer lunch" },
  { name: "Spec's Wines Spirits", mcc: "5921", city: "HOUSTON", min: 20, max: 60, weight: 0.4 },
  { name: "Walmart Supercenter", mcc: "5310", city: "PEARLAND", min: 25, max: 300, weight: 4, note: "Client hygiene kits" },
];
const TOTAL_WEIGHT = MERCHANTS.reduce((s, m) => s + m.weight, 0);
function pickMerchant(r: () => number) {
  let x = r() * TOTAL_WEIGHT;
  for (const m of MERCHANTS) if ((x -= m.weight) <= 0) return m;
  return MERCHANTS[0];
}
const money = (n: number) => Math.round(n * 100) / 100;

type DemoTx = {
  TransactionId: number;
  AcctId: number;
  TransactionTime: string;
  SettlementTime: string | null;
  AuthTransactionId: number | null;
  TransactionAmount: number;
  TransactionType: string;
  Description: string;
  TransactionNotes: { NoteText: string }[] | null;
  IsPending: boolean;
  IsDecline: boolean;
  MerchantName: string;
  MerchantCity: string;
  MerchantState: string;
  MCCCode: string;
  TransactionTags: { Tags: unknown[] } | null;
  MetadataApprovalStatus: string | null;
  _hasReceipt: boolean;
};

// One cardholder's transactions on one day.
function dayTransactions(day: number, h: { AccountId: number; idx: number }, blocked: boolean): DemoTx[] {
  if (blocked && day > todayNum() - 20) return []; // blocked card: no recent spend
  const r = rng(day * 131 + h.idx * 7919 + 17);
  const weekend = [0, 6].includes(new Date(day * 864e5).getUTCDay());
  const roll = r();
  const count = roll < (weekend ? 0.75 : 0.45) ? 0 : roll < 0.88 ? 1 : 2;
  const age = todayNum() - day;
  const out: DemoTx[] = [];
  for (let k = 0; k < count; k++) {
    const m = pickMerchant(r);
    const final = money(m.min + r() * (m.max - m.min));
    const hour = 8 + Math.floor(r() * 10);
    const minute = Math.floor(r() * 60);
    const time = `${dayStr(day)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
    const holdId = TX_BASE + day * 100 + h.idx * 10 + k * 2;
    const pending = age <= 1;
    const holdAmount = m.holdDiffers === "gas" ? 1 : m.holdDiffers === "tip" ? money(final / 1.18) : final;
    const note = m.note && r() < 0.6 ? m.note : null;
    const receipt = r() < 0.5;
    out.push({
      TransactionId: pending ? holdId : holdId + 1,
      AcctId: h.AccountId,
      TransactionTime: time,
      SettlementTime: pending ? null : `${dayStr(day + 1)}T03:00:00`,
      AuthTransactionId: pending ? null : holdId,
      TransactionAmount: -(pending ? holdAmount : final),
      TransactionType: "Network",
      Description: pending ? "Pending" : "Purchase",
      TransactionNotes: note ? [{ NoteText: note }] : null,
      IsPending: pending,
      IsDecline: false,
      MerchantName: m.name.toUpperCase(),
      MerchantCity: m.city,
      MerchantState: m.city === "ONLINE" || m.city === "SEATTLE" ? "WA" : "TX",
      MCCCode: m.mcc,
      TransactionTags: null,
      MetadataApprovalStatus: null,
      _hasReceipt: !pending && receipt,
    });
    // Occasionally a return a few days later.
    if (!pending && m.refundable && r() < 0.12 && age >= 4) {
      const back = money(final * (0.3 + r() * 0.7));
      out.push({
        ...out[out.length - 1],
        TransactionId: TX_BASE + (day + 3) * 100 + h.idx * 10 + 8 + k, // 8-9: never collides with holds (0-3)
        AuthTransactionId: null,
        TransactionTime: `${dayStr(day + 3)}T12:15:00`,
        SettlementTime: `${dayStr(day + 4)}T03:00:00`,
        TransactionAmount: back,
        Description: "Merchant credit",
        TransactionNotes: null,
        _hasReceipt: false,
      });
    }
  }
  return out;
}

async function transactions(from: string, to: string, accountId?: number): Promise<DemoTx[]> {
  const hs = (await holders()).filter((h) => !accountId || h.AccountId === accountId);
  const start = dayNum(from.slice(0, 10));
  const end = Math.min(dayNum(to.slice(0, 10)), todayNum());
  const out: DemoTx[] = [];
  // Look a few days back so returns dated inside the window are included.
  for (let d = start - 4; d <= end; d++) for (const h of hs) out.push(...dayTransactions(d, h, h.idx === 5));
  return out.filter((t) => t.TransactionTime.slice(0, 10) >= dayStr(start) && t.TransactionTime.slice(0, 10) <= dayStr(end));
}

async function findTx(id: number): Promise<DemoTx | null> {
  const n = id - TX_BASE;
  if (n < 0) return null;
  const day = Math.floor(n / 100);
  const hs = await holders();
  for (const d of [day, day - 3]) {
    for (const h of hs) {
      const t = dayTransactions(d, h, h.idx === 5).find((x) => x.TransactionId === id);
      if (t) return t;
    }
  }
  return null;
}

// ---------- receipt PDF ----------
function receiptPdf(t: DemoTx): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const lines = [
    t.MerchantName,
    `${t.MerchantCity}, ${t.MerchantState}`,
    "",
    `Date: ${t.TransactionTime.slice(0, 10)}  ${t.TransactionTime.slice(11, 16)}`,
    `Card: PEX ending ${LAST4[(t.AcctId - DEMO_ACCOUNT_MIN - 1) % LAST4.length]}`,
    "",
    `TOTAL   $${Math.abs(t.TransactionAmount).toFixed(2)}`,
    "",
    "DEMO RECEIPT - generated by the portal's PEX demo mode",
  ];
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 14 : 11} Tf 40 ${330 - i * 22} Td (${esc(l)}) Tj ET`).join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 380] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

// ---------- the fake API ----------
type Query = Record<string, string | number | boolean | undefined | null>;

export async function demoRequest(method: string, path: string, query: Query = {}): Promise<unknown> {
  const p = path.replace(/\/+$/, "");
  if (p === "/Business/Profile") return { BusinessName: "ICNA Relief USA (PEX demo)", BusinessAccountId: 9100000 };
  if (p === "/Business/Balance") return { BusinessAccountId: 9100000, BusinessAccountBalance: 48250.75 };

  if (p === "/Details/AccountDetails") {
    const hs = await holders();
    return {
      CHAccountList: hs.map((h) => {
        const r = rng(h.AccountId);
        const blocked = h.idx === 5;
        return {
          AccountId: h.AccountId,
          FirstName: h.FirstName,
          LastName: h.LastName,
          Email: h.Email,
          LedgerBalance: blocked ? 0 : money(150 + r() * 1850),
          AvailableBalance: blocked ? 0 : money(120 + r() * 1700),
          AccountStatus: "Open",
          IsVirtual: h.idx === 4,
          CardholderType: "Standard",
          CustomId: null,
          UserGroups: [{ Id: 1 + (h.idx % 2), Name: h.idx % 2 ? "Programs" : "Hunger Prevention" }],
          CardStatus: blocked ? "BLOCKED" : "ACTIVE",
          CardNumber4Digits: LAST4[h.idx],
        };
      }),
    };
  }

  const strip = (list: DemoTx[]) => list.map(({ _hasReceipt, ...t }) => t);
  if (p === "/Details/AllCardholderTransactions") {
    return { TransactionList: strip(await transactions(String(query.StartDate), String(query.EndDate))) };
  }
  let m = /^\/Details\/TransactionDetails\/(\d+)$/.exec(p);
  if (m) return { TransactionList: strip(await transactions(String(query.StartDate), String(query.EndDate), Number(m[1]))) };

  m = /^\/Transactions\/(\d+)\/Attachments$/.exec(p);
  if (m) {
    const t = await findTx(Number(m[1]));
    if (!t?._hasReceipt) return { Attachments: [] };
    return { Attachments: [{ AttachmentId: `demo-${t.TransactionId}`, Type: "Image", Size: receiptPdf(t).length, CreatedDateUtc: t.SettlementTime }] };
  }
  m = /^\/Transactions\/(\d+)\/Attachment\/(.+)$/.exec(p);
  if (m) {
    const t = await findTx(Number(m[1]));
    if (!t?._hasReceipt) throw Object.assign(new Error("Attachment not found"), { status: 404 });
    return { Content: `data:application/pdf;base64,${receiptPdf(t).toString("base64")}` };
  }
  m = /^\/Transactions\/(\d+)\/Tags$/.exec(p);
  if (m) return method === "POST" ? undefined : { ConcurrencyKey: "demo", Tags: [] };

  throw Object.assign(new Error(`Demo PEX doesn't implement ${method} ${p}`), { status: 404 });
}
