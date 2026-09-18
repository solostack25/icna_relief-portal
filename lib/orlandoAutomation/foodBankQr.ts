// QR image URL for a client's food bank ID - rendered server-side by
// /api/orlando-automation/qr (bwip-js), so no browser QR library needed.
export function foodBankQrSrc(foodBankClientId: string | null | undefined): string | null {
  const v = foodBankClientId?.trim();
  return v ? `/api/orlando-automation/qr?text=${encodeURIComponent(v)}` : null;
}
