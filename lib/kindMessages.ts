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

export function getFateKindMessage(): string {
  const templates = [
    "Alhamdulillah — another family a little closer to a permanent home.",
    "JazakAllahu Khair for showing up for a family today.",
    "Foster care and adoption work rarely gets seen. This one did. Alhamdulillah.",
    "Logged and counted — a real family, a real difference. JazakAllahu Khair.",
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

export function getDrsKindMessage(): string {
  const templates = [
    "Alhamdulillah — showing up when it matters most.",
    "JazakAllahu Khair for your response today.",
    "Disaster relief work is rarely convenient. Thank you for doing it anyway.",
    "Logged. Another community a little less alone today, Alhamdulillah.",
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

export function getB2SActivityKindMessage(): string {
  const templates = [
    "Alhamdulillah — the outreach behind the scenes matters just as much.",
    "JazakAllahu Khair for keeping the program moving.",
    "Workshops, webinars, and outreach add up. Nicely logged.",
    "Every bit of this work compounds. Alhamdulillah for your effort today.",
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

export function getClientIntakeKindMessage(): string {
  const templates = [
    "Alhamdulillah — a new family is now on record and ready to be served.",
    "JazakAllahu Khair for taking the time to do this right.",
    "Client registered. This is where every future service starts.",
    "Welcome, new client — Alhamdulillah for the work you just did to get them here.",
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}
