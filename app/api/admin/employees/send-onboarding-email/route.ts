import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResendClient } from "@/lib/resendClient";

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Blank-line-separated paragraphs -> HTML, so the admin can write/edit
// the draft as plain text without needing to know HTML.
function textToHtml(str: string): string {
  return str
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { toEmail, subject, body } = await request.json();
  if (!toEmail?.trim() || !subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "toEmail, subject, and body are all required" }, { status: 400 });
  }

  const resend = await getResendClient();
  if (!resend) {
    return NextResponse.json(
      { error: "Email isn't configured yet — set Resend API Key and From Address under Admin → Connectors." },
      { status: 400 }
    );
  }

  const { error } = await resend.client.emails.send({
    from: resend.fromAddress,
    to: toEmail.trim(),
    subject: subject.trim(),
    html: textToHtml(body),
  });

  if (error) {
    return NextResponse.json({ error: error.message ?? "Failed to send email" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
