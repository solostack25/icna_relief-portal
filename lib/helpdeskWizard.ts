import type { Department, Priority } from "@/lib/helpdesk";

// Every leaf here maps 1:1 onto an existing category in app/helpdesk/new
// (deliberately kept in sync — adding a category there without adding it
// here means the wizard can't route to it). The wizard exists to get
// someone to the RIGHT department/category without needing to already
// know the internal taxonomy, then pre-fill as much of the request as
// it reasonably can.

export type WizardIntent = {
  id: string;
  label: string;
  department: Department;
  category: string;
  // Shown in the review step as a starting point — editable, not final.
  titleTemplate: string;
  // Placeholder text in the description box, written as a prompt for
  // what to include, not filler text meant to be submitted as-is.
  descriptionPrompt: string;
};

export type WizardGroup = {
  id: Department;
  label: string;
  blurb: string;
  intents: WizardIntent[];
};

export const WIZARD_GROUPS: WizardGroup[] = [
  {
    id: "it",
    label: "Tech Support",
    blurb: "Computers, software, phones, Salesforce, the website, or this portal",
    intents: [
      {
        id: "it-general",
        label: "My computer or software isn't working right",
        department: "it",
        category: "General Support",
        titleTemplate: "Computer/software issue",
        descriptionPrompt:
          "What's happening, on which device, and when did it start? Include any error messages you're seeing.",
      },
      {
        id: "it-app",
        label: "Something in this portal is broken",
        department: "it",
        category: "App Issues",
        titleTemplate: "Portal issue",
        descriptionPrompt:
          "Which page or feature, and what happens when you try to use it? A screenshot helps a lot if you can attach one after submitting.",
      },
      {
        id: "it-3cx",
        label: "Phone / 3CX system issue",
        department: "it",
        category: "3CX Support",
        titleTemplate: "3CX / phone issue",
        descriptionPrompt: "What's going wrong with calls, voicemail, or the 3CX app, and on which extension?",
      },
      {
        id: "it-salesforce",
        label: "Salesforce issue",
        department: "it",
        category: "Salesforce",
        titleTemplate: "Salesforce issue",
        descriptionPrompt: "What were you trying to do in Salesforce, and what happened instead?",
      },
      {
        id: "it-hardware",
        label: "I need new hardware (computer, monitor, phone, etc.)",
        department: "it",
        category: "Hardware Request",
        titleTemplate: "Hardware request",
        descriptionPrompt: "What equipment do you need, and what's it for? Include your office location.",
      },
      {
        id: "it-software",
        label: "I need software installed or a license",
        department: "it",
        category: "Software Request",
        titleTemplate: "Software request",
        descriptionPrompt: "What software/license do you need, and what will you use it for?",
      },
      {
        id: "it-website",
        label: "The website has a technical problem (down, broken, errors)",
        department: "it",
        category: "Website Support",
        titleTemplate: "Website technical issue",
        descriptionPrompt: "Which page, and what's broken? Include a link if you can.",
      },
      {
        id: "it-new-employee",
        label: "I'm setting up a new employee",
        department: "it",
        category: "New Employee",
        titleTemplate: "New employee setup",
        descriptionPrompt: "New employee's name, start date, and what accounts/equipment they'll need.",
      },
    ],
  },
  {
    id: "hr",
    label: "HR",
    blurb: "Hiring, position changes, offboarding",
    intents: [
      {
        id: "hr-hiring",
        label: "I need to hire someone / post a job",
        department: "hr",
        category: "Hiring Request",
        titleTemplate: "Hiring request",
        descriptionPrompt: "What role, which office/program, and when do you need them starting?",
      },
      {
        id: "hr-position",
        label: "Someone's role or responsibilities are changing",
        department: "hr",
        category: "Position Change",
        titleTemplate: "Position change",
        descriptionPrompt: "Who, and what's changing about their role?",
      },
      {
        id: "hr-offboarding",
        label: "Someone is leaving",
        department: "hr",
        category: "Offboarding",
        titleTemplate: "Offboarding",
        descriptionPrompt: "Who, and what's their last day?",
      },
      {
        id: "hr-title",
        label: "Update someone's job title",
        department: "hr",
        category: "Title Change",
        titleTemplate: "Title change",
        descriptionPrompt: "Who, current title, and new title?",
      },
      {
        id: "hr-other",
        label: "Something else HR-related",
        department: "hr",
        category: "Other",
        titleTemplate: "HR request",
        descriptionPrompt: "What do you need help with?",
      },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    blurb: "Event materials, campaigns, design, website content",
    intents: [
      {
        id: "mkt-event",
        label: "I need materials for an event (flyers, banners, signage)",
        department: "marketing",
        category: "Event Materials",
        titleTemplate: "Event materials request",
        descriptionPrompt: "What's the event, when is it, and what materials do you need?",
      },
      {
        id: "mkt-email",
        label: "I need an email campaign sent out",
        department: "marketing",
        category: "Email Campaign",
        titleTemplate: "Email campaign request",
        descriptionPrompt: "What's the message, who's the audience, and when should it go out?",
      },
      {
        id: "mkt-design",
        label: "I need a graphic or design created",
        department: "marketing",
        category: "Graphic Design",
        titleTemplate: "Graphic design request",
        descriptionPrompt: "What's it for, and what should it include? Attach any reference images after submitting.",
      },
      {
        id: "mkt-website",
        label: "Update the website's content (text, images, pages)",
        department: "marketing",
        category: "Website Content",
        titleTemplate: "Website content update",
        descriptionPrompt: "Which page, and what should change?",
      },
      {
        id: "mkt-other",
        label: "Something else marketing-related",
        department: "marketing",
        category: "Other",
        titleTemplate: "Marketing request",
        descriptionPrompt: "What do you need help with?",
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    blurb: "Reimbursements, payments, PEX card",
    intents: [
      {
        id: "fin-reimbursement",
        label: "I need to be reimbursed for something I paid for",
        department: "finance",
        category: "Reimbursement",
        titleTemplate: "Reimbursement request",
        descriptionPrompt: "What did you pay for, how much, and when? Attach your receipt after submitting.",
      },
      {
        id: "fin-check",
        label: "I need a check issued",
        department: "finance",
        category: "Check Request",
        titleTemplate: "Check request",
        descriptionPrompt: "Who should the check go to, for how much, and why?",
      },
      {
        id: "fin-pex",
        label: "I have a question about my PEX card",
        department: "finance",
        category: "PEX Card",
        titleTemplate: "PEX card question",
        descriptionPrompt: "What's the question or issue with your PEX card?",
      },
      {
        id: "fin-vendor",
        label: "We need to pay a vendor",
        department: "finance",
        category: "Vendor Payment",
        titleTemplate: "Vendor payment request",
        descriptionPrompt: "Which vendor, how much, and what's it for?",
      },
      {
        id: "fin-other",
        label: "Something else finance-related",
        department: "finance",
        category: "Other",
        titleTemplate: "Finance request",
        descriptionPrompt: "What do you need help with?",
      },
    ],
  },
];

export const URGENCY_OPTIONS: { label: string; sublabel: string; priority: Priority }[] = [
  { label: "No rush", sublabel: "Whenever you get a chance", priority: "low" },
  { label: "Normal", sublabel: "Sometime this week is fine", priority: "normal" },
  { label: "Soon", sublabel: "It's affecting my work today", priority: "high" },
  { label: "Urgent", sublabel: "I'm completely blocked right now", priority: "urgent" },
];
