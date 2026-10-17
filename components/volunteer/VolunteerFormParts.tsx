"use client";

import { VOLUNTEER_ETHNICITIES, VOLUNTEER_GENDERS, US_STATES, ageOn } from "@/lib/volunteer";

export const volInputClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-base sm:text-sm outline-none focus:border-[var(--color-accent)]";
export const volLabelClass = "block text-xs mb-1 text-[var(--color-text-dim)]";

export type ProfileState = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  gender: string;
  ethnicity: string;
  home_city: string;
  home_state: string;
  home_zip: string;
};

export const emptyProfile: ProfileState = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  date_of_birth: "",
  gender: "",
  ethnicity: "",
  home_city: "",
  home_state: "",
  home_zip: "",
};

export type WaiverState = { agreed: boolean; signature: string; guardian_name: string };
export const emptyWaiver: WaiverState = { agreed: false, signature: "", guardian_name: "" };

// Name + contact. `contactLocked` hides the fields the volunteer already
// typed on the lookup step.
export function ContactFields({
  value,
  onChange,
  requireEmail = true,
  hide = [],
}: {
  value: ProfileState;
  onChange: (p: ProfileState) => void;
  requireEmail?: boolean;
  hide?: ("email" | "phone")[];
}) {
  const set = (k: keyof ProfileState, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={volLabelClass}>First name *</label>
          <input required autoComplete="given-name" value={value.first_name} onChange={(e) => set("first_name", e.target.value)} className={volInputClass} />
        </div>
        <div>
          <label className={volLabelClass}>Last name *</label>
          <input required autoComplete="family-name" value={value.last_name} onChange={(e) => set("last_name", e.target.value)} className={volInputClass} />
        </div>
      </div>
      {!hide.includes("email") && (
        <div>
          <label className={volLabelClass}>Email{requireEmail ? " *" : ""}</label>
          <input
            required={requireEmail}
            type="email"
            autoComplete="email"
            inputMode="email"
            value={value.email}
            onChange={(e) => set("email", e.target.value)}
            className={volInputClass}
          />
        </div>
      )}
      {!hide.includes("phone") && (
        <div>
          <label className={volLabelClass}>Mobile phone</label>
          <input type="tel" autoComplete="tel" inputMode="tel" value={value.phone} onChange={(e) => set("phone", e.target.value)} className={volInputClass} />
        </div>
      )}
    </div>
  );
}

// Demographics + home address. All optional with "Prefer not to say" —
// these feed program reporting (age bands, ethnicity, home region).
export function DemographicFields({
  value,
  onChange,
  only,
}: {
  value: ProfileState;
  onChange: (p: ProfileState) => void;
  only?: string[]; // limit to missing fields for returning volunteers
}) {
  const set = (k: keyof ProfileState, v: string) => onChange({ ...value, [k]: v });
  const show = (k: string) => !only || only.includes(k);
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-text-dim)]">
        Optional — helps ICNA Relief report on who our volunteers are. Never shared publicly.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {show("date_of_birth") && (
          <div>
            <label className={volLabelClass}>Date of birth</label>
            <input type="date" value={value.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} className={volInputClass} />
          </div>
        )}
        {show("gender") && (
          <div>
            <label className={volLabelClass}>Gender</label>
            <select value={value.gender} onChange={(e) => set("gender", e.target.value)} className={volInputClass}>
              <option value="">Select…</option>
              {VOLUNTEER_GENDERS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      {show("ethnicity") && (
        <div>
          <label className={volLabelClass}>Ethnicity</label>
          <select value={value.ethnicity} onChange={(e) => set("ethnicity", e.target.value)} className={volInputClass}>
            <option value="">Select…</option>
            {VOLUNTEER_ETHNICITIES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      )}
      {show("home_zip") && (
        <div className="grid grid-cols-6 gap-3">
          <div className="col-span-3">
            <label className={volLabelClass}>Home city</label>
            <input autoComplete="address-level2" value={value.home_city} onChange={(e) => set("home_city", e.target.value)} className={volInputClass} />
          </div>
          <div className="col-span-1">
            <label className={volLabelClass}>State</label>
            <select value={value.home_state} onChange={(e) => set("home_state", e.target.value)} className={volInputClass + " px-1"}>
              <option value=""></option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={volLabelClass}>ZIP</label>
            <input
              autoComplete="postal-code"
              inputMode="numeric"
              maxLength={5}
              value={value.home_zip}
              onChange={(e) => set("home_zip", e.target.value.replace(/\D/g, ""))}
              className={volInputClass}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function WaiverBlock({
  text,
  value,
  onChange,
  dateOfBirth,
}: {
  text: string;
  value: WaiverState;
  onChange: (w: WaiverState) => void;
  dateOfBirth?: string | null;
}) {
  const age = ageOn(dateOfBirth || null);
  const minor = age !== null && age < 18;
  return (
    <div className="space-y-3">
      <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-black/[0.02] p-3 text-xs leading-relaxed whitespace-pre-line">
        {text}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.agreed}
          onChange={(e) => onChange({ ...value, agreed: e.target.checked })}
          className="mt-0.5 h-5 w-5 accent-[var(--color-accent)]"
        />
        <span>I have read and agree to the volunteer waiver.</span>
      </label>
      <div>
        <label className={volLabelClass}>Type your full name to sign *</label>
        <input value={value.signature} onChange={(e) => onChange({ ...value, signature: e.target.value })} className={volInputClass + " italic"} />
      </div>
      {minor && (
        <div>
          <label className={volLabelClass}>Parent or guardian's full name * (volunteer is under 18)</label>
          <input value={value.guardian_name} onChange={(e) => onChange({ ...value, guardian_name: e.target.value })} className={volInputClass} />
        </div>
      )}
    </div>
  );
}

export function profilePayload(p: ProfileState) {
  const out: Record<string, string> = {};
  (Object.keys(p) as (keyof ProfileState)[]).forEach((k) => {
    if (p[k].trim()) out[k] = p[k].trim();
  });
  return out;
}
