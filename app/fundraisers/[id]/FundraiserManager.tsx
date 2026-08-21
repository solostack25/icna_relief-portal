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
  approval_status: "pending_review" | "approved" | "rejected";
  rejection_reason: string | null;
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

export default function FundraiserManager({
  fundraiser,
  officeName,
  canApprove,
}: {
  fundraiser: Fundraiser;
  officeName: string;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [creatingPage, setCreatingPage] = useState(false);
  const [postingUpdate, setPostingUpdate] = useState(false);
  const [updateText, setUpdateText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleApprove() {
    setApproving(true);
    setError(null);
    setWarning(null);
    const res = await fetch(`/api/fundraisers/${fundraiser.id}/approve`, { method: "POST" });
    const body = await res.json();
    setApproving(false);
    if (res.status === 207) {
      setWarning(body.warning);
      router.refresh();
      return;
    }
    if (!res.ok) {
      setError(body.error ?? "Failed to approve.");
      return;
    }
    router.refresh();
  }

  async function handleReject() {
    if (!rejectReason.trim()) return;
    setRejecting(true);
    setError(null);
    const res = await fetch(`/api/fundraisers/${fundraiser.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectReason.trim() }),
    });
    const body = await res.json();
    setRejecting(false);
    if (!res.ok) {
      setError(body.error ?? "Failed to reject.");
      return;
    }
    setShowRejectForm(false);
    setRejectReason("");
    router.refresh();
  }

  async function handleCreatePage() {
    setCreatingPage(true);
    setError(null);
    const res = await fetch(`/api/fundraisers/${fundraiser.id}/publish-page`, { method: "POST" });
    const body = await res.json();
    setCreatingPage(false);
    if (!res.ok) {
      setError(body.error ?? "Failed to update the page.");
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

  const shortcode = `[icna_fundraiser slug="${fundraiser.slug}"]`;
  function copyShortcode() {
    navigator.clipboard.writeText(shortcode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const approved = fundraiser.approval_status === "approved";

  return (
    <div className="space-y-6">
      {/* Approval banner — always shown first, it's the gate for everything else */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium">Approval</h2>
          <span
            className={
              "text-xs px-2 py-1 rounded-full " +
              (fundraiser.approval_status === "approved"
                ? "bg-green-500/10 text-green-700"
                : fundraiser.approval_status === "rejected"
                ? "bg-red-500/10 text-red-700"
                : "bg-amber-500/10 text-amber-700")
            }
          >
            {fundraiser.approval_status === "approved"
              ? "Approved"
              : fundraiser.approval_status === "rejected"
              ? "Rejected"
              : "Pending review"}
          </span>
        </div>

        {fundraiser.approval_status === "pending_review" && !canApprove && (
          <p className="text-sm text-[var(--color-text-dim)]">
            Waiting on CIO approval. Nothing is publicly visible yet — the donation form isn't active and no
            WordPress page has been created. You'll see this update once it's reviewed.
          </p>
        )}

        {fundraiser.approval_status === "rejected" && (
          <p className="text-sm text-red-600">
            <strong>Rejected:</strong> {fundraiser.rejection_reason}
          </p>
        )}

        {fundraiser.approval_status === "pending_review" && canApprove && (
          <div className="mt-2">
            <p className="text-sm text-[var(--color-text-dim)] mb-3">
              Approving activates the CharityStack donation form and publishes the WordPress page automatically —
              no WordPress access needed on your end either, it all happens server-side.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleApprove}
                disabled={approving}
                className="text-sm rounded-lg bg-[var(--color-accent)] text-white px-4 py-2 disabled:opacity-50"
              >
                {approving ? "Approving..." : "Approve & Publish"}
              </button>
              <button
                onClick={() => setShowRejectForm((s) => !s)}
                className="text-sm rounded-lg border border-red-300 text-red-600 px-4 py-2 hover:border-red-500"
              >
                Reject
              </button>
            </div>
            {showRejectForm && (
              <div className="mt-3">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={2}
                  placeholder="Reason — shown to whoever submitted this"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] mb-2"
                />
                <button
                  onClick={handleReject}
                  disabled={rejecting || !rejectReason.trim()}
                  className="text-sm rounded-lg bg-red-600 text-white px-4 py-2 disabled:opacity-50"
                >
                  {rejecting ? "Rejecting..." : "Confirm Rejection"}
                </button>
              </div>
            )}
          </div>
        )}

        {warning && <p className="text-sm text-amber-700 mt-3">{warning}</p>}
      </section>

      {/* Everything below only matters/shows once approved */}
      {approved && (
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium">CharityStack</h2>
            <span
              className={
                "text-xs px-2 py-1 rounded-full " +
                (fundraiser.sync_status === "synced"
                  ? "bg-green-500/10 text-green-700"
                  : "bg-red-500/10 text-red-700")
              }
            >
              {fundraiser.sync_status === "synced" ? "Live" : "Sync error"}
            </span>
          </div>
          {fundraiser.sync_status === "error" && <p className="text-sm text-red-600 mb-3">{fundraiser.sync_error}</p>}
          {fundraiser.charitystack_form_url && (
            <p className="text-sm text-[var(--color-text-dim)]">
              <a href={fundraiser.charitystack_form_url} target="_blank" rel="noreferrer" className="underline">
                {fundraiser.charitystack_form_url}
              </a>
            </p>
          )}
          {fundraiser.sync_status !== "synced" && canApprove && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="mt-3 text-sm rounded-lg border border-[var(--color-accent)]/40 text-[var(--color-accent)] px-4 py-2 hover:border-[var(--color-accent)] disabled:opacity-50"
            >
              {syncing ? "Retrying..." : "Retry Sync"}
            </button>
          )}
        </section>
      )}

      {approved && (
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium">Fundraiser Page (GoFundMe-style)</h2>
            <span
              className={
                "text-xs px-2 py-1 rounded-full " +
                (fundraiser.wp_sync_status === "created"
                  ? "bg-green-500/10 text-green-700"
                  : "bg-red-500/10 text-red-700")
              }
            >
              {fundraiser.wp_sync_status === "created" ? "Live" : "Error"}
            </span>
          </div>
          {fundraiser.wp_sync_status === "error" && <p className="text-sm text-red-600 mb-3">{fundraiser.wp_sync_error}</p>}
          {fundraiser.wp_page_url && (
            <p className="text-sm text-[var(--color-text-dim)] mb-3">
              Live at{" "}
              <a href={fundraiser.wp_page_url} target="_blank" rel="noreferrer" className="underline">
                {fundraiser.wp_page_url}
              </a>
            </p>
          )}
          {canApprove && (
            <button
              onClick={handleCreatePage}
              disabled={creatingPage}
              className="text-sm rounded-lg bg-[var(--color-accent)] text-white px-4 py-2 disabled:opacity-50"
            >
              {creatingPage ? "Publishing..." : "Regenerate Page"}
            </button>
          )}

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

      {approved && fundraiser.is_published && (
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="text-sm font-medium mb-3">Also Embed On An Existing Page (optional)</h2>
          <p className="text-sm text-[var(--color-text-dim)] mb-3">
            Same live donate widget as the standalone page above — use this shortcode if {officeName} also wants
            it embedded inside an existing page on the site.
          </p>
          <div className="flex gap-2">
            <code className="flex-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm">{shortcode}</code>
            <button
              onClick={copyShortcode}
              className="text-sm rounded-lg border border-[var(--color-border)] px-3 py-2 hover:border-[var(--color-accent)]"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </section>
      )}

      {approved && (
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
