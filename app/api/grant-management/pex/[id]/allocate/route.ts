import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/grantManagement/server";
import { requireViewer, fail, readJson } from "@/lib/grantManagement/api";
import { allocateTransaction } from "@/lib/pex/allocation";

export const maxDuration = 60;

// Code a PEX transaction: one or more grant portions (each becomes a
// gm_expense), and optionally a non-grant portion with a reason.
// { splits: [{ grant_id, line_id, amount, description }], non_grant_amount, non_grant_note,
//   document_ids, pex_attachment_ids, submit }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireViewer();
  if ("res" in auth) return auth.res;
  const body = await readJson(req);
  const r = await allocateTransaction(createAdminClient(), auth.viewer, id, body);
  if (!r.ok) return fail(r.error, r.status ?? 400, r.fields);
  return NextResponse.json(r);
}
