import { HelpdeskView } from "./HelpdeskView";

export default async function HelpdeskPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; status?: string }>;
}) {
  const { dept, status } = await searchParams;
  return <HelpdeskView dept={dept} status={status} />;
}
