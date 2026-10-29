import Link from "next/link";
import { card } from "./ui";

export default function NotConnected() {
  return (
    <div className="rounded-2xl p-6" style={card}>
      <h2 className="text-lg font-bold m-0 mb-1">3CX isn&apos;t connected</h2>
      <p className="text-sm m-0" style={{ color: "rgba(22,48,43,0.68)" }}>
        Add the 3CX API URL, client ID and secret under{" "}
        <Link href="/admin/connectors" className="underline" style={{ color: "#1F6F54" }}>
          Admin › Connectors
        </Link>
        . In 3CX (Admin › Integrations › API), the client needs <strong>Configuration API access with the System Owner or System Admin role</strong> for
        extensions, routing and call history, and <strong>Call Control API access</strong> with the extensions you want to transfer calls for.
      </p>
    </div>
  );
}
