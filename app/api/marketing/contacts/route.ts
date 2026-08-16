import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";

export async function GET(req: Request) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const tag = searchParams.get("tag")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = 50;

  const admin = createAdminClient();

  let contactIds: string[] | null = null;
  if (tag) {
    const { data: tagged } = await admin.from("contact_tags").select("contact_id").eq("tag", tag);
    const ids = (tagged ?? []).map((t: { contact_id: string }) => t.contact_id);
    if (ids.length === 0) {
      return NextResponse.json({ contacts: [], total: 0, page, pageSize });
    }
    contactIds = ids;
  }

  let query = admin
    .from("contacts")
    .select("id, email, phone, first_name, last_name, email_opt_out, sms_opt_out, source, created_at", {
      count: "exact",
    });

  if (contactIds) query = query.in("id", contactIds);
  if (q) {
    query = query.or(
      `email.ilike.%${q}%,phone.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`
    );
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ contacts: data ?? [], total: count ?? 0, page, pageSize });
}

export async function POST(req: Request) {
  const access = await getMarketingContactsAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const body = await req.json();
  const email = body.email?.trim().toLowerCase() || null;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("contacts")
    .insert({
      email,
      phone: body.phone?.trim() || null,
      first_name: body.first_name?.trim() || null,
      last_name: body.last_name?.trim() || null,
      source: "manual",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
