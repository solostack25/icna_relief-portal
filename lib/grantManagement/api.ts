import { NextResponse } from "next/server";
import { getGmViewer, type GmViewer } from "./server";

export async function requireViewer(opts: { manager?: boolean } = {}): Promise<{ viewer: GmViewer } | { res: NextResponse }> {
  const viewer = await getGmViewer();
  if (!viewer) return { res: NextResponse.json({ error: "You don't have access to Grant Management." }, { status: 403 }) };
  if (opts.manager && !viewer.isManager) return { res: NextResponse.json({ error: "Only Grant Management can do that." }, { status: 403 }) };
  return { viewer };
}

export function fail(error: string, status = 400, fields?: Record<string, string>) {
  return NextResponse.json({ error, fields }, { status });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const j = await req.json();
    return j && typeof j === "object" ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
