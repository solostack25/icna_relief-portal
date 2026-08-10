// Donor_Org__c and Donor_Person__c on the header object are Lookups to
// real Account/Contact records — not plain text fields. So before we
// can link a donor to a donation, we have to find (or create) the
// actual Salesforce record for them.
//
// Individual donors -> Contact, matched by email.
// Organization donors -> Account, matched by name.
// Anonymous donors -> no lookup at all, both left null.

import type { SalesforceAuth } from "./salesforceAuth";

function escapeSoql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function sfQuery(auth: SalesforceAuth, soql: string): Promise<any[]> {
  const res = await fetch(
    `${auth.instanceUrl}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`,
    { headers: { Authorization: `Bearer ${auth.accessToken}` } }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Salesforce query failed: ${JSON.stringify(json)}`);
  }
  return json.records ?? [];
}

async function sfCreate(auth: SalesforceAuth, sobject: string, fields: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${auth.instanceUrl}/services/data/v60.0/sobjects/${sobject}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(fields),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Salesforce create ${sobject} failed: ${JSON.stringify(json)}`);
  }
  return json.id;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/**
 * Individual donor -> Contact, matched/created by email. Falls back to
 * matching by name if no email was given (donor forms don't require
 * email). Returns null if there's nothing at all to match on.
 */
export async function findOrCreateDonorContact(
  auth: SalesforceAuth,
  donor: { name: string | null; email: string | null; phone: string | null; address: string | null }
): Promise<string | null> {
  if (!donor.email && !donor.name) return null;

  if (donor.email) {
    const existing = await sfQuery(
      auth,
      `SELECT Id FROM Contact WHERE Email = '${escapeSoql(donor.email)}' LIMIT 1`
    );
    if (existing.length > 0) return existing[0].Id;
  }

  const { firstName, lastName } = splitName(donor.name || "Anonymous Donor");
  return sfCreate(auth, "Contact", {
    FirstName: firstName || undefined,
    LastName: lastName,
    Email: donor.email || undefined,
    Phone: donor.phone || undefined,
    MailingStreet: donor.address || undefined,
  });
}

/**
 * Organization donor -> Account, matched/created by name.
 */
export async function findOrCreateDonorAccount(
  auth: SalesforceAuth,
  orgName: string
): Promise<string | null> {
  if (!orgName?.trim()) return null;

  const existing = await sfQuery(
    auth,
    `SELECT Id FROM Account WHERE Name = '${escapeSoql(orgName.trim())}' LIMIT 1`
  );
  if (existing.length > 0) return existing[0].Id;

  return sfCreate(auth, "Account", { Name: orgName.trim() });
}
