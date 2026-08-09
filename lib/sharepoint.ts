import { graphGetAll } from "@/lib/msgraph";

// "IT Tickets (HelpDesk v3)" SharePoint list on the root ICNA Relief
// USA Programs site. Resolved via Graph Explorer on 2026-08-09 —
// these IDs are stable (SharePoint site/list GUIDs don't change).
export const IT_TICKETS_SITE_ID =
  "icnareliefusa.sharepoint.com,49643cbb-3c15-4ed8-89ad-cc3cf3e6345d,68c27998-f02d-4e52-b667-f94b47bddb2a";
export const IT_TICKETS_LIST_ID = "9e162e9c-7b8d-42dd-baa9-ef1038e7e4d0";

// Every status in this list other than "Closed" counts as open (Open,
// In Progress, On Hold). Simpler and more robust than an allowlist —
// a new status value added in SharePoint still gets counted correctly
// without a code change here.
const CLOSED_STATUS = "Closed";

// Counts open tickets assigned to a specific technician, matched by
// full display name (e.g. "Travis Ali") — AssignedTechnician is a
// SharePoint Person field, and Graph returns its display name string
// directly when selected without the "LookupId" suffix, so no extra
// lookup-ID resolution step is needed.
//
// Name matching is a little fragile in the abstract (relies on the
// employees table's first_name + last_name lining up exactly with
// what's in SharePoint), but this is a small, stable IT team — worth
// it to avoid standing up SharePoint's separate legacy REST auth just
// to resolve a person field to an ID.
export async function getOpenItTicketCountForTechnician(
  technicianFullName: string
): Promise<number> {
  const items = await graphGetAll(
    `/v1.0/sites/${IT_TICKETS_SITE_ID}/lists/${IT_TICKETS_LIST_ID}/items?$expand=fields($select=Status,AssignedTechnician)&$top=200`
  );
  return items.filter(
    (item) =>
      item.fields?.Status !== CLOSED_STATUS &&
      item.fields?.AssignedTechnician === technicianFullName
  ).length;
}

// Org-wide open count, kept in case it's useful elsewhere (e.g. an
// admin-only view) — not used by the per-employee dashboard card.
export async function getOpenItTicketCount(): Promise<number> {
  const items = await graphGetAll(
    `/v1.0/sites/${IT_TICKETS_SITE_ID}/lists/${IT_TICKETS_LIST_ID}/items?$expand=fields($select=Status)&$top=200`
  );
  return items.filter((item) => item.fields?.Status !== CLOSED_STATUS).length;
}
