import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { loadCleanerZipList, resolveOffice } from "@/lib/geo/zipOffices";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from("employees").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  return me?.role === "admin" ? me : null;
}

// GET ?test=1&state=&city=&zip=&region=   which office an address resolves to (and why)
// GET ?state=CA&q=fremont                  search the zip/city list
export async function GET(req: NextRequest) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const p = req.nextUrl.searchParams;
  const admin = createAdminClient();

  if (p.get("test")) {
    const r = await resolveOffice(p.get("state"), p.get("city"), p.get("zip"), p.get("region"));
    const { data: office } = r.office_id
      ? await admin.from("b2s_offices").select("field_office, region, chapter, state").eq("id", r.office_id).maybeSingle()
      : { data: null };
    return NextResponse.json({ ...r, office });
  }

  const state = (p.get("state") || "").toUpperCase();
  const q = (p.get("q") || "").trim();
  let query = admin.from("geo_zip_offices").select("id, state, zip, city, county, office_id, source, updated_at").order("zip", { nullsFirst: true }).limit(100);
  if (state) query = query.eq("state", state);
  if (q) query = /^\d+$/.test(q) ? query.like("zip", `${q}%`) : query.ilike("city", `%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient();
  const now = new Date().toISOString();

  switch (body.action) {
    case "save_zip": {
      const state = String(body.state ?? "").toUpperCase();
      const zip = body.zip ? String(body.zip).trim() : null;
      const city = body.city ? String(body.city).trim().replace(/\s+/g, " ") : null;
      if (!/^[A-Z]{2}$/.test(state)) return NextResponse.json({ error: "State must be 2 letters" }, { status: 400 });
      if (zip && !/^\d{5}$/.test(zip)) return NextResponse.json({ error: "Zip must be 5 digits" }, { status: 400 });
      if (!zip && !city) return NextResponse.json({ error: "Enter a zip or a city" }, { status: 400 });
      if (!body.office_id) return NextResponse.json({ error: "Choose an office" }, { status: 400 });
      const row = { state, zip, city, county: body.county || null, office_id: body.office_id, source: "admin", updated_by: me.id, updated_at: now };
      const { error } = body.id
        ? await admin.from("geo_zip_offices").update(row).eq("id", body.id)
        : await admin.from("geo_zip_offices").insert(row);
      if (error) {
        if (error.code === "23505") return NextResponse.json({ error: "That zip is already on the list — search for it and edit it" }, { status: 400 });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }
    case "delete_zip": {
      const { error } = await admin.from("geo_zip_offices").delete().eq("id", body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    case "set_default": {
      const state = String(body.state ?? "").toUpperCase();
      if (!/^[A-Z]{2}$/.test(state) || !body.office_id) return NextResponse.json({ error: "State and office required" }, { status: 400 });
      const { error } = await admin.from("geo_split_states").upsert({ state, default_office_id: body.office_id, updated_at: now });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    case "save_alias": {
      const alias = String(body.alias ?? "").trim().toLowerCase();
      if (!alias || !body.office_id) return NextResponse.json({ error: "Alias and office required" }, { status: 400 });
      const { error } = await admin.from("geo_region_aliases").upsert({ alias, office_id: body.office_id, updated_at: now });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    case "delete_alias": {
      const { error } = await admin.from("geo_region_aliases").delete().eq("alias", String(body.alias ?? "").toLowerCase());
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    case "load_cleaner_list": {
      const result = await loadCleanerZipList(body.mode === "reset" ? "reset" : "missing");
      return NextResponse.json({ ok: true, ...result });
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
