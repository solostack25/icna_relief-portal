// Client-safe: Defender custom indicator types and input checks.

export const INDICATOR_TYPES = {
  FileSha256: { label: "File (SHA-256)", hint: "64-character hash from Defender, VirusTotal or the alert", re: /^[a-f0-9]{64}$/i, action: "BlockAndRemediate" },
  FileSha1: { label: "File (SHA-1)", hint: "40-character hash", re: /^[a-f0-9]{40}$/i, action: "BlockAndRemediate" },
  Url: { label: "Web address (URL)", hint: "Full link, e.g. https://bad.example/login", re: /^https?:\/\/[^\s/$.?#][^\s]*$/i, action: "Block" },
  DomainName: { label: "Domain", hint: "e.g. bad-site.example (blocks the whole site)", re: /^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i, action: "Block" },
  IpAddress: { label: "IP address", hint: "Public IPv4 or IPv6 address", re: /^((25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}|[0-9a-f:]{2,39})$/i, action: "Block" },
} as const;

export type IndicatorType = keyof typeof INDICATOR_TYPES;

// Never let someone block ICNA's own sites, Microsoft, or private ranges
// by mistake: that would cut every PC off from work.
const PROTECTED = /(^|\.)(icnarelief\.org|icna\.org|microsoft\.com|microsoftonline\.com|office\.com|office365\.com|windows\.net|live\.com|outlook\.com|sharepoint\.com|teams\.microsoft\.com|vercel\.app|supabase\.co)$/i;
const PRIVATE_IP = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fe80:|fc|fd)/i;

export function checkIndicator(type: string, raw: string): { value?: string; error?: string } {
  const t = INDICATOR_TYPES[type as IndicatorType];
  if (!t) return { error: "Pick what kind of thing to block." };
  const value = raw.trim();
  if (!t.re.test(value)) return { error: `That doesn't look like a valid ${t.label.toLowerCase()}.` };
  if (type === "DomainName" && PROTECTED.test(value)) return { error: "That domain is used for work (ICNA or Microsoft) and can't be blocked from here." };
  if (type === "Url") {
    try {
      if (PROTECTED.test(new URL(value).hostname)) return { error: "That address is on a work domain (ICNA or Microsoft) and can't be blocked from here." };
    } catch {
      return { error: "That doesn't look like a valid web address." };
    }
  }
  if (type === "IpAddress" && PRIVATE_IP.test(value)) return { error: "That's a private/internal address; blocking it would cut off office networks." };
  return { value: type.startsWith("File") ? value.toLowerCase() : value };
}
