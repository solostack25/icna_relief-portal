"use client";

import Link from "next/link";
import ClientPickups from "@/app/orlando-automation/_components/ClientPickups";
import ClientBlockControl from "@/app/orlando-automation/_components/ClientBlockControl";
import ClientNotes from "@/app/orlando-automation/_components/ClientNotes";
import BackpackDistribution from "@/app/orlando-automation/_components/BackpackDistribution";
import ClientIdCard from "@/app/orlando-automation/_components/ClientIdCard";
import HouseholdMembers from "@/app/orlando-automation/_components/HouseholdMembers";
import HouseholdClients from "@/app/orlando-automation/_components/HouseholdClients";
import CommsActionBar from "@/app/orlando-automation/_components/CommsActionBar";
import CommsHistory from "@/app/orlando-automation/_components/CommsHistory";
import { useLanguage } from "@/lib/orlandoAutomation/i18n";

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  client_number: string | null;
  legacy_client_id: string | null;
  dietary_preference: string | null;
  dob: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  city: string | null;
  zip: string | null;
  is_blocked: boolean | null;
  blocked_reason: string | null;
  household_key: string | null;
};

export default function ClientProfileView({
  client,
  created,
  existing,
}: {
  client: Client;
  created?: string;
  existing?: string;
}) {
  const { t } = useLanguage();
  const id = client.id;

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/orlando-automation/clients"
          className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          {t("common.backToSearch")}
        </Link>

        {created && (
          <div className="mt-4 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-4 py-3 text-sm text-[var(--color-accent)]">
            {t("profile.registeredSuccess")}
          </div>
        )}
        {existing && (
          <div className="mt-4 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800">
            {t("profile.matchedExisting")}
          </div>
        )}

        <div className="flex items-center justify-between mt-4 mb-8">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              {client.first_name} {client.last_name}
              {(client.dietary_preference === "Halal" || client.dietary_preference === "Non-Halal") && (
                <span
                  className={[
                    "rounded-full text-xs font-medium px-2.5 py-0.5",
                    client.dietary_preference === "Halal"
                      ? "bg-[var(--badge-green-bg)] text-[var(--badge-green-fg)]"
                      : "bg-[var(--badge-amber-bg)] text-[var(--badge-amber-fg)]",
                  ].join(" ")}
                >
                  {client.dietary_preference}
                </span>
              )}
            </h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              {client.client_number}
              {client.legacy_client_id ? ` · Legacy ID ${client.legacy_client_id}` : ""}
            </p>
          </div>
        </div>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
          <h2 className="text-sm font-medium mb-4">Comms</h2>
          <div className="mb-4">
            <CommsActionBar phone={client.phone} />
          </div>
          <CommsHistory clientId={id} />
        </section>

        <ClientBlockControl
          clientId={id}
          initialBlocked={client.is_blocked ?? false}
          initialReason={client.blocked_reason}
        />

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
          <h2 className="text-sm font-medium mb-4">{t("profile.clientInfo")}</h2>
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-[var(--color-text-dim)]">{t("profile.dob")}</dt>
            <dd>{client.dob ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">{t("intake.dietaryPref")}</dt>
            <dd>{client.dietary_preference ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">{t("profile.phone")}</dt>
            <dd>{client.phone ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">{t("profile.email")}</dt>
            <dd>{client.email ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">{t("profile.address")}</dt>
            <dd>
              {client.address_line1
                ? `${client.address_line1}, ${client.city ?? ""} ${client.zip ?? ""}`
                : "—"}
            </dd>
          </dl>
        </section>

        <ClientIdCard
          clientNumber={client.client_number}
          firstName={client.first_name}
          lastName={client.last_name}
        />

        {client.household_key ? (
          <HouseholdClients clientId={id} householdKey={client.household_key} />
        ) : (
          <HouseholdMembers clientId={id} />
        )}

        <ClientPickups clientId={id} />

        <BackpackDistribution clientId={id} householdKey={client.household_key} />

        <ClientNotes clientId={id} />
      </div>
    </main>
  );
}
