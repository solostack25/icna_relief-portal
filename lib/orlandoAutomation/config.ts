// Orlando Automation - a duplicate of the standalone Houston_Automation
// app (solostack25/Houston_Automation), living inside the portal and
// hard-scoped to the Orlando office. Reads/writes the same shared tables
// Houston_Automation does (pickup_slots, pickup_bookings, clients,
// broadcasts, campaign_contacts, ...), but every query here is filtered
// to Orlando's office_id and every insert is stamped with it, so the two
// offices never see each other's slots, clients, broadcasts, or audit
// trail. Client-safe (no server imports) - used by both server pages and
// client components.

// b2s_offices.id for "Orlando Office" (SOUTHEAST, FL).
export const ORLANDO_OFFICE_ID = "38df5b9c-895e-45bf-8a09-60dd52bb1b5a";

// pickup_slots.office / blackout_days.office / pickup_waitlist.office are
// legacy free-text columns Houston_Automation still writes ("Houston").
// Filtering is always on office_id - this is only written for parity.
export const ORLANDO_OFFICE_LABEL = "Orlando";

// Default state stamped on staff-registered clients (Houston wrote "TX").
export const ORLANDO_STATE = "FL";

export const OA_BASE = "/orlando-automation";
