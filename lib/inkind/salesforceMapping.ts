// Real object/field API names, confirmed directly from ICNA Relief's
// Salesforce org (Setup → Object Manager) — not placeholders. If any of
// these ever change on the Salesforce side, update here and nothing
// else in the sync code needs to change.

// ---------------------------------------------------------------------
// Header object: one record per PROGRAM per donation session. A single
// donation touching 2 programs creates 2 header records — Program__c is
// a single-select picklist on this object, so it can't hold more than
// one program per record. This matches how the admin dashboard already
// splits sessions into per-program rows.
// ---------------------------------------------------------------------
export const SF_HEADER_OBJECT = "InKind_Inven__c";

export const SF_HEADER_FIELD_MAP = {
  dateReceived: "Date_Received__c",
  description: "Description__c",
  donorOrg: "Donor_Org__c", // Lookup(Account) — organization donors
  donorPerson: "Donor_Person__c", // Lookup(Contact) — individual donors
  office: "IR_Office__c", // Lookup(Account) — see SF_HOUSTON_OFFICE_ACCOUNT_ID below
  program: "Program__c", // Picklist, required
  transactionId: "Transaction_ID__c", // our program-specific invoice number, e.g. TXHOU-07202026-005-HPS
};

// ---------------------------------------------------------------------
// Line item object: one record per (item, condition) with qty > 0,
// linked back to its program's header record.
// ---------------------------------------------------------------------
export const SF_LINE_ITEM_OBJECT = "In_Kind_Inventory_Line__c";

export const SF_LINE_ITEM_FIELD_MAP = {
  parentLookup: "In_Kind_Inventory__c", // Master-Detail back to the header
  itemDescription: "Item_Description__c", // Text(150) — no separate condition field, so condition gets folded in here
  quantity: "Quantity__c",
  fairMarketValue: "Fair_Market_Value__c", // line total, not unit price — no separate unit-price field exists
  goodsType: "Goods_Type__c", // Picklist, required
  category: "Category__c", // Picklist, only meaningful for food items
  referenceId: "Reference_ID__c", // our item_code, for traceability
  dateReceived: "Date_Received__c",
  donorDeclaredValue: "In_Kind_Donor_Declared_Value__c", // Checkbox — always false; ICNA assigns value from the price list, not the donor
};

// The Account record representing ICNA Relief's Houston office —
// confirmed directly from Salesforce (Setup → search the Account,
// copy its ID from the URL). Hardcoded since it's a one-time constant,
// not something that varies per donation. If a second office is ever
// added, this needs to become a lookup keyed by session.office instead.
export const SF_HOUSTON_OFFICE_ACCOUNT_ID = "0016O00003EfpmgQAB";

// Maps our internal program names (data/programs.json) to Salesforce's
// Program__c picklist values — confirmed from the field's Values list.
// Only the 3 programs with priced items today are filled in with real
// values; the rest default to passing the name through unchanged,
// which will fail Salesforce's picklist validation until mapped — a
// deliberate choice so an unmapped program surfaces as a clear sync
// error instead of silently going to the wrong bucket.
export const PROGRAM_TO_SALESFORCE_PICKLIST: Record<string, string> = {
  "Back2school": "Back 2 School",
  "Hunger Prevention": "Hunger Prevention",
  "Refugee Services & Community Empowerment": "Refugee Services",
  // Not yet mapped (no priced items in these programs yet):
  // "Disaster Relief Services": "Disaster Relief",
  // "Muslim Family Services - Counselling": "Muslim Family Services",
  // "Muslim Family Services - FATE": "FATE",
  // "Helath Services": "Health Services",
  // "Transitional Housing": "Transitional Housing",
  // "General": "General",
};

// item.condition ("new" | "used" | "na") doesn't have its own Salesforce
// field — there's no Condition field on the line item object — so it
// gets folded into Item_Description__c text instead. See
// buildItemDescription() in salesforce.ts.
export const CONDITION_LABEL: Record<string, string> = {
  new: "New",
  used: "Used",
  na: "",
};
