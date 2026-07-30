import { normalizeHandle, slugify, todayISO } from "./util.mjs";

const TARGET_ALIASES = new Map([
  ["anti maga", "anti-maga"],
  ["antimaga", "anti-maga"],
  ["anti-maga", "anti-maga"],
  ["anti trump", "anti-maga"],
  ["antitrump", "anti-maga"],
  ["anti-trump", "anti-maga"],
  ["trump", "anti-maga"],
  ["maga", "anti-maga"],
  ["british", "british-news"],
  ["british news", "british-news"],
  ["british-news", "british-news"],
  ["uk", "british-news"],
  ["canada", "canada"],
  ["canadian", "canada"],
  ["anti dem", "anti-dem"],
  ["anti-dem", "anti-dem"],
  ["antidem", "anti-dem"],
  ["new york", "new-york"],
  ["new-york", "new-york"],
]);

function normalizeTarget(raw) {
  const cleaned = String(raw || "")
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return TARGET_ALIASES.get(cleaned) || slugify(cleaned);
}

export function parseVideoInstruction(text = "") {
  const command = String(text || "").trim();
  if (!command) return { action: "empty" };
  const move = command.match(/\b(?:move|send|put)\s+(?:this\s+|it\s+|title\s+|video\s+)?(?:to|into|in)\s+(.+)$/i)
    || command.match(/^\s*(?:to|into)\s+(.+)$/i);
  if (move) {
    const targetSlug = normalizeTarget(move[1]);
    if (targetSlug) return { action: "move", targetSlug };
  }
  return { action: "note", note: command };
}

export function videoKey(video = {}) {
  const videoId = String(video.videoId || "").trim();
  if (videoId) return `id:${videoId}`;
  return `row:${normalizeHandle(video.handle).toLowerCase()}::${String(video.title || "").trim().toLowerCase()}`;
}

function findVideoIndex(tab, video) {
  const key = videoKey(video);
  return (tab.videos || []).findIndex((candidate) => videoKey(candidate) === key);
}

function upsertTargetVideo(targetTab, video, sourceSlug) {
  const labels = Array.isArray(video.labels) ? [...video.labels] : [];
  const movedLabel = `moved-from-${sourceSlug}`;
  if (!labels.map((x) => String(x).toLowerCase()).includes(movedLabel)) labels.push(movedLabel);
  const moved = { ...video, labels, firstSeen: video.firstSeen || todayISO() };
  const idx = findVideoIndex(targetTab, moved);
  if (idx === -1) targetTab.videos.push(moved);
  else targetTab.videos[idx] = { ...targetTab.videos[idx], ...moved };
  return moved;
}

function ensureCompetitor(targetTab, sourceTab, handle) {
  const normalized = normalizeHandle(handle);
  if (!normalized) return;
  const exists = [...(targetTab.directCompetitors || []), ...(targetTab.risingCompetitors || [])]
    .some((c) => normalizeHandle(c.handle).toLowerCase() === normalized.toLowerCase());
  if (exists) return;
  const sourceComp = [...(sourceTab.directCompetitors || []), ...(sourceTab.risingCompetitors || [])]
    .find((c) => normalizeHandle(c.handle).toLowerCase() === normalized.toLowerCase());
  (targetTab.risingCompetitors ||= []).push(sourceComp ? { ...sourceComp, handle: normalized } : { handle: normalized, size: "?", baselineVph: null });
}

export function recomputeTabRegistry(tab, date = todayISO()) {
  const handles = new Set([
    ...(tab.videos || []).map((v) => normalizeHandle(v.handle).toLowerCase()).filter(Boolean),
    ...(tab.directCompetitors || []).map((c) => normalizeHandle(c.handle).toLowerCase()).filter(Boolean),
    ...(tab.risingCompetitors || []).map((c) => normalizeHandle(c.handle).toLowerCase()).filter(Boolean),
  ]);
  tab.registry = { lastDate: date, channels: handles.size, videos: (tab.videos || []).length };
  return tab.registry;
}

export function applyVideoInstructionToTabs({ sourceTab, targetTab, video, instruction }) {
  const parsed = parseVideoInstruction(instruction);
  if (parsed.action !== "move") return parsed;
  if (!targetTab) throw new Error(`target tab "${parsed.targetSlug}" not found`);
  const idx = findVideoIndex(sourceTab, video);
  if (idx === -1) throw new Error("video not found in source tab");
  const row = sourceTab.videos[idx];
  const moved = upsertTargetVideo(targetTab, row, sourceTab.slug);
  ensureCompetitor(targetTab, sourceTab, row.handle);
  sourceTab.videos.splice(idx, 1);
  recomputeTabRegistry(sourceTab);
  recomputeTabRegistry(targetTab);
  return { action: "move", targetSlug: targetTab.slug, video: moved };
}
