#!/usr/bin/env node
// Static mobile-layout audit for the portal.
// Usage: node scripts/mobile-audit.mjs [--json] [--all] [--strict] [dirs...]
//   --all     include rules already handled by the global CSS safety net
//   --strict  exit 1 if any high-severity hit (for CI)   (default dirs: app components)
// Flags patterns that commonly break on phones (~390px wide). Heuristic: review each hit.

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const dirs = args.filter((a) => !a.startsWith("--"));
const roots = dirs.length ? dirs : ["app", "components"];

const RULES = [
  {
    id: "pill-stretch",
    sev: "high",
    msg: "Rounded pill/badge in a flex row without alignSelf/flexShrink — stretches into an oval when the row wraps",
    test: (line, ctx) =>
      /borderRadius:\s*(999|9999|"999px"|"9999px"|"50%")/.test(line) &&
      /padding/.test(line) &&
      !/alignSelf|flexShrink|flex:\s*"?0/.test(line) &&
      ctx.parentFlexNoAlign(),
  },
  {
    id: "input-zoom",
    sev: "high",
    msg: "Form field with font-size under 16px — iOS Safari zooms the page when it's tapped",
    test: (line) => /<(input|select|textarea)\b/.test(line) && /fontSize:\s*(1[0-5]|[0-9])\b/.test(line),
  },
  {
    id: "fixed-grid",
    sev: "high",
    msg: "Multi-column grid with no auto-fit or mobile media query — columns get crushed on phones",
    test: (line, ctx) => {
      const m = line.match(/gridTemplateColumns:\s*["'`]([^"'`]+)["'`]/);
      if (!m) return false;
      const v = m[1];
      if (/auto-fit|auto-fill/.test(v)) return false;
      const tracks = v.replace(/minmax\([^)]*\)/g, "X").replace(/repeat\((\d+),[^)]*\)/g, (_, n) => "X ".repeat(+n)).trim().split(/\s+/);
      const bigFixed = tracks.some((t) => /^(\d+)px$/.test(t) && parseInt(t) > 160);
      if (tracks.length < 3 && !bigFixed) return false;
      return !ctx.hasMediaQuery;
    },
  },
  {
    id: "table-no-scroll",
    sev: "medium",
    msg: "<table> without an overflow-x wrapper — wide tables push the whole page sideways",
    test: (line, ctx) => /<table\b/.test(line) && !ctx.lookback(8, /overflow(X)?:\s*["']?(auto|scroll)|overflow-x-auto|tableWrap|TableScroll/),
  },
  {
    id: "fixed-width",
    sev: "medium",
    msg: "Hard-coded width ≥ 400px without maxWidth — wider than a phone screen",
    test: (line) => /(^|[^a-zA-Z_])width:\s*["']?(4\d\d|[5-9]\d\d|\d{4})(px)?["']?\s*[,}]/.test(line) && !/maxWidth|max-width|minWidth/.test(line),
  },
  {
    id: "vh-100",
    sev: "low",
    msg: "100vh — on iOS this is taller than the visible screen (address bar). Prefer 100dvh",
    test: (line) => /100vh/.test(line) && !/dvh|svh/.test(line),
  },
  {
    id: "fixed-bottom-safe-area",
    sev: "low",
    msg: "position: fixed at the bottom without safe-area padding — overlaps the iPhone home bar in the PWA",
    test: (line, ctx) => /position:\s*["']fixed["']/.test(line) && /bottom:/.test(line) && !ctx.fileHas(/safe-area-inset-bottom/),
  },
  {
    id: "tiny-text",
    sev: "low",
    msg: "Font size under 12px — hard to read on phones",
    test: (line) => /fontSize:\s*(9|10|11)(\.\d+)?\s*[,}]/.test(line),
  },
  {
    id: "hover-only",
    sev: "low",
    msg: "onMouseEnter/onMouseOver without onClick — hover-only UI doesn't exist on touch screens",
    test: (line, ctx) => /onMouse(Enter|Over)=/.test(line) && !ctx.around(3, /onClick|onFocus|onTouch|onPointer/),
  },
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

// Rules already neutralised by the global safety net in app/globals.css.
const globals = fs.existsSync("app/globals.css") ? fs.readFileSync("app/globals.css", "utf8") : "";
const covered = new Set();
if (/Mobile safety net/.test(globals)) {
  if (/font-size:\s*16px/.test(globals)) covered.add("input-zoom");
  if (/table:not\(\.no-mobile-scroll\)/.test(globals)) covered.add("table-no-scroll");
  if (/border-radius: 999px/.test(globals)) covered.add("pill-stretch");
}
const showCovered = args.includes("--all");

const findings = [];
for (const file of roots.flatMap((r) => walk(r))) {
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");
  const hasMediaQuery = /@media/.test(src) || /useMediaQuery|isMobile|matchMedia/.test(src);
  lines.forEach((line, i) => {
    const ctx = {
      hasMediaQuery,
      fileHas: (re) => re.test(src),
      lookback: (n, re) => re.test(lines.slice(Math.max(0, i - n), i + 1).join("\n")),
      around: (n, re) => re.test(lines.slice(Math.max(0, i - n), i + n + 1).join("\n")),
      parentFlexNoAlign: () => {
        // Nearest enclosing line above (within 12) that opens a flex container.
        for (let j = i - 1; j >= Math.max(0, i - 12); j--) {
          if (/display:\s*["']flex["']/.test(lines[j]) && !/flexDirection:\s*["']column/.test(lines[j]))
            return !/alignItems/.test(lines[j]);
        }
        return false;
      },
    };
    for (const r of RULES) {
      if (covered.has(r.id) && !showCovered) continue;
      try {
        if (r.test(line, ctx)) findings.push({ rule: r.id, sev: r.sev, file, line: i + 1, msg: r.msg, code: line.trim().slice(0, 140) });
      } catch {}
    }
  });
}

const order = { high: 0, medium: 1, low: 2 };
findings.sort((a, b) => order[a.sev] - order[b.sev] || a.file.localeCompare(b.file) || a.line - b.line);

if (asJson) {
  console.log(JSON.stringify(findings, null, 2));
} else {
  const byRule = {};
  for (const f of findings) (byRule[f.rule] ??= []).push(f);
  for (const r of RULES) {
    const hits = byRule[r.id];
    if (!hits) continue;
    console.log(`\n[${r.sev.toUpperCase()}] ${r.id} — ${hits.length} hit(s)\n  ${r.msg}`);
    for (const h of hits) console.log(`  ${h.file}:${h.line}  ${h.code}`);
  }
  const c = (s) => findings.filter((f) => f.sev === s).length;
  console.log(`\nTotal: ${findings.length}  (high ${c("high")}, medium ${c("medium")}, low ${c("low")})`);
}
process.exitCode = findings.some((f) => f.sev === "high") && args.includes("--strict") ? 1 : 0;
