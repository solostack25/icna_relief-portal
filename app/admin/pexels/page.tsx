import { redirect } from "next/navigation";

// Consolidated into /admin/connectors alongside every other integration.
export default function AdminPexelsPage() {
  redirect("/admin/connectors");
}
