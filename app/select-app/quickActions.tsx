// Every tile that can appear under Quick Actions on the home page.
// `defaultOn` tiles show for people who haven't customized; the rest are
// available to add from Customize. Add new tiles here — existing layouts
// pick them up automatically (appended, using defaultOn).

import type { ReactNode } from "react";

export type QuickAction = {
  key: string;
  href: string;
  /** i18n key, or plain text when the tile isn't translated yet */
  titleKey?: string;
  title?: string;
  descKey?: string;
  desc?: string;
  tint: string;
  iconColor: string;
  icon: ReactNode;
  defaultOn: boolean;
  /** Extra access check, decided on the server */
  requires?: "clientIntake";
};

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    {children}
  </svg>
);

export const QUICK_ACTIONS: QuickAction[] = [
  {
    key: "clients",
    href: "/clients",
    titleKey: "selectApp.card.clients.title",
    descKey: "selectApp.card.clients.desc",
    tint: "#EAF3EF",
    iconColor: "var(--portal-emerald)",
    defaultOn: true,
    requires: "clientIntake",
    icon: svg(
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
      </>
    ),
  },
  {
    key: "directory",
    href: "/directory",
    titleKey: "selectApp.card.directory.title",
    descKey: "selectApp.card.directory.desc",
    tint: "#FBF0DC",
    iconColor: "#A57420",
    defaultOn: true,
    icon: svg(
      <>
        <path d="M4 19V6a2 2 0 012-2h9l5 5v10a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
        <path d="M8 10h6M8 14h8" />
      </>
    ),
  },
  {
    key: "resources",
    href: "/resources",
    title: "Resources",
    desc: "Vehicles, properties, drivers, insurance and expiring documents",
    tint: "#EAF3EF",
    iconColor: "var(--portal-emerald)",
    defaultOn: true,
    icon: svg(
      <>
        <path d="M3 13l2-5a2 2 0 0 1 1.9-1.4h10.2A2 2 0 0 1 19 8l2 5v4a1 1 0 0 1-1 1h-1" />
        <path d="M5 18H4a1 1 0 0 1-1-1v-4h18" />
        <circle cx="7.5" cy="17.5" r="1.5" />
        <circle cx="16.5" cy="17.5" r="1.5" />
      </>
    ),
  },
  {
    key: "office-apps",
    href: "/office-apps",
    titleKey: "selectApp.card.officeApps.title",
    descKey: "selectApp.card.officeApps.desc",
    tint: "#E9F1F4",
    iconColor: "var(--portal-sky)",
    defaultOn: true,
    icon: svg(
      <>
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="M3 9h18" />
      </>
    ),
  },
  {
    key: "training",
    href: "/training",
    titleKey: "selectApp.card.training.title",
    descKey: "selectApp.card.training.desc",
    tint: "#F3E9F4",
    iconColor: "#8A5FA0",
    defaultOn: true,
    icon: svg(
      <>
        <path d="M22 10L12 5 2 10l10 5 10-5z" />
        <path d="M6 12v5c0 1.5 2.5 3 6 3s6-1.5 6-3v-5" />
      </>
    ),
  },
  {
    key: "upload-content",
    href: "/upload-content",
    titleKey: "selectApp.card.uploadContent.title",
    descKey: "selectApp.card.uploadContent.desc",
    tint: "#E3EEF8",
    iconColor: "#2B6CB0",
    defaultOn: true,
    icon: svg(
      <>
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <path d="M17 8l-5-5-5 5M12 3v12" />
      </>
    ),
  },
  {
    key: "fliers",
    href: "/fliers",
    titleKey: "selectApp.card.flier.title",
    descKey: "selectApp.card.flier.desc",
    tint: "#F4E9EE",
    iconColor: "#A0498A",
    defaultOn: true,
    icon: svg(
      <>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
  },
  {
    key: "fundraisers",
    href: "/fundraisers",
    titleKey: "selectApp.card.fundraisers.title",
    descKey: "selectApp.card.fundraisers.desc",
    tint: "#EAF3EF",
    iconColor: "var(--portal-emerald)",
    defaultOn: true,
    icon: svg(<path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />),
  },
  {
    key: "speaker-requests",
    href: "/speaker-requests",
    title: "Speaker Requests",
    desc: "Request a Jummah or program speaker — finance, agreement and W-9 handled automatically",
    tint: "#FBF0DC",
    iconColor: "#A57420",
    defaultOn: true,
    icon: svg(
      <>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0014 0M12 18v4M8 22h8" />
      </>
    ),
  },
  {
    key: "mileage",
    href: "/mileage",
    title: "Mileage Tracker",
    desc: "Tap Start when you drive, End when you arrive — miles go straight to a reimbursement ticket",
    tint: "#E7F3EE",
    iconColor: "#1F6F54",
    defaultOn: true,
    icon: svg(
      <>
        <path d="M5 17h14M6 17l1.5-5.5A2 2 0 019.4 10h5.2a2 2 0 011.9 1.5L18 17" />
        <circle cx="8" cy="17" r="2" />
        <circle cx="16" cy="17" r="2" />
        <path d="M12 3v4M9 5h6" />
      </>
    ),
  },
  {
    key: "time-off",
    href: "/time",
    title: "Time Off",
    desc: "Request vacation, sick, or personal time and see your hours this week",
    tint: "#E6F0F5",
    iconColor: "#2C5F7A",
    defaultOn: true,
    icon: svg(
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4" />
      </>
    ),
  },
  {
    key: "donor-calling",
    href: "/marketing/donor-calling",
    titleKey: "selectApp.card.donorCalling.title",
    descKey: "selectApp.card.donorCalling.desc",
    tint: "#E3EEF8",
    iconColor: "#2B6CB0",
    defaultOn: true,
    icon: svg(
      <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.1-8.7A2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .3 2 .6 2.9a2 2 0 01-.5 2.1L8 10a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.5c.9.3 1.9.5 2.9.6a2 2 0 011.7 2.1z" />
    ),
  },

  // ---- Off by default: people can add these from Customize ----
  {
    key: "helpdesk",
    href: "/helpdesk",
    titleKey: "selectApp.card.helpdesk.title",
    descKey: "selectApp.card.helpdesk.desc",
    tint: "#EEE9F8",
    iconColor: "#6B4FB8",
    defaultOn: false,
    icon: svg(
      <>
        <path d="M4 14v-2a8 8 0 0116 0v2" />
        <rect x="3" y="14" width="4" height="6" rx="1.5" />
        <rect x="17" y="14" width="4" height="6" rx="1.5" />
      </>
    ),
  },
  {
    key: "finance-tickets",
    href: "/finance-tickets",
    titleKey: "selectApp.card.financeTickets.title",
    descKey: "selectApp.card.financeTickets.desc",
    tint: "#FBF0DC",
    iconColor: "#A57420",
    defaultOn: false,
    icon: svg(
      <>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M7 9v.01M17 15v.01" />
      </>
    ),
  },
  {
    key: "my-approvals",
    href: "/finance-ticket-approvals",
    titleKey: "selectApp.card.myApprovals.title",
    descKey: "selectApp.card.myApprovals.desc",
    tint: "#EAF3EF",
    iconColor: "var(--portal-emerald)",
    defaultOn: false,
    icon: svg(
      <>
        <path d="M9 11l3 3 8-8" />
        <path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9" />
      </>
    ),
  },
  {
    key: "calendar",
    href: "/calendar",
    titleKey: "selectApp.card.calendar.title",
    descKey: "selectApp.card.calendar.desc",
    tint: "#E9F1F4",
    iconColor: "var(--portal-sky)",
    defaultOn: false,
    icon: svg(
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    ),
  },
];

export const QUICK_ACTIONS_BY_KEY = new Map(QUICK_ACTIONS.map((q) => [q.key, q]));
