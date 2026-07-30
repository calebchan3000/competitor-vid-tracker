// Shared ingest core — turns a {competitors, videos} batch into writes against a
// tab's markdown DB + history + channel registry. Used by BOTH the tracker CLI
// (manual, Claude-driven) and the auto-processor (Claude API + YouTube API), so
// there is exactly one code path that computes tiers / registry / history.

import { loadTab, saveTab, baselineFor } from "./tabs.mjs";
import { enrichVideo } from "./outlier.mjs";
import { appendObservations } from "./history.mjs";
import { upsertChannel } from "./channels.mjs";
import { normalizeHandle, todayISO } from "./util.mjs";
import { labelsIncludeAntiMaga, splitLabels } from "./video_labels.mjs";

export function upsertCompetitor(tab, kind, comp) {
  const list = kind === "rising" ? tab.risingCompetitors : tab.directCompetitors;
  const handle = normalizeHandle(comp.handle);
  // If this channel was previously listed under a display-name alias (e.g.
  // "@George A.A." now resolves to "@realgeorgea"), drop the stale alias line
  // from both lists so the real handle doesn't duplicate it.
  if (comp.replaces) {
    const alias = normalizeHandle(comp.replaces).toLowerCase();
    if (alias && alias !== handle.toLowerCase()) {
      for (const l of [tab.directCompetitors, tab.risingCompetitors]) {
        const i = l.findIndex((c) => c.handle.toLowerCase() === alias);
        if (i !== -1) l.splice(i, 1);
      }
    }
  }
  const existing = list.find((c) => c.handle.toLowerCase() === handle.toLowerCase());
  const record = {
    handle,
    size: comp.size ?? existing?.size ?? "",
    baselineVph: comp.baselineVph ?? comp.baseline ?? existing?.baselineVph ?? null,
  };
  if (record.baselineVph != null) record.baselineVph = Number(record.baselineVph) || record.baselineVph;
  if (existing) Object.assign(existing, record);
  else list.push(record);
  if (comp.avatar || comp.url || comp.channelId) {
    upsertChannel(handle, { avatar: comp.avatar, url: comp.url, channelId: comp.channelId, subs: comp.size });
  }
}

export function upsertVideo(tab, v) {
  const handle = normalizeHandle(v.handle);
  const title = (v.title || "").trim();
  const baseline = v.baselineVph ?? baselineFor(tab, handle);
  const enriched = enrichVideo(
    { viewCount: Number(v.views), ageText: v.age ?? v.ageText, ageHours: v.ageHours, baselineVph: baseline },
    { vph: v.vph != null ? Number(v.vph) : undefined, outlier: v.outlier != null ? Number(v.outlier) : undefined, source: v.source }
  );
  const key = (h, t) => `${h.toLowerCase()}::${t.toLowerCase()}`;
  const existing = tab.videos.find((x) => key(x.handle, x.title) === key(handle, title));
  const row = {
    title,
    handle,
    videoId: v.videoId || existing?.videoId || "",
    publishDate: v.publishDate || existing?.publishDate || "",
    views: Number(v.views) || existing?.views || null,
    vph: enriched.vph,
    outlier: enriched.outlier,
    tier: enriched.tier,
    labels: splitLabels(v.labels).length ? splitLabels(v.labels) : (existing?.labels || []),
    source: enriched.source,
    firstSeen: existing?.firstSeen || todayISO(),
  };
  if (existing) Object.assign(existing, row);
  else tab.videos.push(row);
  return row;
}

export function recomputeRegistry(tab, date) {
  const handles = new Set([
    ...tab.videos.map((v) => v.handle.toLowerCase()),
    ...tab.directCompetitors.map((c) => c.handle.toLowerCase()),
    ...tab.risingCompetitors.map((c) => c.handle.toLowerCase()),
  ]);
  tab.registry = { lastDate: date || todayISO(), channels: handles.size, videos: tab.videos.length };
}

function shouldAutoRouteToAntiMaga(slug, video) {
  return slug !== "anti-maga" && labelsIncludeAntiMaga(video.labels);
}

/**
 * Ingest one enriched batch into a tab. `data` = { competitors:{direct,rising},
 * videos:[...], date }. Returns a summary. Throws if the tab doesn't exist.
 */
export function ingestBatch(slug, data) {
  const tab = loadTab(slug);
  if (!tab) throw new Error(`no tab "${slug}"`);
  const date = data.date || todayISO();
  for (const c of data.competitors?.direct || []) upsertCompetitor(tab, "direct", c);
  for (const c of data.competitors?.rising || []) upsertCompetitor(tab, "rising", c);
  const needsAntiMaga = (data.videos || []).some((v) => shouldAutoRouteToAntiMaga(slug, v));
  const antiMagaTab = needsAntiMaga ? loadTab("anti-maga") : null;
  const obs = [];
  const antiMagaObs = [];
  let routedToAntiMaga = 0;
  for (const v of data.videos || []) {
    if (shouldAutoRouteToAntiMaga(slug, v) && antiMagaTab) {
      const row = upsertVideo(antiMagaTab, {
        ...v,
        labels: [...splitLabels(v.labels), `moved-from-${slug}`],
      });
      upsertCompetitor(antiMagaTab, "rising", { handle: row.handle, size: v.size || "?", baselineVph: v.baselineVph ?? v.baseline ?? null });
      antiMagaObs.push({ at: new Date().toISOString(), handle: row.handle, title: row.title, views: row.views, vph: row.vph, outlier: row.outlier });
      routedToAntiMaga++;
      continue;
    }
    const row = upsertVideo(tab, v);
    obs.push({ at: new Date().toISOString(), handle: row.handle, title: row.title, views: row.views, vph: row.vph, outlier: row.outlier });
  }
  if (obs.length) appendObservations(slug, obs);
  if (antiMagaObs.length) appendObservations("anti-maga", antiMagaObs);
  recomputeRegistry(tab, date);
  saveTab(tab);
  if (antiMagaTab && routedToAntiMaga) {
    recomputeRegistry(antiMagaTab, date);
    saveTab(antiMagaTab);
  }
  const hot = tab.videos.filter((v) => (v.outlier ?? 0) >= 3).length;
  return { videos: data.videos?.length || 0, hot, channels: tab.registry.channels, total: tab.registry.videos, routedToAntiMaga };
}
