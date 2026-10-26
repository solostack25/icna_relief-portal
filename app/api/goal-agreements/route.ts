import { NextResponse } from "next/server";
import { agreementsForManager, canSign, getMe, viewModel } from "@/lib/goalAgreements";

export const dynamic = "force-dynamic";

// GET → the signed-in area manager's goal agreements (pending first).
export async function GET() {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const list = await agreementsForManager(me);
  const views = await Promise.all(list.map(async (a) => ({ ...(await viewModel(a)), canSign: canSign(me, a) })));
  views.sort((x, y) => Number(y.agreement.status === "pending") - Number(x.agreement.status === "pending"));
  return NextResponse.json({ agreements: views.map(({ sections: _s, ...v }) => v) });
}
