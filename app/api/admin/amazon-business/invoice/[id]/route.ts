import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getAmzbViewer } from "@/lib/amazonBusiness/access";
import { AMZB_BUCKET } from "@/lib/amazonBusiness/sync";

// Opens an Amazon Business invoice PDF. Used from Admin -> Amazon Business
// and as the invoice link on Finance tickets, so besides IT, Finance and
// admins it also opens for the Finance ticket's requestor and anyone in
// its approval chain.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createAdminClient();
  const { data: p } = await admin.from("amzb_purchases").select("pdf_storage_path, finance_ticket_id").eq("id", id).maybeSingle();
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const viewer = await getAmzbViewer();
  if (!viewer) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: me } = await supabase.from("employees").select("id, email").eq("auth_user_id", user.id).maybeSingle();
    let allowed = false;
    if (me && p.finance_ticket_id) {
      const [{ data: ft }, { data: steps }] = await Promise.all([
        admin.from("finance_tickets").select("requestor_id").eq("id", p.finance_ticket_id).maybeSingle(),
        admin.from("finance_approvals").select("approver_email, chain_person_email").eq("finance_ticket_id", p.finance_ticket_id),
      ]);
      const email = (me.email ?? "").toLowerCase();
      allowed =
        ft?.requestor_id === me.id ||
        (steps ?? []).some((s: { approver_email: string | null; chain_person_email: string | null }) => [s.approver_email, s.chain_person_email].some((e) => (e ?? "").toLowerCase() === email));
    }
    if (!allowed) return NextResponse.json({ error: "You don't have access to this invoice." }, { status: 403 });
  }

  if (!p.pdf_storage_path) return NextResponse.json({ error: "No PDF for this purchase yet." }, { status: 404 });
  const { data } = await admin.storage.from(AMZB_BUCKET).createSignedUrl(p.pdf_storage_path, 120, { download: false });
  if (!data?.signedUrl) return NextResponse.json({ error: "Couldn't open the PDF." }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
