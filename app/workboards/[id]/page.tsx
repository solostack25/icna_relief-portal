import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  // Same admin-only gate as /workboards while this is still being
  // shaped -- see comment there.
  if (me.role !== "admin") redirect("/select-app");

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
        />
      </div>
    </main>
  );
}
