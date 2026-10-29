import { getBalance, getDailyTraffic, getStatement, ipHealth, listEndpoints, listNumbers, listSmsReceipts, skyetelConfigured } from "@/lib/skyetelAdmin";
import { errorMessage } from "@/lib/phonesAdmin";
import SkyetelClient from "./SkyetelClient";

export const dynamic = "force-dynamic";

// Phones > Skyetel: numbers (routing, SMS, caller ID, E911), endpoints and
// their health, balance and usage, SMS delivery receipts, and buying numbers.
export default async function SkyetelPage() {
  if (!(await skyetelConfigured())) {
    return <SkyetelClient notConnected />;
  }

  const now = new Date();
  const from = new Date(now.getTime() - 30 * 86_400_000);
  const [numbers, endpoints, health, balance, statement, traffic, receipts] = await Promise.allSettled([
    listNumbers(),
    listEndpoints(),
    ipHealth(),
    getBalance(),
    getStatement(now.getFullYear(), now.getMonth() + 1),
    getDailyTraffic(from.toISOString(), now.toISOString()),
    listSmsReceipts(50),
  ]);

  const val = <T,>(r: PromiseSettledResult<T>, fallback: T) => (r.status === "fulfilled" ? r.value : fallback);
  const err = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? errorMessage(r.reason) : null);

  return (
    <SkyetelClient
      numbers={val(numbers, [])}
      endpoints={val(endpoints, [])}
      health={val(health, [])}
      balance={val(balance, { balance: null, credit: false })}
      totals={val(statement, {})?.statement?.totals ?? null}
      traffic={val(traffic, [])}
      receipts={val(receipts, [])}
      errors={{
        numbers: err(numbers),
        endpoints: err(endpoints),
        health: err(health),
        balance: err(balance),
        statement: err(statement),
        traffic: err(traffic),
        receipts: err(receipts),
      }}
    />
  );
}
