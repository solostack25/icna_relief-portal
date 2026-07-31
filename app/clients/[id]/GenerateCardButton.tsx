"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function GenerateCardButton({
  clientId,
}: {
  clientId: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);

    // deactivate any existing active cards, then issue a fresh one —
    // keeps the full reissue history in client_id_cards
    await supabase
      .from("client_id_cards")
      .update({ is_active: false })
      .eq("client_id", clientId)
      .eq("is_active", true);

    await supabase.from("client_id_cards").insert({ client_id: clientId });

    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleGenerate}
      disabled={loading}
      className="rounded-lg border border-[var(--color-accent)]/40 text-[var(--color-accent)] text-sm font-medium px-4 py-2 hover:border-[var(--color-accent)] disabled:opacity-50"
    >
      {loading ? "Generating..." : "Generate New ID Card"}
    </button>
  );
}
