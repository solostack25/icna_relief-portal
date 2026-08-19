import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import GenerateCardButton from "./GenerateCardButton";
import ViewIdCardButton from "./ViewIdCardButton";
import PushToSalesforceButton from "./PushToSalesforceButton";
import DistributeBackpackButton from "./DistributeBackpackButton";
import AdmitToHousingButton from "./AdmitToHousingButton";
import LogServiceButton from "./LogServiceButton";
import ProgramSection from "./ProgramSection";
import CallTextButtons from "../../components/CallTextButtons";
import IntakeInfoEditor from "./IntakeInfoEditor";

export default async function ClientProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: clientRecord } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();

  if (!clientRecord) redirect("/intake");

  // separate queries, merged in memory — no relational joins
  const { data: members } = await supabase
    .from("household_members")
    .select("id, first_name, last_name, dob, relationship, gender")
    .eq("client_id", id)
    .order("dob");

  // New-model household members: full independent client records sharing
  // household_key, distinct from the legacy `household_members` shallow
  // sub-table above. Null on legacy clients that predate this schema.
  const { data: householdClients } = clientRecord.household_key
    ? await supabase
        .from("clients")
        .select("id, client_number, first_name, last_name, dob, relationship_to_main_client")
        .eq("household_key", clientRecord.household_key)
        .neq("id", id)
        .order("client_number")
    : { data: [] };

  const { data: cards } = await supabase
    .from("client_id_cards")
    .select("id, card_number, issued_at, is_active")
    .eq("client_id", id)
    .order("issued_at", { ascending: false });

  const { data: thStays } = await supabase
    .from("th_stays")
    .select("id, bed_id, move_in_date, expected_exit_date, status, vacated_at, vacated_reason, salesforce_synced, salesforce_case_id")
    .eq("client_id", id)
    .order("move_in_date", { ascending: false });

  const bedIds = [...new Set((thStays ?? []).map((s) => s.bed_id))];
  const { data: thBeds } = bedIds.length
    ? await supabase.from("th_beds").select("id, house_id, label").in("id", bedIds)
    : { data: [] };
  const houseIds = [...new Set((thBeds ?? []).map((b) => b.house_id))];
  const { data: thHouses } = houseIds.length
    ? await supabase.from("th_houses").select("id, name").in("id", houseIds)
    : { data: [] };

  const bedById = new Map((thBeds ?? []).map((b) => [b.id, b]));
  const houseById = new Map((thHouses ?? []).map((h) => [h.id, h]));

  const hasActiveStay = (thStays ?? []).some((s) => s.status === "active");
  const requiresReadmissionApproval = (thStays ?? []).length > 0 && !hasActiveStay;

  const { data: serviceLog } = await supabase
    .from("client_service_log")
    .select("id, program_slug, notes, created_at, salesforce_synced, salesforce_case_id")
    .eq("client_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: backpackDistributions } = await supabase
    .from("b2s_client_distributions")
    .select("id, school_year, backpacks_distributed, notes, distributed_at, salesforce_synced, salesforce_case_id")
    .eq("client_id", id)
    .order("distributed_at", { ascending: false });

  const foodLog = (serviceLog ?? []).filter((e) => e.program_slug === "hunger-prevention");
  const drsLog = (serviceLog ?? []).filter((e) => e.program_slug === "drs");
  const rsceLog = (serviceLog ?? []).filter((e) => e.program_slug === "rsce");

  function calcAge(dob: string) {
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/intake"
          className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          ← Back to search
        </Link>

        {created && (
          <div className="mt-4 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-4 py-3 text-sm text-[var(--color-accent)]">
            Client created successfully.
          </div>
        )}

        <div className="flex items-center justify-between mt-4 mb-8">
          <div>
            <h1 className="text-xl font-semibold">
              {clientRecord.first_name} {clientRecord.last_name}
            </h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              {clientRecord.client_number}
            </p>
          </div>
          <CallTextButtons
            phone={clientRecord.phone}
            targetName={`${clientRecord.first_name} ${clientRecord.last_name}`}
            targetType="client"
            targetId={clientRecord.id}
          />
        </div>

        <IntakeInfoEditor client={clientRecord} />

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
          <h2 className="text-sm font-medium mb-4">Client Info</h2>
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-[var(--color-text-dim)]">DOB</dt>
            <dd>{clientRecord.dob ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">Phone</dt>
            <dd>{clientRecord.phone ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">Email</dt>
            <dd>{clientRecord.email ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">Address</dt>
            <dd>
              {clientRecord.address_line1
                ? `${clientRecord.address_line1}${clientRecord.apt_unit_no ? ` #${clientRecord.apt_unit_no}` : ""}, ${clientRecord.city ?? ""} ${clientRecord.state ?? ""} ${clientRecord.zip ?? ""}`
                : "—"}
            </dd>
            <dt className="text-[var(--color-text-dim)]">Gender</dt>
            <dd>{clientRecord.gender ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">Marital Status</dt>
            <dd>{clientRecord.marital_status ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">Country of Birth</dt>
            <dd>{clientRecord.country_of_birth ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">Country of Citizenship</dt>
            <dd>{clientRecord.country_of_citizenship ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">Residency Status</dt>
            <dd>{clientRecord.residency_status ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">Race &amp; Ethnicity</dt>
            <dd>{clientRecord.race_ethnicity ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">Monthly Income</dt>
            <dd>{clientRecord.monthly_income_range ?? clientRecord.monthly_income ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">Vehicles in Household</dt>
            <dd>{clientRecord.household_vehicle_count ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">Employed</dt>
            <dd>
              {clientRecord.employed
                ? clientRecord.employment_type && clientRecord.employment_type !== "NA"
                  ? `Yes (${clientRecord.employment_type})`
                  : "Yes"
                : "No"}
            </dd>
            <dt className="text-[var(--color-text-dim)]">Benefits</dt>
            <dd>
              {[
                clientRecord.snap ? "SNAP" : null,
                clientRecord.wic ? "WIC" : null,
                clientRecord.chip ? "CHIP" : null,
              ]
                .filter(Boolean)
                .join(", ") || "None"}
            </dd>
            <dt className="text-[var(--color-text-dim)]">Dietary Pref.</dt>
            <dd>{clientRecord.dietary_preference ?? "—"}</dd>
          </dl>
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
          <h2 className="text-sm font-medium mb-4">
            Household Members ({members?.length ?? 0})
          </h2>
          {members && members.length > 0 ? (
            <div className="space-y-2">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0"
                >
                  <span>
                    {m.first_name} {m.last_name ?? ""}
                  </span>
                  <span className="text-[var(--color-text-dim)]">
                    {m.relationship} · Age {calcAge(m.dob)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-dim)]">
              No household members recorded.
            </p>
          )}
        </section>

        {clientRecord.household_key && (
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 mb-6">
            <h2 className="text-sm font-medium mb-4">
              Household ({(householdClients?.length ?? 0) + 1} member{(householdClients?.length ?? 0) === 0 ? "" : "s"})
            </h2>
            <p className="text-xs text-[var(--color-text-dim)] mb-3">
              Household key: {clientRecord.household_key}
            </p>
            {householdClients && householdClients.length > 0 ? (
              <div className="space-y-2">
                {householdClients.map((m) => (
                  <Link
                    key={m.id}
                    href={`/clients/${m.id}`}
                    className="flex justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 hover:text-[var(--color-accent)]"
                  >
                    <span>{m.first_name} {m.last_name ?? ""}</span>
                    <span className="text-[var(--color-text-dim)]">
                      {m.relationship_to_main_client ?? "—"} · {m.client_number}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-dim)]">
                No other household members on record.
              </p>
            )}
          </section>
        )}

        <ProgramSection
          title="Back to School"
          hasHistory={(backpackDistributions ?? []).length > 0}
          summary={
            (backpackDistributions ?? []).length > 0
              ? `${(backpackDistributions ?? []).length} distribution${(backpackDistributions ?? []).length === 1 ? "" : "s"} · last on ${new Date((backpackDistributions ?? [])[0].distributed_at).toLocaleDateString()}`
              : undefined
          }
          emptyText="No backpacks distributed yet."
          action={
            <DistributeBackpackButton
              clientId={id}
              members={(members ?? []).map((m) => ({
                id: m.id,
                first_name: m.first_name,
                dob: m.dob,
                gender: m.gender,
              }))}
            />
          }
        >
          <div className="space-y-2">
            {(backpackDistributions ?? []).map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0"
              >
                <span>
                  {d.backpacks_distributed} backpack{d.backpacks_distributed === 1 ? "" : "s"}
                  {d.school_year ? ` · ${d.school_year}` : ""}
                  {d.notes && <span className="text-[var(--color-text-dim)]"> · {d.notes}</span>}
                </span>
                <span className="flex items-center gap-3 shrink-0 ml-3">
                  <span className="text-[var(--color-text-dim)]">
                    {new Date(d.distributed_at).toLocaleDateString()}
                  </span>
                  <PushToSalesforceButton
                    recordId={d.id}
                    table="backpack"
                    alreadySynced={d.salesforce_synced}
                    salesforceCaseId={d.salesforce_case_id}
                  />
                </span>
              </div>
            ))}
          </div>
        </ProgramSection>

        <ProgramSection
          title="Food Distribution"
          hasHistory={foodLog.length > 0}
          summary={
            foodLog.length > 0
              ? `${foodLog.length} logged · last on ${new Date(foodLog[0].created_at).toLocaleDateString()}`
              : undefined
          }
          emptyText="No food distributions logged yet."
          action={
            <LogServiceButton
              clientId={id}
              programSlug="hunger-prevention"
              buttonLabel="Distribute Food"
              modalTitle="Distribute Food"
            />
          }
        >
          <div className="space-y-2">
            {foodLog.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0"
              >
                <span>{entry.notes ?? "Logged"}</span>
                <span className="flex items-center gap-3 shrink-0 ml-3">
                  <span className="text-[var(--color-text-dim)]">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </span>
                  <PushToSalesforceButton
                    recordId={entry.id}
                    table="service"
                    alreadySynced={entry.salesforce_synced}
                    salesforceCaseId={entry.salesforce_case_id}
                  />
                </span>
              </div>
            ))}
          </div>
        </ProgramSection>

        <ProgramSection
          title="DRS"
          hasHistory={drsLog.length > 0}
          summary={
            drsLog.length > 0
              ? `${drsLog.length} logged · last on ${new Date(drsLog[0].created_at).toLocaleDateString()}`
              : undefined
          }
          emptyText="No DRS assistance logged yet."
          action={
            <LogServiceButton
              clientId={id}
              programSlug="drs"
              buttonLabel="Log DRS Assistance"
              modalTitle="Log DRS Assistance"
              subtitle="Disaster Relief Services"
            />
          }
        >
          <div className="space-y-2">
            {drsLog.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0"
              >
                <span>{entry.notes ?? "Logged"}</span>
                <span className="flex items-center gap-3 shrink-0 ml-3">
                  <span className="text-[var(--color-text-dim)]">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </span>
                  <PushToSalesforceButton
                    recordId={entry.id}
                    table="service"
                    alreadySynced={entry.salesforce_synced}
                    salesforceCaseId={entry.salesforce_case_id}
                  />
                </span>
              </div>
            ))}
          </div>
        </ProgramSection>

        <ProgramSection
          title="RSCE"
          hasHistory={rsceLog.length > 0}
          summary={
            rsceLog.length > 0
              ? `${rsceLog.length} logged · last on ${new Date(rsceLog[0].created_at).toLocaleDateString()}`
              : undefined
          }
          emptyText="No RSCE assistance logged yet."
          action={
            <LogServiceButton
              clientId={id}
              programSlug="rsce"
              buttonLabel="Log RSCE Assistance"
              modalTitle="Log RSCE Assistance"
              subtitle="Refugee Services & Community Empowerment"
            />
          }
        >
          <div className="space-y-2">
            {rsceLog.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0"
              >
                <span>{entry.notes ?? "Logged"}</span>
                <span className="flex items-center gap-3 shrink-0 ml-3">
                  <span className="text-[var(--color-text-dim)]">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </span>
                  <PushToSalesforceButton
                    recordId={entry.id}
                    table="service"
                    alreadySynced={entry.salesforce_synced}
                    salesforceCaseId={entry.salesforce_case_id}
                  />
                </span>
              </div>
            ))}
          </div>
        </ProgramSection>

        <ProgramSection
          title="Transitional Housing"
          statusBadge={
            hasActiveStay ? (
              <span className="text-xs font-medium text-[var(--color-accent)] bg-[var(--color-accent)]/10 rounded-full px-2 py-0.5">
                Active
              </span>
            ) : requiresReadmissionApproval ? (
              <span className="text-xs font-medium text-[var(--color-accent-orange)] bg-[var(--color-accent-orange)]/10 rounded-full px-2 py-0.5">
                Requires approval to re-admit
              </span>
            ) : null
          }
          hasHistory={(thStays ?? []).length > 0}
          summary={
            (thStays ?? []).length > 0
              ? `${(thStays ?? []).length} stay${(thStays ?? []).length === 1 ? "" : "s"} on record`
              : undefined
          }
          emptyText="No Transitional Housing stays on record."
          action={
            !hasActiveStay && !requiresReadmissionApproval ? (
              <AdmitToHousingButton clientId={id} />
            ) : requiresReadmissionApproval ? (
              <a
                href={`/transitional-housing/readmissions/new?client=${id}`}
                className="rounded-lg border border-[var(--color-accent-orange)] text-[var(--color-accent-orange)] text-sm font-medium px-4 py-2 hover:bg-[var(--color-accent-orange)]/10"
              >
                File Readmission Request
              </a>
            ) : null
          }
        >
          <div className="space-y-2">
            {(thStays ?? []).map((s) => {
              const bed = bedById.get(s.bed_id);
              const house = bed ? houseById.get(bed.house_id) : null;
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0"
                >
                  <span>
                    {house?.name ?? "Unknown house"} · Bed {bed?.label ?? "?"}
                    <span className="text-[var(--color-text-dim)]">
                      {" "}
                      · {s.move_in_date} → {s.expected_exit_date}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0 ml-3">
                    <span
                      className={
                        s.status === "active"
                          ? "text-[var(--color-accent)] font-medium"
                          : "text-[var(--color-text-dim)]"
                      }
                    >
                      {s.status === "active" ? "Active" : `Vacated (${s.vacated_reason ?? "—"})`}
                    </span>
                    <PushToSalesforceButton
                      recordId={s.id}
                      table="housing"
                      alreadySynced={s.salesforce_synced}
                      salesforceCaseId={s.salesforce_case_id}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        </ProgramSection>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="text-sm font-medium mb-4">ID Cards</h2>
          <div className="space-y-2 mb-4">
            {(cards ?? []).map((c) => (
              <div
                key={c.id}
                className="flex justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0"
              >
                <span className="font-mono text-xs">{c.card_number}</span>
                <span className="text-[var(--color-text-dim)]">
                  {c.is_active ? "Active" : "Inactive"} ·{" "}
                  {new Date(c.issued_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GenerateCardButton clientId={id} />
            <ViewIdCardButton
              cardNumber={(cards ?? []).find((c) => c.is_active)?.card_number ?? null}
              firstName={clientRecord.first_name}
              lastName={clientRecord.last_name}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
