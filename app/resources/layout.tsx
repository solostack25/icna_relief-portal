import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { getResourcesUser } from "@/lib/resources/access";
import { ResourcesNav } from "./ui";

export const metadata = { title: "Resources · Vehicles, properties & insurance" };

export default async function ResourcesLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const me = await getResourcesUser(supabase);
  if (!me) redirect("/");
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 60px" }}>
      <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(22,48,43,0.5)", margin: "0 0 6px" }}>Resources</p>
      <ResourcesNav />
      {children}
    </main>
  );
}
