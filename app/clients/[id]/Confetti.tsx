"use client";

// Lightweight CSS-only confetti burst, no dependencies. Uses the
// ICNA Relief brand colors (green, orange, plus a couple secondary
// tones) so it reads as "us" rather than generic party confetti.

const COLORS = ["#00A950", "#F28D1D", "#E9CE3F", "#476040"];
const PIECES = 24;

export default function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: PIECES }).map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.3;
        const duration = 1.2 + Math.random() * 0.8;
        const color = COLORS[i % COLORS.length];
        const size = 6 + Math.random() * 6;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              top: "-10px",
              left: `${left}%`,
              width: size,
              height: size,
              backgroundColor: color,
              opacity: 0.9,
              borderRadius: Math.random() > 0.5 ? "50%" : "2px",
              animation: `confetti-fall ${duration}s ease-in ${delay}s forwards`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(220px) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
