import { getIntegrationSetting } from "@/lib/integrationSettings";

// Thin client over the CharityStack Public API. Reads the API key from
// integration_settings (see app/admin/connectors) at call time rather
// than a static env var, so dropping the key in via the admin UI works
// immediately with no redeploy — see the "connectors" pattern used by
// every other integration in this portal (Dropbox, Resend, Skyetel...).
//
// Deliberately thin: we only wrap the endpoints this portal actually
// calls (forms). Payments/contacts lookups (for the future "view donor
// detail live, don't store it" screen) are not implemented yet pending
// their exact query-param/pagination shape from CharityStack's docs.

const CHARITYSTACK_BASE_URL = "https://0k90mc4jjj.execute-api.us-east-2.amazonaws.com/v1";

export class CharityStackNotConfiguredError extends Error {
  constructor() {
    super("CharityStack API key is not configured. Add it under Admin → Connectors.");
    this.name = "CharityStackNotConfiguredError";
  }
}

export class CharityStackApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`CharityStack API error (${status}): ${JSON.stringify(body)}`);
    this.name = "CharityStackApiError";
    this.status = status;
    this.body = body;
  }
}

async function getApiKey(): Promise<string> {
  const key = await getIntegrationSetting("charitystack_api_key");
  if (!key) throw new CharityStackNotConfiguredError();
  return key;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = await getApiKey();

  const res = await fetch(`${CHARITYSTACK_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new CharityStackApiError(res.status, body);
  }

  return body as T;
}

// ---------- Forms ----------

export type CharityStackGivingLevel = {
  name: string;
  amount: number;
  description?: string;
};

export type CharityStackSponsorshipGroup = {
  name: string;
  options: { name: string; amount: number }[];
};

export type CharityStackTicket = {
  name: string;
  amount: number;
  type?: "INDIVIDUAL" | "GROUP";
  groupSize?: number;
  quantityLimit?: number;
};

export type CreateFormInput = {
  title: string;
  funds: string[];
  formType?: "fundraising" | "event";
  amountType?: "standard" | "giving_level" | "sponsorship";
  frequencies?: string[];
  color?: string;
  active?: boolean;
  description?: string;
  headerImage?: string;
  enableFundraisingBar?: boolean;
  goal?: number;
  givingLevels?: CharityStackGivingLevel[];
  sponsorshipGroups?: CharityStackSponsorshipGroup[];
  tickets?: CharityStackTicket[];
  enableTimeAndLocation?: boolean;
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  eventDetails?: string;
  timeZone?: string;
};

export type CreateFormResponse = {
  formID: string;
  formUrl: string;
  embedHTML: string;
  message: string;
};

export async function createForm(input: CreateFormInput): Promise<CreateFormResponse> {
  return request<CreateFormResponse>("/forms", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type CharityStackFormSummary = {
  formID: string;
  formUrl: string;
  title: string;
  description?: string;
  formType: string;
  funds: string[];
  frequencies: string[];
  color: string;
  headerImage?: string;
  active: boolean;
  goal?: number;
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
};

export async function listForms(): Promise<{ forms: CharityStackFormSummary[] }> {
  return request("/forms");
}

export async function getForm(formId: string): Promise<CharityStackFormSummary & Record<string, unknown>> {
  return request(`/forms/${encodeURIComponent(formId)}`);
}

export async function updateForm(
  formId: string,
  patch: Partial<CreateFormInput>
): Promise<CreateFormResponse> {
  return request(`/forms/${encodeURIComponent(formId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteForm(formId: string): Promise<{ message: string }> {
  return request(`/forms/${encodeURIComponent(formId)}`, { method: "DELETE" });
}

// ---------- Webhooks ----------

export async function registerWebhook(url: string, events: string[], description?: string) {
  return request<{ webhookId: string; secret: string }>("/webhooks", {
    method: "POST",
    body: JSON.stringify({ url, events, description }),
  });
}

export async function isConfigured(): Promise<boolean> {
  const key = await getIntegrationSetting("charitystack_api_key");
  return !!key;
}
