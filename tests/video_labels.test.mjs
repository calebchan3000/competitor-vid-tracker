import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseTab, serializeTab } from "../lib/tabs.mjs";
import { labelVideoForDiscovery } from "../lib/video_labels.mjs";
import { renderHome, renderTab } from "../lib/render.mjs";
import { parseVideoInstruction, applyVideoInstructionToTabs } from "../lib/video_instructions.mjs";
import { thumbUrl } from "../lib/util.mjs";

test("video labels round-trip through tracker tab markdown", () => {
  const tab = {
    slug: "anti-dem",
    niche: "Anti Dem",
    portfolio: "Casgains",
    created: "2026-07-30",
    updated: "2026-07-30",
    activeChannels: ["@williamreportsnews"],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-30", channels: 1, videos: 1 },
    videos: [{
      title: "Standalone cooking test",
      handle: "@testchannel",
      videoId: "abc123def45",
      publishDate: "2026-07-30",
      views: 12345,
      vph: 1000,
      outlier: 4.2,
      tier: "Major Outlier",
      labels: ["cooking/food one-off", "off-niche one-off"],
      source: "youtube-home-style-discovery",
      firstSeen: "2026-07-30",
    }],
  };

  const parsed = parseTab(serializeTab(tab), "anti-dem");
  assert.deepEqual(parsed.videos[0].labels, ["cooking/food one-off", "off-niche one-off"]);
});

test("discovery labels cooking and off-niche one-offs without rejecting them", () => {
  assert.deepEqual(
    labelVideoForDiscovery({ slug: "anti-dem", niche: "Anti Dem", title: "I Tried Cooking a $5 Meal", sourceWasSeed: false }),
    ["cooking/food one-off", "off-niche one-off"]
  );
  assert.deepEqual(
    labelVideoForDiscovery({ slug: "anti-dem", niche: "Anti Dem", title: "Democrats Melt Down Over Trump Ruling", sourceWasSeed: false }),
    []
  );
});

test("rendered dashboard shows video label badges", () => {
  const html = renderHome({ tabs: [{
    slug: "anti-dem",
    niche: "Anti Dem",
    portfolio: "",
    activeChannels: [],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-30", channels: 1, videos: 1 },
    videos: [{
      title: "Cooking experiment",
      handle: "@testchannel",
      videoId: "abc123def45",
      publishDate: "2026-07-30",
      views: 50000,
      outlier: 5.1,
      tier: "Viral Anomaly",
      labels: ["cooking/food one-off"],
      source: "youtube-home-style-discovery",
    }],
  }] });
  assert.match(html, /video-label/);
  assert.match(html, /cooking\/food one-off/);
});

test("home dashboard renders channel filter before top outlier table", () => {
  const tabs = [
    {
      slug: "garden-niche",
      niche: "Garden Niche",
      portfolio: "",
      activeChannels: [],
      directCompetitors: [],
      risingCompetitors: [],
      registry: { lastDate: "2026-07-30", channels: 2, videos: 2 },
      videos: [
        { title: "Plant once in July", handle: "@henrysgardennotes", videoId: "a1234567890", publishDate: "2026-07-30", views: 305000, outlier: 116.16, tier: "Viral Anomaly", labels: [], source: "youtube-home-style-discovery" },
        { title: "Normal tracked hit", handle: "@trackedgarden", videoId: "b1234567890", publishDate: "2026-07-30", views: 50000, outlier: 4.2, tier: "Major Outlier", labels: [], source: "youtube/user-provided" },
      ],
    },
  ];
  const html = renderHome({ tabs });
  assert.match(html, /Top outliers/);
  assert.match(html, /id="channel-filter"/);
  assert.match(html, /New opportunity channels/);
  assert.match(html, /Other tracked channels/);
  assert.match(html, /id="engine"/);
  assert.match(html, /data-sort="outlier"/);
  assert.match(html, /data-channel-filter="@henrysgardennotes"/);
  assert.match(html, /data-channel-filter="@trackedgarden"/);
  assert.ok(html.indexOf('id="channel-filter"') < html.indexOf('id="engine"'));
});

test("home dashboard puts niche cards above the global outlier feed", () => {
  const tabs = [{
    slug: "anti-dem",
    niche: "Anti Dem",
    portfolio: "",
    activeChannels: [],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-30", channels: 1, videos: 1 },
    videos: [{ title: "Global feed item", handle: "@competitor", videoId: "gfeed000001", publishDate: "2026-07-30", views: 50000, outlier: 5.2, tier: "Viral Anomaly", labels: [], source: "youtube" }],
  }];
  const html = renderHome({ tabs });
  assert.ok(html.indexOf("Tracked niches") < html.indexOf("Top outliers"));
});

test("video thumbnails use the larger YouTube thumbnail asset", () => {
  assert.equal(thumbUrl("abc123def45"), "https://i.ytimg.com/vi/abc123def45/hqdefault.jpg");
});

test("niche tab renders channel filter pills before engine results", () => {
  const tab = {
    slug: "anti-dem",
    niche: "Anti Dem",
    portfolio: "",
    activeChannels: [],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-30", channels: 2, videos: 3 },
    videos: [
      { title: "A", handle: "@flooder", videoId: "a1234567890", publishDate: "2026-07-30", views: 11000, outlier: 3.2, tier: "Major Outlier", labels: [], source: "youtube-home-style-discovery" },
      { title: "B", handle: "@flooder", videoId: "b1234567890", publishDate: "2026-07-30", views: 12000, outlier: 2.1, tier: "Minor Outlier", labels: [], source: "youtube-home-style-discovery" },
      { title: "C", handle: "@other", videoId: "c1234567890", publishDate: "2026-07-30", views: 13000, outlier: 4.4, tier: "Major Outlier", labels: [], source: "youtube-home-style-discovery" },
    ],
  };
  const html = renderTab(tab, { horizon: 7, snapshots: [] });
  assert.match(html, /id="channel-filter"/);
  assert.match(html, /New opportunity channels/);
  assert.match(html, /Other tracked channels/);
  assert.match(html, /channel-filter-pill--worth/);
  assert.match(html, /★ 4\.4×/);
  assert.match(html, /data-channel-filter="@flooder"/);
  assert.match(html, /data-channel-filter="@other"/);
  assert.equal((html.match(/data-channel-filter="@flooder"/g) || []).length, 1);
  assert.equal((html.match(/data-channel-filter="@other"/g) || []).length, 1);
  assert.ok(html.indexOf('id="channel-filter"') < html.indexOf('id="engine"'));
});

test("new opportunity channels require at least 10k views", () => {
  const tab = {
    slug: "anti-dem",
    niche: "Anti Dem",
    portfolio: "",
    activeChannels: [],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-30", channels: 2, videos: 2 },
    videos: [
      { title: "Low absolute spike", handle: "@lowviews", videoId: "l1234567890", publishDate: "2026-07-30", views: 9999, outlier: 99, tier: "Viral Anomaly", labels: [], source: "youtube-home-style-discovery" },
      { title: "Real breakout", handle: "@highviews", videoId: "h1234567890", publishDate: "2026-07-30", views: 10000, outlier: 3, tier: "Major Outlier", labels: [], source: "youtube-home-style-discovery" },
    ],
  };
  const html = renderTab(tab, { horizon: 7, snapshots: [] });
  assert.doesNotMatch(html, /channel-filter-pill--worth[^>]*data-channel-filter="@lowviews"/);
  assert.match(html, /channel-filter-pill--worth[^>]*data-channel-filter="@highviews"/);
});

test("Canada tab Content Performance Engine enforces the 10k view floor", () => {
  const tab = {
    slug: "canada",
    niche: "Canada",
    portfolio: "",
    activeChannels: [],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-30", channels: 2, videos: 2 },
    videos: [
      { title: "Tiny Canada spike", handle: "@lowviews", videoId: "l1234567890", publishDate: "2026-07-30", views: 9999, outlier: 99, tier: "Viral Anomaly", labels: [], source: "youtube-home-style-discovery" },
      { title: "Real Canada breakout", handle: "@highviews", videoId: "h1234567890", publishDate: "2026-07-30", views: 10000, outlier: 3, tier: "Major Outlier", labels: [], source: "youtube-home-style-discovery" },
    ],
  };
  const html = renderTab(tab, { horizon: 7, snapshots: [] });
  assert.doesNotMatch(html, /Tiny Canada spike/);
  assert.match(html, /Real Canada breakout/);
  assert.doesNotMatch(html, /data-channel-filter="@lowviews"/);
  assert.match(html, /data-channel-filter="@highviews"/);
});

test("home and niche feeds hide Shorts and own-channel rows", () => {
  const tab = {
    slug: "anti-dem",
    niche: "Anti Dem",
    portfolio: "",
    activeChannels: ["@williamreportsnews", "@JulianNewsReport"],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-30", channels: 3, videos: 3 },
    videos: [
      { title: "Own channel should not show", handle: "William Reports News", videoId: "ownrow00001", publishDate: "2026-07-30", views: 250000, outlier: 8.1, tier: "Viral Anomaly", labels: [], source: "youtube" },
      { title: "Shorts should not show #shorts", handle: "@shortscreator", videoId: "shortrow001", publishDate: "2026-07-30", views: 999999, outlier: 99, tier: "Viral Anomaly", labels: [], source: "youtube" },
      { title: "Real competitor should show", handle: "@competitor", videoId: "realrow0001", publishDate: "2026-07-30", views: 50000, outlier: 4.2, tier: "Major Outlier", labels: [], source: "youtube" },
    ],
  };
  const tabHtml = renderTab(tab, { horizon: 7, snapshots: [] });
  assert.match(tabHtml, /Real competitor should show/);
  assert.doesNotMatch(tabHtml, /Own channel should not show/);
  assert.doesNotMatch(tabHtml, /Shorts should not show/);
  const homeHtml = renderHome({ tabs: [tab] });
  assert.match(homeHtml, /Real competitor should show/);
  assert.doesNotMatch(homeHtml, /Own channel should not show/);
  assert.doesNotMatch(homeHtml, /Shorts should not show/);
});

test("Canada tab renders pro/anti Canada segment filters and row labels", () => {
  const tab = {
    slug: "canada",
    niche: "Canada",
    portfolio: "",
    activeChannels: [],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-30", channels: 2, videos: 2 },
    videos: [
      { title: "Canada CUTS OFF U.S. Trade — 14 Nations Join Emergency Alliance", handle: "@pro", videoId: "p1234567890", publishDate: "2026-07-30", views: 50000, outlier: 4.5, tier: "Major Outlier", labels: [], source: "youtube-home-style-discovery" },
      { title: "Lawyer Sounds Alarm on Carney’s New Orwellian Bill — Digital ID Coming?", handle: "@anti", videoId: "a1234567890", publishDate: "2026-07-30", views: 40000, outlier: 3.5, tier: "Major Outlier", labels: [], source: "youtube-home-style-discovery" },
    ],
  };
  const html = renderTab(tab, { horizon: 7, snapshots: [] });
  assert.match(html, /Segment filters/);
  assert.match(html, /data-label-filter="pro-canada"/);
  assert.match(html, /data-label-filter="anti-canada"/);
  assert.match(html, /video-label--pro-canada/);
  assert.match(html, /video-label--anti-canada/);
  assert.match(html, /data-labels="pro-canada"/);
  assert.match(html, /data-labels="anti-canada"/);
});

test("rendered channel filter includes a separate Edsel-only source button", () => {
  const tab = {
    slug: "anti-dem",
    niche: "Anti Dem",
    portfolio: "",
    activeChannels: [],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-30", channels: 2, videos: 2 },
    videos: [
      { title: "From Edsel", handle: "@edselpick", videoId: "e1234567890", publishDate: "2026-07-30", views: 50000, outlier: 4.1, tier: "Major Outlier", labels: ["edsel-sheet"], source: "youtube/user-provided" },
      { title: "Not Edsel", handle: "@regularpick", videoId: "r1234567890", publishDate: "2026-07-30", views: 60000, outlier: 4.2, tier: "Major Outlier", labels: [], source: "youtube/user-provided" },
    ],
  };
  const html = renderTab(tab, { horizon: 7, snapshots: [] });
  assert.match(html, /Segment filters/);
  assert.match(html, /data-label-filter="edsel-sheet"/);
  assert.match(html, /Edsel only <span>1<\/span>/);
  assert.match(html, /data-labels="edsel-sheet"/);
});

test("niche tab separates audience competitors from AI avatar and up-and-coming picks", () => {
  const tab = {
    slug: "anti-dem",
    niche: "Anti Dem",
    portfolio: "",
    activeChannels: [],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-30", channels: 2, videos: 3 },
    videos: [
      { title: "Audience competitor baseline", handle: "@audiencepick", videoId: "a1234567890", publishDate: "2026-07-30", views: 20000, outlier: 1.4, tier: "Baseline", labels: [], source: "youtube" },
      { title: "AI avatar sheet pick", handle: "@avatarpick", videoId: "b1234567890", publishDate: "2026-07-30", views: 30000, outlier: 3.4, tier: "Major Outlier", labels: ["edsel-sheet", "ai-avatar"], source: "youtube/user-provided" },
      { title: "Discovery breakout", handle: "@discoverypick", videoId: "c1234567890", publishDate: "2026-07-30", views: 40000, outlier: 4.1, tier: "Major Outlier", labels: [], source: "youtube-home-style-discovery" },
    ],
  };
  const html = renderTab(tab, { horizon: 7, snapshots: [] });
  assert.match(html, /Audience tab competitors/);
  assert.match(html, /AI avatar \/ up-and-coming style videos/);
  assert.match(html, /data-source-section="audience-tab"/);
  assert.match(html, /data-source-section="style-picks"/);
  assert.match(html, /AI avatar sheet pick/);
  assert.match(html, /Discovery breakout/);
});

test("niche tab renders inspiration checkboxes and compiled official inspiration list", () => {
  const tab = {
    slug: "anti-dem",
    niche: "Anti Dem",
    portfolio: "",
    activeChannels: [],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-30", channels: 1, videos: 2 },
    videos: [
      { title: "Chosen inspiration", handle: "@pick", videoId: "p1234567890", publishDate: "2026-07-30", views: 50000, outlier: 4.4, tier: "Major Outlier", labels: ["ai-avatar"], source: "youtube/user-provided" },
      { title: "Not chosen", handle: "@other", videoId: "o1234567890", publishDate: "2026-07-30", views: 25000, outlier: 2.2, tier: "Minor Outlier", labels: [], source: "youtube" },
    ],
  };
  const html = renderTab(tab, { horizon: 7, snapshots: [], inspiration: [{ videoId: "p1234567890", title: "Chosen inspiration", url: "https://www.youtube.com/watch?v=p1234567890", handle: "@pick" }] });
  assert.match(html, /type="checkbox" class="inspiration-check"/);
  assert.match(html, /data-video-id="p1234567890"[^>]+checked/);
  assert.match(html, /Official inspiration list/);
  assert.match(html, /href="https:\/\/www\.youtube\.com\/watch\?v=p1234567890"/);
  assert.match(html, /Chosen inspiration/);
});

test("niche tab narrows to relevant outliers and drops weak 0.1x rows", () => {
  const tab = {
    slug: "anti-dem",
    niche: "Anti Dem",
    portfolio: "",
    activeChannels: [],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-30", channels: 2, videos: 3 },
    videos: [
      { title: "Weak baseline noise", handle: "@weak", videoId: "w1234567890", publishDate: "2026-07-30", views: 100000, outlier: 0.1, tier: "Baseline", labels: [], source: "youtube/user-provided", firstSeen: "2026-07-30" },
      { title: "Off niche cooking spike", handle: "@cook", videoId: "c1234567890", publishDate: "2026-07-30", views: 100000, outlier: 10, tier: "Viral Anomaly", labels: ["cooking/food one-off"], source: "youtube-home-style-discovery", firstSeen: "2026-07-30" },
      { title: "Relevant outlier", handle: "@good", videoId: "g1234567890", publishDate: "2026-07-30", views: 25000, outlier: 3.1, tier: "Major Outlier", labels: ["ai-avatar"], source: "youtube/user-provided", firstSeen: "2026-07-30" },
    ],
  };
  const html = renderTab(tab, { horizon: 7, snapshots: [] });
  assert.match(html, /Relevant outlier/);
  assert.doesNotMatch(html, /Weak baseline noise/);
  assert.doesNotMatch(html, /Off niche cooking spike/);
  assert.match(html, /Actionable relevance system/);
});

test("Edsel subsection renders before audience section and shows added date plus subtle inline X", () => {
  const tab = {
    slug: "canada",
    niche: "Canada",
    portfolio: "",
    activeChannels: [],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-30", channels: 2, videos: 2 },
    videos: [
      { title: "Audience outlier", handle: "@aud", videoId: "a1234567890", publishDate: "2026-07-30", views: 50000, outlier: 3.2, tier: "Major Outlier", labels: [], source: "youtube", firstSeen: "2026-07-20" },
      { title: "Edsel outlier", handle: "@edsel", videoId: "e1234567890", publishDate: "2026-07-30", views: 60000, outlier: 4.4, tier: "Major Outlier", labels: ["edsel-sheet", "ai-avatar"], source: "youtube/user-provided", firstSeen: "2026-07-30" },
    ],
  };
  const html = renderTab(tab, { horizon: 7, snapshots: [] });
  const edselIndex = html.indexOf('source-section--style-picks');
  const audienceIndex = html.indexOf('source-section--audience-tab');
  assert.ok(edselIndex > -1 && audienceIndex > -1 && edselIndex < audienceIndex);
  assert.match(html, /Edsel added 2026-07-30/);
  assert.match(html, /class="dismiss-video dismiss-video--inline"/);
  assert.match(html, /aria-label="Hide this title"/);
  assert.doesNotMatch(html, /<th class="c-dismiss">X<\/th>/);
});

test("dismissed videos are removed from actionable niche sections", () => {
  const tab = {
    slug: "anti-dem",
    niche: "Anti Dem",
    portfolio: "",
    activeChannels: [],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-30", channels: 1, videos: 1 },
    videos: [{ title: "Dismiss me", handle: "@gone", videoId: "d1234567890", publishDate: "2026-07-30", views: 50000, outlier: 4.1, tier: "Major Outlier", labels: ["edsel-sheet"], source: "youtube/user-provided", firstSeen: "2026-07-30" }],
  };
  const html = renderTab(tab, { horizon: 7, snapshots: [], dismissed: [{ videoId: "d1234567890" }] });
  assert.doesNotMatch(html, /Dismiss me/);
  assert.match(html, /No videos in this subsection/);
});

test("niche tab renders subtle inline X without a dismiss column or horizontal table scroll wrapper", () => {
  const tab = {
    slug: "canada",
    niche: "Canada",
    portfolio: "",
    activeChannels: [],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-30", channels: 1, videos: 1 },
    videos: [{ title: "Clean row", handle: "@clean", videoId: "x1234567890", publishDate: "2026-07-30", views: 50000, outlier: 4.1, tier: "Major Outlier", labels: ["edsel-sheet"], source: "youtube/user-provided", firstSeen: "2026-07-30" }],
  };
  const html = renderTab(tab, { horizon: 7, snapshots: [] });
  assert.match(html, /class="dismiss-video dismiss-video--inline"/);
  assert.doesNotMatch(html, /class="table-scroll"/);
  assert.doesNotMatch(html, /<th class="c-dismiss">X<\/th>/);
});

test("dismiss X is visibly red but remains inline beside titles", () => {
  const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.dismiss-video--inline \{/);
  assert.match(css, /color:\s*#f87171/);
  assert.match(css, /border:\s*1px solid rgba\(248,113,113/);
  assert.doesNotMatch(css, /\.c-dismiss/);
});

test("video rows render an instruction box for moving or notes", () => {
  const tab = {
    slug: "anti-dem",
    niche: "Anti Dem",
    portfolio: "Casgains",
    activeChannels: [],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-30", channels: 1, videos: 1 },
    videos: [{ title: "Move me", handle: "@source", videoId: "mv123456789", publishDate: "2026-07-30", views: 50000, outlier: 4.2, labels: ["edsel-sheet"], source: "youtube/user-provided", firstSeen: "2026-07-30" }],
  };
  const html = renderTab(tab, { horizon: 7, snapshots: [] });
  assert.match(html, /class="video-command-form"/);
  assert.match(html, /placeholder="move to anti maga, british, canada, or add note…"/);
  assert.match(html, /data-video-id="mv123456789"/);
});

test("move instruction moves a video between tabs and removes it from source", () => {
  assert.deepEqual(parseVideoInstruction("move to anti maga"), { action: "move", targetSlug: "anti-maga" });
  assert.deepEqual(parseVideoInstruction("move to british"), { action: "move", targetSlug: "british-news" });
  const source = {
    slug: "anti-dem",
    niche: "Anti Dem",
    directCompetitors: [{ handle: "@source", size: "50K", baselineVph: 100 }],
    risingCompetitors: [],
    registry: {},
    videos: [{ title: "Move me", handle: "@source", videoId: "mv123456789", publishDate: "2026-07-30", views: 50000, vph: 900, outlier: 4.2, tier: "Major Outlier", labels: ["edsel-sheet"], source: "youtube/user-provided", firstSeen: "2026-07-30" }],
  };
  const target = { slug: "anti-maga", niche: "Anti MAGA", directCompetitors: [], risingCompetitors: [], registry: {}, videos: [] };
  const result = applyVideoInstructionToTabs({ sourceTab: source, targetTab: target, video: source.videos[0], instruction: "move to anti maga" });
  assert.equal(result.action, "move");
  assert.equal(source.videos.length, 0);
  assert.equal(target.videos.length, 1);
  assert.equal(target.videos[0].videoId, "mv123456789");
  assert.ok(target.videos[0].labels.includes("moved-from-anti-dem"));
});

test("audience tab competitors include relevant rows down to 1.5x", () => {
  const tab = {
    slug: "anti-dem",
    niche: "Anti Dem",
    portfolio: "",
    activeChannels: [],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-30", channels: 2, videos: 2 },
    videos: [
      { title: "Audience 1.6x keeper", handle: "@aud", videoId: "a1xkeeper00", publishDate: "2026-07-30", views: 25000, outlier: 1.6, tier: "Watch", labels: [], source: "youtube", firstSeen: "2026-07-30" },
      { title: "Edsel 1.6x still hidden", handle: "@edsel", videoId: "e1xhidden00", publishDate: "2026-07-30", views: 25000, outlier: 1.6, tier: "Watch", labels: ["edsel-sheet"], source: "youtube/user-provided", firstSeen: "2026-07-30" },
    ],
  };
  const html = renderTab(tab, { horizon: 7, snapshots: [] });
  assert.match(html, /Audience 1\.6x keeper/);
  assert.doesNotMatch(html, /Edsel 1\.6x still hidden/);
  assert.match(html, /other audience\/reference outliers include ≥1\.5×/);
});

test("audience section prioritizes actual YouTube Studio audience snapshot videos and caps Fox networks", () => {
  const tab = {
    slug: "anti-dem",
    niche: "Anti Dem",
    portfolio: "Casgains",
    activeChannels: ["@JulianNewsReport"],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-30", channels: 3, videos: 4 },
    videos: [
      { title: "Fox Business one", handle: "@foxbusiness", videoId: "foxbiz00001", publishDate: "2026-07-30", views: 200000, outlier: 2.3, source: "youtube" },
      { title: "Fox Business two", handle: "@foxbusiness", videoId: "foxbiz00002", publishDate: "2026-07-30", views: 190000, outlier: 2.2, source: "youtube" },
      { title: "Fox News one", handle: "@foxnews", videoId: "foxnews0001", publishDate: "2026-07-30", views: 220000, outlier: 2.1, source: "youtube" },
      { title: "Real audience outlier", handle: "@smallcreator", videoId: "audout00001", publishDate: "2026-07-30", views: 80000, outlier: 1.8, source: "youtube" },
    ],
  };
  const snapshots = [{
    files: [],
    audience: { videos: [
      { title: "Studio audience exact A", handle: "@studioa", videoId: "studio00001", views: 12000, age: "5 days ago" },
      { title: "Studio audience exact B", handle: "@studiob", videoId: "studio00002", views: 9000, age: "1 week ago" },
      { title: "Unresolved audience row with no thumbnail", handle: "@noid", views: 100000, age: "1 week ago" },
      { title: "Own studio row should hide", channel: "Julian News Report", videoId: "ownstudio01", views: 100000, age: "1 week ago" },
    ] },
  }];
  const html = renderTab(tab, { horizon: 30, snapshots });
  assert.match(html, /Audience tab competitors — YouTube Studio videos/);
  assert.match(html, /Studio audience exact A/);
  assert.match(html, /Studio audience exact B/);
  assert.doesNotMatch(html, /Unresolved audience row with no thumbnail/);
  assert.doesNotMatch(html, /Own studio row should hide/);
  assert.match(html, /Fox Business one/);
  assert.doesNotMatch(html, /Fox Business two/);
  assert.match(html, /Real audience outlier/);
});
