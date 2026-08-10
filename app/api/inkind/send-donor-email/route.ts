import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { renderDonorInvoicePdf, type DonorInvoiceLine } from "@/lib/inkind/donorInvoicePdf";

// This route is called by the donor screen right after signing — no
// admin login involved (it's a kiosk device), so it uses the public
// anon key just like the rest of the intake app's data access.
function supabaseServer() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Turns the admin's plain-text custom message (settings.email_body) into
// paragraph HTML — blank lines become paragraph breaks, so office staff
// can write normally without knowing HTML.
function textToParagraphs(str: string): string {
  return str
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

export async function POST(req: Request) {
  const { sessionId } = await req.json();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM;
  if (!resendKey || !fromAddress) {
    // Not configured yet — fail quietly rather than blocking the donor
    // flow. See README for setup.
    return NextResponse.json({ skipped: true, reason: "Email not configured" });
  }

  const supabase = supabaseServer();

  const [{ data: session }, { data: donor }, { data: donations }, { data: settings }] = await Promise.all([
    supabase.from("sessions").select("invoice_id, office, date_received, donor_kind, donor_org_name").eq("id", sessionId).single(),
    supabase.from("donors").select("name, email, signature_data").eq("session_id", sessionId).maybeSingle(),
    supabase.from("donations").select("item_name, condition, qty, notes").eq("session_id", sessionId),
    supabase.from("settings").select("invoice_disclaimer, email_subject, email_body").eq("id", "global").maybeSingle(),
  ]);

  if (!donor?.email) {
    return NextResponse.json({ skipped: true, reason: "No donor email on file" });
  }
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const lines: DonorInvoiceLine[] = (donations ?? [])
    .filter((d) => d.qty > 0)
    .map((d) => ({ name: d.item_name, condition: d.condition, qty: d.qty, notes: d.notes }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const donorLabel =
    session.donor_kind === "anonymous" ? "Anonymous Individual" : donor.name || session.donor_org_name || "Anonymous";

  const invoiceNumber = session.invoice_id ?? sessionId.slice(0, 8);

  const pdfBytes = await renderDonorInvoicePdf({
    invoiceNumber,
    office: session.office,
    dateReceived: session.date_received,
    donorLabel,
    lines,
    totalItems: lines.reduce((a, l) => a + l.qty, 0),
    signatureDataUrl: donor.signature_data ?? null,
    disclaimer: settings?.invoice_disclaimer ?? null,
  });

  const subjectTemplate = settings?.email_subject || "Your ICNA Relief donation receipt — {{invoice}}";
  const subject = subjectTemplate.replace(/\{\{\s*invoice\s*\}\}/gi, invoiceNumber);

  const customMessage = settings?.email_body || "Thank you for your donation to ICNA Relief!";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const logoHtml = siteUrl
    ? `<img src="${siteUrl.replace(/\/$/, "")}/logo.png" alt="ICNA Relief" style="height:36px;width:auto;margin-bottom:16px;" />`
    : "";
  const html = `${logoHtml}\n${textToParagraphs(customMessage)}\n<p>Your itemized receipt (invoice ${escapeHtml(
    invoiceNumber
  )}) is attached as a PDF.</p>`;

  const resend = new Resend(resendKey);
  const { error } = await resend.emails.send({
    from: fromAddress,
    to: donor.email,
    subject,
    html,
    attachments: [
      {
        filename: `${invoiceNumber}-receipt.pdf`,
        content: Buffer.from(pdfBytes).toString("base64"),
      },
    ],
  });

  if (error) {
    return NextResponse.json({ error: error.message ?? "Failed to send email" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
