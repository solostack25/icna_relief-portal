import { getThreeCxConfig } from "@/lib/threecx";
import { listRingGroups, listTrunks } from "@/lib/threecxAdmin";
import { errorMessage } from "@/lib/phonesAdmin";
import LiveClient from "./LiveClient";
import NotConnected from "./NotConnected";

export const dynamic = "force-dynamic";

// Phones > Live: system health, trunks, calls in progress, queues.
// The client polls /api/admin/phones/threecx?view=live for the moving parts.
export default async function PhonesLivePage() {
  if (!(await getThreeCxConfig())) return <NotConnected />;
  const [trunks, ringGroups] = await Promise.allSettled([listTrunks(), listRingGroups()]);
  return (
    <LiveClient
      trunks={trunks.status === "fulfilled" ? trunks.value : []}
      trunksError={trunks.status === "rejected" ? errorMessage(trunks.reason) : null}
      ringGroups={ringGroups.status === "fulfilled" ? ringGroups.value.map((g) => ({ Number: g.Number, Name: g.Name })) : []}
    />
  );
}
