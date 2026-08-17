import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  BrowserAuthError,
  type AccountInfo,
  type AuthenticationResult,
} from "@azure/msal-browser";
import { CopilotStudioClient } from "@microsoft/agents-copilotstudio-client";
import { getCopilotSettings, getMsalConfig, COPILOT_INVOKE_SCOPE } from "./config";

/**
 * Redirect-based auth, not popup.
 *
 * A popup only survives if it opens synchronously from the user's click. Here
 * the interactive step is reached after two awaited calls (acquireTokenSilent,
 * then ssoSilent), by which point the browser no longer treats it as
 * user-initiated and blocks it — MSAL surfaces that as popup_window_error.
 *
 * Redirect has no window to block. The page navigates to Entra and returns to
 * the same URL, where handleRedirectPromise() completes the flow.
 */

let msalInstance: PublicClientApplication | null = null;
let redirectResult: AuthenticationResult | null = null;

const REDIRECT_FLAG = "portalAssistant.redirecting";

async function getMsal(): Promise<PublicClientApplication> {
  if (!msalInstance) {
    msalInstance = new PublicClientApplication(getMsalConfig());
    await msalInstance.initialize();
    // Completes a sign-in we started earlier. Returns null on a normal load.
    redirectResult = await msalInstance.handleRedirectPromise();
    if (redirectResult?.account) {
      msalInstance.setActiveAccount(redirectResult.account);
      sessionStorage.removeItem(REDIRECT_FLAG);
    }
  }
  return msalInstance;
}

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
      // fall through to the documented constant
    }
  }
  return [COPILOT_INVOKE_SCOPE];
}

export type TokenResult = { token: string; account: AccountInfo };

/**
 * True when we just came back from Entra, so the panel can reopen itself.
 */
export function returnedFromRedirect(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(REDIRECT_FLAG) === "1" || redirectResult !== null;
}

/**
 * Acquire a delegated token for Copilot Studio.
 *
 * 1. Token already in the MSAL cache — instant, no network.
 * 2. ssoSilent against the existing Entra session — no UI. This is the path
 *    that should hit for staff already signed into the portal.
 * 3. If allowInteractive, navigate to Entra. This does not return; the page
 *    reloads and getMsal() completes the flow on the way back.
 */
export async function acquireCopilotToken(
  opts: { allowInteractive?: boolean; loginHint?: string } = {}
): Promise<TokenResult> {
  const { allowInteractive = true, loginHint } = opts;
  const msal = await getMsal();
  const scopes = resolveScopes();

  if (redirectResult?.accessToken && redirectResult.account) {
    return { token: redirectResult.accessToken, account: redirectResult.account };
  }

  const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0];

  if (account) {
    try {
      const result = await msal.acquireTokenSilent({ scopes, account });
      return { token: result.accessToken, account: result.account ?? account };
    } catch (error) {
      if (!(error instanceof InteractionRequiredAuthError)) throw error;
    }
  }

  try {
    const result = await msal.ssoSilent({ scopes, loginHint });
    if (result.account) msal.setActiveAccount(result.account);
    return { token: result.accessToken, account: result.account! };
  } catch (error) {
    const recoverable =
      error instanceof InteractionRequiredAuthError ||
      error instanceof BrowserAuthError;
    if (!allowInteractive || !recoverable) throw error;
  }

  // Leaves the page. Nothing after this runs.
  sessionStorage.setItem(REDIRECT_FLAG, "1");
  await msal.acquireTokenRedirect({ scopes, loginHint, account: account ?? undefined });
  throw new Error("Redirecting to sign in…");
}

export async function signOutCopilot(): Promise<void> {
  const msal = await getMsal();
  const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0];
  if (account) await msal.clearCache({ account });
}
