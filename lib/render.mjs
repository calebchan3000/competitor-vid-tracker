// Server-rendered HTML. No framework — just template strings. Styling lives in
// public/styles.css, interactivity in public/app.js.

import { escapeHtml, formatInt, formatNumber, daysAgo, videoUrl, thumbUrl, channelUrl } from "./util.mjs";
import { tierForScore, isHighlighted, HIGHLIGHT_THRESHOLD } from "./outlier.mjs";
import { getChannel } from "./channels.mjs";
import { growth } from "./history.mjs";
import { hasYouTube } from "./config.mjs";
import { snapshotCount } from "./snapshots.mjs";

const HORIZONS = [7, 14, 30, 0]; // 0 = All

// A round channel avatar (falls back to a monogram tile when no image is known).
function avatarImg(handle, size = 22) {
  const meta = getChannel(handle);
  const initials = (handle || "?").replace(/^@/, "").slice(0, 1).toUpperCase();
  if (meta?.avatar) {
    return `<span class="avatar-wrap" data-initial="${escapeHtml(initials)}" data-size="${size}" style="width:${size}px;height:${size}px"><img class="avatar" src="${escapeHtml(meta.avatar)}" width="${size}" height="${size}" alt="" loading="lazy"></span>`;
  }
  return `<span class="avatar avatar--mono" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.5)}px">${escapeHtml(initials)}</span>`;
}

// Avatar + handle, linked to the channel. Used in the engine, competitor lists,
// and the niche header.
function channelCell(handle, { size = 22, extra = "" } = {}) {
  const meta = getChannel(handle);
  const url = channelUrl(handle, meta?.url);
  const inner = `${avatarImg(handle, size)}<span class="chan-name">${escapeHtml(handle)}</span>${extra}`;
  return url
    ? `<a class="chan-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${inner}</a>`
    : `<span class="chan-link">${inner}</span>`;
}

// "▲ +12%" green when rising, "▼ -3%" red when falling, "—" when unknown.
function trendCell(pct) {
  if (pct == null) return `<span class="trend trend--none">—</span>`;
  const rising = pct >= 0;
  const arrow = rising ? "▲" : "▼";
  return `<span class="trend trend--${rising ? "up" : "down"}">${arrow} ${rising ? "+" : ""}${pct.toFixed(0)}%</span>`;
}

function deltaCell(d) {
  if (d == null) return `<span class="muted">new</span>`;
  return `${d >= 0 ? "+" : ""}${formatNumber(d)}`;
}

export function layout(title, body, { active = "" } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/public/styles.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📡</text></svg>">
</head>
<body>
<header class="topbar">
  <a class="brand" href="/">
    <span class="brand-dot"></span>
    <span class="brand-name">COMPETITOR VIDEO TRACKER</span>
    <span class="brand-sub">omni-channel competitive intelligence</span>
  </a>
  <nav class="topnav">
    <a href="/" class="${active === "home" ? "is-active" : ""}">Dashboard</a>
    <a href="/#new-tab">+ New niche</a>
  </nav>
</header>
<main class="wrap">
${body}
</main>
<script src="/public/app.js"></script>
</body>
</html>`;
}

function tierChip(score) {
  const t = tierForScore(score);
  if (score == null) return `<span class="chip chip--unscored">unscored</span>`;
  return `<span class="chip chip--${t.key}">${score.toFixed(2)}× ${t.label}</span>`;
}

function videoRow(v, slug, { showNiche = false } = {}) {
  const age = daysAgo(v.publishDate);
  const hot = isHighlighted(v.outlier);
  const t = tierForScore(v.outlier);
  const g = slug ? growth(slug, v.handle, v.title) : null;
  const vurl = videoUrl(v.videoId);
  const turl = thumbUrl(v.videoId);

  const thumb = turl
    ? `<a href="${escapeHtml(vurl)}" target="_blank" rel="noopener" class="thumb-link"><img class="vthumb" src="${escapeHtml(turl)}" alt="" loading="lazy"></a>`
    : `<span class="vthumb vthumb--empty">▶</span>`;
  const title = vurl
    ? `<a href="${escapeHtml(vurl)}" target="_blank" rel="noopener" class="vtitle-link">${escapeHtml(v.title)}</a>`
    : escapeHtml(v.title);
  const labels = Array.isArray(v.labels) ? v.labels : [];
  const labelDataset = labels.map((label) => String(label).toLowerCase()).join(" ");
  const labelBadges = labels.length
    ? `<div class="video-labels">${labels.map((label) => {
      const key = String(label).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
      return `<span class="video-label video-label--${escapeHtml(key)}">${escapeHtml(label)}</span>`;
    }).join("")}</div>`
    : "";

  return `<tr class="vrow vrow--${t.key} ${hot ? "vrow--hot" : ""}"
      data-handle="${escapeHtml(String(v.handle || "").toLowerCase())}" data-labels="${escapeHtml(labelDataset)}" data-outlier="${v.outlier ?? 0}" data-age="${age ?? 99999}" data-views="${v.views ?? 0}" data-d7="${g?.d7 ?? 0}" data-pct7="${g?.pct7 ?? -999}">
    <td class="c-thumb">${thumb}</td>
    <td class="c-title">${hot ? '<span class="flame">🔥</span> ' : ""}${title}${showNiche && v.niche ? `<span class="muted niche-tag"> · ${escapeHtml(v.niche)}</span>` : ""}${labelBadges}</td>
    <td class="c-chan">${channelCell(v.handle, { size: 22 })}</td>
    <td class="c-num">${age == null ? "—" : age + "d"}</td>
    <td class="c-num c-views">${formatNumber(v.views)}</td>
    <td class="c-num">${deltaCell(g?.d7)}</td>
    <td class="c-num">${deltaCell(g?.d30)}</td>
    <td class="c-num">${trendCell(g?.pct7)}</td>
    <td class="c-outlier">${tierChip(v.outlier)}</td>
    <td class="c-src"><span class="src src--${v.source || "none"}">${escapeHtml(v.source || "—")}</span></td>
  </tr>`;
}

function isOpportunityDiscovery(v) {
  return /youtube-home-style-discovery|niche-discovery|discovery/i.test(v.source || "");
}

const OPPORTUNITY_VIEW_FLOOR = 10000;

function canadaAngleForVideo(v) {
  const labels = Array.isArray(v.labels) ? v.labels.map((label) => String(label).toLowerCase()) : [];
  if (labels.includes("pro-canada") || labels.includes("anti-canada")) return null;
  const title = String(v.title || "").toLowerCase();

  // Pro-Canada = Canada/Carney wins, resists U.S./Trump pressure, pivots trade,
  // gains leverage, or America needs/loses Canadian resources.
  if (/\b(canada|canadian|carney|ford|ottawa)\b.*\b(wins?|victory|outplay|outplayed|refuses?|rejects?|fights? back|slams?|crushes?|destroys?|cuts? off|exit door|pivot|alliance|deal|power move|leverage|dominance|super power|independence|backing down)\b/.test(title) ||
      /\b(america|u\.?s\.?|trump|washington|detroit|maga)\b.*\b(panic|panics|terrified|stunned|freaks? out|needs? canada|nowhere else|speechless|miss(?:ing|es)|can't afford to lose)\b/.test(title)) {
    return "pro-canada";
  }

  // Anti-Canada = Canada/Carney/Liberals as the problem: legal/rights warnings,
  // sanctions, border/security problems, digital ID, corruption, or Canada losing.
  if (/\b(canada|canadian|carney|ford|ottawa|liberals?)\b.*\b(warning|warns?|alarm|orwellian|digital id|sanctions?|lose|losing|can't|get a trade deal|border problem|criminalize|scandal|corruption|crisis|threat|court case|face u\.?s\.? sanctions)\b/.test(title) ||
      /\b(gop|congressman|lawyer|ambassador)\b.*\b(canada|carney|border|digital id|warning|alarm)\b/.test(title)) {
    return "anti-canada";
  }
  return "canada-mixed";
}

function withDerivedLabels(v, tab) {
  const labels = Array.isArray(v.labels) ? [...v.labels] : [];
  if (String(tab?.slug || "").toLowerCase() === "canada") {
    const angle = canadaAngleForVideo({ ...v, labels });
    if (angle && !labels.some((label) => String(label).toLowerCase() === angle)) labels.push(angle);
  }
  return { ...v, labels };
}

function renderLabelFilterPills(videos) {
  const labelDefs = [
    { key: "pro-canada", text: "Pro-Canada" },
    { key: "anti-canada", text: "Anti-Canada" },
    { key: "canada-mixed", text: "Mixed/unclear" },
    { key: "edsel-sheet", text: "Edsel only" },
  ];
  const counts = new Map();
  for (const v of videos) {
    for (const label of Array.isArray(v.labels) ? v.labels : []) {
      const key = String(label).toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const buttons = labelDefs
    .filter((def) => counts.get(def.key))
    .map((def) => `<button type="button" class="channel-filter-pill channel-filter-pill--source channel-filter-pill--${escapeHtml(def.key)}" data-label-filter="${escapeHtml(def.key)}">${escapeHtml(def.text)} <span>${counts.get(def.key)}</span></button>`);
  if (!buttons.length) return "";
  return `<div class="filter-head filter-head--secondary"><span>Segment filters</span><span class="muted">optional</span></div>
    <div class="filter-pills filter-pills--source">
      ${buttons.join("")}
    </div>`;
}

function renderChannelFilter(videos) {
  const channelCounts = [...videos.reduce((m, v) => {
    const handle = v.handle || "—";
    const rec = m.get(handle) || { handle, count: 0, hot: 0, eligibleHot: 0, maxOutlier: 0, eligibleMaxOutlier: 0, topTitle: "", eligibleTopTitle: "", opportunity: 0, eligibleOpportunity: 0, maxOpportunityOutlier: 0, eligibleMaxOpportunityOutlier: 0, topOpportunityTitle: "", eligibleTopOpportunityTitle: "" };
    rec.count += 1;
    const outlier = Number(v.outlier || 0);
    const meetsViewFloor = Number(v.views || 0) >= OPPORTUNITY_VIEW_FLOOR;
    if (isHighlighted(outlier)) {
      rec.hot += 1;
      if (meetsViewFloor) rec.eligibleHot += 1;
    }
    if (isOpportunityDiscovery(v)) {
      rec.opportunity += 1;
      if (outlier > rec.maxOpportunityOutlier) {
        rec.maxOpportunityOutlier = outlier;
        rec.topOpportunityTitle = v.title || "";
      }
      if (meetsViewFloor) {
        rec.eligibleOpportunity += 1;
        if (outlier > rec.eligibleMaxOpportunityOutlier) {
          rec.eligibleMaxOpportunityOutlier = outlier;
          rec.eligibleTopOpportunityTitle = v.title || "";
        }
      }
    }
    if (outlier > rec.maxOutlier) {
      rec.maxOutlier = outlier;
      rec.topTitle = v.title || "";
    }
    if (meetsViewFloor && outlier > rec.eligibleMaxOutlier) {
      rec.eligibleMaxOutlier = outlier;
      rec.eligibleTopTitle = v.title || "";
    }
    m.set(handle, rec);
    return m;
  }, new Map()).values()]
    .map((c) => ({ ...c, worthScore: (c.eligibleOpportunity * 20) + (c.eligibleHot * 10) + Math.min(c.eligibleMaxOpportunityOutlier || c.eligibleMaxOutlier || 0, 10) + Math.min(c.count / 20, 2) }))
    .sort((a, b) => b.count - a.count || b.eligibleHot - a.eligibleHot || a.handle.localeCompare(b.handle));
  const worthChannels = channelCounts
    .filter((c) => c.eligibleOpportunity > 0 || c.eligibleHot > 0 || c.eligibleMaxOutlier >= 2.5)
    .sort((a, b) => b.worthScore - a.worthScore || (b.eligibleMaxOpportunityOutlier || b.eligibleMaxOutlier) - (a.eligibleMaxOpportunityOutlier || a.eligibleMaxOutlier) || a.handle.localeCompare(b.handle))
    .slice(0, 8);
  const worthHandles = new Set(worthChannels.map((c) => c.handle.toLowerCase()));
  const volumeChannels = channelCounts.filter((c) => !worthHandles.has(c.handle.toLowerCase()));
  const filterButton = (c, extraClass = "") => {
    const bestOutlier = extraClass ? (c.eligibleMaxOpportunityOutlier || c.eligibleMaxOutlier || 0) : (c.maxOutlier || 0);
    const bestTitle = extraClass ? (c.eligibleTopOpportunityTitle || c.eligibleTopTitle || c.topTitle || "") : (c.topTitle || "");
    const opportunityCount = extraClass ? c.eligibleOpportunity : c.opportunity;
    const hotCount = extraClass ? c.eligibleHot : c.hot;
    return `<button type="button" class="channel-filter-pill ${extraClass}" data-channel-filter="${escapeHtml(c.handle.toLowerCase())}" title="Best outlier: ${bestOutlier.toFixed(1)}×${bestTitle ? ` · ${escapeHtml(bestTitle)}` : ""}${opportunityCount ? ` · ${opportunityCount} discovery video${opportunityCount === 1 ? "" : "s"} over ${formatNumber(OPPORTUNITY_VIEW_FLOOR)} views` : ""}">${channelCell(c.handle, { size: 18 })}<span>${c.count}${opportunityCount ? ` · ${opportunityCount} discovery` : ""}${hotCount ? ` · ${hotCount} hot` : ""}</span>${extraClass ? `<span class="worth-mark">★ ${bestOutlier.toFixed(1)}×</span>` : ""}</button>`;
  };

  return `<div class="channel-filter" id="channel-filter">
    <div class="filter-head"><span>New opportunity channels</span><span class="muted" id="channel-filter-count">${videos.length} videos</span></div>
    ${worthChannels.length ? `<div class="filter-pills filter-pills--worth">${worthChannels.map((c) => filterButton(c, "channel-filter-pill--worth")).join("")}</div>` : `<div class="muted filter-empty">No standout channels in this horizon yet.</div>`}
    ${renderLabelFilterPills(videos)}
    <div class="filter-head filter-head--secondary"><span>Other tracked channels</span><span class="muted">multi-select</span></div>
    <div class="filter-pills">
      <button type="button" class="channel-filter-pill is-active" data-channel-filter="">All <span>${videos.length}</span></button>
      ${volumeChannels.map((c) => filterButton(c)).join("")}
    </div>
  </div>`;
}

function dropzone(slug, tabs) {
  const options = tabs
    .map((t) => `<option value="${escapeHtml(t.slug)}" ${t.slug === slug ? "selected" : ""}>${escapeHtml(t.niche)}</option>`)
    .join("");
  // slug -> your active channels, so the "source channel" datalist can update
  // when the niche changes (and offer add-a-new-one).
  const channelMap = {};
  for (const t of tabs) channelMap[t.slug] = t.activeChannels || [];
  return `<section class="dropzone-card">
    <form id="upload-form" data-slug="${escapeHtml(slug || "")}">
      <div id="dropzone" class="dropzone" tabindex="0">
        <div class="dz-icon">⬆</div>
        <div class="dz-title">Drop YouTube Studio audience screenshots</div>
        <div class="dz-sub">or click to choose files · PNG / JPG · multiple ok</div>
        <input id="file-input" type="file" accept="image/*" multiple hidden>
      </div>
      <div class="dz-controls">
        <label>Ingest into niche:
          <select id="tab-select" ${tabs.length ? "" : "disabled"}>${options || '<option value="">— create a niche first —</option>'}</select>
        </label>
        <label class="src-channel-label">Audience tab is from:
          <input id="source-channel" list="source-channel-list" placeholder="@your-channel" autocomplete="off">
          <datalist id="source-channel-list"></datalist>
        </label>
        <button type="submit" id="upload-btn" disabled>Save snapshot</button>
      </div>
      <div id="dz-preview" class="dz-preview"></div>
      <div id="dz-status" class="dz-status"></div>
    </form>
    <script type="application/json" id="niche-channels">${JSON.stringify(channelMap)}</script>
    <p class="dz-hint"><strong>Which of your channels is this Audience tab from?</strong> Pick or type it above.
      Screenshots are saved as a dated <strong>snapshot</strong> for this niche — the videos, competitor channels,
      and demographics stay as visual reference you can scroll back through over time (below).</p>
  </section>`;
}

// One clickable "video your audience watched" row: thumbnail + title link to
// the actual YouTube video, channel link, views, age.
function audienceVideoRow(v) {
  const url = videoUrl(v.videoId);
  const turl = thumbUrl(v.videoId);
  const thumb = turl
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="thumb-link"><img class="vthumb" src="${escapeHtml(turl)}" loading="lazy" alt=""></a>`
    : `<span class="vthumb vthumb--empty">▶</span>`;
  const title = url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="vtitle-link">${escapeHtml(v.title)}</a>`
    : escapeHtml(v.title);
  return `<tr class="vrow">
    <td class="c-thumb">${thumb}</td>
    <td class="c-title">${title}</td>
    <td class="c-chan">${channelCell(v.handle || v.channel, { size: 20 })}</td>
    <td class="c-num c-views">${formatNumber(v.views)}</td>
    <td class="c-num muted">${escapeHtml(v.age || "")}</td>
  </tr>`;
}

// Dated audience snapshots — each rendered as an interactive, clickable list
// (videos → YouTube, channels → their pages) with the raw screenshots kept as
// collapsible reference (and demographics shown inline).
function renderSnapshots(snapshots) {
  if (!snapshots?.length) {
    return `<section class="panel panel--empty"><p>No snapshots yet. Drop this niche's Audience-tab screenshots above and they'll show here as clickable lists, newest first.</p></section>`;
  }
  const dayLabel = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "unknown date" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };
  const timeLabel = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };
  const imgThumb = (s, f) =>
    `<a class="snap-thumb" href="/snap/${encodeURIComponent(s.batchId)}/${encodeURIComponent(f)}" data-full="/snap/${encodeURIComponent(s.batchId)}/${encodeURIComponent(f)}"><img src="/snap/${encodeURIComponent(s.batchId)}/${encodeURIComponent(f)}" alt="" loading="lazy"></a>`;

  const cards = snapshots
    .map((s) => {
      const a = s.audience;
      // interactive lists (when the snapshot has been read into structured data)
      let structured = "";
      if (a && (a.videos?.length || a.channels?.length)) {
        const vids = a.videos?.length
          ? `<h3 class="snap-sub">Videos your audience watched <span class="muted">${a.videos.length}</span></h3>
             <div class="table-scroll"><table class="vtable"><tbody>${a.videos.map(audienceVideoRow).join("")}</tbody></table></div>`
          : "";
        const chans = a.channels?.length
          ? `<h3 class="snap-sub">Channels your audience watches <span class="muted">${a.channels.length}</span></h3>
             <div class="chan-chips">${a.channels
               .map((c) => `<span class="chan-chip">${channelCell(c.handle || c.name, { size: 26 })}${c.subs ? `<span class="chan-subs">${escapeHtml(c.subs)}</span>` : ""}</span>`)
               .join("")}</div>`
          : "";
        const demo = a.demographicsFile
          ? `<h3 class="snap-sub">Age & gender${a.note ? ` <span class="muted">${escapeHtml(a.note)}</span>` : ""}</h3>
             <div class="snap-demo">${imgThumb(s, a.demographicsFile)}</div>`
          : "";
        structured = vids + chans + demo;
      }

      const imgs = s.files.map((f) => imgThumb(s, f)).join("");
      const screenshots = structured
        ? `<details class="snap-originals"><summary>Original screenshots (${s.files.length})</summary><div class="snap-grid">${imgs}</div></details>`
        : `<div class="snap-grid">${imgs}</div>`;

      const nicheBadge = s.actualNiche
        ? `<span class="snap-niche" title="Hiring Update Sheet niche${s.sheetMatchConfidence ? ` · ${escapeHtml(s.sheetMatchConfidence)}` : ""}">${escapeHtml(s.actualNiche)}</span>`
        : "";
      const sourceLabel = s.sourceChannelCanonical || s.sourceChannel;
      return `<div class="snap-card">
        <div class="snap-head">
          <span class="snap-date">${escapeHtml(dayLabel(s.created))}</span>
          <span class="muted snap-time">${escapeHtml(timeLabel(s.created))}</span>
          ${sourceLabel ? `<span class="snap-from">${channelCell(sourceLabel, { size: 20 })}</span>` : ""}
          ${nicheBadge}
          <span class="muted snap-count">${s.files.length} screenshot${s.files.length === 1 ? "" : "s"}</span>
        </div>
        ${structured}
        ${screenshots}
      </div>`;
    })
    .join("");
  return `<section class="panel">
    <h2>Audience snapshots <span class="muted">newest first · click any video/channel to open it · scroll back to compare over time</span></h2>
    <div class="snap-list">${cards}</div>
  </section>`;
}

export function renderHome({ tabs }) {
  const allVideos = tabs.flatMap((t) => t.videos.map((v) => ({ ...v, niche: t.niche, slug: t.slug })));
  const recentAge = (v) => daysAgo(v.publishDate);
  const isRecent = (v) => {
    const age = recentAge(v);
    return age == null ? false : age <= 30;
  };
  const outlierSort = (a, b) => (b.outlier ?? 0) - (a.outlier ?? 0) || (b.views ?? 0) - (a.views ?? 0);
  const allOutliers = allVideos.filter((v) => isHighlighted(v.outlier));
  const recentOutliers = allOutliers.filter(isRecent).sort(outlierSort);
  const olderOutliers = allOutliers.filter((v) => !isRecent(v)).sort(outlierSort);
  const outliers = [...recentOutliers, ...olderOutliers];
  const viral = allVideos.filter((v) => (v.outlier ?? 0) >= 5).length;
  const stats = [
    { k: "Niches tracked", v: tabs.length },
    { k: "Videos in engine", v: allVideos.length },
    { k: `Outliers >${HIGHLIGHT_THRESHOLD}×`, v: outliers.length, hot: outliers.length > 0 },
    { k: "Viral anomalies", v: viral, hot: viral > 0 },
  ];

  const statCards = stats
    .map((s) => `<div class="stat ${s.hot ? "stat--hot" : ""}"><div class="stat-v">${s.v}</div><div class="stat-k">${escapeHtml(s.k)}</div></div>`)
    .join("");

  const visibleOutliers = outliers.slice(0, 20);
  const topOutliers = outliers.length
    ? `<section class="panel">
        <h2>Top outliers <span class="muted">past 30d first · across all niches · >${HIGHLIGHT_THRESHOLD}× baseline</span></h2>
        ${renderChannelFilter(visibleOutliers)}
        <div class="table-scroll"><table class="vtable" id="engine">
          <thead><tr><th></th><th data-sort="title">Video</th><th data-sort="handle">Channel</th><th data-sort="age">Age</th><th data-sort="views" class="c-num">Views</th><th data-sort="d7" class="c-num">Δ7d</th><th class="c-num">Δ30d</th><th data-sort="pct7" class="c-num">Trend</th><th data-sort="outlier">Outlier</th><th>Src</th></tr></thead>
          <tbody>${visibleOutliers.map((v) => videoRow(v, v.slug, { showNiche: true })).join("")}</tbody>
        </table></div>
      </section>`
    : `<section class="panel panel--empty"><p>No outliers above ${HIGHLIGHT_THRESHOLD}× yet. Track a competitor on a niche page and its videos populate here.</p></section>`;

  const tabCards = tabs.length
    ? tabs
        .map((t) => {
          const hot = t.videos.filter((v) => isHighlighted(v.outlier)).length;
          const recentTop = t.videos.filter(isRecent).sort(outlierSort)[0];
          const top = recentTop || [...t.videos].sort(outlierSort)[0];
          const snaps = snapshotCount(t.slug);
          return `<a class="tab-card ${hot ? "tab-card--hot" : ""}" href="/tab/${escapeHtml(t.slug)}">
            <div class="tab-card-head">
              <span class="tab-card-niche">${escapeHtml(t.niche)}</span>
              ${t.portfolio ? `<span class="tab-card-port">${escapeHtml(t.portfolio)}</span>` : ""}
            </div>
            <div class="tab-card-metrics">
              <span>${t.videos.length} videos</span>
              <span>${(t.directCompetitors.length + t.risingCompetitors.length)} competitors</span>
              <span>${snaps.snapshots} snapshot${snaps.snapshots === 1 ? "" : "s"}</span>
              <span class="${hot ? "hot-count" : "muted"}">${hot} hot</span>
            </div>
            ${top && isHighlighted(top.outlier) ? `<div class="tab-card-top">🔥 ${escapeHtml(top.title)} — ${top.outlier.toFixed(1)}×</div>` : `<div class="tab-card-top muted">last update: ${escapeHtml(t.registry.lastDate || "never")}</div>`}
          </a>`;
        })
        .join("")
    : `<div class="empty-tabs">No niches yet. Create one below to start tracking.</div>`;

  const newTabForm = `<section class="panel" id="new-tab">
    <h2>New target niche</h2>
    <form id="new-tab-form" class="new-tab-form">
      <input name="niche" placeholder="Niche / target name (e.g. Automotive Macro)" required>
      <input name="portfolio" placeholder="Portfolio (e.g. Casgains Enterprises)">
      <input name="activeChannels" placeholder="Your channels, comma-separated (e.g. @casgains, @virelox)">
      <button type="submit">Create niche tab</button>
    </form>
    <div id="new-tab-status" class="dz-status"></div>
  </section>`;

  const body = `
  <section class="hero">
    <div class="stats-row">${statCards}</div>
  </section>
  ${dropzone("", tabs)}
  ${topOutliers}
  <section class="panel">
    <h2>Tracked niches <span class="count">${tabs.length}</span></h2>
    <div class="tab-grid">${tabCards}</div>
  </section>
  ${newTabForm}
  `;
  return layout("Competitor Video Tracker", body, { active: "home" });
}

export function renderTab(tab, { horizon = 7, snapshots = [] }) {
  const h = HORIZONS.includes(Number(horizon)) ? Number(horizon) : 7;
  const inHorizon = (v) => {
    if (h === 0) return true;
    const age = daysAgo(v.publishDate);
    return age == null ? true : age <= h;
  };
  // Canada is used as an opportunity/ideation tab, so keep the engine focused on
  // videos with enough absolute demand. Tiny high-multiple videos can be noisy
  // and should not crowd the actionable table.
  const appliesViewFloor = String(tab.slug || "").toLowerCase() === "canada";
  const meetsTabViewFloor = (v) => !appliesViewFloor || Number(v.views || 0) >= OPPORTUNITY_VIEW_FLOOR;
  const isOpportunityDiscovery = (v) => /youtube-home-style-discovery|niche-discovery|discovery/i.test(v.source || "");
  const videos = [...tab.videos].map((v) => withDerivedLabels(v, tab)).filter((v) => inHorizon(v) && meetsTabViewFloor(v)).sort((a, b) => {
    const oppDelta = Number(isOpportunityDiscovery(b)) - Number(isOpportunityDiscovery(a));
    if (oppDelta) return oppDelta;
    return (b.outlier ?? 0) - (a.outlier ?? 0) || (b.views ?? 0) - (a.views ?? 0);
  });
  const hotCount = videos.filter((v) => isHighlighted(v.outlier)).length;
  const channelCounts = [...videos.reduce((m, v) => {
    const handle = v.handle || "—";
    const rec = m.get(handle) || { handle, count: 0, hot: 0, eligibleHot: 0, maxOutlier: 0, eligibleMaxOutlier: 0, topTitle: "", eligibleTopTitle: "", opportunity: 0, eligibleOpportunity: 0, maxOpportunityOutlier: 0, eligibleMaxOpportunityOutlier: 0, topOpportunityTitle: "", eligibleTopOpportunityTitle: "" };
    rec.count += 1;
    const outlier = Number(v.outlier || 0);
    const meetsViewFloor = Number(v.views || 0) >= OPPORTUNITY_VIEW_FLOOR;
    if (isHighlighted(outlier)) {
      rec.hot += 1;
      if (meetsViewFloor) rec.eligibleHot += 1;
    }
    if (isOpportunityDiscovery(v)) {
      rec.opportunity += 1;
      if (outlier > rec.maxOpportunityOutlier) {
        rec.maxOpportunityOutlier = outlier;
        rec.topOpportunityTitle = v.title || "";
      }
      if (meetsViewFloor) {
        rec.eligibleOpportunity += 1;
        if (outlier > rec.eligibleMaxOpportunityOutlier) {
          rec.eligibleMaxOpportunityOutlier = outlier;
          rec.eligibleTopOpportunityTitle = v.title || "";
        }
      }
    }
    if (outlier > rec.maxOutlier) {
      rec.maxOutlier = outlier;
      rec.topTitle = v.title || "";
    }
    if (meetsViewFloor && outlier > rec.eligibleMaxOutlier) {
      rec.eligibleMaxOutlier = outlier;
      rec.eligibleTopTitle = v.title || "";
    }
    m.set(handle, rec);
    return m;
  }, new Map()).values()]
    .map((c) => ({ ...c, worthScore: (c.eligibleOpportunity * 20) + (c.eligibleHot * 10) + Math.min(c.eligibleMaxOpportunityOutlier || c.eligibleMaxOutlier || 0, 10) + Math.min(c.count / 20, 2) }))
    .sort((a, b) => b.count - a.count || b.eligibleHot - a.eligibleHot || a.handle.localeCompare(b.handle));
  const worthChannels = channelCounts
    .filter((c) => c.eligibleOpportunity > 0 || c.eligibleHot > 0 || c.eligibleMaxOutlier >= 2.5)
    .sort((a, b) => b.worthScore - a.worthScore || (b.eligibleMaxOpportunityOutlier || b.eligibleMaxOutlier) - (a.eligibleMaxOpportunityOutlier || a.eligibleMaxOutlier) || a.handle.localeCompare(b.handle))
    .slice(0, 8);
  const worthHandles = new Set(worthChannels.map((c) => c.handle.toLowerCase()));
  const volumeChannels = channelCounts.filter((c) => !worthHandles.has(c.handle.toLowerCase()));
  const filterButton = (c, extraClass = "") => {
    const bestOutlier = extraClass ? (c.eligibleMaxOpportunityOutlier || c.eligibleMaxOutlier || 0) : (c.maxOutlier || 0);
    const bestTitle = extraClass ? (c.eligibleTopOpportunityTitle || c.eligibleTopTitle || c.topTitle || "") : (c.topTitle || "");
    const opportunityCount = extraClass ? c.eligibleOpportunity : c.opportunity;
    const hotCount = extraClass ? c.eligibleHot : c.hot;
    return `<button type="button" class="channel-filter-pill ${extraClass}" data-channel-filter="${escapeHtml(c.handle.toLowerCase())}" title="Best outlier: ${bestOutlier.toFixed(1)}×${bestTitle ? ` · ${escapeHtml(bestTitle)}` : ""}${opportunityCount ? ` · ${opportunityCount} discovery video${opportunityCount === 1 ? "" : "s"} over ${formatNumber(OPPORTUNITY_VIEW_FLOOR)} views` : ""}">${channelCell(c.handle, { size: 18 })}<span>${c.count}${opportunityCount ? ` · ${opportunityCount} discovery` : ""}${hotCount ? ` · ${hotCount} hot` : ""}</span>${extraClass ? `<span class="worth-mark">★ ${bestOutlier.toFixed(1)}×</span>` : ""}</button>`;
  };

  const horizonBtns = HORIZONS.map((d) => {
    const label = d === 0 ? "All" : `${d}d`;
    const url = `/tab/${encodeURIComponent(tab.slug)}?h=${d}`;
    return `<a class="hbtn ${d === h ? "is-active" : ""}" href="${url}">${label}</a>`;
  }).join("");

  const compRows = (list, kind) =>
    list.length
      ? list
          .map(
            (c) => `<tr><td class="c-chan">${channelCell(c.handle, { size: 24 })}</td><td>${escapeHtml(c.size || "—")}</td><td class="c-num">${c.baselineVph ?? "—"}</td><td><span class="pill pill--${kind}">${kind}</span></td></tr>`
          )
          .join("")
      : `<tr><td colspan="4" class="muted">none yet</td></tr>`;

  const engine = videos.length
    ? `<div class="channel-filter" id="channel-filter">
        <div class="filter-head"><span>New opportunity channels</span><span class="muted" id="channel-filter-count">${videos.length} videos</span></div>
        ${worthChannels.length ? `<div class="filter-pills filter-pills--worth">${worthChannels.map((c) => filterButton(c, "channel-filter-pill--worth")).join("")}</div>` : `<div class="muted filter-empty">No standout channels in this horizon yet.</div>`}
        ${renderLabelFilterPills(videos)}
        <div class="filter-head filter-head--secondary"><span>Other tracked channels</span><span class="muted">multi-select</span></div>
        <div class="filter-pills">
          <button type="button" class="channel-filter-pill is-active" data-channel-filter="">All <span>${videos.length}</span></button>
          ${volumeChannels.map((c) => filterButton(c)).join("")}
        </div>
      </div>
      <div class="table-scroll"><table class="vtable" id="engine">
        <thead><tr>
          <th></th>
          <th data-sort="title">Video Title</th>
          <th data-sort="handle">Channel</th>
          <th data-sort="age" class="c-num">Age</th>
          <th data-sort="views" class="c-num">Views</th>
          <th data-sort="d7" class="c-num">Δ7d</th>
          <th class="c-num">Δ30d</th>
          <th data-sort="pct7" class="c-num">Trend</th>
          <th data-sort="outlier">Outlier</th>
          <th>Src</th>
        </tr></thead>
        <tbody>${videos.map((v) => videoRow(v, tab.slug)).join("")}</tbody>
      </table></div>`
    : `<p class="muted">No videos in the ${h === 0 ? "engine" : `last ${h} days`} yet. Track a competitor below (paste a channel from your snapshots) and its recent videos load in.</p>`;

  const compCount = tab.directCompetitors.length + tab.risingCompetitors.length;
  const trackAllBtn = hasYouTube() && compCount
    ? `<button type="button" id="track-all-btn" class="btn-secondary" data-slug="${escapeHtml(tab.slug)}" data-count="${compCount}">⟳ Track all ${compCount} competitors</button>`
    : "";

  const trackBox = `<div class="track-box">
    <form id="track-form" data-slug="${escapeHtml(tab.slug)}" class="inline-add">
      <input name="handle" placeholder="+ track a competitor (@handle or channel URL)" autocomplete="off">
      <button type="submit">${hasYouTube() ? "Pull videos" : "Add"}</button>
    </form>
    ${trackAllBtn}
    <span class="muted track-hint">${hasYouTube() ? "Pulls each channel's avatar, subs, baseline VPH, and recent videos from YouTube. “Track all” does every listed competitor at once." : "Add YOUTUBE_API_KEY to .env to auto-pull avatars, videos & baselines."}</span>
    <div id="track-status" class="dz-status"></div>
  </div>`;

  const body = `
  <a class="back" href="/">← all niches</a>
  <section class="tab-header">
    <div>
      <h1>${escapeHtml(tab.niche)}</h1>
      <div class="tab-meta">
        ${tab.portfolio ? `<span class="pill pill--port">${escapeHtml(tab.portfolio)}</span>` : ""}
        <span class="muted own-label">Your channels:</span>
        ${tab.activeChannels.length ? tab.activeChannels.map((c) => `<span class="own-chan">${channelCell(c, { size: 26 })}</span>`).join("") : `<span class="muted">—</span>`}
        <form id="add-channel-form" data-slug="${escapeHtml(tab.slug)}" class="inline-add">
          <input name="handle" placeholder="+ add channel (@handle or paste URL)" autocomplete="off">
          <button type="submit">Add</button>
        </form>
      </div>
      <div id="add-channel-status" class="dz-status"></div>
    </div>
    <div class="tab-registry">
      <div><span class="muted">Last ingest</span><strong>${escapeHtml(tab.registry.lastDate || "never")}</strong></div>
      <div><span class="muted">Channels</span><strong>${tab.registry.channels}</strong></div>
      <div><span class="muted">Videos</span><strong>${tab.registry.videos}</strong></div>
      <div><span class="muted">Hot (>${HIGHLIGHT_THRESHOLD}×)</span><strong class="${hotCount ? "hot-count" : ""}">${hotCount}</strong></div>
    </div>
  </section>

  ${dropzone(tab.slug, [tab])}

  <section class="panel">
    <div class="panel-head">
      <h2>Content Performance Engine</h2>
      <div class="horizon">${horizonBtns}</div>
    </div>
    ${trackBox}
    ${engine}
  </section>

  ${renderSnapshots(snapshots)}

  <section class="panel two-col">
    <div>
      <h2>Direct competitors</h2>
      <table class="vtable small"><thead><tr><th>Handle</th><th>Size</th><th class="c-num">Baseline VPH</th><th></th></tr></thead>
      <tbody>${compRows(tab.directCompetitors, "direct")}</tbody></table>
    </div>
    <div>
      <h2>Rising competitors</h2>
      <table class="vtable small"><thead><tr><th>Handle</th><th>Size</th><th class="c-num">Baseline VPH</th><th></th></tr></thead>
      <tbody>${compRows(tab.risingCompetitors, "rising")}</tbody></table>
    </div>
  </section>
  `;
  return layout(`${tab.niche} · Tracker`, body, {});
}
