import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getManagedDepartments, getWeeklyItLeaderboard } from "@/lib/helpdesk";

const DIFFICULTY_BY_PRIORITY: Record<string, { label: string; cls: string }> = {
  low: { label: "EASY", cls: "easy" },
  normal: { label: "EASY", cls: "easy" },
  high: { label: "HARD", cls: "hard" },
  urgent: { label: "EPIC", cls: "epic" },
};

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

export default async function ItQuestBoardPage() {
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
  if (!managedDepartments.includes("it")) redirect("/helpdesk");

  const leaderboard = await getWeeklyItLeaderboard(supabase);
  const employeeIds = leaderboard.map((l) => l.employeeId);
  const { data: employees } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .in("id", employeeIds.length ? employeeIds : ["00000000-0000-0000-0000-000000000000"]);
  const employeeMap = new Map((employees ?? []).map((e) => [e.id, e]));
  const topScore = leaderboard[0]?.points ?? 1;

  const { data: legs } = await supabase
    .from("helpdesk_request_legs")
    .select("id, priority, request_id, assigned_to_raw_name, assigned_to_employee_id, handed_off_from_leg_id")
    .eq("department", "it")
    .in("status", ["open", "in_progress", "on_hold"])
    .order("priority", { ascending: false })
    .limit(30);

  const requestIds = [...new Set((legs ?? []).map((l) => l.request_id))];
  const { data: requests } = await supabase
    .from("helpdesk_requests")
    .select("id, title, submitted_by")
    .in("id", requestIds.length ? requestIds : ["00000000-0000-0000-0000-000000000000"]);
  const requestMap = new Map((requests ?? []).map((r) => [r.id, r]));

  const assigneeIds = [
    ...new Set((legs ?? []).map((l) => l.assigned_to_employee_id).filter(Boolean)),
  ] as string[];
  const { data: assignees } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .in("id", assigneeIds.length ? assigneeIds : ["00000000-0000-0000-0000-000000000000"]);
  const assigneeMap = new Map((assignees ?? []).map((a) => [a.id, a]));

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at top, #2A1858 0%, #150B2E 60%)",
        color: "#EDE6FF",
        fontFamily: "'DM Sans', sans-serif",
        padding: "32px 16px 60px",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Link href="/helpdesk?dept=it" style={{ fontSize: 12, color: "#9C8FD9" }}>
            ← Back to IT Queue
          </Link>
          <span style={{ fontSize: 11, color: "#9C8FD9" }}>Week of {mondayLabel()}</span>
        </div>

        <div style={{ textAlign: "center", margin: "20px 0 24px" }}>
          <div
            style={{
              fontFamily: "'Space Grotesk', 'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 30,
              backgroundImage: "linear-gradient(90deg,#FF3EA5,#00E5FF)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            IT GUILD
          </div>
          <div style={{ fontSize: 12, color: "#9C8FD9", marginTop: 4, letterSpacing: "0.03em" }}>
            ✦ 5 PTS · your own ticket &nbsp; · &nbsp; 10 PTS · you took someone else's &nbsp; · &nbsp; +10 PTS · nights &amp; weekends ✦
          </div>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid #3A2C68",
            borderRadius: 14,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9C8FD9", marginBottom: 12 }}>
            ⚡ This Week's Leaderboard
          </div>
          {leaderboard.length === 0 ? (
            <p style={{ fontSize: 12, color: "#9C8FD9" }}>No points scored yet this week — close a ticket to get on the board.</p>
          ) : (
            leaderboard.map((entry, i) => {
              const emp = employeeMap.get(entry.employeeId);
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
              return (
                <div key={entry.employeeId} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13, color: "#FFD700", width: 24 }}>
                    {medal}
                  </div>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: "linear-gradient(135deg,#FF3EA5,#7B3EFF)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {emp ? initials(emp.first_name, emp.last_name) : "?"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                      {emp ? `${emp.first_name} ${emp.last_name}` : "Unknown"}
                    </div>
                    <div style={{ height: 6, background: "#3A2C68", borderRadius: 4, marginTop: 4, overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.max(6, (entry.points / topScore) * 100)}%`,
                          background: "linear-gradient(90deg,#00E5FF,#7B3EFF)",
                          borderRadius: 4,
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#9C8FD9", fontWeight: 700 }}>{entry.points} pts</div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9C8FD9", marginBottom: 10 }}>
          Open Quests
        </div>

        {(legs ?? []).length === 0 && (
          <p style={{ fontSize: 12, color: "#9C8FD9" }}>No open IT tickets right now. 🎉</p>
        )}

        {(legs ?? []).map((leg) => {
          const req = requestMap.get(leg.request_id);
          const diff = DIFFICULTY_BY_PRIORITY[leg.priority] ?? DIFFICULTY_BY_PRIORITY.normal;
          const assignee = leg.assigned_to_employee_id ? assigneeMap.get(leg.assigned_to_employee_id) : null;
          const assigneeLabel = assignee
            ? `${assignee.first_name} ${assignee.last_name}`
            : leg.assigned_to_raw_name
              ? `${leg.assigned_to_raw_name} (legacy)`
              : "Unclaimed";

          return (
            <Link
              key={leg.id}
              href={`/helpdesk/${leg.request_id}`}
              style={{
                display: "block",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid #3A2C68",
                borderRadius: 14,
                padding: 14,
                marginBottom: 12,
                position: "relative",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  fontSize: 9,
                  fontWeight: 800,
                  padding: "4px 10px",
                  borderBottomLeftRadius: 10,
                  background: diff.cls === "epic" ? "#4D3A1E" : diff.cls === "hard" ? "#4D1E2A" : "#1E4D3A",
                  color: diff.cls === "epic" ? "#FFD700" : diff.cls === "hard" ? "#FF6B9C" : "#5FFFAE",
                }}
              >
                {diff.label}
              </span>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 5, paddingRight: 60 }}>
                {req?.title ?? "Untitled request"}
              </div>
              <div style={{ fontSize: 11, color: "#9C8FD9" }}>
                {req?.submitted_by} · {assigneeLabel}
                {leg.handed_off_from_leg_id && <span style={{ color: "#00E5FF" }}> · ↳ handed off</span>}
              </div>
              <span
                style={{
                  display: "inline-block",
                  marginTop: 8,
                  fontSize: 10,
                  fontWeight: 800,
                  color: "#FFD700",
                  background: "rgba(255,215,0,0.1)",
                  padding: "2px 8px",
                  borderRadius: 20,
                }}
              >
                5–10 pts to close · +10 after hours
              </span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

function mondayLabel(): string {
  const now = new Date();
  const chicagoNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const dayOfWeek = chicagoNow.getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const weekStart = new Date(chicagoNow);
  weekStart.setDate(chicagoNow.getDate() - daysSinceMonday);
  return weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
