"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

// Phone/tablet camera scanning for when there's no USB scanner at the
// curb. ZXing reads both the QR codes and the CODE128 barcodes printed on
// client ID cards. `paused` stops results (not the camera) while the
// serve modal is open so the same card isn't picked up twice.
export default function CameraScanner({ onScan, paused }: { onScan: (text: string) => void; paused: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pausedRef = useRef(paused);
  const lastRef = useRef<{ text: string; at: number } | null>(null);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState<string | null>(null);

  pausedRef.current = paused;
  onScanRef.current = onScan;

  useEffect(() => {
    let controls: IScannerControls | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        if (!videoRef.current || cancelled) return;
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          (result) => {
            if (!result || pausedRef.current) return;
            const text = result.getText().trim();
            const now = Date.now();
            // Same card held in frame keeps decoding - ignore repeats for 4s.
            if (lastRef.current && lastRef.current.text === text && now - lastRef.current.at < 4000) return;
            lastRef.current = { text, at: now };
            onScanRef.current(text);
          }
        );
        if (cancelled) controls.stop();
      } catch (err) {
        setError(
          err instanceof Error && err.name === "NotAllowedError"
            ? "Camera permission was denied - allow camera access for this site, or use a USB scanner."
            : "Couldn't start the camera on this device."
        );
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  return (
    <div className="rounded-xl overflow-hidden border border-[var(--color-border)] bg-black">
      {error ? (
        <p className="text-sm text-white p-4">{error}</p>
      ) : (
        <video ref={videoRef} className="w-full max-h-72 object-cover" muted playsInline />
      )}
    </div>
  );
}
