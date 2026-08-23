// Pushes a logged call attempt to Salesforce as a Task against the
// donor's Contact record - the standard Salesforce pattern for "log a
// call" (Type='Call', WhoId=<Contact>, Status='Completed'). Reuses the
// same auth/find-or-create-Contact helpers the InKind donation sync
// already established, rather than building a second Salesforce client.
//
// Best-effort by design: called after the local donor_call_outcomes
// row is already saved, so a Salesforce failure (misconfigured org,
// API limit, network blip) never loses the call log itself - it just
// doesn't make it to Salesforce this time. Caller gets a boolean back
// to note in the response if it wants to.

import { createAdminClient } from "@/lib/supabase/server";
import { getSalesforceAuth, isSalesforceConfigured } from "@/lib/inkind/salesforceAuth";
import { findOrCreateDonorContact } from "@/lib/inkind/salesforceDonor";

const DISPOSITION_LABELS: Record<string, string> = {
  reached: "Reached — had a conversation",
  pledge: "Pledge made",
  voicemail: "Left voicemail",
  no_answer: "No answer",
  callback_requested: "Asked for a callback",
  declined: "Declined",
  wrong_number: "Wrong number",
  do_not_call: "Do not call again",
};

export type DonorCallForSync = {
  contactId: string; // local contacts.id, not the Salesforce id
  disposition: string;
  notes: string | null;
  pledgeAmount: number | null;
  calledAt: string; // ISO timestamp
  campaignName: string | null;
};

async function sfCreate(auth: { accessToken: string; instanceUrl: string }, sobject: string, fields: Record<string, unknown>) {
  const res = await fetch(`${auth.instanceUrl}/services/data/v60.0/sobjects/${sobject}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json.id as string;
}

export async function pushDonorCallToSalesforce(call: DonorCallForSync): Promise<{ synced: boolean; error?: string }> {
  if (!isSalesforceConfigured()) return { synced: false, error: "Salesforce not configured" };

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("id, first_name, last_name, email, phone, salesforce_contact_id")
    .eq("id", call.contactId)
    .single();
  if (!contact) return { synced: false, error: "Contact not found locally" };

  try {
    const auth = await getSalesforceAuth();

    let sfContactId = contact.salesforce_contact_id as string | null;
    if (!sfContactId) {
      sfContactId = await findOrCreateDonorContact(auth, {
        name: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null,
        email: contact.email,
        phone: contact.phone,
        address: null,
      });
      // Cache the match so the next call for this same person doesn't
      // re-query/re-create in Salesforce every time.
      if (sfContactId) {
        await admin.from("contacts").update({ salesforce_contact_id: sfContactId }).eq("id", contact.id);
      }
    }
    if (!sfContactId) return { synced: false, error: "No email or name to match a Salesforce Contact" };

    const label = DISPOSITION_LABELS[call.disposition] ?? call.disposition;
    const descriptionParts = [
      call.campaignName ? `Campaign: ${call.campaignName}` : null,
      call.pledgeAmount != null ? `Pledge amount: $${call.pledgeAmount}` : null,
      call.notes,
    ].filter(Boolean);

    await sfCreate(auth, "Task", {
      WhoId: sfContactId,
      Subject: `Donor Call: ${label}`,
      Description: descriptionParts.join("\n") || undefined,
      Status: "Completed",
      Type: "Call",
      ActivityDate: call.calledAt.slice(0, 10),
    });

    return { synced: true };
  } catch (e) {
    return { synced: false, error: e instanceof Error ? e.message : "Unknown Salesforce error" };
  }
}
