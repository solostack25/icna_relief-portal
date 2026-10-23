// Broad spending groups from the merchant category code, for the PEX
// dashboard's "where the money goes" view. (Budget-line suggestions for
// grants use the narrower mapping in rules.ts.)
const GROUPS: [string, (n: number) => boolean][] = [
  ["Groceries & food pantry", (n) => n === 5411 || n === 5422 || n === 5441 || n === 5451 || n === 5499],
  ["Warehouse & retail", (n) => [5300, 5310, 5311, 5331, 5399, 5651, 5691, 5699].includes(n)],
  ["Restaurants & meals", (n) => n >= 5811 && n <= 5814],
  ["Fuel", (n) => n === 5541 || n === 5542 || n === 5983],
  ["Travel & lodging", (n) => (n >= 3000 && n <= 3999) || [4111, 4121, 4131, 4411, 4511, 4582, 4722, 4784, 7011, 7512, 7523].includes(n)],
  ["Office & supplies", (n) => [5111, 5943, 5044, 5045, 5942, 5734, 5732].includes(n)],
  ["Building & hardware", (n) => [5200, 5211, 5251, 5261, 1520, 1711, 1731, 1799, 7349].includes(n)],
  ["Phone & internet", (n) => [4812, 4814, 4816, 4899, 4900].includes(n)],
  ["Restricted (alcohol, tobacco…)", (n) => [5813, 5921, 5993, 7995, 7273].includes(n)],
];

export function spendGroup(mcc: string | null | undefined): string {
  const n = Number(mcc);
  if (!mcc || !Number.isFinite(n)) return "Other";
  for (const [name, test] of GROUPS) if (test(n)) return name;
  return "Other";
}

export const monthStart = (d = new Date()) => `${d.toISOString().slice(0, 7)}-01`;
export function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end };
}
export function shiftMonth(ym: string, by: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}
export const monthLabel = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
