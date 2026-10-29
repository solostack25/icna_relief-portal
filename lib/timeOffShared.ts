// Client-safe helpers for time off and timesheets (no server imports).
// Dates are plain "YYYY-MM-DD" strings everywhere so a request for
// "Nov 25" never shifts a day because of the viewer's time zone.

export type LeaveType = "vacation" | "sick" | "personal";

export const LEAVE_TYPES: { key: LeaveType; label: string }[] = [
  { key: "vacation", label: "Vacation" },
  { key: "sick", label: "Sick" },
  { key: "personal", label: "Personal" },
];

export const LEAVE_LABEL: Record<LeaveType, string> = {
  vacation: "Vacation",
  sick: "Sick",
  personal: "Personal",
};

export const LEAVE_COLORS: Record<LeaveType, { fg: string; bg: string }> = {
  vacation: { fg: "#1F6F54", bg: "#EAF3EF" },
  personal: { fg: "#7A5A12", bg: "#FBF0DC" },
  sick: { fg: "#2C5F7A", bg: "#E6F0F5" },
};

export type RequestStatus = "pending" | "approved" | "denied" | "cancelled";

export const STATUS_STYLE: Record<RequestStatus, { label: string; fg: string; bg: string }> = {
  pending: { label: "Pending", fg: "#7A5A12", bg: "#FBF0DC" },
  approved: { label: "Approved", fg: "#1F6F54", bg: "#EAF3EF" },
  denied: { label: "Denied", fg: "#9A3412", bg: "#FCE7DD" },
  cancelled: { label: "Cancelled", fg: "#5F6E68", bg: "#EEF1EF" },
};

/** Day boundaries for clock punches. Offices span time zones; Central is
 *  the default until per-office zones exist. */
export const PORTAL_TZ = process.env.NEXT_PUBLIC_PORTAL_TIMEZONE || "America/Chicago";

/** Weekly hours above this count as overtime. */
export const OVERTIME_HOURS = 40;

function parse(d: string): Date {
  return new Date(`${d}T00:00:00Z`);
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  const x = parse(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fmt(x);
}

/** Today's date in the given zone, as YYYY-MM-DD. */
export function todayIn(tz: string = PORTAL_TZ): string {
  return dateIn(new Date(), tz);
}

/** The calendar date a timestamp falls on in a zone. */
export function dateIn(t: Date | string, tz: string = PORTAL_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    typeof t === "string" ? new Date(t) : t
  );
}

/** Monday of the week containing d. */
export function mondayOf(d: string): string {
  const day = parse(d).getUTCDay(); // 0 = Sunday
  return addDays(d, day === 0 ? -6 : 1 - day);
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Monday-to-Friday days between two dates, inclusive. */
export function workdaysBetween(start: string, end: string): number {
  if (!start || !end || end < start) return 0;
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const wd = parse(d).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
    if (n > 400) break;
  }
  return n;
}

export function defaultHours(start: string, end: string): number {
  return workdaysBetween(start, end) * 8;
}

export function shortDate(d: string, withWeekday = true): string {
  return parse(d).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: withWeekday ? "short" : undefined,
    month: "short",
    day: "numeric",
  });
}

export function formatRange(start: string, end: string): string {
  if (start === end) return shortDate(start);
  return `${shortDate(start)} – ${shortDate(end)}`;
}

/** Do two inclusive date ranges overlap? */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function formatHours(h: number): string {
  return String(Math.round(h * 100) / 100);
}

export function adpStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "queued":
      return "Waiting for ADP";
    case "sent":
      return "In ADP";
    case "error":
      return "ADP error";
    default:
      return "";
  }
}

// ---- Timesheets ----

export type Punch = { clock_in_at: string; clock_out_at: string | null };

export type DayCell = {
  date: string;
  hours: number;
  /** a punch from an earlier day was never closed */
  missedPunch: boolean;
  /** clocked in right now */
  open: boolean;
  /** approved time off on this day */
  timeOff: LeaveType | null;
  timeOffHours: number;
};

export type WeekRow = {
  days: DayCell[];
  workedHours: number;
  timeOffHours: number;
  totalHours: number;
  missedPunch: boolean;
  overtimeHours: number;
};

/**
 * Builds one employee's week from clock punches and approved time off.
 * A punch counts on the day it started. An unclosed punch from before
 * today is a missed punch and contributes no hours.
 */
export function buildWeek(
  weekStart: string,
  punches: Punch[],
  timeOff: { leave_type: LeaveType; start_date: string; end_date: string; hours: number }[],
  now: Date = new Date(),
  tz: string = PORTAL_TZ
): WeekRow {
  const today = dateIn(now, tz);
  const days: DayCell[] = weekDays(weekStart).map((date) => ({
    date,
    hours: 0,
    missedPunch: false,
    open: false,
    timeOff: null,
    timeOffHours: 0,
  }));
  const byDate = new Map(days.map((d) => [d.date, d]));

  for (const p of punches) {
    const cell = byDate.get(dateIn(p.clock_in_at, tz));
    if (!cell) continue;
    if (p.clock_out_at) {
      const h = (new Date(p.clock_out_at).getTime() - new Date(p.clock_in_at).getTime()) / 3_600_000;
      if (h > 0) cell.hours += h;
    } else if (cell.date < today) {
      cell.missedPunch = true;
    } else {
      cell.open = true;
    }
  }

  for (const t of timeOff) {
    const workdays = workdaysBetween(t.start_date, t.end_date) || 1;
    const perDay = Number(t.hours) / workdays;
    for (const cell of days) {
      const wd = parse(cell.date).getUTCDay();
      if (wd === 0 || wd === 6) continue;
      if (cell.date >= t.start_date && cell.date <= t.end_date) {
        cell.timeOff = t.leave_type;
        cell.timeOffHours += perDay;
      }
    }
  }

  for (const c of days) c.hours = Math.round(c.hours * 100) / 100;
  const workedHours = Math.round(days.reduce((s, c) => s + c.hours, 0) * 100) / 100;
  const timeOffHours = Math.round(days.reduce((s, c) => s + c.timeOffHours, 0) * 100) / 100;
  return {
    days,
    workedHours,
    timeOffHours,
    totalHours: Math.round((workedHours + timeOffHours) * 100) / 100,
    missedPunch: days.some((d) => d.missedPunch),
    overtimeHours: Math.max(0, Math.round((workedHours - OVERTIME_HOURS) * 100) / 100),
  };
}
