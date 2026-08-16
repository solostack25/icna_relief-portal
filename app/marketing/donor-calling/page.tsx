"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Campaign = {
  id: string;
  name: string;
  status: string;
  calledCount: number;
  segments: { name: string } | null;
};

export default function DonorCallingPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/marketing/donor-calling")
      .then((r) => r.json())
      .then((d) => setCampaigns(d.campaigns ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Donor Calling Campaigns</h1>
          <p className="text-sm text-gray-500">Work through a segment's phone list with a script and outcome logging</p>
        </div>
        <Link href="/marketing/donor-calling/new" className="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-medium">
          New Campaign
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : campaigns.length === 0 ? (
        <p className="text-gray-400 text-sm">No calling campaigns yet.</p>
      ) : (
        <div className="border rounded divide-y">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/marketing/donor-calling/${c.id}`} className="p-4 flex items-center justify-between hover:bg-gray-50 block">
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-gray-400">{c.segments?.name ? `List: ${c.segments.name}` : ""} · {c.calledCount} calls logged</div>
              </div>
              <span className="text-xs text-emerald-600 font-medium">Start calling →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
