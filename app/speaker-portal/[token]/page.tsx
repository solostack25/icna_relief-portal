"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, Eyebrow, Field, Row, money, dim, faint, ink, emerald, gold, rose, inputStyle } from "@/components/speaker/ui";

type Data = {
  request: {
    request_number: string;
    speaker_name: string;
    event: string;
    when: string;
    location: string;
    honorarium: number;
    coordinator_name: string;
    coordinator_email: string;
    w9_needed: boolean;
    w9_received_at: string | null;
    agreement_signed_at: string | null;
    agreement_signed_name: string | null;
  };
  sections: { title: string; body: string }[];
  payee: Record<string, string>;
};

export default function SpeakerPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payee, setPayee] = useState<Record<string, string>>({});
  const [signature, setSignature] = useState("");
  const [agree, setAgree] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/speaker-portal/${token}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't load");
        setData(body);
        setPayee(body.payee);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  const r = data?.request;
  const needsSig = r && !r.agreement_signed_at;
  const needsW9 = r && r.w9_needed && !r.w9_received_at;
  const complete = r && !needsSig && !needsW9;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (needsSig && (!agree || signature.trim().length < 3)) {
      setError("Please type your full name and check the box to sign.");
      return;
    }
    if (needsW9 && !file) {
      setError("Please attach your completed W-9.");
      return;
    }
    const fd = new FormData();
    fd.set("signature_name", needsSig ? signature : "");
    fd.set("agree", agree ? "true" : "false");
    for (const [k, v] of Object.entries(payee)) fd.set(k, v ?? "");
    if (file) fd.set("w9", file);
    setSubmitting(true);
    const res = await fetch(`/api/speaker-portal/${token}`, { method: "POST", body: fd });
    const body = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(body.error ?? "Something went wrong.");
      return;
    }
    setDone(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setPayee((p) => ({ ...p, [k]: e.target.value }));

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-sand)" }}>
      <div className="flex items-center px-6 py-4" style={{ background: "#fff", borderBottom: "1px solid var(--portal-line)" }}>
        <img src="/icna-relief-logo.png" alt="ICNA Relief" className="h-7" />
      </div>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Eyebrow>Speaker confirmation{r ? ` · ${r.request_number}` : ""}</Eyebrow>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px", color: ink }}>
          {r ? `Assalamu alaikum, ${r.speaker_name}` : "Speaker confirmation"}
        </h1>
        {r && !done && !complete && (
          <p className="text-sm mb-6" style={{ color: dim }}>
            JazakAllahu khairan for speaking with ICNA Relief. Please review your agreement{needsW9 ? ", upload your W-9," : ""} and confirm where to send your honorarium. It takes about two minutes.
          </p>
        )}

        {error && (
          <div className="text-sm rounded-xl p-3 mb-4 font-semibold" style={{ background: `${rose}12`, color: rose }}>
            {error}
          </div>
        )}
        {!data && !error && <p className="text-sm" style={{ color: faint }}>Loading…</p>}

        {(done || complete) && r && (
          <Card style={{ borderColor: `${emerald}55` }}>
            <div className="text-3xl mb-2">✅</div>
            <div className="text-[17px] font-bold mb-1" style={{ color: ink }}>
              You&apos;re all set
            </div>
            <p className="text-sm m-0" style={{ color: dim }}>
              Your {done ? "paperwork has" : "agreement and paperwork have"} been sent to ICNA Relief Finance. A copy of your signed agreement is on its way to your email. Questions? Contact {r.coordinator_name} at{" "}
              <a href={`mailto:${r.coordinator_email}`} style={{ color: emerald, fontWeight: 700 }}>
                {r.coordinator_email}
              </a>
              .
            </p>
          </Card>
        )}

        {data && r && !done && !complete && (
          <form onSubmit={submit} className="space-y-4">
            <Card>
              <Eyebrow>Your engagement</Eyebrow>
              <Row k="Event" v={r.event} />
              <Row k="When" v={r.when} />
              <Row k="Where" v={r.location} />
              <Row k="Honorarium" v={money(r.honorarium)} />
              <Row k="Point of contact" v={`${r.coordinator_name}`} />
            </Card>

            {needsSig && (
              <Card>
                <Eyebrow>Speaker agreement</Eyebrow>
                <div className="rounded-xl p-4 max-h-80 overflow-y-auto text-[13px] leading-relaxed space-y-3" style={{ background: "#F4F3EE", color: ink }}>
                  {data.sections.map((s) => (
                    <div key={s.title}>
                      <div className="font-bold">{s.title}</div>
                      <div>{s.body}</div>
                    </div>
                  ))}
                </div>
                <label className="flex items-start gap-2.5 mt-4 text-sm cursor-pointer" style={{ color: ink }}>
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
                  I have read and agree to this speaker agreement.
                </label>
                <div className="mt-3">
                  <Field label="Type your full name to sign" required>
                    <input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={r.speaker_name} style={{ ...inputStyle, fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 20 }} />
                  </Field>
                </div>
              </Card>
            )}

            {needsW9 && (
              <Card style={{ borderColor: `${gold}66` }}>
                <Eyebrow color={gold}>W-9</Eyebrow>
                <p className="text-sm mt-0 mb-3" style={{ color: dim }}>
                  Finance needs a signed IRS Form W-9 before paying your honorarium.{" "}
                  <a href="https://www.irs.gov/pub/irs-pdf/fw9.pdf" target="_blank" rel="noreferrer" style={{ color: emerald, fontWeight: 700 }}>
                    Download a blank W-9 from the IRS
                  </a>
                  , fill it in, then upload a PDF or a clear photo. It&apos;s stored privately and only Finance can open it.
                </p>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/heic,image/heif"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white file:bg-[#1F6F54]"
                />
                {file && (
                  <div className="text-xs mt-2" style={{ color: emerald }}>
                    ✓ {file.name} ({Math.round(file.size / 1024)} KB)
                  </div>
                )}
              </Card>
            )}

            <Card>
              <Eyebrow>Where should we mail your payment?</Eyebrow>
              <div className="grid sm:grid-cols-2 gap-3 mt-2">
                <div className="sm:col-span-2">
                  <Field label="Payee name" required hint="Your name, or your organization's if the check should go there.">
                    <input value={payee.payee_name ?? ""} onChange={set("payee_name")} style={inputStyle} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Street address" required>
                    <input value={payee.payee_address_line1 ?? ""} onChange={set("payee_address_line1")} style={inputStyle} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Apt / suite">
                    <input value={payee.payee_address_line2 ?? ""} onChange={set("payee_address_line2")} style={inputStyle} />
                  </Field>
                </div>
                <Field label="City" required>
                  <input value={payee.payee_city ?? ""} onChange={set("payee_city")} style={inputStyle} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="State" required>
                    <input value={payee.payee_state ?? ""} onChange={set("payee_state")} maxLength={2} style={{ ...inputStyle, textTransform: "uppercase" }} />
                  </Field>
                  <Field label="ZIP" required>
                    <input value={payee.payee_zip_code ?? ""} onChange={set("payee_zip_code")} inputMode="numeric" style={inputStyle} />
                  </Field>
                </div>
              </div>
            </Card>

            <button type="submit" disabled={submitting} className="w-full rounded-full py-3.5 text-[15px] font-bold text-white disabled:opacity-50" style={{ background: emerald, boxShadow: "0 6px 18px -6px rgba(31,111,84,0.6)" }}>
              {submitting ? "Submitting…" : needsSig ? "Sign & submit" : "Submit"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
