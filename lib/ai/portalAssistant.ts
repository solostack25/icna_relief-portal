import { callAzureChat, type ChatMessage } from "./azureOpenAI";
import { PORTAL_ASSISTANT_TOOLS, executeTool } from "./tools";

const SYSTEM_PROMPT = `You are the Portal Assistant for the ICNA Relief USA Staff Portal. You help employees with quick IT/operational tasks: creating helpdesk tickets, placing phone calls, and sending text messages, using the tools available to you.

Guidelines:
- Always confirm details with the employee before calling a tool that takes action (creating a ticket, placing a call, sending a text) — don't call a tool on the very first message unless the request is already fully specified.
- If a tool call returns an "ambiguous_target" error with candidates, list the candidate names and ask the employee to clarify, then call the tool again with the exact name they confirm.
- Keep responses concise and professional. This is a work tool, not a general chatbot.
- If asked something outside your scope (tickets, calls, texts), say so plainly and suggest they use the relevant part of the portal directly.`;

const MAX_TOOL_ROUNDS = 5;

export async function runPortalAssistant(
  conversationHistory: { role: "user" | "assistant"; content: string }[],
  requesterEmail: string,
  requesterName: string,
  baseUrl: string
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\nThe employee you're talking to is ${requesterName} (${requesterEmail}). Use their own email as the requester for tickets, calls, and texts unless they specify someone else.` },
    ...conversationHistory.map((m): ChatMessage => ({ role: m.role, content: m.content })),
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { message } = await callAzureChat(messages, PORTAL_ASSISTANT_TOOLS);

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
