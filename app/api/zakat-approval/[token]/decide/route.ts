import { NextResponse } from "next/server";
import { decideZakatApproval } from "@/lib/zakatApproval";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json();
  if (body.decision !== "approve" && body.decision !== "reject") {
    return NextResponse.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 });
  }

  try {
    const result = await decideZakatApproval({ token, decision: body.decision, notes: body.notes });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong" }, { status: 400 });
  }
}
