import fs from "node:fs";
import path from "node:path";

import { INSPIRATION_DIR } from "./paths.mjs";
import { slugify, videoUrl } from "./util.mjs";

function fileFor(slug) {
  const safe = slugify(slug || "");
  if (!safe) throw new Error("slug required");
  return path.join(INSPIRATION_DIR, `${safe}.json`);
}

function normalizeItem(item = {}) {
  const videoId = String(item.videoId || "").trim();
  const url = String(item.url || (videoId ? videoUrl(videoId) : "")).trim();
  const title = String(item.title || "").trim();
  return {
    videoId,
    title,
    url,
    handle: String(item.handle || "").trim(),
    source: String(item.source || "").trim(),
    section: String(item.section || "").trim(),
    checkedAt: item.checkedAt || new Date().toISOString(),
  };
}

export function listInspiration(slug) {
  try {
    const parsed = JSON.parse(fs.readFileSync(fileFor(slug), "utf8"));
    const items = Array.isArray(parsed.items) ? parsed.items.map(normalizeItem).filter((item) => item.videoId || item.url) : [];
    return { slug: slugify(slug), updated: parsed.updated || null, items };
  } catch (err) {
    if (err.code === "ENOENT") return { slug: slugify(slug), updated: null, items: [] };
    throw err;
  }
}

export function setInspiration(slug, item, selected = true) {
  fs.mkdirSync(INSPIRATION_DIR, { recursive: true });
  const current = listInspiration(slug);
  const normalized = normalizeItem(item);
  if (!normalized.videoId && !normalized.url) throw new Error("videoId or url required");
  const key = normalized.videoId || normalized.url;
  const kept = current.items.filter((existing) => (existing.videoId || existing.url) !== key);
  const next = selected ? [...kept, normalized] : kept;
  const payload = { slug: slugify(slug), updated: new Date().toISOString(), items: next };
  fs.writeFileSync(fileFor(slug), `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}
