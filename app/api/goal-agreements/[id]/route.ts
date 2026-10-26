import { NextResponse } from "next/server";
import { canSign, canView, getAgreement, getMe, signAgreement, viewModel } from "@/lib/goalAgreements";

export const dynamic = "force-dynamic";

// GET → one agreement with its full text. Admins, and the office's area manager.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const a = await getAgreement(id);
  if (!a || !canView(me, a)) return NextResponse.json({ error: "This agreement isn't available to you." }, { status: 404 });
  return NextResponse.json({ ...(await viewModel(a)), canSign: canSign(me, a), me: { name: me.name } });
}

// POST { signature_name, agree: true } → sign it.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.agree !== true) return NextResponse.json({ error: "Check the box to confirm you agree." }, { status: 400 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || null;
  const r = await signAgreement(id, me, String(body.signature_name ?? ""), ip);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
