// IRFAS / zakat application constants. Program names match the IRFAS
// Power BI model the Master Cleaner produced, so exports drop straight in.
export const IRFAS_PROGRAMS = [
  "Hunger Prevention",
  "Refugee Services & Community Empowerment",
  "Transitional Housing",
  "Muslim Family Services",
  "Health Services",
  "Back 2 School",
  "FATE",
  "Disaster Relief",
  "General",
] as const;

export type IrfasProgram = (typeof IRFAS_PROGRAMS)[number];

// Guess a program from the category the case manager typed, used only as
// a starting value when the client doesn't already point to one.
export function programFromCategory(category: string): IrfasProgram | null {
  const c = category.toLowerCase();
  if (c.includes("food") || c.includes("grocer")) return "Hunger Prevention";
  if (c.includes("medical") || c.includes("health") || c.includes("prescription")) return "Health Services";
  if (c.includes("school") || c.includes("tuition") || c.includes("backpack")) return "Back 2 School";
  if (c.includes("disaster") || c.includes("fire") || c.includes("flood") || c.includes("hurricane")) return "Disaster Relief";
  return null;
}

// What staff see as the application's status. A voided check keeps its
// approved/paid status in the database but is shown — and reported — as void.
export function irfasDisplayStatus(a: { status: string; voided_at?: string | null }) {
  return a.voided_at ? "void" : a.status;
}
