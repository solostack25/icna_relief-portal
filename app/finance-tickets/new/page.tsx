import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewFinanceTicketClient from "./NewFinanceTicketClient";

export default async function NewFinanceTicketPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: offices } = await supabase.from("b2s_offices").select("id, field_office").eq("is_active", true).order("field_office");

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: "0 0 8px" }}>
        New Finance Ticket
      </h1>
      <p className="text-sm mb-6" style={{ color: "rgba(22,48,43,0.55)" }}>
        Submits for approval automatically — routed by amount through your reporting chain.
      </p>
      <NewFinanceTicketClient offices={offices ?? []} />
    </div>
  );
}
