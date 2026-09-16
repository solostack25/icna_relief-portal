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
            description: "Only used in 'poster' style: a short stock-photo search phrase for the full-bleed background, e.g. \"backpacks school supplies donation\". Ignored if illustrationPrompt is also provided. If neither is given or nothing is found, a solid brand-color background is used instead.",
          },
          illustrationPrompt: {
            type: "string",
            description: "Only used in 'poster' style, and only works if an image-generation model is configured (Admin → Connectors → Portal Assistant → Image Deployment). Describe the SUBJECT of a custom AI-illustrated background, e.g. \"backpacks and school supplies, community donation drive\" — this generates a real custom flat-illustration graphic in the brand colors instead of a stock photo. Never include any text/words you want rendered in the image itself; describe imagery only, since generated text in images is unreliable — all real text on the flier is added separately by the layout. If this isn't configured or fails, falls back to backgroundPhotoQuery or a solid color automatically.",
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
  {
    type: "function",
    function: {
      name: "find_portal_page",
      description:
        "Finds the right page in the portal for a topic (training, volunteer, help desk, transitional housing, fundraisers, client directory, employee directory, fliers, and more), including matching specific training courses by title. Use this whenever the employee asks where something is, how to get to it, or wants to be pointed to a resource. Always return the page name and URL so the employee can click through.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: 'What the employee is looking for, e.g. "MS365 training" or "how do I sign up to volunteer".' },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_my_helpdesk_tickets",
      description: "Lists the requester's own Help Desk tickets (the ones they submitted), most recent first. Defaults to open tickets only.",
      parameters: {
        type: "object",
        properties: {
          statusFilter: { type: "string", enum: ["open", "all"], description: "Defaults to 'open' if not specified." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_office_info",
      description:
        "Looks up an office's hours and any published info (pantry hours, health clinic hours, holiday schedule, etc.). If no office is given, defaults to the requester's own assigned office. If the office name is ambiguous, you'll get a list of candidates back - ask which one and call again with the exact name.",
      parameters: {
        type: "object",
        properties: {
          officeName: { type: "string", description: 'Office name, e.g. "Orlando" or "Orlando Office". Omit to use the requester\'s own office.' },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_upcoming_volunteer_events",
      description:
        "Lists upcoming published volunteer events with open spots. Defaults to the requester's own office unless they ask for a different office or for events everywhere.",
      parameters: {
        type: "object",
        properties: {
          officeName: { type: "string", description: "Filter to a specific office. Omit to use the requester's own office." },
          allOffices: { type: "boolean", description: "Set true if the employee explicitly wants events across every office, not just their own." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_employee_info",
      description:
        "Looks up an employee by name and returns their job title, department, office location, email, phone, and manager, pulled live from Active Directory - works for anyone in the org. If the person is a member of ICNA Relief's national executive leadership, also includes their public bio from the ICNA Relief website (this only exists for a handful of leadership roles like CEO/CSO - regular staff won't have one, which is normal, not an error). If the response is an ambiguous_target error, ask which person they meant and call again with the exact full name.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: 'Full or partial name of the employee to look up, e.g. "Amir Saeed".' },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_employee_availability",
      description:
        "Checks whether a coworker is currently busy or free on their calendar, and when they'll next be available today. Deliberately returns ONLY busy/free status and a time - never meeting titles, locations, or other details, out of respect for the coworker's privacy. Use this alongside find_employee_info whenever an employee asks who someone is (so you can mention their current availability too, the way Microsoft 365 Copilot does), or on its own when they ask if someone is free/available right now. If the response is an ambiguous_target error, ask which person they meant and call again with the exact full name.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: 'Full or partial name of the coworker to check, e.g. "Amir Saeed".' },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_my_finance_tickets",
      description:
        "Lists the requester's own Finance Tickets (reimbursements, utility payments, vendor payments, etc. they submitted), most recent first. Defaults to open (not yet paid/denied) tickets only.",
      parameters: {
        type: "object",
        properties: {
          statusFilter: { type: "string", enum: ["open", "all"], description: "Defaults to 'open' if not specified." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pay_utility_bill",
      description:
        "Pays one of the requester's OWN office's saved utility bills (set up in advance on the office dashboard's Utility Bills section) by submitting a real Finance Ticket for it, routed for approval exactly like submitting one by hand. Only works for utilities already saved for the requester's own assigned office - it can't pay an office's bill for someone who doesn't work there, and it can't pay a utility that hasn't been saved yet (point them to the office dashboard to add it first in that case). ALWAYS confirm the vendor and exact amount with the employee before calling this - it submits a real ticket. If the response is an ambiguous_target error, list the candidate vendor names and ask which one they meant.",
      parameters: {
        type: "object",
        properties: {
          utility: {
            type: "string",
            description: 'Which saved utility to pay - a vendor name ("Spectrum", "FPL") or a general type ("internet", "electric", "water", "trash", "security"). Matched against the office\'s saved utilities.',
          },
          amount: { type: "number", description: "The exact dollar amount due this billing period, as confirmed by the employee." },
        },
        required: ["utility", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_finance_approval_delegate",
      description:
        "Sets up someone to cover the requester's OWN finance ticket approvals while they're out - e.g. \"I'll be out next week, have Sarah cover my finance approvals.\" Applies automatically at every approval level, for every finance ticket category, the same as the admin-managed Temporary Coverage tool - this is the self-service version, and can ONLY set coverage for the requester's own approvals, never someone else's. ALWAYS confirm who's covering and the date range with the employee before calling this. If the response is an ambiguous_target error, list the candidate names and ask which one they meant.",
      parameters: {
        type: "object",
        properties: {
          delegateName: { type: "string", description: 'Full or partial name of the coworker who will cover approvals, e.g. "Sarah Khan".' },
          startsAt: { type: "string", description: "Start date, YYYY-MM-DD. Defaults to today if not specified." },
          endsAt: { type: "string", description: "End date, YYYY-MM-DD. Omit if the employee doesn't know yet or wants it to run until manually removed." },
          note: { type: "string", description: "Optional short note, e.g. reason for being out." },
        },
        required: ["delegateName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_finance_approval_delegate",
      description:
        "Cancels coverage the requester previously set up for their OWN finance ticket approvals (undoes set_finance_approval_delegate) - e.g. \"I'm back, remove Sarah's coverage.\" Can only remove the requester's own coverage arrangements, never someone else's. If they have more than one active arrangement, pass delegateName to narrow it down, or you'll get an ambiguous_target error listing the candidates.",
      parameters: {
        type: "object",
        properties: {
          delegateName: { type: "string", description: "Optional - narrows to a specific coverage arrangement if the employee has more than one on file." },
        },
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
  find_portal_page: "/api/copilot/portal/find-page",
  list_my_helpdesk_tickets: "/api/copilot/helpdesk/my-tickets",
  get_office_info: "/api/copilot/office/info",
  list_upcoming_volunteer_events: "/api/copilot/volunteer/upcoming-events",
  find_employee_info: "/api/copilot/directory/employee-info",
  get_employee_availability: "/api/copilot/directory/employee-availability",
  list_my_finance_tickets: "/api/copilot/finance/my-tickets",
  pay_utility_bill: "/api/copilot/finance/pay-utility",
  set_finance_approval_delegate: "/api/copilot/finance/set-delegate",
  remove_finance_approval_delegate: "/api/copilot/finance/remove-delegate",
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
