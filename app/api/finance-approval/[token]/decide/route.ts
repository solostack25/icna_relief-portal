import { NextResponse } from "next/server";
import { decideFinanceApprovalStep } from "@/lib/financeApproval";

// Token-authed, same reasoning as the GET route in the parent folder -
// no portal login required, the token is the credential.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { decision, note } = await req.json();

  if (decision !== "approve" && decision !== "deny") {
    return NextResponse.json({ error: "decision must be 'approve' or 'deny'" }, { status: 400 });
  }

  const result = await decideFinanceApprovalStep({ token, decision, note });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
