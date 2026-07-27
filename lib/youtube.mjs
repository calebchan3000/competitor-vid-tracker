// YouTube Data API v3 client — the app's automatic enrichment source (replaces
// the NexLev MCP for the hosted path). Resolves channels → avatar/subs/handle,
// pulls recent uploads to match video titles → videoId and compute a baseline
// VPH, all cached in channels.json so repeat channels cost ~0 quota.
//
// Quota notes: search.list = 100 units (expensive), channels.list /
// playlistItems.list / videos.list = 1 unit each. We cache channelIds and cap
// search calls per run (CONFIG.ytSearchBudget) so a big batch can't drain the
// daily 10k quota.

import { CONFIG } from "./config.mjs";
import { getChannel, upsertChannel } from "./channels.mjs";
import { todayISO, normalizeHandle } from "./util.mjs";

const BASE = "https://www.googleapis.com/youtube/v3";

class QuotaError extends Error {}

async function ytGet(endpoint, params) {
  const url = new URL(`${BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", CONFIG.youtubeKey);
  const res = await fetch(url);
  if (res.status === 403) throw new QuotaError(`YouTube 403 (quota/key): ${(await res.text()).slice(0, 200)}`);
  if (!res.ok) throw new Error(`YouTube ${endpoint} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const bestThumb = (thumbnails) =>
  thumbnails?.high?.url || thumbnails?.medium?.url || thumbnails?.default?.url || null;

function norm(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 70);
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

// median VPH over uploads aged 1–21 days (kept for reference display)
function baselineFromUploads(uploads, now = new Date()) {
  const vphs = [];
  for (const u of uploads) {
    if (u.isShort) continue;
    const ageDays = (now.getTime() - new Date(u.publishedAt).getTime()) / 86400000;
    if (!Number.isFinite(u.views) || ageDays < 1 || ageDays > 21) continue;
    vphs.push(u.views / (ageDays * 24));
  }
  return median(vphs);
}

// Typical (median) total views of the channel's *matured* recent uploads (aged
// 2–30 days — old enough to have accumulated, recent enough to reflect the
// channel now). This is the outlier denominator: it's age-robust because it
// compares total views, not the age-sensitive views-per-hour.
function baselineViewsFromUploads(uploads, now = new Date()) {
  const inWindow = [];
  const all = [];
  for (const u of uploads) {
    if (u.isShort) continue;
    if (!Number.isFinite(u.views)) continue;
    all.push(u.views);
    const ageDays = (now.getTime() - new Date(u.publishedAt).getTime()) / 86400000;
    if (ageDays >= 2 && ageDays <= 30) inWindow.push(u.views);
  }
  return median(inWindow.length >= 3 ? inWindow : all);
}

async function resolveByHandle(handle) {
  const data = await ytGet("channels", { part: "snippet,statistics,contentDetails", forHandle: handle.startsWith("@") ? handle : `@${handle}` });
  return data.items?.[0]?.id || null;
}

async function resolveChannelId(name, budget) {
  const normalized = normalizeHandle(name);
  if (/^UC[\w-]{20,}$/.test(normalized)) return normalized;
  const channelPath = normalized.match(/^channel\/(UC[\w-]{20,})$/i);
  if (channelPath) return channelPath[1];
  if (/^@[\w.-]+$/.test(normalized)) {
    const exact = await resolveByHandle(normalized);
    if (exact) return exact;
  }
  if (budget.searches <= 0) return null;
  budget.searches--;
  const data = await ytGet("search", { part: "snippet", type: "channel", q: normalized || name, maxResults: "1" });
  return data.items?.[0]?.snippet?.channelId || data.items?.[0]?.id?.channelId || null;
}

async function channelDetails(channelId) {
  const data = await ytGet("channels", { part: "snippet,statistics,contentDetails", id: channelId });
  const c = data.items?.[0];
  if (!c) return null;
  const handle = c.snippet?.customUrl ? "@" + c.snippet.customUrl.replace(/^@/, "") : null;
  const subs = c.statistics?.subscriberCount ? Number(c.statistics.subscriberCount) : null;
  return {
    channelId,
    avatar: bestThumb(c.snippet?.thumbnails),
    subs,
    subsText: subs != null ? compactCount(subs) + " subscribers" : "",
    handle,
    url: handle ? `https://www.youtube.com/${handle}` : `https://www.youtube.com/channel/${channelId}`,
    uploadsPlaylist: c.contentDetails?.relatedPlaylists?.uploads || null,
  };
}

function compactCount(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + "K";
  return String(n);
}

export function parseIsoDurationSeconds(duration) {
  const m = String(duration || "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

async function isShortsEligible(videoId) {
  if (!videoId) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    // YouTube redirects /shorts/<id> to /watch?v=<id> for normal videos, but
    // leaves real Shorts on /shorts/<id>. The initial HTML also contains an
    // explicit isShortsEligible flag, so check both. The Data API does not expose
    // the vertical/Shorts surface directly.
    const res = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0" },
    });
    const finalUrl = new URL(res.url);
    if (finalUrl.pathname.startsWith("/shorts/")) return true;
    const text = await res.text();
    return /"isShortsEligible"\s*:\s*true/.test(text);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function titleSaysShort(title) {
  return /(^|[\s#])shorts?\b/i.test(title || "");
}

export async function classifyShorts(upload) {
  const durationSeconds = parseIsoDurationSeconds(upload.duration);
  // Shorts are short-form/vertical and can now run up to 3 minutes. Use title
  // hashtags as an instant signal, then confirm <=3 minute candidates by probing
  // YouTube's Shorts URL because the Data API does not expose orientation.
  const isShort = titleSaysShort(upload.title)
    || (durationSeconds != null && durationSeconds <= 180 && await isShortsEligible(upload.videoId));
  return { ...upload, durationSeconds, isShort };
}

async function recentUploads(uploadsPlaylist) {
  const pl = await ytGet("playlistItems", { part: "contentDetails", playlistId: uploadsPlaylist, maxResults: "30" });
  const ids = (pl.items || []).map((i) => i.contentDetails?.videoId).filter(Boolean);
  if (!ids.length) return [];
  const vids = await ytGet("videos", { part: "snippet,statistics,contentDetails", id: ids.join(",") });
  const uploads = (vids.items || []).map((v) => ({
    videoId: v.id,
    title: v.snippet?.title || "",
    publishedAt: v.snippet?.publishedAt || "",
    publishDate: (v.snippet?.publishedAt || "").slice(0, 10),
    views: v.statistics?.viewCount ? Number(v.statistics.viewCount) : null,
    duration: v.contentDetails?.duration || "",
  }));
  return Promise.all(uploads.map(classifyShorts));
}

// Find the videoId for an OCR'd title within a channel's recent uploads.
export function matchUpload(uploads, title, expectedViews) {
  const t = norm(title);
  if (!t) return null;
  // Collect candidates by common-prefix length (screenshot titles are often
  // truncated, and a channel can have several similarly-opening titles).
  const cands = [];
  for (const u of uploads) {
    const un = norm(u.title);
    if (!un) continue;
    let i = 0;
    while (i < t.length && i < un.length && t[i] === un[i]) i++;
    const threshold = Math.min(14, Math.min(t.length, un.length));
    if (i >= threshold) cands.push({ u, prefix: i });
  }
  if (!cands.length) return null;
  // Keep the near-longest-prefix candidates, then, when the caller knows roughly
  // how many views the screenshot showed, break ties by closest view count — this
  // disambiguates same-channel look-alikes (e.g. two "U.S. Military…" videos).
  const maxPrefix = Math.max(...cands.map((c) => c.prefix));
  const top = cands.filter((c) => c.prefix >= maxPrefix - 3);
  if (Number.isFinite(expectedViews) && top.length > 1) {
    top.sort((a, b) => Math.abs((a.u.views || 0) - expectedViews) - Math.abs((b.u.views || 0) - expectedViews));
  } else {
    top.sort((a, b) => b.prefix - a.prefix);
  }
  return top[0].u;
}

function isFresh(iso) {
  if (!iso) return false;
  const days = (Date.now() - new Date(iso + "T00:00:00").getTime()) / 86400000;
  return days < 7;
}

/**
 * Enrich one channel by display name. Returns
 * { handle, channelId, avatar, url, subsText, baselineVph, uploads } — fields may
 * be null if resolution failed. Caches everything in channels.json so the next
 * batch is nearly free. `budget` caps search calls across the whole run.
 */
export async function enrichChannel(name, budget) {
  const cached = getChannel(name);
  let channelId = cached?.channelId || null;
  if (!channelId) channelId = await resolveChannelId(name, budget);
  if (!channelId) return { handle: name, uploads: [] };

  let details = null;
  if (!cached?.avatar || !cached?.uploadsPlaylist || !isFresh(cached?.ytUpdated)) {
    details = await channelDetails(channelId);
  }
  const uploadsPlaylist = details?.uploadsPlaylist || cached?.uploadsPlaylist || null;
  let uploads = [];
  let baselineVph = cached?.baselineVph ?? null;
  let baselineViews = cached?.baselineViews ?? null;
  if (uploadsPlaylist) {
    try {
      uploads = await recentUploads(uploadsPlaylist);
      const b = baselineFromUploads(uploads);
      if (b) baselineVph = b;
      const bv = baselineViewsFromUploads(uploads);
      if (bv) baselineViews = bv;
    } catch (e) {
      if (e instanceof QuotaError) throw e;
    }
  }

  const handle = details?.handle || cached?.handle || name;
  const meta = {
    channelId,
    avatar: details?.avatar || cached?.avatar || null,
    url: details?.url || cached?.url || null,
    subs: details?.subsText || cached?.subs || "",
    handle,
    baselineVph,
    baselineViews,
    uploadsPlaylist,
    ytUpdated: todayISO(),
  };
  // cache under both the real handle and the OCR name so future lookups hit
  upsertChannel(handle, meta);
  if (normalizeHandle(name).toLowerCase() !== normalizeHandle(handle).toLowerCase()) upsertChannel(name, meta);

  return { ...meta, uploads };
}

// Best-effort videoId for a video not found in the channel's uploads (e.g. a
// livestream). Costs one search; skipped when the budget is exhausted.
export async function searchVideoId(title, channelName, budget) {
  if (budget.searches <= 0) return null;
  budget.searches--;
  try {
    const data = await ytGet("search", { part: "snippet", type: "video", q: `${title} ${channelName}`, maxResults: "1" });
    return data.items?.[0]?.id?.videoId || null;
  } catch {
    return null;
  }
}

export { QuotaError };
