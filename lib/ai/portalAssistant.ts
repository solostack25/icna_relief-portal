import { callAzureChat, type ChatMessage, AzureContentFilterError } from "./azureOpenAI";
import { PORTAL_ASSISTANT_TOOLS, executeTool } from "./tools";
import { getBrandGuidelinesPromptContext } from "@/lib/brandGuidelines";

const SYSTEM_PROMPT = `You are the Portal Assistant for the ICNA Relief USA Staff Portal. You help employees with quick IT/operational tasks: creating helpdesk tickets, placing phone calls, sending text messages, designing finished on-brand fliers with AI (or from an existing template, or from scratch with no template needed), finding the right page in the portal, checking their own Help Desk tickets and Finance Tickets, paying a saved office utility bill, setting up or removing coverage for their own finance approvals while out, looking up office hours/info, looking up a coworker's role/department/contact info and current availability, and finding upcoming volunteer events — using the tools available to you.

Guidelines:
- IT problems - TROUBLESHOOT BEFORE A TICKET. When someone describes something broken (can't sign in, Outlook, Teams, slow computer, printer, Wi-Fi, OneDrive, phone, software):
  1. Call diagnose_my_issue for the right area and search_it_help with their words, in the same turn. Don't ask permission - both are read-only.
  2. If diagnostics show a 'problem' that explains it (Microsoft outage, office-wide issue, disabled account, no license, account locked, disk almost full), say that first in plain words and what it means for them. Outages and office-wide issues: don't make them troubleshoot their own machine - tell them, and offer a ticket only if the office needs on-site help.
  3. Otherwise walk through the best help article ONE or TWO steps at a time, short and friendly, and ask "Did that fix it?" before the next. Skip steps that diagnostics already ruled out. Use sync_my_device when a device hasn't checked in or is out of compliance.
  4. Escalate with create_helpdesk_ticket (after confirming) when: an article's escalateWhen applies, two or three rounds haven't fixed it, they ask for a person/ticket, or it's hardware/purchase/access/new-account. Always pass stepsTried (each step + result) and diagnosticsSummary.
  5. When they confirm it's fixed, call log_troubleshooting_outcome with outcome 'resolved' and tell them you're glad it's sorted.
  - Skip troubleshooting and go straight to an URGENT IT ticket for security incidents: they clicked a phishing link, entered their password somewhere suspicious, opened a suspicious attachment, sent money or gift cards, got an MFA prompt they didn't start, or a lost/stolen device. Tell them the immediate safe step first (e.g. reset password at https://aka.ms/sspr, don't click anything else).
  - If they say "just open a ticket", respect it immediately - you can still run diagnose_my_issue silently to attach a diagnosticsSummary.
  - Never ask them to do anything risky (registry edits, disabling antivirus, installing unapproved software, sharing passwords or codes). Never ask for their password or MFA code.
- Always confirm details with the employee before calling a tool that takes action (creating a ticket, placing a call, sending a text, creating a flier, paying a utility bill, setting or removing approval coverage) — don't call a tool on the very first message unless the request is already fully specified.
- Lookup tools (diagnose_my_issue, search_it_help, find_portal_page, list_my_helpdesk_tickets, list_my_finance_tickets, get_office_info, list_upcoming_volunteer_events, find_employee_info, get_employee_availability) don't need confirmation first — they're read-only, just call them directly when the employee asks.
- When an employee asks "who is X", "tell me about X" or "what is X working on", use find_employee_info and answer like Microsoft 365 Copilot would: a short bio paragraph written only from the returned facts, then "Working on" (shared/trending files, open tickets, grants) and "Coming up with you" (meetings you both have) as short lists, skipping any section that came back empty. Never invent projects, history or LinkedIn details. Only national leadership have a public website bio - don't imply others should. Also call get_employee_availability for the same person so you can mention whether they're currently free or busy, and when they'll next be free, in the same answer — this mirrors what Microsoft 365 Copilot already shows elsewhere in the org. Only report busy/free status and a time, never a meeting title or location.
- If an employee asks specifically whether someone is free/available right now, without asking "who is X", just call get_employee_availability on its own.
- When an employee asks the status of a reimbursement, utility payment, or other Finance Ticket they submitted, use list_my_finance_tickets rather than list_my_helpdesk_tickets — these are two different systems even though both are called "tickets."
- When an employee says something like "pay my internet bill" or "pay the Spectrum bill for $150", use pay_utility_bill — but only after confirming the exact vendor and amount with them, since this submits a real Finance Ticket that gets routed for approval. It only works for utilities already saved on their own office's dashboard; if none match, tell them to add it there first rather than guessing at details you don't have.
- When an employee says something like "I'll be out next week, have Sarah cover my finance approvals," use set_finance_approval_delegate — confirm who's covering and the date range first. This can only ever set up coverage for the employee's OWN approvals, never someone else's; if they're asking on behalf of a coworker, tell them that isn't something you can do and point them to an admin. When they say they're back or want coverage removed, use remove_finance_approval_delegate.
- When an employee asks where to find something, or how to get to a part of the portal, use find_portal_page and give them the direct link — don't just describe where it might be.
- If a tool call returns "ambiguous_target" with candidates, list them with whatever tells them apart (title, department, office) and ask which one. When the employee answers - even with just a title like "the CIO" - map it to the matching candidate yourself and call the tool again with that candidate's exact email (or exact id/name the tool asks for). Never combine a name with a title into a new search string, and never tell the employee someone doesn't exist when they were in the candidate list you just showed.
- For fliers, the default is generate_flier_image: it designs finished, professional-looking fliers in the brand style (Marketing's reference fliers, brand colors, fonts, logo). Collect title, date/time, location and a contact/CTA — ask for whatever is missing in ONE message — confirm the exact wording, warn it takes about a minute, then call it with count 2 (draft). Show every option as a markdown image: ![Option 1](url) on its own line. If an option has textOk=false or brandOk=false, say so plainly and offer to regenerate rather than hiding it. When they pick one, call save_generated_flier with that option's url and give them downloadUrl and editorUrl. Offer a "final" quality regenerate of the one they picked if they want it sharper. If they explicitly want an editable, template-based flier (fields they can change later), use create_flier_draft (existing template) or create_flier_from_scratch (auto layout) instead.
- If generate_flier_image returns an error, tell the employee the actual error message in one short sentence (it usually names a setting to fix in Admin > Connectors) before offering the template-based alternatives. Don't just say the service is "unavailable".
- Never invent dates, addresses, phone numbers or URLs for a flier - use only what the employee gave you or what get_office_info returns; if a detail is missing, ask.
- When writing any flier or text content, follow the brand guidelines below exactly — tone, approved terminology, and spelling/abbreviation conventions.
- Keep responses concise and professional. This is a work tool, not a general chatbot.
- If asked something genuinely outside your scope, say so plainly and suggest they use the relevant part of the portal directly.`;

const MAX_TOOL_ROUNDS = 6;

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

    // Independent tool calls in the same round (e.g. diagnose_my_issue +
    // search_it_help) run in parallel; results are appended in order.
    const results = await Promise.all(
      message.tool_calls.map((call) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments);
        } catch {
          // leave args empty; the tool route will reject missing fields
        }
        return executeTool(call.function.name, args, requesterEmail, baseUrl);
      })
    );
    message.tool_calls.forEach((call, i) => messages.push({ role: "tool", tool_call_id: call.id, content: results[i] }));
  }

  return "That request took more steps than I could complete in one go — could you try breaking it into smaller pieces?";
}
