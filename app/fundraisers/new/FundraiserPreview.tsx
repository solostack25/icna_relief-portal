"use client";

// Mirrors the visual structure of icna-fnd-card (wordpress-plugin/icna-fundraisers.php)
// and buildFundraiserPageContent (lib/wordpress.ts) so what's shown here matches what
// actually gets published — this is a preview, not a separate design.
export default function FundraiserPreview({
  title,
  organizerName,
  officeName,
  headerImage,
  description,
  story,
  goal,
  color,
  eventDate,
  startTime,
  location,
  formType,
}: {
  title: string;
  organizerName: string;
  officeName: string;
  headerImage: string;
  description: string;
  story: string;
  goal: string;
  color: string;
  eventDate: string;
  startTime: string;
  location: string;
  formType: "fundraising" | "event";
}) {
  const storyParagraphs = (story || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden" style={{ ["--icna-fnd-color" as any]: color }}>
      {headerImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={headerImage} alt="" className="w-full h-44 object-cover" />
      ) : (
        <div className="w-full h-44 flex items-center justify-center text-xs text-[var(--color-text-dim)] bg-black/[0.03]">
          Hero image preview
        </div>
      )}

      <div className="p-5">
        <h3 className="text-lg font-bold mb-1">{title || "Your fundraiser title"}</h3>
        <p className="text-xs text-[var(--color-text-dim)] mb-3">
          Organized by {organizerName}
          {officeName ? ` · ${officeName}` : ""}
        </p>

        {formType === "event" && (eventDate || location) && (
          <p className="text-xs text-[var(--color-text-dim)] mb-3">
            {[eventDate, startTime, location].filter(Boolean).join(" · ")}
          </p>
        )}

        {description && <p className="text-sm mb-3">{description}</p>}

        {goal && (
          <div className="mb-4">
            <div className="h-2 rounded-full bg-black/[0.08] overflow-hidden mb-1">
              <div className="h-full" style={{ width: "0%", background: color }} />
            </div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)]">
              $0 raised of ${Number(goal).toLocaleString()} goal
            </p>
          </div>
        )}

        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-center text-xs text-[var(--color-text-dim)] mb-4">
          Donate button appears here once this fundraiser is approved
        </div>

        {storyParagraphs.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Our Story</h4>
            {storyParagraphs.map((p, i) => (
              <p key={i} className="text-sm mb-2 text-[var(--color-text-dim)]">
                {p}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
