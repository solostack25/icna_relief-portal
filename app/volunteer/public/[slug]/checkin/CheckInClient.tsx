"use client";

import { useEffect, useState } from "react";
import { formatInTz, formatTimeInTz } from "@/lib/volunteer";
import {
  ContactFields,
  DemographicFields,
  WaiverBlock,
  emptyProfile,
  emptyWaiver,
  profilePayload,
  volInputClass,
  type ProfileState,
} from "@/components/volunteer/VolunteerFormParts";

type EventInfo = {
  title: string;
  office: string;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
};

type Current = {
  checked_in_at: string;
  checked_out_at: string | null;
  checkout_method: string | null;
  first_name: string;
  auto_checkout_at: string | null;
} | null;

type Screen =
  | { kind: "contact" }
  | { kind: "new"; waiverText: string }
  | { kind: "found"; firstName: string; signedUp: boolean; needsWaiver: boolean; waiverText: string; dob: string | null; missing: string[] }
  | { kind: "elsewhere"; firstName: string; checkedInAt: string }
  | { kind: "checked_in"; firstName: string; checkedInAt: string; autoAt: string | null; already: boolean }
  | { kind: "checked_out"; checkedInAt: string; checkedOutAt: string; hours: number; method: string | null }
  | { kind: "not_open"; opensAt: string }
  | { kind: "ended" };

const CONTACT_KEY = "icna_volunteer_contact";
const PROFILE_KEY = "icna_volunteer_profile";

export default function CheckInClient({
  slug,
  token,
  event,
  current,
}: {
  slug: string;
  token: string;
  event: EventInfo;
  current: Current;
}) {
  const tz = event.timezone;
  const initial: Screen = current
    ? current.checked_out_at
      ? {
          kind: "checked_out",
          checkedInAt: current.checked_in_at,
          checkedOutAt: current.checked_out_at,
          hours: (new Date(current.checked_out_at).getTime() - new Date(current.checked_in_at).getTime()) / 3_600_000,
          method: current.checkout_method,
        }
      : { kind: "checked_in", firstName: current.first_name, checkedInAt: current.checked_in_at, autoAt: current.auto_checkout_at, already: true }
    : { kind: "contact" };

  const [screen, setScreen] = useState<Screen>(initial);
  const [contact, setContact] = useState("");
  const [profile, setProfile] = useState<ProfileState>(emptyProfile);
  const [waiver, setWaiver] = useState(emptyWaiver);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const c = localStorage.getItem(CONTACT_KEY);
      if (c) setContact(c);
      const p = localStorage.getItem(PROFILE_KEY);
      if (p) setProfile({ ...emptyProfile, ...JSON.parse(p) });
    } catch {}
  }, []);

  async function call(action: "lookup" | "checkin" | "checkout", extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/volunteer/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, t: token, action, contact, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again or see a staff member.");
        return null;
      }
      return data;
    } catch {
      setError("No connection — please try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function handleWindow(data: any): boolean {
    if (data.state === "not_open") {
      setScreen({ kind: "not_open", opensAt: data.opens_at });
      return true;
    }
    if (data.state === "ended") {
      setScreen({ kind: "ended" });
      return true;
    }
    return false;
  }

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const data = await call("lookup");
    if (!data || handleWindow(data)) return;
    try {
      localStorage.setItem(CONTACT_KEY, contact);
    } catch {}

    if (data.state === "new") {
      const isEmail = contact.includes("@");
      setProfile((p) => ({ ...p, email: isEmail ? contact.trim() : p.email, phone: isEmail ? p.phone : contact.trim() }));
      setScreen({ kind: "new", waiverText: data.waiver_text });
    } else if (data.state === "already_checked_in") {
      setScreen({ kind: "elsewhere", firstName: data.first_name, checkedInAt: data.checked_in_at });
    } else {
      setScreen({
        kind: "found",
        firstName: data.first_name,
        signedUp: data.signed_up,
        needsWaiver: data.needs_waiver,
        waiverText: data.waiver_text,
        dob: data.date_of_birth,
        missing: data.missing ?? [],
      });
    }
  }

  async function checkIn(needsWaiver: boolean) {
    if (needsWaiver && (!waiver.agreed || !waiver.signature.trim())) {
      setError("Please check the box and type your name to sign the waiver.");
      return;
    }
    const data = await call("checkin", {
      profile: profilePayload(profile),
      waiver: needsWaiver ? waiver : undefined,
    });
    if (!data || handleWindow(data)) return;
    try {
      if (screen.kind === "new") localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {}
    setScreen({
      kind: "checked_in",
      firstName: data.first_name,
      checkedInAt: data.checked_in_at,
      autoAt: data.auto_checkout_at,
      already: data.already,
    });
  }

  async function checkOut(byContact = false) {
    if (!confirm("Check out now?")) return;
    const data = await call("checkout", byContact ? {} : { contact: undefined });
    if (!data) return;
    setScreen({
      kind: "checked_out",
      checkedInAt: data.checked_in_at,
      checkedOutAt: data.checked_out_at,
      hours: data.hours,
      method: data.method,
    });
  }

  const btn =
    "w-full rounded-full bg-[var(--color-accent)] text-white font-medium py-3.5 text-base disabled:opacity-50";
  const btnOutline =
    "w-full rounded-full border border-[var(--color-border)] bg-white font-medium py-3 text-sm disabled:opacity-50";

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-md mx-auto">
        <p className="text-xs uppercase tracking-wide text-[var(--color-accent)] font-medium">
          Volunteer check-in · {event.office}
        </p>
        <h1 className="text-2xl font-semibold mt-1">{event.title}</h1>
        {event.starts_at && (
          <p className="text-sm text-[var(--color-text-dim)] mt-1">
            {formatInTz(event.starts_at, tz, { weekday: "short" })} – {formatTimeInTz(event.ends_at, tz)}
            {event.location ? ` · ${event.location}` : ""}
          </p>
        )}

        <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          {screen.kind === "contact" && (
            <form onSubmit={lookup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Your email or mobile number</label>
                <input
                  required
                  autoFocus
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com or (713) 555-0100"
                  className={volInputClass}
                />
                <p className="text-xs text-[var(--color-text-dim)] mt-2">
                  Use the one you signed up with. Didn't sign up? That's fine — walk-ins welcome.
                </p>
              </div>
              {error && <p className="text-sm text-[var(--color-dull-red)]">{error}</p>}
              <button type="submit" disabled={busy} className={btn}>
                {busy ? "Looking you up…" : "Continue"}
              </button>
            </form>
          )}

          {screen.kind === "new" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold">Welcome! Let's get you registered.</h2>
                <p className="text-xs text-[var(--color-text-dim)] mt-1">This only takes a minute and you won't need to do it again.</p>
              </div>
              <ContactFields value={profile} onChange={setProfile} requireEmail={false} />
              <div className="pt-4 border-t border-[var(--color-border)]">
                <DemographicFields value={profile} onChange={setProfile} />
              </div>
              <div className="pt-4 border-t border-[var(--color-border)]">
                <h3 className="text-sm font-medium mb-2">Volunteer waiver</h3>
                <WaiverBlock text={screen.waiverText} value={waiver} onChange={setWaiver} dateOfBirth={profile.date_of_birth} />
              </div>
              {error && <p className="text-sm text-[var(--color-dull-red)]">{error}</p>}
              <button disabled={busy} onClick={() => checkIn(true)} className={btn}>
                {busy ? "Checking in…" : "Check in"}
              </button>
              <button disabled={busy} onClick={() => setScreen({ kind: "contact" })} className={btnOutline}>
                Back
              </button>
            </div>
          )}

          {screen.kind === "found" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold">Welcome{screen.signedUp ? " back" : ""}, {screen.firstName}!</h2>
                <p className="text-xs text-[var(--color-text-dim)] mt-1">
                  {screen.signedUp ? "We have your sign-up for today." : "No sign-up found for today — we'll add you as a walk-in."}
                </p>
              </div>
              {screen.missing.length > 0 && (
                <div className="pt-4 border-t border-[var(--color-border)]">
                  <h3 className="text-sm font-medium mb-2">A few quick details</h3>
                  <DemographicFields value={profile} onChange={setProfile} only={screen.missing} />
                </div>
              )}
              {screen.needsWaiver && (
                <div className="pt-4 border-t border-[var(--color-border)]">
                  <h3 className="text-sm font-medium mb-2">Volunteer waiver</h3>
                  <WaiverBlock
                    text={screen.waiverText}
                    value={waiver}
                    onChange={setWaiver}
                    dateOfBirth={screen.dob || profile.date_of_birth}
                  />
                </div>
              )}
              {error && <p className="text-sm text-[var(--color-dull-red)]">{error}</p>}
              <button disabled={busy} onClick={() => checkIn(screen.needsWaiver)} className={btn}>
                {busy ? "Checking in…" : "Check in"}
              </button>
              <button disabled={busy} onClick={() => setScreen({ kind: "contact" })} className={btnOutline}>
                Not you?
              </button>
            </div>
          )}

          {screen.kind === "elsewhere" && (
            <div className="space-y-4 text-center">
              <h2 className="text-lg font-semibold">You're already checked in, {screen.firstName}</h2>
              <p className="text-sm text-[var(--color-text-dim)]">Since {formatTimeInTz(screen.checkedInAt, tz)}.</p>
              {error && <p className="text-sm text-[var(--color-dull-red)]">{error}</p>}
              <button disabled={busy} onClick={() => checkOut(true)} className={btn}>
                {busy ? "Checking out…" : "Check out now"}
              </button>
              <button disabled={busy} onClick={() => setScreen({ kind: "contact" })} className={btnOutline}>
                Back
              </button>
            </div>
          )}

          {screen.kind === "checked_in" && (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-accent)] text-3xl text-white">
                ✓
              </div>
              <div>
                <h2 className="text-xl font-semibold">
                  {screen.already ? "You're checked in" : "Checked in"}{screen.firstName ? `, ${screen.firstName}` : ""}!
                </h2>
                <p className="text-sm text-[var(--color-text-dim)] mt-1">Since {formatTimeInTz(screen.checkedInAt, tz)}. Thank you for volunteering.</p>
              </div>
              <p className="text-xs text-[var(--color-text-dim)] rounded-lg bg-black/[0.03] p-3">
                When you leave, scan the same QR code again (or keep this page open) and tap Check out.
                {screen.autoAt ? ` If you forget, you'll be checked out automatically at ${formatTimeInTz(screen.autoAt, tz)}.` : ""}
              </p>
              {error && <p className="text-sm text-[var(--color-dull-red)]">{error}</p>}
              <button disabled={busy} onClick={() => checkOut(false)} className={btn}>
                {busy ? "Checking out…" : "Check out"}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setContact("");
                  setProfile(emptyProfile);
                  setWaiver(emptyWaiver);
                  setScreen({ kind: "contact" });
                }}
                className={btnOutline}
              >
                Check in someone else (family member)
              </button>
            </div>
          )}

          {screen.kind === "checked_out" && (
            <div className="space-y-4 text-center">
              <h2 className="text-xl font-semibold">Thank you! 🌟</h2>
              <p className="text-sm">
                You volunteered <strong>{Math.max(0, screen.hours).toFixed(2)} hours</strong> today
                <span className="text-[var(--color-text-dim)]">
                  {" "}({formatTimeInTz(screen.checkedInAt, tz)} – {formatTimeInTz(screen.checkedOutAt, tz)})
                </span>
                .
              </p>
              {screen.method === "auto" && (
                <p className="text-xs text-[var(--color-text-dim)]">You were checked out automatically when the event ended.</p>
              )}
              <button onClick={() => setScreen({ kind: "contact" })} className={btnOutline}>
                Check in someone else
              </button>
            </div>
          )}

          {screen.kind === "not_open" && (
            <div className="space-y-3 text-center">
              <h2 className="text-lg font-semibold">Check-in isn't open yet</h2>
              <p className="text-sm text-[var(--color-text-dim)]">It opens at {formatInTz(screen.opensAt, tz)}.</p>
              <button onClick={() => setScreen({ kind: "contact" })} className={btnOutline}>
                Back
              </button>
            </div>
          )}

          {screen.kind === "ended" && (
            <div className="space-y-2 text-center">
              <h2 className="text-lg font-semibold">This event has ended</h2>
              <p className="text-sm text-[var(--color-text-dim)]">
                Check-in is closed. If you volunteered and didn't get checked in, let a staff member know.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
