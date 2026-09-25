import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshPublicWebsite, WEBSITE_KINDS, WEBSITE_SERVICES, zipCenter } from "@/lib/publicWebsite";

// Saves an office's public website listing (web_office_listings). Same RLS-first pattern as
// /api/office-info/save: admins can save any office, area managers only their assigned office.
const clean = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await request.json().catch(() => null);
  const officeId = clean(b?.office_id, 64);
  if (!officeId) return NextResponse.json({ error: "office_id is required" }, { status: 400 });

  const isPublic = b?.is_public === true;
  const state = clean(b?.state, 2)?.toUpperCase() ?? null;
  const zip = clean(b?.zip, 5);
  const kind = WEBSITE_KINDS.some((k) => k.id === b?.kind) ? (b.kind as string) : "office";
  const services = Array.isArray(b?.services) ? b.services.filter((s: unknown) => WEBSITE_SERVICES.some((x) => x.id === s)) : [];
  const row = {
    office_id: officeId,
    is_public: isPublic,
    display_name: clean(b?.display_name, 120),
    kind,
    address1: clean(b?.address1),
    address2: clean(b?.address2),
    city: clean(b?.city, 80),
    state,
    zip,
    phone: clean(b?.phone, 40),
    email: clean(b?.email, 120),
    services,
    public_note: clean(b?.public_note, 280),
    lat: null as number | null,
    lng: null as number | null,
    geo_source: null as string | null,
  };

  if (state && !/^[A-Z]{2}$/.test(state)) return NextResponse.json({ error: "State must be a 2-letter code, like TX." }, { status: 400 });
  if (zip && !/^\d{5}$/.test(zip)) return NextResponse.json({ error: "ZIP must be 5 digits." }, { status: 400 });
  if (isPublic && !(row.address1 && row.city && state && zip)) {
    return NextResponse.json({ error: "To show this office on the website, fill in the street address, city, state and ZIP." }, { status: 400 });
  }

  // Map point: keep a manually set point; otherwise use the ZIP's center.
  const { data: existing } = await supabase.from("web_office_listings").select("lat, lng, geo_source, zip").eq("office_id", officeId).maybeSingle();
  if (existing?.geo_source === "manual" && existing.zip === zip) {
    row.lat = existing.lat;
    row.lng = existing.lng;
    row.geo_source = "manual";
  } else if (zip) {
    const c = await zipCenter(zip);
    if (c) {
      row.lat = c.lat;
      row.lng = c.lng;
      row.geo_source = "zip";
    }
  }

  const { data: saved, error } = await supabase.from("web_office_listings").upsert(row, { onConflict: "office_id" }).select("office_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!saved || saved.length === 0) {
    return NextResponse.json({ error: "You can only edit the website listing for your own office." }, { status: 403 });
  }

  const refreshed = await refreshPublicWebsite();
  return NextResponse.json({ ok: true, refreshed, mapped: row.lat != null });
}
