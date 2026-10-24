import { NextRequest, NextResponse } from "next/server";
import { getOfficeViewer, listOfficePeople, assetCounts, getOfficePerson, assetsFor } from "@/lib/officeEmployees/server";
import {
  listOfficeKeys,
  addOfficeKey,
  setKeyStatus,
  assignKey,
  returnKey,
  offboardEmployee,
  latestOffboarding,
  requestNewHire,
  onboardingRequests,
  setOfficeEntraNames,
  NEW_HIRE_NEEDS,
} from "@/lib/officeEmployees/actions";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// GET                 -> the office's people (with asset counts), keys, new-hire requests
// GET ?person=<key>   -> one person's profile and assets
export async function GET(req: NextRequest, { params }: { params: Promise<{ officeId: string }> }) {
  const { officeId } = await params;
  const viewer = await getOfficeViewer(officeId);
  if (!viewer) return NextResponse.json({ error: "You don't have access to this office's employees." }, { status: 403 });

  const key = req.nextUrl.searchParams.get("person");
  if (key) {
    const person = await getOfficePerson(viewer.office, key);
    if (!person) return NextResponse.json({ error: "That person isn't in this office." }, { status: 404 });
    const [assets, offboarding, keys] = await Promise.all([assetsFor(viewer.office, person), latestOffboarding(person.email, person.entraId), listOfficeKeys(officeId)]);
    return NextResponse.json({
      office: { id: viewer.office.id, name: viewer.office.field_office },
      person,
      // Managers see device MODELS only.
      assets: { ...assets, devicesFull: undefined },
      offboarding,
      availableKeys: keys.filter((k) => k.status === "active" && !k.holder).map((k) => ({ id: k.id, label: k.label, key_code: k.key_code })),
      isSelf: person.email === viewer.email.toLowerCase() || (!!person.employeeId && person.employeeId === viewer.employeeId),
    });
  }

  const [{ people, warning }, keys, hires] = await Promise.all([listOfficePeople(viewer.office), listOfficeKeys(officeId), onboardingRequests(officeId)]);
  const counts = await assetCounts(people);
  return NextResponse.json({
    office: { id: viewer.office.id, name: viewer.office.field_office, entra_office_names: viewer.office.entra_office_names },
    canEditMapping: viewer.isAdmin,
    warning,
    people: people.map((p) => ({ ...p, counts: counts.get(p.email) ?? { tickets: 0, devices: 0, keys: 0 } })),
    keys,
    newHires: hires,
    needsOptions: NEW_HIRE_NEEDS,
  });
}

// POST { action, ... }
export async function POST(req: Request, { params }: { params: Promise<{ officeId: string }> }) {
  const { officeId } = await params;
  const viewer = await getOfficeViewer(officeId);
  if (!viewer) return NextResponse.json({ error: "You don't have access to this office's employees." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  try {
    switch (action) {
      case "add_key": {
        const id = await addOfficeKey(viewer, { label: String(body.label ?? ""), key_code: body.key_code ?? null, notes: body.notes ?? null });
        return NextResponse.json({ ok: true, id });
      }
      case "key_status": {
        const status = body.status;
        if (!["active", "lost", "retired"].includes(status)) return NextResponse.json({ error: "Bad status" }, { status: 400 });
        await setKeyStatus(viewer, String(body.keyId), status);
        return NextResponse.json({ ok: true });
      }
      case "assign_key": {
        const person = await getOfficePerson(viewer.office, String(body.person ?? ""));
        if (!person) return NextResponse.json({ error: "That person isn't in this office." }, { status: 404 });
        let keyId = String(body.keyId ?? "");
        // Assign a brand-new key in one go.
        if (!keyId && body.newKey?.label) keyId = await addOfficeKey(viewer, { label: String(body.newKey.label), key_code: body.newKey.key_code ?? null });
        if (!keyId) return NextResponse.json({ error: "Pick a key." }, { status: 400 });
        await assignKey(viewer, keyId, person);
        return NextResponse.json({ ok: true });
      }
      case "return_key": {
        await returnKey(viewer, String(body.assignmentId ?? ""), body.note ?? null);
        return NextResponse.json({ ok: true });
      }
      case "offboard": {
        // Strict: their Microsoft 365 Office must be this office.
        const person = await getOfficePerson(viewer.office, String(body.person ?? ""), { strict: true });
        if (!person) return NextResponse.json({ error: "That person isn't in this office in Microsoft 365, so they can't be offboarded from here." }, { status: 404 });
        if (String(body.confirmName ?? "").trim().toLowerCase() !== person.name.trim().toLowerCase()) {
          return NextResponse.json({ error: `Type ${person.name} exactly to confirm.` }, { status: 400 });
        }
        const r = await offboardEmployee(viewer, person, {
          lastDay: body.lastDay ? String(body.lastDay) : null,
          notes: String(body.notes ?? "").trim().slice(0, 2000) || null,
        });
        return NextResponse.json({ ok: true, ...r });
      }
      case "new_hire": {
        const hr = await requestNewHire(viewer, body.hire ?? {});
        return NextResponse.json({ ok: true, ticket: hr });
      }
      case "set_office_names": {
        if (!viewer.isAdmin) return NextResponse.json({ error: "Admins only" }, { status: 403 });
        const names = Array.isArray(body.names) ? body.names.map(String) : String(body.names ?? "").split(/[,\n]/);
        const saved = await setOfficeEntraNames(viewer.office, names);
        return NextResponse.json({ ok: true, names: saved });
      }
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
