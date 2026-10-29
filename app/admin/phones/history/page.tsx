import { getThreeCxConfig } from "@/lib/threecx";
import NotConnected from "../NotConnected";
import HistoryClient from "./HistoryClient";

export const dynamic = "force-dynamic";

// Phones > Call history: 3CX's call log report with recordings (played
// through the portal) and 3CX's own transcription/summary when it has one.
export default async function PhonesHistoryPage() {
  if (!(await getThreeCxConfig())) return <NotConnected />;
  return <HistoryClient />;
}
