// Office Dashboard -> Employees (server only).
//
// People in an office come from Microsoft 365 (their Office field,
// matched against the office's name or the Microsoft 365 office names an
// admin mapped to it), plus anyone assigned to the office in the portal.
// The profile shows what the organisation gave them - deliberately at a
// "what to collect back" level: device MODEL only, vehicle year/make/
// model, "has a PEX card", office keys, open tickets.

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getGraphToken } from "@/lib/msgraph";

export type Office = { id: string; field_office: string; region: string | null; state: string | null; entra_office_names: string[] };
export type OfficeViewer = {
  employeeId: string;
  email: string;
  name: string;
  role: string;
  isAdmin: boolean;
  isHr: boolean;
  office: Office;
};

export type Person = {
  key: string; // Entra object id, or "p:<employee id>" for portal-only people
  entraId: string | null;
  employeeId: string | null;
  name: string;
  email: string;
  jobTitle: string | null;
  department: string | null;
  officeLocation: string | null;
  accountEnabled: boolean | null;
  phone: string | null;
  managerName: string | null;
  managerEmail: string | null;
  /** The person's portal role, when they have a portal record. */
  portalRole?: string | null;
  /** More than one portal record matched - don't act on either. */
  ambiguousPortal?: boolean;
};

// HR is the helpdesk-hr grant itself (an IT grant manages every queue,
// but doesn't make someone HR for offboarding purposes).
async function isHrEmployee(employeeId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("employee_program_access").select("program_slug").eq("employee_id", employeeId).eq("program_slug", "helpdesk-hr").limit(1);
  return !!data?.length;
}
const esc = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

// Area manager for their office, regional director for offices in their
// region, HR (and IT, who manage every queue) and admins everywhere.
export async function getOfficeViewer(officeId: string): Promise<OfficeViewer | null> {
  if (!/^[0-9a-f-]{36}$/i.test(officeId)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase
    .from("employees")
    .select("id, role, email, first_name, last_name, assigned_office_id, assigned_region")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me) return null;
  const admin = createAdminClient();
  const { data: office } = await admin.from("b2s_offices").select("id, field_office, region, state, entra_office_names").eq("id", officeId).maybeSingle();
  if (!office) return null;

  const isAdmin = me.role === "admin";
  const isHr = isAdmin || (await isHrEmployee(me.id));
  const ok =
    isAdmin ||
    isHr ||
    (me.role === "area_manager" && me.assigned_office_id === officeId) ||
    (me.role === "regional_director" && !!me.assigned_region && norm(me.assigned_region) === norm(office.region));
  if (!ok) return null;
  return {
    employeeId: me.id,
    email: me.email,
    name: `${me.first_name ?? ""} ${me.last_name ?? ""}`.trim() || me.email,
    role: me.role,
    isAdmin,
    isHr,
    office: { ...office, entra_office_names: office.entra_office_names ?? [] } as Office,
  };
}

// Offices this person can open the Employees page for (for the office picker).
export async function officesForViewer(): Promise<{ offices: Pick<Office, "id" | "field_office" | "state" | "region">[]; scope: "all" | "region" | "own" | "none"; ownOfficeId: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { offices: [], scope: "none", ownOfficeId: null };
  const { data: me } = await supabase.from("employees").select("id, role, assigned_office_id, assigned_region").eq("auth_user_id", user.id).maybeSingle();
  if (!me) return { offices: [], scope: "none", ownOfficeId: null };
  const admin = createAdminClient();
  let q = admin.from("b2s_offices").select("id, field_office, state, region, is_active").order("field_office");
  let scope: "all" | "region" | "own" | "none" = "none";
  if (me.role === "admin" || (await isHrEmployee(me.id))) scope = "all";
  else if (me.role === "regional_director" && me.assigned_region?.trim()) {
    scope = "region";
    q = q.ilike("region", esc(me.assigned_region.trim()));
  } else if (me.role === "area_manager" && me.assigned_office_id) {
    scope = "own";
    q = q.eq("id", me.assigned_office_id);
  } else return { offices: [], scope: "none", ownOfficeId: null };
  const { data } = await q;
  return { offices: (data ?? []).filter((o: any) => o.is_active !== false), scope, ownOfficeId: me.assigned_office_id ?? null };
}

export function officeNames(office: Office) {
  const names = office.entra_office_names.length ? office.entra_office_names : [office.field_office];
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))];
}

// ---------- Microsoft 365 ----------
const SELECT = "id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation,accountEnabled,mobilePhone,businessPhones";

async function graph(path: string) {
  const token = await getGraphToken();
  let url: string | null = `https://graph.microsoft.com/v1.0${path}`;
  const out: any[] = [];
  while (url) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" }, cache: "no-store" });
    if (!res.ok) throw new Error(`Microsoft 365 lookup failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    if (!Array.isArray(data.value)) return data; // single object
    out.push(...data.value);
    url = data["@odata.nextLink"] ?? null;
  }
  return out;
}

const toPerson = (u: any): Person => ({
  key: u.id,
  entraId: u.id,
  employeeId: null,
  name: u.displayName ?? u.mail ?? u.userPrincipalName,
  email: (u.mail || u.userPrincipalName || "").toLowerCase(),
  jobTitle: u.jobTitle ?? null,
  department: u.department ?? null,
  officeLocation: u.officeLocation ?? null,
  accountEnabled: u.accountEnabled ?? null,
  phone: u.mobilePhone || u.businessPhones?.[0] || null,
  managerName: null,
  managerEmail: null,
});

export async function listOfficePeople(office: Office): Promise<{ people: Person[]; warning: string | null }> {
  const byEmail = new Map<string, Person>();
  let warning: string | null = null;
  try {
    for (const name of officeNames(office)) {
      const filter = `officeLocation eq '${name.replace(/'/g, "''")}'`;
      const rows = (await graph(`/users?$select=${SELECT}&$filter=${encodeURIComponent(filter)}&$count=true&$top=999`)) as any[];
      for (const u of rows) {
        const p = toPerson(u);
        if (p.email) byEmail.set(p.email, p);
      }
    }
  } catch (e) {
    warning = `Couldn't read Microsoft 365 right now, so only people assigned to this office in the portal are shown. (${e instanceof Error ? e.message : e})`;
  }

  // Link portal records case-insensitively, by Microsoft 365 id first.
  const admin = createAdminClient();
  const { data: allPortal } = await admin.from("employees").select("id, first_name, last_name, email, job_title, ad_object_id, is_active, manager_email, assigned_office_id, role");
  const portalRows = (allPortal ?? []) as any[];
  const byAd = new Map(portalRows.filter((e) => e.ad_object_id).map((e) => [e.ad_object_id, e]));
  const byMail = new Map<string, any[]>();
  for (const e of portalRows) {
    const k = norm(e.email);
    if (k) byMail.set(k, [...(byMail.get(k) ?? []), e]);
  }
  for (const p of byEmail.values()) {
    const hit = (p.entraId && byAd.get(p.entraId)) || (byMail.get(p.email)?.length === 1 ? byMail.get(p.email)![0] : null);
    if (hit) {
      p.employeeId = hit.id;
      p.portalRole = hit.role ?? null;
    }
  }
  const linked = new Set([...byEmail.values()].map((p) => p.employeeId).filter(Boolean));
  for (const e of portalRows.filter((r) => r.assigned_office_id === office.id && !linked.has(r.id))) {
    const email = norm(e.email);
    // No email: key by the portal id so people don't collapse into one row.
    byEmail.set(email || `p:${e.id}`, {
      key: e.ad_object_id || `p:${e.id}`,
      entraId: e.ad_object_id ?? null,
      employeeId: e.id,
      name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || e.email || "Unnamed",
      email,
      jobTitle: e.job_title ?? null,
      department: null,
      officeLocation: null,
      accountEnabled: e.is_active === false ? false : null,
      phone: null,
      managerName: null,
      managerEmail: e.manager_email ?? null,
      portalRole: e.role ?? null,
    });
  }
  return { people: [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name)), warning };
}

// One person, verified to belong to this office.
//   strict = true (used before offboarding): someone with a Microsoft 365
//   account must have this office in their Microsoft 365 Office field - an
//   out-of-date portal office assignment isn't enough to disable anyone.
export async function getOfficePerson(office: Office, key: string, opts: { strict?: boolean } = {}): Promise<Person | null> {
  const admin = createAdminClient();
  const names = officeNames(office).map((n) => n.toLowerCase());

  const portalFor = async (entraId: string | null, email: string) => {
    const filters = [entraId ? `ad_object_id.eq.${entraId}` : null, email ? `email.ilike.${esc(email)}` : null].filter(Boolean).join(",");
    if (!filters) return { row: null as any, ambiguous: false };
    const { data } = await admin.from("employees").select("*").or(filters).limit(3);
    const rows = (data ?? []) as any[];
    const exact = rows.find((r) => entraId && r.ad_object_id === entraId);
    if (exact) return { row: exact, ambiguous: false };
    return rows.length > 1 ? { row: null, ambiguous: true } : { row: rows[0] ?? null, ambiguous: false };
  };
  const fromPortal = (e: any): Person => ({
    key: e.ad_object_id || `p:${e.id}`,
    entraId: e.ad_object_id ?? null,
    employeeId: e.id,
    name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || e.email || "Unnamed",
    email: norm(e.email),
    jobTitle: e.job_title ?? null,
    department: null,
    officeLocation: null,
    accountEnabled: e.is_active === false ? false : null,
    phone: null,
    managerName: null,
    managerEmail: e.manager_email ?? null,
    portalRole: e.role ?? null,
  });

  if (key.startsWith("p:")) {
    const id = key.slice(2);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data: e } = await admin.from("employees").select("*").eq("id", id).maybeSingle();
    if (!e) return null;
    // Linked to Microsoft 365: always check it the Microsoft 365 way.
    if (e.ad_object_id) return getOfficePerson(office, e.ad_object_id, opts);
    if (e.assigned_office_id !== office.id) return null;
    return fromPortal(e);
  }
  if (!/^[0-9a-f-]{36}$/i.test(key)) return null;

  let u: any = null;
  let graphDown = false;
  try {
    u = await graph(`/users/${key}?$select=${SELECT},onPremisesSyncEnabled`);
  } catch (e) {
    // A real "no such user" vs Microsoft 365 being unavailable.
    graphDown = !/\((404|400)\)/.test(e instanceof Error ? e.message : "");
  }
  if (!u) {
    if (!graphDown || opts.strict) return null;
    // Microsoft 365 is unavailable: fall back to the portal record (view only).
    const { data: e } = await admin.from("employees").select("*").eq("ad_object_id", key).maybeSingle();
    return e && e.assigned_office_id === office.id ? fromPortal(e) : null;
  }

  const p = toPerson(u);
  const { row, ambiguous } = await portalFor(p.entraId, p.email);
  const m365Match = names.includes((p.officeLocation ?? "").toLowerCase());
  const inOffice = opts.strict ? m365Match : m365Match || row?.assigned_office_id === office.id;
  if (!inOffice) return null;
  p.employeeId = row?.id ?? null;
  p.portalRole = row?.role ?? null;
  p.ambiguousPortal = ambiguous;
  (p as any).onPremisesSyncEnabled = !!u.onPremisesSyncEnabled;
  try {
    const m = await graph(`/users/${key}/manager?$select=displayName,mail,userPrincipalName`);
    p.managerName = m?.displayName ?? null;
    p.managerEmail = (m?.mail || m?.userPrincipalName || null)?.toLowerCase() ?? null;
  } catch {
    // no manager set
  }
  return p;
}

// ---------- assets ----------
export type Assets = {
  tickets: { id: string; ticket_number: string | null; title: string; created_at: string; department: string | null; status: string | null }[];
  devices: { key: string; model: string }[];
  // IT gets the full device details on the offboarding ticket; the profile only shows the model.
  devicesFull: { model: string; serial: string | null; name: string | null; os: string | null }[];
  vehicles: { label: string; primary: boolean }[];
  driver: { status: string | null } | null;
  pex: { count: number };
  keys: { assignmentId: string; keyId: string; label: string; code: string | null; assignedAt: string }[];
};

export async function assetsFor(office: Office, person: Pick<Person, "email" | "employeeId" | "entraId">): Promise<Assets> {
  const admin = createAdminClient();
  const email = norm(person.email);
  const esc = email.replace(/[\\%_]/g, (c) => `\\${c}`);

  const [reqs, devices, drivers, pex, keys] = await Promise.all([
    admin
      .from("helpdesk_requests")
      .select("id, ticket_number, title, created_at, overall_status")
      .ilike("submitted_by_email", esc)
      .eq("overall_status", "open")
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("it_devices")
      .select("device_key, model, manufacturer, serial_number, display_name, operating_system, owner_upn, primary_user_upn, employee_id, ownership")
      .is("removed_at", null)
      .or(`owner_upn.ilike.${esc},primary_user_upn.ilike.${esc}${person.employeeId ? `,employee_id.eq.${person.employeeId}` : ""}`),
    admin
      .from("res_drivers")
      .select("id, status, email, employee_id")
      .or(`email.ilike.${esc}${person.employeeId ? `,employee_id.eq.${person.employeeId}` : ""}`),
    admin.from("pex_cards").select("id, card_status").ilike("email", esc),
    admin
      .from("office_key_assignments")
      .select("id, key_id, assigned_at, office_keys:key_id(label, key_code)")
      .ilike("holder_email", esc)
      .is("returned_at", null),
  ]);

  // Which IT/HR/etc. part each open ticket is sitting with.
  const reqRows = (reqs.data ?? []) as { id: string; ticket_number: string | null; title: string; created_at: string }[];
  const legInfo = new Map<string, { department: string; status: string }>();
  if (reqRows.length) {
    const { data: legs } = await admin
      .from("helpdesk_request_legs")
      .select("request_id, department, status, created_at")
      .in("request_id", reqRows.map((r) => r.id))
      .not("status", "in", "(closed,handed_off)")
      .order("created_at");
    for (const l of (legs ?? []) as { request_id: string; department: string; status: string }[]) legInfo.set(l.request_id, { department: l.department, status: l.status });
  }

  // Company devices only - a personal phone that's merely registered isn't ours to collect.
  const devRows = ((devices.data ?? []) as any[]).filter((d) => d.ownership !== "personal");
  const model = (d: any) => [d.manufacturer && !String(d.model ?? "").toLowerCase().startsWith(String(d.manufacturer).toLowerCase()) ? d.manufacturer : null, d.model].filter(Boolean).join(" ") || "Device (model unknown)";

  const driverRows = ((drivers.data ?? []) as { id: string; status: string | null }[]).filter((d) => d.status !== "removed");
  let vehicles: Assets["vehicles"] = [];
  if (driverRows.length) {
    const { data: veh } = await admin
      .from("res_vehicles")
      .select("year, make, model, primary_driver_id, status")
      .in("primary_driver_id", driverRows.map((d) => d.id))
      .or("status.is.null,status.neq.removed");
    vehicles = ((veh ?? []) as any[]).map((v) => ({ label: [v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle", primary: true }));
  }

  return {
    tickets: reqRows.map((r) => ({ ...r, department: legInfo.get(r.id)?.department ?? null, status: legInfo.get(r.id)?.status ?? null })),
    devices: devRows.map((d) => ({ key: d.device_key, model: model(d) })),
    devicesFull: devRows.map((d) => ({ model: model(d), serial: d.serial_number ?? null, name: d.display_name ?? null, os: d.operating_system ?? null })),
    vehicles,
    driver: driverRows[0] ? { status: driverRows[0].status } : null,
    pex: { count: ((pex.data ?? []) as { card_status: string | null }[]).filter((c) => !/closed|terminated|deleted/i.test(c.card_status ?? "")).length },
    keys: ((keys.data ?? []) as any[]).map((k) => ({ assignmentId: k.id, keyId: k.key_id, label: k.office_keys?.label ?? "Key", code: k.office_keys?.key_code ?? null, assignedAt: k.assigned_at })),
  };
}

// Counts for the list page in one case-insensitive query (see the
// office_asset_counts function in office_employees_migration.sql).
export async function assetCounts(people: Person[]) {
  const admin = createAdminClient();
  const emails = [...new Set(people.map((p) => p.email).filter(Boolean))];
  const counts = new Map<string, { tickets: number; devices: number; keys: number }>();
  for (const e of emails) counts.set(e, { tickets: 0, devices: 0, keys: 0 });
  if (!emails.length) return counts;
  const { data } = await admin.rpc("office_asset_counts", { p_emails: emails });
  for (const r of (data ?? []) as { email: string; tickets: number; devices: number; keys: number }[]) {
    counts.set(r.email, { tickets: r.tickets, devices: r.devices, keys: r.keys });
  }
  return counts;
}
