// Server-safe helpers for the Security pages (no hooks).
export * from "../devices/style";

export const SEVERITY_COLORS: Record<string, string> = {
  high: "#B5566B",
  medium: "#C2410C",
  low: "#A57420",
  informational: "#7A7A7A",
  unknownFutureValue: "#7A7A7A",
};

export function SeverityPill({ severity }: { severity: string | null }) {
  const s = (severity ?? "unknown").toLowerCase();
  const c = SEVERITY_COLORS[s] ?? "#7A7A7A";
  return (
    <span className="inline-flex text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap capitalize" style={{ color: c, background: `${c}14`, border: `1px solid ${c}33` }}>
      {s}
    </span>
  );
}

export function PageHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-2">
      <div className="min-w-0">
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: 0 }}>{title}</h1>
        {sub && (
          <p className="text-sm mt-1 max-w-3xl" style={{ color: "rgba(22,48,43,0.6)" }}>
            {sub}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

// Microsoft's remediation text is HTML; show it as plain text.
export function htmlToText(html: string | null | undefined) {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|h\d)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
