import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import GenerateCardButton from "./GenerateCardButton";

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
    .select("id, first_name, last_name, dob, relationship")
    .eq("client_id", id)
    .order("dob");

  const { data: cards } = await supabase
    .from("client_id_cards")
    .select("id, card_number, issued_at, is_active")
    .eq("client_id", id)
    .order("issued_at", { ascending: false });

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
        </div>

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
                ? `${clientRecord.address_line1}, ${clientRecord.city ?? ""} ${clientRecord.state ?? ""} ${clientRecord.zip ?? ""}`
                : "—"}
            </dd>
            <dt className="text-[var(--color-text-dim)]">Monthly Income</dt>
            <dd>{clientRecord.monthly_income ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">Food Stamps</dt>
            <dd>{clientRecord.food_stamps_amount ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">Dietary Pref.</dt>
            <dd>{clientRecord.dietary_preference ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">Ethnicity</dt>
            <dd>{clientRecord.ethnicity ?? "—"}</dd>
            <dt className="text-[var(--color-text-dim)]">Country of Origin</dt>
            <dd>{clientRecord.country_of_origin ?? "—"}</dd>
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
          <GenerateCardButton clientId={id} />
        </section>
      </div>
    </main>
  );
}
