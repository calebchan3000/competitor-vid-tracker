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
    const dismissed = Array.isArray(parsed.dismissed) ? parsed.dismissed.map(normalizeItem).filter((item) => item.videoId || item.url) : [];
    const instructions = Array.isArray(parsed.instructions) ? parsed.instructions.map((item) => ({ ...normalizeItem(item), note: String(item.note || "").trim(), notedAt: item.notedAt || item.checkedAt || new Date().toISOString() })).filter((item) => (item.videoId || item.url) && item.note) : [];
    return { slug: slugify(slug), updated: parsed.updated || null, items, dismissed, instructions };
  } catch (err) {
    if (err.code === "ENOENT") return { slug: slugify(slug), updated: null, items: [], dismissed: [] };
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
  const payload = { slug: slugify(slug), updated: new Date().toISOString(), items: next, dismissed: current.dismissed || [], instructions: current.instructions || [] };
  fs.writeFileSync(fileFor(slug), `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

export function setDismissed(slug, item, dismissed = true) {
  fs.mkdirSync(INSPIRATION_DIR, { recursive: true });
  const current = listInspiration(slug);
  const normalized = normalizeItem(item);
  if (!normalized.videoId && !normalized.url) throw new Error("videoId or url required");
  const key = normalized.videoId || normalized.url;
  const kept = current.dismissed.filter((existing) => (existing.videoId || existing.url) !== key);
  const nextDismissed = dismissed ? [...kept, { ...normalized, dismissedAt: new Date().toISOString() }] : kept;
  const nextItems = current.items.filter((existing) => (existing.videoId || existing.url) !== key);
  const payload = { slug: slugify(slug), updated: new Date().toISOString(), items: nextItems, dismissed: nextDismissed, instructions: current.instructions || [] };
  fs.writeFileSync(fileFor(slug), `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

export function setInstructionNote(slug, item, note) {
  fs.mkdirSync(INSPIRATION_DIR, { recursive: true });
  const current = listInspiration(slug);
  const normalized = normalizeItem(item);
  if (!normalized.videoId && !normalized.url) throw new Error("videoId or url required");
  const cleanNote = String(note || "").trim();
  if (!cleanNote) throw new Error("note required");
  const key = normalized.videoId || normalized.url;
  const kept = (current.instructions || []).filter((existing) => (existing.videoId || existing.url) !== key);
  const instructions = [...kept, { ...normalized, note: cleanNote, notedAt: new Date().toISOString() }];
  const payload = { slug: slugify(slug), updated: new Date().toISOString(), items: current.items || [], dismissed: current.dismissed || [], instructions };
  fs.writeFileSync(fileFor(slug), `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}
