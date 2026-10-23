import { getGraphToken } from "@/lib/msgraph";

// Graph calls for Device Management. Server-only.
//
// The BitLocker and LAPS endpoints require the ocp-client-name /
// ocp-client-version headers on every request; they're harmless on
// the others, so every call here sends them.

const CLIENT_HEADERS = { "ocp-client-name": "ICNA Relief Staff Portal", "ocp-client-version": "1.0" };

export class GraphError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Plain-English reason for the most common failures, naming the
// permission to grant where we know it.
export function explainGraphError(err: unknown, permission?: string): string {
  if (err instanceof GraphError) {
    if (err.status === 401 || err.status === 403) {
      return `Microsoft denied access (${err.status}).${permission ? ` Grant the "${permission}" application permission to the portal's app registration and admin-consent it.` : ""}`;
    }
    if (err.status === 404) return "Not found in Microsoft (it may have been deleted).";
    if (err.status === 429) return "Microsoft is rate-limiting requests. Try again in a minute.";
    return `Microsoft returned ${err.status}: ${err.message.slice(0, 300)}`;
  }
  return err instanceof Error ? err.message : "Unknown error";
}

async function call(method: string, url: string, token: string, body?: unknown, extra?: Record<string, string>) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url.startsWith("http") ? url : `https://graph.microsoft.com${url}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...CLIENT_HEADERS,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...extra,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    if (res.status === 429 || res.status === 503) {
      const wait = Math.min(Number(res.headers.get("Retry-After") ?? 2) * 1000, 10_000);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      let msg = await res.text();
      try {
        msg = JSON.parse(msg)?.error?.message ?? msg;
      } catch {}
      throw new GraphError(res.status, msg);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  throw new GraphError(429, "Too many retries");
}

export async function gGet(path: string, extra?: Record<string, string>) {
  return call("GET", path, await getGraphToken(), undefined, extra);
}

export async function gPost(path: string, body: unknown = {}) {
  return call("POST", path, await getGraphToken(), body);
}

export async function gPatch(path: string, body: unknown) {
  return call("PATCH", path, await getGraphToken(), body);
}

export async function gGetAll<T = any>(path: string, extra?: Record<string, string>): Promise<T[]> {
  const token = await getGraphToken();
  const out: T[] = [];
  let next: string | null = path;
  while (next) {
    const data: { value?: T[]; "@odata.nextLink"?: string } = await call("GET", next, token, undefined, extra);
    out.push(...(data?.value ?? []));
    next = data?.["@odata.nextLink"] ?? null;
  }
  return out;
}

// Graph JSON batching: up to 20 requests per call. Returns each
// sub-request's status by id. Throttled sub-requests are retried once.
export async function gBatch(
  requests: { id: string; method: "GET" | "PATCH" | "POST" | "DELETE"; url: string; body?: unknown }[]
): Promise<Map<string, { status: number; error?: string }>> {
  const token = await getGraphToken();
  const out = new Map<string, { status: number; error?: string }>();
  let pending = requests;
  for (let round = 0; round < 2 && pending.length; round++) {
    const retry: typeof requests = [];
    for (let i = 0; i < pending.length; i += 20) {
      const slice = pending.slice(i, i + 20);
      const data = await call("POST", "/v1.0/$batch", token, {
        requests: slice.map((r) => ({
          id: r.id,
          method: r.method,
          url: r.url,
          ...(r.body !== undefined ? { body: r.body, headers: { "Content-Type": "application/json" } } : {}),
        })),
      });
      for (const res of (data?.responses ?? []) as { id: string; status: number; body?: { error?: { message?: string } } }[]) {
        if (res.status === 429 && round === 0) {
          const orig = slice.find((r) => r.id === res.id);
          if (orig) retry.push(orig);
          continue;
        }
        out.set(res.id, { status: res.status, error: res.status >= 300 ? res.body?.error?.message ?? `HTTP ${res.status}` : undefined });
      }
    }
    if (retry.length) await new Promise((r) => setTimeout(r, 5000));
    pending = retry;
  }
  return out;
}
