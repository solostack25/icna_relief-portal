import { getIntegrationSetting } from "@/lib/integrationSettings";

const SQUARE_API_VERSION = "2026-07-15";
const SQUARE_BASE_URL = "https://connect.squareup.com/v2";

export async function getSquareAccessToken(): Promise<string | null> {
  return getIntegrationSetting("square_access_token", process.env.SQUARE_ACCESS_TOKEN);
}

export function isSquareConfigured(token: string | null): token is string {
  return !!token;
}

async function squareRequest(path: string, token: string, params?: Record<string, string>) {
  const url = new URL(`${SQUARE_BASE_URL}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": SQUARE_API_VERSION,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Square API ${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

export type SquareLocation = { id: string; name: string; status: string };

export async function listSquareLocations(token: string): Promise<SquareLocation[]> {
  const data = await squareRequest("/locations", token);
  return (data.locations ?? []).map((l: any) => ({ id: l.id, name: l.name, status: l.status }));
}

export type SquarePayment = {
  id: string;
  locationId: string | null;
  amount: number;
  currency: string;
  status: string;
  note: string | null;
  createdAt: string;
};

// Paginated per Square's List Payments endpoint (max 100/page). Pass
// beginTime to only fetch payments created since the last sync rather
// than re-pulling all history every run.
export async function listSquarePayments(token: string, beginTime: string): Promise<SquarePayment[]> {
  const payments: SquarePayment[] = [];
  let cursor: string | undefined;

  do {
    const params: Record<string, string> = { begin_time: beginTime, sort_order: "ASC", limit: "100" };
    if (cursor) params.cursor = cursor;

    const data = await squareRequest("/payments", token, params);
    for (const p of data.payments ?? []) {
      payments.push({
        id: p.id,
        locationId: p.location_id ?? null,
        amount: (p.amount_money?.amount ?? 0) / 100,
        currency: p.amount_money?.currency ?? "USD",
        status: p.status,
        note: p.note ?? null,
        createdAt: p.created_at,
      });
    }
    cursor = data.cursor;
  } while (cursor);

  return payments;
}
