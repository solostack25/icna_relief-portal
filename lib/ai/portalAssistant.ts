import { callAzureChat, type ChatMessage, AzureContentFilterError } from "./azureOpenAI";
import { PORTAL_ASSISTANT_TOOLS, executeTool } from "./tools";
import { getBrandGuidelinesPromptContext } from "@/lib/brandGuidelines";

const SYSTEM_PROMPT = `You are the Portal Assistant for the ICNA Relief USA Staff Portal. You help employees with quick IT/operational tasks: creating helpdesk tickets, placing phone calls, sending text messages, creating fliers (either from an existing template, or from scratch with no template needed), finding the right page in the portal, checking their own Help Desk tickets, looking up office hours/info, and finding upcoming volunteer events — using the tools available to you.

Guidelines:
- Always confirm details with the employee before calling a tool that takes action (creating a ticket, placing a call, sending a text, creating a flier) — don't call a tool on the very first message unless the request is already fully specified.
- Lookup tools (find_portal_page, list_my_helpdesk_tickets, get_office_info, list_upcoming_volunteer_events) don't need confirmation first — they're read-only, just call them directly when the employee asks.
- When an employee asks where to find something, or how to get to a part of the portal, use find_portal_page and give them the direct link — don't just describe where it might be.
- If a tool call returns an "ambiguous_target" error with candidates, list the candidate names and ask the employee to clarify, then call the tool again with the exact name they confirm.
- For fliers: if an existing template clearly fits, use create_flier_draft. If the employee says they don't want to use a template, or none fit, use create_flier_from_scratch instead of telling them it's not possible — it builds a full layout automatically.
- When writing any flier or text content, follow the brand guidelines below exactly — tone, approved terminology, and spelling/abbreviation conventions.
- Keep responses concise and professional. This is a work tool, not a general chatbot.
- If asked something genuinely outside your scope, say so plainly and suggest they use the relevant part of the portal directly.`;

const MAX_TOOL_ROUNDS = 5;

export async function runPortalAssistant(
  conversationHistory: { role: "user" | "assistant"; content: string }[],
  requesterEmail: string,
  requesterName: string,
  baseUrl: string
): Promise<string> {
  const brandGuidelines = await getBrandGuidelinesPromptContext();

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}\n\nThe employee you're talking to is ${requesterName} (${requesterEmail}). Use their own email as the requester for tickets, calls, texts, and flier drafts unless they specify someone else.${
        brandGuidelines ? `\n\n${brandGuidelines}` : ""
      }`,
    },
    ...conversationHistory.map((m): ChatMessage => ({ role: m.role, content: m.content })),
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let message: ChatMessage & { role: "assistant" };
    try {
      ({ message } = await callAzureChat(messages, PORTAL_ASSISTANT_TOOLS));
    } catch (err) {
      if (err instanceof AzureContentFilterError) {
        // This is Azure's Responsible AI content filter, not the model's
        // own judgment - it runs before the model sees anything and is
        // known to false-positive on entirely benign phrases (e.g.
        // "blood drive" reliably trips the violence category). Give the
        // employee something actionable rather than a raw error dump.
        return `Azure's content filter blocked that message${
          err.categories.length > 0 ? ` (flagged under: ${err.categories.join(", ")})` : ""
        } — this is usually a false positive on ordinary nonprofit-operations language (e.g. "blood drive" often trips it). Try rephrasing without that exact word — e.g. "blood donation drive" or just "donation drive" — and I'll try again. If it keeps happening on legitimate requests, an admin can request a modified content filter for this Azure OpenAI resource.`;
      }
      throw err;
    }

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content ?? "I wasn't able to come up with a response — try rephrasing that.";
    }

    // Record the assistant's tool-call request, then each tool's result,
    // then loop back so the model can react to what the tools returned.
    messages.push(message);

    for (const call of message.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        // leave args empty; the tool route will reject missing fields
      }
      const result = await executeTool(call.function.name, args, requesterEmail, baseUrl);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }

  return "That request took more steps than I could complete in one go — could you try breaking it into smaller pieces?";
}
