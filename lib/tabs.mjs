// Read / write the markdown file-DB. Each Tab is one file in data/tracker_tabs/,
// following the SYSTEM PROTOCOL §2 schema. The file is human-readable and
// human-editable; we always round-trip through parse()/serialize() so writes stay
// consistent no matter who touched the file last.

import fs from "node:fs";
import path from "node:path";
import { TABS_DIR } from "./paths.mjs";
import { slugify, todayISO, normalizeHandle } from "./util.mjs";
import { joinLabels, splitLabels } from "./video_labels.mjs";

function ensureDir() {
  fs.mkdirSync(TABS_DIR, { recursive: true });
}

// ---- frontmatter (tiny, flat key: value only) -----------------------------

function parseFrontmatter(text) {
  const meta = {};
  let body = text;
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (m) {
    body = text.slice(m[0].length);
    for (const line of m[1].split("\n")) {
      const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
      if (kv) {
        let v = kv[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        meta[kv[1]] = v;
      }
    }
  }
  return { meta, body };
}

// ---- competitor bullet lines: `handle | size | baselineVph` ---------------

function parseCompetitorBlock(body, heading) {
  // matches "- **Direct Competitors:**" followed by indented "- a | b | c" bullets
  const re = new RegExp(`-\\s*\\*\\*${heading}:\\*\\*([\\s\\S]*?)(?=\\n-\\s*\\*\\*|\\n#|\\n---|$)`);
  const m = body.match(re);
  const out = [];
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    const b = line.match(/^\s*[-*]\s+(.+)$/);
    if (!b) continue;
    const parts = b[1].split("|").map((s) => s.trim());
    if (!parts[0]) continue;
    // skip the "none yet" placeholder so it never round-trips into real data
    const bare = parts[0].replace(/[_*()@]/g, "").trim().toLowerCase();
    if (!bare || bare === "none yet" || bare === "none") continue;
    out.push({
      handle: normalizeHandle(parts[0]),
      size: parts[1] || "",
      baselineVph: parts[2] ? Number(parts[2].replace(/[^\d.]/g, "")) || null : null,
    });
  }
  return out;
}

function parseInlineField(body, heading) {
  const re = new RegExp(`-\\s*\\*\\*${heading}:\\*\\*\\s*(.*)`);
  const m = body.match(re);
  return m ? m[1].trim() : "";
}

// ---- Content Performance Engine markdown table ----------------------------

const TABLE_COLUMNS = [
  "Video Title", "Handle", "Video ID", "Publish Date", "Views",
  "VPH", "Outlier", "Tier", "Labels", "Source", "First Seen",
];

// A markdown table cell can't hold a raw "|" (it starts a new column) or a
// newline (it ends the row) — and YouTube titles routinely contain both. Escape
// them on write, reverse on read, so a title like `A | B` round-trips instead of
// silently shifting every column after it.
function escapeCell(v) {
  return String(v ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}
function unescapeCell(s) {
  // reverses escapeCell: `\\`→`\`, `\|`→`|` (only sequences escapeCell emits)
  return String(s ?? "").replace(/\\(.)/g, "$1");
}

// Header-aware parse: reads columns by their header name, so the schema can grow
// (e.g. adding "Video ID") without breaking older files that lack a column.
function parseTable(body) {
  const videos = [];
  const start = body.indexOf("Content Performance Engine");
  if (start === -1) return videos;
  const lines = body.slice(start).split("\n");
  let cols = null;
  for (const line of lines) {
    if (!line.trim().startsWith("|")) {
      if (cols) break; // table ended
      continue;
    }
    // split on unescaped pipes only (the format always pads cells with spaces,
    // so a real delimiter is never preceded by a backslash), then unescape.
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((c) => unescapeCell(c.trim()));
    if (!cols) {
      cols = cells.map((c) => c.toLowerCase()); // header row
      continue;
    }
    if (/^-+$/.test(cells[0]?.replace(/\s/g, "") || "")) continue; // separator
    if (cells.every((c) => c === "")) continue;
    const at = (name) => {
      const i = cols.indexOf(name.toLowerCase());
      return i === -1 ? "" : cells[i] ?? "";
    };
    videos.push({
      title: at("Video Title"),
      handle: normalizeHandle(at("Handle")),
      videoId: at("Video ID"),
      publishDate: at("Publish Date"),
      views: numOrNull(at("Views")),
      vph: numOrNull(at("VPH")),
      outlier: numOrNull(at("Outlier")),
      tier: at("Tier"),
      labels: splitLabels(at("Labels")),
      source: at("Source"),
      firstSeen: at("First Seen"),
    });
  }
  return videos;
}

function numOrNull(s) {
  if (s == null || s === "" || s === "—") return null;
  const n = Number(String(s).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// ---- public API -----------------------------------------------------------

export function parseTab(text, slugFallback) {
  const { meta, body } = parseFrontmatter(text);
  const niche =
    meta.niche ||
    (body.match(/###\s*TARGET NICHE:\s*(.+)/)?.[1] || "").trim() ||
    slugFallback;
  const activeRaw = parseInlineField(body, "Active Tracking Channels");
  const registryRaw = parseInlineField(body, "Ingested Vision Registry");
  const reg = registryRaw.split("|").map((s) => s.trim());
  return {
    slug: meta.slug || slugFallback,
    niche,
    portfolio: meta.portfolio || "",
    created: meta.created || "",
    updated: meta.updated || "",
    activeChannels: activeRaw
      ? activeRaw.split(",").map((s) => normalizeHandle(s)).filter(Boolean)
      : [],
    directCompetitors: parseCompetitorBlock(body, "Direct Competitors"),
    risingCompetitors: parseCompetitorBlock(body, "Rising Competitors"),
    registry: {
      lastDate: reg[0] || "",
      channels: reg[1] ? Number(reg[1].replace(/[^\d]/g, "")) || 0 : 0,
      videos: reg[2] ? Number(reg[2].replace(/[^\d]/g, "")) || 0 : 0,
    },
    videos: parseTable(body),
  };
}

export function serializeTab(tab) {
  const active = tab.activeChannels?.length ? tab.activeChannels.join(", ") : "—";
  const compLines = (list) =>
    list?.length
      ? list.map((c) => `  - ${c.handle} | ${c.size || "?"} | ${c.baselineVph ?? "?"}`).join("\n")
      : "  _(none yet)_"; // NOT a list item, so it never parses back as a competitor
  const reg = tab.registry || {};
  const registryLine = reg.lastDate
    ? `${reg.lastDate} | ${reg.channels || 0} channels | ${reg.videos || 0} videos`
    : "never | 0 channels | 0 videos";

  const rows = (tab.videos || [])
    .map((v) =>
      `| ${[v.title || "", v.handle || "", v.videoId || "", v.publishDate || "", v.views ?? "", v.vph ?? "", v.outlier ?? "", v.tier || "", joinLabels(v.labels), v.source || "", v.firstSeen || ""].map(escapeCell).join(" | ")} |`
    )
    .join("\n");

  const table =
    `| ${TABLE_COLUMNS.join(" | ")} |\n` +
    `|${TABLE_COLUMNS.map(() => "---").join("|")}|\n` +
    (rows || "");

  return `---
slug: ${tab.slug}
niche: ${tab.niche}
portfolio: ${tab.portfolio || ""}
created: ${tab.created || todayISO()}
updated: ${tab.updated || todayISO()}
---

### TARGET NICHE: ${tab.niche}

- **Active Tracking Channels:** ${active}
- **Direct Competitors:**
${compLines(tab.directCompetitors)}
- **Rising Competitors:**
${compLines(tab.risingCompetitors)}
- **Ingested Vision Registry:** ${registryLine}

#### Content Performance Engine

${table}
`;
}

export function tabPath(slug) {
  return path.join(TABS_DIR, `${slug}.md`);
}

export function listTabs() {
  ensureDir();
  return fs
    .readdirSync(TABS_DIR)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .map((f) => {
      const slug = f.replace(/\.md$/, "");
      return parseTab(fs.readFileSync(path.join(TABS_DIR, f), "utf8"), slug);
    })
    .sort((a, b) => a.niche.localeCompare(b.niche));
}

export function loadTab(slug) {
  const p = tabPath(slug);
  if (!fs.existsSync(p)) return null;
  return parseTab(fs.readFileSync(p, "utf8"), slug);
}

export function saveTab(tab) {
  ensureDir();
  tab.updated = todayISO();
  fs.writeFileSync(tabPath(tab.slug), serializeTab(tab));
  return tab;
}

export function renameNiche(slug, niche) {
  const tab = loadTab(slug);
  if (!tab) throw new Error(`no tab "${slug}"`);
  const next = String(niche || "").trim();
  if (!next) throw new Error("niche name is required");
  tab.niche = next;
  saveTab(tab);
  return tab;
}

export function createTab({ niche, portfolio = "", activeChannels = [] }) {
  ensureDir();
  const slug = slugify(niche);
  if (!slug) throw new Error("niche is required");
  if (fs.existsSync(tabPath(slug))) throw new Error(`Tab "${slug}" already exists`);
  const tab = {
    slug,
    niche,
    portfolio,
    created: todayISO(),
    updated: todayISO(),
    activeChannels: (Array.isArray(activeChannels) ? activeChannels : String(activeChannels).split(","))
      .map((h) => normalizeHandle(h))
      .filter(Boolean),
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "", channels: 0, videos: 0 },
    videos: [],
  };
  saveTab(tab);
  return tab;
}

// Add one or more of your own channels to a niche's Active Tracking list.
// Idempotent — skips handles already present (case-insensitive). Returns the tab.
export function addChannels(slug, handles) {
  const tab = loadTab(slug);
  if (!tab) throw new Error(`no tab "${slug}"`);
  const seen = new Set(tab.activeChannels.map((h) => h.toLowerCase()));
  const list = Array.isArray(handles) ? handles : String(handles).split(",");
  let added = 0;
  for (const raw of list) {
    const h = normalizeHandle(raw);
    if (h && !seen.has(h.toLowerCase())) {
      tab.activeChannels.push(h);
      seen.add(h.toLowerCase());
      added++;
    }
  }
  if (added) saveTab(tab);
  return { tab, added };
}

// Baseline VPH for a handle, from whichever competitor list it appears in.
export function baselineFor(tab, handle) {
  const h = normalizeHandle(handle);
  const all = [...(tab.directCompetitors || []), ...(tab.risingCompetitors || [])];
  const hit = all.find((c) => c.handle.toLowerCase() === h.toLowerCase());
  return hit?.baselineVph ?? null;
}
