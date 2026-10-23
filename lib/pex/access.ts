import * as React from "react";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient as rawAdmin, createClient } from "@/lib/supabase/server";

// Who can use the PEX app (/pex).
//
//   PEX admin  - sees every card and transaction, manages cards (incl.
//                "Used for grants"), the PEX connection and sync.
//                Portal admins, Finance (helpdesk-finance access), or
//                anyone given the "pex-admin" program access.
//   Cardholder - sees only their own card(s) and spending.
//
// Grant Management keeps its own roles for coding grant-card spending
// to grants; that lives under /grant-management/pex.

const cache: <T extends (...a: never[]) => unknown>(fn: T) => T = (React as unknown as { cache?: <T>(fn: T) => T }).cache ?? ((fn) => fn);

export const PEX_APP_SLUG = "pex";
export const PEX_ADMIN_SLUGS = ["pex-admin", "helpdesk-finance"];

export type PexViewer = {
  employeeId: string;
  name: string;
  isAdmin: boolean; // sees everything, manages cards
  isPortalAdmin: boolean; // can change the PEX connection
  isGrantManager: boolean; // Grant Management admin / grant manager
};

export const pexAdmin = (): SupabaseClient => rawAdmin() as SupabaseClient;

export const getPexViewer = cache(async function getPexViewer(): Promise<PexViewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const db = pexAdmin();
  const { data: emp } = await db.from("employees").select("id, first_name, last_name, role, is_active").eq("auth_user_id", user.id).maybeSingle();
  if (!emp || emp.is_active === false) return null;
  const [{ data: access }, { data: gm }] = await Promise.all([
    db.from("employee_program_access").select("program_slug").eq("employee_id", emp.id).in("program_slug", PEX_ADMIN_SLUGS),
    db.from("gm_user_roles").select("role, is_active").eq("employee_id", emp.id).maybeSingle(),
  ]);
  const isPortalAdmin = emp.role === "admin";
  return {
    employeeId: emp.id,
    name: `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim(),
    isAdmin: isPortalAdmin || (access ?? []).length > 0,
    isPortalAdmin,
    isGrantManager: isPortalAdmin || (!!gm?.is_active && ["gm_admin", "grant_manager"].includes(gm.role)),
  };
});

export async function requirePex(opts: { admin?: boolean; portalAdmin?: boolean } = {}): Promise<{ viewer: PexViewer } | { res: NextResponse }> {
  const viewer = await getPexViewer();
  if (!viewer) return { res: NextResponse.json({ error: "Sign in again." }, { status: 401 }) };
  if (opts.portalAdmin && !viewer.isPortalAdmin) return { res: NextResponse.json({ error: "Only a portal admin can change the PEX connection." }, { status: 403 }) };
  if (opts.admin && !viewer.isAdmin) return { res: NextResponse.json({ error: "Only Finance or a PEX admin can do that." }, { status: 403 }) };
  return { viewer };
}

// Cardholders get the PEX tile on their portal home.
export async function ensurePexAccess(db: SupabaseClient, employeeIds: (string | null | undefined)[]) {
  const ids = [...new Set(employeeIds.filter(Boolean) as string[])];
  if (!ids.length) return;
  await db.from("employee_program_access").upsert(
    ids.map((id) => ({ employee_id: id, program_slug: PEX_APP_SLUG })),
    { onConflict: "employee_id,program_slug", ignoreDuplicates: true }
  );
}

// Cards switched on for grants. Grant Management only works with these
// (plus anything already coded to a grant, so coded history never
// disappears if a card is later switched off).
export async function grantCardIds(db: SupabaseClient): Promise<string[]> {
  const { data } = await db.from("pex_cards").select("id").eq("grant_eligible", true);
  return (data ?? []).map((c) => c.id as string);
}

export function grantScopeFilter(ids: string[]) {
  return ["allocated_amount.neq.0", ...(ids.length ? [`card_id.in.(${ids.join(",")})`] : [])].join(",");
}
