import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PortalHeader from "@/app/PortalHeader";
import LessonPlayer from "./LessonPlayer";
import VideoPlayer from "./VideoPlayer";
import QuizPlayer from "./QuizPlayer";

export default async function ModulePlayerPage({
  params,
}: {
  params: Promise<{ courseId: string; moduleId: string }>;
}) {
  const { courseId, moduleId } = await params;
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

  const { data: courseModule } = await supabase
    .from("lms_course_modules")
    .select("id, course_id, title, type, content, module_order")
    .eq("id", moduleId)
    .single();
  if (!courseModule || courseModule.course_id !== courseId) notFound();

  const { data: allModules } = await supabase
    .from("lms_course_modules")
    .select("id, module_order")
    .eq("course_id", courseId)
    .order("module_order");
  const idx = (allModules ?? []).findIndex((m) => m.id === moduleId);
  const nextModuleId = idx >= 0 && idx < (allModules ?? []).length - 1 ? allModules![idx + 1].id : null;

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-2xl mx-auto px-4 sm:px-10 py-8 sm:py-10">
        <Link href={`/training/${courseId}`} className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
          ← Back to Course
        </Link>
        <h1
          style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 26, margin: "10px 0 24px" }}
        >
          {courseModule.title}
        </h1>

        {courseModule.type === "lesson" && (
          <LessonPlayer
            moduleId={moduleId}
            courseId={courseId}
            nextModuleId={nextModuleId}
            steps={courseModule.content?.steps ?? []}
          />
        )}
        {courseModule.type === "video" && (
          <VideoPlayer
            moduleId={moduleId}
            courseId={courseId}
            nextModuleId={nextModuleId}
            videoUrl={courseModule.content?.video_url ?? ""}
            notes={courseModule.content?.notes ?? null}
          />
        )}
        {courseModule.type === "quiz" && (
          <QuizPlayer moduleId={moduleId} courseId={courseId} nextModuleId={nextModuleId} />
        )}
      </div>
    </main>
  );
}
