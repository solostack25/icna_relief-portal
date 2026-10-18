"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PortalHeader from "@/app/PortalHeader";
import { Card, Eyebrow, Field, PageTitle, PillButton, inputStyle, money, dim, faint, ink, emerald, gold, rose } from "@/components/speaker/ui";

type Office = { id: string; region: string; state: string; field_office: string };
type Person = { name: string; email: string; jobTitle?: string | null; region?: string | null };
type Speaker = { id: string; full_name: string; email: string | null; phone: string | null; w9_on_file: boolean };
type Options = { leadershipThreshold?: number; me: { name: string; email: string; officeId: string | null; region: string | null }; regions: string[]; offices: Office[]; areaManagers: Person[] };

const LOCAL_CAP = 500;
const DEFAULT_LEADERSHIP_THRESHOLD = 500; // overridden by Admin → Workflows via /options

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function ChoiceCard({ selected, onClick, title, desc, tone = emerald }: { selected: boolean; onClick: () => void; title: string; desc: string; tone?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-2xl p-4 transition-all w-full"
      style={{
        background: selected ? `${tone}0F` : "#fff",
        border: `2px solid ${selected ? tone : "var(--portal-line)"}`,
        boxShadow: selected ? `0 6px 18px -8px ${tone}66` : "none",
      }}
    >
      <div className="flex items-center gap-2.5">
        <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ border: `2px solid ${selected ? tone : "rgba(22,48,43,0.3)"}`, background: selected ? tone : "#fff", boxShadow: selected ? "inset 0 0 0 2.5px #fff" : "none" }} />
        <span className="text-[15px] font-bold" style={{ color: ink }}>
          {title}
        </span>
      </div>
      <div className="text-xs mt-1.5 ml-[26px]" style={{ color: dim }}>
        {desc}
      </div>
    </button>
  );
}

function PersonPicker({ value, onChange, suggestions }: { value: Person | null; onChange: (p: Person | null) => void; suggestions: Person[] }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q);

  useEffect(() => {
    if (dq.trim().length < 2) {
      setResults([]);
      return;
    }
    fetch(`/api/speaker-requests/people-search?q=${encodeURIComponent(dq.trim())}`)
      .then((r) => r.json())
      .then((d) => setResults(d.people ?? []));
  }, [dq]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl px-4 py-2.5" style={{ background: "#EAF3EF", border: `1.5px solid ${emerald}55` }}>
        <div className="min-w-0">
          <div className="text-sm font-bold truncate" style={{ color: ink }}>
            {value.name}
          </div>
          <div className="text-xs truncate" style={{ color: dim }}>
            {value.email}
          </div>
        </div>
        <button type="button" onClick={() => onChange(null)} className="text-xs font-bold" style={{ color: emerald }}>
          Change
        </button>
      </div>
    );
  }

  const typedEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim()) ? q.trim() : null;
  return (
    <div className="relative">
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {suggestions.map((p) => (
            <button key={p.email} type="button" onClick={() => onChange(p)} className="text-xs font-semibold rounded-full px-3 py-1.5" style={{ background: "#fff", border: "1.5px solid var(--portal-line)", color: ink }}>
              {p.name}
            </button>
          ))}
        </div>
      )}
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search by name or email…"
        style={inputStyle}
      />
      {open && (results.length > 0 || typedEmail) && (
        <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl bg-white overflow-hidden" style={{ border: "1px solid var(--portal-line)", boxShadow: "0 12px 32px -12px rgba(22,48,43,0.3)" }}>
          {results.map((p) => (
            <button key={p.email} type="button" onMouseDown={() => onChange(p)} className="block w-full text-left px-4 py-2.5 hover:bg-[#F4F3EE]">
              <div className="text-sm font-semibold" style={{ color: ink }}>
                {p.name}
              </div>
              <div className="text-xs" style={{ color: faint }}>
                {p.email}
                {p.jobTitle ? ` · ${p.jobTitle}` : ""}
              </div>
            </button>
          ))}
          {typedEmail && !results.some((r) => r.email.toLowerCase() === typedEmail.toLowerCase()) && (
            <button type="button" onMouseDown={() => onChange({ name: typedEmail, email: typedEmail })} className="block w-full text-left px-4 py-2.5 hover:bg-[#F4F3EE] text-sm" style={{ color: emerald, fontWeight: 600 }}>
              Use {typedEmail}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SpeakerInput({ value, onText, onPick }: { value: string; onText: (s: string) => void; onPick: (s: Speaker) => void }) {
  const [results, setResults] = useState<Speaker[]>([]);
  const [open, setOpen] = useState(false);
  const dq = useDebounced(value);
  const picked = useRef(false);
  useEffect(() => {
    if (picked.current) {
      picked.current = false;
      return;
    }
    if (dq.trim().length < 2) {
      setResults([]);
      return;
    }
    fetch(`/api/speaker-requests/options?speaker=${encodeURIComponent(dq.trim())}`)
      .then((r) => r.json())
      .then((d) => setResults(d.speakers ?? []));
  }, [dq]);
  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => {
          onText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Speaker's full name"
        style={inputStyle}
      />
      {open && results.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl bg-white overflow-hidden" style={{ border: "1px solid var(--portal-line)", boxShadow: "0 12px 32px -12px rgba(22,48,43,0.3)" }}>
          <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider" style={{ color: faint, fontFamily: "'IBM Plex Mono', monospace" }}>
            Speakers we&apos;ve worked with
          </div>
          {results.map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={() => {
                picked.current = true;
                onPick(s);
                setOpen(false);
              }}
              className="block w-full text-left px-4 py-2.5 hover:bg-[#F4F3EE]"
            >
              <div className="text-sm font-semibold" style={{ color: ink }}>
                {s.full_name}
                {s.w9_on_file && (
                  <span className="ml-2 text-[10px] font-bold rounded-full px-2 py-0.5" style={{ background: "#EAF3EF", color: emerald }}>
                    W-9 on file
                  </span>
                )}
              </div>
              <div className="text-xs" style={{ color: faint }}>
                {[s.email, s.phone].filter(Boolean).join(" · ")}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NewSpeakerRequestPage() {
  const [opts, setOpts] = useState<Options | null>(null);
  const [region, setRegion] = useState("");
  const [officeId, setOfficeId] = useState("");
  const [am, setAm] = useState<Person | null>(null);
  const [eventType, setEventType] = useState<"weekly_jummah" | "special_program" | null>("weekly_jummah");
  const [eventOther, setEventOther] = useState("");
  const [travel, setTravel] = useState<boolean | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("13:30");
  const [honorarium, setHonorarium] = useState("");
  const [speakerName, setSpeakerName] = useState("");
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  const [speakerEmail, setSpeakerEmail] = useState("");
  const [speakerPhone, setSpeakerPhone] = useState("");
  const [w9, setW9] = useState<boolean | null>(null);
  const [knownW9, setKnownW9] = useState(false);
  const [travelCost, setTravelCost] = useState("");
  const [hotelCost, setHotelCost] = useState("");
  const [justification, setJustification] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; request_number: string; warning?: string } | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    fetch("/api/speaker-requests/options")
      .then((r) => r.json())
      .then((d: Options) => {
        setOpts(d);
        if (d.me?.region) setRegion(d.me.region);
        if (d.me?.officeId) setOfficeId(d.me.officeId);
      });
  }, []);

  const offices = useMemo(() => (opts?.offices ?? []).filter((o) => !region || o.region === region), [opts, region]);
  const amSuggestions = useMemo(() => (opts?.areaManagers ?? []).filter((a) => !region || a.region === region).slice(0, 6), [opts, region]);

  const fee = parseFloat(honorarium) || 0;
  const tc = parseFloat(travelCost) || 0;
  const hc = parseFloat(hotelCost) || 0;
  const total = fee + (travel ? tc + hc : 0);
  const leadershipThreshold = opts?.leadershipThreshold ?? DEFAULT_LEADERSHIP_THRESHOLD;
  const needsLeadership = travel === true && total > leadershipThreshold;
  const words = justification.trim().split(/\s+/).filter(Boolean).length;

  const problems: Record<string, string | null> = {
    region: !region ? "Pick a region." : null,
    am: !am ? "Pick the Area Manager who approves this." : null,
    eventOther: eventType === "special_program" && !eventOther.trim() ? "Describe the program." : null,
    travel: travel === null ? "Choose one to continue." : null,
    date: !date ? "Pick the event date." : null,
    honorarium: honorarium === "" || fee < 0 ? "Enter the honorarium (0 if none)." : travel === false && fee > LOCAL_CAP ? `The regional cap for local speakers is $${LOCAL_CAP}.` : null,
    speaker: !speakerName.trim() ? "Speaker name is required." : null,
    speakerEmail:
      speakerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(speakerEmail) ? "That email doesn't look right." : travel && !speakerEmail ? "Needed to send the agreement and W-9 link." : null,
    w9: travel && w9 === null ? "Choose one." : null,
    travelCost: travel && travelCost === "" ? "Enter an estimate (0 if none)." : null,
    hotelCost: travel && hotelCost === "" ? "Enter an estimate (0 if none)." : null,
    justification: travel && !justification.trim() ? "Required for travel speakers." : travel && words > 250 ? "Keep it to 250 words." : null,
  };
  const valid = Object.values(problems).every((p) => !p);
  const show = (k: string) => (tried ? problems[k] : null);

  async function submit() {
    setTried(true);
    setError(null);
    if (!valid) {
      setError("A few fields need attention.");
      return;
    }
    setSubmitting(true);
    const eventAt = new Date(`${date}T${time || "13:30"}`);
    const res = await fetch("/api/speaker-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        region,
        office_id: officeId || null,
        area_manager_name: am?.name,
        area_manager_email: am?.email,
        event_type: eventType,
        event_type_other: eventOther,
        travel_required: travel,
        event_at: eventAt.toISOString(),
        event_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        honorarium: fee,
        speaker_id: speakerId,
        speaker_name: speakerName,
        speaker_email: speakerEmail,
        speaker_phone: speakerPhone,
        w9_on_file: travel ? w9 : undefined,
        travel_cost: travel ? tc : 0,
        hotel_cost: travel ? hc : 0,
        justification: travel ? justification : undefined,
      }),
    });
    const body = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(body.error ?? "Couldn't submit.");
      return;
    }
    setDone({ ...body.request, warning: body.warning });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (done) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
        <PortalHeader />
        <div className="max-w-xl mx-auto px-4 py-16">
          <Card className="text-center !p-10">
            <div className="text-4xl mb-3">🕌</div>
            <Eyebrow>{done.request_number}</Eyebrow>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: "0 0 10px", color: ink }}>Request submitted</h1>
            <p className="text-sm mb-2" style={{ color: dim }}>
              {am?.name} has been emailed to approve it{needsLeadership ? ", then it goes to leadership for sign-off" : ""}.
            </p>
            <p className="text-sm mb-6" style={{ color: dim }}>
              Once it&apos;s approved, the finance ticket, speaker agreement{travel && !w9 ? ", W-9 request" : ""} and calendar invite all go out automatically.
            </p>
            {done.warning && (
              <p className="text-xs mb-6 rounded-xl p-3" style={{ background: `${rose}12`, color: rose }}>
                {done.warning}
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-3">
              <PillButton href={`/speaker-requests/${done.id}`}>Track this request</PillButton>
              <PillButton href="/speaker-requests" variant="ghost">
                All requests
              </PillButton>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <PortalHeader />
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8">
        <Link href="/speaker-requests" className="text-xs" style={{ color: faint }}>
          ← Speaker Requests
        </Link>
        <PageTitle eyebrow="New request" title="Request a Speaker" />

        <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
          <div className="space-y-5">
            {/* ---------- Section 1 ---------- */}
            <Card>
              <Eyebrow>1 · Event & requestor</Eyebrow>
              <div className="grid sm:grid-cols-2 gap-4 mt-3">
                <Field label="Coordinator">
                  <div style={{ ...inputStyle, background: "#F4F3EE", color: dim }}>{opts?.me.name ?? "…"}</div>
                </Field>
                <Field label="Region" required error={show("region")}>
                  <select
                    value={region}
                    onChange={(e) => {
                      setRegion(e.target.value);
                      setOfficeId("");
                    }}
                    style={inputStyle}
                  >
                    <option value="">Select a region…</option>
                    {(opts?.regions ?? []).map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Office" hint="Billed to this office's line on the finance ticket.">
                  <select value={officeId} onChange={(e) => setOfficeId(e.target.value)} style={inputStyle}>
                    <option value="">{region ? "Select an office…" : "Pick a region first"}</option>
                    {offices.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.field_office}
                        {o.state ? `, ${o.state}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Area Manager (AM)" required error={show("am")} group>
                  <PersonPicker value={am} onChange={setAm} suggestions={amSuggestions} />
                </Field>
              </div>
              <div className="mt-5">
                <span className="block text-[13px] font-semibold mb-2" style={{ color: ink }}>
                  Event type <span style={{ color: rose }}>*</span>
                </span>
                <div className="grid sm:grid-cols-2 gap-3">
                  <ChoiceCard selected={eventType === "weekly_jummah"} onClick={() => setEventType("weekly_jummah")} title="Weekly Jummah Khutbah" desc="The regular Friday khutbah." />
                  <ChoiceCard selected={eventType === "special_program"} onClick={() => setEventType("special_program")} title="Special program / other" desc="Fundraiser, halaqa, community event…" />
                </div>
                {eventType === "special_program" && (
                  <div className="mt-3">
                    <Field label="What's the program?" required error={show("eventOther")}>
                      <input value={eventOther} onChange={(e) => setEventOther(e.target.value)} placeholder="e.g. Ramadan fundraising dinner" style={inputStyle} />
                    </Field>
                  </div>
                )}
              </div>
            </Card>

            {/* ---------- Section 2 ---------- */}
            <Card>
              <Eyebrow>2 · The routing question</Eyebrow>
              <div className="text-[17px] font-bold mt-1 mb-3" style={{ color: ink }}>
                Is travel or a flight required for this speaker?
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <ChoiceCard selected={travel === false} onClick={() => setTravel(false)} title="No — local speaker" desc="Fast track. Your Area Manager signs off. Takes under a minute." />
                <ChoiceCard selected={travel === true} onClick={() => setTravel(true)} title="Yes — travel needed" desc="National or out-of-state speaker. We'll ask for costs and a short justification." tone={gold} />
              </div>
              {show("travel") && (
                <div className="text-xs mt-2 font-semibold" style={{ color: rose }}>
                  {show("travel")}
                </div>
              )}
            </Card>

            {/* ---------- Branch A / B ---------- */}
            {travel !== null && (
              <Card style={travel ? { borderColor: `${gold}66` } : undefined}>
                <Eyebrow color={travel ? gold : emerald}>{travel ? "3 · Travel speaker details" : "3 · Local speaker details"}</Eyebrow>
                <div className="grid sm:grid-cols-2 gap-4 mt-3">
                  <div className="sm:col-span-2">
                    <Field label={travel ? "Which speaker is requested?" : "Speaker name"} required error={show("speaker")} hint={travel ? "Proposed national / out-of-state speaker." : undefined} group>
                      <SpeakerInput
                        value={speakerName}
                        onText={(s) => {
                          setSpeakerName(s);
                          setSpeakerId(null);
                          setKnownW9(false);
                        }}
                        onPick={(s) => {
                          setSpeakerName(s.full_name);
                          setSpeakerId(s.id);
                          if (s.email) setSpeakerEmail(s.email);
                          if (s.phone) setSpeakerPhone(s.phone);
                          setKnownW9(s.w9_on_file);
                          if (s.w9_on_file) setW9(true);
                        }}
                      />
                    </Field>
                  </div>
                  <Field label="Event date" required error={show("date")}>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
                  </Field>
                  <Field label="Start time" required>
                    <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
                  </Field>
                  <Field label={travel ? "Speaker's honorarium fee ($)" : "Speaker honorarium ($)"} required error={show("honorarium")} hint={travel ? undefined : `Standard regional cap of $${LOCAL_CAP} applies.`}>
                    <input type="number" min={0} max={travel ? undefined : LOCAL_CAP} step="1" inputMode="decimal" value={honorarium} onChange={(e) => setHonorarium(e.target.value)} placeholder="0" style={inputStyle} />
                  </Field>
                  <Field label="Speaker phone" hint={travel ? undefined : "Optional — for regional records."}>
                    <input type="tel" value={speakerPhone} onChange={(e) => setSpeakerPhone(e.target.value)} placeholder="(555) 555-5555" style={inputStyle} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field
                      label="Speaker email"
                      required={!!travel}
                      error={show("speakerEmail")}
                      hint={travel ? "The agreement and W-9 link go here." : "Optional. If given, the speaker gets their agreement directly; otherwise we send you a link to forward."}
                    >
                      <input type="email" value={speakerEmail} onChange={(e) => setSpeakerEmail(e.target.value)} placeholder="speaker@example.com" style={inputStyle} />
                    </Field>
                  </div>

                  {travel && (
                    <>
                      <div className="sm:col-span-2">
                        <span className="block text-[13px] font-semibold mb-2" style={{ color: ink }}>
                          Do we have this speaker&apos;s W-9 on file? <span style={{ color: rose }}>*</span>
                        </span>
                        {knownW9 && (
                          <div className="text-xs mb-2" style={{ color: emerald }}>
                            ✓ Our speaker directory shows a W-9 on file for {speakerName}.
                          </div>
                        )}
                        <div className="grid sm:grid-cols-2 gap-3">
                          <ChoiceCard selected={w9 === true} onClick={() => setW9(true)} title="Yes, already on file" desc="Finance already has it." />
                          <ChoiceCard selected={w9 === false} onClick={() => setW9(false)} title="No" desc="We'll send the speaker a secure W-9 link automatically once approved." tone={gold} />
                        </div>
                        {show("w9") && (
                          <div className="text-xs mt-2 font-semibold" style={{ color: rose }}>
                            {show("w9")}
                          </div>
                        )}
                      </div>
                      <Field label="Estimated travel cost ($)" required error={show("travelCost")} hint="Flights, mileage, ground transport.">
                        <input type="number" min={0} step="1" inputMode="decimal" value={travelCost} onChange={(e) => setTravelCost(e.target.value)} placeholder="0" style={inputStyle} />
                      </Field>
                      <Field label="Estimated hotel cost ($)" required error={show("hotelCost")} hint="Lodging.">
                        <input type="number" min={0} step="1" inputMode="decimal" value={hotelCost} onChange={(e) => setHotelCost(e.target.value)} placeholder="0" style={inputStyle} />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="Strategic justification" required error={show("justification")}>
                          <textarea
                            value={justification}
                            onChange={(e) => setJustification(e.target.value)}
                            rows={5}
                            placeholder={`Explain why a local or regional speaker can't fill this slot, and how the projected revenue justifies the ${money(tc + hc)} travel overhead.`}
                            style={{ ...inputStyle, resize: "vertical" }}
                          />
                        </Field>
                        <div className="text-[11px] mt-1 text-right" style={{ color: words > 250 ? rose : faint, fontFamily: "'IBM Plex Mono', monospace" }}>
                          {words}/250 words
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* ---------- Summary / routing preview ---------- */}
          <div className="lg:sticky lg:top-6 space-y-4">
            <Card style={{ background: "var(--portal-ink)", border: "none" }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--portal-gold-soft)" }}>Combined cost</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 32, color: "var(--portal-sand)", margin: "4px 0 2px" }}>{money(total)}</div>
              {travel && (
                <div className="text-xs" style={{ color: "rgba(251,247,239,0.6)" }}>
                  Fee {money(fee)} + travel {money(tc)} + hotel {money(hc)}
                </div>
              )}
              <div className="mt-5 space-y-2.5">
                {[
                  { label: "Area Manager review", on: true },
                  { label: "Leadership sign-off", on: needsLeadership, note: travel ? (needsLeadership ? `Travel + over $${leadershipThreshold}` : `Not needed — at or under $${leadershipThreshold}`) : "Not needed for local" },
                  { label: "Finance honorarium ticket", on: true, auto: true },
                  { label: travel && w9 === false ? "Agreement + W-9 to speaker" : "Agreement to speaker", on: true, auto: true },
                  { label: "Calendar invite to you", on: true, auto: true },
                ].map((s) => (
                  <div key={s.label} className="flex items-start gap-2.5">
                    <span className="mt-1 w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.on ? (s.auto ? "var(--portal-gold)" : "#7FD1AE") : "rgba(251,247,239,0.2)" }} />
                    <div>
                      <div className="text-[13px] font-semibold" style={{ color: s.on ? "var(--portal-sand)" : "rgba(251,247,239,0.35)", textDecoration: s.on ? "none" : "line-through" }}>
                        {s.label}
                      </div>
                      {(s.note || s.auto) && (
                        <div className="text-[11px]" style={{ color: "rgba(251,247,239,0.5)" }}>
                          {s.note ?? "Automatic after approval"}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            {error && (
              <div className="text-sm rounded-xl p-3 font-semibold" style={{ background: `${rose}12`, color: rose }}>
                {error}
              </div>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !opts}
              className="w-full rounded-full py-3.5 text-[15px] font-bold text-white transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              style={{ background: emerald, boxShadow: "0 6px 18px -6px rgba(31,111,84,0.6)" }}
            >
              {submitting ? "Submitting…" : "Submit request"}
            </button>
            <p className="text-[11px] text-center" style={{ color: faint }}>
              You submit once — everything after approval is automatic.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
