import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DropboxSettingsClient from "../dropbox/DropboxSettingsClient";
import PexelsSettingsClient from "../pexels/PexelsSettingsClient";

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
