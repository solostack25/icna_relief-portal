import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ContactDetailView from "./ContactDetailView";
import { ORLANDO_OFFICE_ID } from "@/lib/orlandoAutomation/config";

export default async function CampaignContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: contact } = await supabase
    .from("campaign_contacts")
    .select(
      "id, first_name, last_name, phone, email, organization, list_tag, notes, do_not_call"
    )
    .eq("id", id)
    .eq("office_id", ORLANDO_OFFICE_ID)
    .maybeSingle();

  if (!contact) notFound();

  return <ContactDetailView contact={contact} />;
}
