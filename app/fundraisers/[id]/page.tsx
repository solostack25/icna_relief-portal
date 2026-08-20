import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FundraiserManager from "./FundraiserManager";

export default async function FundraiserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: fundraiser } = await supabase.from("fundraisers").select("*").eq("id", id).single();
  if (!fundraiser) notFound();

  const { data: office } = await supabase
    .from("b2s_offices")
    .select("field_office, region")
    .eq("id", fundraiser.office_id)
    .single();

  const { data: totals } = await supabase
    .from("fundraiser_totals")
    .select("raised_amount, donation_count")
    .eq("fundraiser_id", id)
    .maybeSingle();

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold">{fundraiser.title}</h1>
            <p className="text-sm text-[var(--color-text-dim)]">
              {office ? `${office.region} — ${office.field_office}` : "Unknown office"}
            </p>
          </div>
          <Link href="/fundraisers" className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
            ← Back
          </Link>
        </div>

        <FundraiserManager
          fundraiser={{
            id: fundraiser.id,
            title: fundraiser.title,
            slug: fundraiser.slug,
            sync_status: fundraiser.sync_status,
            sync_error: fundraiser.sync_error,
            is_published: fundraiser.is_published,
            charitystack_form_url: fundraiser.charitystack_form_url,
            charitystack_embed_html: fundraiser.charitystack_embed_html,
            raised_amount: totals?.raised_amount ?? 0,
            donation_count: totals?.donation_count ?? 0,
            goal: fundraiser.goal,
          }}
          officeName={office?.field_office ?? "this office"}
        />
      </div>
    </main>
  );
}
