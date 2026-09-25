"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ASSETS, isAssetType } from "@/lib/resources/schema";
import AssetForm from "../../AssetForm";
import { card, dim, Empty, H1 } from "../../ui";

export default function NewAsset() {
  const { type } = useParams<{ type: string }>();
  const router = useRouter();
  const [offices, setOffices] = useState<{ id: string; field_office: string }[] | null>(null);
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    fetch("/api/resources/offices")
      .then((r) => r.json())
      .then((d) => {
        setOffices(d.offices ?? []);
        setCanManage(!!d.canManage);
      });
  }, []);

  if (!isAssetType(type)) return <Empty>Not found.</Empty>;
  const cfg = ASSETS[type];
  if (!offices) return <Empty>Loading…</Empty>;
  if (!offices.length) return <Empty>Your account isn't assigned to an office yet, so you can't add {cfg.plural.toLowerCase()}. Ask an admin to set your office.</Empty>;

  return (
    <div>
      <H1>Add a {cfg.singular.toLowerCase()}</H1>
      <p style={{ fontSize: 14, color: dim, margin: "-6px 0 16px" }}>
        Saving creates an insurance request automatically, using these details, and notifies Finance, IT, Administration, your regional
        director and area manager.
      </p>
      <div style={card}>
        <AssetForm
          type={type}
          offices={canManage ? offices : undefined}
          initial={canManage ? {} : { office_id: offices[0].id }}
          submitLabel={`Add ${cfg.singular.toLowerCase()}`}
          onSubmit={async (values) => {
            const r = await fetch(`/api/resources/${type}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
            const j = await r.json();
            if (!r.ok) return j.error ?? "Couldn't save.";
            router.push(`/resources/${type}/${j.id}?created=${encodeURIComponent(j.ticket ?? "")}`);
            return null;
          }}
        />
        {!canManage && <p style={{ fontSize: 12, color: dim, margin: "12px 0 0" }}>This will be added to {offices[0].field_office}.</p>}
      </div>
    </div>
  );
}
