import DonorSessionView from "@/app/inkind/components/DonorSessionView";

// Standalone, session-specific donor URL — kept as a manual fallback
// (e.g. testing, or sharing a direct link) even though the normal flow
// is now the mounted /donor-kiosk screen, which finds and follows the
// active session automatically with no QR code or manual navigation.
export default function DonorScreen({
  params,
}: {
  params: { sessionId: string };
}) {
  return <DonorSessionView sessionId={params.sessionId} />;
}
