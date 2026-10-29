import { NextResponse } from "next/server";
import { errorMessage, phoneAudit, requirePhonesViewer } from "@/lib/phonesAdmin";
import { listSmsReceipts, orderNumbers, searchNumbers, setE911, updateNumber, type E911Address } from "@/lib/skyetelAdmin";

// Phones > Skyetel actions. IT only; every change is audited.
export async function POST(req: Request) {
  const viewer = await requirePhonesViewer();
  if (viewer instanceof NextResponse) return viewer;

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  try {
    if (action === "update_number") {
      const id = Number(body.id);
      if (!id) return NextResponse.json({ error: "Missing number id." }, { status: 400 });
      const f = body.fields ?? {};
      const fields: Record<string, string | number | boolean | Record<string, string | boolean>> = {};
      if (typeof f.note === "string") fields.note = f.note.slice(0, 255);
      if (f.endpoint_group_id != null && f.endpoint_group_id !== "") fields.endpoint_group_id = Number(f.endpoint_group_id);
      if (typeof f.forward === "string") fields.forward = f.forward.replace(/[^\d+]/g, "");
      if (typeof f.failover === "string") fields.failover = f.failover.replace(/[^\d+]/g, "");
      if (typeof f.message_enabled === "boolean") fields.message_enabled = f.message_enabled;
      if (typeof f.spamblock_enabled === "boolean") fields.spamblock_enabled = f.spamblock_enabled;
      if (typeof f.cnam_enabled === "boolean") fields.cnam_enabled = f.cnam_enabled;
      if (typeof f.cnam_text === "string") fields.lidb = { cnam_text: f.cnam_text.slice(0, 15), type: "business" };
      const updated = await updateNumber(id, fields);
      await phoneAudit({ actor: viewer, system: "skyetel", action: "update_number", target: String(body.number ?? id), detail: fields, ok: true });
      return NextResponse.json({ ok: true, number: updated });
    }

    if (action === "set_e911") {
      const id = Number(body.id);
      const a = body.address ?? {};
      const address: E911Address = {
        caller_name: String(a.caller_name ?? "").slice(0, 60),
        address1: String(a.address1 ?? ""),
        address2: String(a.address2 ?? ""),
        community: String(a.community ?? ""),
        state: String(a.state ?? "").toUpperCase().slice(0, 2),
        postal_code: String(a.postal_code ?? "").slice(0, 5),
      };
      if (!id || !address.caller_name || !address.address1 || !address.community || address.state.length !== 2 || !/^\d{5}$/.test(address.postal_code)) {
        return NextResponse.json({ error: "Fill in name, street, city, 2-letter state and 5-digit ZIP." }, { status: 400 });
      }
      await setE911(id, address, !!body.hadAddress);
      await phoneAudit({ actor: viewer, system: "skyetel", action: "set_e911", target: String(body.number ?? id), detail: address, ok: true });
      return NextResponse.json({ ok: true });
    }

    if (action === "search") {
      const results = await searchNumbers({
        npa: String(body.npa ?? "").replace(/\D/g, "").slice(0, 3) || undefined,
        state: body.state ? String(body.state) : undefined,
        city: body.city ? String(body.city) : undefined,
        quantity: Number(body.quantity) || 10,
        tollFree: !!body.tollFree,
      });
      return NextResponse.json({ ok: true, results });
    }

    if (action === "order") {
      const numbers: string[] = Array.isArray(body.numbers) ? body.numbers.map(String).slice(0, 10) : [];
      if (!numbers.length) return NextResponse.json({ error: "Pick at least one number." }, { status: 400 });
      if (body.confirm !== "ORDER") return NextResponse.json({ error: "Ordering numbers costs money. Confirm first." }, { status: 400 });
      const ordered = await orderNumbers(numbers);
      await phoneAudit({ actor: viewer, system: "skyetel", action: "order_numbers", target: numbers.join(", "), detail: { count: numbers.length }, ok: true });
      return NextResponse.json({ ok: true, ordered });
    }

    if (action === "sms_receipts") {
      const receipts = await listSmsReceipts(100, body.number ? String(body.number).replace(/\D/g, "") : undefined);
      return NextResponse.json({ ok: true, receipts });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    const msg = errorMessage(err);
    if (action !== "search" && action !== "sms_receipts") {
      await phoneAudit({ actor: viewer, system: "skyetel", action, target: String(body?.number ?? body?.id ?? ""), ok: false, error: msg });
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
