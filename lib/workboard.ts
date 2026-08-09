// Workboard (Trello-style) types + helpers. Same pattern as
// lib/helpdesk.ts: this is the one place that knows the persistence
// is Supabase, so pages/components call these functions instead of
// querying workboard_* tables directly.

import { SupabaseClient } from "@supabase/supabase-js";
import type { Department } from "./helpdesk";

export type WorkboardType = "private" | "team";

export type Workboard = {
  id: string;
  name: string;
  type: WorkboardType;
  owner_employee_id: string | null;
  team_department: Department | null;
  created_at: string;
};

export type WorkboardColumn = {
  id: string;
  board_id: string;
  name: string;
  sort_order: number;
  maps_to_status: string | null;
};

export type WorkboardCard = {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string | null;
  linked_leg_id: string | null;
  sort_order: number;
  created_by_employee_id: string | null;
  assigned_to_employee_id: string | null;
  created_at: string;
};

// Default columns for a new board -- editable after creation (add,
// rename, delete), this is just a sensible starting flow rather than
// something fixed. Each maps to a ticket status: dragging a card
// linked to a real helpdesk ticket into one of these columns updates
// that ticket's actual status to match (see
// syncLegStatusFromWorkboardColumn in lib/helpdesk.ts). A column with
// no mapping just doesn't drive ticket status -- e.g. an extra column
// an admin adds beyond these defaults.
const DEFAULT_COLUMNS: Record<WorkboardType, { name: string; maps_to_status: string | null }[]> = {
  private: [
    { name: "To Do", maps_to_status: "open" },
    { name: "In Progress", maps_to_status: "in_progress" },
    { name: "Done", maps_to_status: "closed" },
  ],
  team: [
    { name: "To Do", maps_to_status: "open" },
    { name: "In Progress", maps_to_status: "in_progress" },
    { name: "Quality Assurance", maps_to_status: "quality_assurance" },
    { name: "Done", maps_to_status: "closed" },
  ],
};

export async function createPrivateBoard(
  supabase: SupabaseClient,
  params: { name: string; ownerEmployeeId: string }
): Promise<{ boardId: string }> {
  const { data: board, error } = await supabase
    .from("workboards")
    .insert({ name: params.name, type: "private", owner_employee_id: params.ownerEmployeeId })
    .select("id")
    .single();
  if (error || !board) throw new Error(error?.message ?? "Failed to create board");

  await seedDefaultColumns(supabase, board.id, "private");
  return { boardId: board.id };
}

// Gets the existing team board for a department, or creates it if
// this is the first time anyone's visited (one team board per
// department -- currently only 'it' is ever actually reachable, per
// how the feature is gated in the UI, but this isn't IT-specific
// itself in case another department gets its own team board later).
export async function getOrCreateTeamBoard(
  supabase: SupabaseClient,
  department: Department
): Promise<{ boardId: string }> {
  const { data: existing } = await supabase
    .from("workboards")
    .select("id")
    .eq("type", "team")
    .eq("team_department", department)
    .maybeSingle();

  if (existing) return { boardId: existing.id };

  const { data: board, error } = await supabase
    .from("workboards")
    .insert({ name: `${department.toUpperCase()} Team Board`, type: "team", team_department: department })
    .select("id")
    .single();
  if (error || !board) throw new Error(error?.message ?? "Failed to create team board");

  await seedDefaultColumns(supabase, board.id, "team");
  return { boardId: board.id };
}

async function seedDefaultColumns(supabase: SupabaseClient, boardId: string, type: WorkboardType) {
  const defs = DEFAULT_COLUMNS[type];
  await supabase.from("workboard_columns").insert(
    defs.map((d, i) => ({
      board_id: boardId,
      name: d.name,
      sort_order: i,
      maps_to_status: d.maps_to_status,
    }))
  );
}

// Creates a card from a helpdesk ticket -- this is what "Move to
// Workboard" does. The card's own created_at is the new timer;
// nothing about the ticket itself (status, points, its own age
// timer) is touched.
export async function addCardFromTicket(
  supabase: SupabaseClient,
  params: {
    boardId: string;
    columnId: string;
    legId: string;
    title: string;
    createdByEmployeeId: string;
    assignedToEmployeeId?: string | null;
  }
): Promise<void> {
  const { count } = await supabase
    .from("workboard_cards")
    .select("id", { count: "exact", head: true })
    .eq("column_id", params.columnId);

  const { error } = await supabase.from("workboard_cards").insert({
    board_id: params.boardId,
    column_id: params.columnId,
    title: params.title,
    linked_leg_id: params.legId,
    created_by_employee_id: params.createdByEmployeeId,
    assigned_to_employee_id: params.assignedToEmployeeId ?? null,
    sort_order: count ?? 0,
  });
  if (error) throw new Error(error.message);
}

export async function addManualCard(
  supabase: SupabaseClient,
  params: { boardId: string; columnId: string; title: string; createdByEmployeeId: string }
): Promise<void> {
  const { count } = await supabase
    .from("workboard_cards")
    .select("id", { count: "exact", head: true })
    .eq("column_id", params.columnId);

  const { error } = await supabase.from("workboard_cards").insert({
    board_id: params.boardId,
    column_id: params.columnId,
    title: params.title,
    created_by_employee_id: params.createdByEmployeeId,
    sort_order: count ?? 0,
  });
  if (error) throw new Error(error.message);
}

export async function moveCard(
  supabase: SupabaseClient,
  params: { cardId: string; newColumnId: string; newSortOrder: number }
): Promise<void> {
  const { error } = await supabase
    .from("workboard_cards")
    .update({ column_id: params.newColumnId, sort_order: params.newSortOrder })
    .eq("id", params.cardId);
  if (error) throw new Error(error.message);
}

export async function addColumn(
  supabase: SupabaseClient,
  params: { boardId: string; name: string; mapsToStatus?: string | null }
): Promise<void> {
  const { count } = await supabase
    .from("workboard_columns")
    .select("id", { count: "exact", head: true })
    .eq("board_id", params.boardId);

  const { error } = await supabase.from("workboard_columns").insert({
    board_id: params.boardId,
    name: params.name,
    sort_order: count ?? 0,
    maps_to_status: params.mapsToStatus ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function renameColumn(
  supabase: SupabaseClient,
  params: { columnId: string; name: string }
): Promise<void> {
  const { error } = await supabase
    .from("workboard_columns")
    .update({ name: params.name })
    .eq("id", params.columnId);
  if (error) throw new Error(error.message);
}

export async function setColumnStatusMapping(
  supabase: SupabaseClient,
  params: { columnId: string; mapsToStatus: string | null }
): Promise<void> {
  const { error } = await supabase
    .from("workboard_columns")
    .update({ maps_to_status: params.mapsToStatus })
    .eq("id", params.columnId);
  if (error) throw new Error(error.message);
}

export async function assignCard(
  supabase: SupabaseClient,
  params: { cardId: string; employeeId: string | null }
): Promise<void> {
  const { error } = await supabase
    .from("workboard_cards")
    .update({ assigned_to_employee_id: params.employeeId })
    .eq("id", params.cardId);
  if (error) throw new Error(error.message);
}

export type WorkboardCardNote = {
  id: string;
  card_id: string;
  author_employee_id: string | null;
  body: string;
  created_at: string;
};

export async function getCardNotes(supabase: SupabaseClient, cardId: string): Promise<WorkboardCardNote[]> {
  const { data } = await supabase
    .from("workboard_card_notes")
    .select("*")
    .eq("card_id", cardId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function addCardNote(
  supabase: SupabaseClient,
  params: { cardId: string; authorEmployeeId: string; body: string }
): Promise<void> {
  const { error } = await supabase.from("workboard_card_notes").insert({
    card_id: params.cardId,
    author_employee_id: params.authorEmployeeId,
    body: params.body,
  });
  if (error) throw new Error(error.message);
}
