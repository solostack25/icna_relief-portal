// Static directory of portal sections the assistant can point people
// to. Deliberately not database-driven - these paths change rarely and
// a hardcoded list is far simpler than trying to keep a DB table in
// sync with the actual route tree. Keep this in sync by hand when a
// major new section is added.
export const PORTAL_PAGES: { name: string; path: string; description: string; keywords: string[] }[] = [
  {
    name: "Training",
    path: "/training",
    description: "Required and optional training courses, with progress tracking.",
    keywords: ["training", "course", "lms", "certification", "onboarding training"],
  },
  {
    name: "Help Desk",
    path: "/helpdesk",
    description: "Submit and track IT, HR, Marketing, or Finance tickets.",
    keywords: ["helpdesk", "help desk", "ticket", "it support", "submit a ticket"],
  },
  {
    name: "Volunteer Signups",
    path: "/volunteer",
    description: "Browse and sign up for volunteer events and shifts.",
    keywords: ["volunteer", "volunteering", "event signup", "shifts"],
  },
  {
    name: "Transitional Housing",
    path: "/transitional-housing",
    description: "Manage transitional housing residents, admissions, and houses.",
    keywords: ["transitional housing", "th", "case management", "admit", "resident", "house"],
  },
  {
    name: "Back to School",
    path: "/back-to-school",
    description: "Back-to-school backpack distribution program.",
    keywords: ["back to school", "b2s", "backpack", "school supplies"],
  },
  {
    name: "Fundraisers",
    path: "/fundraisers",
    description: "Create and manage fundraiser pages and donation campaigns.",
    keywords: ["fundraiser", "fundraising", "donation campaign", "gofundme"],
  },
  {
    name: "Client Directory",
    path: "/clients",
    description: "Search and view client records.",
    keywords: ["client", "clients", "client search", "client record"],
  },
  {
    name: "Employee Directory",
    path: "/directory",
    description: "Look up other employees and their contact info.",
    keywords: ["directory", "employee directory", "coworker", "phone number", "extension"],
  },
  {
    name: "Fliers",
    path: "/fliers",
    description: "Browse, create, and download marketing fliers.",
    keywords: ["flier", "flyer", "marketing material", "poster"],
  },
  {
    name: "FATE",
    path: "/fate",
    description: "FATE program tracking.",
    keywords: ["fate"],
  },
  {
    name: "Disaster Relief Services",
    path: "/drs",
    description: "Disaster relief services program tracking.",
    keywords: ["disaster relief", "drs"],
  },
  {
    name: "In-Kind Donations",
    path: "/inkind",
    description: "In-kind donation intake and tracking.",
    keywords: ["in-kind", "in kind", "donation intake", "inventory"],
  },
  {
    name: "Finance Approvals",
    path: "/finance-approvals",
    description: "Submit and review finance approval requests.",
    keywords: ["finance", "approval", "expense", "reimbursement"],
  },
  {
    name: "Office Apps / Home",
    path: "/select-app",
    description: "The portal home screen listing every app you have access to.",
    keywords: ["home", "main menu", "apps", "everything"],
  },
];

export function searchPortalPages(query: string) {
  const q = query.toLowerCase();
  const scored = PORTAL_PAGES.map((page) => {
    let score = 0;
    if (page.name.toLowerCase().includes(q)) score += 3;
    if (page.keywords.some((k) => q.includes(k) || k.includes(q))) score += 2;
    if (page.description.toLowerCase().includes(q)) score += 1;
    return { page, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((r) => r.page);
}
