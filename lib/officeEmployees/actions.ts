// Office Employees actions (server only): office keys, offboarding,
// new-hire requests. Callers check access with getOfficeViewer first.

import { createAdminClient } from "@/lib/supabase/server";
import { graphPatch, graphPost } from "@/lib/msgraph";
import { assetsFor, type Assets, type Office, type OfficeViewer, type Person } from "./server";

type Admin = ReturnType<typeof createAdminClient>;
const fmtDate = (d: string | null | undefined) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "not set");

// A Help Desk ticket created on someone's behalf (server-side, so it
// works no matter what the manager's own helpdesk access is).
async function createTicket(
  admin: Admin,
  t: { title: string; description: string; by: OfficeViewer; department: "hr" | "it"; category: string; priority?: "normal" | "high" | "urgent" }
) {
  const { data: req, error } = await admin
    .from("helpdesk_requests")
    .insert({ title: t.title.slice(0, 200), description: t.description, submitted_by: t.by.name, submitted_by_email: t.by.email, overall_status: "open" })
    .select("id, ticket_number")
    .single();
  if (error || !req) throw new Error(`Couldn't create the ${t.department.toUpperCase()} ticket: ${error?.message}`);
  const { error: legErr } = await admin.from("helpdesk_request_legs").insert({ request_id: req.id, department: t.department, category: t.category, priority: t.priority ?? "normal", status: "open" });
  if (legErr) {
    await admin.from("helpdesk_requests").delete().eq("id", req.id);
    throw new Error(`Couldn't create the ${t.department.toUpperCase()} ticket: ${legErr.message}`);
  }
  return req as { id: string; ticket_number: string | null };
}

// ---------- keys ----------
export async function listOfficeKeys(officeId: string) {
  const admin = createAdminClient();
  const [{ data: keys }, { data: held }] = await Promise.all([
    admin.from("office_keys").select("id, label, key_code, notes, status, created_at").eq("office_id", officeId).order("label"),
    admin.from("office_key_assignments").select("id, key_id, holder_name, holder_email, assigned_at").eq("office_id", officeId).is("returned_at", null),
  ]);
  const holder = new Map(((held ?? []) as any[]).map((h) => [h.key_id, h]));
  return ((keys ?? []) as any[]).map((k) => ({ ...k, holder: holder.get(k.id) ?? null }));
}

export async function addOfficeKey(viewer: OfficeViewer, input: { label: string; key_code?: string | null; notes?: string | null }) {
  const label = input.label.trim().slice(0, 100);
  if (!label) throw new Error("Give the key a name, like Front door.");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("office_keys")
    .insert({ office_id: viewer.office.id, label, key_code: input.key_code?.trim().slice(0, 50) || null, notes: input.notes?.trim().slice(0, 300) || null, created_by: viewer.employeeId })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't add the key.");
  return data.id as string;
}

export async function setKeyStatus(viewer: OfficeViewer, keyId: string, status: "active" | "lost" | "retired") {
  const admin = createAdminClient();
  const { data: key } = await admin.from("office_keys").select("id").eq("id", keyId).eq("office_id", viewer.office.id).maybeSingle();
  if (!key) throw new Error("Key not found.");
  if (status !== "active") {
    // A lost/retired key isn't with anyone any more.
    await admin
      .from("office_key_assignments")
      .update({ returned_at: new Date().toISOString(), returned_by: viewer.employeeId, return_note: status === "lost" ? "Marked lost" : "Key retired" })
      .eq("key_id", keyId)
      .is("returned_at", null);
  }
  await admin.from("office_keys").update({ status }).eq("id", keyId);
}

export async function assignKey(viewer: OfficeViewer, keyId: string, person: Pick<Person, "email" | "name" | "entraId">) {
  const admin = createAdminClient();
  const { data: key } = await admin.from("office_keys").select("id, status, label").eq("id", keyId).eq("office_id", viewer.office.id).maybeSingle();
  if (!key) throw new Error("Key not found.");
  if (key.status !== "active") throw new Error(`${key.label} is marked ${key.status}.`);
  const { error } = await admin.from("office_key_assignments").insert({
    key_id: keyId,
    office_id: viewer.office.id,
    holder_email: person.email,
    holder_name: person.name,
    holder_entra_id: person.entraId,
    assigned_by: viewer.employeeId,
  });
  if (error) throw new Error(error.code === "23505" ? `${key.label} is already assigned to someone. Return it first.` : error.message);
}

export async function returnKey(viewer: OfficeViewer, assignmentId: string, note?: string | null) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("office_key_assignments")
    .update({ returned_at: new Date().toISOString(), returned_by: viewer.employeeId, return_note: note?.trim().slice(0, 300) || null })
    .eq("id", assignmentId)
    .eq("office_id", viewer.office.id)
    .is("returned_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That key was already returned.");
}

// ---------- offboarding ----------
function assetChecklist(a: Assets, opts: { fullDevices: boolean }) {
  const lines: string[] = [];
  if (opts.fullDevices) {
    a.devicesFull.forEach((d) => lines.push(`[ ] Device: ${d.model}${d.serial ? ` — serial ${d.serial}` : ""}${d.name ? ` (${d.name})` : ""}`));
  } else {
    a.devices.forEach((d) => lines.push(`[ ] Device: ${d.model}`));
  }
  a.keys.forEach((k) => lines.push(`[ ] Office key: ${k.label}${k.code ? ` #${k.code}` : ""}`));
  a.vehicles.forEach((v) => lines.push(`[ ] Vehicle (primary driver): ${v.label}`));
  if (a.driver && !a.vehicles.length) lines.push(`[ ] Remove from the approved driver list`);
  if (a.pex.count) lines.push(`[ ] PEX card${a.pex.count > 1 ? `s (${a.pex.count})` : ""}: close/collect`);
  return lines.length ? lines.join("\n") : "Nothing on record in the portal.";
}

export async function offboardEmployee(viewer: OfficeViewer, person: Person, input: { lastDay: string | null; notes: string | null }) {
  const admin = createAdminClient();
  if (person.email === viewer.email.toLowerCase()) throw new Error("You can't offboard yourself.");
  if (input.lastDay && !/^\d{4}-\d{2}-\d{2}$/.test(input.lastDay)) throw new Error("Pick their last day.");

  // Portal admins are offboarded by IT, not from an office page.
  if (person.employeeId) {
    const { data: e } = await admin.from("employees").select("role").eq("id", person.employeeId).maybeSingle();
    if (e?.role === "admin" && !viewer.isAdmin) throw new Error("This person is a portal admin. Ask IT to offboard them.");
  }
  const { data: open } = await admin
    .from("employee_offboardings")
    .select("id, created_at")
    .ilike("email", person.email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
    .limit(1)
    .maybeSingle();
  if (open) throw new Error(`Offboarding was already started on ${new Date(open.created_at).toLocaleDateString()}.`);

  const assets = await assetsFor(viewer.office, person);
  const now = new Date().toISOString();

  // 1. Sign-in off first, so nothing else depends on it.
  let signinDisabledAt: string | null = null;
  let signinError: string | null = null;
  if (person.entraId) {
    try {
      await graphPatch(`/users/${person.entraId}`, { accountEnabled: false });
      signinDisabledAt = now;
      // Sign them out of every device/app too. Not fatal if this one fails.
      await graphPost(`/users/${person.entraId}/revokeSignInSessions`, {}).catch((e) => {
        signinError = `Sign-in disabled, but signing them out everywhere failed: ${e instanceof Error ? e.message : e}`;
      });
    } catch (e) {
      signinError = `Couldn't disable their Microsoft 365 sign-in: ${e instanceof Error ? e.message : e}`;
    }
  } else {
    signinError = "No Microsoft 365 account is linked, so sign-in couldn't be disabled automatically.";
  }

  // Portal login too, if they have one.
  let portalDisabledAt: string | null = null;
  if (person.employeeId) {
    const { data: e } = await admin.from("employees").select("auth_user_id").eq("id", person.employeeId).maybeSingle();
    await admin.from("employees").update({ is_active: false }).eq("id", person.employeeId);
    if (e?.auth_user_id) {
      const { error } = await admin.auth.admin.updateUserById(e.auth_user_id, { ban_duration: "876000h" });
      if (!error) portalDisabledAt = now;
    } else portalDisabledAt = now;
  }

  const signinLine = signinDisabledAt
    ? `Microsoft 365 sign-in was disabled and all sessions revoked at ${new Date(now).toLocaleString("en-US", { timeZone: "America/Chicago" })} CT.${signinError ? ` (${signinError})` : ""}`
    : `⚠ ${signinError}`;
  const header = [
    `Employee: ${person.name} (${person.email})`,
    person.jobTitle ? `Title: ${person.jobTitle}` : null,
    `Office: ${viewer.office.field_office}`,
    `Last day: ${fmtDate(input.lastDay)}`,
    `Requested by: ${viewer.name} (${viewer.email})`,
    input.notes ? `Notes: ${input.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const openTickets = assets.tickets.length ? assets.tickets.map((t) => `• ${t.ticket_number ?? ""} ${t.title}`).join("\n") : "None";

  // 2. HR ticket: the official offboarding.
  const hr = await createTicket(admin, {
    by: viewer,
    department: "hr",
    category: "Offboarding",
    priority: "high",
    title: `Offboarding: ${person.name} — ${viewer.office.field_office}`,
    description: `${header}\n\n${signinLine}\n\nCompany assets to collect:\n${assetChecklist(assets, { fullDevices: false })}\n\nTheir open Help Desk tickets:\n${openTickets}`,
  });

  // 3. IT ticket: accounts and devices.
  const it = await createTicket(admin, {
    by: viewer,
    department: "it",
    category: "Offboarding",
    priority: "high",
    title: `Offboarding (IT): ${person.name} — ${viewer.office.field_office}`,
    description: `${header}\nHR ticket: ${hr.ticket_number ?? hr.id}\n\n${signinLine}\n\nIT to do:\n[ ] Confirm sign-in is disabled\n[ ] Remove licenses\n[ ] Hand mailbox / OneDrive to ${person.managerName ?? "their manager"}${
      person.managerEmail ? ` (${person.managerEmail})` : ""
    }\n[ ] Wipe/retire devices once returned\n\nDevices:\n${
      assets.devicesFull.length ? assets.devicesFull.map((d) => `[ ] ${d.model}${d.serial ? ` — serial ${d.serial}` : ""}${d.name ? ` (${d.name})` : ""}${d.os ? `, ${d.os}` : ""}`).join("\n") : "None on record."
    }`,
  });

  const { data: row } = await admin
    .from("employee_offboardings")
    .insert({
      office_id: viewer.office.id,
      entra_user_id: person.entraId,
      email: person.email,
      full_name: person.name,
      last_day: input.lastDay,
      notes: input.notes,
      assets,
      requested_by: viewer.employeeId,
      hr_request_id: hr.id,
      it_request_id: it.id,
      signin_disabled_at: signinDisabledAt,
      signin_error: signinError,
      portal_disabled_at: portalDisabledAt,
    })
    .select("id")
    .single();

  return { id: row?.id ?? null, hrTicket: hr, itTicket: it, signinDisabled: !!signinDisabledAt, signinError };
}

export async function latestOffboarding(email: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("employee_offboardings")
    .select("id, last_day, notes, created_at, signin_disabled_at, signin_error, hr_request_id, it_request_id, requested_by")
    .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const ids = [data.hr_request_id, data.it_request_id].filter(Boolean) as string[];
  const [{ data: reqs }, { data: by }] = await Promise.all([
    ids.length ? admin.from("helpdesk_requests").select("id, ticket_number, overall_status").in("id", ids) : Promise.resolve({ data: [] }),
    data.requested_by ? admin.from("employees").select("first_name, last_name").eq("id", data.requested_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const t = new Map(((reqs ?? []) as any[]).map((r) => [r.id, r]));
  return {
    ...data,
    requested_by_name: by ? `${(by as any).first_name ?? ""} ${(by as any).last_name ?? ""}`.trim() : null,
    hr_ticket: data.hr_request_id ? t.get(data.hr_request_id) ?? null : null,
    it_ticket: data.it_request_id ? t.get(data.it_request_id) ?? null : null,
  };
}

// ---------- new hire request ----------
export type NewHireInput = {
  full_name: string;
  job_title?: string;
  start_date?: string;
  employment_type?: string;
  personal_email?: string;
  phone?: string;
  supervisor?: string;
  needs?: string[];
  notes?: string;
};

const NEEDS = ["Microsoft 365 email account", "Laptop", "Phone", "PEX card", "Office key", "Vehicle / approved driver", "Portal access"];

export async function requestNewHire(viewer: OfficeViewer, input: NewHireInput) {
  const name = (input.full_name ?? "").trim().slice(0, 120);
  if (!name) throw new Error("Enter the new employee's name.");
  if (input.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.start_date)) throw new Error("Pick a start date.");
  const needs = (input.needs ?? []).filter((n) => NEEDS.includes(n));
  const admin = createAdminClient();
  const lines = [
    `New employee: ${name}`,
    input.job_title ? `Title: ${input.job_title}` : null,
    `Office: ${viewer.office.field_office}`,
    `Start date: ${fmtDate(input.start_date)}`,
    input.employment_type ? `Employment: ${input.employment_type}` : null,
    `Supervisor: ${input.supervisor?.trim() || viewer.name}`,
    input.personal_email ? `Personal email: ${input.personal_email}` : null,
    input.phone ? `Phone: ${input.phone}` : null,
    `Requested by: ${viewer.name} (${viewer.email})`,
    "",
    `Will need:\n${needs.length ? needs.map((n) => `[ ] ${n}`).join("\n") : "Not specified"}`,
    input.notes ? `\nNotes: ${input.notes}` : null,
  ].filter((l) => l !== null);
  const hr = await createTicket(admin, {
    by: viewer,
    department: "hr",
    category: "New Employee Onboarding",
    title: `New employee: ${name} — ${viewer.office.field_office}${input.start_date ? ` (starts ${fmtDate(input.start_date)})` : ""}`,
    description: lines.join("\n").slice(0, 5000),
  });
  await admin.from("employee_onboarding_requests").insert({
    office_id: viewer.office.id,
    full_name: name,
    job_title: input.job_title?.trim() || null,
    start_date: input.start_date || null,
    details: { ...input, needs },
    requested_by: viewer.employeeId,
    hr_request_id: hr.id,
  });
  return hr;
}

export const NEW_HIRE_NEEDS = NEEDS;

export async function onboardingRequests(officeId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("employee_onboarding_requests")
    .select("id, full_name, job_title, start_date, created_at, hr_request_id")
    .eq("office_id", officeId)
    .order("created_at", { ascending: false })
    .limit(20);
  const ids = ((data ?? []) as any[]).map((r) => r.hr_request_id).filter(Boolean);
  const { data: reqs } = ids.length ? await admin.from("helpdesk_requests").select("id, ticket_number, overall_status").in("id", ids) : { data: [] };
  const t = new Map(((reqs ?? []) as any[]).map((r) => [r.id, r]));
  return ((data ?? []) as any[]).map((r) => ({ ...r, ticket: r.hr_request_id ? t.get(r.hr_request_id) ?? null : null }));
}

export async function setOfficeEntraNames(office: Office, names: string[]) {
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 10);
  const admin = createAdminClient();
  const { error } = await admin.from("b2s_offices").update({ entra_office_names: clean }).eq("id", office.id);
  if (error) throw new Error(error.message);
  return clean;
}
