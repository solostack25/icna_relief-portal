// Human-readable labels for finance_tickets.status. The underlying
// column values are unchanged (pending/open/in_progress/on_hold/
// fixing/processed/denied/duplicate/draft) - this only changes what
// a person reads. "open" in particular means the OPPOSITE of what it
// sounds like everywhere else in this app (Help Desk legs, plain
// English) - it means fully approved and waiting to be paid, not
// "still needs to happen." Renaming the column itself would touch
// every route, filter, and color map that reads .status directly;
// relabeling here is the safer version of the same fix.
export const FINANCE_TICKET_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending: "Routing",
  fixing: "Needs Changes",
  on_hold: "Stuck — Needs Finance",
  open: "Approved — Awaiting Payment",
  in_progress: "Being Paid",
  processed: "Paid",
  denied: "Denied",
  duplicate: "Duplicate",
};

export function financeTicketStatusLabel(status: string): string {
  return FINANCE_TICKET_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export const FINANCE_TICKET_STATUS_COLORS: Record<string, string> = {
  draft: "#999",
  pending: "#A57420",
  fixing: "#B5566B",
  on_hold: "#B5566B",
  open: "#1F6F54",
  in_progress: "#3B6EA5",
  processed: "#16302B",
  denied: "#B5566B",
  duplicate: "#999",
};

// Same idea for an individual approval step's decision
// (finance_approvals.approval_status) - "fix" read alone as a raw
// word doesn't parse as a status the way "Changes Requested" does.
export const FINANCE_APPROVAL_STATUS_LABELS: Record<string, string> = {
  pending: "Awaiting Response",
  approved: "Approved",
  rejected: "Rejected",
  fix: "Changes Requested",
};

export function financeApprovalStatusLabel(status: string): string {
  return FINANCE_APPROVAL_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export const FINANCE_APPROVAL_STATUS_COLORS: Record<string, string> = {
  pending: "#A57420",
  approved: "#1F6F54",
  rejected: "#B5566B",
  fix: "#B5566B",
};
