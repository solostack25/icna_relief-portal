import { getGmViewer, loadGrantSummaries } from "@/lib/grantManagement/server";
import { REPORTS } from "@/lib/grantManagement/reports";
import { loadLibrary } from "@/lib/grantManagement/library";
import ReportsClient from "./ReportsClient";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const viewer = (await getGmViewer())!;
  const [grants, library] = await Promise.all([loadGrantSummaries(viewer), loadLibrary(true)]);
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean) as string[])].sort();
  return (
    <ReportsClient
      reports={Object.entries(REPORTS).map(([key, v]) => ({ key, ...v }))}
      initial={Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>}
      options={{
        grants: grants.map((g) => ({ id: g.id, label: `${g.code} · ${g.name}` })),
        offices: [...new Map(grants.filter((g) => g.office_id).map((g) => [g.office_id!, g.office_name ?? ""])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
        regions: uniq(grants.map((g) => g.resolved_region)),
        programs: uniq(grants.map((g) => g.program)),
        funders: uniq(grants.map((g) => g.funder)),
        categories: uniq([...library.map((c) => c.name)]),
      }}
    />
  );
}
