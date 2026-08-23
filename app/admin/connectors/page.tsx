import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DropboxSettingsClient from "../dropbox/DropboxSettingsClient";
import PexelsSettingsClient from "../pexels/PexelsSettingsClient";
import ConnectorKeyField from "./ConnectorKeyField";
import CioApproversManager from "./CioApproversManager";

// One page for every external service the portal connects to, rather
// than a separate admin page per integration - as more get added (ADP,
// etc.) they become another section here, not another card in the main
// Admin Portal grid.
export default async function AdminConnectorsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (me?.role !== "admin") redirect("/select-app");

  return (
    <div>
      <h1
        style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" }}
      >
        Connectors
      </h1>
      <p className="text-sm mb-8" style={{ color: "rgba(22,48,43,0.55)" }}>
        Every external service this portal connects to, in one place. Updates here take effect
        immediately — no deploy needed.
      </p>

      <ConnectorSection
        title="AI Assist (Copilot Studio)"
        description="Powers 'AI Assist' features across the portal (e.g. the email builder) — calls an HTTP-triggered Copilot Studio flow. Unrelated to the Portal Assistant below; this can stay on Copilot Studio or move to Azure OpenAI later, they're independent."
      >
        <ConnectorKeyField settingKey="copilot_studio_endpoint_url" label="Flow URL" placeholder="https://prod-00.westus.logic.azure.com/..." />
        <ConnectorKeyField settingKey="copilot_studio_api_key" label="API Key / Shared Secret (optional)" placeholder="If your flow requires an auth header" />
      </ConnectorSection>

      <ConnectorSection
        title="Portal Assistant (Azure OpenAI)"
        description="Powers the Portal Assistant chat panel on /select-app — creating helpdesk tickets, placing calls, sending texts. Runs directly on Azure OpenAI rather than Copilot Studio, since Copilot Studio's tool-calling orchestrator requires an Agent 365 license this tenant doesn't have. Create a resource in Azure OpenAI Studio, deploy a chat model (e.g. gpt-4o), and paste its details here. The image deployment is optional and only needed for AI-generated flier images."
      >
        <ConnectorKeyField settingKey="azure_openai_endpoint" label="Endpoint" placeholder="https://your-resource.openai.azure.com" />
        <ConnectorKeyField settingKey="azure_openai_api_key" label="API Key" placeholder="From Azure OpenAI Studio > Keys and Endpoint" />
        <ConnectorKeyField settingKey="azure_openai_deployment" label="Chat Deployment Name" placeholder="e.g. gpt-4o" />
        <ConnectorKeyField settingKey="azure_openai_image_deployment" label="Image Deployment Name (optional)" placeholder="e.g. dall-e-3" />
        <ConnectorKeyField
          settingKey="azure_openai_whisper_deployment"
          label="Whisper Deployment Name (optional)"
          placeholder="e.g. whisper — for call recording transcription"
        />
      </ConnectorSection>

      <ConnectorSection
        title="Call Recording Webhook (3CX → Portal)"
        description="3CX doesn't push recordings here automatically — someone needs to set up a Call Flow Designer (or equivalent) webhook action in 3CX that POSTs to /api/webhooks/threecx/call-recording once a recorded call finishes, with an X-Webhook-Secret header matching the value below. Requires call recording to be enabled on the 3CX plan, and a Whisper deployment configured above."
      >
        <ConnectorKeyField
          settingKey="threecx_recording_webhook_secret"
          label="Webhook Shared Secret"
          placeholder="Any long random string — set the same value in 3CX's webhook header"
        />
      </ConnectorSection>

      <ConnectorSection
        title="Copilot Agent Actions"
        description="Authenticates the Portal Assistant's ability to actually DO things in the portal (create tickets, place calls, send messages) via the /api/copilot/* endpoints — called directly by the Portal Assistant above. Generate any random secure string and paste it here."
      >
        <ConnectorKeyField settingKey="copilot_api_key" label="Copilot Actions API Key" placeholder="Generate a long random string" />
      </ConnectorSection>

      <ConnectorSection title="Dropbox" description="Powers Upload Content and the Flier Builder's image library.">
        <DropboxSettingsClient />
      </ConnectorSection>

      <ConnectorSection
        title="Stock Photos (Pexels)"
        description="Powers stock photo search in the Flier Builder. Free at pexels.com/api — no approval process."
      >
        <PexelsSettingsClient />
      </ConnectorSection>

      <ConnectorSection
        title="Email (Resend)"
        description="Powers the Contacts platform's mass email campaigns and drip sequences. Get a key at resend.com/api-keys — also needs a verified sending domain with SPF/DKIM/DMARC configured before real sends go out."
      >
        <ConnectorKeyField settingKey="resend_api_key" label="API Key" envFallbackKey="RESEND_API_KEY" placeholder="re_..." />
        <ConnectorKeyField settingKey="resend_from_email" label="From Address" placeholder="communications@icnarelief.org" />
      </ConnectorSection>

      <ConnectorSection
        title="Salesforce"
        description="Read-only sync of donor gift history (for dynamic segments like Top Donors) and the existing Push to Salesforce stubs across the portal. Requires a Connected App set up in Salesforce Setup → App Manager with OAuth enabled."
      >
        <ConnectorKeyField settingKey="salesforce_client_id" label="Consumer Key" placeholder="Connected App consumer key" />
        <ConnectorKeyField settingKey="salesforce_client_secret" label="Consumer Secret" placeholder="Connected App consumer secret" />
        <ConnectorKeyField settingKey="salesforce_username" label="Integration User Username" placeholder="integration@icnarelief.org" />
        <ConnectorKeyField settingKey="salesforce_password_token" label="Password + Security Token" placeholder="password + token, concatenated" />
        <ConnectorKeyField settingKey="salesforce_instance_url" label="Instance URL" placeholder="https://icnarelief.my.salesforce.com" />
      </ConnectorSection>

      <ConnectorSection
        title="Brand Assets"
        description="A hosted URL for the ICNA Relief logo, used when the Portal Assistant creates a flier from scratch (no template) — it's placed on the flier automatically, never invented or approximated. Upload the logo anywhere with a stable public URL (e.g. WordPress media library, or the Content Library/Dropbox) and paste that URL here. Without this set, AI-generated fliers are created without a logo and staff are told to add one manually before publishing."
      >
        <ConnectorKeyField settingKey="brand_logo_url" label="Logo Image URL" placeholder="https://icnarelief.org/wp-content/uploads/logo.png" />
      </ConnectorSection>

      <ConnectorSection
        title="Fundraiser Approvers"
        description="Fundraisers created under Fundraisers stay pending until one of these people (or a Portal Admin) approves them — approval is what activates the CharityStack donation form and publishes the WordPress page. Add by email; the person must already exist as an employee in the portal."
      >
        <CioApproversManager />
      </ConnectorSection>

      <ConnectorSection
        title="Donations (CharityStack)"
        description="Powers the Fundraisers module — creating a fundraiser in the portal calls CharityStack's API to create the matching donation form and pulls back an embed snippet for the office's WordPress page. Donor identity and payment data are never stored here; only dollar amounts and fund/status metadata flow back in via the webhook below. Get your API key from your CharityStack account administrator (cs_live_ prefix). Fundraisers created before a key is set here are saved as drafts and sync automatically once you paste one in."
      >
        <ConnectorKeyField settingKey="charitystack_api_key" label="API Key" placeholder="cs_live_..." />
        <p className="text-xs mt-2" style={{ color: "rgba(22,48,43,0.5)" }}>
          Webhook endpoint (register this in CharityStack, subscribed to donation.created,
          donation.updated, subscription.created, subscription.updated, subscription.cancelled):
          <br />
          <code className="text-[11px]">{"{portal-url}"}/api/webhooks/charitystack</code>
        </p>
        <div className="mt-2">
          <ConnectorKeyField settingKey="charitystack_webhook_secret" label="Webhook Signing Secret" placeholder="Shown once when the webhook is created in CharityStack" />
        </div>
      </ConnectorSection>

      <ConnectorSection
        title="WordPress Site"
        description="Lets fundraisers created in the portal automatically publish as full standalone GoFundMe-style pages on the live site (hero image, story, progress bar, updates, donate button) once approved — no one has to touch WordPress by hand. Create an Application Password for a WordPress user with page-editing rights: WP Admin → Users → your profile → Application Passwords → add a name like 'ICNA Portal' → copy the generated password (spaces and all) here. That user's normal login password is never used or stored."
      >
        <ConnectorKeyField settingKey="wp_site_url" label="Site URL" placeholder="https://icnarelief.org (no trailing slash)" />
        <ConnectorKeyField settingKey="wp_username" label="WordPress Username" placeholder="e.g. portal-bot" />
        <ConnectorKeyField settingKey="wp_app_password" label="Application Password" placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" />
      </ConnectorSection>

      <ConnectorSection
        title="Calling & Texting (3CX / Skyetel)"
        description="Powers bulk SMS, donor calling campaigns, and click-to-call across the portal. Skyetel is the SIP trunk provider (SMS/MMS API); 3CX Call Control API handles call origination from an employee's extension. For inbound SMS/STOP handling, set your Skyetel SMS-enabled number's callback URL (in the Skyetel portal, on that number's SMS tab) to this app's /api/marketing/sms/inbound."
      >
        <ConnectorKeyField settingKey="skyetel_api_key" label="Skyetel API Key" placeholder="For outbound SMS/MMS" />
        <ConnectorKeyField settingKey="skyetel_api_secret" label="Skyetel API Secret" />
        <ConnectorKeyField settingKey="skyetel_sms_number" label="Skyetel SMS-Enabled Number" placeholder="+1..." />
        <ConnectorKeyField settingKey="threecx_api_url" label="3CX API Base URL" placeholder="https://icnarelief.3cx.us" />
        <ConnectorKeyField settingKey="threecx_client_id" label="3CX API Client ID" placeholder="From Integrations → API in 3CX admin" />
        <ConnectorKeyField settingKey="threecx_client_secret" label="3CX API Client Secret" />
      </ConnectorSection>
    </div>
  );
}

function ConnectorSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-10">
      <h2 className="text-sm font-bold mb-1">{title}</h2>
      <p className="text-xs mb-3" style={{ color: "rgba(22,48,43,0.5)" }}>
        {description}
      </p>
      {children}
    </div>
  );
}
