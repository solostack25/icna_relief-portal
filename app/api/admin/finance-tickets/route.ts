import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";

export async function GET() {
  const access = await getFinanceAdminAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("finance_tickets")
    .select(
      "id, ticket_number, title, category, total, status, priority, grant_eligible, submitted_at, created_at, technician_id, requestor:requestor_id(first_name, last_name, email), technician:technician_id(first_name, last_name)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tickets: data });
}
