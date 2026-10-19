import { NextResponse } from "next/server";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";

// Finance team (admins + finance/IT help desk managers) only.
export async function financeGate(): Promise<{ employeeId: string } | NextResponse> {
  const a = await getFinanceAdminAccess();
  if (!a.ok) return NextResponse.json({ error: a.status === 401 ? "Sign in first" : "Finance team only" }, { status: a.status });
  return { employeeId: a.employeeId };
}
export const isResponse = (x: unknown): x is NextResponse => x instanceof NextResponse;
