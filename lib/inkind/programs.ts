// Program list + Salesforce/receipt codes, sourced from the
// "PROGRAM ALPHABETS" tab of the master price list spreadsheet.
// This is the source of truth for the code appended to backend
// (admin) invoice numbers, e.g. TXHOU-07202026-001-RCS.
//
// To update: edit data/programs.json (keep in sync with the sheet),
// no code changes needed here.

import programsData from "@/data/programs.json";

export type Program = {
  name: string;
  code: string;
};

export const PROGRAMS: Program[] = programsData;

export function programCodeForName(name: string): string {
  return PROGRAMS.find((p) => p.name === name)?.code ?? "GEN";
}

// Only programs that actually have priced items in the intake list
// (used to populate the category filter dropdown on the scanning screen).
export function programsInUse(itemPrograms: string[]): Program[] {
  const set = new Set(itemPrograms);
  return PROGRAMS.filter((p) => set.has(p.name));
}
