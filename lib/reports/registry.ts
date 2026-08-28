// Central config for every report module. Adding a new report type
// (mostly) means adding an entry here, not writing a new API route -
// app/api/reports/run reads this to know which table to query, which
// columns are safe to group by (dimensions), which aggregations are
// allowed (metrics), and how to scope the query to the requesting
// employee's office/region since RLS alone doesn't cover every table
// yet (hp_intakes/th_intakes have no office_id column directly - see
// note in reports_migration.sql - so scoping for those goes through
// a join to clients.office_id instead).
//
// Keeping this as a single whitelist (rather than accepting raw
// column names from the client) is the injection guard: the API
// route only ever builds queries out of strings that appear here.

export type ReportField = {
  key: string;              // stable id used in filters/dimensions/metrics arrays
  label: string;            // shown in the builder UI
  column: string;           // actual DB column this maps to - PostgREST select only
                             // accepts real column names, so date grouping (e.g. "by
                             // month") is done in the API route after fetch, not here
  truncate?: "month" | "day"; // if set, group by this date column truncated client-side
};

export type ReportMetric = ReportField & {
  agg: "count" | "sum" | "avg";
};

export type ReportScope =
  | { type: "direct"; officeColumn: string }        // table has its own office_id
  | { type: "via_client"; clientIdColumn: string }   // scope via clients.office_id through a join
  | { type: "none" };                                 // no office concept (e.g. org-wide HR roster)

export type ReportModule = {
  slug: string;
  label: string;
  table: string;
  defaultDateColumn: string;
  scope: ReportScope;
  dimensions: ReportField[];
  metrics: ReportMetric[];
  /** Which employee roles can even see this module in the builder. Admin always can. */
  allowedRoles: Array<"staff" | "regional_director" | "program_director" | "admin">;
};

export const REPORT_MODULES: ReportModule[] = [
  {
    slug: "hunger-prevention",
    label: "Hunger Prevention",
    table: "hp_intakes",
    defaultDateColumn: "created_at",
    scope: { type: "via_client", clientIdColumn: "client_id" },
    dimensions: [
      { key: "pantry_location", label: "Pantry Location", column: "pantry_location" },
      { key: "dietary_preference", label: "Dietary Preference", column: "dietary_preference" },
      { key: "ethnicity", label: "Ethnicity", column: "ethnicity" },
      { key: "country_of_origin", label: "Country of Origin", column: "country_of_origin" },
      { key: "visit_month", label: "Visit Month", column: "visit_timeslot", truncate: "month" },
    ],
    metrics: [
      { key: "visit_count", label: "Visits", column: "id", agg: "count" },
      { key: "avg_household_size", label: "Avg Household Size", column: "household_size_snapshot", agg: "avg" },
      { key: "total_food_stamps", label: "Total Food Stamps Amount", column: "food_stamps_amount", agg: "sum" },
    ],
    allowedRoles: ["staff", "regional_director", "program_director", "admin"],
  },
  {
    slug: "transitional-housing",
    label: "Transitional Housing",
    table: "th_intakes",
    defaultDateColumn: "created_at",
    scope: { type: "via_client", clientIdColumn: "client_id" },
    dimensions: [
      { key: "intake_month", label: "Intake Month", column: "created_at", truncate: "month" },
    ],
    metrics: [
      { key: "intake_count", label: "Intakes", column: "id", agg: "count" },
    ],
    allowedRoles: ["staff", "regional_director", "program_director", "admin"],
  },
  {
    slug: "clients",
    label: "Clients Served (All Programs)",
    table: "clients",
    defaultDateColumn: "created_at",
    scope: { type: "direct", officeColumn: "office_id" },
    dimensions: [
      { key: "city", label: "City", column: "city" },
      { key: "state", label: "State", column: "state" },
      { key: "created_month", label: "Created Month", column: "created_at", truncate: "month" },
    ],
    metrics: [
      { key: "client_count", label: "Clients", column: "id", agg: "count" },
    ],
    allowedRoles: ["staff", "regional_director", "program_director", "admin"],
  },
  {
    slug: "helpdesk",
    label: "IT Helpdesk",
    table: "helpdesk_requests",
    defaultDateColumn: "created_at",
    scope: { type: "none" },
    dimensions: [
      { key: "department", label: "Department", column: "department" },
      { key: "status", label: "Status", column: "overall_status" },
      { key: "created_month", label: "Created Month", column: "created_at", truncate: "month" },
    ],
    metrics: [
      { key: "ticket_count", label: "Tickets", column: "id", agg: "count" },
    ],
    allowedRoles: ["admin"],
  },
  {
    slug: "helpdesk-leaderboard",
    label: "IT Helpdesk Leaderboard",
    table: "helpdesk_requests",
    defaultDateColumn: "created_at",
    scope: { type: "none" },
    dimensions: [
      { key: "assigned_raw_name", label: "Assigned To", column: "assigned_raw_name" },
    ],
    metrics: [
      { key: "resolved_count", label: "Resolved Tickets", column: "id", agg: "count" },
    ],
    allowedRoles: ["admin"],
  },
];

export function getReportModule(slug: string): ReportModule | undefined {
  return REPORT_MODULES.find((m) => m.slug === slug);
}

export function modulesForRole(role: string): ReportModule[] {
  if (role === "admin") return REPORT_MODULES;
  return REPORT_MODULES.filter((m) => m.allowedRoles.includes(role as ReportModule["allowedRoles"][number]));
}
