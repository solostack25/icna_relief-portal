import { Resend } from "resend";
import { getIntegrationSetting } from "@/lib/integrationSettings";

// DB-first (Connectors tab), falling back to RESEND_API_KEY /
// EMAIL_FROM env vars if nothing's been set in the UI yet - same
// pattern as every other connector in this codebase.
export async function getResendClient(): Promise<{ client: Resend; fromAddress: string } | null> {
  const apiKey = await getIntegrationSetting("resend_api_key", process.env.RESEND_API_KEY);
  const fromAddress = await getIntegrationSetting("resend_from_email", process.env.EMAIL_FROM);
  if (!apiKey || !fromAddress) return null;
  return { client: new Resend(apiKey), fromAddress };
}
