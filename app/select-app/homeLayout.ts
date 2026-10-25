// Per-person home layout. Saved in employee_home_layouts; see
// supabase/home_layout_migration.sql for how order/hidden are stored.

export type HomeLayoutPref = {
  quick_actions_order: string[];
  quick_actions_hidden: string[];
  programs_order: string[];
  programs_hidden: string[];
};

export type LayoutItem = { key: string; visible: boolean };

/**
 * Turns a saved preference into an ordered list of tiles for one section.
 *
 * - `available` is what this person may see, in the default order. It is
 *   always the source of truth, so a saved key they no longer have access
 *   to is dropped and the preference can never show more than access allows.
 * - Tiles they saved keep their position and on/off state.
 * - Tiles added since they last saved go at the end, using the tile's
 *   own default.
 */
export function resolveSection(
  available: { key: string; defaultOn: boolean }[],
  order: string[] | null | undefined,
  hidden: string[] | null | undefined
): LayoutItem[] {
  if (!order || order.length === 0) {
    return available.map((a) => ({ key: a.key, visible: a.defaultOn }));
  }
  const byKey = new Map(available.map((a) => [a.key, a]));
  const hiddenSet = new Set(hidden ?? []);
  const seen = new Set<string>();
  const out: LayoutItem[] = [];
  for (const key of order) {
    if (!byKey.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, visible: !hiddenSet.has(key) });
  }
  for (const a of available) {
    if (seen.has(a.key)) continue;
    out.push({ key: a.key, visible: a.defaultOn });
  }
  return out;
}

export function defaultSection(available: { key: string; defaultOn: boolean }[]): LayoutItem[] {
  return available.map((a) => ({ key: a.key, visible: a.defaultOn }));
}

/** Merge the edited (visible-to-this-person) items back into the saved arrays. */
export function toSaved(items: LayoutItem[]) {
  return {
    order: items.map((i) => i.key),
    hidden: items.filter((i) => !i.visible).map((i) => i.key),
  };
}
