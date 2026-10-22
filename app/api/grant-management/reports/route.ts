import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireViewer, fail } from "@/lib/grantManagement/api";
import { buildReport, filtersFromParams, isReportKey, type Report } from "@/lib/grantManagement/reports";

export const maxDuration = 60;

// GET ?report=master&format=json|csv|xlsx&office_id=…
export async function GET(req: Request) {
  const auth = await requireViewer();
  if ("res" in auth) return auth.res;
  const url = new URL(req.url);
  const key = url.searchParams.get("report") ?? "master";
  if (!isReportKey(key)) return fail("Unknown report.");
  const report = await buildReport(auth.viewer, key, filtersFromParams(url.searchParams));
  const format = url.searchParams.get("format") ?? "json";
  if (format === "json") return NextResponse.json(report);
  return fileResponse(report, format === "csv" ? "csv" : "xlsx");
}

function fileResponse(report: Report, format: "csv" | "xlsx") {
  const header = report.columns.map((c) => c.label);
  const body = report.rows.map((r) =>
    report.columns.map((c) => {
      const v = r[c.key];
      if (v == null || v === "") return "";
      if (c.type === "money" || c.type === "int" || c.type === "pct") return Number(v);
      return v;
    })
  );
  if (report.totals) {
    body.push(report.columns.map((c, i) => (i === 0 ? "Total" : c.key in report.totals! ? Math.round(report.totals![c.key] * 100) / 100 : "")));
  }
  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  sheet["!cols"] = report.columns.map((c) => ({ wch: c.type === "money" ? 14 : c.key === "description" || c.key === "name" ? 36 : 16 }));
  const money = report.columns.map((c, i) => (c.type === "money" ? i : -1)).filter((i) => i >= 0);
  for (let r = 1; r <= body.length; r++) {
    for (const c of money) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === "number") cell.z = '"$"#,##0.00;[Red]-"$"#,##0.00';
    }
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `${report.title.replace(/[^A-Za-z0-9]+/g, "-")}-${stamp}`;
  if (format === "csv") {
    return new NextResponse(XLSX.utils.sheet_to_csv(sheet), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
    });
  }
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, report.title.slice(0, 31));
  const buf = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
    },
  });
}
