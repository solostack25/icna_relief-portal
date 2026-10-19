import { redirect } from "next/navigation";

// Moved under Reports → Power BI.
export default function OldPowerBiCompare() {
  redirect("/admin/powerbi/check");
}
