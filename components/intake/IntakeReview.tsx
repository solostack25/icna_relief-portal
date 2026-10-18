"use client";

// Review screen shown after filling out a household intake and before it's
// saved. Lists every member's details, flags likely mistakes (warnings —
// they don't block submitting), and lets staff jump back to fix a member.

export type ReviewMember = {
  first_name: string;
  middle_initial: string;
  last_name: string;
  dob: string;
  gender: string;
  marital_status: string;
  phone: string;
  email: string;
  address_line1: string;
  apt_unit_no: string;
  city: string;
  state: string;
  zip: string;
  country_of_birth: string;
  country_of_citizenship: string;
  snap: boolean;
  wic: boolean;
  chip: boolean;
  employed: boolean;
  employment_type: string;
  residency_status: string;
  race_ethnicity: string;
  monthly_income_range: string;
  household_vehicle_count: string;
  relationship_to_main_client: string;
};

function ageFrom(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

const fmtDob = (dob: string) => (dob ? new Date(dob + "T12:00:00").toLocaleDateString() : "");
const digits = (s: string) => s.replace(/\D/g, "");

export function intakeWarnings(members: ReviewMember[]): { member: number | null; text: string }[] {
  const out: { member: number | null; text: string }[] = [];
  const main = members[0];
  members.forEach((m, i) => {
    const who = i === 0 ? "Main client" : `${m.first_name || "Member " + (i + 1)}`;
    const age = ageFrom(m.dob);
    if (m.dob && age !== null && age < 0) out.push({ member: i, text: `${who}: date of birth is in the future.` });
    if (age !== null && age > 110) out.push({ member: i, text: `${who}: age ${age} — check the birth year.` });
    if (m.phone && digits(m.phone).length !== 10 && !(digits(m.phone).length === 11 && digits(m.phone).startsWith("1")))
      out.push({ member: i, text: `${who}: phone number doesn't look like 10 digits.` });
    if (m.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email)) out.push({ member: i, text: `${who}: email address looks incomplete.` });
    if (m.first_name && m.first_name.trim() !== m.first_name) out.push({ member: i, text: `${who}: name has extra spaces.` });
    if (!m.gender) out.push({ member: i, text: `${who}: gender not selected.` });
    if (i > 0 && m.relationship_to_main_client === "Spouse" && age !== null && age < 18)
      out.push({ member: i, text: `${who}: listed as spouse but under 18.` });
    if (i > 0 && ["Son", "Daughter"].includes(m.relationship_to_main_client)) {
      const mainAge = ageFrom(main.dob);
      if (mainAge !== null && age !== null && age >= mainAge) out.push({ member: i, text: `${who}: listed as a child but isn't younger than the main client.` });
    }
  });
  if (main) {
    const mainAge = ageFrom(main.dob);
    if (mainAge !== null && mainAge < 18) out.push({ member: 0, text: `Main client is ${mainAge} — under 18. Is the head of household correct?` });
    if (!main.phone) out.push({ member: 0, text: "Main client has no phone number." });
    if (!main.address_line1 || !main.city || !main.zip) out.push({ member: 0, text: "Household address is incomplete." });
    if (main.zip && !/^\d{5}(-\d{4})?$/.test(main.zip.trim())) out.push({ member: 0, text: "Zip code should be 5 digits." });
    if (main.state && !/^[A-Za-z]{2}$/.test(main.state.trim())) out.push({ member: 0, text: "State should be a 2-letter code (e.g. TX)." });
    if (!main.monthly_income_range) out.push({ member: 0, text: "Monthly income not selected." });
  }
  const names = members.map((m) => `${m.first_name.trim().toLowerCase()} ${m.last_name.trim().toLowerCase()}|${m.dob}`);
  names.forEach((n, i) => {
    if (names.indexOf(n) !== i) out.push({ member: i, text: `${members[i].first_name} ${members[i].last_name} is entered twice.` });
  });
  return out;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value === "" || value === null || value === undefined;
  return (
    <>
      <dt className="text-[var(--color-text-dim)]">{label}</dt>
      <dd className={empty ? "text-[var(--color-text-dim)]/60" : ""}>{empty ? "—" : value}</dd>
    </>
  );
}

export default function IntakeReview({
  members,
  extras = [],
  saving,
  error,
  onEdit,
  onConfirm,
}: {
  members: ReviewMember[];
  extras?: { label: string; value: string }[];
  saving: boolean;
  error: string | null;
  onEdit: (memberIndex: number | null) => void;
  onConfirm: () => void;
}) {
  const warnings = intakeWarnings(members);
  const main = members[0];
  const address = [
    [main.address_line1, main.apt_unit_no ? `#${main.apt_unit_no}` : ""].filter(Boolean).join(" "),
    [main.city, [main.state, main.zip].filter(Boolean).join(" ")].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-4">
        <h2 className="text-base font-semibold">Review before submitting</h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Check every detail below. Nothing is saved until you press Confirm.
        </p>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-xl border border-[#E2892F]/40 bg-[#E2892F]/10 p-4">
          <p className="text-sm font-medium text-[#8A5A18] mb-2">
            {warnings.length} thing{warnings.length === 1 ? "" : "s"} to double-check
          </p>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-sm text-[#8A5A18] flex items-start justify-between gap-3">
                <span>• {w.text}</span>
                {w.member !== null && (
                  <button type="button" onClick={() => onEdit(w.member)} className="text-xs underline shrink-0">
                    Fix
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Household</h3>
          <button type="button" onClick={() => onEdit(0)} className="text-xs text-[var(--color-accent)] underline">
            Edit
          </button>
        </div>
        <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
          <Row label="Members" value={String(members.length)} />
          <Row label="Address" value={address} />
          <Row label="Monthly income" value={main.monthly_income_range} />
          <Row label="Vehicles" value={main.household_vehicle_count} />
          {extras.map((x) => (
            <Row key={x.label} label={x.label} value={x.value} />
          ))}
        </dl>
      </section>

      {members.map((m, i) => {
        const age = ageFrom(m.dob);
        const benefits = [m.snap && "SNAP", m.wic && "WIC", m.chip && "CHIP"].filter(Boolean).join(", ");
        return (
          <section key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">
                {i === 0 ? "Main Client" : `Member ${i + 1} · ${m.relationship_to_main_client}`}
              </h3>
              <button type="button" onClick={() => onEdit(i)} className="text-xs text-[var(--color-accent)] underline">
                Edit
              </button>
            </div>
            <p className="text-lg font-semibold mb-3">
              {m.first_name} {m.middle_initial ? `${m.middle_initial}. ` : ""}
              {m.last_name}
            </p>
            <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
              <Row label="Date of birth" value={m.dob ? `${fmtDob(m.dob)}${age !== null ? ` (age ${age})` : ""}` : ""} />
              <Row label="Gender" value={m.gender} />
              <Row label="Marital status" value={m.marital_status} />
              <Row label="Phone" value={m.phone} />
              <Row label="Email" value={m.email} />
              {i > 0 && (
                <Row
                  label="Address"
                  value={[m.address_line1, m.city, m.state, m.zip].some(Boolean) ? [m.address_line1, m.city, m.state, m.zip].filter(Boolean).join(", ") : ""}
                />
              )}
              <Row label="Country of birth" value={m.country_of_birth} />
              <Row label="Citizenship" value={m.country_of_citizenship} />
              <Row label="Residency" value={m.residency_status} />
              <Row label="Race & ethnicity" value={m.race_ethnicity} />
              <Row label="Benefits" value={benefits || "None"} />
              <Row
                label="Employed"
                value={m.employed ? `Yes${m.employment_type && m.employment_type !== "NA" ? ` (${m.employment_type === "FT" ? "full-time" : "part-time"})` : ""}` : "No"}
              />
            </dl>
          </section>
        );
      })}

      {error && <p className="text-sm text-[#B55139]">{error}</p>}

      <div className="flex flex-col-reverse sm:flex-row gap-3">
        <button
          type="button"
          onClick={() => onEdit(null)}
          disabled={saving}
          className="sm:w-48 rounded-lg border border-[var(--color-border)] bg-white font-medium py-3 text-sm disabled:opacity-50"
        >
          ← Back to edit
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={saving}
          className="flex-1 rounded-lg bg-[var(--color-accent)] text-white font-medium py-3 text-sm disabled:opacity-50"
        >
          {saving ? "Registering household..." : `Confirm & Register Household (${members.length} member${members.length > 1 ? "s" : ""})`}
        </button>
      </div>
    </div>
  );
}

// Members inherit the main client's address when "share address" is on —
// members have no address fields of their own, so copying only at the moment
// a member was added left them blank if the address was typed afterward.
export function withSharedAddress<T extends ReviewMember>(members: T[], share: boolean): T[] {
  if (!share || members.length === 0) return members;
  const main = members[0];
  return members.map((m, i) =>
    i === 0
      ? m
      : { ...m, address_line1: main.address_line1, apt_unit_no: main.apt_unit_no, city: main.city, state: main.state, zip: main.zip }
  );
}
