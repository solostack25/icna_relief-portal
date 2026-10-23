import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/grantManagement/server";
import { requireViewer, fail } from "@/lib/grantManagement/api";
import { canWorkTx, loadTx } from "@/lib/pex/allocation";
import { getPexConfig, pexAttachments } from "@/lib/pex/client";

// Receipts the cardholder already attached in the PEX app.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireViewer();
  if ("res" in auth) return auth.res;
  const tx = await loadTx(createAdminClient(), id);
  if (!tx) return fail("Transaction not found.", 404);
  if (!canWorkTx(auth.viewer, tx)) return fail("This card transaction isn't yours.", 403);
  if (!tx.external_id || tx.source === "upload") return NextResponse.json({ attachments: [], connected: false });
  const cfg = await getPexConfig();
  if (!cfg) return NextResponse.json({ attachments: [], connected: false });
  try {
    const list = await pexAttachments(cfg, tx.external_id);
    return NextResponse.json({ connected: true, attachments: list.map((a) => ({ id: a.AttachmentId, type: a.Type ?? null, size: a.Size ?? null, created: a.CreatedDateUtc ?? null })) });
  } catch (e) {
    return NextResponse.json({ connected: true, attachments: [], error: e instanceof Error ? e.message : "Couldn't load receipts from PEX." });
  }
}
