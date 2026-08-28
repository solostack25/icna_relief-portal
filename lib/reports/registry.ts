// Central config for every report module. Adding a new report type
// (mostly) means adding an entry here, not writing a new API route -
// app/api/reports/run reads this to know which table to query, which
// columns are safe to group by (dimensions), which aggregations are
// allowed (metrics), and how to scope the query to the requesting
// employee's office/region since RLS alone doesn't cover every table
// yet.
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
  /** If the raw column value is a foreign id (e.g. course_id), resolve
   *  it to a human label after aggregation with a separate lookup
   *  query, rather than a PostgREST embed - keeps the aggregator's
   *  flat row model simple while still showing "Bloodborne Pathogens"
   *  instead of a UUID. */
  lookup?: { table: string; labelColumn: string };
};

export type ColumnMetric = ReportField & {
  agg: "count" | "sum" | "avg";
};

// Some useful metrics aren't a raw column at all (e.g. "hours worked"
// from clock_in_at/clock_out_at) - this computes a duration in hours
// between two timestamp columns per row, then sums or averages it.
// Rows where either column is null (e.g. a still-open clock entry)
// are skipped rather than counted as zero.
export type DurationMetric = {
  key: string;
  label: string;
  agg: "duration_hours_sum" | "duration_hours_avg";
  startColumn: string;
  endColumn: string;
};

export type ReportMetric = ColumnMetric | DurationMetric;

export function isDurationMetric(m: ReportMetric): m is DurationMetric {
  return m.agg === "duration_hours_sum" || m.agg === "duration_hours_avg";
}

// A scope chain resolves "which office_ids am I allowed to see" down
// to "which ids in the target table's foreign-key column match that".
// Each hop narrows the id set by one join:
//   hop 0: WHERE <officeColumn> IN (allowed office ids) -> select idColumn
//   hop N: WHERE <filterColumn> IN (ids from hop N-1)    -> select idColumn
// The final hop's ids are matched against finalRefColumn on the
// report's own table. This covers both single-hop cases (hp_intakes
// via clients.office_id) and multi-hop ones (th_stays via
// th_beds.house_id -> th_houses.office_id) without new code per module.
export type ScopeHop =
  | { table: string; idColumn: string; officeColumn: string } // first hop only
  | { table: string; idColumn: string; filterColumn: string }; // subsequent hops

export type ReportScope =
  | { type: "direct"; officeColumn: string }              // table has its own office_id
  | { type: "chain"; hops: ScopeHop[]; finalRefColumn: string } // scope via one or more joins
  | { type: "direct_region"; regionColumn: string }        // table has a region text column directly (e.g. grant_region_goals)
  | { type: "none" };                                       // no office concept (e.g. org-wide HR roster)

export type ReportModule = {
  slug: string;
  label: string;
  table: string;
  defaultDateColumn: string;
  scope: ReportScope;
  /** Always-applied equality filter, e.g. { column: "stream", value: "grant" }
   *  to split one shared table (grants) into distinct report modules
   *  (Grants vs. Other Revenue Streams) without a second physical table. */
  fixedFilter?: { column: string; value: string };
  dimensions: ReportField[];
  metrics: ReportMetric[];
  /** Which employee roles can even see this module in the builder. Admin always can. */
  allowedRoles: Array<"staff" | "regional_director" | "program_director" | "admin">;
};

export const REPORT_MODULES: ReportModule[] = [
  {
    slug: "hunger-prevention",
    label: "Hunger Prevention — Intakes",
    table: "hp_intakes",
    defaultDateColumn: "created_at",
    scope: { type: "chain", hops: [{ table: "clients", idColumn: "id", officeColumn: "office_id" }], finalRefColumn: "client_id" },
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
    slug: "hunger-prevention-pickups",
    label: "Hunger Prevention — Pickup Bookings",
    table: "pickup_bookings",
    defaultDateColumn: "created_at",
    // pickup_bookings has no office_id of its own - it belongs to a
    // pickup_slots row, which does carry office_id directly (see
    // app/hunger-prevention/slots/SlotsClient.tsx).
    scope: { type: "chain", hops: [{ table: "pickup_slots", idColumn: "id", officeColumn: "office_id" }], finalRefColumn: "slot_id" },
    dimensions: [
      { key: "status", label: "Status", column: "status" },
    ],
    metrics: [
      { key: "booking_count", label: "Bookings", column: "id", agg: "count" },
    ],
    allowedRoles: ["staff", "regional_director", "program_director", "admin"],
  },
  {
    slug: "transitional-housing",
    label: "Transitional Housing — Intakes",
    table: "th_intakes",
    defaultDateColumn: "created_at",
    scope: { type: "chain", hops: [{ table: "clients", idColumn: "id", officeColumn: "office_id" }], finalRefColumn: "client_id" },
    dimensions: [
      { key: "intake_month", label: "Intake Month", column: "created_at", truncate: "month" },
    ],
    metrics: [
      { key: "intake_count", label: "Intakes", column: "id", agg: "count" },
    ],
    allowedRoles: ["staff", "regional_director", "program_director", "admin"],
  },
  {
    slug: "transitional-housing-occupancy",
    label: "Transitional Housing — Occupancy",
    table: "th_stays",
    defaultDateColumn: "move_in_date",
    // th_stays -> th_beds.house_id -> th_houses.office_id (two hops:
    // house_id is not on th_stays itself, only bed_id is).
    scope: {
      type: "chain",
      hops: [
        { table: "th_houses", idColumn: "id", officeColumn: "office_id" },
        { table: "th_beds", idColumn: "id", filterColumn: "house_id" },
      ],
      finalRefColumn: "bed_id",
    },
    dimensions: [
      { key: "status", label: "Stay Status", column: "status" },
      { key: "move_in_month", label: "Move-In Month", column: "move_in_date", truncate: "month" },
    ],
    metrics: [
      { key: "stay_count", label: "Stays", column: "id", agg: "count" },
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
    slug: "hr-headcount",
    label: "HR — Headcount",
    table: "employees",
    defaultDateColumn: "created_at",
    scope: { type: "direct", officeColumn: "assigned_office_id" },
    dimensions: [
      { key: "role", label: "Role", column: "role" },
      { key: "is_active", label: "Active Status", column: "is_active" },
      { key: "created_month", label: "Added Month", column: "created_at", truncate: "month" },
    ],
    metrics: [{ key: "employee_count", label: "Employees", column: "id", agg: "count" }],
    allowedRoles: ["regional_director", "program_director", "admin"],
  },
  {
    slug: "hr-training-completions",
    label: "HR — Training Completions",
    table: "lms_course_completions",
    defaultDateColumn: "completed_at",
    // lms_course_completions has no office_id - scoped via the
    // completing employee's own assigned_office_id.
    scope: { type: "chain", hops: [{ table: "employees", idColumn: "id", officeColumn: "assigned_office_id" }], finalRefColumn: "employee_id" },
    dimensions: [
      { key: "course_id", label: "Course", column: "course_id", lookup: { table: "lms_courses", labelColumn: "title" } },
      { key: "completed_month", label: "Completed Month", column: "completed_at", truncate: "month" },
    ],
    metrics: [{ key: "completion_count", label: "Completions", column: "id", agg: "count" }],
    allowedRoles: ["regional_director", "program_director", "admin"],
  },
  {
    slug: "hr-clock-summary",
    label: "HR — Clock In/Out Summary",
    table: "time_clock_entries",
    defaultDateColumn: "clock_in_at",
    scope: { type: "chain", hops: [{ table: "employees", idColumn: "id", officeColumn: "assigned_office_id" }], finalRefColumn: "employee_id" },
    dimensions: [{ key: "clock_month", label: "Month", column: "clock_in_at", truncate: "month" }],
    metrics: [
      { key: "entry_count", label: "Clock-Ins", column: "id", agg: "count" },
      { key: "total_hours", label: "Total Hours", agg: "duration_hours_sum", startColumn: "clock_in_at", endColumn: "clock_out_at" },
      { key: "avg_hours", label: "Avg Hours / Entry", agg: "duration_hours_avg", startColumn: "clock_in_at", endColumn: "clock_out_at" },
    ],
    allowedRoles: ["regional_director", "program_director", "admin"],
  },
  {
    slug: "grants",
    label: "Finance — Grants",
    table: "grants",
    defaultDateColumn: "received_date",
    scope: { type: "direct", officeColumn: "office_id" },
    fixedFilter: { column: "stream", value: "grant" },
    dimensions: [
      { key: "funder_name", label: "Funder", column: "funder_name" },
      { key: "program", label: "Program", column: "program" },
      { key: "region", label: "Region", column: "region" },
      { key: "fiscal_year", label: "Fiscal Year", column: "fiscal_year" },
      { key: "received_month", label: "Received Month", column: "received_date", truncate: "month" },
    ],
    metrics: [
      { key: "grant_count", label: "Grants", column: "id", agg: "count" },
      { key: "total_amount", label: "Total Amount", column: "amount", agg: "sum" },
      { key: "avg_amount", label: "Avg Amount", column: "amount", agg: "avg" },
    ],
    allowedRoles: ["regional_director", "program_director", "admin"],
  },
  {
    slug: "revenue-other-streams",
    label: "Finance — Other Revenue Streams",
    table: "grants",
    defaultDateColumn: "received_date",
    // Same physical table as Grants - RevenueClient.tsx splits it by
    // stream != 'grant' (in-kind, corporate sponsorship, etc.) rather
    // than a separate table, so the report mirrors that.
    scope: { type: "direct", officeColumn: "office_id" },
    dimensions: [
      { key: "stream", label: "Stream", column: "stream" },
      { key: "funder_name", label: "Funder", column: "funder_name" },
      { key: "region", label: "Region", column: "region" },
      { key: "received_month", label: "Received Month", column: "received_date", truncate: "month" },
    ],
    metrics: [
      { key: "entry_count", label: "Entries", column: "id", agg: "count" },
      { key: "total_amount", label: "Total Amount", column: "amount", agg: "sum" },
    ],
    allowedRoles: ["regional_director", "program_director", "admin"],
  },
  {
    slug: "grant-region-goals",
    label: "Finance — Grant Region Goals",
    table: "grant_region_goals",
    defaultDateColumn: "fiscal_year",
    scope: { type: "direct_region", regionColumn: "region" },
    dimensions: [
      { key: "region", label: "Region", column: "region" },
      { key: "fiscal_year", label: "Fiscal Year", column: "fiscal_year" },
    ],
    metrics: [{ key: "total_goal", label: "Total Goal Amount", column: "goal_amount", agg: "sum" }],
    allowedRoles: ["regional_director", "admin"],
  },
  {
    slug: "fundraiser-donations",
    label: "Fundraising — Donations",
    table: "charitystack_donation_events",
    defaultDateColumn: "event_timestamp",
    scope: { type: "chain", hops: [{ table: "fundraisers", idColumn: "id", officeColumn: "office_id" }], finalRefColumn: "fundraiser_id" },
    dimensions: [{ key: "event_month", label: "Month", column: "event_timestamp", truncate: "month" }],
    metrics: [
      { key: "donation_count", label: "Donations", column: "id", agg: "count" },
      { key: "total_amount", label: "Total Amount", column: "amount", agg: "sum" },
      { key: "avg_amount", label: "Avg Donation", column: "amount", agg: "avg" },
    ],
    allowedRoles: ["regional_director", "program_director", "admin"],
  },
  {
    slug: "donor-call-pledges",
    label: "Fundraising — Donor Call Pledges",
    table: "donor_call_outcomes",
    defaultDateColumn: "called_at",
    scope: { type: "chain", hops: [{ table: "employees", idColumn: "id", officeColumn: "assigned_office_id" }], finalRefColumn: "caller_employee_id" },
    dimensions: [{ key: "called_month", label: "Month", column: "called_at", truncate: "month" }],
    metrics: [
      { key: "pledge_count", label: "Pledges", column: "id", agg: "count" },
      { key: "total_pledged", label: "Total Pledged", column: "pledge_amount", agg: "sum" },
    ],
    allowedRoles: ["regional_director", "program_director", "admin"],
  },
  {
    slug: "square-payments",
    label: "Finance — Square Payments",
    table: "square_payments",
    defaultDateColumn: "square_created_at",
    scope: { type: "direct", officeColumn: "office_id" },
    fixedFilter: { column: "status", value: "COMPLETED" },
    dimensions: [{ key: "payment_month", label: "Month", column: "square_created_at", truncate: "month" }],
    metrics: [
      { key: "payment_count", label: "Payments", column: "id", agg: "count" },
      { key: "total_amount", label: "Total Amount", column: "amount", agg: "sum" },
    ],
    allowedRoles: ["regional_director", "program_director", "admin"],
  },
  {
    slug: "finance-approvals",
    label: "Finance — Approval Requests",
    table: "finance_approval_requests",
    defaultDateColumn: "created_at",
    // Approvals climb a management chain resolved live via Microsoft
    // Graph (see lib/financeApproval.ts) rather than an office - the
    // request itself carries no office_id, so this is org-wide/admin.
    scope: { type: "none" },
    dimensions: [
      { key: "status", label: "Status", column: "status" },
      { key: "final_tier_name", label: "Final Tier", column: "final_tier_name" },
      { key: "created_month", label: "Month", column: "created_at", truncate: "month" },
    ],
    metrics: [
      { key: "request_count", label: "Requests", column: "id", agg: "count" },
      { key: "total_amount", label: "Total Amount", column: "amount", agg: "sum" },
    ],
    allowedRoles: ["admin"],
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
