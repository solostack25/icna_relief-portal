import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";

export async function GET() {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const admin = createAdminClient();
  const { data: sequences, error } = await admin
    .from("campaign_sequences")
    .select("id, name, description, status, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withCounts = await Promise.all(
    (sequences ?? []).map(async (s: { id: string }) => {
      const [{ count: stepCount }, { count: activeCount }] = await Promise.all([
        admin.from("sequence_steps").select("*", { count: "exact", head: true }).eq("sequence_id", s.id),
        admin
          .from("sequence_enrollments")
          .select("*", { count: "exact", head: true })
          .eq("sequence_id", s.id)
          .eq("status", "active"),
      ]);
      return { ...s, stepCount: stepCount ?? 0, activeEnrollments: activeCount ?? 0 };
    })
  );

  return NextResponse.json({ sequences: withCounts });
}

type StepInput = {
  channel: "email" | "sms";
  delayAfterPreviousHours: number;
  subject?: string;
  body: string;
};

export async function POST(req: Request) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const body = await req.json();
  const { name, description, steps } = body as { name: string; description?: string; steps: StepInput[] };

  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!Array.isArray(steps) || steps.length === 0) {
    return NextResponse.json({ error: "At least one step is required" }, { status: 400 });
  }
  for (const step of steps) {
    if (step.channel === "email" && !step.subject?.trim()) {
      return NextResponse.json({ error: "Every email step needs a subject" }, { status: 400 });
    }
    if (!step.body?.trim()) {
      return NextResponse.json({ error: "Every step needs a body" }, { status: 400 });
    }
  }

  const admin = createAdminClient();
  const { data: sequence, error } = await admin
    .from("campaign_sequences")
    .insert({ name: name.trim(), description: description?.trim() || null, status: "draft", created_by: access.employeeId })
    .select("id")
    .single();

  if (error || !sequence) return NextResponse.json({ error: error?.message ?? "Could not create sequence" }, { status: 500 });

  const { error: stepsError } = await admin.from("sequence_steps").insert(
    steps.map((s, i) => ({
      sequence_id: sequence.id,
      step_order: i + 1,
      channel: s.channel,
      delay_after_previous_hours: s.delayAfterPreviousHours,
      subject: s.channel === "email" ? s.subject : null,
      body: s.body,
    }))
  );

  if (stepsError) return NextResponse.json({ error: stepsError.message }, { status: 500 });

  return NextResponse.json({ id: sequence.id });
}
