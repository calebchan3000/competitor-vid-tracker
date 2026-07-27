#!/usr/bin/env node
// tracker CLI — used by Claude Code (and you) to write enrichment results into
// the markdown file-DB deterministically.
//
//   node scripts/tracker.mjs create-tab --niche "Automotive Macro" --portfolio "Casgains Enterprises" --active "@casgains,@virelox"
//   node scripts/tracker.mjs add-competitor <slug> --kind direct --handle @cnbc --size 3.2M --baseline 1500
//   node scripts/tracker.mjs add-video <slug> --title "..." --handle @cnbc --publish 2026-07-10 --views 82000 --age "5 days ago"
//   node scripts/tracker.mjs ingest <slug> path/to/batch.json      # bulk: competitors + videos in one shot
//   node scripts/tracker.mjs finish-batch <batchId>                # move a pending upload batch to processed/
//   node scripts/tracker.mjs list

import fs from "node:fs";
import path from "node:path";
import { loadTab, saveTab, createTab, listTabs, addChannels } from "../lib/tabs.mjs";
import { appendObservations } from "../lib/history.mjs";
import { upsertChannel } from "../lib/channels.mjs";
import { upsertCompetitor, upsertVideo, recomputeRegistry, ingestBatch } from "../lib/ingest.mjs";
import { todayISO, slugify } from "../lib/util.mjs";
import { UPLOADS_PENDING, UPLOADS_PROCESSED } from "../lib/paths.mjs";

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else { flags[key] = next; i++; }
    } else positional.push(argv[i]);
  }
  return { positional, flags };
}

// ---- commands -------------------------------------------------------------

const cmds = {
  "create-tab"(_, flags) {
    const tab = createTab({
      niche: flags.niche,
      portfolio: flags.portfolio || "",
      activeChannels: flags.active ? String(flags.active).split(",") : [],
    });
    console.log(`✓ created tab "${tab.slug}"`);
  },

  "add-channel"([slug], flags) {
    const handles = flags.handle || flags.channels || "";
    const { added, tab } = addChannels(slug, handles);
    console.log(`✓ added ${added} channel(s) → ${slug} · active: ${tab.activeChannels.join(", ") || "—"}`);
  },

  "channel-meta"([handle], flags) {
    const rec = upsertChannel(handle, {
      avatar: flags.avatar, url: flags.url, channelId: flags.channelId, subs: flags.subs,
    });
    console.log(`✓ channel-meta ${rec.handle} · avatar=${rec.avatar ? "yes" : "no"} · url=${rec.url || "—"}`);
  },

  "add-competitor"([slug], flags) {
    const tab = loadTab(slug) || fail(`no tab "${slug}"`);
    upsertCompetitor(tab, flags.kind === "rising" ? "rising" : "direct", {
      handle: flags.handle, size: flags.size, baseline: flags.baseline,
    });
    recomputeRegistry(tab, todayISO());
    saveTab(tab);
    console.log(`✓ ${flags.kind || "direct"} competitor ${normalizeHandle(flags.handle)} → ${slug}`);
  },

  "add-video"([slug], flags) {
    const tab = loadTab(slug) || fail(`no tab "${slug}"`);
    const row = upsertVideo(tab, {
      title: flags.title, handle: flags.handle, publishDate: flags.publish,
      views: flags.views, vph: flags.vph, outlier: flags.outlier,
      age: flags.age, ageHours: flags.ageHours, source: flags.source,
    });
    appendObservations(slug, [{ at: new Date().toISOString(), handle: row.handle, title: row.title, views: row.views, vph: row.vph, outlier: row.outlier }]);
    recomputeRegistry(tab, todayISO());
    saveTab(tab);
    console.log(`✓ video "${row.title}" ${row.outlier ?? "—"}× (${row.tier}) → ${slug}`);
  },

  ingest([slug, file], flags) {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (flags.date) data.date = flags.date;
    const s = ingestBatch(slug, data);
    console.log(`✓ ingested ${s.videos} videos into "${slug}" · ${s.hot} outlier(s) >3× · registry ${s.channels} ch / ${s.total} vids`);
  },

  "finish-batch"([batchId]) {
    const src = path.join(UPLOADS_PENDING, batchId);
    if (!fs.existsSync(src)) fail(`no pending batch "${batchId}"`);
    fs.mkdirSync(UPLOADS_PROCESSED, { recursive: true });
    const dest = path.join(UPLOADS_PROCESSED, batchId);
    fs.renameSync(src, dest);
    console.log(`✓ moved batch ${batchId} → processed/`);
  },

  list() {
    const tabs = listTabs();
    if (!tabs.length) return console.log("(no tabs yet)");
    for (const t of tabs) {
      const hot = t.videos.filter((v) => (v.outlier ?? 0) >= 3).length;
      console.log(`${t.slug.padEnd(24)} ${String(t.videos.length).padStart(3)} vids  ${hot} hot  [${t.portfolio || "—"}]`);
    }
  },
};

function fail(msg) {
  console.error("✕ " + msg);
  process.exit(1);
}

const [, , cmd, ...rest] = process.argv;
const { positional, flags } = parseArgs(rest);
if (!cmd || !cmds[cmd]) {
  console.log("commands: create-tab · add-channel · channel-meta · add-competitor · add-video · ingest · finish-batch · list");
  process.exit(cmd ? 1 : 0);
}
cmds[cmd](positional, flags);
