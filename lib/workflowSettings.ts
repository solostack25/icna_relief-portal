import { getIntegrationSetting } from "@/lib/integrationSettings";

// Workflow rules an admin can change on Admin → Workflows without a deploy.
// Stored in integration_settings under "wf_" keys; until a value is saved
// the defaults below (the values that used to be hardcoded) apply.
export const WF_DEFAULTS = {
  wf_finance_mailbox: "approvals@icnarelief.org",
  wf_finance_csuite_auto_limit: "5000",
  wf_finance_coo_auto_limit: "10000",
  wf_finance_coo_title: "COO",
  wf_finance_approval_reminder_hours: "48",
  wf_speaker_leadership_threshold: "500",
  wf_speaker_approval_reminder_hours: "48",
  wf_speaker_packet_reminder_hours: "72",
  wf_helpdesk_it_mailbox: "it@icnarelief.org",
  // Hardware Request purchase approval (stage 2, CIO + CSO in parallel).
  // No default on purpose: until these are set, hardware approvals stop
  // after the supervisor and the IT mailbox is told who's missing.
  wf_hardware_cio_email: "",
  wf_hardware_cso_email: "",
} as const;
export type WfKey = keyof typeof WF_DEFAULTS;

export async function wfString(key: WfKey): Promise<string> {
  const v = await getIntegrationSetting(key);
  return v?.trim() ? v.trim() : WF_DEFAULTS[key];
}

export async function wfNumber(key: WfKey): Promise<number> {
  const n = Number(await wfString(key));
  return Number.isFinite(n) ? n : Number(WF_DEFAULTS[key]);
}
