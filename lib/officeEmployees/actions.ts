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

// Roles an area manager / regional director may offboard from an office
// page. Anyone else (directors, HR, IT, admins) is offboarded by HR or an admin.
const MANAGER_OFFBOARDABLE = new Set(["staff", "area_manager"]);

export async function offboardEmployee(viewer: OfficeViewer, person: Person, input: { lastDay: string | null; notes: string | null }) {
  const admin = createAdminClient();
  const email = (person.email ?? "").trim().toLowerCase();
  if (!email) throw new Error("This person has no email address on record, so they can't be offboarded from here. Ask HR.");
  if (email === viewer.email.toLowerCase() || (person.employeeId && person.employeeId === viewer.employeeId)) throw new Error("You can't offboard yourself.");
  if (input.lastDay && !/^\d{4}-\d{2}-\d{2}$/.test(input.lastDay)) throw new Error("Pick their last day.");
  if (person.ambiguousPortal) throw new Error("More than one portal record matches this person, so IT needs to offboard them.");
  if (person.portalRole === "admin" && !viewer.isAdmin) throw new Error("This person is a portal admin. Ask IT to offboard them.");
  if (person.portalRole && !MANAGER_OFFBOARDABLE.has(person.portalRole) && !viewer.isAdmin && !viewer.isHr) {
    throw new Error(`This person is a ${person.portalRole.replace(/_/g, " ")}, so HR offboards them.`);
  }

  const assets = await assetsFor(viewer.office, person);

  // 1. Claim it. The unique index allows one in-progress offboarding per
  //    person, so a double-click or two managers at once can't both go.
  const { data: claim, error: claimErr } = await admin
    .from("employee_offboardings")
    .insert({
      office_id: viewer.office.id,
      entra_user_id: person.entraId,
      email,
      full_name: person.name,
      last_day: input.lastDay,
      notes: input.notes,
      assets,
      requested_by: viewer.employeeId,
      status: "started",
    })
    .select("id")
    .single();
  if (claimErr || !claim) {
    if (claimErr?.code === "23505") throw new Error("Offboarding is already in progress for this person.");
    throw new Error(`Couldn't start offboarding: ${claimErr?.message ?? "unknown error"}`);
  }

  const header = [
    `Employee: ${person.name} (${email})`,
    person.jobTitle ? `Title: ${person.jobTitle}` : null,
    `Office: ${viewer.office.field_office}`,
    `Last day: ${fmtDate(input.lastDay)}`,
    `Requested by: ${viewer.name} (${viewer.email})`,
    input.notes ? `Notes: ${input.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const openTickets = assets.tickets.length ? assets.tickets.map((t) => `• ${t.ticket_number ?? ""} ${t.title}`).join("\n") : "None";
  const hrBody = (signin: string) =>
    `${header}\n\n${signin}\n\nCompany assets to collect:\n${assetChecklist(assets, { fullDevices: false })}\n\nTheir open Help Desk tickets:\n${openTickets}`;
  const itBody = (signin: string, hrNumber: string) =>
    `${header}\nHR ticket: ${hrNumber}\n\n${signin}\n\nIT to do:\n[ ] Confirm sign-in is disabled\n[ ] Remove licenses\n[ ] Hand mailbox / OneDrive to ${person.managerName ?? "their manager"}${
      person.managerEmail ? ` (${person.managerEmail})` : ""
    }\n[ ] Wipe/retire devices once returned\n\nDevices:\n${
      assets.devicesFull.length ? assets.devicesFull.map((d) => `[ ] ${d.model}${d.serial ? ` — serial ${d.serial}` : ""}${d.name ? ` (${d.name})` : ""}${d.os ? `, ${d.os}` : ""}`).join("\n") : "None on record."
    }`;

  // 2. Tickets before anything is disabled, so nobody is ever locked out
  //    without HR and IT knowing.
  let hr: { id: string; ticket_number: string | null };
  let it: { id: string; ticket_number: string | null };
  try {
    hr = await createTicket(admin, { by: viewer, department: "hr", category: "Offboarding", priority: "high", title: `Offboarding: ${person.name} — ${viewer.office.field_office}`, description: hrBody("Sign-in: being disabled…") });
    try {
      it = await createTicket(admin, {
        by: viewer,
        department: "it",
        category: "Offboarding",
        priority: "high",
        title: `Offboarding (IT): ${person.name} — ${viewer.office.field_office}`,
        description: itBody("Sign-in: being disabled…", hr.ticket_number ?? hr.id),
      });
    } catch (e) {
      await admin.from("helpdesk_requests").delete().eq("id", hr.id);
      throw e;
    }
  } catch (e) {
    await admin.from("employee_offboardings").update({ status: "failed", signin_error: e instanceof Error ? e.message : String(e) }).eq("id", claim.id);
    throw new Error(`Couldn't open the HR/IT tickets, so nothing was disabled. ${e instanceof Error ? e.message : ""}`.trim());
  }
  await admin.from("employee_offboardings").update({ hr_request_id: hr.id, it_request_id: it.id, status: "submitted" }).eq("id", claim.id);

  // 3. Sign-in off.
  const now = new Date().toISOString();
  let signinDisabledAt: string | null = null;
  const problems: string[] = [];
  if (!person.entraId) {
    problems.push("No Microsoft 365 account is linked, so sign-in couldn't be disabled automatically.");
  } else if ((person as any).onPremisesSyncEnabled) {
    problems.push("Their account syncs from on-premises Active Directory, so it has to be disabled there (Microsoft 365 won't allow it directly).");
  } else {
    try {
      await graphPatch(`/users/${person.entraId}`, { accountEnabled: false });
      signinDisabledAt = now;
      try {
        await graphPost(`/users/${person.entraId}/revokeSignInSessions`, {});
      } catch (e) {
        problems.push(`Sign-in disabled, but signing them out everywhere failed: ${e instanceof Error ? e.message : e}`);
      }
    } catch (e) {
      problems.push(`Couldn't disable their Microsoft 365 sign-in: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 4. Portal login.
  let portalDisabledAt: string | null = null;
  if (person.employeeId) {
    const { data: e } = await admin.from("employees").select("auth_user_id").eq("id", person.employeeId).maybeSingle();
    const { error: actErr } = await admin.from("employees").update({ is_active: false }).eq("id", person.employeeId);
    if (actErr) problems.push(`Couldn't deactivate their portal record: ${actErr.message}`);
    if (e?.auth_user_id) {
      const { error } = await admin.auth.admin.updateUserById(e.auth_user_id, { ban_duration: "876000h" });
      if (error) problems.push(`Couldn't block their portal login: ${error.message}`);
      else portalDisabledAt = now;
    } else if (!actErr) portalDisabledAt = now;
  }

  // 5. Put the outcome on both tickets and the record.
  const when = new Date(now).toLocaleString("en-US", { timeZone: "America/Chicago" });
  const signinLine = [
    signinDisabledAt ? `Microsoft 365 sign-in was disabled and sessions revoked at ${when} CT.` : null,
    portalDisabledAt ? "Portal login blocked." : null,
    ...problems.map((p) => `⚠ ${p}`),
  ]
    .filter(Boolean)
    .join("\n");
  await Promise.all([
    admin.from("helpdesk_requests").update({ description: hrBody(signinLine) }).eq("id", hr.id),
    admin.from("helpdesk_requests").update({ description: itBody(signinLine, hr.ticket_number ?? hr.id) }).eq("id", it.id),
    admin
      .from("employee_offboardings")
      .update({ signin_disabled_at: signinDisabledAt, signin_error: problems.length ? problems.join(" ") : null, portal_disabled_at: portalDisabledAt })
      .eq("id", claim.id),
  ]);

  return { id: claim.id, hrTicket: hr, itTicket: it, signinDisabled: !!signinDisabledAt, signinError: problems.length ? problems.join(" ") : null };
}

// The person's offboarding to show on their profile: one in progress, or
// one completed in the last 30 days. Older ones (e.g. before a rehire)
// don't block offboarding them again.
export async function latestOffboarding(email: string, entraId: string | null) {
  const admin = createAdminClient();
  const e = (email ?? "").trim().toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
  const or = [e ? `email.ilike.${e}` : null, entraId ? `entra_user_id.eq.${entraId}` : null].filter(Boolean).join(",");
  if (!or) return null;
  const { data } = await admin
    .from("employee_offboardings")
    .select("id, status, last_day, notes, created_at, completed_at, signin_disabled_at, signin_error, hr_request_id, it_request_id, requested_by")
    .or(or)
    .neq("status", "failed")
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
  let status = data.status as string;
  let completedAt = data.completed_at as string | null;
  if (status === "submitted" && ids.length === 2 && ids.every((id) => t.get(id)?.overall_status === "closed")) {
    completedAt = new Date().toISOString();
    status = "completed";
    await admin.from("employee_offboardings").update({ status, completed_at: completedAt }).eq("id", data.id).eq("status", "submitted");
  }
  if (status === "completed" && completedAt && Date.now() - new Date(completedAt).getTime() > 30 * 86400000) return null;
  return {
    ...data,
    status,
    completed_at: completedAt,
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
