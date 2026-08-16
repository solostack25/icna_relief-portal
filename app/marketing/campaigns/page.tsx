"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Campaign = {
  id: string;
  name: string;
  subject: string;
  status: string;
  scheduled_send_at: string | null;
  sent_at: string | null;
  segments: { name: string } | null;
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  scheduled: "bg-blue-100 text-blue-700",
  sending: "bg-amber-100 text-amber-700",
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/marketing/campaigns")
      .then((r) => r.json())
      .then((d) => setCampaigns(d.campaigns ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Email Campaigns</h1>
          <p className="text-sm text-gray-500">One-off sends to a segment</p>
        </div>
        <Link href="/marketing/campaigns/new" className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium">
          New Campaign
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : campaigns.length === 0 ? (
        <p className="text-gray-400 text-sm">No campaigns yet.</p>
      ) : (
        <div className="border rounded divide-y">
          {campaigns.map((c) => (
            <div key={c.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-gray-400">
                  {c.subject} {c.segments?.name ? `· to ${c.segments.name}` : ""}
                </div>
              </div>
              <span className={`text-[10px] px-2 py-1 rounded uppercase tracking-wide ${STATUS_COLORS[c.status]}`}>
                {c.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
