import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PUBLIC_WEBSITE_URL } from "@/lib/publicWebsiteShared";
import { fetchWebsiteSchema, WEBSITE_SCHEMA_URL } from "@/lib/websiteContent";
import WebsiteEditor, { type SavedSection } from "./WebsiteEditor";

export const dynamic = "force-dynamic";

const h1Style: React.CSSProperties = { fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, margin: "0 0 8px" };

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 style={h1Style}>Website</h1>
      <div style={{ background: "#fff", border: "1px solid rgba(22,48,43,0.1)", borderRadius: 14, padding: "20px 22px", maxWidth: 680 }}>
        <p style={{ fontWeight: 600, margin: "0 0 6px" }}>{title}</p>
        <div className="text-sm" style={{ color: "rgba(22,48,43,0.7)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// Admin > Website: edit what the public website says. Open only to people on web_content_editors.
export default async function WebsiteContentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: allowed, error: accessError } = await supabase.rpc("is_web_content_editor");
  if (accessError) {
    return (
      <Notice title="One database step is left.">
        <p>
          Run <code>supabase/web_content_migration.sql</code> in the Supabase SQL editor. It creates the tables this page saves to and
          puts you on the editors list.
        </p>
      </Notice>
    );
  }
  if (allowed !== true) {
    return (
      <Notice title="You’re not on the website editors list.">
        <p>Editing the public website is limited to a short list of people. Ask IT if you need to be added.</p>
      </Notice>
    );
  }

  const [schema, { data: rows, error: rowsError }] = await Promise.all([
    fetchWebsiteSchema(),
    supabase.from("web_content").select("key, value, updated_at"),
  ]);

  if (!schema) {
    return (
      <Notice title="The website didn’t answer.">
        <p>
          This page asks the website what can be edited, at <code>{WEBSITE_SCHEMA_URL}</code>, and got no usable answer. Either the site
          is down, or the version that supports editing hasn’t been deployed there yet. Nothing has been changed.
        </p>
      </Notice>
    );
  }
  if (rowsError) {
    return (
      <Notice title="Couldn’t load what’s been saved.">
        <p>{rowsError.message}</p>
      </Notice>
    );
  }

  const saved: Record<string, SavedSection> = Object.fromEntries((rows ?? []).map((r) => [r.key, { value: r.value, updated_at: r.updated_at }]));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 style={h1Style}>Website</h1>
          <p className="text-sm" style={{ color: "rgba(22,48,43,0.6)", margin: 0, maxWidth: 640 }}>
            Edit what the public website says. A change goes live when you save its section. Anything you haven’t changed keeps
            the website’s own built-in content.
          </p>
        </div>
        <a
          href={PUBLIC_WEBSITE_URL}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold px-4 py-2 rounded-lg"
          style={{ border: "1px solid rgba(22,48,43,0.2)", background: "#fff", color: "#16302B" }}
        >
          Open the website ↗
        </a>
      </div>
      <WebsiteEditor schema={schema} saved={saved} />
    </div>
  );
}
