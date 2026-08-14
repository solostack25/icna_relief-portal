import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PortalHeader from "@/app/PortalHeader";

const TYPE_ICON: Record<string, string> = { lesson: "📖", video: "🎬", quiz: "✅" };

export default async function CourseDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!employee) redirect("/select-app");

  const { data: course } = await supabase.from("lms_courses").select("*").eq("id", courseId).single();
  if (!course) notFound();

  const { data: modules } = await supabase
    .from("lms_course_modules")
    .select("id, module_order, title, type, estimated_minutes")
    .eq("course_id", courseId)
    .order("module_order");

  const moduleIds = (modules ?? []).map((m) => m.id);
  const { data: progress } = await supabase
    .from("lms_module_progress")
    .select("module_id, status, quiz_score")
    .eq("employee_id", employee.id)
    .in("module_id", moduleIds.length ? moduleIds : ["00000000-0000-0000-0000-000000000000"]);
  const progressMap = new Map((progress ?? []).map((p) => [p.module_id, p]));

  const completedCount = (modules ?? []).filter((m) => progressMap.get(m.id)?.status === "completed").length;
  const allComplete = (modules ?? []).length > 0 && completedCount === (modules ?? []).length;

  // First module that isn't complete yet - "Continue" jumps straight there.
  const nextModule = (modules ?? []).find((m) => progressMap.get(m.id)?.status !== "completed");

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-2xl mx-auto px-4 sm:px-10 py-8 sm:py-10">
        <div className="flex items-center justify-between mb-2">
          <Link href="/training" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            ← All Training
          </Link>
        </div>
        <h1
          style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "8px 0 6px" }}
        >
          {course.title}
        </h1>
        {course.description && (
          <p className="text-sm mb-6" style={{ color: "rgba(22,48,43,0.55)" }}>
            {course.description}
          </p>
        )}

        {allComplete ? (
          <div
            className="rounded-xl px-5 py-4 mb-6 text-sm font-semibold"
            style={{ background: "#E3F0EA", color: "var(--portal-emerald)" }}
          >
            ✓ Completed{course.refresh_interval_months ? ` — refreshes every ${course.refresh_interval_months} months` : ""}
          </div>
        ) : nextModule ? (
          <Link
            href={`/training/${courseId}/${nextModule.id}`}
            className="inline-block rounded-lg text-white text-sm font-medium px-5 py-2.5 mb-6"
            style={{ background: "var(--portal-emerald)" }}
          >
            {completedCount === 0 ? "Start Course" : "Continue"} →
          </Link>
        ) : null}

        <div
          className="rounded-2xl bg-white overflow-hidden"
          style={{ border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" }}
        >
          {(modules ?? []).map((m, i) => {
            const p = progressMap.get(m.id);
            const status = p?.status ?? "not_started";
            return (
              <Link
                key={m.id}
                href={`/training/${courseId}/${m.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-black/[0.02] transition-colors"
                style={{ borderBottom: i < (modules ?? []).length - 1 ? "1px solid var(--portal-line)" : "none" }}
              >
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: 18 }}>{TYPE_ICON[m.type]}</span>
                  <div>
                    <div className="text-sm font-medium">{m.title}</div>
                    <div className="text-[11px]" style={{ color: "rgba(22,48,43,0.45)" }}>
                      {m.estimated_minutes} min
                      {status === "completed" && p?.quiz_score != null ? ` · scored ${p.quiz_score}%` : ""}
                    </div>
                  </div>
                </div>
                <span
                  className="text-[10.5px] font-semibold"
                  style={{
                    color:
                      status === "completed"
                        ? "var(--portal-emerald)"
                        : status === "in_progress"
                          ? "#A57420"
                          : "rgba(22,48,43,0.35)",
                  }}
                >
                  {status === "completed" ? "✓ Done" : status === "in_progress" ? "In Progress" : "Not Started"}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
