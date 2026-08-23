import { NextResponse } from "next/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";
import { pushContactTranscriptToSalesforce } from "@/lib/marketing/salesforceDonorCall";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const result = await pushContactTranscriptToSalesforce(params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
