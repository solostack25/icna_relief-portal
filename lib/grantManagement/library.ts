import { createAdminClient } from "@/lib/grantManagement/server";

export type LibraryCategory = { id: string; name: string; is_active: boolean; children: { id: string; name: string; is_active: boolean }[] };

// The org-wide category / subcategory library used to build budgets.
export async function loadLibrary(includeInactive = false): Promise<LibraryCategory[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("gm_categories").select("id, name, parent_id, sort_order, is_active").order("sort_order");
  const rows = (data ?? []) as { id: string; name: string; parent_id: string | null; is_active: boolean }[];
  const keep = (r: { is_active: boolean }) => includeInactive || r.is_active;
  return rows
    .filter((r) => !r.parent_id && keep(r))
    .map((p) => ({
      id: p.id,
      name: p.name,
      is_active: p.is_active,
      children: rows.filter((c) => c.parent_id === p.id && keep(c)).map((c) => ({ id: c.id, name: c.name, is_active: c.is_active })),
    }));
}
