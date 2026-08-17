import type { Configuration } from "@azure/msal-browser";
import type { ConnectionSettings } from "@microsoft/agents-copilotstudio-client";

/**
 * Copilot Studio connection settings for the Portal Assistant.
 *
 * environmentId / schemaName / tenantId come from:
 *   Copilot Studio -> Portal Assistant 2 -> Settings -> Advanced -> Metadata
 * appClientId is the Entra app registration's Application (client) ID.
 *
 * These are NEXT_PUBLIC_ because MSAL and the Copilot Studio client both run in
 * the browser. None are secrets: client and tenant IDs are public by design in
 * the SPA/PKCE flow, and the environment/schema names aren't credentials. There
 * is deliberately no client secret anywhere in this integration.
 *
 * Resolution is lazy so a missing variable surfaces as the assistant's error
 * state rather than an uncaught throw during module evaluation.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Portal Assistant is missing ${name}. Add it in Vercel project settings (or .env.local) and redeploy.`
    );
  }
  return value;
}

let cachedSettings: ConnectionSettings | null = null;

export function getCopilotSettings(): ConnectionSettings {
  if (cachedSettings) return cachedSettings;

  const schemaName = required(
    "NEXT_PUBLIC_COPILOT_SCHEMA_NAME",
    process.env.NEXT_PUBLIC_COPILOT_SCHEMA_NAME
  );

  cachedSettings = {
    environmentId: required(
      "NEXT_PUBLIC_COPILOT_ENVIRONMENT_ID",
      process.env.NEXT_PUBLIC_COPILOT_ENVIRONMENT_ID
    ),
    schemaName,
    // `agentIdentifier` is the deprecated name for the same value. Set both so
    // this keeps working across SDK versions.
    agentIdentifier: schemaName,
    tenantId: required(
      "NEXT_PUBLIC_COPILOT_TENANT_ID",
      process.env.NEXT_PUBLIC_COPILOT_TENANT_ID
    ),
    appClientId: required(
      "NEXT_PUBLIC_COPILOT_APP_CLIENT_ID",
      process.env.NEXT_PUBLIC_COPILOT_APP_CLIENT_ID
    ),
  } as ConnectionSettings;

  return cachedSettings;
}

/**
 * Delegated scope for invoking a Copilot Studio agent as the signed-in user.
 * Corresponds to the Power Platform API -> Copilot Studio ->
 * CopilotStudio.Copilots.Invoke delegated permission on the app registration.
 *
 * auth.ts prefers the SDK's own scope helper when available; this is the fallback.
 */
export const COPILOT_INVOKE_SCOPE =
  "https://api.powerplatform.com/CopilotStudio.Copilots.Invoke";

export function getMsalConfig(): Configuration {
  const settings = getCopilotSettings();

  return {
    auth: {
      clientId: settings.appClientId as string,
      authority: `https://login.microsoftonline.com/${settings.tenantId}`,
      // Must exactly match a redirect URI registered under the app
      // registration's "Single-page application" platform. Not "Web" — a Web
      // platform URI fails MSAL's silent flow with a CORS error.
      redirectUri:
        process.env.NEXT_PUBLIC_COPILOT_REDIRECT_URI ??
        (typeof window !== "undefined" ? window.location.origin : ""),
    },
    cache: {
      // sessionStorage scopes the token to the tab and clears it on close.
      // Switch to "localStorage" to have the assistant survive a tab reopen.
      cacheLocation: "sessionStorage",
    },
  };
}
