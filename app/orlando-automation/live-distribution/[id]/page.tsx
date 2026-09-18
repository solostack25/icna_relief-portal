import LiveDistributionSession from "./LiveDistributionSession";

export default async function LiveDistributionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveDistributionSession distributionId={id} />;
}
