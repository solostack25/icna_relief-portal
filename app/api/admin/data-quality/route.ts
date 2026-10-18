import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { ensureZipListLoaded } from "@/lib/geo/zipOffices";
import { DQ_CHECK } from "@/lib/dataQuality";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PAGE = 50;
const UUID = /^[0-9a-f-]{36}$/i;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from("employees").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  return me?.role === "admin" ? me : null;
}

// GET                         → { counts, dismissed } for every check
// GET ?check=key&page=0&q=    → one page of that check's records
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const admin = createAdminClient();
  const check = req.nextUrl.searchParams.get("check");

  if (!check) {
    const { data, error } = await admin.rpc("data_quality_summary");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }
  if (!DQ_CHECK.has(check)) return NextResponse.json({ error: "Unknown check" }, { status: 400 });

  const page = Math.max(0, Number(req.nextUrl.searchParams.get("page")) || 0);
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().replace(/[%,()]/g, "");
  let query = admin
    .from("data_quality_issues")
    .select("record_id, label, detail, office_id, suggested_office_id, occurred_on, link, link2", { count: "exact" })
    .eq("check_key", check);
  if (q) query = query.or(`label.ilike.%${q}%,detail.ilike.%${q}%`);
  const { data, count, error } = await query
    .order("occurred_on", { ascending: false, nullsFirst: false })
    .order("record_id")
    .range(page * PAGE, page * PAGE + PAGE - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [], total: count ?? 0, page, pageSize: PAGE });
}

// POST actions:
//   { action: "auto_fix", check }
//   { action: "set_office", check, ids, office_id }
//   { action: "set_office_all", check: "clients_no_office", office_id }
//   { action: "dismiss", check, ids, note? }
//   { action: "restore", check }                  un-dismiss everything for a check
//   { action: "set_price", id, unit_price }       in-kind item at $0
export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient();
  const check = DQ_CHECK.get(body.check);
  const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 500) : [];

  try {
    if (body.action === "auto_fix") {
      if (!check?.autoFix) return NextResponse.json({ error: "No automatic fix for this check" }, { status: 400 });
      let fn = "";
      if (check.key === "clients_no_office") {
        await ensureZipListLoaded();
        fn = "dq_assign_client_offices";
      } else if (check.key === "inkind_sessions_no_office") fn = "dq_fix_session_offices";
      else if (check.key === "activity_no_office") fn = "dq_fix_activity_offices";
      const { data, error } = await admin.rpc(fn);
      if (error) throw new Error(error.message);
      return NextResponse.json(data);
    }

    if (body.action === "set_office" || body.action === "set_office_all") {
      if (!check?.officeFix) return NextResponse.json({ error: "Office can't be set for this check" }, { status: 400 });
      const officeId = String(body.office_id ?? "");
      if (!UUID.test(officeId)) return NextResponse.json({ error: "Pick an office" }, { status: 400 });

      if (body.action === "set_office_all") {
        if (check.key !== "clients_no_office") return NextResponse.json({ error: "Not supported" }, { status: 400 });
        let fixed = 0;
        // In batches so a few thousand rows don't time out
        for (let i = 0; i < 50; i++) {
          const { data: batch, error: e1 } = await admin.from("clients").select("id").is("office_id", null).limit(1000);
          if (e1) throw new Error(e1.message);
          if (!batch?.length) break;
          const { error: e2 } = await admin.from("clients").update({ office_id: officeId }).in("id", batch.map((r: { id: string }) => r.id));
          if (e2) throw new Error(e2.message);
          fixed += batch.length;
        }
        return NextResponse.json({ fixed });
      }

      if (!ids.length) return NextResponse.json({ error: "Nothing selected" }, { status: 400 });
      const run = async (table: string, rowIds: string[]) => {
        if (!rowIds.length) return;
        const { error } = await admin.from(table).update({ office_id: officeId }).in("id", rowIds).is("office_id", null);
        if (error) throw new Error(error.message);
      };
      if (check.key === "clients_no_office") {
        await run("clients", ids);
        const { error } = await admin.from("clients").update({ office_id: officeId }).in("main_client_id", ids).is("office_id", null);
        if (error) throw new Error(error.message);
      } else if (check.key === "inkind_sessions_no_office") await run("sessions", ids);
      else if (check.key === "grants_no_office") await run("grants", ids);
      else if (check.key === "activity_no_office") {
        const by = (p: string) => ids.filter((i) => i.startsWith(p + ":")).map((i) => i.slice(p.length + 1));
        await run("hp_food_distributions", by("hp"));
        await run("rsce_services", by("rsce"));
        await run("bulk_distributions", by("bulk"));
      }
      return NextResponse.json({ fixed: ids.length });
    }

    if (body.action === "dismiss") {
      if (!check?.dismissLabel) return NextResponse.json({ error: "These can't be dismissed" }, { status: 400 });
      if (!ids.length) return NextResponse.json({ error: "Nothing selected" }, { status: 400 });
      const note = typeof body.note === "string" ? body.note.slice(0, 200) : check.dismissLabel;
      const { error } = await admin
        .from("data_quality_dismissals")
        .upsert(ids.map((record_id) => ({ check_key: check.key, record_id, note, dismissed_by: me.id })), { onConflict: "check_key,record_id" });
      if (error) throw new Error(error.message);
      return NextResponse.json({ dismissed: ids.length });
    }

    if (body.action === "restore") {
      if (!check) return NextResponse.json({ error: "Unknown check" }, { status: 400 });
      const { error } = await admin.from("data_quality_dismissals").delete().eq("check_key", check.key);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "set_price") {
      const price = Number(body.unit_price);
      if (!UUID.test(String(body.id)) || !Number.isFinite(price) || price <= 0 || price > 1_000_000) {
        return NextResponse.json({ error: "Enter a price above $0" }, { status: 400 });
      }
      const { data: row } = await admin.from("donations").select("id, qty, unit_price, is_manual_price").eq("id", body.id).maybeSingle();
      if (!row) return NextResponse.json({ error: "Item not found" }, { status: 404 });
      if (Number(row.unit_price ?? 0) !== 0) return NextResponse.json({ error: "That item already has a price" }, { status: 409 });
      const { error } = await admin.from("donations").update({ unit_price: price }).eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
