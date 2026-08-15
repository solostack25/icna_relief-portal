import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CourseEditorClient from "./CourseEditorClient";

export default async function AdminCourseEditorPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") redirect("/select-app");

  const { data: course } = await supabase.from("lms_courses").select("*").eq("id", courseId).single();
  if (!course) notFound();

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1
          style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: 0 }}
        >
          {course.title}
        </h1>
        <Link href="/admin/training" className="text-sm" style={{ color: "rgba(22,48,43,0.5)" }}>
          ← All Courses
        </Link>
      </div>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        {course.description}
      </p>
      <CourseEditorClient courseId={courseId} />
    </div>
  );
}
