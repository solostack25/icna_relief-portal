import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCoursesWithStatus, type CourseStatus } from "@/lib/lms";
import PortalHeader from "@/app/PortalHeader";

const STATUS_LABEL: Record<CourseStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  due_for_refresher: "Refresher Due",
};
const STATUS_STYLE: Record<CourseStatus, { background: string; color: string }> = {
  not_started: { background: "#EAF3EF", color: "#5F6E68" },
  in_progress: { background: "#FBF0DC", color: "#A57420" },
  completed: { background: "#E3F0EA", color: "var(--portal-emerald)" },
  due_for_refresher: { background: "#FBE3DC", color: "#B55139" },
};

export default async function TrainingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: employee } = await supabase
    .from("employees")
    .select("id, first_name, role")
    .eq("auth_user_id", user.id)
    .single();
  if (!employee) redirect("/select-app");

  const courses = await getCoursesWithStatus(supabase, employee.id, employee.role);
  const required = courses.filter((c) => c.required);
  const optional = courses.filter((c) => !c.required);
  const needsAttention = required.filter((c) => c.status !== "completed");

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-3xl mx-auto px-4 sm:px-10 py-8 sm:py-10">
        <div className="flex items-center justify-between mb-2">
          <h1
            style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}
          >
            Training
          </h1>
          <Link href="/select-app" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            ← Back
          </Link>
        </div>
        <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
          {needsAttention.length === 0
            ? "You're all caught up on required training."
            : `${needsAttention.length} required course${needsAttention.length === 1 ? "" : "s"} need${
                needsAttention.length === 1 ? "s" : ""
              } your attention.`}
        </p>

        {required.length > 0 && (
          <>
            <SectionLabel text="Required for You" />
            <div className="space-y-2 mb-10">
              {required.map((c) => (
                <CourseRow key={c.id} course={c} />
              ))}
            </div>
          </>
        )}

        {optional.length > 0 && (
          <>
            <SectionLabel text="Also Available" />
            <div className="space-y-2">
              {optional.map((c) => (
                <CourseRow key={c.id} course={c} />
              ))}
            </div>
          </>
        )}

        {courses.length === 0 && (
          <p className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
            No training courses have been published yet.
          </p>
        )}
      </div>
    </main>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div
      className="text-xs font-medium mb-3"
      style={{
        fontFamily: "'IBM Plex Mono', monospace",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--portal-emerald)",
      }}
    >
      {text}
    </div>
  );
}

function CourseRow({ course }: { course: Awaited<ReturnType<typeof getCoursesWithStatus>>[number] }) {
  return (
    <Link
      href={`/training/${course.id}`}
      className="flex items-center justify-between rounded-xl bg-white px-5 py-4 transition-all hover:-translate-y-0.5"
      style={{ border: "1px solid var(--portal-line)", boxShadow: "0 1px 2px rgba(22,48,43,0.04)" }}
    >
      <div>
        <div className="text-sm font-bold">{course.title}</div>
        {course.description && (
          <div className="text-xs mt-0.5" style={{ color: "rgba(22,48,43,0.5)" }}>
            {course.description}
          </div>
        )}
        <div className="text-[11px] mt-1" style={{ color: "rgba(22,48,43,0.4)" }}>
          {course.completedModuleCount}/{course.moduleCount} modules
          {course.refresh_interval_months ? ` · refreshes every ${course.refresh_interval_months}mo` : ""}
        </div>
      </div>
      <span
        className="text-[10.5px] px-2.5 py-1 rounded-full font-semibold whitespace-nowrap"
        style={STATUS_STYLE[course.status]}
      >
        {STATUS_LABEL[course.status]}
      </span>
    </Link>
  );
}
