"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/app/inkind/components/Logo";
import StationOfficeBar, { useStationOffice } from "@/app/inkind/components/StationOffice";

type Method = "cash" | "check";
type DonorKind = "individual" | "organization" | "anonymous";

// Phone photos are huge (and iPhones may hand us HEIC). Re-encode to a
// ~2000px JPEG in the browser so uploads stay well under the serverless
// body limit and the server always gets a format it can blur later.
async function toJpeg(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't read that image"));
      el.src = url;
    });
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob) throw new Error("Couldn't process that image");
    return new File([blob], "check.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

const field = "w-full bg-transparent px-4 py-3 text-base outline-none placeholder:text-gray-400";
const groupBox = "rounded-xl border border-gray-300 bg-white divide-y divide-gray-200 overflow-hidden focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-light";

export default function CashCheckPage() {
  const router = useRouter();
  const station = useStationOffice();
  const cameraInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);

  const [method, setMethod] = useState<Method | null>(null);
  const [amount, setAmount] = useState("");
  const [dateReceived, setDateReceived] = useState(new Date().toISOString().slice(0, 10));
  const [donorKind, setDonorKind] = useState<DonorKind>("individual");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [emailReceipt, setEmailReceipt] = useState(true);
  const [notes, setNotes] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [checkImage, setCheckImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processingImage, setProcessingImage] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ receiptNumber: string; receiptNote: string | null } | null>(null);

  const anonymous = donorKind === "anonymous";

  async function handleImage(f: File | undefined) {
    if (!f) return;
    setProcessingImage(true);
    setError(null);
    try {
      const jpeg = await toJpeg(f);
      setCheckImage(jpeg);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(jpeg));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't use that image");
    } finally {
      setProcessingImage(false);
    }
  }

  async function submit() {
    setError(null);
    const amt = Number(amount);
    if (!amt || amt <= 0) return setError("Enter the donation amount.");
    if (donorKind === "individual" && (!firstName.trim() || !lastName.trim())) return setError("Enter the donor's first and last name.");
    if (donorKind === "organization" && !orgName.trim()) return setError("Enter the organization name.");
    if (!anonymous && emailReceipt && !email.trim()) return setError("Enter an email to send the receipt, or turn the receipt off.");
    if (method === "check" && !checkNumber.trim()) return setError("Enter the check number.");
    if (method === "check" && !checkImage) return setError("Take or upload a photo of the check.");

    const fd = new FormData();
    fd.set("method", method!);
    fd.set("amount", String(amt));
    fd.set("dateReceived", dateReceived);
    if (!station.officeId) {
      setError("Choose this station's office first.");
      return;
    }
    fd.set("officeId", station.officeId);
    fd.set("donorKind", donorKind);
    fd.set("firstName", firstName);
    fd.set("lastName", lastName);
    fd.set("orgName", orgName);
    fd.set("email", email);
    fd.set("phone", phone);
    fd.set("address1", address1);
    fd.set("address2", address2);
    fd.set("city", city);
    fd.set("state", state);
    fd.set("zip", zip);
    fd.set("emailReceipt", String(!anonymous && emailReceipt));
    fd.set("notes", notes);
    if (method === "check") {
      fd.set("checkNumber", checkNumber);
      fd.set("checkImage", checkImage!);
    }

    setSaving(true);
    try {
      const res = await fetch("/api/inkind/cash-check", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't save the donation");
      const receiptNote = json.receipt
        ? json.receipt.sent
          ? `Receipt emailed to ${email.trim()}.`
          : `Saved, but the receipt email didn't send (${json.receipt.error}). It can be resent from admin.`
        : null;
      setDone({ receiptNumber: json.receiptNumber, receiptNote });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the donation");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------- done
  if (done) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-5 p-6 text-center">
        <Logo />
        <div className="h-16 w-16 rounded-full bg-brand-light text-brand-dark flex items-center justify-center text-3xl">✓</div>
        <h1 className="text-2xl font-bold text-brand-dark">Donation recorded</h1>
        <p className="text-gray-600">
          Receipt <span className="font-semibold">{done.receiptNumber}</span>
        </p>
        {done.receiptNote && <p className="text-sm text-gray-500 max-w-sm">{done.receiptNote}</p>}
        <button
          onClick={() => router.push("/inkind")}
          className="tap-target rounded-2xl bg-brand px-10 py-4 text-lg font-semibold text-white shadow-lg active:scale-95 transition"
        >
          Done
        </button>
      </main>
    );
  }

  // ------------------------------------------------------- cash or check
  if (!method) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 text-center">
        <Logo />
        <h1 className="text-2xl font-bold text-brand-dark">Cash or check?</h1>
        <StationOfficeBar station={station} />
        <div className="w-full max-w-md grid grid-cols-2 gap-4">
          {(["cash", "check"] as Method[]).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              disabled={!station.office}
              className="tap-target rounded-2xl bg-brand py-10 text-2xl font-semibold text-white shadow-lg active:scale-95 transition capitalize"
            >
              {m}
            </button>
          ))}
        </div>
        <button onClick={() => router.push("/inkind")} className="text-sm text-gray-500 underline">
          Back
        </button>
      </main>
    );
  }

  // ----------------------------------------------------------------- form
  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => setMethod(null)} className="text-sm text-gray-500">
            ← Back
          </button>
          <Logo className="h-8 w-auto" />
        </div>

        <div className="rounded-2xl bg-white shadow-xl border border-gray-100 p-6 space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">{method === "cash" ? "Cash donation" : "Check donation"}</p>
            <div className="mt-2 flex items-center rounded-xl border border-gray-300 px-4 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-light">
              <span className="text-3xl text-gray-400">$</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.00"
                className="w-full bg-transparent px-2 py-4 text-4xl font-semibold outline-none"
              />
            </div>
            <label className="mt-3 flex items-center justify-between text-sm text-gray-600">
              Date received
              <input type="date" value={dateReceived} onChange={(e) => setDateReceived(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2" />
            </label>
          </div>

          {method === "check" && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Check</h2>
              <div className={groupBox}>
                <input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} placeholder="Check number" inputMode="numeric" className={field} />
              </div>
              {preview ? (
                <div className="space-y-2">
                  <img src={preview} alt="Check" className="w-full rounded-xl border border-gray-200" />
                  <button onClick={() => { setCheckImage(null); setPreview(null); }} className="text-sm text-red-600">
                    Remove photo
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => cameraInput.current?.click()}
                    disabled={processingImage}
                    className="rounded-xl border-2 border-dashed border-brand py-5 font-medium text-brand-dark disabled:opacity-50"
                  >
                    📷 Take photo
                  </button>
                  <button
                    type="button"
                    onClick={() => uploadInput.current?.click()}
                    disabled={processingImage}
                    className="rounded-xl border-2 border-dashed border-gray-300 py-5 font-medium text-gray-700 disabled:opacity-50"
                  >
                    ⬆ Upload image
                  </button>
                </div>
              )}
              {processingImage && <p className="text-sm text-gray-500">Processing photo…</p>}
              <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImage(e.target.files?.[0])} />
              <input ref={uploadInput} type="file" accept="image/*" className="hidden" onChange={(e) => handleImage(e.target.files?.[0])} />
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Donor</h2>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["individual", "Individual"],
                  ["organization", "Organization"],
                  ["anonymous", "Anonymous"],
                ] as [DonorKind, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setDonorKind(k)}
                  className={`rounded-lg border py-2 text-sm font-medium ${donorKind === k ? "border-brand bg-brand-light text-brand-dark" : "border-gray-300 text-gray-600"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {!anonymous && (
              <>
                {donorKind === "organization" && (
                  <div className={groupBox}>
                    <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Organization name" className={field} />
                  </div>
                )}
                <div className={groupBox}>
                  <div className="grid grid-cols-2 divide-x divide-gray-200">
                    <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={donorKind === "organization" ? "Contact first name" : "First name"} autoComplete="off" className={field} />
                    <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" autoComplete="off" className={field} />
                  </div>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="off" className={field} />
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" autoComplete="off" className={field} />
                </div>

                <h3 className="text-sm font-semibold text-gray-700 pt-1">Address</h3>
                <div className={groupBox}>
                  <input value={address1} onChange={(e) => setAddress1(e.target.value)} placeholder="Street address" autoComplete="off" className={field} />
                  <input value={address2} onChange={(e) => setAddress2(e.target.value)} placeholder="Apt, suite (optional)" autoComplete="off" className={field} />
                  <div className="grid grid-cols-[2fr_1fr_1.3fr] divide-x divide-gray-200">
                    <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" autoComplete="off" className={field} />
                    <input value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} placeholder="ST" autoComplete="off" className={field} />
                    <input value={zip} onChange={(e) => setZip(e.target.value.replace(/[^0-9-]/g, "").slice(0, 10))} placeholder="ZIP" inputMode="numeric" autoComplete="off" className={field} />
                  </div>
                </div>

                <label className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                  <span className="text-sm text-gray-700">Email a receipt to the donor</span>
                  <input type="checkbox" checked={emailReceipt} onChange={(e) => setEmailReceipt(e.target.checked)} className="h-5 w-5 accent-[var(--color-brand)]" />
                </label>
              </>
            )}
          </section>

          <div className={groupBox}>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className={field} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={submit}
            disabled={saving || processingImage}
            className="w-full rounded-xl bg-brand py-4 text-lg font-semibold text-white shadow active:scale-[0.99] transition disabled:opacity-50"
          >
            {saving ? "Saving…" : `Record ${amount && Number(amount) > 0 ? Number(amount).toLocaleString("en-US", { style: "currency", currency: "USD" }) : "donation"}`}
          </button>
        </div>
      </div>
    </main>
  );
}
