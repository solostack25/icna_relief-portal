// QuickBooks reports arrive three ways: an Excel export, the Online API
// (JSON) and the Desktop Web Connector (qbXML). The last two are laid out
// here as the same grid an Excel export gives, so one parser
// (parseQbGrid) turns all three into office / grant / central amounts.

type BodyRow = { depth: number; label: string; values: (number | null)[] };

// titles[c] = header cells for class column c, top to bottom.
function layout(titles: string[][], body: BodyRow[]): unknown[][] {
  const maxDepth = Math.max(0, ...body.map((b) => b.depth));
  const L = maxDepth + 1;
  const titleRows = Math.max(1, ...titles.map((t) => t.length));
  const grid: unknown[][] = [];
  for (let r = 0; r < titleRows; r++) {
    const row: unknown[] = new Array(L + titles.length).fill(null);
    titles.forEach((t, c) => {
      // bottom-align, as QuickBooks does (the class's own name is last)
      const v = t[r - (titleRows - t.length)];
      if (v) row[L + c] = v;
    });
    grid.push(row);
  }
  for (const b of body) {
    const row: unknown[] = new Array(L + titles.length).fill(null);
    row[b.depth] = b.label;
    b.values.forEach((v, c) => {
      if (v != null && Number.isFinite(v)) row[L + c] = v;
    });
    grid.push(row);
  }
  return grid;
}

const num = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

// ---------- QuickBooks Online: Reports API ProfitAndLoss JSON ----------

type QboCol = { ColTitle?: string; ColType?: string; MetaData?: { Name: string; Value: string }[] };
type QboRow = {
  type?: string;
  group?: string;
  Header?: { ColData?: { value?: string }[] };
  Rows?: { Row?: QboRow[] };
  Summary?: { ColData?: { value?: string }[] };
  ColData?: { value?: string; id?: string }[];
};
export type QboReport = { Header?: { StartPeriod?: string; EndPeriod?: string }; Columns?: { Column?: QboCol[] }; Rows?: { Row?: QboRow[] } };

// classPaths: class Id → FullyQualifiedName ("DALLAS REGION:GLOBAL REFUGE(DA)").
export function qboReportToGrid(report: QboReport, classPaths: Map<string, string>, classNames: Map<string, string>): unknown[][] {
  const cols = report.Columns?.Column ?? [];
  // Column 0 is the account label. Keep class columns and the grand
  // total; drop "Total PARENT" roll-ups so nothing is counted twice.
  const keep: { idx: number; title: string }[] = [];
  cols.forEach((c, idx) => {
    if (idx === 0) return;
    const title = (c.ColTitle ?? "").trim();
    const key = c.MetaData?.find((m) => m.Name === "ColKey")?.Value ?? "";
    if (/^total$/i.test(title) || /^total$/i.test(key)) keep.push({ idx, title: "TOTAL" });
    else if (/^total\s/i.test(title)) return;
    else if (/^not specified$/i.test(title) || /^not specified$/i.test(key)) keep.push({ idx, title: "UNCLASSIFIED" });
    else keep.push({ idx, title: classPaths.get(key) ?? classNames.get(title.toLowerCase()) ?? title });
  });
  const body: BodyRow[] = [];
  const values = (cd: { value?: string }[] | undefined) => keep.map((k) => num(cd?.[k.idx]?.value));
  const walk = (rows: QboRow[] | undefined, depth: number) => {
    for (const r of rows ?? []) {
      if (r.Header || r.Rows) {
        const label = r.Header?.ColData?.[0]?.value ?? (r.group ? r.group : "");
        // A section's own header can carry amounts (parent account with
        // direct postings); QuickBooks shows those on the header row.
        const hv = values(r.Header?.ColData);
        if (label) body.push({ depth, label, values: [] });
        if (hv.some((v) => v)) body.push({ depth: depth + 1, label: `${label} - Other`, values: hv });
        walk(r.Rows?.Row, depth + 1);
        const sl = r.Summary?.ColData?.[0]?.value;
        if (sl) body.push({ depth, label: sl, values: values(r.Summary?.ColData) });
      } else if (r.ColData) {
        body.push({ depth, label: r.ColData[0]?.value ?? "", values: values(r.ColData) });
      }
    }
  };
  walk(report.Rows?.Row, 0);
  return layout(
    keep.map((k) => [k.title]),
    body
  );
}

// ---------- QuickBooks Desktop: qbXML GeneralSummaryReportQueryRs ----------

const unescape = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
const attr = (s: string, name: string) => {
  const m = s.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? unescape(m[1]) : null;
};

export function qbxmlReportToGrid(xml: string): { grid: unknown[][]; title: string | null; error: string | null } {
  const rs = xml.match(/<GeneralSummaryReportQueryRs\b([^>]*)>/);
  if (rs) {
    const code = attr(rs[1], "statusCode");
    if (code && code !== "0") return { grid: [], title: null, error: attr(rs[1], "statusMessage") ?? `QuickBooks error ${code}` };
  }
  const title = xml.match(/<ReportTitle>([\s\S]*?)<\/ReportTitle>/)?.[1] ?? null;
  // Columns: colID 1 is the row label; the rest are classes (with the
  // "(PARENT)" marker rows, exactly like the Excel export) and totals.
  const cols: { id: number; titles: string[] }[] = [];
  for (const m of xml.matchAll(/<ColDesc\b([^>]*)>([\s\S]*?)<\/ColDesc>/g)) {
    const id = Number(attr(m[1], "colID"));
    const titles: { row: number; v: string }[] = [];
    for (const t of m[2].matchAll(/<ColTitle\b([^>]*)\/?>/g)) {
      const v = attr(t[1], "value");
      if (v) titles.push({ row: Number(attr(t[1], "titleRow")) || 1, v });
    }
    cols.push({ id, titles: titles.sort((a, b) => a.row - b.row).map((x) => x.v) });
  }
  const classCols = cols.filter((c) => c.id > 1).sort((a, b) => a.id - b.id);
  const pos = new Map(classCols.map((c, i) => [c.id, i]));

  const body: BodyRow[] = [];
  let depth = 0;
  const data = xml.match(/<ReportData>([\s\S]*?)<\/ReportData>/)?.[1] ?? "";
  for (const m of data.matchAll(/<(TextRow|DataRow|SubtotalRow|TotalRow)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g)) {
    const [, kind, attrs, inner = ""] = m;
    const values: (number | null)[] = new Array(classCols.length).fill(null);
    let label = kind === "TextRow" ? attr(attrs, "value") ?? "" : "";
    const rd = inner.match(/<RowData\b([^>]*)\/?>/);
    if (rd) label = attr(rd[1], "value") ?? label;
    for (const c of inner.matchAll(/<ColData\b([^>]*)\/?>/g)) {
      const id = Number(attr(c[1], "colID"));
      const v = attr(c[1], "value");
      if (id === 1) {
        if (v && !label) label = v;
        continue;
      }
      const p = pos.get(id);
      if (p != null) values[p] = num(v);
    }
    if (kind === "TextRow") {
      body.push({ depth, label, values: [] });
      depth++;
    } else if (kind === "SubtotalRow") {
      depth = Math.max(0, depth - 1);
      body.push({ depth, label: /^total\b/i.test(label) ? label : `Total ${label}`, values });
    } else if (kind === "TotalRow") {
      body.push({ depth: 0, label, values });
    } else {
      body.push({ depth, label, values });
    }
  }
  return {
    grid: layout(
      classCols.map((c) => c.titles),
      body
    ),
    title: title ? unescape(title) : null,
    error: null,
  };
}
