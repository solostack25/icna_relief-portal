import { redirect } from "next/navigation";
import { getOrlandoAutomationAccess } from "@/lib/orlandoAutomation/access";
import HomeContent from "@/app/orlando-automation/_components/HomeContent";

export default async function OrlandoAutomationHome() {
  const access = await getOrlandoAutomationAccess();
  if (!access.ok) redirect(access.status === 401 ? "/" : "/select-app");

  return <HomeContent firstName={access.firstName || "there"} />;
}
