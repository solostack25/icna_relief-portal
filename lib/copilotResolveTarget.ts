import { createAdminClient } from "@/lib/supabase/server";

// Copilot Studio only gives us what the user said in chat, e.g. "call
// Syed" - there's no UUID the way the portal's own click-to-call/
// quick-sms buttons have (they already know which client/contact row
// they're on). This resolves a spoken name into a real phone number
// by searching contacts and clients, so the copilot/* action routes
// can accept a name instead of requiring the caller to already know
// an internal ID.

export type TargetMatch = {
  targetType: "contact" | "client";
  targetId: string;
  name: string;
  phone: string;
};

export async function resolveTargetByName(name: string): Promise<TargetMatch[]> {
  const admin = createAdminClient();
  const trimmed = name.trim();
  if (!trimmed) return [];

  const parts = trimmed.split(/\s+/);
  const firstPart = parts[0];
  const lastPart = parts.slice(1).join(" ");

  const matches: TargetMatch[] = [];

  for (const table of ["contacts", "clients"] as const) {
    let query = admin
      .from(table)
      .select("id, first_name, last_name, phone")
      .not("phone", "is", null)
      .neq("phone", "");

    query = lastPart
      ? query.ilike("first_name", `%${firstPart}%`).ilike("last_name", `%${lastPart}%`)
      : query.or(`first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%`);

    const { data } = await query.limit(5);
    for (const row of (data ?? []) as { id: string; first_name: string; last_name: string; phone: string }[]) {
      matches.push({
        targetType: table === "contacts" ? "contact" : "client",
        targetId: row.id,
        name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
        phone: row.phone,
      });
    }
  }

  return matches;
}
