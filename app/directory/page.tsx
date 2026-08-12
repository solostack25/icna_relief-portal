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
      "/users?$select=id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation,mobilePhone,businessPhones,accountEnabled&$top=999"
    );
    people = users
      .filter((u: any) => u.accountEnabled !== false && (u.mail || u.userPrincipalName))
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

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-semibold">Employee Directory</h1>
          <Link href="/select-app" className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
            ← Back
          </Link>
        </div>
        <p className="text-sm text-[var(--color-text-dim)] mb-8">
          Live from Active Directory — {people.length} active accounts.
        </p>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm p-4">
            {error}
          </div>
        )}

        {!error && <DirectoryClient people={people} />}
      </div>
    </main>
  );
}
