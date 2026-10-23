import { lastSecuritySync, loadMfaPeople } from "../data";
import { SecSyncButton, SecSyncStatus } from "../ui";
import { PageHead } from "../style";
import MfaClient from "./MfaClient";

export const dynamic = "force-dynamic";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ admins?: string }> }) {
  const { admins } = await searchParams;
  const [people, run] = await Promise.all([loadMfaPeople(), lastSecuritySync()]);
  return (
    <div className="max-w-6xl">
      <PageHead
        title="MFA"
        sub="Every licensed staff account and the sign-in methods it has registered. Get everyone on the Authenticator app before turning on Conditional Access, or they'll be locked out."
        right={<SecSyncButton />}
      />
      <SecSyncStatus run={run} />
      <MfaClient people={people} adminsOnly={admins === "1"} />
    </div>
  );
}
