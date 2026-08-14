import type { SupabaseClient } from "@supabase/supabase-js";

export type Course = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  required_for_all: boolean;
  required_for_roles: string[];
  required_for_program_slugs: string[];
  refresh_interval_months: number | null;
  is_active: boolean;
};

export type CourseStatus = "not_started" | "in_progress" | "completed" | "due_for_refresher";

export type CourseWithStatus = Course & {
  status: CourseStatus;
  required: boolean;
  lastCompletedAt: string | null;
  moduleCount: number;
  completedModuleCount: number;
};

// Whether this course is assigned to this employee - computed live from
// their role/program access, not a stored assignment row, so nothing
// needs to be re-synced when a role or grant changes (same pattern as
// getManagedDepartments() for helpdesk elsewhere in this app).
function isRequiredFor(course: Course, role: string, programSlugs: string[]): boolean {
  if (course.required_for_all) return true;
  if (course.required_for_roles.includes(role)) return true;
  if (course.required_for_program_slugs.some((s) => programSlugs.includes(s))) return true;
  return false;
}

export async function getCoursesWithStatus(
  supabase: SupabaseClient,
  employeeId: string,
  role: string
): Promise<CourseWithStatus[]> {
  const { data: courses } = await supabase
    .from("lms_courses")
    .select("*")
    .eq("is_active", true)
    .order("category")
    .order("title");
  if (!courses || courses.length === 0) return [];

  const { data: access } = await supabase
    .from("employee_program_access")
    .select("program_slug")
    .eq("employee_id", employeeId);
  const programSlugs = (access ?? []).map((a) => a.program_slug);

  const courseIds = courses.map((c) => c.id);
  const { data: modules } = await supabase
    .from("lms_course_modules")
    .select("id, course_id")
    .in("course_id", courseIds);
  const modulesByCourse = new Map<string, string[]>();
  for (const m of modules ?? []) {
    const list = modulesByCourse.get(m.course_id) ?? [];
    list.push(m.id);
    modulesByCourse.set(m.course_id, list);
  }

  const allModuleIds = (modules ?? []).map((m) => m.id);
  const { data: progress } = await supabase
    .from("lms_module_progress")
    .select("module_id, status")
    .eq("employee_id", employeeId)
    .in("module_id", allModuleIds.length ? allModuleIds : ["00000000-0000-0000-0000-000000000000"]);
  const completedModuleIds = new Set((progress ?? []).filter((p) => p.status === "completed").map((p) => p.module_id));
  const inProgressModuleIds = new Set(
    (progress ?? []).filter((p) => p.status === "in_progress").map((p) => p.module_id)
  );

  const { data: completions } = await supabase
    .from("lms_course_completions")
    .select("course_id, completed_at")
    .eq("employee_id", employeeId)
    .in("course_id", courseIds)
    .order("completed_at", { ascending: false });
  const lastCompletionByCourse = new Map<string, string>();
  for (const c of completions ?? []) {
    if (!lastCompletionByCourse.has(c.course_id)) lastCompletionByCourse.set(c.course_id, c.completed_at);
  }

  const now = new Date();

  return courses.map((course) => {
    const moduleIds = modulesByCourse.get(course.id) ?? [];
    const completedCount = moduleIds.filter((id) => completedModuleIds.has(id)).length;
    const anyInProgress = moduleIds.some((id) => inProgressModuleIds.has(id) || completedModuleIds.has(id));
    const lastCompletedAt = lastCompletionByCourse.get(course.id) ?? null;

    let status: CourseStatus = "not_started";
    if (moduleIds.length > 0 && completedCount === moduleIds.length) {
      status = "completed";
      if (course.refresh_interval_months && lastCompletedAt) {
        const dueDate = new Date(lastCompletedAt);
        dueDate.setMonth(dueDate.getMonth() + course.refresh_interval_months);
        if (dueDate < now) status = "due_for_refresher";
      }
    } else if (anyInProgress) {
      status = "in_progress";
    }

    return {
      ...course,
      status,
      required: isRequiredFor(course, role, programSlugs),
      lastCompletedAt,
      moduleCount: moduleIds.length,
      completedModuleCount: completedCount,
    };
  });
}
