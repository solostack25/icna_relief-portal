import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { graphGetAll } from "@/lib/msgraph";
import DirectoryClient from "./DirectoryClient";

export type DirectoryPerson = {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  department: string | null;
  officeLocation: string | null;
  phone: string | null;
};

type Office = { id: string; region: string; state: string; chapter: string; field_office: string };

function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/\boffice\b/g, "")
    .replace(/-?statewide/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

// Best-effort match of an AD person's officeLocation/department against
// the real office list. AD's free-text fields don't reliably encode
// "which office" the way this portal's own data does, so this tries a
// few signals in order rather than assuming one field is authoritative.
// Anyone who doesn't match anything lands in an explicit "Unmatched"
// bucket rather than being silently dropped or guessed into the wrong
// place - the unmatched count is the signal for whether AD's data needs
// cleanup or this matching needs another pass.
function matchOffice(person: DirectoryPerson, offices: Office[]): Office | null {
  const loc = normalize(person.officeLocation);
  const dept = normalize(person.department);

  if (loc) {
    const exact = offices.find((o) => normalize(o.field_office) === loc);
    if (exact) return exact;
    const contains = offices.find(
      (o) => normalize(o.field_office).includes(loc) || loc.includes(normalize(o.field_office))
    );
    if (contains) return contains;
  }

  for (const field of [loc, dept]) {
    if (!field) continue;
    const byState = offices.find((o) => o.state.toLowerCase() === field);
    if (byState) return byState;
  }

  return null;
}

export default async function DirectoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  let people: DirectoryPerson[] = [];
  let error: string | null = null;
  try {
    const users = await graphGetAll(
      "/v1.0/users?$select=id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation,mobilePhone,businessPhones,accountEnabled&$top=999"
    );
    people = users
      .filter(
        (u: any) =>
          u.accountEnabled !== false &&
          (u.mail || u.userPrincipalName) &&
          (u.mail || u.userPrincipalName).toLowerCase().endsWith("@icnarelief.org")
      )
      .map((u: any) => ({
        id: u.id,
        name: u.displayName ?? u.mail ?? u.userPrincipalName,
        email: u.mail || u.userPrincipalName,
        jobTitle: u.jobTitle ?? null,
        department: u.department ?? null,
        officeLocation: u.officeLocation ?? null,
        phone: u.mobilePhone || u.businessPhones?.[0] || null,
      }))
      .sort((a: DirectoryPerson, b: DirectoryPerson) => a.name.localeCompare(b.name));
  } catch (e: any) {
    error = e.message ?? "Couldn't load the directory from Active Directory.";
  }

  const { data: officesRaw } = await supabase
    .from("b2s_offices")
    .select("id, region, state, chapter, field_office")
    .eq("is_active", true);
  const offices: Office[] = officesRaw ?? [];

  // Build the hierarchy: region -> state -> { areaManager, employees },
  // plus each region's Regional Director, plus an Unmatched bucket.
  type StateGroup = { state: string; fieldOffices: string[]; areaManagers: DirectoryPerson[]; employees: DirectoryPerson[] };
  type RegionGroup = { region: string; regionalDirectors: DirectoryPerson[]; states: Map<string, StateGroup> };

  const regionMap = new Map<string, RegionGroup>();
  const unmatched: DirectoryPerson[] = [];

  for (const office of offices) {
    if (!regionMap.has(office.region)) {
      regionMap.set(office.region, { region: office.region, regionalDirectors: [], states: new Map() });
    }
    const region = regionMap.get(office.region)!;
    if (!region.states.has(office.state)) {
      region.states.set(office.state, { state: office.state, fieldOffices: [], areaManagers: [], employees: [] });
    }
    region.states.get(office.state)!.fieldOffices.push(office.field_office);
  }

  for (const person of people) {
    const office = matchOffice(person, offices);
    if (!office) {
      unmatched.push(person);
      continue;
    }
    const region = regionMap.get(office.region)!;
    const stateGroup = region.states.get(office.state)!;
    const title = (person.jobTitle ?? "").toLowerCase();

    if (title === "regional director") {
      if (!region.regionalDirectors.some((p) => p.id === person.id)) region.regionalDirectors.push(person);
    } else if (title === "area manager") {
      stateGroup.areaManagers.push(person);
    } else {
      stateGroup.employees.push(person);
    }
  }

  const regions = Array.from(regionMap.values())
    .map((r) => ({
      ...r,
      states: Array.from(r.states.values()).sort((a, b) => a.state.localeCompare(b.state)),
    }))
    .sort((a, b) => a.region.localeCompare(b.region));

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-semibold">Employee Directory</h1>
          <Link href="/select-app" className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
            ← Back
          </Link>
        </div>
        <p className="text-sm text-[var(--color-text-dim)] mb-1">
          Live from Active Directory — {people.length} active @icnarelief.org accounts.
        </p>
        {!error && (
          <p className="text-xs text-[var(--color-text-dim)] mb-8">
            Grouped by region → state → office based on matching AD&apos;s office/department fields
            against the portal&apos;s office list — {people.length - unmatched.length} matched,{" "}
            {unmatched.length} unmatched (shown separately below; usually means AD&apos;s office field
            doesn&apos;t match this portal&apos;s naming, not that the person is misfiled).
          </p>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm p-4">{error}</div>
        )}

        {!error && <DirectoryClient regions={regions} unmatched={unmatched} allPeople={people} />}
      </div>
    </main>
  );
}

