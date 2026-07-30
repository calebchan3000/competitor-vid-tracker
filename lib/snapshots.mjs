// Audience-snapshot archive. Every uploaded batch of Studio screenshots is kept
// (never deleted) and shown in the dashboard as a dated snapshot, so you can eyeball
// the competitors / audience / demographics and track how they change over time.
//
// Images live under data/uploads/{pending,processed}/<batchId>/. We read both so
// old batches (pre-archive) still appear.

import fs from "node:fs";
import path from "node:path";
import { UPLOADS_PENDING, UPLOADS_PROCESSED } from "./paths.mjs";

function readBatchesIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((d) => !d.startsWith("."))
    .map((id) => {
      const bdir = path.join(dir, id);
      if (!fs.statSync(bdir).isDirectory()) return null;
      let manifest = {};
      try {
        manifest = JSON.parse(fs.readFileSync(path.join(bdir, "manifest.json"), "utf8"));
      } catch {}
      // structured, clickable audience data (videos/channels), if this snapshot
      // has been read into links (audience.json alongside the images).
      let audience = null;
      try {
        audience = JSON.parse(fs.readFileSync(path.join(bdir, "audience.json"), "utf8"));
      } catch {}
      const files = fs.readdirSync(bdir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
      if (!files.length) return null;
      return {
        batchId: id,
        slug: manifest.slug || "",
        sourceChannel: manifest.sourceChannel || "",
        sourceChannelCanonical: manifest.sourceChannelCanonical || manifest.sheetCrossCheck?.canonicalChannel || "",
        actualNiche: manifest.actualNiche || manifest.sheetCrossCheck?.actualNiche || "",
        sheetMatchConfidence: manifest.sheetCrossCheck?.matchConfidence || "",
        created: manifest.created || "",
        files,
        audience,
      };
    })
    .filter(Boolean);
}

function allBatches() {
  return [...readBatchesIn(UPLOADS_PENDING), ...readBatchesIn(UPLOADS_PROCESSED)];
}

// Locate an image file for serving, in either pending or processed.
export function snapshotImagePath(batchId, file) {
  const safe = path.basename(file);
  for (const base of [UPLOADS_PENDING, UPLOADS_PROCESSED]) {
    const p = path.join(base, batchId, safe);
    if (p.startsWith(path.join(base, batchId)) && fs.existsSync(p)) return p;
  }
  return null;
}

// All snapshots, newest first. Used for cross-niche overlap integration without
// moving the original archive batch.
export function listAllSnapshots() {
  return allBatches().sort((a, b) => (a.created < b.created ? 1 : -1));
}

// Snapshots for one niche, newest first.
export function listSnapshots(slug) {
  return listAllSnapshots()
    .filter((b) => b.slug === slug);
}

// Count of snapshots + images per niche (for the home cards).
export function snapshotCount(slug) {
  const snaps = listSnapshots(slug);
  return { snapshots: snaps.length, images: snaps.reduce((n, s) => n + s.files.length, 0) };
}
