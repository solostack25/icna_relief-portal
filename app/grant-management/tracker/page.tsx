import { getGmViewer, loadGrantSummaries } from "@/lib/grantManagement/server";
import TrackerClient from "./TrackerClient";

export default async function TrackerPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const viewer = (await getGmViewer())!;
  const grants = await loadGrantSummaries(viewer);
  return <TrackerClient grants={grants} canCreate={viewer.isManager} initial={{ status: sp.status ?? "", office_id: sp.office_id ?? "", region: sp.region ?? "", program: sp.program ?? "", funder: sp.funder ?? "" }} />;
}
