"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type FundraiserUpdate = { id: string; posted_at: string; message: string };

type Fundraiser = {
  id: string;
  title: string;
  slug: string;
  sync_status: "draft" | "synced" | "error";
  sync_error: string | null;
  is_published: boolean;
  charitystack_form_url: string | null;
  charitystack_embed_html: string | null;
  raised_amount: number;
  donation_count: number;
  goal: number | null;
  wp_page_id: number | null;
  wp_page_url: string | null;
  wp_sync_status: "not_created" | "created" | "error";
  wp_sync_error: string | null;
  updates: FundraiserUpdate[];
};

export default function FundraiserManager({ fundraiser, officeName }: { fundraiser: Fundraiser; officeName: string }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [creatingPage, setCreatingPage] = useState(false);
  const [postingUpdate, setPostingUpdate] = useState(false);
  const [updateText, setUpdateText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreatePage() {
    setCreatingPage(true);
    setError(null);
    const res = await fetch(`/api/fundraisers/${fundraiser.id}/publish-page`, { method: "POST" });
    const body = await res.json();
    setCreatingPage(false);
    if (!res.ok) {
      setError(body.error ?? "Failed to create the page.");
      return;
    }
    router.refresh();
  }

  async function handlePostUpdate() {
    if (!updateText.trim()) return;
    setPostingUpdate(true);
    setError(null);
    const res = await fetch(`/api/fundraisers/${fundraiser.id}/updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: updateText.trim() }),
    });
    const body = await res.json();
    setPostingUpdate(false);
    if (!res.ok) {
      setError(body.error ?? "Failed to post the update.");
      return;
    }
    setUpdateText("");
    router.refresh();
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);
    const res = await fetch(`/api/fundraisers/${fundraiser.id}/sync`, { method: "POST" });
    const body = await res.json();
    setSyncing(false);
    if (!res.ok) {
      setError(body.error ?? "Sync failed.");
      return;
    }
    router.refresh();
  }

  async function handlePublishToggle() {
    setPublishing(true);
    setError(null);
    const res = await fetch(`/api/fundraisers/${fundraiser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_published: !fundraiser.is_published }),
    });
    const body = await res.json();
    setPublishing(false);
    if (!res.ok) {
      setError(body.error ?? "Failed to update.");
      return;
    }
    router.refresh();
  }

  const shortcode = `[icna_fundraiser slug="${fundraiser.slug}"]`;

  function copyShortcode() {
    navigator.clipboard.writeText(shortcode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium">CharityStack Sync</h2>
          <span
            className={
              "text-xs px-2 py-1 rounded-full " +
              (fundraiser.sync_status === "synced"
                ? "bg-green-500/10 text-green-700"
                : fundraiser.sync_status === "error"
                ? "bg-red-500/10 text-red-700"
                : "bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)]")
            }
          >
            {fundraiser.sync_status === "synced" ? "Synced" : fundraiser.sync_status === "error" ? "Sync error" : "Not synced"}
          </span>
        </div>

        {fundraiser.sync_status === "draft" && (
          <p className="text-sm text-[var(--color-text-dim)] mb-3">
            No CharityStack API key is configured yet, or the key hasn't been added since this was created.
            Once one's added under Admin → Connectors, click retry below.
          </p>
        )}
        {fundraiser.sync_status === "error" && (
          <p className="text-sm text-red-600 mb-3">{fundraiser.sync_error}</p>
        )}
        {fundraiser.sync_status === "synced" && fundraiser.charitystack_form_url && (
          <p className="text-sm text-[var(--color-text-dim)] mb-3">
            Live at{" "}
            <a href={fundraiser.charitystack_form_url} target="_blank" rel="noreferrer" className="underline">
              {fundraiser.charitystack_form_url}
            </a>
          </p>
        )}

        {fundraiser.sync_status !== "synced" && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="text-sm rounded-lg border border-[var(--color-accent)]/40 text-[var(--color-accent)] px-4 py-2 hover:border-[var(--color-accent)] disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Retry Sync"}
          </button>
        )}
      </section>

      {fundraiser.sync_status === "synced" && (
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium">Fundraiser Page (GoFundMe-style)</h2>
            <span
              className={
                "text-xs px-2 py-1 rounded-full " +
                (fundraiser.wp_sync_status === "created"
                  ? "bg-green-500/10 text-green-700"
                  : fundraiser.wp_sync_status === "error"
                  ? "bg-red-500/10 text-red-700"
                  : "bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)]")
              }
            >
              {fundraiser.wp_sync_status === "created" ? "Live" : fundraiser.wp_sync_status === "error" ? "Error" : "Not created"}
            </span>
          </div>
          <p className="text-sm text-[var(--color-text-dim)] mb-3">
            Creates a real, standalone page on the WordPress site — hero image, story, live progress bar and donate
            button, and any updates below — no manual WordPress work needed. Requires the WordPress connector to be
            set up under Admin → Connectors.
          </p>
          {fundraiser.wp_sync_status === "error" && <p className="text-sm text-red-600 mb-3">{fundraiser.wp_sync_error}</p>}
          {fundraiser.wp_page_url && (
            <p className="text-sm text-[var(--color-text-dim)] mb-3">
              Live at{" "}
              <a href={fundraiser.wp_page_url} target="_blank" rel="noreferrer" className="underline">
                {fundraiser.wp_page_url}
              </a>
            </p>
          )}
          <button
            onClick={handleCreatePage}
            disabled={creatingPage}
            className="text-sm rounded-lg bg-[var(--color-accent)] text-white px-4 py-2 disabled:opacity-50"
          >
            {creatingPage ? "Publishing..." : fundraiser.wp_page_id ? "Regenerate Page" : "Create Page"}
          </button>

          {fundraiser.wp_page_id && (
            <div className="mt-6 pt-6 border-t border-[var(--color-border)]">
              <h3 className="text-sm font-medium mb-2">Post an Update</h3>
              <textarea
                value={updateText}
                onChange={(e) => setUpdateText(e.target.value)}
                rows={3}
                placeholder="e.g. Thanks to your generosity we've reached 75% of our goal!"
                className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] mb-2"
              />
              <button
                onClick={handlePostUpdate}
                disabled={postingUpdate || !updateText.trim()}
                className="text-sm rounded-lg border border-[var(--color-accent)]/40 text-[var(--color-accent)] px-4 py-2 hover:border-[var(--color-accent)] disabled:opacity-50"
              >
                {postingUpdate ? "Posting..." : "Post Update"}
              </button>

              {fundraiser.updates.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {fundraiser.updates.map((u) => (
                    <li key={u.id} className="text-sm">
                      <span className="text-xs text-[var(--color-text-dim)]">
                        {new Date(u.posted_at).toLocaleDateString()}
                      </span>
                      <p>{u.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {fundraiser.sync_status === "synced" && (
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium">Also Embed On An Existing Page (optional)</h2>
            <span
              className={
                "text-xs px-2 py-1 rounded-full " +
                (fundraiser.is_published
                  ? "bg-green-500/10 text-green-700"
                  : "bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)]")
              }
            >
              {fundraiser.is_published ? "Published" : "Draft"}
            </span>
          </div>
          <p className="text-sm text-[var(--color-text-dim)] mb-4">
            {fundraiser.is_published
              ? "Live on the WordPress site via the shortcode below."
              : "Not yet visible on the site. Publish to make the shortcode below render live."}
          </p>
          <button
            onClick={handlePublishToggle}
            disabled={publishing}
            className="text-sm rounded-lg bg-[var(--color-accent)] text-white px-4 py-2 disabled:opacity-50"
          >
            {publishing ? "Saving..." : fundraiser.is_published ? "Unpublish" : "Publish"}
          </button>

          {fundraiser.is_published && (
            <div className="mt-4">
              <label className="block text-xs mb-1 text-[var(--color-text-dim)]">
                WordPress shortcode — {officeName}'s page
              </label>
              <div className="flex gap-2">
                <code className="flex-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm">
                  {shortcode}
                </code>
                <button
                  onClick={copyShortcode}
                  className="text-sm rounded-lg border border-[var(--color-border)] px-3 py-2 hover:border-[var(--color-accent)]"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {fundraiser.sync_status === "synced" && (
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="text-sm font-medium mb-2">Raised so far</h2>
          <p className="text-2xl font-semibold">
            ${Number(fundraiser.raised_amount).toLocaleString()}
            {fundraiser.goal ? (
              <span className="text-sm font-normal text-[var(--color-text-dim)]"> of ${Number(fundraiser.goal).toLocaleString()} goal</span>
            ) : null}
          </p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1">
            {fundraiser.donation_count} donation{fundraiser.donation_count === 1 ? "" : "s"} · aggregate totals only, via
            CharityStack webhooks — no donor detail is stored in the portal
          </p>
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
