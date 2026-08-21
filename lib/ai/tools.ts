import { getIntegrationSetting } from "@/lib/integrationSettings";
import type { ToolDefinition } from "./azureOpenAI";

// These tools call the SAME /api/copilot/* routes that were built for
// the Copilot Studio custom connector (see docs/copilot-connector-openapi.yaml).
// That's deliberate: requireCopilotAuth, lookupEmployeeByEmail, the 3CX
// integration, and resolveTargetByName all stay exactly as they were,
// tested and working. Only the orchestrator calling them changed — from
// Copilot Studio's topic engine to this app's own tool-calling loop.

export const PORTAL_ASSISTANT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "create_helpdesk_ticket",
      description:
        "Creates a new helpdesk ticket routed to the given department (IT, HR, Marketing, or Finance). Always confirm the details with the requester before calling this.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: 'Short summary of the issue or request, e.g. "New laptop needed - current one won\'t power on"',
          },
          description: {
            type: "string",
            description: "Additional detail beyond the title, if the requester provided any.",
          },
          department: {
            type: "string",
            enum: ["it", "hr", "marketing", "finance"],
            description: "Which department this ticket should route to.",
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high", "urgent"],
            description: "Defaults to normal if not specified.",
          },
          category: {
            type: "string",
            description: 'Optional free-text category, e.g. "Hardware", "Access Request".',
          },
        },
        required: ["title", "department"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "click_to_call",
      description:
        "Initiates a call from the requester's 3CX extension to a target. Provide either toNumber directly, or targetName to look up a contact/client by name. Always confirm who they want to call before calling this. If the response is an ambiguous_target error, ask the requester to clarify which person they meant and call again with the exact full name.",
      parameters: {
        type: "object",
        properties: {
          toNumber: { type: "string", description: "Phone number to call directly, if already known." },
          targetName: {
            type: "string",
            description: 'Full name of the contact or client to call, e.g. "Syed Rahman". Used to look up a phone number when toNumber isn\'t provided.',
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quick_sms",
      description:
        "Sends an SMS via Skyetel. Provide either toNumber directly, or targetName to look up a contact/client by name. Always confirm the message content and recipient before calling this. If the response is an ambiguous_target error, ask the requester to clarify which person they meant and call again with the exact full name.",
      parameters: {
        type: "object",
        properties: {
          toNumber: { type: "string", description: "Phone number to text directly, if already known." },
          targetName: {
            type: "string",
            description: 'Full name of the contact or client to text, e.g. "Fatima Khan". Used to look up a phone number when toNumber isn\'t provided.',
          },
          text: { type: "string", description: "Message body, max 1024 characters." },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_flier_draft",
      description:
        "Creates a draft flier from an existing template, filling in only the fields that template marks as editable (brand-locked elements like logo/colors/fonts can't be changed through this tool). Provide templateName to find the right template - if it's ambiguous or not found, you'll get a list of available template names/ids back; ask the employee which one they mean and call again with the exact name. Always confirm the flier's text content with the employee before calling this. Returns a reviewUrl the employee can open to see and finish the draft.",
      parameters: {
        type: "object",
        properties: {
          templateName: {
            type: "string",
            description: 'Name (or partial name) of the flier template to use, e.g. "Ramadan Food Drive".',
          },
          textValues: {
            type: "object",
            description:
              'Map of editable field label to the text you\'re filling in, e.g. {"headline": "Ramadan Food Drive 2026", "body": "Join us this Ramadan..."}. Only include fields the employee actually wants filled in - leave others out rather than guessing.',
          },
        },
        required: ["templateName", "textValues"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_flier_from_scratch",
      description:
        "Creates a brand-new flier with no existing template needed - builds a clean layout automatically using the brand colors/fonts/logo, and you supply the text content. Use this when the employee doesn't want to use one of the existing templates (create_flier_draft), or when nothing suitable exists. Two visual styles: 'simple' (white background, headline + body paragraph - good for text-heavy fliers) and 'poster' (full-bleed background photo or brand-color wash, bold title, stacked colored info badges like Time & Date / Location / Contact - good for event fliers, closer to a professionally designed poster). Write all text content yourself, following the brand voice and terminology guidelines exactly. Always confirm the wording, style, and format with the employee before calling this. Returns a reviewUrl where they can see it and make further adjustments in the builder.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "The flier's main headline." },
          style: {
            type: "string",
            enum: ["simple", "poster"],
            description: "Visual style. 'poster' looks much closer to a real designed event flier; 'simple' is a plain text-forward layout. Ask the employee which they'd prefer, or default to 'poster' for event fliers.",
          },
          subheadline: { type: "string", description: "For 'simple' style: a one-line date/time/location. For 'poster' style: a short subtitle line under the headline (e.g. \"Backpack & Supplies Pick Up\")." },
          bodyText: { type: "string", description: "Supporting paragraph text. Only used in 'simple' style." },
          infoBlocks: {
            type: "array",
            description: "Only used in 'poster' style: up to 4 labeled info badges, e.g. [{\"label\": \"Time & Date\", \"value\": \"Saturday, Aug 22 · 1-4 PM\"}, {\"label\": \"Location\", \"value\": \"NRG Center, Houston\"}, {\"label\": \"Contact\", \"value\": \"(866) 354-0102\"}].",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "string" },
              },
              required: ["label", "value"],
            },
          },
          backgroundPhotoQuery: {
            type: "string",
            description: "Only used in 'poster' style: a short stock-photo search phrase for the full-bleed background, e.g. \"backpacks school supplies donation\". If omitted or no photo is found, a solid brand-color background is used instead.",
          },
          footerText: { type: "string", description: "Optional footer/contact line - defaults to ICNA Relief's standard contact info if omitted." },
          format: {
            type: "string",
            enum: ["square", "vertical", "landscape", "story"],
            description: "Aspect ratio/format. Defaults to vertical (good for print and Instagram/Facebook posts) if not specified.",
          },
        },
        required: ["title"],
      },
    },
  },
];

const TOOL_ROUTES: Record<string, string> = {
  create_helpdesk_ticket: "/api/copilot/helpdesk/create-ticket",
  click_to_call: "/api/copilot/calling/click-to-call",
  quick_sms: "/api/copilot/calling/quick-sms",
  create_flier_draft: "/api/copilot/marketing/create-flier-draft",
  create_flier_from_scratch: "/api/copilot/marketing/create-flier-from-scratch",
};

/**
 * Executes a tool call by hitting this same app's existing /api/copilot/*
 * route, server-to-server, with the shared API key — same as Copilot
 * Studio's custom connector did. requesterEmail is injected here rather
 * than trusted from the model, since it comes from the authenticated
 * portal session, not from anything the user typed.
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  requesterEmail: string,
  baseUrl: string
): Promise<string> {
  const route = TOOL_ROUTES[toolName];
  if (!route) return JSON.stringify({ error: `Unknown tool: ${toolName}` });

  const apiKey = await getIntegrationSetting("copilot_api_key");
  if (!apiKey) {
    return JSON.stringify({
      error: "Copilot Actions API key isn't configured. Set 'copilot_api_key' in Admin > Connectors.",
    });
  }

  try {
    const res = await fetch(`${baseUrl}${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Copilot-Api-Key": apiKey,
      },
      body: JSON.stringify({ requesterEmail, ...args }),
    });

    const data = await res.json().catch(() => ({}));
    // Pass the response through as-is (including error shapes like
    // ambiguous_target with candidates) — the model reads this JSON
    // directly and is instructed to react to error fields like
    // "ambiguous_target" in the tool description above.
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : "Tool call failed unexpectedly." });
  }
}
