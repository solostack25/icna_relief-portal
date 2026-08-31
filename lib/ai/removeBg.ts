import { getIntegrationSetting } from "@/lib/integrationSettings";

// Background removal, via remove.bg rather than Azure - Azure's Computer
// Vision Image Analysis 4.0 Segment API (the service that used to do this)
// was retired on March 31, 2025; Microsoft's own docs now point people to
// third-party alternatives. Same DB-first/env-fallback settings pattern as
// every other integration in this app (see lib/ai/azureOpenAI.ts), just a
// different provider - not everything has to run through Azure OpenAI.

export async function removeBackground(imageUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
  const apiKey = await getIntegrationSetting("removebg_api_key", process.env.REMOVEBG_API_KEY);
  if (!apiKey) {
    throw new Error(
      "Background removal isn't configured yet. Set 'removebg_api_key' in Admin > Connectors (sign up for a key at remove.bg/api)."
    );
  }

  const form = new FormData();
  form.append("image_url", imageUrl);
  form.append("size", "auto");

  const res = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": apiKey },
    body: form,
  });

  if (!res.ok) {
    // remove.bg returns JSON error bodies ({"errors":[{"title": "..."}]})
    // on failure, unlike its 200 response which is raw image bytes.
    const body = await res.text().catch(() => "");
    let message = `remove.bg request failed (${res.status})`;
    try {
      const parsed = JSON.parse(body);
      const title = parsed?.errors?.[0]?.title;
      if (title) message = title;
    } catch {
      if (body) message = body;
    }
    throw new Error(message);
  }

  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType: res.headers.get("content-type") ?? "image/png" };
}
