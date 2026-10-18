import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { CHECK_BUCKET, sendCashCheckReceipt } from "@/lib/inkind/cashCheck";
import { resolveIntakeOffice } from "@/lib/inkind/offices";

// Called from the InKind scanning station (/inkind/cash-check). Like the
// rest of the kiosk it has no staff login, so everything is validated
// here and written with the service role - the table has no anon access,
// and nothing about other donations is ever returned.

const str = (v: FormDataEntryValue | null, max = 200) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form submission" }, { status: 400 });
  }

  const method = str(form.get("method"));
  if (method !== "cash" && method !== "check") {
    return NextResponse.json({ error: "Choose cash or check" }, { status: 400 });
  }

  const amount = Math.round(Number(str(form.get("amount"))) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });
  }

  const donorKind = str(form.get("donorKind")) ?? "individual";
  if (!["individual", "organization", "anonymous"].includes(donorKind)) {
    return NextResponse.json({ error: "Invalid donor type" }, { status: 400 });
  }
  const anonymous = donorKind === "anonymous";

  const firstName = anonymous ? null : str(form.get("firstName"), 80);
  const lastName = anonymous ? null : str(form.get("lastName"), 80);
  const orgName = donorKind === "organization" ? str(form.get("orgName"), 150) : null;
  const email = anonymous ? null : str(form.get("email"), 200)?.toLowerCase() ?? null;
  const phone = anonymous ? null : str(form.get("phone"), 30);
  const emailReceipt = !anonymous && form.get("emailReceipt") === "true";

  if (donorKind === "individual" && (!firstName || !lastName)) {
    return NextResponse.json({ error: "Donor first and last name are required" }, { status: 400 });
  }
  if (donorKind === "organization" && !orgName) {
    return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }
  if (emailReceipt && !email) {
    return NextResponse.json({ error: "An email is needed to send the receipt" }, { status: 400 });
  }

  const checkNumber = method === "check" ? str(form.get("checkNumber"), 30) : null;
  const image = method === "check" ? form.get("checkImage") : null;
  if (method === "check") {
    if (!checkNumber) return NextResponse.json({ error: "Check number is required" }, { status: 400 });
    if (!(image instanceof File) || image.size === 0) {
      return NextResponse.json({ error: "Add a photo of the check" }, { status: 400 });
    }
    if (image.size > MAX_IMAGE_BYTES || !IMAGE_TYPES.includes(image.type)) {
      return NextResponse.json({ error: "Check photo must be a JPEG/PNG under 8 MB" }, { status: 400 });
    }
  }

  const dateReceived = str(form.get("dateReceived"), 10) ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateReceived)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const { office, error: officeError } = await resolveIntakeOffice(str(form.get("officeId"), 40));
  if (!office) return NextResponse.json({ error: officeError }, { status: 400 });

  const admin = createAdminClient();
  const { data: receiptNumber, error: rnErr } = await admin.rpc("next_invoice_id", { prefix: office.cashPrefix });
  if (rnErr || !receiptNumber) {
    return NextResponse.json({ error: "Could not generate a receipt number" }, { status: 500 });
  }

  const id = randomUUID();
  let imagePath: string | null = null;
  if (method === "check" && image instanceof File) {
    const ext = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg";
    imagePath = `${dateReceived.slice(0, 7)}/${id}.${ext}`;
    const { error: upErr } = await admin.storage
      .from(CHECK_BUCKET)
      .upload(imagePath, Buffer.from(await image.arrayBuffer()), { contentType: image.type, upsert: false });
    if (upErr) return NextResponse.json({ error: `Couldn't save the check photo: ${upErr.message}` }, { status: 500 });
  }

  const { error: insErr } = await admin.from("inkind_cash_donations").insert({
    id,
    receipt_number: receiptNumber,
    office: office.name,
    office_id: office.id,
    method,
    amount,
    date_received: dateReceived,
    check_number: checkNumber,
    check_image_path: imagePath,
    donor_kind: donorKind,
    donor_first_name: firstName,
    donor_last_name: lastName,
    donor_org_name: orgName,
    donor_email: email,
    donor_phone: phone,
    address_line1: anonymous ? null : str(form.get("address1")),
    address_line2: anonymous ? null : str(form.get("address2")),
    city: anonymous ? null : str(form.get("city"), 100),
    state: anonymous ? null : str(form.get("state"), 40),
    zip: anonymous ? null : str(form.get("zip"), 15),
    notes: str(form.get("notes"), 1000),
    email_receipt: emailReceipt,
  });

  if (insErr) {
    if (imagePath) await admin.storage.from(CHECK_BUCKET).remove([imagePath]);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  let receipt: { sent: boolean; error?: string } | null = null;
  if (emailReceipt) receipt = await sendCashCheckReceipt(id);

  return NextResponse.json({ success: true, receiptNumber, receipt });
}
