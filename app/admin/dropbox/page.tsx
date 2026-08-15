import { redirect } from "next/navigation";

// Consolidated into /admin/connectors alongside every other integration.
export default function AdminDropboxPage() {
  redirect("/admin/connectors");
}
