// Shipping address + grant on a Hardware Request ticket. No hooks, so it
// renders in both the server-rendered ticket page and the live leg card.
// tone: "quest" for the IT team's purple theme, "plain" for everyone else.

export type HardwareDetail = {
  ship_to_name?: string | null;
  ship_address_line1?: string | null;
  ship_address_line2?: string | null;
  ship_city?: string | null;
  ship_state?: string | null;
  ship_zip?: string | null;
  is_grant_purchase?: boolean | null;
  gm_grant_id?: string | null;
  grant_name?: string | null;
};

export function hasHardwareDetail(d: HardwareDetail | null | undefined) {
  return !!d && (!!d.ship_address_line1 || !!d.is_grant_purchase);
}

export default function HardwareDetailsView({ detail, tone }: { detail: HardwareDetail | null | undefined; tone: "quest" | "plain" }) {
  if (!detail || !hasHardwareDetail(detail)) return null;
  const quest = tone === "quest";
  const dim = quest ? "#9C8FD9" : "var(--color-text-dim)";
  const cityLine = [detail.ship_city, [detail.ship_state, detail.ship_zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  return (
    <div
      style={{
        marginTop: 10,
        padding: "10px 12px",
        borderRadius: 10,
        fontSize: 12.5,
        lineHeight: 1.5,
        background: quest ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
        border: quest ? "1px solid #3A2C68" : "1px solid var(--color-border)",
        display: "grid",
        gap: 8,
      }}
    >
      {detail.ship_address_line1 && (
        <div>
          <div style={{ color: dim, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Ship to</div>
          <div style={{ whiteSpace: "pre-line", userSelect: "all" }}>
            {[detail.ship_to_name, detail.ship_address_line1, detail.ship_address_line2, cityLine].filter(Boolean).join("\n")}
          </div>
        </div>
      )}
      <div>
        <div style={{ color: dim, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Grant purchase</div>
        {detail.is_grant_purchase ? (
          detail.gm_grant_id ? (
            <a href={`/grant-management/grants/${detail.gm_grant_id}`} style={{ color: quest ? "#00E5FF" : "var(--color-accent)", textDecoration: "underline" }}>
              {detail.grant_name ?? "View grant"}
            </a>
          ) : (
            <span>Yes{detail.grant_name ? ` · ${detail.grant_name}` : " (grant not picked; see description)"}</span>
          )
        ) : (
          <span>No</span>
        )}
      </div>
    </div>
  );
}
