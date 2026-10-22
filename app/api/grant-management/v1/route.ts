import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import { buildReport, filtersFromParams, isReportKey, REPORTS } from "@/lib/grantManagement/reports";
import type { GmViewer } from "@/lib/grantManagement/server";

export const maxDuration = 60;

// Read-only API for Power BI, Salesforce, SharePoint flows, etc.
//   GET /api/grant-management/v1?report=master
//   Authorization: Bearer <key>   (or ?key=<key> for Power BI web sources)
// The key is generated on Grant Management → Settings; only its hash is
// stored. Returns the same rows as the Reports page, organisation-wide.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || url.searchParams.get("key") || "";
  const storedHash = await getIntegrationSetting("grant_management_api_key_hash");
  if (!storedHash || !given) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const a = Buffer.from(createHash("sha256").update(given).digest("hex"));
  const b = Buffer.from(storedHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = url.searchParams.get("report");
  if (!key) return NextResponse.json({ reports: Object.entries(REPORTS).map(([k, v]) => ({ report: k, ...v })) });
  if (!isReportKey(key)) return NextResponse.json({ error: "Unknown report" }, { status: 400 });

  const system: GmViewer = { employeeId: "", name: "API", email: "", role: "gm_admin", isManager: true, isAdmin: true, officeIds: [], assignedOfficeId: null };
  const report = await buildReport(system, key, filtersFromParams(url.searchParams));
  return NextResponse.json({ report: report.key, title: report.title, generated_at: new Date().toISOString(), columns: report.columns, rows: report.rows });
}
