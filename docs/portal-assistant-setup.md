# Portal Assistant — setup

A custom-branded chat panel on `/select-app` that talks to the **Portal Assistant 2**
agent in Copilot Studio, with all three tools (`CreateHelpdeskTicket`, `ClickToCall`,
`QuickSms`) working as they do in Preview chat.

No Power Automate. No HTTP-trigger flow. No shared header secret.

---

## 1. Install

```bash
npm install @azure/msal-browser @microsoft/agents-copilotstudio-client botframework-webchat
```

## 2. Configure Copilot Studio

In **Portal Assistant 2**:

- **Settings → Security → Authentication** → select **Authenticate with Microsoft**.
  This is what gives you silent SSO instead of a copy-paste magic code. It also hides
  the no-code iframe embed option, which we aren't using.
- **Settings → Advanced → Metadata** → copy **Environment ID**, **Tenant ID**, **Schema name**.
- **Publish** the agent. Nothing works over any channel until it's published.

## 3. Configure the Entra app registration

Reuse the portal's existing Azure AD SSO registration, or create a new one.

- **API permissions → Add a permission → APIs my organization uses →
  Power Platform API → Delegated permissions → Copilot Studio →
  `CopilotStudio.Copilots.Invoke`** → Add → **Grant admin consent**.
- **Authentication → Add a platform → Single-page application.**
  Add `http://localhost:3000` and `https://icna-relief-portal.vercel.app`.

  This must be the **SPA** platform, not **Web**. A Web-platform redirect URI will
  fail MSAL's silent flow with a CORS error that reads like a network problem.

- No client secret. No certificate. The SPA/PKCE flow doesn't use one.

## 4. Environment variables

Copy `.env.local.example` to `.env.local`, fill in the four values, restart.

Add the same four to Vercel → project `prj_Ky9ebkN07sWLe1fGCUlEcRGxmhFW` →
Settings → Environment Variables, for Production and Preview.

## 5. Drop it in

In your `/select-app` page (or the layout that wraps it):

```tsx
import PortalAssistantLauncher from "@/components/PortalAssistant/PortalAssistantLauncher";

// ...inside the component, where `employee` is your existing session record:
<PortalAssistantLauncher loginHint={employee.email} />
```

`loginHint` is optional but worth passing — it lets MSAL skip the account picker for
staff who have more than one Microsoft account in the browser.

---

## Theming

Every color in the panel reads from a CSS variable with a fallback, so you can retheme
without touching the component. Set these on a parent element or in your globals:

```css
:root {
  --pa-accent: #1f5fa8;
  --pa-surface: #ffffff;
  --pa-border: #e1e6ed;
  --pa-heading: #16202e;
  --pa-muted: #5d6b7d;
  --pa-danger: #a4262c;
  --pa-bot-bubble: #f1f4f9;
  --pa-bot-text: #16202e;
  --pa-user-bubble: #1f5fa8;
  --pa-user-text: #ffffff;
  --pa-sendbox-bg: #ffffff;
  --pa-sendbox-text: #16202e;
  --pa-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
```

For the IT-only quest-themed sections, scope an override block with the purple/neon
values rather than forking the component.

---

## Known gotchas

**React version.** `botframework-webchat` v4's published peer range is old (it still
lists React 16.8.6). It runs fine on React 18, but npm may complain on install. If it
does, `npm install --legacy-peer-deps` rather than downgrading React.

**SSR.** WebChat reads `window` at import time. `PortalAssistantLauncher` already loads
the panel through `next/dynamic` with `ssr: false`. If you import
`PortalAssistantPanel` anywhere directly, wrap it the same way or the build breaks.

**Token lifetime.** Access tokens expire in about an hour. `acquireCopilotToken` refreshes
silently on the next connect, but an already-open panel holds the token it started with.
For long sessions, either have the user close and reopen the panel, or add a refresh
timer that rebuilds the connection.

**Which agent.** Point this at **Portal Assistant 2**. The original `Portal Assistant`
is the broken/deprecated one and is safe to delete once this is confirmed working.

---

## Cleanup once this works

- Delete the `Portal Assistant Chat` flow (workflow ID `86a7d55e2ed94228b64abe59473849dc`)
- Retire the `X-Portal-Chat-Key: pac-9f2k7x-secret` header secret
- Delete the old `Portal Assistant` agent
- Close the two test helpdesk tickets in Admin → Help Desk
  (`4fc890a4-dea8-4470-81ff-3d04f091a977`, `b4a0d4e3-3cd0-4da5-97a2-76f3df4a213f`)

Keep the AI Assist flow. That one's one-shot generation, well inside the 100-second
limit, and already working.

## Still worth doing

Rotate the GitHub fine-grained PAT that was pasted into chat, if you haven't yet.
