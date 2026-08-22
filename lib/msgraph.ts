// Microsoft Graph client-credentials helper — app-only auth, used
// server-side only (AD role sync, first-login provisioning).
// Requires AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET env vars.

// Microsoft Graph client-credentials helper — app-only auth, used
// server-side only (AD role sync, first-login provisioning).
// Requires AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET env vars.
//
// Deliberately NOT caching the token across invocations — a warm
// serverless function could otherwise keep serving a token issued
// before a permission change (e.g. newly granted admin consent),
// which would silently keep failing even after the fix is in place.
// Each call gets a guaranteed-fresh token; the cost is negligible.

export async function getGraphToken(): Promise<string> {
  const tenantId = process.env.AZURE_TENANT_ID!;
  const clientId = process.env.AZURE_CLIENT_ID!;
  const clientSecret = process.env.AZURE_CLIENT_SECRET!;

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to get Graph token: ${await res.text()}`);
  }

  const data = await res.json();
  return data.access_token;
}

export async function graphGet(path: string) {
  const token = await getGraphToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Graph GET ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function graphPost(path: string, body: unknown) {
  const token = await getGraphToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Graph POST ${path} failed: ${res.status} ${await res.text()}`);
  }
  // Some POSTs (e.g. assignLicense) return a body; user creation does too. A
  // 204 has none.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function graphPatch(path: string, body: unknown) {
  const token = await getGraphToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Graph PATCH ${path} failed: ${res.status} ${await res.text()}`);
  }
}
export async function graphGetAll(path: string) {
  let results: any[] = [];
  let next: string | null = `https://graph.microsoft.com${path}`;
  const token = await getGraphToken();

  while (next) {
    const res: Response = await fetch(next, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Graph GET ${next} failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    results = results.concat(data.value ?? []);
    next = data["@odata.nextLink"] ?? null;
  }

  return results;
}

// Sends an email as a specific mailbox (app-only -- requires the
// Mail.Send Application permission on the "Portal" app registration,
// granted + admin-consented in Entra ID, same as Sites.Selected was
// for the SharePoint import. NOT granted as of this writing -- calls
// here will 403 until that's done. Depending on the tenant's Exchange
// Online configuration, an Application Access Policy may also be
// needed to scope which mailboxes the app is allowed to send as,
// rather than every mailbox in the org.
export async function sendMailAs(params: {
  fromMailbox: string;
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  const token = await getGraphToken();
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(params.fromMailbox)}/sendMail`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: params.subject,
          body: { contentType: "Text", content: params.body },
          toRecipients: [{ emailAddress: { address: params.to } }],
        },
        saveToSentItems: true,
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Graph sendMail failed: ${res.status} ${await res.text()}`);
  }
}

// ---------- Employee onboarding: create the real AD/Entra account ----------
//
// Requires the "Portal" app registration to have the User.ReadWrite.All
// (create/update users) and Organization.Read.All (list license SKUs)
// Application permissions granted + admin-consented in Entra ID — NOT
// granted as of this writing, same situation sendMailAs was in. Calls
// here will 403 until that's done.

// AD password complexity requires 3 of: upper, lower, digit, symbol.
// This always includes all 4 classes and 16 chars total, comfortably over
// any tenant's minimum-complexity policy. Shown once to the person doing
// onboarding (forceChangePasswordNextSignIn means the employee sets their
// own real password at first login regardless).
export function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O, avoids visual ambiguity
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const all = upper + lower + digits + symbols;

  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const rest = Array.from({ length: 12 }, () => pick(all));
  const combined = [...required, ...rest];

  // Shuffle so the required-class characters aren't always in the same
  // positions (Fisher-Yates).
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }
  return combined.join("");
}

export type CreateAdUserParams = {
  firstName: string;
  lastName: string;
  email: string; // becomes both userPrincipalName and mail nickname source
  jobTitle?: string;
  department?: string;
  officeLocation?: string;
  usageLocation?: string; // ISO 3166-1 alpha-2, required before any license can be assigned
};

export type CreateAdUserResult = { id: string; userPrincipalName: string; tempPassword: string };

export async function createAdUser(params: CreateAdUserParams): Promise<CreateAdUserResult> {
  const tempPassword = generateTempPassword();
  const mailNickname = params.email.split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "");

  const body: Record<string, unknown> = {
    accountEnabled: true,
    displayName: `${params.firstName} ${params.lastName}`,
    givenName: params.firstName,
    surname: params.lastName,
    mailNickname,
    userPrincipalName: params.email,
    usageLocation: params.usageLocation ?? "US",
    passwordProfile: {
      password: tempPassword,
      forceChangePasswordNextSignIn: true,
    },
  };
  if (params.jobTitle) body.jobTitle = params.jobTitle;
  if (params.department) body.department = params.department;
  if (params.officeLocation) body.officeLocation = params.officeLocation;

  const created = await graphPost("/users", body);
  return { id: created.id, userPrincipalName: created.userPrincipalName, tempPassword };
}

// Human-readable names for common Microsoft 365 SKU part numbers -
// Graph's /subscribedSkus only returns the raw part number (e.g.
// "SPE_E3"), not a friendly label. Not exhaustive; falls back to the raw
// part number for anything not in this map rather than guessing.
const SKU_FRIENDLY_NAMES: Record<string, string> = {
  SPE_E3: "Microsoft 365 E3",
  SPE_E5: "Microsoft 365 E5",
  SPB: "Microsoft 365 Business Premium",
  O365_BUSINESS_ESSENTIALS: "Microsoft 365 Business Basic",
  O365_BUSINESS_PREMIUM: "Microsoft 365 Business Standard",
  ENTERPRISEPACK: "Office 365 E3",
  ENTERPRISEPREMIUM: "Office 365 E5",
  STANDARDPACK: "Office 365 E1",
  EXCHANGESTANDARD: "Exchange Online (Plan 1)",
  EXCHANGEENTERPRISE: "Exchange Online (Plan 2)",
  MCOPSTN1: "Microsoft Teams Domestic Calling Plan",
  MCOPSTN2: "Microsoft Teams International Calling Plan",
  TEAMS_COMMERCIAL_TRIAL: "Microsoft Teams (trial)",
  POWER_BI_STANDARD: "Power BI (free)",
  POWER_BI_PRO: "Power BI Pro",
};

export type AvailableLicense = {
  skuId: string;
  skuPartNumber: string;
  friendlyName: string;
  availableUnits: number;
};

export async function listAvailableLicenses(): Promise<AvailableLicense[]> {
  const data = await graphGet("/subscribedSkus");
  return (data.value ?? [])
    .map((sku: any) => ({
      skuId: sku.skuId,
      skuPartNumber: sku.skuPartNumber,
      friendlyName: SKU_FRIENDLY_NAMES[sku.skuPartNumber] ?? sku.skuPartNumber,
      availableUnits: (sku.prepaidUnits?.enabled ?? 0) - (sku.consumedUnits ?? 0),
    }))
    // Only show SKUs that actually have a seat free - assigning from an
    // exhausted SKU would just fail, and cluttering the picker with
    // unusable options isn't helpful.
    .filter((s: AvailableLicense) => s.availableUnits > 0);
}

export async function assignLicense(userId: string, skuId: string): Promise<void> {
  await graphPost(`/users/${encodeURIComponent(userId)}/assignLicense`, {
    addLicenses: [{ skuId }],
    removeLicenses: [],
  });
}

// ============================================================
// Directory read/write — general Entra user editing, independent of
// portal employee provisioning. Used by /admin/entra-directory.
// ============================================================

export type EntraUser = {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
  jobTitle: string | null;
  department: string | null;
  officeLocation: string | null;
  managerId: string | null;
  managerDisplayName: string | null;
};

// Paged fetch of every user in the tenant, filtered to real
// @icnarelief.org accounts with sign-in enabled. Shared mailboxes are
// still Entra "user" objects (Graph has no isSharedMailbox flag on
// /users), so accountEnabled eq true is the best available proxy - it
// won't catch a shared mailbox that was left enabled. endswith()
// requires the ConsistencyLevel: eventual header and $count=true
// (advanced query support).
//
// Manager can't be $expand-ed on the same request as this filter -
// Graph rejects endswith() combined with $expand=manager unless
// $levels is set inside the expand, which isn't what we want here. So
// this fetches the filtered list first, then resolves manager for all
// of them via Graph's $batch endpoint (up to 20 sub-requests per
// batch) instead of one request per user - keeps a ~300-person tenant
// to about 15 extra calls instead of 300.
export async function listAllUsers(): Promise<EntraUser[]> {
  const select = "id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation";
  const filter = "accountEnabled eq true and endswith(mail,'@icnarelief.org')";
  const path = `/v1.0/users?$select=${select}&$filter=${encodeURIComponent(filter)}&$count=true&$top=999`;

  const token = await getGraphToken();
  let raw: any[] = [];
  let next: string | null = `https://graph.microsoft.com${path}`;

  while (next) {
    const res: Response = await fetch(next, {
      headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" },
    });
    if (!res.ok) {
      throw new Error(`Graph GET ${next} failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    raw = raw.concat(data.value ?? []);
    next = data["@odata.nextLink"] ?? null;
  }

  const managers = await batchGetManagers(raw.map((u) => u.id));

  return raw.map((u: any) => ({
    id: u.id,
    displayName: u.displayName,
    mail: u.mail,
    userPrincipalName: u.userPrincipalName,
    jobTitle: u.jobTitle ?? null,
    department: u.department ?? null,
    officeLocation: u.officeLocation ?? null,
    managerId: managers[u.id]?.id ?? null,
    managerDisplayName: managers[u.id]?.displayName ?? null,
  }));
}

// Resolves manager for many users via Graph's $batch endpoint (max 20
// sub-requests per batch, run sequentially to stay well under
// throttling limits). A user with no manager set returns 404 on
// /manager, which is expected and just means "no manager" - not
// treated as an error.
async function batchGetManagers(userIds: string[]): Promise<Record<string, { id: string; displayName: string } | null>> {
  const token = await getGraphToken();
  const result: Record<string, { id: string; displayName: string } | null> = {};

  for (let i = 0; i < userIds.length; i += 20) {
    const chunk = userIds.slice(i, i + 20);
    const res = await fetch("https://graph.microsoft.com/v1.0/$batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: chunk.map((id) => ({
          id,
          method: "GET",
          url: `/users/${id}/manager?$select=id,displayName`,
        })),
      }),
    });
    if (!res.ok) {
      throw new Error(`Graph $batch manager lookup failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    for (const r of data.responses ?? []) {
      result[r.id] = r.status === 200 ? { id: r.body.id, displayName: r.body.displayName } : null;
    }
  }

  return result;
}

export type UpdateAdUserParams = {
  jobTitle?: string | null;
  department?: string | null;
  officeLocation?: string | null;
};

// Only sends fields that are actually being changed (undefined = leave
// alone). Passing null explicitly clears the field in Entra.
export async function updateAdUser(userId: string, params: UpdateAdUserParams): Promise<void> {
  const body: Record<string, unknown> = {};
  if (params.jobTitle !== undefined) body.jobTitle = params.jobTitle;
  if (params.department !== undefined) body.department = params.department;
  if (params.officeLocation !== undefined) body.officeLocation = params.officeLocation;
  if (Object.keys(body).length === 0) return;
  await graphPatch(`/users/${encodeURIComponent(userId)}`, body);
}

// Manager is a relationship, not a plain property - Graph requires a
// separate $ref call rather than a field in the PATCH body above.
export async function setAdUserManager(userId: string, managerId: string): Promise<void> {
  const token = await getGraphToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/manager/$ref`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ "@odata.id": `https://graph.microsoft.com/v1.0/users/${managerId}` }),
  });
  if (!res.ok) {
    throw new Error(`Graph PUT manager/$ref failed: ${res.status} ${await res.text()}`);
  }
}
