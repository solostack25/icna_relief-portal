import { NextRequest, NextResponse } from "next/server";
import { getInsightsAccess } from "@/lib/insightsAccess";
import { createAdminClient } from "@/lib/supabase/server";
import { loadTargetsWithActuals } from "@/lib/insightsTargetsServer";
import { targetKey } from "@/lib/insightsTargets";

export const dynamic = "force-dynamic";

// GET ?year=2026&scope=org|region|office&key=<region or office id>
// The goals & budget set for one scope and the progress against them.
// Area managers can only ask about their own office; regional directors
// about their region or its offices.
export async function GET(req: NextRequest) {
  const access = await getInsightsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not allowed" }, { status: access.status });
  const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getFullYear();
  let scope = req.nextUrl.searchParams.get("scope") ?? "org";
  let key = req.nextUrl.searchParams.get("key") ?? "";

  if (access.lockedOffice) {
    scope = "office";
    key = access.lockedOffice;
  } else if (access.lockedRegion && scope === "org") {
    scope = "region";
    key = access.lockedRegion;
  }
  if (!["org", "region", "office"].includes(scope)) return NextResponse.json({ error: "Bad scope" }, { status: 400 });

  if (access.lockedRegion && !access.lockedOffice) {
    if (scope === "region" && key !== access.lockedRegion) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    if (scope === "office") {
      const { data: o } = await createAdminClient().from("b2s_offices").select("region").eq("id", key).maybeSingle();
      if (o?.region !== access.lockedRegion) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
  }

  const { targets, actuals } = await loadTargetsWithActuals(year, {
    region: access.lockedRegion,
    officeId: scope === "office" ? key : null,
  });
  return NextResponse.json({
    year,
    scope,
    key,
    targets: targets.filter((t) => t.scope === scope && (scope === "org" || t.scope_key === key)),
    actual: actuals[targetKey(scope, key)] ?? null,
  });
}
