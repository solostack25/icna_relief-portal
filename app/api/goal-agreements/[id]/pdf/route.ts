import { NextResponse } from "next/server";
import { agreementPdf, canView, getAgreement, getMe } from "@/lib/goalAgreements";

export const dynamic = "force-dynamic";

// The signed copy once signed, otherwise the unsigned document.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const a = await getAgreement(id);
  if (!a || !canView(me, a)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { buffer, filename } = await agreementPdf(a);
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "private, no-store" },
  });
}
