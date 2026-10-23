import { createAdminClient } from "@/lib/supabase/server";
import { fetchAllRows, lastSecuritySync } from "../data";
import { SecSyncButton, SecSyncStatus } from "../ui";
import { PageHead, htmlToText } from "../style";
import ScoreClient, { type ScoreControl } from "./ScoreClient";

export const dynamic = "force-dynamic";

type Raw = Omit<ScoreControl, "remediationText" | "gain"> & { remediation: string | null };

export default async function SecureScorePage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const { open } = await searchParams;
  const [rows, run, { data: latest }] = await Promise.all([
    fetchAllRows<Raw>(
      "sec_score_controls",
      "id, title, category, service, max_score, current_score, implementation_status, implementation_cost, user_impact, tier, threats, remediation, remediation_impact, action_url, rank, deprecated"
    ),
    lastSecuritySync(),
    createAdminClient().from("sec_secure_scores").select("current_score, max_score").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const controls: ScoreControl[] = rows
    .filter((r) => !r.deprecated && (r.max_score ?? 0) > 0)
    .map((r) => ({
      ...r,
      remediationText: htmlToText(r.remediation),
      gain: Math.round(((r.max_score ?? 0) - (r.current_score ?? 0)) * 10) / 10,
    }));

  return (
    <div className="max-w-6xl">
      <PageHead
        title="Secure Score"
        sub="Microsoft's security recommendations for the tenant, biggest point gains first. Each one says what it protects against and how much it affects staff."
        right={<SecSyncButton />}
      />
      <SecSyncStatus run={run} />
      <ScoreClient controls={controls} current={latest?.current_score ?? null} max={latest?.max_score ?? null} initialOpen={open ?? null} />
    </div>
  );
}
