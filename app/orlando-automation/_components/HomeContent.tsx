"use client";

import Link from "next/link";
import {
  CalendarPlus,
  ClipboardCheck,
  UploadCloud,
  CalendarDays,
  MessageCircle,
  Megaphone,
  Users,
  Clock,
  UserX,
  BarChart3,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import DashboardStats from "@/app/orlando-automation/_components/DashboardStats";
import { useLanguage } from "@/lib/orlandoAutomation/i18n";

type Category = "green" | "amber" | "blue" | "purple";

const CATEGORY_CLASSES: Record<Category, string> = {
  green: "bg-[var(--badge-green-bg)] text-[var(--badge-green-fg)]",
  amber: "bg-[var(--badge-amber-bg)] text-[var(--badge-amber-fg)]",
  blue: "bg-[var(--badge-blue-bg)] text-[var(--badge-blue-fg)]",
  purple: "bg-[var(--badge-purple-bg)] text-[var(--badge-purple-fg)]",
};

type NavItem = {
  href: string;
  titleKey: string;
  icon: LucideIcon;
  category: Category;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/orlando-automation/distribution/new", titleKey: "home.newDistribution.title", icon: CalendarPlus, category: "green" },
  { href: "/orlando-automation/appointments", titleKey: "home.appointments.title", icon: ClipboardCheck, category: "amber" },
  { href: "/orlando-automation/salesforce", titleKey: "home.salesforce.title", icon: UploadCloud, category: "purple" },
  { href: "/orlando-automation/calendar", titleKey: "home.calendar.title", icon: CalendarDays, category: "green" },
  { href: "/orlando-automation/broadcasts", titleKey: "home.broadcasts.title", icon: MessageCircle, category: "blue" },
  { href: "/orlando-automation/campaigns", titleKey: "home.campaigns.title", icon: Megaphone, category: "blue" },
  { href: "/orlando-automation/clients", titleKey: "home.clients.title", icon: Users, category: "amber" },
  { href: "/orlando-automation/waitlist", titleKey: "home.waitlist.title", icon: Clock, category: "green" },
  { href: "/orlando-automation/no-shows", titleKey: "home.noShows.title", icon: UserX, category: "amber" },
  { href: "/orlando-automation/stats", titleKey: "home.stats.title", icon: BarChart3, category: "purple" },
  { href: "/orlando-automation/audit", titleKey: "home.audit.title", icon: ScrollText, category: "purple" },
  {
    href: "/orlando-automation/admin/comms-permissions",
    titleKey: "home.commsPermissions.title",
    icon: Settings,
    category: "purple",
  },
];

export default function HomeContent({ firstName }: { firstName: string | null }) {
  const { t } = useLanguage();

  if (!firstName) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-[var(--color-text-dim)]">{t("home.noEmployee")}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">{t("home.title")}</h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            {t("home.signedInAs", { name: firstName })}
          </p>
        </div>

        <DashboardStats />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {NAV_ITEMS.map(({ href, titleKey, icon: Icon, category }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3 hover:border-[var(--color-accent)] transition-colors"
            >
              <span
                className={[
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                  CATEGORY_CLASSES[category],
                ].join(" ")}
              >
                <Icon size={17} strokeWidth={2} aria-hidden="true" />
              </span>
              <span className="text-sm font-medium">{t(titleKey)}</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
