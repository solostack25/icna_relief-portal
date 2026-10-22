import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/grantManagement/server";
import { getGmViewer, grantAccess, loadOffices } from "@/lib/grantManagement/server";
import GrantForm from "@/components/grantManagement/GrantForm";
import { PageTitle } from "@/components/grantManagement/ui";

export default async function EditGrantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = (await getGmViewer())!;
  const admin = createAdminClient();
  if (!(await grantAccess(viewer, id, admin)).canManage) notFound();
  const [{ data: g }, offices] = await Promise.all([admin.from("gm_grants").select("*").eq("id", id).single(), loadOffices(admin)]);
  if (!g) notFound();
  return (
    <div className="max-w-4xl">
      <PageTitle eyebrow={g.code} title="Edit grant" />
      <GrantForm
        offices={offices}
        grantId={id}
        initial={{
          name: g.name,
          funder: g.funder,
          code: g.code,
          program: g.program,
          office_id: g.office_id ?? "",
          award_amount: String(g.award_amount),
          start_date: g.start_date,
          end_date: g.end_date,
          funder_fiscal_year: g.funder_fiscal_year ?? "",
          approval_required: g.approval_required,
          doc_required_over: String(g.doc_required_over),
          notes: g.notes ?? "",
        }}
      />
    </div>
  );
}
