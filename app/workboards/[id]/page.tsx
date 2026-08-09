import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDepartmentStaff, type Department } from "@/lib/helpdesk";
import BoardView from "./BoardView";

export default async function WorkboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("employees")
    .select("id, first_name, last_name, role")
    .eq("auth_user_id", user.id)
    .single();
  if (!me) redirect("/select-app");

  // RLS filters this to null if the board exists but isn't accessible
  // to this employee (private board they don't own, or a team board
  // for a department they don't manage) -- same "not found" either
  // way, so existence of someone else's private board isn't leaked.
  const { data: board } = await supabase.from("workboards").select("*").eq("id", id).single();
  if (!board) notFound();

  const { data: columns } = await supabase
    .from("workboard_columns")
    .select("*")
    .eq("board_id", id)
    .order("sort_order");

  const { data: cards } = await supabase
    .from("workboard_cards")
    .select("*")
    .eq("board_id", id)
    .order("sort_order");

  // Map linked tickets' leg_id -> request_id, so cards can link back
  // to the actual ticket detail page.
  const legIds = [...new Set((cards ?? []).map((c) => c.linked_leg_id).filter(Boolean))] as string[];
  let legToRequest = new Map<string, string>();
  if (legIds.length > 0) {
    const { data: legs } = await supabase
      .from("helpdesk_request_legs")
      .select("id, request_id")
      .in("id", legIds);
    legToRequest = new Map((legs ?? []).map((l) => [l.id, l.request_id]));
  }

  // Who a card can be assigned to: department staff for a team board,
  // just the owner for a private board (it's inherently theirs).
  let assignableStaff: { id: string; first_name: string; last_name: string }[] = [];
  if (board.type === "team" && board.team_department) {
    assignableStaff = await getDepartmentStaff(supabase, board.team_department as Department);
  } else if (board.owner_employee_id) {
    const { data: owner } = await supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("id", board.owner_employee_id)
      .single();
    if (owner) assignableStaff = [owner];
  }

  // Names for whoever's already assigned to a card, even if they've
  // since lost department access and would no longer appear in
  // assignableStaff -- otherwise a valid past assignment would show
  // as blank.
  const cardAssigneeIds = [
    ...new Set((cards ?? []).map((c) => c.assigned_to_employee_id).filter(Boolean)),
  ] as string[];
  let assigneeNameMap = new Map<string, string>();
  if (cardAssigneeIds.length > 0) {
    const { data: assignees } = await supabase
      .from("employees")
      .select("id, first_name, last_name")
      .in("id", cardAssigneeIds);
    assigneeNameMap = new Map((assignees ?? []).map((a) => [a.id, `${a.first_name} ${a.last_name}`]));
  }

  // Note counts per card (not the note bodies themselves -- those load
  // lazily when a card's detail view is opened) so the card face can
  // show "💬 3" without fetching every note up front.
  const cardIds = (cards ?? []).map((c) => c.id);
  let noteCountByCard = new Map<string, number>();
  if (cardIds.length > 0) {
    const { data: noteRows } = await supabase
      .from("workboard_card_notes")
      .select("card_id")
      .in("card_id", cardIds);
    for (const row of noteRows ?? []) {
      noteCountByCard.set(row.card_id, (noteCountByCard.get(row.card_id) ?? 0) + 1);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at top, #2A1858 0%, #150B2E 60%)",
        color: "#EDE6FF",
        fontFamily: "'DM Sans', sans-serif",
        padding: "20px 16px 60px",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=DM+Sans:wght@400;500;700;800&display=swap');`}</style>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Link href="/workboards" style={{ fontSize: 12, color: "#9C8FD9" }}>
            ← All Boards
          </Link>
          {board.type === "team" && (
            <span style={{ fontSize: 11, fontWeight: 800, color: "#9C8FD9" }}>Team board</span>
          )}
        </div>

        <div
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: 24,
            marginBottom: 20,
          }}
        >
          {board.type === "team" ? "⚔️ " : "📋 "}
          {board.name}
        </div>

        <BoardView
          boardId={board.id}
          columns={columns ?? []}
          cards={cards ?? []}
          legToRequest={Object.fromEntries(legToRequest)}
          currentUserId={me.id}
          canEditColumns={me.role === "admin"}
          assignableStaff={assignableStaff}
          assigneeNameMap={Object.fromEntries(assigneeNameMap)}
          noteCountByCard={Object.fromEntries(noteCountByCard)}
        />
      </div>
    </main>
  );
}
