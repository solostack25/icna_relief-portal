import type { MatrixColumnSpec, MatrixSpec, ModelMap, PbiReportSpec } from "./types";

// Power BI versions of the Reports suite, keyed by the same report keys as
// lib/reportsSuite/catalog.ts. A report shows under Reports → Power BI once
// it has at least one tile, table or chart here.
//
// Expressions are DAX against the ICNA Relief Power BI semantic model.
// Prefer the model's own measures (e.g. "[Total Revenue]") so the numbers
// match the Power BI report exactly.

// How the model's columns line up with the portal's filters. Shared by every
// report unless a spec overrides it.
export const SHARED_MAP: ModelMap = {
  // Filled in from the model's table list.
};

// ─── REV-MAIN (National Revenue page) ───────────────────────────────────────
// One row per office/month/year from "Revenue PowerBi.xlsx". YEAR is text:
// "2024", "2025", "2026", plus "2026 GOAL" and "2026 VARIANCE" rows. MTN is
// the month number.
const REV = "'REV-MAIN'";
const REV_MAP: ModelMap = {
  year: `${REV}[YEAR]`,
  yearText: true,
  month: `${REV}[MTN]`,
  region: `${REV}[REGION]`,
  state: `${REV}[STATE]`,
  office: `${REV}[FIELD OFFICE]`,
};
const DONATIONS = `SUM(${REV}[DONATIONS])`;
const revYear = (label: string) => `CALCULATE(${DONATIONS}, ${REV}[YEAR] = "${label}")`;
const GOAL = revYear("{year} GOAL");
const VARIANCE = revYear("{year} VARIANCE");
const PCT_TO_GOAL = `DIVIDE(${revYear("{year}")}, ${GOAL}) * 100`;
const CFD_PCT = `DIVIDE(SUM(${REV}[Community Funding]), ${DONATIONS}, 0) * 100`;
const GFD_PCT = `DIVIDE(SUM(${REV}[Grant Funding]), ${DONATIONS}, 0) * 100`;
const FUNDING_COLUMNS = [
  { key: "community", label: "Community funding", unit: "money" as const, expr: `SUM(${REV}[Community Funding])` },
  { key: "cfd", label: "CFD %", unit: "pct" as const, expr: CFD_PCT },
  { key: "grant", label: "Grant funding", unit: "money" as const, expr: `SUM(${REV}[Grant Funding])` },
  { key: "gfd", label: "GFD %", unit: "pct" as const, expr: GFD_PCT },
];


// ─── Helpers for the program/operations tables ──────────────────────────────
// Most tables share the same layout: a YEAR number, a month-number column,
// REGION, STATE and FIELD OFFICE. Column names are case-insensitive in DAX.
const col = (table: string, c: string) => `'${table}'[${c}]`;
const sum = (table: string, c: string) => `SUM(${col(table, c)})`;
const distinct = (table: string, c: string) => `DISTINCTCOUNT(${col(table, c)})`;
const tableMap = (table: string, o: Partial<Record<"year" | "month" | "region" | "state" | "office" | "program", string>> = {}, yearText = false): ModelMap => ({
  year: col(table, o.year ?? "YEAR"),
  yearText,
  month: col(table, o.month ?? "MSN"),
  region: col(table, o.region ?? "REGION"),
  state: col(table, o.state ?? "STATE"),
  office: col(table, o.office ?? "FIELD OFFICE"),
  ...(o.program ? { program: col(table, o.program) } : {}),
});
// Region rows that expand to field offices.
const byRegion = (table: string, title: string, columns: MatrixColumnSpec[], o: { region?: string; office?: string } = {}): MatrixSpec => ({
  title,
  dimLabel: "Region",
  dim: col(table, o.region ?? "REGION"),
  childDim: col(table, o.office ?? "FIELD OFFICE"),
  order: "regions",
  total: true,
  columns,
});

const B2S = "BACK2SCHOOL";
const DRS = "DRS";
const HP = "Hunger Prevention";
const RS = "Refugee Services";
const TH = "Transitional Housing";
const CR = "Community Revenue";
const GR = "Grants Report";
const IK = "INKIND";
const IR = "IRFAS";
const VOL = "Volunteering";
const CR_DON = sum(CR, "DONATIONS");
const crYear = (label: string) => `CALCULATE(${CR_DON}, ${col(CR, "YEAR")} = "${label}")`;

const HSC = "Health Services-Clinics";
const HSM = "Health Services-Mobile";
const HSV = "Health Services-Value Addition";
const CO = "Counselling";
const FT = "FATE";
const CC = "Calling Campaigns";
const RM = "Ramadan";
const OPP = "OPP";
const RKG = "RKG - Reporting Unit Base";
const EX = "Expense-Total";
const MOBILE_MAP = tableMap(HSM, { year: "Year", month: "Month Number", region: "Region", state: "State", office: "Field Office" });
const FATE_MAP = tableMap(FT, { state: "STATES " });
const NO_FILTERS: ModelMap = {};
const countRows = (table: string) => `COUNTROWS('${table}')`;
const count = (table: string, c: string) => `COUNT(${col(table, c)})`;

// Reports whose Power BI page has no data to mirror.
export const PBI_NO_PAGE: Record<string, string> = {
  "kpis-programs": "Power BI's KPI-Programs page is text only — no data visuals to mirror.",
  "kpis-regions": "Power BI's KPI-Regions page is text only — no data visuals to mirror.",
};

export const PBI_REPORTS: Record<string, PbiReportSpec> = {
  "national-revenue": {
    map: REV_MAP,
    notes: ["From Power BI's NATIONAL REVENUE page (REV-MAIN table). Goal and variance are the \"{year} GOAL\" and \"{year} VARIANCE\" rows in the revenue workbook."],
    kpis: [
      { label: "{year} revenue", unit: "money", expr: DONATIONS },
      { label: "{year} goal", unit: "money", expr: GOAL, monthOnly: true },
      { label: "Variance to goal", unit: "money", expr: VARIANCE, monthOnly: true },
      { label: "% to goal", unit: "pct", expr: PCT_TO_GOAL, monthOnly: true },
      { label: "{year-1} revenue", unit: "money", expr: DONATIONS, yearOffset: -1 },
    ],
    matrices: [
      {
        title: "Revenue by region",
        dimLabel: "Region",
        dim: `${REV}[REGION]`,
        childDim: `${REV}[FIELD OFFICE]`,
        order: "regions",
        total: true,
        columns: [
          { key: "y2", label: "{year-2}", unit: "money", expr: DONATIONS, yearOffset: -2 },
          { key: "y1", label: "{year-1}", unit: "money", expr: DONATIONS, yearOffset: -1 },
          { key: "y0", label: "{year}", unit: "money", expr: DONATIONS },
          { key: "goal", label: "{year} goal", unit: "money", expr: GOAL, monthOnly: true },
          { key: "variance", label: "{year} variance", unit: "money", expr: VARIANCE, monthOnly: true },
          { key: "pct", label: "{year} % to goal", unit: "pct", expr: PCT_TO_GOAL, monthOnly: true },
        ],
      },
    ],
    charts: [
      { kind: "share", title: "Revenue contributed by region", unit: "money", dim: `${REV}[REGION]`, expr: DONATIONS },
      { kind: "months", title: "Revenue by month (cumulative)", unit: "money", expr: DONATIONS, years: 3, cumulative: true },
      {
        kind: "table",
        title: "Community vs. grant funding by region",
        dims: [{ key: "region", label: "Region", col: `${REV}[REGION]` }],
        columns: FUNDING_COLUMNS,
        total: true,
      },
      {
        kind: "table",
        title: "Community vs. grant funding by field office",
        dims: [{ key: "office", label: "Field office", col: `${REV}[FIELD OFFICE]` }],
        columns: FUNDING_COLUMNS,
        total: true,
      },
      {
        kind: "table",
        title: "{year} goal by field office",
        dims: [
          { key: "state", label: "State", col: `${REV}[STATE]` },
          { key: "office", label: "Field office", col: `${REV}[FIELD OFFICE]` },
        ],
        columns: [{ key: "goal", label: "Goal", unit: "money", expr: GOAL, monthOnly: true }],
        orderBy: "goal",
        total: true,
      },
    ],
  },
  back2school: {
    map: tableMap(B2S),
    kpis: [
      { label: "Backpacks distributed", unit: "count", expr: sum(B2S, "BACKPACKS DISTRIBUTED") },
      { label: "Students", unit: "count", expr: sum(B2S, "TOTAL STUDENTS") },
      { label: "Households served", unit: "count", expr: sum(B2S, "Households served") },
      { label: "Total donations raised", unit: "money", expr: sum(B2S, "TOTAL DONATIONS RAISED") },
      { label: "Cash donations", unit: "money", expr: sum(B2S, "CASH DONATIONS") },
      { label: "In-kind donation value", unit: "money", expr: sum(B2S, "IN-KIND DONATION VALUE") },
      { label: "Value of services", unit: "money", expr: sum(B2S, "TOTAL VALUE OF SERVICES") },
      { label: "Webinars / sessions", unit: "count", expr: sum(B2S, "WEBINAR/SESSIONS") },
      { label: "Webinar attendees / views", unit: "count", expr: sum(B2S, "WEBINAR/SESSION ATTENDEES/VIEWS") },
    ],
    matrices: [
      byRegion(B2S, "Distribution by region", [
        { key: "backpacks", label: "Backpacks", unit: "count", expr: sum(B2S, "BACKPACKS DISTRIBUTED") },
        { key: "households", label: "Households", unit: "count", expr: sum(B2S, "Households served") },
        { key: "events", label: "Events", unit: "count", expr: sum(B2S, "DISTRIBUTION EVENTS") },
        { key: "locations", label: "Locations", unit: "count", expr: sum(B2S, "DISTRIBUTION LOCATIONS") },
        { key: "collaborators", label: "Collaborators", unit: "count", expr: sum(B2S, "COLLABORATORS") },
        { key: "sponsors", label: "Sponsors", unit: "count", expr: sum(B2S, "SPONSORS") },
        { key: "officeholders", label: "Office holders", unit: "count", expr: sum(B2S, "OFFICE HOLDERS PARTICIPATED") },
      ]),
      byRegion(B2S, "Scholarships and value by region", [
        { key: "sfa", label: "SFA disbursed", unit: "money", expr: sum(B2S, "SFA AMOUNT DISBURSED") },
        { key: "eg", label: "Empower grants", unit: "money", expr: sum(B2S, "EG AMOUNT DISBURSED") },
        { key: "partner", label: "Partner scholarships", unit: "money", expr: sum(B2S, "AMOUNT OF PARTNER SCHOLARSHIP FUNDING DISBURSED") },
        { key: "backpacks", label: "Value of backpacks", unit: "money", expr: sum(B2S, "VALUE OF BACKPACKS") },
        { key: "services", label: "Value of services", unit: "money", expr: sum(B2S, "TOTAL VALUE OF SERVICES") },
      ]),
    ],
    charts: [
      { kind: "value-addition", title: "Raised vs. value of services", raised: sum(B2S, "TOTAL DONATIONS RAISED"), services: sum(B2S, "TOTAL VALUE OF SERVICES") },
      { kind: "share", title: "Students by school level", unit: "count", items: [
        { label: "Elementary", expr: sum(B2S, "TOTAL ELEMENTARY") },
        { label: "Middle school", expr: sum(B2S, "TOTAL MIDDLE SCHOOL") },
        { label: "High school", expr: sum(B2S, "TOTAL HIGH SCHOOL") },
      ] },
      { kind: "share", title: "Students by gender", unit: "count", items: [
        { label: "Boys", expr: sum(B2S, "TOTAL BOYS") },
        { label: "Girls", expr: sum(B2S, "TOTAL GIRLS") },
      ] },
      { kind: "share", title: "Families by ethnicity", unit: "count", items: [
        { label: "Afghan", expr: sum(B2S, "Aghan") },
        { label: "Arab / Middle Eastern", expr: sum(B2S, "Arab / Middle Eastern") },
        { label: "Asian", expr: sum(B2S, "Asians") },
        { label: "Black or African American", expr: sum(B2S, "Black or African American") },
        { label: "Hispanic / Latino", expr: sum(B2S, "Hispanic/Latino") },
        { label: "Native American or Pacific Islander", expr: sum(B2S, "Native American or Pacific Islander") },
        { label: "Ukrainian", expr: sum(B2S, "Ukrainian") },
        { label: "White / Caucasian", expr: sum(B2S, "White/Caucasian") },
        { label: "Other", expr: sum(B2S, "OTHER") },
      ] },
      { kind: "share", title: "Families by income", unit: "count", items: [
        { label: "$0–$19,999", expr: sum(B2S, "INCOME $0-$19,999") },
        { label: "$20,000–$39,999", expr: sum(B2S, "INCOME $20,000-$39,999") },
        { label: "$40,000+", expr: sum(B2S, "INCOME $40,000+") },
      ] },
    ],
  },

  "disaster-relief": {
    map: tableMap(DRS, { year: "YEAR " }),
    kpis: [
      { label: "Responses", unit: "count", expr: distinct(DRS, "RESPONSE NO") },
      { label: "Individuals served", unit: "count", expr: sum(DRS, "INDIVIDUALS SERVED") },
      { label: "Households served", unit: "count", expr: sum(DRS, "HOUSEHOLDS SERVED") },
      { label: "Volunteers engaged", unit: "count", expr: sum(DRS, "VOLUNTEERS ENGAGED") },
      { label: "Volunteer hours", unit: "hours", expr: sum(DRS, "VOLUNTEER HOURS UTILIZED") },
      { label: "Value of services", unit: "money", expr: sum(DRS, "VALUE OF SERVICES PROVIDED") },
      { label: "Cash raised", unit: "money", expr: sum(DRS, "CASH RAISED") },
      { label: "In-kind raised", unit: "money", expr: sum(DRS, "IN-KIND RAISED") },
      { label: "Total raised", unit: "money", expr: sum(DRS, "TOTAL RAISED") },
    ],
    matrices: [
      byRegion(DRS, "Impact by region", [
        { key: "responses", label: "Responses", unit: "count", expr: distinct(DRS, "RESPONSE NO") },
        { key: "individuals", label: "Individuals served", unit: "count", expr: sum(DRS, "INDIVIDUALS SERVED") },
        { key: "value", label: "Value of services", unit: "money", expr: sum(DRS, "VALUE OF SERVICES PROVIDED") },
        { key: "raised", label: "Total raised", unit: "money", expr: sum(DRS, "TOTAL RAISED") },
      ]),
    ],
    charts: [
      { kind: "value-addition", title: "Raised vs. value of services", raised: sum(DRS, "TOTAL RAISED"), services: sum(DRS, "VALUE OF SERVICES PROVIDED") },
      { kind: "share", title: "Individuals served by response type", unit: "count", dim: col(DRS, "RESPONSE/ACTIVITY TYPE"), expr: sum(DRS, "INDIVIDUALS SERVED") },
      { kind: "months", title: "Value of services by month", unit: "money", expr: sum(DRS, "VALUE OF SERVICES PROVIDED") },
      {
        kind: "table",
        title: "Responses",
        dims: [
          { key: "name", label: "Response / activity", col: col(DRS, "RESPONSE ACTIVITY NAME") },
          { key: "type", label: "Type", col: col(DRS, "RESPONSE/ACTIVITY TYPE") },
        ],
        columns: [
          { key: "individuals", label: "Individuals served", unit: "count", expr: sum(DRS, "INDIVIDUALS SERVED") },
          { key: "value", label: "Value of services", unit: "money", expr: sum(DRS, "VALUE OF SERVICES PROVIDED") },
        ],
        orderBy: "individuals",
        limit: 50,
      },
    ],
  },

  "hunger-prevention": {
    map: tableMap(HP),
    kpis: [
      { label: "Individuals served", unit: "count", expr: sum(HP, "INDIVIDUALS SERVED") },
      { label: "Total weight", unit: "lbs", expr: sum(HP, "Total Weight") },
      { label: "All meat weight", unit: "lbs", expr: sum(HP, "ALL MEAT WEIGHT") },
      { label: "Qurbani meat weight", unit: "lbs", expr: sum(HP, "QURBANI MEAT WEIGHT") },
      { label: "Prepared meals", unit: "count", expr: sum(HP, "NUMBER OF PREPARED MEALS") },
      { label: "Ramadan food boxes", unit: "count", expr: sum(HP, "RAMADAN FOOD BOXES") },
      { label: "Distribution locations", unit: "count", expr: distinct(HP, "DISTRIBUTION LOCATION") },
      { label: "States", unit: "count", expr: distinct(HP, "STATE") },
      { label: "Cash donations", unit: "money", expr: sum(HP, "CASH DONATION") },
      { label: "In-kind donations", unit: "money", expr: sum(HP, "INKIND DONATION") },
      { label: "Value of all food", unit: "money", expr: sum(HP, "TOTAL VALUE OF ALL FOOD") },
    ],
    matrices: [
      byRegion(HP, "Distribution by region", [
        { key: "individuals", label: "Individuals served", unit: "count", expr: sum(HP, "INDIVIDUALS SERVED") },
        { key: "weight", label: "Total weight", unit: "lbs", expr: sum(HP, "Total Weight") },
        { key: "meat", label: "All meat weight", unit: "lbs", expr: sum(HP, "ALL MEAT WEIGHT") },
        { key: "value", label: "Value of all food", unit: "money", expr: sum(HP, "TOTAL VALUE OF ALL FOOD") },
      ]),
    ],
    charts: [
      { kind: "value-addition", title: "Donations vs. value of food", raised: sum(HP, "TOTAL DONATIONS"), services: sum(HP, "TOTAL VALUE OF ALL FOOD") },
      { kind: "share", title: "Individuals served by distribution type", unit: "count", dim: col(HP, "DISTRIBUTION TYPE"), expr: sum(HP, "INDIVIDUALS SERVED") },
      { kind: "share", title: "Individuals served by age", unit: "count", items: [
        { label: "Children 0–5", expr: sum(HP, "Sum of No. Of Children (0–5 years)") },
        { label: "Children 6–18", expr: sum(HP, "Sum of No. Of Children (6–18 years)") },
        { label: "Adults", expr: sum(HP, "Sum of No. Of Adults") },
        { label: "Seniors", expr: sum(HP, "Sum of No. Of Seniors") },
      ] },
      { kind: "months", title: "Individuals served by month", unit: "count", expr: sum(HP, "INDIVIDUALS SERVED") },
    ],
  },

  "refugee-services": {
    map: tableMap(RS),
    kpis: [
      { label: "Beneficiaries", unit: "count", expr: sum(RS, "Number of Beneficiaries") },
      { label: "Value of services", unit: "money", expr: sum(RS, "Total Value of Services Provided") },
      { label: "Cash", unit: "money", expr: sum(RS, "CASH") },
      { label: "In-kind", unit: "money", expr: sum(RS, "INKIND") },
      { label: "Total revenue", unit: "money", expr: sum(RS, "TOTAL REV") },
    ],
    matrices: [
      byRegion(RS, "Services by region", [
        { key: "beneficiaries", label: "Beneficiaries", unit: "count", expr: sum(RS, "Number of Beneficiaries") },
        { key: "value", label: "Value of services", unit: "money", expr: sum(RS, "Total Value of Services Provided") },
      ]),
    ],
    charts: [
      { kind: "value-addition", title: "Revenue vs. value of services", raised: sum(RS, "TOTAL REV"), services: sum(RS, "Total Value of Services Provided") },
      { kind: "share", title: "Beneficiaries by service", unit: "count", dim: col(RS, "Service Name  ↑"), expr: sum(RS, "Number of Beneficiaries") },
      { kind: "share", title: "Beneficiaries by ethnicity", unit: "count", dim: col(RS, "Client Ethnicity"), expr: sum(RS, "Number of Beneficiaries") },
      { kind: "months", title: "Beneficiaries by month", unit: "count", expr: sum(RS, "Number of Beneficiaries") },
      { kind: "months", title: "Value of services by month", unit: "money", expr: sum(RS, "Total Value of Services Provided") },
    ],
  },

  "transitional-housing": {
    map: tableMap(TH),
    notes: ["Totals add up every month in the period, the same way the Power BI cards do (so beds and capacity are bed-months)."],
    kpis: [
      { label: "Sites", unit: "count", expr: distinct(TH, "Sites") },
      { label: "Total clients assisted", unit: "count", expr: sum(TH, "FINAL TOTAL CLIENTS ASSISTED") },
      { label: "Adults served in-house", unit: "count", expr: sum(TH, "Clients Served - Inhouse (new and existing) adults") },
      { label: "Children served in-house", unit: "count", expr: sum(TH, "Clients served- Inhouse (new and existing) Children") },
      { label: "New clients", unit: "count", expr: sum(TH, "TOTAL NEW CLIENTS") },
      { label: "Clients discharged", unit: "count", expr: sum(TH, "Total # Clients Discharged") },
      { label: "Nights served", unit: "count", expr: sum(TH, "Number of Nights served") },
      { label: "Occupancy rate", unit: "pct", expr: `DIVIDE(${sum(TH, "Number of Nights served")}, ${sum(TH, "Total Housing Capacity (# of Beds/Year=Nights)")}) * 100` },
      { label: "Helped with job search", unit: "count", expr: sum(TH, "Total clients assisted with job search (in TH + Unhoused)") },
      { label: "Case management hours", unit: "hours", expr: sum(TH, "TOTAL CASE MANAGEMENT HOURS") },
      { label: "Cash donations", unit: "money", expr: sum(TH, "Donations Received -Cash $") },
      { label: "In-kind donations", unit: "money", expr: sum(TH, "Donations Received -InKind $") },
      { label: "Value of services", unit: "money", expr: sum(TH, "Value of Services provided $") },
    ],
    matrices: [
      byRegion(TH, "Housing by region", [
        { key: "clients", label: "Clients assisted", unit: "count", expr: sum(TH, "FINAL TOTAL CLIENTS ASSISTED") },
        { key: "new", label: "New clients", unit: "count", expr: sum(TH, "TOTAL NEW CLIENTS") },
        { key: "nights", label: "Nights served", unit: "count", expr: sum(TH, "Number of Nights served") },
        { key: "value", label: "Value of services", unit: "money", expr: sum(TH, "Value of Services provided $") },
      ]),
    ],
    charts: [
      { kind: "value-addition", title: "Donations vs. value of services", raised: sum(TH, "CASH+INKIND RECEIVED"), services: sum(TH, "Value of Services provided $") },
      { kind: "share", title: "Residents working vs. unemployed", unit: "count", items: [
        { label: "Working", expr: sum(TH, "Total number clients working (TH adults only)") },
        { label: "Unemployed", expr: sum(TH, "Total number of clients unemployed (TH adults only)") },
      ] },
      { kind: "share", title: "Case management hours", unit: "hours", items: [
        { label: "Residents", expr: sum(TH, "Total Case Management Hours (TH Residents)") },
        { label: "Non-residents", expr: sum(TH, "Total Case Management Hours for non-residents") },
      ] },
      { kind: "months", title: "New clients by month", unit: "count", expr: sum(TH, "TOTAL NEW CLIENTS") },
    ],
  },

  "community-revenue": {
    map: tableMap(CR, { month: "MTN" }, true),
    notes: ["From Power BI's COMMUNITY REVENUE page. Goal and variance are the \"{year} GOAL\" and \"{year} VARIANCE\" rows in the workbook."],
    kpis: [
      { label: "{year} community revenue", unit: "money", expr: CR_DON },
      { label: "{year} goal", unit: "money", expr: crYear("{year} GOAL"), monthOnly: true },
      { label: "% to goal", unit: "pct", expr: `DIVIDE(${crYear("{year}")}, ${crYear("{year} GOAL")}) * 100`, monthOnly: true },
      { label: "{year-1} community revenue", unit: "money", expr: CR_DON, yearOffset: -1 },
    ],
    matrices: [
      byRegion(CR, "Community revenue by region", [
        { key: "y2", label: "{year-2}", unit: "money", expr: CR_DON, yearOffset: -2 },
        { key: "y1", label: "{year-1}", unit: "money", expr: CR_DON, yearOffset: -1 },
        { key: "y0", label: "{year}", unit: "money", expr: CR_DON },
        { key: "goal", label: "{year} goal", unit: "money", expr: crYear("{year} GOAL"), monthOnly: true },
        { key: "variance", label: "{year} variance", unit: "money", expr: crYear("{year} VARIANCE"), monthOnly: true },
        { key: "pct", label: "% to goal", unit: "pct", expr: `DIVIDE(${crYear("{year}")}, ${crYear("{year} GOAL")}) * 100`, monthOnly: true },
      ]),
    ],
    charts: [
      { kind: "months", title: "Year & month comparison", unit: "money", expr: CR_DON },
      {
        kind: "table",
        title: "{year} goals by field office",
        dims: [
          { key: "state", label: "State", col: col(CR, "STATE") },
          { key: "office", label: "Field office", col: col(CR, "FIELD OFFICE") },
        ],
        columns: [
          { key: "goal", label: "{year} goal", unit: "money", expr: crYear("{year} GOAL"), monthOnly: true },
          { key: "revenue", label: "Revenue", unit: "money", expr: CR_DON },
        ],
        orderBy: "goal",
        total: true,
      },
      {
        kind: "table",
        title: "Top 7 offices by revenue",
        dims: [{ key: "office", label: "Field office", col: col(CR, "FIELD OFFICE") }],
        columns: [{ key: "revenue", label: "Revenue", unit: "money", expr: CR_DON }],
        orderBy: "revenue",
        limit: 7,
      },
    ],
  },

  "grants-revenue": {
    map: tableMap(GR, { year: "Year", month: "Month Number", state: "State", office: "FILED OFFICE" }, true),
    notes: ["From Power BI's GRANTS page (Grants Report table). Power BI has no program column for grants, so the program filter doesn't apply here."],
    kpis: [
      { label: "{year} grant revenue", unit: "money", expr: sum(GR, "Payment Amount") },
      { label: "{year} goal", unit: "money", expr: sum(GR, "GOAL AMOUNT") },
      { label: "Grant payments", unit: "count", expr: `COUNTROWS(${"'" + GR + "'"})` },
      { label: "{year-1} grant revenue", unit: "money", expr: sum(GR, "Payment Amount"), yearOffset: -1 },
    ],
    matrices: [
      byRegion(GR, "Grant revenue by region", [
        { key: "y1", label: "{year-1}", unit: "money", expr: sum(GR, "Payment Amount"), yearOffset: -1 },
        { key: "y0", label: "{year}", unit: "money", expr: sum(GR, "Payment Amount") },
        { key: "goal", label: "Goal", unit: "money", expr: sum(GR, "GOAL AMOUNT") },
      ], { office: "FILED OFFICE" }),
    ],
    charts: [
      { kind: "share", title: "Grant revenue by campaign", unit: "money", dim: col(GR, "Campaign Name"), expr: sum(GR, "Payment Amount"), limit: 12 },
      { kind: "share", title: "Grant revenue by region", unit: "money", dim: col(GR, "REGION"), expr: sum(GR, "Payment Amount") },
      { kind: "months", title: "Grant revenue by month", unit: "money", expr: sum(GR, "Payment Amount") },
    ],
  },

  "in-kind": {
    map: tableMap(IK, { month: "MONTH NUMBER", program: "PROGRAM  ↑" }),
    programsFrom: col(IK, "PROGRAM  ↑"),
    kpis: [
      { label: "Value of in-kind donations", unit: "money", expr: sum(IK, "TOTAL VALUE OF ARTICLES") },
      { label: "Donations", unit: "count", expr: distinct(IK, "INKIND ID") },
      { label: "Articles", unit: "count", expr: sum(IK, "QUANTITY OF ARTICLES") },
    ],
    matrices: [
      byRegion(IK, "In-kind by region", [
        { key: "value", label: "Value", unit: "money", expr: sum(IK, "TOTAL VALUE OF ARTICLES") },
        { key: "donations", label: "Donations", unit: "count", expr: distinct(IK, "INKIND ID") },
        { key: "articles", label: "Articles", unit: "count", expr: sum(IK, "QUANTITY OF ARTICLES") },
      ]),
    ],
    charts: [
      { kind: "share", title: "In-kind value by program", unit: "money", dim: col(IK, "PROGRAM  ↑"), expr: sum(IK, "TOTAL VALUE OF ARTICLES") },
      { kind: "share", title: "In-kind value by region", unit: "money", dim: col(IK, "REGION"), expr: sum(IK, "TOTAL VALUE OF ARTICLES") },
      { kind: "months", title: "In-kind value by month", unit: "money", expr: sum(IK, "TOTAL VALUE OF ARTICLES") },
    ],
  },

  irfas: {
    map: tableMap(IR),
    kpis: [
      { label: "Amount approved", unit: "money", expr: sum(IR, "AMOUNT APPROVED") },
      { label: "Applications", unit: "count", expr: sum(IR, "Number of application") },
      { label: "Approved applications", unit: "count", expr: `CALCULATE(${sum(IR, "Number of application")}, ${col(IR, "STATUS")} = "Approved")` },
      { label: "Cash raised", unit: "money", expr: sum(IR, "CASH RAISED") },
    ],
    matrices: [
      byRegion(IR, "Assistance by region", [
        { key: "amount", label: "Amount approved", unit: "money", expr: sum(IR, "AMOUNT APPROVED") },
        { key: "apps", label: "Applications", unit: "count", expr: sum(IR, "Number of application") },
      ]),
    ],
    charts: [
      { kind: "share", title: "Amount approved by service", unit: "money", dim: col(IR, "SERVICE REQUESTED"), expr: sum(IR, "AMOUNT APPROVED") },
      { kind: "share", title: "Amount approved by funding source", unit: "money", dim: col(IR, "Funding Source"), expr: sum(IR, "AMOUNT APPROVED") },
      { kind: "months", title: "Amount approved by month", unit: "money", expr: sum(IR, "AMOUNT APPROVED") },
      {
        kind: "table",
        title: "Applications by status",
        dims: [{ key: "status", label: "Status", col: col(IR, "STATUS") }],
        columns: [
          { key: "apps", label: "Applications", unit: "count", expr: sum(IR, "Number of application") },
          { key: "amount", label: "Amount approved", unit: "money", expr: sum(IR, "AMOUNT APPROVED") },
        ],
        orderBy: "apps",
        total: true,
      },
    ],
  },

  volunteering: {
    map: tableMap(VOL, { year: "Year", month: "Month Number", region: "Region", state: "State", office: "Field Office", program: "Program" }),
    programsFrom: col(VOL, "Program"),
    kpis: [
      { label: "Volunteers", unit: "count", expr: distinct(VOL, "Contact ID (Distinct)") },
      { label: "Volunteer sign-ups", unit: "count", expr: `COUNT(${col(VOL, "Contact ID (total)")})` },
      { label: "Hours", unit: "hours", expr: sum(VOL, "Hours") },
      { label: "Value of volunteering", unit: "money", expr: sum(VOL, "Volunteering Value") },
    ],
    matrices: [
      byRegion(VOL, "Volunteering by region", [
        { key: "volunteers", label: "Volunteers", unit: "count", expr: distinct(VOL, "Contact ID (Distinct)") },
        { key: "signups", label: "Sign-ups", unit: "count", expr: `COUNT(${col(VOL, "Contact ID (total)")})` },
        { key: "hours", label: "Hours", unit: "hours", expr: sum(VOL, "Hours") },
        { key: "value", label: "Value", unit: "money", expr: sum(VOL, "Volunteering Value") },
      ], { region: "Region", office: "Field Office" }),
    ],
    charts: [
      { kind: "share", title: "Hours by program", unit: "hours", dim: col(VOL, "Program"), expr: sum(VOL, "Hours") },
      { kind: "months", title: "Hours by month", unit: "hours", expr: sum(VOL, "Hours") },
      {
        kind: "table",
        title: "Volunteering by program",
        dims: [{ key: "program", label: "Program", col: col(VOL, "Program") }],
        columns: [
          { key: "volunteers", label: "Volunteers", unit: "count", expr: distinct(VOL, "Contact ID (Distinct)") },
          { key: "signups", label: "Sign-ups", unit: "count", expr: `COUNT(${col(VOL, "Contact ID (total)")})` },
          { key: "hours", label: "Hours", unit: "hours", expr: sum(VOL, "Hours") },
          { key: "value", label: "Value", unit: "money", expr: sum(VOL, "Volunteering Value") },
        ],
        orderBy: "hours",
        total: true,
      },
    ],
  },
  "health-services": {
    map: tableMap(HSC),
    notes: ["Clinics, mobile health fairs and the value-addition summary are separate tables in Power BI. The value-addition totals have no date or office columns, so they always show all-time figures."],
    kpis: [
      { label: "Clinic patients (unduplicated)", unit: "count", expr: sum(HSC, "TOTAL UNDUPLICATED PATIENTS") },
      { label: "Medical visits", unit: "count", expr: sum(HSC, "TOTAL NUMBER OF MEDICAL VISITS") },
      { label: "Medications dispensed", unit: "count", expr: sum(HSC, "MEDICATION DISPENSED") },
      { label: "Clinic volunteer hours", unit: "hours", expr: sum(HSC, "TOTAL VOLUNTEER HOURS") },
      { label: "Value of clinic services", unit: "money", expr: sum(HSC, "TOTAL VALUE OF ALL SERVICES PROVIDED") },
      { label: "Health fairs", unit: "count", expr: distinct(HSM, "Health Fair: Health Fair Name"), map: MOBILE_MAP },
      { label: "Health fair clients", unit: "count", expr: count(HSM, "Health Fair Client: Health Fair Client Number"), map: MOBILE_MAP },
      { label: "Value of health fair services", unit: "money", expr: sum(HSM, "Value Of Service"), map: MOBILE_MAP },
      { label: "Cash revenue (all time)", unit: "money", expr: sum(HSV, "CASH REVENUE"), map: NO_FILTERS },
      { label: "In-kind donations (all time)", unit: "money", expr: sum(HSV, "INKIND DONATION"), map: NO_FILTERS },
    ],
    matrices: [
      {
        title: "Clinics",
        dimLabel: "Clinic",
        dim: col(HSC, "CLINIC"),
        order: "desc",
        total: true,
        columns: [
          { key: "patients", label: "Patients", unit: "count", expr: sum(HSC, "TOTAL UNDUPLICATED PATIENTS") },
          { key: "visits", label: "Medical visits", unit: "count", expr: sum(HSC, "TOTAL NUMBER OF MEDICAL VISITS") },
          { key: "working", label: "Working hours", unit: "hours", expr: sum(HSC, "TOTAL WORKING HOURS") },
          { key: "volhours", label: "Volunteer hours", unit: "hours", expr: sum(HSC, "TOTAL VOLUNTEER HOURS") },
          { key: "inkind", label: "In-kind value", unit: "money", expr: sum(HSC, "TOTAL VALUE OF INKIND DONATION") },
          { key: "value", label: "Value of all services", unit: "money", expr: sum(HSC, "TOTAL VALUE OF ALL SERVICES PROVIDED") },
        ],
      },
      { ...byRegion(HSM, "Health fairs by region", [
        { key: "fairs", label: "Health fairs", unit: "count", expr: distinct(HSM, "Health Fair: Health Fair Name") },
        { key: "clients", label: "Clients", unit: "count", expr: count(HSM, "Health Fair Client: Health Fair Client Number") },
        { key: "volunteers", label: "Volunteers", unit: "count", expr: sum(HSM, "Total Volunteers") },
        { key: "value", label: "Value of service", unit: "money", expr: sum(HSM, "Value Of Service") },
      ], { region: "Region", office: "Field Office" }), map: MOBILE_MAP },
    ],
    charts: [
      { kind: "value-addition", title: "Revenue raised vs. value of services (all time)", raised: sum(HSV, "TOTAL REVENUE RAISED"), services: sum(HSV, "VALUE OF SERVICES"), map: NO_FILTERS },
      { kind: "months", title: "Clinic patients by month", unit: "count", expr: sum(HSC, "TOTAL UNDUPLICATED PATIENTS") },
      { kind: "months", title: "Health fair value by month", unit: "money", expr: sum(HSM, "Value Of Service"), map: MOBILE_MAP },
      { kind: "share", title: "Health fair clients by insurance", unit: "count", dim: col(HSM, "Have Insurance"), expr: count(HSM, "Health Fair Client: Health Fair Client Number"), map: MOBILE_MAP },
      { kind: "share", title: "Health fair clients by ethnicity", unit: "count", dim: col(HSM, "Ethnicity"), expr: count(HSM, "Health Fair Client: Health Fair Client Number"), map: MOBILE_MAP },
    ],
  },

  "muslim-family-services": {
    map: tableMap(CO, { region: "Region", state: "State", office: "Field Office" }),
    notes: ["Muslim Family Services in Power BI is two pages: Counselling and FATE."],
    kpis: [
      { label: "Counseling clients", unit: "count", expr: sum(CO, "Total Clients") },
      { label: "New counseling clients", unit: "count", expr: sum(CO, "New Clients") },
      { label: "Counseling hours", unit: "hours", expr: sum(CO, "Total Counseling Hours ") },
      { label: "Counseling sessions", unit: "count", expr: `${sum(CO, "Individual Sessions ")} + ${sum(CO, "Group Session")} + ${sum(CO, "Family Sessions ")}` },
      { label: "Counseling value of services", unit: "money", expr: sum(CO, "TOTAL VOS") },
      { label: "FATE individuals served", unit: "count", expr: sum(FT, "TOTAL INDIVIDUALS SERVED"), map: FATE_MAP },
      { label: "FATE new families", unit: "count", expr: sum(FT, "Families Served (New)"), map: FATE_MAP },
      { label: "FATE value of services", unit: "money", expr: sum(FT, "TOTAL VALUE OF SERVICES"), map: FATE_MAP },
      { label: "FATE donations", unit: "money", expr: sum(FT, "Total Donation"), map: FATE_MAP },
    ],
    matrices: [
      byRegion(CO, "Counselling by region", [
        { key: "clients", label: "Clients", unit: "count", expr: sum(CO, "Total Clients") },
        { key: "new", label: "New clients", unit: "count", expr: sum(CO, "New Clients") },
        { key: "hours", label: "Counseling hours", unit: "hours", expr: sum(CO, "Total Counseling Hours ") },
        { key: "vos", label: "Value of services", unit: "money", expr: sum(CO, "TOTAL VOS") },
      ], { region: "Region", office: "Field Office" }),
      { ...byRegion(FT, "FATE by region", [
        { key: "individuals", label: "Individuals served", unit: "count", expr: sum(FT, "TOTAL INDIVIDUALS SERVED") },
        { key: "families", label: "New families", unit: "count", expr: sum(FT, "Families Served (New)") },
        { key: "hours", label: "Case management hours", unit: "hours", expr: sum(FT, "Consultation/Case Management (Hours)") },
        { key: "value", label: "Value of services", unit: "money", expr: sum(FT, "TOTAL VALUE OF SERVICES") },
      ]), map: FATE_MAP },
    ],
    charts: [
      { kind: "value-addition", title: "Counselling: revenue vs. value of services", raised: sum(CO, "Total Revenue"), services: sum(CO, "TOTAL VOS") },
      { kind: "value-addition", title: "FATE: donations vs. value of services", raised: sum(FT, "Total Donation"), services: sum(FT, "TOTAL VALUE OF SERVICES"), map: FATE_MAP },
      { kind: "share", title: "Counseling clients by reason", unit: "count", dim: col(CO, "Reason For counseling"), expr: sum(CO, "Total Clients"), limit: 10 },
      { kind: "share", title: "Counseling clients by gender", unit: "count", items: [
        { label: "Male", expr: sum(CO, "Male") },
        { label: "Female", expr: sum(CO, "Female ") },
      ] },
      { kind: "months", title: "Counseling clients by month", unit: "count", expr: sum(CO, "Total Clients") },
    ],
  },

  "calling-campaign": {
    map: tableMap(CC),
    kpis: [
      { label: "Donors contacted", unit: "count", expr: count(CC, "DONOR") },
      { label: "Donated after contact", unit: "count", expr: sum(CC, "Donated After Contact") },
      { label: "Amount donated after contact", unit: "money", expr: sum(CC, "Amount Donated After Contact") },
      { label: "Udhiya shares booked", unit: "count", expr: sum(CC, "Udhiya Shares Booked After Contact") },
      { label: "Needs admin attention", unit: "count", expr: sum(CC, "Needs Admin Attention") },
    ],
    matrices: [
      byRegion(CC, "Outreach by region", [
        { key: "donors", label: "Donors", unit: "count", expr: count(CC, "DONOR") },
        { key: "phone", label: "Phone calls", unit: "count", expr: sum(CC, "Phone Call") },
        { key: "text", label: "Texts", unit: "count", expr: sum(CC, "Text Message") },
        { key: "email", label: "Emails", unit: "count", expr: sum(CC, "Email") },
        { key: "voicemail", label: "Voicemails", unit: "count", expr: sum(CC, "Voicemail") },
        { key: "inperson", label: "In person", unit: "count", expr: sum(CC, "In Person") },
        { key: "goal", label: "Goal", unit: "count", expr: sum(CC, "GOAL") },
      ]),
    ],
    charts: [
      { kind: "share", title: "Contacts by method", unit: "count", dim: col(CC, "Method"), expr: count(CC, "DONOR") },
      { kind: "months", title: "Donors contacted by month", unit: "count", expr: count(CC, "DONOR") },
      {
        kind: "table",
        title: "By caller",
        dims: [{ key: "caller", label: "Caller", col: col(CC, "CALLER") }],
        columns: [
          { key: "donors", label: "Donors", unit: "count", expr: count(CC, "DONOR") },
          { key: "phone", label: "Calls", unit: "count", expr: sum(CC, "Phone Call") },
          { key: "text", label: "Texts", unit: "count", expr: sum(CC, "Text Message") },
          { key: "email", label: "Emails", unit: "count", expr: sum(CC, "Email") },
          { key: "donated", label: "Donated after", unit: "count", expr: sum(CC, "Donated After Contact") },
          { key: "amount", label: "Amount", unit: "money", expr: sum(CC, "Amount Donated After Contact") },
        ],
        orderBy: "donors",
        total: true,
      },
    ],
  },

  ramadan: {
    map: NO_FILTERS,
    notes: ["Power BI's Ramadan table has one column per year (by day of Ramadan), so only years it has columns for (2020–2026) show numbers, and goals only for 2025–2026. Region and office filters don't apply."],
    kpis: [
      { label: "{year} raised", unit: "money", expr: sum(RM, "{year}") },
      { label: "{year} goal", unit: "money", expr: sum(RM, "{year} GOAL") },
      { label: "{year} variance", unit: "money", expr: sum(RM, "{year} VARIANCE") },
      { label: "{year-1} raised", unit: "money", expr: sum(RM, "{year-1}") },
      { label: "{year-2} raised", unit: "money", expr: sum(RM, "{year-2}") },
    ],
    charts: [
      {
        kind: "table",
        title: "By day of Ramadan",
        dims: [{ key: "day", label: "Day", col: col(RM, "DAY") }],
        columns: [
          { key: "y2", label: "{year-2}", unit: "money", expr: sum(RM, "{year-2}") },
          { key: "y1", label: "{year-1}", unit: "money", expr: sum(RM, "{year-1}") },
          { key: "y0", label: "{year}", unit: "money", expr: sum(RM, "{year}") },
          { key: "goal", label: "{year} goal", unit: "money", expr: sum(RM, "{year} GOAL") },
          { key: "variance", label: "{year} variance", unit: "money", expr: sum(RM, "{year} VARIANCE") },
          { key: "cum", label: "{year} cumulative", unit: "money", expr: sum(RM, "{year} COMMULATIVE") },
        ],
        total: true,
      },
    ],
  },

  outreach: {
    map: { office: col(OPP, "Office") },
    notes: ["Power BI's OUTREACH page is a market-opportunity view (Muslim population and charitable giving by zip code, Jul–Dec). It has no dates, so the year and month filters don't apply."],
    kpis: [
      { label: "Muslim population", unit: "count", expr: sum(OPP, "Total Muslim Population") },
      { label: "Muslim households", unit: "count", expr: sum(OPP, "Number of Muslim Households") },
      { label: "Mosques", unit: "count", expr: countRows("MOSQUES"), map: NO_FILTERS },
      { label: "Charitable pool (Jul–Dec)", unit: "money", expr: sum(OPP, "TOTAL CHARITABLE POOL JUL-DEC") },
      { label: "Collected Jul–Dec 2024", unit: "money", expr: sum(OPP, "ACTUAL DONATIONS ICNA RELIEF COLLECTED IN JUL-DEC 2024") },
      { label: "1% market share (Jul–Dec)", unit: "money", expr: sum(OPP, "1% OF MARKET SHARE IN Q3&4") },
      { label: "2.5% market share (Jul–Dec)", unit: "money", expr: sum(OPP, "2.5% OF MARKET SHARE IN Q3&4") },
      { label: "5% market share (Jul–Dec)", unit: "money", expr: sum(OPP, "5% OF MARKET SHARE IN Q3&4") },
    ],
    charts: [
      { kind: "share", title: "Muslim population by group", unit: "count", items: [
        { label: "South Asian", expr: sum(OPP, "Muslim - South Asian") },
        { label: "Arab", expr: sum(OPP, "Muslim - Arab") },
        { label: "Black", expr: sum(OPP, "Muslim - Black") },
        { label: "White", expr: sum(OPP, "Muslim - White") },
        { label: "Iranic", expr: sum(OPP, "Muslim - Iranic") },
        { label: "Turkic", expr: sum(OPP, "Muslim - Turkic") },
        { label: "Southeast Asian", expr: sum(OPP, "Muslim - Southeast Asian") },
        { label: "East Asian", expr: sum(OPP, "Muslim - East Asian") },
        { label: "Hispanic or Latino", expr: sum(OPP, "Muslim - Hispanic or Latino") },
        { label: "Other", expr: sum(OPP, "Muslim - Other") },
      ] },
      {
        kind: "table",
        title: "Top zip codes by Muslim population",
        dims: [
          { key: "zip", label: "Zip code", col: col(OPP, "ZIPCODE") },
          { key: "office", label: "Office", col: col(OPP, "Office") },
        ],
        columns: [
          { key: "pop", label: "Muslim population", unit: "count", expr: sum(OPP, "Total Muslim Population") },
          { key: "avg", label: "ICNA Relief avg (Jul–Dec)", unit: "money", expr: sum(OPP, "ICNA RELIEF AVERAGE JUL-DEC") },
          { key: "loss", label: "Potential loss (Jul–Dec)", unit: "money", expr: sum(OPP, "Potential Revenue Loss Jul-Dec") },
        ],
        orderBy: "pop",
        limit: 25,
      },
    ],
  },

  "office-rankings": {
    map: { year: "'RKG - Period'[YEAR]", month: "'RKG - Period'[MSN]", region: col(RKG, "REGION"), state: col(RKG, "STATE"), office: col(RKG, "FIELD OFFICE") },
    notes: ["Scores are year-to-date through the month picked (or the latest month with data). Rank is among the offices shown, as in Power BI."],
    kpis: [
      { label: "Offices ranked", unit: "count", expr: `COUNTROWS(FILTER(VALUES(${col(RKG, "FIELD OFFICE")}), NOT ISBLANK([RKG Total Score])))` },
      { label: "Top score", unit: "count", expr: `MAXX(VALUES(${col(RKG, "FIELD OFFICE")}), [RKG Total Score])` },
      { label: "Average score", unit: "count", expr: `AVERAGEX(VALUES(${col(RKG, "FIELD OFFICE")}), [RKG Total Score])` },
    ],
    charts: [
      {
        kind: "table",
        title: "Office rankings",
        dims: [
          { key: "office", label: "Field office", col: col(RKG, "FIELD OFFICE") },
          { key: "region", label: "Region", col: col(RKG, "REGION") },
        ],
        columns: [
          { key: "rank", label: "Rank", unit: "count", expr: "[RKG Rank]" },
          { key: "total", label: "Total score", unit: "count", expr: "[RKG Total Score]" },
          { key: "revexp", label: "Revenue / expense (35)", unit: "count", expr: "[RKG REV EXP Score]" },
          { key: "fte", label: "Revenue per FTE (15)", unit: "count", expr: "[RKG Revenue per FTE Score]" },
          { key: "clients", label: "Clients served (20)", unit: "count", expr: "[RKG Clients Served Score]" },
          { key: "vos", label: "Value of services (15)", unit: "count", expr: "[RKG VOS Score]" },
          { key: "va", label: "Value addition (15)", unit: "count", expr: "[RKG Value Addition Score]" },
        ],
        orderBy: "asc:rank",
      },
    ],
  },

  expenditure: {
    map: tableMap(EX, { month: "MTN" }),
    notes: ["From Power BI's EXPENDITURE page (Expense-Total). This table is hidden from Power BI's Public role; the portal reads it as the signed-in admin."],
    kpis: [
      { label: "Revenue", unit: "money", expr: sum(EX, "REVENUE") },
      { label: "Total expenditure", unit: "money", expr: sum(EX, "TOTAL EXPENDITURE") },
      { label: "Revenue − expenditure", unit: "money", expr: sum(EX, "REVNUE-EXPENDITURE") },
      { label: "Personnel", unit: "money", expr: sum(EX, "TOTAL 6500 -PERSONNEL") },
      { label: "Operational cost", unit: "money", expr: sum(EX, "TOTAL 8000 - OPERATIONAL COST") },
    ],
    matrices: [
      byRegion(EX, "Revenue and expenditure by region", [
        { key: "rev", label: "Revenue", unit: "money", expr: sum(EX, "REVENUE") },
        { key: "exp", label: "Expenditure", unit: "money", expr: sum(EX, "TOTAL EXPENDITURE") },
        { key: "net", label: "Revenue − expenditure", unit: "money", expr: sum(EX, "REVNUE-EXPENDITURE") },
      ]),
      byRegion(EX, "Expenditure by category", [
        { key: "salaries", label: "Salaries & wages", unit: "money", expr: sum(EX, "6501-SALARIES & WAGES") },
        { key: "payroll", label: "Payroll", unit: "money", expr: sum(EX, "66000 - PAYROLL EXPENSES") },
        { key: "fringe", label: "Fringe benefits", unit: "money", expr: sum(EX, "TOTAL 6502-FRINGE BENEFITS") },
        { key: "contract", label: "Contractual", unit: "money", expr: sum(EX, "TOTAL 6503 - CONTRACTUAL SERVICES") },
        { key: "travel", label: "Travel", unit: "money", expr: sum(EX, "TOTAL 6505 - TRAVELLING") },
        { key: "occupancy", label: "Occupancy", unit: "money", expr: sum(EX, "TOTAL 6510 -OCCUPANCY") },
        { key: "ops", label: "Operational", unit: "money", expr: sum(EX, "TOTAL 8000 - OPERATIONAL COST") },
        { key: "outreach", label: "Community outreach", unit: "money", expr: sum(EX, "TOTAL 9000 - COMMUNITY OUTREACH") },
        { key: "central", label: "Central share", unit: "money", expr: sum(EX, "TOTAL CENTRAL DEPARTMENTS SHARE") },
      ]),
    ],
    charts: [
      { kind: "share", title: "Expenditure by category", unit: "money", items: [
        { label: "Personnel", expr: sum(EX, "TOTAL 6500 -PERSONNEL") },
        { label: "Travel", expr: sum(EX, "TOTAL 6505 - TRAVELLING") },
        { label: "Occupancy", expr: sum(EX, "TOTAL 6510 -OCCUPANCY") },
        { label: "Operational", expr: sum(EX, "TOTAL 8000 - OPERATIONAL COST") },
        { label: "Community outreach", expr: sum(EX, "TOTAL 9000 - COMMUNITY OUTREACH") },
        { label: "Central share", expr: sum(EX, "TOTAL CENTRAL DEPARTMENTS SHARE") },
      ] },
      { kind: "months", title: "Expenditure by month", unit: "money", expr: sum(EX, "TOTAL EXPENDITURE") },
      { kind: "months", title: "Revenue by month", unit: "money", expr: sum(EX, "REVENUE") },
    ],
  },
};
