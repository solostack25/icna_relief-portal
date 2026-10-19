import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { financeGate, isResponse } from "@/lib/finance/access";
import { getIntegrationSetting, setIntegrationSetting } from "@/lib/integrationSettings";

export const dynamic = "force-dynamic";

// The .qwc file finance adds to the QuickBooks Web Connector (File → Add an
// application). Owner/file IDs are made once and kept so re-downloading
// doesn't register a second app.
export async function GET(req: NextRequest) {
  const gate = await financeGate();
  if (isResponse(gate)) return gate;
  const user = await getIntegrationSetting("qbwc_username");
  if (!user) return NextResponse.json({ error: "Set the Web Connector username and password on Connectors first" }, { status: 400 });
  let owner = await getIntegrationSetting("qbwc_owner_id");
  if (!owner) {
    owner = `{${randomUUID()}}`;
    await setIntegrationSetting("qbwc_owner_id", owner, gate.employeeId);
  }
  let file = await getIntegrationSetting("qbwc_file_id");
  if (!file) {
    file = `{${randomUUID()}}`;
    await setIntegrationSetting("qbwc_file_id", file, gate.employeeId);
  }
  const origin = req.nextUrl.origin;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const xml = `<?xml version="1.0"?>
<QBWCXML>
  <AppName>ICNA Relief Portal - Expenses</AppName>
  <AppID></AppID>
  <AppURL>${esc(origin)}/api/qbwc</AppURL>
  <AppDescription>Sends the monthly Profit &amp; Loss by Class report to the portal's Expenses dashboard (read-only).</AppDescription>
  <AppSupport>${esc(origin)}/admin/expenses</AppSupport>
  <UserName>${esc(user)}</UserName>
  <OwnerID>${owner}</OwnerID>
  <FileID>${file}</FileID>
  <QBType>QBFS</QBType>
  <IsReadOnly>true</IsReadOnly>
  <Scheduler>
    <RunEveryNMinutes>60</RunEveryNMinutes>
  </Scheduler>
</QBWCXML>
`;
  return new NextResponse(xml, { headers: { "Content-Type": "application/xml", "Content-Disposition": 'attachment; filename="icna-portal-expenses.qwc"' } });
}
