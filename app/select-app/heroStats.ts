// The numbers people can show in the green greeting box on the home page.
// Each person picks up to MAX_HERO_STATS (saved in
// employee_home_layouts.hero_stats, in the order they picked them).
// Values are computed in page.tsx, only for the stats someone has chosen.

export type HeroStatKey =
  | "openTickets"
  | "awaitingApproval"
  | "trainingDue"
  | "helpDeskIt"
  | "hoursThisWeek"
  | "timeOffBalance"
  | "teamTime"
  | "milesThisMonth"
  | "volunteerEvents";

export type HeroStatDef = {
  key: HeroStatKey;
  /** i18n key for the label, with an English fallback */
  labelKey?: string;
  label: string;
  desc: string;
  source: "Portal" | "ADP" | "Managers";
  href?: string;
  gold?: boolean;
  /** only offered to people who approve someone's time */
  managerOnly?: boolean;
};

export const HERO_STATS: HeroStatDef[] = [
  { key: "openTickets", labelKey: "selectApp.stat.openTickets", label: "Open Tickets", desc: "Helpdesk tickets you opened that aren't closed", source: "Portal", href: "/helpdesk" },
  { key: "awaitingApproval", labelKey: "selectApp.stat.awaitingApproval", label: "Awaiting Your Approval", desc: "Finance approvals waiting on you", source: "Portal", gold: true },
  { key: "trainingDue", labelKey: "selectApp.stat.trainingDue", label: "Training Due", desc: "Required courses not finished", source: "Portal", href: "/training" },
  { key: "helpDeskIt", labelKey: "selectApp.stat.helpDeskIt", label: "Help Desk (IT)", desc: "IT tickets assigned to you", source: "Portal" },
  { key: "hoursThisWeek", label: "Hours This Week", desc: "From your clock in and out", source: "Portal", href: "/time" },
  { key: "timeOffBalance", label: "Vacation Hours", desc: "Vacation hours you can request", source: "ADP", href: "/time" },
  { key: "teamTime", label: "Team Time Off", desc: "Time off requests waiting on you", source: "Managers", href: "/time/team", gold: true, managerOnly: true },
  { key: "milesThisMonth", label: "Miles This Month", desc: "Mileage you've logged this month", source: "Portal", href: "/mileage" },
  { key: "volunteerEvents", label: "Events This Week", desc: "Volunteer events at your office in the next 7 days", source: "Portal", href: "/volunteer" },
];

export const HERO_STATS_BY_KEY = new Map(HERO_STATS.map((s) => [s.key, s]));

export const DEFAULT_HERO_STATS: HeroStatKey[] = ["openTickets", "awaitingApproval", "trainingDue", "helpDeskIt"];

export const MAX_HERO_STATS = 4;

/** Saved choice (or the default), limited to what this person may see. */
export function resolveHeroStats(saved: string[] | null | undefined, available: Set<string>): HeroStatKey[] {
  const base = saved ?? DEFAULT_HERO_STATS;
  const out: HeroStatKey[] = [];
  for (const k of base) {
    if (available.has(k) && HERO_STATS_BY_KEY.has(k as HeroStatKey) && !out.includes(k as HeroStatKey)) out.push(k as HeroStatKey);
    if (out.length >= MAX_HERO_STATS) break;
  }
  return out;
}
