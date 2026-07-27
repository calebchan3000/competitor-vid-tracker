// Channel metadata registry — a single sidecar (data/channels.json) mapping a
// handle to its profile: avatar image, canonical URL, channelId, subscriber
// count. Keeps the tab .md files clean while letting the dashboard show avatars
// and real links. Populated by Claude during enrichment (avatars come from the
// NexLev/YouTube data); the app reads it at render time.

import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths.mjs";
import { normalizeHandle, todayISO } from "./util.mjs";

const FILE = path.join(DATA_DIR, "channels.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

function save(obj) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(obj, null, 2));
}

const keyFor = (handle) => normalizeHandle(handle).toLowerCase();

export function getChannel(handle) {
  if (!handle) return null;
  return load()[keyFor(handle)] || null;
}

export function allChannels() {
  return load();
}

// Merge metadata for a handle. Only defined fields overwrite; empty/undefined
// values never clobber existing data.
export function upsertChannel(handle, data = {}) {
  const all = load();
  const key = keyFor(handle);
  const prev = all[key] || {};
  const next = { ...prev, handle: normalizeHandle(handle) };
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== null && v !== "") next[k] = v;
  }
  next.updated = todayISO();
  all[key] = next;
  save(all);
  return next;
}
