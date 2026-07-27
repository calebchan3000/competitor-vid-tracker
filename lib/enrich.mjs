// Track a competitor via the YouTube Data API — no OCR, no LLM. Given a handle
// (or URL), resolve the channel, pull its avatar / subs / baseline VPH and its
// recent uploads (real videoIds, thumbnails, exact views, publish dates), and
// write them into the niche's engine. This is how the Content Performance Engine
// gets populated now that we don't OCR screenshots.

import { enrichChannel, QuotaError } from "./youtube.mjs";
import { ingestBatch } from "./ingest.mjs";
import { hasYouTube, CONFIG } from "./config.mjs";
import { loadTab } from "./tabs.mjs";
import { normalizeHandle, parseCount, todayISO } from "./util.mjs";

const RISING_SUB_CEILING = 100_000; // smaller channels land in "Rising"

function hoursSince(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 3_600_000;
}

/**
 * Add/refresh a competitor in a niche and pull its recent videos into the engine.
 * `nameOrUrl` may be an @handle, a channel URL, or a display name.
 * `budget` (optional) lets a caller share one search-quota budget across many
 * channels — pass the same object to `trackAllCompetitors`' per-channel calls so
 * one bulk run can't blow the daily quota. Omit it and each call gets its own.
 */
export async function trackCompetitor(slug, nameOrUrl, { videos: maxVideos = 12, budget } = {}) {
  const tab = loadTab(slug);
  if (!tab) throw new Error(`no niche "${slug}"`);

  const originalHandle = normalizeHandle(nameOrUrl);

  if (!hasYouTube()) {
    // no key: record the handle so it shows in the competitor list, unenriched
    ingestBatch(slug, { competitors: { direct: [{ handle: originalHandle }] }, videos: [] });
    return { handle: originalHandle, enriched: false, added: 0, reason: "no YOUTUBE_API_KEY" };
  }

  const runBudget = budget || { searches: CONFIG.ytSearchBudget };
  const m = await enrichChannel(nameOrUrl, runBudget);
  const handle = m.handle || originalHandle;
  if (!m.channelId) {
    ingestBatch(slug, { competitors: { direct: [{ handle }] }, videos: [] });
    return { handle, enriched: false, added: 0, reason: "could not resolve channel" };
  }

  // If the channel was listed under a display-name alias (e.g. "@George A.A.")
  // but YouTube resolves it to a real handle (e.g. "@realgeorgea"), tell ingest
  // to replace the stale alias line instead of adding a duplicate competitor.
  const replaces = originalHandle && originalHandle.toLowerCase() !== handle.toLowerCase() ? originalHandle : undefined;

  const subsNum = parseCount(m.subs);
  const kind = subsNum != null && subsNum < RISING_SUB_CEILING ? "rising" : "direct";
  const competitor = {
    handle, size: m.subs || "", baselineVph: m.baselineVph ?? null,
    avatar: m.avatar, url: m.url, channelId: m.channelId, replaces,
  };

  // Outlier = video views ÷ the channel's typical (median) recent views. Age-robust:
  // a fresh video with few views won't false-flag, and a genuine breakout stands out.
  const bViews = m.baselineViews || null;
  const longFormUploads = (m.uploads || []).filter((u) => !u.isShort);
  const videos = longFormUploads.slice(0, maxVideos).map((u) => ({
    title: u.title,
    handle,
    videoId: u.videoId,
    publishDate: u.publishDate,
    views: u.views,
    ageHours: hoursSince(u.publishedAt),
    outlier: bViews && Number.isFinite(u.views) ? Math.round((u.views / bViews) * 100) / 100 : undefined,
    source: "youtube",
  }));

  const summary = ingestBatch(slug, {
    date: todayISO(),
    competitors: { [kind]: [competitor] },
    videos,
  });
  const shortsSkipped = (m.uploads || []).length - longFormUploads.length;
  return { handle, enriched: true, avatar: Boolean(m.avatar), baselineViews: bViews, added: videos.length, shortsSkipped, kind, summary };
}

/**
 * Track every competitor already listed in a niche (both Direct and Rising) in
 * one pass, pulling each channel's recent videos into the engine. This is what
 * the "Track all competitors" button calls, so the user doesn't add them one at
 * a time. Channels are de-duplicated by handle, a single search-quota budget is
 * shared across the whole run, and a per-channel failure never aborts the rest.
 * Returns an aggregate summary plus a per-channel result list.
 */
export async function trackAllCompetitors(slug, { videos = 12 } = {}) {
  const tab = loadTab(slug);
  if (!tab) throw new Error(`no niche "${slug}"`);

  // De-dupe by handle (case-insensitive) so a channel listed in both lists, or
  // twice, is only pulled once.
  const seen = new Set();
  const handles = [];
  for (const c of [...tab.directCompetitors, ...tab.risingCompetitors]) {
    const h = normalizeHandle(c.handle);
    const key = h.toLowerCase();
    if (!h || seen.has(key)) continue;
    seen.add(key);
    handles.push(h);
  }

  if (!handles.length) {
    return { slug, tracked: 0, enriched: 0, added: 0, quotaHit: false, results: [] };
  }

  const budget = { searches: CONFIG.ytSearchBudget };
  const results = [];
  let quotaHit = false;
  for (const handle of handles) {
    try {
      const r = await trackCompetitor(slug, handle, { videos, budget });
      results.push({ handle, ok: true, ...r });
    } catch (err) {
      // Quota exhaustion is terminal — stop hitting the API and report what's
      // left as skipped rather than throwing away the channels we did get.
      if (err instanceof QuotaError) {
        quotaHit = true;
        results.push({ handle, ok: false, enriched: false, added: 0, error: "YouTube quota reached" });
        break;
      }
      results.push({ handle, ok: false, enriched: false, added: 0, error: String(err.message || err) });
    }
  }

  const enriched = results.filter((r) => r.enriched).length;
  const added = results.reduce((n, r) => n + (r.added || 0), 0);
  const shortsSkipped = results.reduce((n, r) => n + (r.shortsSkipped || 0), 0);
  const skipped = handles.length - results.length;
  return { slug, tracked: results.length, total: handles.length, enriched, added, shortsSkipped, skipped, quotaHit, results };
}
