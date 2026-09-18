import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ClientProfileView from "@/app/orlando-automation/_components/ClientProfileView";
import { ORLANDO_OFFICE_ID, ORLANDO_STATE } from "@/lib/orlandoAutomation/config";

export default async function ClientProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; existing?: string }>;
}) {
  const { id } = await params;
  const { created, existing } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("office_id", ORLANDO_OFFICE_ID)
    .maybeSingle();

  if (!client) redirect("/orlando-automation/clients");

  return <ClientProfileView client={client} created={created} existing={existing} />;
}
