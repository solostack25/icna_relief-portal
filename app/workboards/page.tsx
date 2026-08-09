import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getManagedDepartments } from "@/lib/helpdesk";
import { getOrCreateTeamBoard } from "@/lib/workboard";
import NewBoardForm from "./NewBoardForm";

export default async function WorkboardsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase
    .from("employees")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();
  if (!me) redirect("/select-app");

  const managedDepartments = await getManagedDepartments(supabase, me.id, me.role);
  const managesIt = managedDepartments.includes("it");

  const { data: myBoards } = await supabase
    .from("workboards")
    .select("id, name, created_at")
    .eq("type", "private")
    .eq("owner_employee_id", me.id)
    .order("created_at", { ascending: false });

  // The IT team board is created lazily on first visit, not by
  // migration -- only one, only if someone who manages IT actually
  // shows up here.
  let itBoardId: string | null = null;
  if (managesIt) {
    const { boardId } = await getOrCreateTeamBoard(supabase, "it");
    itBoardId = boardId;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at top, #2A1858 0%, #150B2E 60%)",
        color: "#EDE6FF",
        fontFamily: "'DM Sans', sans-serif",
        padding: "28px 16px 60px",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=DM+Sans:wght@400;500;700;800&display=swap');`}</style>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Link href="/select-app" style={{ fontSize: 12, color: "#9C8FD9" }}>
            ← Back
          </Link>
        </div>

        <div style={{ textAlign: "center", margin: "16px 0 28px" }}>
          <div
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700,
              fontSize: 28,
              backgroundImage: "linear-gradient(90deg,#FF3EA5,#00E5FF)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            WORKBOARDS
          </div>
          <div style={{ fontSize: 12, color: "#9C8FD9", marginTop: 6 }}>
            Drag tickets and tasks through your own flow
          </div>
        </div>

        {itBoardId && (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9C8FD9", marginBottom: 10 }}>
              Team
            </div>
            <Link
              href={`/workboards/${itBoardId}`}
              style={{
                display: "block",
                padding: 16,
                borderRadius: 14,
                marginBottom: 24,
                textDecoration: "none",
                color: "inherit",
                background: "linear-gradient(90deg, rgba(255,62,165,0.15), rgba(123,62,255,0.15))",
                border: "1px solid #FF3EA5",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15 }}>⚔️ IT Team Board</div>
              <div style={{ fontSize: 11, color: "#9C8FD9", marginTop: 3 }}>
                Shared with everyone on the IT team
              </div>
            </Link>
          </>
        )}

        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9C8FD9", marginBottom: 10 }}>
          My Private Boards
        </div>

        <div style={{ marginBottom: 16 }}>
          {(myBoards ?? []).length === 0 && (
            <p style={{ fontSize: 12, color: "#9C8FD9", marginBottom: 12 }}>
              You don't have any private boards yet — only you can see these.
            </p>
          )}
          {(myBoards ?? []).map((b) => (
            <Link
              key={b.id}
              href={`/workboards/${b.id}`}
              style={{
                display: "block",
                padding: 14,
                borderRadius: 12,
                marginBottom: 10,
                textDecoration: "none",
                color: "inherit",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid #3A2C68",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>{b.name}</div>
            </Link>
          ))}
        </div>

        <NewBoardForm ownerEmployeeId={me.id} />
      </div>
    </main>
  );
}
