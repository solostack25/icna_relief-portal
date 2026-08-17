import { getIntegrationSetting } from "@/lib/integrationSettings";

// ICNA's policy is Copilot-only for AI - so "AI Assist" features in
// the portal don't call Claude/OpenAI/etc. Instead they call an
// HTTP-triggered Copilot Studio flow (or a Power Automate flow that
// wraps a Copilot Studio agent), configured once in Admin > Connectors.
// The flow takes a prompt + context and returns generated content -
// what it does with that (which model, which grounding) is entirely
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
