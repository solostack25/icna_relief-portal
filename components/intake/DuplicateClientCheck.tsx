"use client";

// Duplicate-client guard for household intake.
//
// Names alone aren't unique, so nothing happens while staff type the name.
// Once the street address is being typed, we look for an existing client with
// the same first + last name at the same address (find_intake_duplicates —
// normalized, so "123 North Main Street" = "123 n main st"). A match blocks
// the intake: the modal pops up with the matching client(s) and a link into
// each profile, and the form can't be reviewed or saved until the name or
// address no longer matches.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export type DuplicateMatch = {
  client_id: string;
  client_number: string | null;
  first_name: string | null;
  last_name: string | null;
  address_line1: string | null;
  apt_unit_no: string | null;
  city: string | null;
  zip: string | null;
  office_name: string | null;
  registration_date: string | null;
  can_view: boolean;
};

const DEBOUNCE_MS = 400;

/**
 * Watches name + street address and returns any existing clients that match.
 * `checking` is true while a lookup for the current input is in flight, so the
 * form can hold off on submit until it knows.
 */
export function useDuplicateClientCheck(
  firstName: string,
  lastName: string,
  addressLine1: string,
  profileHref: (clientId: string) => string = (id) => `/clients/${id}`
) {
  const supabase = useRef(createClient()).current;
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);
  const [checking, setChecking] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const lastShownKey = useRef<string>("");

  useEffect(() => {
    const first = firstName.trim();
    const last = lastName.trim();
    const addr = addressLine1.trim();

    // Need a house number and the start of a street name before checking.
    if (!first || !last || !/^\d+[a-z]?\s+[a-z0-9]{2,}/i.test(addr)) {
      setMatches([]);
      setChecking(false);
      setModalOpen(false);
      return;
    }

    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc("find_intake_duplicates", {
        p_first_name: first,
        p_last_name: last,
        p_address_line1: addr,
      });
      if (cancelled) return;
      setChecking(false);
      if (error) {
        console.error("Duplicate check failed", error);
        setMatches([]);
        return;
      }
      const rows = (data ?? []) as DuplicateMatch[];
      setMatches(rows);
      if (rows.length === 0) {
        setModalOpen(false);
        return;
      }
      // Pop the modal when the set of matches changes (not on every keystroke
      // that keeps the same match), so closing it isn't fought on each key.
      const key = rows.map((r) => r.client_id).sort().join(",");
      if (key !== lastShownKey.current) {
        lastShownKey.current = key;
        setModalOpen(true);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [firstName, lastName, addressLine1, supabase]);

  return {
    matches,
    checking,
    blocked: matches.length > 0,
    modalOpen,
    openModal: () => setModalOpen(true),
    closeModal: () => setModalOpen(false),
    profileHref,
  };
}

function formatAddress(m: DuplicateMatch) {
  const street = [m.address_line1, m.apt_unit_no ? `#${m.apt_unit_no}` : null].filter(Boolean).join(" ");
  const cityZip = [m.city, m.zip].filter(Boolean).join(" ");
  return [street, cityZip].filter(Boolean).join(", ");
}

function formatDate(d: string | null) {
  if (!d) return null;
  const date = new Date(d + "T00:00:00");
  return isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function DuplicateClientModal({
  matches,
  onClose,
  profileHref,
}: {
  matches: DuplicateMatch[];
  onClose: () => void;
  profileHref: (clientId: string) => string;
}) {
  // Esc closes the modal (the form stays blocked either way).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const plural = matches.length > 1;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="duplicate-client-title"
        className="relative w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
      >
        <h2 id="duplicate-client-title" className="text-base font-semibold mb-1">
          {plural ? "We found people with this name and address" : "This client may already be registered"}
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mb-4">
          {plural
            ? `${matches.length} existing clients have the same name and address.`
            : "An existing client has the same name and address."}{" "}
          Open their profile instead of starting a new intake.
        </p>

        <ul className="space-y-2 max-h-72 overflow-y-auto mb-5">
          {matches.map((m) => {
            const registered = formatDate(m.registration_date);
            const body = (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {[m.first_name, m.last_name].filter(Boolean).join(" ")}
                  </span>
                  {m.client_number && (
                    <span className="text-xs font-mono text-[var(--color-text-dim)]">#{m.client_number}</span>
                  )}
                </div>
                <p className="text-xs text-[var(--color-text-dim)] mt-0.5">{formatAddress(m)}</p>
                <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                  {[m.office_name, registered ? `Registered ${registered}` : null].filter(Boolean).join(" · ")}
                </p>
                {m.can_view ? (
                  <p className="text-xs text-[var(--color-accent)] mt-2 font-medium">Open client profile →</p>
                ) : (
                  <p className="text-xs text-[#B55139] mt-2">
                    Registered with another office — ask an admin to transfer them rather than registering again.
                  </p>
                )}
              </>
            );
            return (
              <li key={m.client_id}>
                {m.can_view ? (
                  <Link
                    href={profileHref(m.client_id)}
                    className="block rounded-lg border border-[var(--color-border)] bg-white px-4 py-3 hover:border-[var(--color-accent)] transition-colors"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg border border-[var(--color-border)] py-2 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          Fix the name or address
        </button>
      </div>
    </div>
  );
}

/** Inline notice under the address fields while a match is blocking intake. */
export function DuplicateClientBanner({ count, onView }: { count: number; onView: () => void }) {
  return (
    <div className="mt-3 rounded-lg border border-[#B55139]/40 bg-[#B55139]/5 px-3 py-2 flex items-center justify-between gap-3">
      <p className="text-xs text-[#B55139]">
        {count > 1 ? `${count} existing clients match` : "An existing client matches"} this name and address.
        Intake can&apos;t continue until this is resolved.
      </p>
      <button type="button" onClick={onView} className="text-xs font-medium text-[#B55139] underline shrink-0">
        View match{count > 1 ? "es" : ""}
      </button>
    </div>
  );
}
