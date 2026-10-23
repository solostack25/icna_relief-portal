import { FLAG_LABELS } from "@/lib/pex/rules";
import { Pill } from "@/components/grantManagement/ui";
import { emerald, faint, gold, rose, sky } from "@/components/grantManagement/styles";

export const PEX_STATUS: Record<string, { label: string; color: string }> = {
  unmatched: { label: "To code", color: gold },
  partial: { label: "Partly coded", color: sky },
  coded: { label: "Coded", color: emerald },
  ignored: { label: "Excluded", color: "#7A8784" },
  pending: { label: "Pending at PEX", color: "#7A8784" },
};

export function PexStatusPill({ status, pending }: { status: string; pending?: boolean }) {
  const s = PEX_STATUS[pending ? "pending" : status] ?? { label: status, color: faint };
  return <Pill label={s.label} color={s.color} />;
}

export function FlagPills({ flags }: { flags: string[] | null | undefined }) {
  if (!flags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {flags.map((f) => (
        <span key={f} className="text-[10.5px] font-semibold rounded-full px-2 py-0.5" style={{ color: f === "refund" ? sky : rose, background: f === "refund" ? `${sky}12` : `${rose}10` }}>
          {FLAG_LABELS[f] ?? f}
        </span>
      ))}
    </div>
  );
}

export function CardStatusPill({ status }: { status: string | null }) {
  const s = (status ?? "").toUpperCase();
  const color = s === "ACTIVE" ? emerald : s === "BLOCKED" ? gold : s === "CLOSED" ? rose : "#7A8784";
  return <Pill label={s ? s.charAt(0) + s.slice(1).toLowerCase() : "Unknown"} color={color} />;
}

export const holderName = (c: { first_name?: string | null; last_name?: string | null } | null | undefined) =>
  c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed cardholder" : "—";

export function ago(iso: string | null | undefined) {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hr ago`;
  return `${Math.round(h / 24)} days ago`;
}
