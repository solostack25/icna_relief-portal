import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getInkindAccess } from "@/lib/inkind/access";

// Exports the current active catalog in the exact shape
// barcode_gen/generate_sheet.py (and lib/items.ts's old static file)
// expect, so it can be dropped in as data/items.json to reprint the
// barcode sheet after catalog changes.
export async function GET() {
  const access = await getInkindAccess();
  if (!access.ok) {
    return NextResponse.json({ error: "Not authorized" }, { status: access.status });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("items")
    .select("code, name, program, program_code, new_price, used_price, manual_price")
    .eq("active", true)
    .order("program")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  type ItemRow = {
    code: string;
    name: string;
    program: string;
    program_code: string;
    new_price: number | null;
    used_price: number | null;
    manual_price: boolean;
  };

  const exported = ((data ?? []) as ItemRow[]).map((r) => ({
    code: r.code,
    name: r.name,
    program: r.program,
    programCode: r.program_code,
    newPrice: r.new_price,
    usedPrice: r.used_price,
    manualPrice: r.manual_price,
  }));

  return new NextResponse(JSON.stringify(exported, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="items.json"`,
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
