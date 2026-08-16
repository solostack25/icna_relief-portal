// Block-based email content, replacing the raw-HTML textarea.
// Blocks are stored as-is in email_campaigns.body_blocks; body_html
// is derived from them at send time via renderBlocksToHtml() (and
// cached on the campaign row for quick preview/debugging), same
// split as the Flier Builder's canvas_data -> rendered image.

export type HeadingBlock = { id: string; type: "heading"; text: string; align: "left" | "center" };
export type TextBlock = { id: string; type: "text"; text: string; align: "left" | "center" };
export type ImageBlock = { id: string; type: "image"; imageUrl: string; alt: string };
export type ButtonBlock = { id: string; type: "button"; label: string; url: string };
export type DividerBlock = { id: string; type: "divider" };
export type SpacerBlock = { id: string; type: "spacer"; height: number };

export type EmailBlock = HeadingBlock | TextBlock | ImageBlock | ButtonBlock | DividerBlock | SpacerBlock;

export function newBlock(type: EmailBlock["type"]): EmailBlock {
  const id = crypto.randomUUID();
  switch (type) {
    case "heading":
      return { id, type, text: "Heading", align: "left" };
    case "text":
      return { id, type, text: "Write something...", align: "left" };
    case "image":
      return { id, type, imageUrl: "", alt: "" };
    case "button":
      return { id, type, label: "Learn More", url: "https://" };
    case "divider":
      return { id, type };
    case "spacer":
      return { id, type, height: 24 };
  }
}

// Simple, table-free HTML - fine for the mainstream mail client
// rendering this needs to support; not attempting bulletproof
// Outlook-desktop table-based markup here.
export function renderBlocksToHtml(blocks: EmailBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "heading":
          return `<h2 style="font-family:Arial,sans-serif;text-align:${b.align};margin:16px 0;color:#16302B;">${escapeHtml(b.text)}</h2>`;
        case "text":
          return `<p style="font-family:Arial,sans-serif;text-align:${b.align};margin:12px 0;color:#333;line-height:1.5;">${escapeHtml(b.text).replace(/\n/g, "<br/>")}</p>`;
        case "image":
          return b.imageUrl
            ? `<img src="${b.imageUrl}" alt="${escapeHtml(b.alt)}" style="max-width:100%;display:block;margin:16px 0;" />`
            : "";
        case "button":
          return `<div style="margin:20px 0;"><a href="${b.url}" style="background:#1F6F54;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-family:Arial,sans-serif;display:inline-block;">${escapeHtml(b.label)}</a></div>`;
        case "divider":
          return `<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;" />`;
        case "spacer":
          return `<div style="height:${b.height}px;"></div>`;
      }
    })
    .join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
