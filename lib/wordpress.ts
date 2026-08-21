import { getIntegrationSetting } from "@/lib/integrationSettings";

// Thin client over the WordPress core REST API (wp/v2/pages), authenticated
// with an Application Password — no plugin needed on the WP side beyond
// what's already shipped (icna-fundraisers.php), since page CREATION goes
// through core WP REST, and the live donate widget/progress bar embedded
// inside the created page's content is just the [icna_fundraiser] shortcode
// that plugin already renders. This keeps one source of truth for the
// dynamic bits (the plugin, fetching /api/fundraisers) and only generates
// the static narrative content (hero, story, updates) once, at publish time.

export class WordPressNotConfiguredError extends Error {
  constructor() {
    super("WordPress connection is not configured. Add Site URL, Username, and Application Password under Admin → Connectors.");
    this.name = "WordPressNotConfiguredError";
  }
}

export class WordPressApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`WordPress API error (${status}): ${describeWpErrorBody(body)}`);
    this.name = "WordPressApiError";
    this.status = status;
    this.body = body;
  }
}

// If the response isn't valid JSON, res.json() silently gives us null and
// the real reason gets lost. That "null" case almost always means
// something *other* than WordPress itself intercepted the request - a
// security plugin, a host-level WAF, or Authorization headers getting
// stripped before PHP ever sees them (a very common Apache/PHP-FPM issue
// with Application Passwords) - so surface the raw text instead of just
// swallowing it as null.
function describeWpErrorBody(body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as any;
    if (b.message) return `${b.message}${b.code ? ` (${b.code})` : ""}`;
    return JSON.stringify(body);
  }
  if (typeof body === "string" && body.trim()) {
    // Likely an HTML error page from a WAF/security plugin/host - trim to
    // something readable rather than dumping a full page of markup.
    const stripped = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return stripped.slice(0, 300) || "(empty response body)";
  }
  return "(no response body - likely blocked before reaching WordPress, e.g. by a security plugin/WAF or a stripped Authorization header)";
}

async function parseWpResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function getConfig() {
  const [siteUrl, username, appPassword] = await Promise.all([
    getIntegrationSetting("wp_site_url"),
    getIntegrationSetting("wp_username"),
    getIntegrationSetting("wp_app_password"),
  ]);
  if (!siteUrl || !username || !appPassword) throw new WordPressNotConfiguredError();
  return { siteUrl: siteUrl.replace(/\/$/, ""), username, appPassword };
}

async function wpRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { siteUrl, username, appPassword } = await getConfig();
  const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");

  const res = await fetch(`${siteUrl}/wp-json/wp/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const body = await parseWpResponse(res);
  if (!res.ok) throw new WordPressApiError(res.status, body);
  return body as T;
}

export type WpPage = { id: number; link: string; status: string };

export async function createPage(input: { title: string; content: string; slug: string; status?: "publish" | "draft" }): Promise<WpPage> {
  return wpRequest<WpPage>("/pages", {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      slug: input.slug,
      status: input.status ?? "publish",
    }),
  });
}

export async function updatePage(pageId: number, input: { title?: string; content?: string; status?: "publish" | "draft" }): Promise<WpPage> {
  return wpRequest<WpPage>(`/pages/${pageId}`, {
    method: "POST", // WP REST uses POST for partial updates too
    body: JSON.stringify(input),
  });
}

export async function uploadMedia(fileBuffer: Buffer, filename: string, mimeType: string): Promise<{ id: number; source_url: string }> {
  const { siteUrl, username, appPassword } = await getConfig();
  const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");

  const res = await fetch(`${siteUrl}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    },
    body: fileBuffer as unknown as BodyInit,
  });

  const body = await parseWpResponse(res);
  if (!res.ok) throw new WordPressApiError(res.status, body);
  return { id: (body as any).id, source_url: (body as any).source_url };
}

export async function isConfigured(): Promise<boolean> {
  const [siteUrl, username, appPassword] = await Promise.all([
    getIntegrationSetting("wp_site_url"),
    getIntegrationSetting("wp_username"),
    getIntegrationSetting("wp_app_password"),
  ]);
  return !!(siteUrl && username && appPassword);
}

// ---------- GoFundMe-style page content generator ----------
//
// Builds the WP page body as Gutenberg block markup so it's editable
// normally in the WP block editor afterward, not a raw HTML blob. The
// donate button / progress bar / raised-amount are intentionally left
// to the [icna_fundraiser] shortcode (already live-data-driven via
// icna-fundraisers.php) rather than baked in here as static numbers,
// so they never go stale.

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildFundraiserPageContent(fundraiser: {
  title: string;
  slug: string;
  header_image?: string | null;
  organizer_name?: string | null;
  office_name?: string | null;
  story?: string | null;
  description?: string | null;
  updates?: { id: string; posted_at: string; message: string }[];
}): string {
  const blocks: string[] = [];

  if (fundraiser.header_image) {
    blocks.push(
      `<!-- wp:image {"align":"wide","sizeSlug":"large"} -->\n<figure class="wp-block-image alignwide size-large"><img src="${escapeHtml(
        fundraiser.header_image
      )}" alt="${escapeHtml(fundraiser.title)}"/></figure>\n<!-- /wp:image -->`
    );
  }

  blocks.push(`<!-- wp:heading {"level":1} -->\n<h1>${escapeHtml(fundraiser.title)}</h1>\n<!-- /wp:heading -->`);

  const organizerLine = [fundraiser.organizer_name, fundraiser.office_name].filter(Boolean).join(" · ");
  if (organizerLine) {
    blocks.push(
      `<!-- wp:paragraph {"style":{"color":{"text":"#6b7280"}}} -->\n<p style="color:#6b7280">Organized by ${escapeHtml(
        organizerLine
      )}</p>\n<!-- /wp:paragraph -->`
    );
  }

  // Live donate widget + progress bar + goal, always current since it's
  // rendered by the plugin from /api/fundraisers at page-load time.
  blocks.push(`<!-- wp:shortcode -->\n[icna_fundraiser slug="${fundraiser.slug}"]\n<!-- /wp:shortcode -->`);

  const story = fundraiser.story || fundraiser.description;
  if (story) {
    blocks.push(`<!-- wp:heading {"level":2} -->\n<h2>Our Story</h2>\n<!-- /wp:heading -->`);
    const paragraphs = story
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const p of paragraphs) {
      blocks.push(`<!-- wp:paragraph -->\n<p>${escapeHtml(p)}</p>\n<!-- /wp:paragraph -->`);
    }
  }

  if (fundraiser.updates && fundraiser.updates.length > 0) {
    blocks.push(`<!-- wp:heading {"level":2} -->\n<h2>Updates</h2>\n<!-- /wp:heading -->`);
    for (const update of fundraiser.updates) {
      const date = new Date(update.posted_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      blocks.push(
        `<!-- wp:group {"className":"icna-fnd-update"} -->\n<div class="wp-block-group icna-fnd-update"><!-- wp:paragraph {"style":{"typography":{"fontWeight":"600"}}} -->\n<p style="font-weight:600">${escapeHtml(
          date
        )}</p>\n<!-- /wp:paragraph --><!-- wp:paragraph -->\n<p>${escapeHtml(update.message)}</p>\n<!-- /wp:paragraph --></div>\n<!-- /wp:group -->`
      );
    }
  }

  return blocks.join("\n\n");
}
