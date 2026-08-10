import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getInkindAccess } from "@/lib/inkind/access";

function slugify(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export async function POST(req: Request) {
  const access = await getInkindAccess();
  if (!access.ok) {
    return NextResponse.json({ error: "Not authorized" }, { status: access.status });
  }

  const body = await req.json();
  const { name, program, programCode, manualPrice, requiresNote, newPrice, usedPrice } = body;

  if (!name || !program || !programCode) {
    return NextResponse.json({ error: "Name and program are required" }, { status: 400 });
  }
  if (!manualPrice && newPrice == null) {
    return NextResponse.json(
      { error: "A new price is required unless this is a manual-price item" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const baseSlug = slugify(name);
  if (!baseSlug) {
    return NextResponse.json({ error: "Couldn't generate a code from that name" }, { status: 400 });
  }

  // Make sure the code is unique — try the base slug, then -2, -3, etc.
  let code = baseSlug;
  for (let n = 2; n < 50; n++) {
    const { data: existing } = await admin.from("items").select("id").eq("code", code).maybeSingle();
    if (!existing) break;
    code = `${baseSlug}-${n}`;
  }

  const { data, error } = await admin
    .from("items")
    .insert({
      code,
      name: name.trim(),
      program,
      program_code: programCode,
      new_price: manualPrice ? null : newPrice,
      used_price: manualPrice ? null : usedPrice,
      manual_price: !!manualPrice,
      requires_note: !!requiresNote,
      active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, item: data });
}
