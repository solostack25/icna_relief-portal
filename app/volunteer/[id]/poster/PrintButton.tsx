"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-full bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white"
    >
      Print sign
    </button>
  );
}
