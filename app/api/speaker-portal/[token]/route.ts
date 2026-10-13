import { NextResponse } from "next/server";
import { getSpeakerPortal, completeSpeakerPortal } from "@/lib/speakerRequests";
import { agreementSections } from "@/lib/speakerDocuments";

// Public, token-scoped: the external speaker signs their agreement and
// uploads a W-9 here. No portal account needed.

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif"];

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getSpeakerPortal(token);
  if (!view) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  if (view.unavailable) return NextResponse.json({ error: "This engagement isn't active. Please contact your ICNA Relief point of contact." }, { status: 410 });
  return NextResponse.json({ request: view.request, sections: agreementSections(view.agreement), payee: view.payee });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const form = await req.formData();
    const file = form.get("w9");
    let w9: { buffer: Buffer; filename: string; contentType: string } | undefined;
    if (file && typeof file !== "string" && file.size > 0) {
      if (file.size > MAX_BYTES) return NextResponse.json({ error: "W-9 file is over 10 MB." }, { status: 400 });
      const type = file.type || "application/pdf";
      if (!ALLOWED.includes(type)) return NextResponse.json({ error: "Upload the W-9 as a PDF or a photo (JPG/PNG)." }, { status: 400 });
      w9 = { buffer: Buffer.from(await file.arrayBuffer()), filename: file.name || "w9.pdf", contentType: type };
    }
    const s = (k: string) => String(form.get(k) ?? "");
    if (form.get("agree") !== "true" && s("signature_name")) {
      return NextResponse.json({ error: "Please check the box to agree to the terms." }, { status: 400 });
    }
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || null;
    const result = await completeSpeakerPortal(token, {
      signatureName: s("signature_name"),
      payee: {
        payee_name: s("payee_name"),
        payee_address_line1: s("payee_address_line1"),
        payee_address_line2: s("payee_address_line2"),
        payee_city: s("payee_city"),
        payee_state: s("payee_state"),
        payee_zip_code: s("payee_zip_code"),
      },
      w9,
      ip,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 400 });
  }
}
