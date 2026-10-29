import { NextResponse } from "next/server";
import { xapiRaw } from "@/lib/threecx";
import { recordingDownloadPath } from "@/lib/threecxAdmin";
import { errorMessage, phoneAudit, requirePhonesViewer } from "@/lib/phonesAdmin";

// Streams a 3CX call recording to an IT admin's browser. Recordings sit
// behind the PBX's own auth, so the portal fetches them with its token.
// Each play/download is logged in phone_admin_audit.
export async function GET(req: Request) {
  const viewer = await requirePhonesViewer();
  if (viewer instanceof NextResponse) return viewer;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing recording id." }, { status: 400 });
  try {
    const res = await xapiRaw(recordingDownloadPath(id));
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json({ error: `3CX ${res.status}: ${text.slice(0, 200)}` }, { status: 502 });
    }
    await phoneAudit({ actor: viewer, system: "3cx", action: "play_recording", target: `recording ${id}`, ok: true });
    return new NextResponse(res.body, {
      headers: {
        "Content-Type": res.headers.get("content-type") || "audio/wav",
        "Content-Disposition": `inline; filename="recording-${id}.wav"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 502 });
  }
}
