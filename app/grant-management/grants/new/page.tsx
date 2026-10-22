import { redirect } from "next/navigation";
import { getGmViewer, loadOffices } from "@/lib/grantManagement/server";
import { loadLibrary } from "@/lib/grantManagement/library";
import GrantForm from "@/components/grantManagement/GrantForm";
import { PageTitle } from "@/components/grantManagement/ui";

export default async function NewGrantPage() {
  const viewer = (await getGmViewer())!;
  if (!viewer.isManager) redirect("/grant-management/tracker");
  const [offices, library] = await Promise.all([loadOffices(), loadLibrary()]);
  return (
    <div className="max-w-4xl">
      <PageTitle eyebrow="Master tracker" title="New grant" />
      <GrantForm offices={offices} library={library} />
    </div>
  );
}
