// Append-only observation log per tab, for data maturation across the 7/14/30-day
// horizons (SYSTEM PROTOCOL §3, STEP 4). Kept as a JSONL sidecar so the .md files
// stay clean and human-readable. Each line is one video observation at one ingest.

import fs from "node:fs";
import path from "node:path";
import { HISTORY_DIR } from "./paths.mjs";

function filePath(slug) {
  return path.join(HISTORY_DIR, `${slug}.jsonl`);
}

export function appendObservations(slug, observations) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  const lines = observations.map((o) => JSON.stringify(o)).join("\n");
  fs.appendFileSync(filePath(slug), lines + "\n");
}

export function readHistory(slug) {
  const p = filePath(slug);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// View growth for a single video, computed from logged snapshots. Compares the
// latest observation to the newest snapshot that is at least 7 / 30 days old, so
// the columns fill in as the niche is re-ingested over time. Returns null deltas
// until a second snapshot exists (shown as "new" in the UI).
export function growth(slug, handle, title, now = new Date()) {
  const obs = readHistory(slug)
    .filter((o) => o.handle === handle && o.title === title && Number.isFinite(o.views))
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  if (!obs.length) return null;
  const latest = obs[obs.length - 1];

  const snapshotAtLeast = (days) => {
    const cutoff = now.getTime() - days * 86400000;
    let chosen = null;
    for (const o of obs) {
      if (new Date(o.at).getTime() <= cutoff) chosen = o; // newest that's old enough
    }
    return chosen;
  };
  const delta = (past) => (past ? latest.views - past.views : null);
  const pct = (past) => (past && past.views > 0 ? ((latest.views - past.views) / past.views) * 100 : null);

  const p7 = snapshotAtLeast(7);
  const p30 = snapshotAtLeast(30);
  return {
    current: latest.views,
    d7: delta(p7),
    d30: delta(p30),
    pct7: pct(p7),
    pct30: pct(p30),
    samples: obs.length,
    firstAt: obs[0].at,
  };
}

// 7-day velocity: change in VPH for a video between its earliest observation in
// the window and its latest. Used to flag "Rising" behaviour.
export function velocity(slug, handle, title, windowDays = 7, now = new Date()) {
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const obs = readHistory(slug)
    .filter((o) => o.handle === handle && o.title === title)
    .filter((o) => new Date(o.at).getTime() >= cutoff)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  if (obs.length < 2) return null;
  const first = obs[0];
  const last = obs[obs.length - 1];
  if (!Number.isFinite(first.vph) || !Number.isFinite(last.vph)) return null;
  return { deltaVph: last.vph - first.vph, from: first.vph, to: last.vph, samples: obs.length };
}
