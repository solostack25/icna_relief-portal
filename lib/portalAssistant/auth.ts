import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type AccountInfo,
} from "@azure/msal-browser";
import { CopilotStudioClient } from "@microsoft/agents-copilotstudio-client";
import { getCopilotSettings, getMsalConfig, COPILOT_INVOKE_SCOPE } from "./config";

let msalInstance: PublicClientApplication | null = null;

/**
 * MSAL must be initialized exactly once before any token call. Next.js will re-run
 * module code on fast refresh, so this is memoized rather than run at module scope.
 */
async function getMsal(): Promise<PublicClientApplication> {
  if (!msalInstance) {
    msalInstance = new PublicClientApplication(getMsalConfig());
    await msalInstance.initialize();
    await msalInstance.handleRedirectPromise();
  }
  return msalInstance;
}

/**
 * Prefer the SDK's own scope derivation so this keeps working if Microsoft changes
 * the resource URI. Falls back to the documented constant if the helper isn't exported
 * in the installed version.
 */
function resolveScopes(): string[] {
  const helper = (
    CopilotStudioClient as unknown as {
      scopeFromSettings?: (s: ReturnType<typeof getCopilotSettings>) => string;
    }
  ).scopeFromSettings;

  if (typeof helper === "function") {
    try {
      return [helper(getCopilotSettings())];
    } catch {
      // fall through
    }
  }
  return [COPILOT_INVOKE_SCOPE];
}

export type TokenResult = {
  token: string;
  account: AccountInfo;
};

/**
 * Acquire a delegated token for Copilot Studio.
 *
 * Order of attempts:
 *   1. acquireTokenSilent against an already-cached account (instant, no UI)
 *   2. ssoSilent using the existing Entra session (no UI — this is the path that
 *      should hit for staff already signed into the portal via Azure AD SSO)
 *   3. loginPopup (visible, only when the first two can't work)
 *
 * `allowInteractive: false` stops before step 3, which is useful on first paint so
 * the assistant doesn't throw a popup at someone who never opened it.
 */
export async function acquireCopilotToken(
  opts: { allowInteractive?: boolean; loginHint?: string } = {}
): Promise<TokenResult> {
  const { allowInteractive = true, loginHint } = opts;
  const msal = await getMsal();
  const scopes = resolveScopes();

  const cached = msal.getAllAccounts();
  if (cached.length > 0) {
    try {
      const result = await msal.acquireTokenSilent({
        scopes,
        account: cached[0],
      });
      return { token: result.accessToken, account: result.account! };
    } catch (error) {
      if (!(error instanceof InteractionRequiredAuthError)) throw error;
    }
  }

  try {
    const result = await msal.ssoSilent({ scopes, loginHint });
    return { token: result.accessToken, account: result.account! };
  } catch (error) {
    if (!allowInteractive) throw error;
    if (!(error instanceof InteractionRequiredAuthError)) {
      // ssoSilent also fails when there are zero or multiple sessions, which is
      // recoverable by falling through to the popup.
      if (!(error instanceof Error)) throw error;
    }
  }

  const result = await msal.loginPopup({ scopes, loginHint });
  return { token: result.accessToken, account: result.account! };
}

export async function signOutCopilot(): Promise<void> {
  const msal = await getMsal();
  const account = msal.getAllAccounts()[0];
  if (account) {
    await msal.clearCache({ account });
  }
}
