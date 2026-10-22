"use client";

import { useRouter } from "next/navigation";
import DocUploader from "@/components/grantManagement/DocUploader";

// Attach more documents to an existing expense (uploads go straight onto it).
export default function AddDocs({ expenseId }: { expenseId: string }) {
  const router = useRouter();
  return <DocUploader docs={[]} expenseId={expenseId} onAdded={() => router.refresh()} />;
}
