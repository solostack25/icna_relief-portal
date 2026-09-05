// ICNA Relief's national leadership team page - the only place on the
// public website with employee bios (executive leadership only: CEO,
// CSO, etc.). This is a real, confirmed-live page, not a guess at a
// URL pattern. Regular staff have no public bio anywhere on the
// website - for them, Active Directory (see the copilot route that
// calls this) is the only real source, and this lookup will simply
// find nothing, which the tool should treat as "no bio available"
// rather than an error.
const TEAM_PAGE_URL = "https://icnarelief.org/?p=244";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;/g, "\u2019")
    .replace(/&#8216;/g, "\u2018")
    .replace(/&#8220;/g, "\u201c")
    .replace(/&#8221;/g, "\u201d")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// Naive but effective for this page's flat structure: find the
// person's name, then take everything up to the next line that looks
// like another person's name (repeated exactly twice in a row, which
// is how this page's markup renders each entry's heading + alt text).
export async function findIcnaTeamBio(name: string): Promise<{ found: false } | { found: true; title: string | null; bio: string }> {
  try {
    const res = await fetch(TEAM_PAGE_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { found: false };
    const text = stripHtml(await res.text());
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

    const nameLower = name.trim().toLowerCase();
    // Match on the surname or full name loosely - team page names are
    // often prefixed ("Br. ", "Dr. ") which a literal full-name match
    // would miss.
    const idx = lines.findIndex((l) => l.toLowerCase().includes(nameLower) || nameLower.split(" ").every((part) => l.toLowerCase().includes(part)));
    if (idx === -1) return { found: false };

    // Skip past the repeated name heading (rendered twice: once as an
    // image alt tag, once as the visible heading).
    let start = idx;
    while (start + 1 < lines.length && lines[start + 1].toLowerCase() === lines[idx].toLowerCase()) start++;

    const title = lines[start + 1] ?? null;
    const bioLines: string[] = [];
    for (let i = start + 2; i < lines.length && bioLines.join(" ").length < 1200; i++) {
      const line = lines[i];
      // Stop at what looks like the next person's name entry (a short
      // line immediately followed by an identical repeat).
      if (line === lines[i + 1] && line.length < 60) break;
      bioLines.push(line);
    }

    return { found: true, title, bio: bioLines.join(" ").trim() };
  } catch {
    return { found: false };
  }
}
