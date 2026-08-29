import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TicketConfirmationCard from "@/components/TicketConfirmationCard";

export default async function HelpdeskConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: request } = await supabase.from("helpdesk_requests").select("ticket_number, title").eq("id", id).single();
  if (!request) notFound();

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-lg mx-auto">
        <TicketConfirmationCard
          systemLabel="Helpdesk Request"
          ticketNumber={request.ticket_number}
          title={request.title}
          shortcuts={[
            { label: "View This Ticket", href: `/helpdesk/${id}`, primary: true },
            { label: "Submit Another Request", href: "/helpdesk/new" },
            { label: "View All My Requests", href: "/helpdesk" },
          ]}
        />
      </div>
    </main>
  );
}
