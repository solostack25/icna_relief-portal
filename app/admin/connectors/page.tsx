import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DropboxSettingsClient from "../dropbox/DropboxSettingsClient";
import PexelsSettingsClient from "../pexels/PexelsSettingsClient";
import ConnectorKeyField from "./ConnectorKeyField";

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
        title="Calling & Texting (3CX / Skyetel)"
        description="Powers bulk SMS, donor calling campaigns, and click-to-call across the portal. Skyetel is the SIP trunk provider (SMS/MMS API); 3CX Call Control API handles call origination from an employee's extension."
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
