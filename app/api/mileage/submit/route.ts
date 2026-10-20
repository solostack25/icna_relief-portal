import { NextResponse } from "next/server";
import { startFinanceTicketApproval } from "@/lib/financeTickets";
import { submitDrivesAsTicket, type DriveRow } from "@/lib/mileage";
import { requireEmployee, DRIVE_COLUMNS } from "../_auth";

// POST { drive_ids: string[], title?: string, timezone?: string }
// Submits the chosen trips as one Mileage Reimbursement finance ticket.
export async function POST(req: Request) {
  const auth = await requireEmployee();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.drive_ids) ? body.drive_ids.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "Pick at least one trip." }, { status: 400 });
  if (ids.length > 100) return NextResponse.json({ error: "Submit at most 100 trips at a time." }, { status: 400 });

  const { data: drives, error } = await auth.supabase
    .from("finance_mileage_drives")
    .select(DRIVE_COLUMNS)
    .eq("employee_id", auth.employeeId)
    .eq("status", "ready")
    .in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!drives || drives.length !== ids.length) {
    return NextResponse.json({ error: "Some of those trips were already submitted or removed. Refresh and try again." }, { status: 409 });
  }
  const missing = (drives as DriveRow[]).filter((d) => !d.purpose);
  if (missing.length) return NextResponse.json({ error: "Every trip needs a reason before it can be submitted." }, { status: 400 });

  let timezone = typeof body.timezone === "string" ? body.timezone : "America/Chicago";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    timezone = "America/Chicago";
  }

  const firstDate = new Date((drives as DriveRow[]).map((d) => d.started_at).sort()[0]);
  const defaultTitle = `Mileage - ${new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "long", year: "numeric" }).format(firstDate)}`;
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : defaultTitle;

  try {
    const result = await submitDrivesAsTicket({
      supabase: auth.supabase,
      employeeId: auth.employeeId,
      assignedOfficeId: auth.assignedOfficeId,
      drives: drives as DriveRow[],
      title,
      timezone,
      startApproval: startFinanceTicketApproval,
    });
    return NextResponse.json({ ...result, title });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong" }, { status: 500 });
  }
}
