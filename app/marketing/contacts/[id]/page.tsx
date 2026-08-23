import { redirect } from "next/navigation";
import Link from "next/link";
import { getMarketingContactsAccess } from "@/lib/marketingContactsAccess";
import ContactProfileClient from "./ContactProfileClient";

export default async function ContactProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getMarketingContactsAccess();
  if (!access.ok) redirect("/select-app");

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link href="/marketing/contacts" className="text-sm font-semibold" style={{ color: "rgba(22,48,43,0.45)" }}>
        ← Back to contacts
      </Link>
      <ContactProfileClient contactId={id} />
    </div>
  );
}
