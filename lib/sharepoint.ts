import { graphGetAll } from "@/lib/msgraph";

// "IT Tickets (HelpDesk v3)" SharePoint list on the root ICNA Relief
// USA Programs site. Resolved via Graph Explorer on 2026-08-09 —
// these IDs are stable (SharePoint site/list GUIDs don't change).
const SITE_ID =
  "icnareliefusa.sharepoint.com,49643cbb-3c15-4ed8-89ad-cc3cf3e6345d,68c27998-f02d-4e52-b667-f94b47bddb2a";
const IT_TICKETS_LIST_ID = "9e162e9c-7b8d-42dd-baa9-ef1038e7e4d0";

// Every status in this list other than "Closed" counts as open (Open,
// In Progress, On Hold). Simpler and more robust than an allowlist —
// a new status value added in SharePoint still gets counted correctly
// without a code change here.
const CLOSED_STATUS = "Closed";

// Counts org-wide open tickets. Fetches all items (only ~175 total,
// cheap as a single call) and filters client-side rather than using
// SharePoint's $count/$filter over Graph, which is unreliable against
// lookup-backed fields like AssignedTechnician.
//
// Note: this is the *org-wide* open count, matching the existing
// "Open Help Desk Tickets" dashboard card label — not "tickets
// assigned to the current employee". AssignedTechnicianLookupId is a
// Person-lookup field (a SharePoint internal user ID, not an email),
// so scoping this to "my tickets" needs one more resolution step to
// look up the signed-in employee's SharePoint user ID first.
export async function getOpenItTicketCount(): Promise<number> {
  const items = await graphGetAll(
    `/v1.0/sites/${SITE_ID}/lists/${IT_TICKETS_LIST_ID}/items?$expand=fields($select=Status)&$top=200`
  );
  return items.filter((item) => item.fields?.Status !== CLOSED_STATUS).length;
}
