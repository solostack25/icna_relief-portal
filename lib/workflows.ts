// Every approval / routing flow in the portal, described once for the
// Admin → Workflows screen. Pure data (safe to import client-side).
//
// Steps stay as built in code; what an admin can change is who acts, the
// dollar limits, reminder timing and the mailboxes — via the editors below:
//   setting  → a wf_* key (lib/workflowSettings.ts) or an existing
//              integration_settings key on the EDITABLE_SETTINGS allow-list
//   list     → a people / recipient list (see LIST_KINDS)
//   link     → an existing admin screen that already edits this

export type SettingType = "money" | "hours" | "email" | "emails" | "text" | "longtext";
export type Editor =
  | { kind: "setting"; key: string; label: string; type: SettingType; help?: string }
  | { kind: "list"; list: ListKey; label: string; help?: string }
  | { kind: "link"; href: string; label: string; help?: string };

export type Step = {
  key: string;
  title: string;
  actor: string;
  notify?: string;
  count?: string; // key into the live counts returned by the API
  editors?: Editor[];
  branch?: boolean; // conditional step (drawn dashed)
};

export type Flow = {
  key: string;
  name: string;
  group: "Tickets" | "Approvals" | "Programs" | "Operations";
  summary: string;
  pages: { label: string; href: string }[];
  steps: Step[];
  editors?: Editor[]; // flow-wide settings
  fixed?: string[]; // rules that are built in and not editable here
};

export type ListKey =
  | "finance_limits"
  | "finance_delegates"
  | "zakat_approvers"
  | "zakat_finance_staff"
  | "speaker_leadership"
  | "speaker_regional_directors"
  | "fundraiser_approvers"
  | "helpdesk_it"
  | "helpdesk_hr"
  | "helpdesk_marketing"
  | "helpdesk_finance"
  | "resource_recipients"
  | "reviewers"
  | "area_managers";

// integration_settings keys (non-credential) that Workflows may edit
export const EDITABLE_SETTINGS = [
  "wf_finance_mailbox",
  "wf_finance_csuite_auto_limit",
  "wf_finance_coo_auto_limit",
  "wf_finance_coo_title",
  "wf_finance_approval_reminder_hours",
  "wf_speaker_leadership_threshold",
  "wf_speaker_approval_reminder_hours",
  "wf_speaker_packet_reminder_hours",
  "wf_helpdesk_it_mailbox",
  "wf_hardware_cio_email",
  "wf_hardware_cso_email",
  "finance_ceo_email",
  "zakat_finance_emails",
  "speaker_requests_admin_email",
  "speaker_requests_from_mailbox",
  "volunteer_waiver_text",
  "volunteer_waiver_version",
] as const;

const HELPDESK_STEPS: Step[] = [
  { key: "submitted", title: "Submitted", actor: "Any staff member picks the department (IT, HR, Marketing) and category", count: "hd_open" },
  {
    key: "worked",
    title: "Assigned & worked",
    actor: "That department's queue managers assign and work it",
    count: "hd_in_progress",
    editors: [
      { kind: "list", list: "helpdesk_it", label: "IT queue managers", help: "IT managers can see every department's queue." },
      { kind: "list", list: "helpdesk_hr", label: "HR queue managers" },
      { kind: "list", list: "helpdesk_marketing", label: "Marketing queue managers" },
    ],
  },
  { key: "hold", title: "On hold / QA", actor: "Waiting on the requester, or IT quality check", count: "hd_on_hold", branch: true },
  { key: "handoff", title: "Hand off", actor: "Passed to another department as a new leg", branch: true },
  { key: "closed", title: "Closed", actor: "Closed when every department's leg is done", notify: "Staff can email the requester from the ticket", count: "hd_closed_30d" },
];

export const FLOWS: Flow[] = [
  {
    key: "helpdesk",
    name: "Help Desk tickets",
    group: "Tickets",
    summary: "IT, HR and Marketing requests. One ticket can pass between departments; each department works its own leg.",
    pages: [
      { label: "Submit / my tickets", href: "/helpdesk" },
      { label: "Manage tickets", href: "/admin/helpdesk/manage" },
      { label: "Workload", href: "/admin/helpdesk" },
    ],
    steps: HELPDESK_STEPS,
    editors: [{ kind: "setting", key: "wf_helpdesk_it_mailbox", label: "Emails to requesters are sent from", type: "email" }],
    fixed: [
      "Departments (IT, HR, Marketing) and their categories are built into the submit form",
      "A leg open more than 48 hours is flagged overdue",
      "IT points: +5 own ticket, +10 someone else's, +10 after hours, +5 closed within 24h, +2 emailed within 5h",
    ],
  },
  {
    key: "hardware",
    name: "Hardware purchases",
    group: "Approvals",
    summary: "IT Hardware Requests must be approved before anything is bought, and can't be closed until the invoice is uploaded.",
    pages: [
      { label: "Submit a request", href: "/helpdesk/new" },
      { label: "Manage tickets", href: "/admin/helpdesk/manage" },
    ],
    steps: [
      { key: "submitted", title: "Submitted", actor: "Staff member picks IT → Hardware Request" },
      {
        key: "supervisor",
        title: "Direct supervisor",
        actor: "The requester's manager in Microsoft 365, so a Regional or Program Director's request goes to whoever they report to",
        notify: "Email with Approve / Deny (no login); IT or the requester can send a reminder from the ticket",
        count: "hw_pending_supervisor",
      },
      {
        key: "executive",
        title: "CIO + CSO",
        actor: "Both at the same time; both must approve. If the supervisor was already the CIO or CSO, their one approval counts for both",
        count: "hw_pending_executive",
        editors: [
          { kind: "setting", key: "wf_hardware_cio_email", label: "CIO approver email", type: "email" },
          { kind: "setting", key: "wf_hardware_cso_email", label: "CSO approver email", type: "email" },
        ],
      },
      { key: "denied", title: "Denied", actor: "Any denial closes the ticket and emails the requester with the reason", branch: true },
      { key: "purchase", title: "Approved — IT purchases", actor: "IT team buys and uploads the invoice to the ticket", count: "hw_needs_invoice" },
      { key: "closed", title: "Closed", actor: "Only once an invoice is attached" },
    ],
    fixed: [
      "Until approved the ticket can only be Open or On Hold; the workboard and buttons can't move it further",
      "A role the requester holds themselves (e.g. the CIO asking for hardware) is counted as approved",
      "Applies to hardware tickets created after this went live; older and imported tickets are unaffected",
    ],
  },
  {
    key: "finance",
    name: "Finance tickets",
    group: "Approvals",
    summary: "Reimbursements, vendor and utility payments, PEX cards and honoraria. Approval climbs the requestor's management chain until someone's dollar limit covers the amount.",
    pages: [
      { label: "Submit / my tickets", href: "/finance-tickets" },
      { label: "Finance dashboard", href: "/admin/finance-tickets" },
      { label: "Approval coverage", href: "/admin/finance-tickets/approvals" },
    ],
    steps: [
      { key: "submitted", title: "Submitted", actor: "Requestor fills the category form" },
      {
        key: "csuite",
        title: "C-suite shortcut",
        actor: "C-suite requestors are auto-approved up to a limit (higher for the COO); above that the CEO approves",
        branch: true,
        editors: [
          { kind: "setting", key: "wf_finance_csuite_auto_limit", label: "C-suite auto-approve up to", type: "money" },
          { kind: "setting", key: "wf_finance_coo_auto_limit", label: "COO auto-approve up to", type: "money" },
          { kind: "setting", key: "wf_finance_coo_title", label: "COO job title (as in Microsoft 365)", type: "text" },
          { kind: "setting", key: "finance_ceo_email", label: "CEO approver email", type: "email" },
        ],
      },
      {
        key: "approval",
        title: "Manager approval chain",
        actor: "Requestor's manager (from Microsoft 365), then their manager, until one's dollar limit covers the total",
        notify: "Approver gets an email with Approve / Request changes / Reject buttons (no login); automatic reminders, or Remind from the Finance dashboard",
        count: "fin_awaiting",
        editors: [
          { kind: "list", list: "finance_limits", label: "Approver dollar limits", help: "An approver whose limit covers the ticket total gives the final approval. No limit = always passes up." },
          { kind: "list", list: "finance_delegates", label: "Out-of-office coverage" },
          { kind: "setting", key: "wf_finance_approval_reminder_hours", label: "Remind approvers after (hours)", type: "hours" },
        ],
      },
      { key: "fixing", title: "Sent back", actor: "Requestor edits and resubmits to the same approver", count: "fin_fixing", branch: true },
      { key: "ready", title: "Approved — ready to pay", actor: "Finance team picks it up", notify: "Requestor emailed", count: "fin_ready" },
      { key: "processing", title: "Processing", actor: "Assigned finance staff", count: "fin_processing" },
      { key: "paid", title: "Paid", actor: "Marked processed", notify: "Requestor emailed", count: "fin_paid_30d" },
    ],
    editors: [
      { kind: "setting", key: "wf_finance_mailbox", label: "Approval emails are sent from (and stuck-ticket alerts go to)", type: "email" },
      { kind: "list", list: "helpdesk_finance", label: "Finance team (dashboard & queue access)" },
    ],
    fixed: ["Managers come from Microsoft 365 (Entra) reporting lines", "Ticket categories and their forms are built in"],
  },
  {
    key: "irfas",
    name: "IRFAS / Zakat applications",
    group: "Approvals",
    summary: "Case managers apply for financial assistance for a client. Every approver must approve; finance then funds and pays.",
    pages: [
      { label: "Applications", href: "/irfas" },
      { label: "Zakat finance queue", href: "/admin/zakat-finance" },
      { label: "Office limits", href: "/admin/irfas/office-limits" },
    ],
    steps: [
      { key: "submitted", title: "Submitted", actor: "Case manager, from the client profile" },
      {
        key: "approval",
        title: "Approval (unanimous)",
        actor: "Every active Zakat approver; one rejection rejects the application",
        notify: "Each approver gets an email link",
        count: "irfas_pending",
        editors: [{ kind: "list", list: "zakat_approvers", label: "Zakat approvers" }],
      },
      {
        key: "approved",
        title: "Approved — funding",
        actor: "Zakat finance sets amount, program, funding source / grant",
        notify: "Finance notified by email",
        count: "irfas_approved",
        editors: [
          { kind: "setting", key: "zakat_finance_emails", label: "Notify on approval (comma-separated)", type: "emails" },
          { kind: "list", list: "zakat_finance_staff", label: "Zakat finance staff" },
        ],
      },
      { key: "paid", title: "Paid", actor: "Check number entered", count: "irfas_paid_30d" },
    ],
    fixed: ["Office monthly limits are shown for reference and not enforced at submission"],
  },
  {
    key: "speaker",
    name: "Speaker requests",
    group: "Approvals",
    summary: "Booking a speaker: Area Manager approval, leadership sign-off for costly travel, then an honorarium finance ticket and the speaker's agreement and W-9.",
    pages: [
      { label: "Requests", href: "/speaker-requests" },
      { label: "Leadership approvers", href: "/admin/speaker-requests" },
    ],
    steps: [
      { key: "submitted", title: "Submitted", actor: "Coordinator picks the Area Manager" },
      {
        key: "am",
        title: "Area Manager",
        actor: "The chosen Area Manager (their own manager if they're the requester)",
        notify: "Email link; reminder if no answer",
        count: "spk_pending_am",
        editors: [
          { kind: "list", list: "area_managers", label: "Area Managers offered on the form" },
          { kind: "setting", key: "wf_speaker_approval_reminder_hours", label: "Remind approvers after (hours)", type: "hours" },
        ],
      },
      {
        key: "leadership",
        title: "Leadership sign-off",
        actor: "Only when travel is needed and the total is over the threshold; the region's directors plus the leadership list, unanimously",
        branch: true,
        count: "spk_pending_leadership",
        editors: [
          { kind: "setting", key: "wf_speaker_leadership_threshold", label: "Leadership needed when travel total is over", type: "money" },
          { kind: "list", list: "speaker_leadership", label: "Leadership approvers" },
          { kind: "list", list: "speaker_regional_directors", label: "Regional directors (by region)" },
        ],
      },
      {
        key: "approved",
        title: "Approved",
        actor: "Honorarium finance ticket created; speaker gets the agreement + W-9 request",
        notify: "Coordinator gets a calendar invite; speaker reminded until the packet is done",
        count: "spk_approved",
        editors: [{ kind: "setting", key: "wf_speaker_packet_reminder_hours", label: "Remind speakers every (hours)", type: "hours" }],
      },
    ],
    editors: [
      { kind: "setting", key: "speaker_requests_admin_email", label: "Stuck-request alerts go to", type: "email" },
      { kind: "setting", key: "speaker_requests_from_mailbox", label: "Emails are sent from", type: "email" },
    ],
    fixed: ["Local (no travel) honorariums are capped at $500 — also enforced by the database"],
  },
  {
    key: "review",
    name: "Monthly program reports",
    group: "Programs",
    summary: "Back2School, Disaster Relief and FATE office reports are reviewed and either marked reviewed or flagged with a note.",
    pages: [{ label: "Review submissions", href: "/admin/review" }],
    steps: [
      { key: "submitted", title: "Submitted", actor: "Office staff", count: "rev_submitted" },
      {
        key: "review",
        title: "Review",
        actor: "Admins, regional directors (their region) and program directors (their programs)",
        editors: [{ kind: "list", list: "reviewers", label: "Reviewers" }, { kind: "link", href: "/admin/ad-mappings", label: "Roles come from AD group mappings" }],
      },
      { key: "flagged", title: "Flagged", actor: "Needs a fix from the office", count: "rev_flagged", branch: true },
      { key: "reviewed", title: "Reviewed", actor: "Done", count: "rev_reviewed_30d" },
    ],
  },
  {
    key: "fundraisers",
    name: "Fundraiser pages",
    group: "Approvals",
    summary: "Staff-created fundraisers must be approved before they go live on CharityStack and the website.",
    pages: [{ label: "Fundraisers", href: "/fundraisers" }],
    steps: [
      { key: "draft", title: "Created", actor: "Staff member" },
      { key: "review", title: "Approval", actor: "Admins and CIO approvers", count: "fund_pending", editors: [{ kind: "list", list: "fundraiser_approvers", label: "Fundraiser approvers (CIO)" }] },
      { key: "live", title: "Published", actor: "Synced to CharityStack and the website", count: "fund_approved" },
    ],
  },
  {
    key: "th",
    name: "Transitional Housing readmissions",
    group: "Programs",
    summary: "Readmission requests for former residents; approval assigns a bed and a six-month stay.",
    pages: [{ label: "Readmissions", href: "/transitional-housing/readmissions" }],
    steps: [
      { key: "requested", title: "Requested", actor: "Case manager" },
      { key: "review", title: "Review", actor: "Admins and program directors", count: "th_pending" },
      { key: "admitted", title: "Admitted", actor: "Bed assigned; 3/4/5-month milestones tracked; auto-vacated at exit date" },
    ],
  },
  {
    key: "resources",
    name: "Insurance & resources requests",
    group: "Operations",
    summary: "Vehicle, property and driver insurance requests from submission to bound, with expiry alerts.",
    pages: [
      { label: "Requests", href: "/resources/requests" },
      { label: "Settings", href: "/resources/settings" },
    ],
    steps: [
      { key: "submitted", title: "Submitted", actor: "Office staff", count: "res_submitted" },
      { key: "review", title: "Under review", actor: "Admins / CIO", count: "res_review" },
      { key: "carrier", title: "With carrier", actor: "Sent to the insurance carrier", count: "res_carrier" },
      { key: "bound", title: "Bound / closed", actor: "Coverage in place", count: "res_bound" },
    ],
    editors: [{ kind: "list", list: "resource_recipients", label: "Notification recipients by department", help: "Who is emailed for request updates and 90/60/30-day expiry alerts." }],
    fixed: ["Which departments get which event, and whether the office's area manager / regional director is copied, is built in"],
  },
  {
    key: "volunteer",
    name: "Volunteer events",
    group: "Programs",
    summary: "Publish an event, volunteers sign up and check in/out by QR; everyone is checked out at the end time.",
    pages: [{ label: "Volunteer events", href: "/volunteer" }],
    steps: [
      { key: "draft", title: "Draft", actor: "Office staff" },
      { key: "published", title: "Published", actor: "Public sign-up page + QR", count: "vol_upcoming" },
      { key: "checkin", title: "Check-in / out", actor: "Volunteers on their phones; auto check-out at end time" },
    ],
    editors: [
      { kind: "setting", key: "volunteer_waiver_text", label: "Volunteer waiver text", type: "longtext" },
      { kind: "setting", key: "volunteer_waiver_version", label: "Waiver version (change to make volunteers re-accept)", type: "text" },
    ],
  },
  {
    key: "inkind",
    name: "In-kind donations",
    group: "Operations",
    summary: "Donations logged at an intake station, signed by the donor, then pushed to Salesforce.",
    pages: [
      { label: "Intake", href: "/inkind" },
      { label: "In-kind admin", href: "/admin/inkind" },
    ],
    steps: [
      { key: "active", title: "Intake", actor: "Station staff", count: "ik_active" },
      { key: "signature", title: "Donor signature", actor: "Donor on the kiosk", count: "ik_signature" },
      { key: "completed", title: "Completed", actor: "Receipt emailed; synced to Salesforce", count: "ik_completed_30d" },
    ],
    editors: [{ kind: "link", href: "/admin/inkind/settings", label: "Office prefixes, Salesforce accounts and receipt email" }],
  },
];

export const FLOW = new Map(FLOWS.map((f) => [f.key, f]));
