import { getThreeCxConfig } from "@/lib/threecx";
import { getOfficeHours, listHolidays, listQueues, listReceptionists, listRingGroups, listUsersLite } from "@/lib/threecxAdmin";
import { errorMessage } from "@/lib/phonesAdmin";
import NotConnected from "../NotConnected";
import RoutingClient from "./RoutingClient";

export const dynamic = "force-dynamic";

// Phones > Routing: queues, ring groups, menus (digital receptionists),
// system office hours and holidays.
export default async function PhonesRoutingPage() {
  if (!(await getThreeCxConfig())) return <NotConnected />;
  const [queues, groups, menus, users, hours, holidays] = await Promise.allSettled([
    listQueues(),
    listRingGroups(),
    listReceptionists(),
    listUsersLite(),
    getOfficeHours(),
    listHolidays(),
  ]);
  const v = <T,>(r: PromiseSettledResult<T>, f: T) => (r.status === "fulfilled" ? r.value : f);
  const e = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? errorMessage(r.reason) : null);
  return (
    <RoutingClient
      queues={v(queues, [])}
      groups={v(groups, [])}
      menus={v(menus, [])}
      users={v(users, []).map((u) => ({ Number: u.Number, Name: [u.FirstName, u.LastName].filter(Boolean).join(" ") || u.Number }))}
      hours={v(hours, null)}
      holidays={v(holidays, [])}
      errors={{ queues: e(queues), groups: e(groups), menus: e(menus), users: e(users), hours: e(hours), holidays: e(holidays) }}
    />
  );
}
