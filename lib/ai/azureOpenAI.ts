import { getIntegrationSetting } from "@/lib/integrationSettings";

// Direct Azure OpenAI integration for the Portal Assistant.
//
// This replaced a Copilot Studio-based agent (see lib/copilotStudio.ts,
// which remains in place and still powers the separate "AI Assist"
// text-generation feature elsewhere in the portal). The Portal
// Assistant specifically needed dynamic tool-calling — creating
// helpdesk tickets, placing calls, sending texts — and Copilot
// Studio's tool-calling orchestrator requires an Agent 365 license
// ICNA's tenant doesn't have. Azure OpenAI is what Copilot Studio
// itself runs on under the hood, so this is a more direct path to the
// same underlying model, inside the same Azure/Microsoft compliance
// boundary, without the agent-identity licensing requirement.
//
// Settings are managed the same way as every other integration in
// this app: Admin > Connectors, DB-first with an env var fallback.

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type AzureConfig = {
  endpoint: string; // e.g. https://icna-portal-ai.openai.azure.com
  apiKey: string;
  deployment: string; // deployment name, not the underlying model name
  apiVersion: string;
};

async function getAzureConfig(): Promise<AzureConfig | null> {
  const endpoint = await getIntegrationSetting("azure_openai_endpoint", process.env.AZURE_OPENAI_ENDPOINT);
  const apiKey = await getIntegrationSetting("azure_openai_api_key", process.env.AZURE_OPENAI_API_KEY);
  const deployment = await getIntegrationSetting("azure_openai_deployment", process.env.AZURE_OPENAI_DEPLOYMENT);
  const apiVersion =
    (await getIntegrationSetting("azure_openai_api_version", process.env.AZURE_OPENAI_API_VERSION)) ??
    "2024-10-21";

  if (!endpoint || !apiKey || !deployment) return null;
  return { endpoint: endpoint.replace(/\/+$/, ""), apiKey, deployment, apiVersion };
}

export class AzureContentFilterError extends Error {
  categories: string[];
  constructor(categories: string[]) {
    super(
      categories.length > 0
        ? `Azure's content safety filter blocked this message under: ${categories.join(", ")}.`
        : "Azure's content safety filter blocked this message."
    );
    this.name = "AzureContentFilterError";
    this.categories = categories;
  }
}

// Azure OpenAI's built-in Responsible AI content filter runs BEFORE the
// model ever sees the prompt, and it's known to false-positive on
// entirely benign nonprofit-operations language - "blood drive" reliably
// trips the violence category, for example. This is Azure's filter, not
// a portal bug or the model's own judgment, and it can't be worked around
// in code; fixing it for good requires either avoiding trigger words or
// an org admin requesting Azure's "modified content filter" for this
// resource (a Microsoft-side application, for exactly this kind of
// false-positive-prone legitimate use case).
function parseContentFilterError(status: number, body: string): AzureContentFilterError | null {
  if (status !== 400) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }

  const code = parsed?.error?.code ?? parsed?.error?.innererror?.code;
  if (code !== "content_filter" && code !== "ResponsibleAIPolicyViolation") return null;

  const filterResult = parsed?.error?.innererror?.content_filter_result ?? parsed?.error?.content_filter_result ?? {};
  const flaggedCategories = Object.entries(filterResult)
    .filter(([, v]: [string, any]) => v?.filtered)
    .map(([category]) => category);

  return new AzureContentFilterError(flaggedCategories);
}

export type ChatCompletionResult = {
  message: ChatMessage & { role: "assistant" };
  finishReason: string;
};

/**
 * Single call to Azure OpenAI's chat completions endpoint. Tool-call
 * looping (executing tools and feeding results back) lives in
 * lib/ai/portalAssistant.ts — this function is intentionally just the
 * one HTTP call, so it stays easy to swap models or add streaming later.
 */
export async function callAzureChat(
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): Promise<ChatCompletionResult> {
  const config = await getAzureConfig();
  if (!config) {
    throw new Error(
      "Azure OpenAI isn't configured yet. Set endpoint, API key, and deployment name in Admin > Connectors."
    );
  }

  const url = `${config.endpoint}/openai/deployments/${config.deployment}/chat/completions?api-version=${config.apiVersion}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": config.apiKey,
    },
    body: JSON.stringify({
      messages,
      ...(tools && tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const contentFilterError = parseContentFilterError(res.status, errText);
    if (contentFilterError) throw contentFilterError;
    throw new Error(`Azure OpenAI request failed (${res.status}): ${errText || res.statusText}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error("Azure OpenAI returned no choices.");

  return {
    message: {
      role: "assistant",
      content: choice.message?.content ?? null,
      tool_calls: choice.message?.tool_calls,
    },
    finishReason: choice.finish_reason,
  };
}

/**
 * Image generation (DALL-E / gpt-image via Azure OpenAI), for the
 * "generate a flier image" capability. Separate deployment from chat
 * — image models are deployed independently in Azure OpenAI Studio.
 */
export async function generateImage(prompt: string, size: "1024x1024" | "1792x1024" | "1024x1792" = "1024x1024") {
  const endpoint = await getIntegrationSetting("azure_openai_endpoint", process.env.AZURE_OPENAI_ENDPOINT);
  const apiKey = await getIntegrationSetting("azure_openai_api_key", process.env.AZURE_OPENAI_API_KEY);
  const imageDeployment = await getIntegrationSetting(
    "azure_openai_image_deployment",
    process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT
  );
  const apiVersion =
    (await getIntegrationSetting("azure_openai_api_version", process.env.AZURE_OPENAI_API_VERSION)) ??
    "2024-10-21";

  if (!endpoint || !apiKey || !imageDeployment) {
    throw new Error(
      "Image generation isn't configured yet. Set 'azure_openai_image_deployment' in Admin > Connectors (deploy a DALL-E/gpt-image model in Azure OpenAI Studio first)."
    );
  }

  const url = `${endpoint.replace(/\/+$/, "")}/openai/deployments/${imageDeployment}/images/generations?api-version=${apiVersion}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({ prompt, size, n: 1 }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Image generation failed (${res.status}): ${errText || res.statusText}`);
  }

  const data = await res.json();
  const item = data.data?.[0];
  if (!item) throw new Error("Image generation returned no results.");
  // Azure returns either a URL (short-lived) or b64_json depending on config.
  return { url: item.url as string | undefined, b64: item.b64_json as string | undefined };
}

/**
 * Generates a flier background illustration and returns it as a
 * self-contained data: URI rather than a hosted link. Azure's image URLs
 * are short-lived (fine for a one-off download, not for something saved
 * permanently onto a flier record), so if only a URL comes back, this
 * downloads the bytes immediately and inlines them as base64 - avoiding
 * any dependency on external hosting (Dropbox/WordPress) for this asset.
 */
export async function generateFlierBackgroundDataUri(
  prompt: string,
  size: "1024x1024" | "1792x1024" | "1024x1792" = "1024x1024"
): Promise<string> {
  const { url, b64 } = await generateImage(prompt, size);

  if (b64) return `data:image/png;base64,${b64}`;

  if (url) {
    const imgRes = await fetch(url);
    if (!imgRes.ok) throw new Error(`Could not download the generated image (${imgRes.status})`);
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    return `data:image/png;base64,${buffer.toString("base64")}`;
  }

  throw new Error("Image generation returned neither a URL nor image data.");
}
