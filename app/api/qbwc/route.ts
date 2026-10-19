import { NextRequest, NextResponse } from "next/server";
import { randomUUID, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import { parseQbGrid } from "@/lib/finance/parse";
import { qbxmlReportToGrid } from "@/lib/finance/qbGrid";
import { applyQbMatrix } from "@/lib/finance/qbApply";
import { MONTHS } from "@/lib/finance/accounts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// QuickBooks Desktop Web Connector (QBWC) SOAP endpoint. The Web Connector
// runs on the finance PC that has QuickBooks open, calls this on a schedule,
// and for each month queued on Admin → Expenses asks QuickBooks for the
// "Profit & Loss by Class" report, then sends it back here. Read-only: the
// only request ever sent is a report query.
//
// Sign-in is the username/password set on Admin → Connectors (the same
// ones in the downloaded .qwc file / typed into the Web Connector).

const NS = "http://developer.intuit.com/";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).replace(/&amp;/g, "&");
const param = (body: string, name: string) => {
  const m = body.match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`));
  if (!m) return null;
  const v = m[1].trim();
  const cdata = v.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return cdata ? cdata[1] : unesc(v);
};

function soap(method: string, inner: string) {
  const xml = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body><${method}Response xmlns="${NS}">${inner}</${method}Response></soap:Body></soap:Envelope>`;
  return new NextResponse(xml, { headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
const result = (method: string, value: string) => soap(method, `<${method}Result>${esc(value)}</${method}Result>`);

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const pad = (n: number) => String(n).padStart(2, "0");

async function markRun() {
  await createAdminClient().from("integration_settings").upsert({ key: "qbwc_last_run", value: new Date().toISOString(), updated_at: new Date().toISOString() });
}

async function session(ticket: string | null) {
  if (!ticket) return null;
  const { data } = await createAdminClient().from("fin_qbwc_sessions").select("ticket, queue_id, last_error").eq("ticket", ticket).maybeSingle();
  return data as { ticket: string; queue_id: string | null; last_error: string | null } | null;
}

function reportRequest(year: number, month: number, id: string) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `<?xml version="1.0" encoding="utf-8"?><?qbxml version="13.0"?><QBXML><QBXMLMsgsRq onError="stopOnError"><GeneralSummaryReportQueryRq requestID="${id}"><GeneralSummaryReportType>ProfitAndLossStandard</GeneralSummaryReportType><ReportPeriod><FromReportDate>${year}-${pad(month)}-01</FromReportDate><ToReportDate>${year}-${pad(month)}-${pad(last)}</ToReportDate></ReportPeriod><SummarizeColumnsBy>Class</SummarizeColumnsBy></GeneralSummaryReportQueryRq></QBXMLMsgsRq></QBXML>`;
}

export async function GET() {
  return new NextResponse("QuickBooks Web Connector endpoint. Add the .qwc file from Admin → Connectors to the Web Connector.", { headers: { "Content-Type": "text/plain" } });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const action = (req.headers.get("soapaction") ?? "").replace(/"/g, "").split("/").pop() ?? "";
  const method = action || body.match(/<soap(?:env)?:Body>\s*<(?:\w+:)?(\w+)/i)?.[1] || "";
  const admin = createAdminClient();

  switch (method) {
    case "serverVersion":
      return result(method, "1.0");
    case "clientVersion":
      return result(method, ""); // any Web Connector version is fine

    case "authenticate": {
      const [user, pass] = await Promise.all([getIntegrationSetting("qbwc_username"), getIntegrationSetting("qbwc_password")]);
      const u = param(body, "strUserName") ?? "";
      const p = param(body, "strPassword") ?? "";
      const arr = (a: string, b: string) => soap(method, `<authenticateResult><string>${esc(a)}</string><string>${esc(b)}</string></authenticateResult>`);
      if (!user || !pass || !same(u, user) || !same(p, pass)) return arr("", "nvu");
      await markRun();
      const { data: next } = await admin.from("fin_qb_sync_queue").select("id").eq("source", "desktop").eq("status", "queued").order("requested_at").limit(1).maybeSingle();
      if (!next) return arr(randomUUID(), "none");
      const ticket = randomUUID();
      await admin.from("fin_qbwc_sessions").insert({ ticket, queue_id: next.id });
      // "" = use whichever company file is open in QuickBooks
      return arr(ticket, "");
    }

    case "sendRequestXML": {
      const s = await session(param(body, "ticket"));
      if (!s?.queue_id) return result(method, "");
      const { data: q } = await admin.from("fin_qb_sync_queue").select("id, year, month, status").eq("id", s.queue_id).maybeSingle();
      if (!q || q.status === "done") return result(method, "");
      await admin.from("fin_qb_sync_queue").update({ status: "sent" }).eq("id", q.id);
      return result(method, reportRequest(q.year as number, q.month as number, q.id as string));
    }

    case "receiveResponseXML": {
      const ticket = param(body, "ticket");
      const s = await session(ticket);
      if (!s?.queue_id) return soap(method, `<receiveResponseXMLResult>-1</receiveResponseXMLResult>`);
      const { data: q } = await admin.from("fin_qb_sync_queue").select("id, year, month, requested_by").eq("id", s.queue_id).maybeSingle();
      const fail = async (msg: string) => {
        await admin.from("fin_qb_sync_queue").update({ status: "failed", error: msg, finished_at: new Date().toISOString() }).eq("id", s.queue_id!);
        await admin.from("fin_qbwc_sessions").update({ last_error: msg }).eq("ticket", s.ticket);
        return soap(method, `<receiveResponseXMLResult>-1</receiveResponseXMLResult>`);
      };
      const hresult = param(body, "hresult");
      if (hresult) return fail(param(body, "message") || `QuickBooks error ${hresult}`);
      const xml = param(body, "response") ?? "";
      const { grid, title, error } = qbxmlReportToGrid(xml);
      if (error) return fail(error);
      if (!q) return fail("The request was removed");
      const matrix = parseQbGrid(grid, `${MONTHS[(q.month as number) - 1]} ${q.year}`, title ?? "QuickBooks Desktop");
      if (!matrix) return fail("QuickBooks sent a report with no expense lines for that month.");
      try {
        const r = await applyQbMatrix({
          year: q.year as number,
          month: q.month as number,
          matrix,
          source: "qb_desktop",
          fileName: `QuickBooks Desktop · ${MONTHS[(q.month as number) - 1]} ${q.year}`,
          employeeId: (q.requested_by as string) ?? null,
        });
        await admin.from("fin_qb_sync_queue").update({ status: "done", error: null, batch_id: r.batchId, finished_at: new Date().toISOString() }).eq("id", q.id);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
      // More months queued? Point this session at the next one.
      const { data: next } = await admin.from("fin_qb_sync_queue").select("id").eq("source", "desktop").eq("status", "queued").order("requested_at").limit(1).maybeSingle();
      if (next) {
        await admin.from("fin_qbwc_sessions").update({ queue_id: next.id }).eq("ticket", s.ticket);
        return soap(method, `<receiveResponseXMLResult>50</receiveResponseXMLResult>`);
      }
      return soap(method, `<receiveResponseXMLResult>100</receiveResponseXMLResult>`);
    }

    case "getLastError": {
      const s = await session(param(body, "ticket"));
      return result(method, s?.last_error ?? "No error");
    }
    case "connectionError": {
      const s = await session(param(body, "ticket"));
      const msg = param(body, "message") || "Couldn't open QuickBooks";
      if (s?.queue_id) await admin.from("fin_qb_sync_queue").update({ status: "failed", error: msg, finished_at: new Date().toISOString() }).eq("id", s.queue_id).neq("status", "done");
      return result(method, "done");
    }
    case "closeConnection": {
      const t = param(body, "ticket");
      if (t) await admin.from("fin_qbwc_sessions").delete().eq("ticket", t);
      return result(method, "OK");
    }
    case "interactiveDone":
      return result(method, "Done");
    case "interactiveRejected":
      return result(method, "");
    case "getInteractiveURL":
      return result(method, "");
  }
  return new NextResponse("Unknown method", { status: 400 });
}
