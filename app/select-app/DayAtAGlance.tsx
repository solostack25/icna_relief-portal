type StatCard = {
  label: string;
  value: number | string;
  connected: boolean;
};

function Card({ label, value, connected }: StatCard) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        connected
          ? "border-[var(--color-border)] bg-[var(--color-surface)]"
          : "border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/50"
      }`}
    >
      <div
        className={`text-2xl font-semibold ${
          connected ? "" : "text-[var(--color-text-dim)]"
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-[var(--color-text-dim)] mt-1">{label}</div>
      {!connected && (
        <div className="text-[10px] text-[var(--color-text-dim)] mt-1 italic">
          Not connected yet
        </div>
      )}
    </div>
  );
}

export default function DayAtAGlance({ cards }: { cards: StatCard[] }) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mb-8">
      <p className="text-xs text-[var(--color-text-dim)] mb-3">{today}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cards.map((c) => (
          <Card key={c.label} {...c} />
        ))}
      </div>
    </div>
  );
}
