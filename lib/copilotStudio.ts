import { getIntegrationSetting } from "@/lib/integrationSettings";

// This still powers the "AI Assist" text-generation features (e.g.
// the email builder) via an HTTP-triggered Copilot Studio flow,
// configured in Admin > Connectors. It's a separate, independent
// integration from the Portal Assistant (see lib/ai/), which moved
// to calling Azure OpenAI directly after Copilot Studio's tool-calling
// orchestrator turned out to require an Agent 365 license this tenant
// doesn't have. Nothing wrong with AI Assist staying on Copilot Studio
// — it doesn't need tool-calling, just text generation, so it never
// hit that wall. What the flow does with the prompt (which model,
// Copilot Studio's business, kept outside this codebase on purpose.

export async function getCopilotStudioEndpoint(): Promise<{ url: string; apiKey: string | null } | null> {
  const url = await getIntegrationSetting("copilot_studio_endpoint_url");
  if (!url) return null;
  const apiKey = await getIntegrationSetting("copilot_studio_api_key");
  return { url, apiKey };
}

export async function callCopilotStudio(
  prompt: string,
  context?: Record<string, unknown>
): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
  const config = await getCopilotStudioEndpoint();
  if (!config) {
    return { ok: false, error: "AI Assist isn't connected yet. Add the Copilot Studio flow URL in Admin > Connectors first." };
  }

  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({ prompt, context: context ?? {} }),
    });

    if (!res.ok) {
      return { ok: false, error: `Copilot Studio flow returned ${res.status}: ${await res.text().catch(() => "")}` };
    }
    const data = await res.json();
    // Power Automate HTTP-response actions commonly return either a
    // raw string body or a JSON object - accept either shape here so
    // Travis doesn't have to fight the flow's output format to match
    // this exactly.
    const result = typeof data === "string" ? data : data.reply ?? data.result ?? data.text ?? data.output ?? JSON.stringify(data);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error calling Copilot Studio" };
  }
}
