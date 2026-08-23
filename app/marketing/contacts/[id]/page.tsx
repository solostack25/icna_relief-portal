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
      <Link href="/marketing/contacts" className="text-sm text-gray-500 hover:text-gray-800">
        ← Back to contacts
      </Link>
      <ContactProfileClient contactId={id} />
    </div>
  );
}
