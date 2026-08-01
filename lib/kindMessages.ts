// Warm closing messages shown after a backpack distribution.
// Uses only the Islamic terms already approved in the ICNA Relief
// brand guide (Alhamdulillah, JazakAllahu Khair) — nothing invented.

export function getBackpackKindMessage(count: number): string {
  const templates = [
    `Alhamdulillah — ${count} backpack${count !== 1 ? "s" : ""} on their way to a fresh school year.`,
    `JazakAllahu Khair for your effort today. ${count} child${count !== 1 ? "ren" : ""} just got a little easier start.`,
    `Small act, real impact — ${count} backpack${count !== 1 ? "s" : ""} distributed. Alhamdulillah.`,
    `Every backpack is a door opened. ${count} more today, JazakAllahu Khair.`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}
