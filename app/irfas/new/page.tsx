import { redirect } from "next/navigation";

// Standalone intake form retired - applicant info duplicated what's already
// on the client record. Zakat applications now start from a specific
// client's page (ApplyForZakatButton in the "Zakat / IRFAS" section there),
// same "search/find the client first" pattern as /intake -> /clients.
export default function NewIrfasApplicationRedirect() {
  redirect("/clients");
}

