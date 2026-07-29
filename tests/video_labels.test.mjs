import assert from "node:assert/strict";
import test from "node:test";

import { parseTab, serializeTab } from "../lib/tabs.mjs";
import { labelVideoForDiscovery } from "../lib/video_labels.mjs";
import { renderHome, renderTab } from "../lib/render.mjs";

test("video labels round-trip through tracker tab markdown", () => {
  const tab = {
    slug: "anti-dem",
    niche: "Anti Dem",
    portfolio: "Casgains",
    created: "2026-07-22",
    updated: "2026-07-22",
    activeChannels: ["@williamreportsnews"],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-22", channels: 1, videos: 1 },
    videos: [{
      title: "Standalone cooking test",
      handle: "@testchannel",
      videoId: "abc123def45",
      publishDate: "2026-07-22",
      views: 12345,
      vph: 1000,
      outlier: 4.2,
      tier: "Major Outlier",
      labels: ["cooking/food one-off", "off-niche one-off"],
      source: "youtube-home-style-discovery",
      firstSeen: "2026-07-22",
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
    registry: { lastDate: "2026-07-22", channels: 1, videos: 1 },
    videos: [{
      title: "Cooking experiment",
      handle: "@testchannel",
      videoId: "abc123def45",
      publishDate: "2026-07-22",
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
      registry: { lastDate: "2026-07-22", channels: 2, videos: 2 },
      videos: [
        { title: "Plant once in July", handle: "@henrysgardennotes", videoId: "a1234567890", publishDate: "2026-07-22", views: 305000, outlier: 116.16, tier: "Viral Anomaly", labels: [], source: "youtube-home-style-discovery" },
        { title: "Normal tracked hit", handle: "@trackedgarden", videoId: "b1234567890", publishDate: "2026-07-22", views: 50000, outlier: 4.2, tier: "Major Outlier", labels: [], source: "youtube/user-provided" },
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

test("niche tab renders channel filter pills before engine results", () => {
  const tab = {
    slug: "anti-dem",
    niche: "Anti Dem",
    portfolio: "",
    activeChannels: [],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-22", channels: 2, videos: 3 },
    videos: [
      { title: "A", handle: "@flooder", videoId: "a1234567890", publishDate: "2026-07-22", views: 11000, outlier: 3.2, tier: "Major Outlier", labels: [], source: "youtube-home-style-discovery" },
      { title: "B", handle: "@flooder", videoId: "b1234567890", publishDate: "2026-07-22", views: 12000, outlier: 2.1, tier: "Minor Outlier", labels: [], source: "youtube-home-style-discovery" },
      { title: "C", handle: "@other", videoId: "c1234567890", publishDate: "2026-07-22", views: 13000, outlier: 4.4, tier: "Major Outlier", labels: [], source: "youtube-home-style-discovery" },
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
    registry: { lastDate: "2026-07-22", channels: 2, videos: 2 },
    videos: [
      { title: "Low absolute spike", handle: "@lowviews", videoId: "l1234567890", publishDate: "2026-07-22", views: 9999, outlier: 99, tier: "Viral Anomaly", labels: [], source: "youtube-home-style-discovery" },
      { title: "Real breakout", handle: "@highviews", videoId: "h1234567890", publishDate: "2026-07-22", views: 10000, outlier: 3, tier: "Major Outlier", labels: [], source: "youtube-home-style-discovery" },
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
    registry: { lastDate: "2026-07-22", channels: 2, videos: 2 },
    videos: [
      { title: "Tiny Canada spike", handle: "@lowviews", videoId: "l1234567890", publishDate: "2026-07-22", views: 9999, outlier: 99, tier: "Viral Anomaly", labels: [], source: "youtube-home-style-discovery" },
      { title: "Real Canada breakout", handle: "@highviews", videoId: "h1234567890", publishDate: "2026-07-22", views: 10000, outlier: 3, tier: "Major Outlier", labels: [], source: "youtube-home-style-discovery" },
    ],
  };
  const html = renderTab(tab, { horizon: 7, snapshots: [] });
  assert.doesNotMatch(html, /Tiny Canada spike/);
  assert.match(html, /Real Canada breakout/);
  assert.doesNotMatch(html, /data-channel-filter="@lowviews"/);
  assert.match(html, /data-channel-filter="@highviews"/);
});

test("Canada tab renders pro/anti Canada segment filters and row labels", () => {
  const tab = {
    slug: "canada",
    niche: "Canada",
    portfolio: "",
    activeChannels: [],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-27", channels: 2, videos: 2 },
    videos: [
      { title: "Canada CUTS OFF U.S. Trade — 14 Nations Join Emergency Alliance", handle: "@pro", videoId: "p1234567890", publishDate: "2026-07-27", views: 50000, outlier: 4.5, tier: "Major Outlier", labels: [], source: "youtube-home-style-discovery" },
      { title: "Lawyer Sounds Alarm on Carney’s New Orwellian Bill — Digital ID Coming?", handle: "@anti", videoId: "a1234567890", publishDate: "2026-07-27", views: 40000, outlier: 3.5, tier: "Major Outlier", labels: [], source: "youtube-home-style-discovery" },
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
    registry: { lastDate: "2026-07-27", channels: 2, videos: 2 },
    videos: [
      { title: "From Edsel", handle: "@edselpick", videoId: "e1234567890", publishDate: "2026-07-27", views: 50000, outlier: 4.1, tier: "Major Outlier", labels: ["edsel-sheet"], source: "youtube/user-provided" },
      { title: "Not Edsel", handle: "@regularpick", videoId: "r1234567890", publishDate: "2026-07-27", views: 60000, outlier: 4.2, tier: "Major Outlier", labels: [], source: "youtube/user-provided" },
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
    registry: { lastDate: "2026-07-28", channels: 2, videos: 3 },
    videos: [
      { title: "Audience competitor baseline", handle: "@audiencepick", videoId: "a1234567890", publishDate: "2026-07-28", views: 20000, outlier: 1.4, tier: "Baseline", labels: [], source: "youtube" },
      { title: "AI avatar sheet pick", handle: "@avatarpick", videoId: "b1234567890", publishDate: "2026-07-28", views: 30000, outlier: 3.4, tier: "Major Outlier", labels: ["edsel-sheet", "ai-avatar"], source: "youtube/user-provided" },
      { title: "Discovery breakout", handle: "@discoverypick", videoId: "c1234567890", publishDate: "2026-07-28", views: 40000, outlier: 4.1, tier: "Major Outlier", labels: [], source: "youtube-home-style-discovery" },
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
    registry: { lastDate: "2026-07-28", channels: 1, videos: 2 },
    videos: [
      { title: "Chosen inspiration", handle: "@pick", videoId: "p1234567890", publishDate: "2026-07-28", views: 50000, outlier: 4.4, tier: "Major Outlier", labels: ["ai-avatar"], source: "youtube/user-provided" },
      { title: "Not chosen", handle: "@other", videoId: "o1234567890", publishDate: "2026-07-28", views: 25000, outlier: 2.2, tier: "Minor Outlier", labels: [], source: "youtube" },
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
    registry: { lastDate: "2026-07-29", channels: 2, videos: 3 },
    videos: [
      { title: "Weak baseline noise", handle: "@weak", videoId: "w1234567890", publishDate: "2026-07-29", views: 100000, outlier: 0.1, tier: "Baseline", labels: [], source: "youtube/user-provided", firstSeen: "2026-07-29" },
      { title: "Off niche cooking spike", handle: "@cook", videoId: "c1234567890", publishDate: "2026-07-29", views: 100000, outlier: 10, tier: "Viral Anomaly", labels: ["cooking/food one-off"], source: "youtube-home-style-discovery", firstSeen: "2026-07-29" },
      { title: "Relevant outlier", handle: "@good", videoId: "g1234567890", publishDate: "2026-07-29", views: 25000, outlier: 3.1, tier: "Major Outlier", labels: ["ai-avatar"], source: "youtube/user-provided", firstSeen: "2026-07-29" },
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
    registry: { lastDate: "2026-07-29", channels: 2, videos: 2 },
    videos: [
      { title: "Audience outlier", handle: "@aud", videoId: "a1234567890", publishDate: "2026-07-29", views: 50000, outlier: 3.2, tier: "Major Outlier", labels: [], source: "youtube", firstSeen: "2026-07-20" },
      { title: "Edsel outlier", handle: "@edsel", videoId: "e1234567890", publishDate: "2026-07-29", views: 60000, outlier: 4.4, tier: "Major Outlier", labels: ["edsel-sheet", "ai-avatar"], source: "youtube/user-provided", firstSeen: "2026-07-28" },
    ],
  };
  const html = renderTab(tab, { horizon: 7, snapshots: [] });
  const edselIndex = html.indexOf('source-section--style-picks');
  const audienceIndex = html.indexOf('source-section--audience-tab');
  assert.ok(edselIndex > -1 && audienceIndex > -1 && edselIndex < audienceIndex);
  assert.match(html, /Edsel added 2026-07-28/);
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
    registry: { lastDate: "2026-07-29", channels: 1, videos: 1 },
    videos: [{ title: "Dismiss me", handle: "@gone", videoId: "d1234567890", publishDate: "2026-07-29", views: 50000, outlier: 4.1, tier: "Major Outlier", labels: ["edsel-sheet"], source: "youtube/user-provided", firstSeen: "2026-07-29" }],
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
    registry: { lastDate: "2026-07-29", channels: 1, videos: 1 },
    videos: [{ title: "Clean row", handle: "@clean", videoId: "x1234567890", publishDate: "2026-07-29", views: 50000, outlier: 4.1, tier: "Major Outlier", labels: ["edsel-sheet"], source: "youtube/user-provided", firstSeen: "2026-07-29" }],
  };
  const html = renderTab(tab, { horizon: 7, snapshots: [] });
  assert.match(html, /class="dismiss-video dismiss-video--inline"/);
  assert.doesNotMatch(html, /class="table-scroll"/);
  assert.doesNotMatch(html, /<th class="c-dismiss">X<\/th>/);
});

test("audience tab competitors include relevant rows down to 1.5x", () => {
  const tab = {
    slug: "anti-dem",
    niche: "Anti Dem",
    portfolio: "",
    activeChannels: [],
    directCompetitors: [],
    risingCompetitors: [],
    registry: { lastDate: "2026-07-29", channels: 2, videos: 2 },
    videos: [
      { title: "Audience 1.6x keeper", handle: "@aud", videoId: "a1xkeeper00", publishDate: "2026-07-29", views: 25000, outlier: 1.6, tier: "Watch", labels: [], source: "youtube", firstSeen: "2026-07-29" },
      { title: "Edsel 1.6x still hidden", handle: "@edsel", videoId: "e1xhidden00", publishDate: "2026-07-29", views: 25000, outlier: 1.6, tier: "Watch", labels: ["edsel-sheet"], source: "youtube/user-provided", firstSeen: "2026-07-29" },
    ],
  };
  const html = renderTab(tab, { horizon: 7, snapshots: [] });
  assert.match(html, /Audience 1\.6x keeper/);
  assert.doesNotMatch(html, /Edsel 1\.6x still hidden/);
  assert.match(html, /Audience-tab\/reference competitors that are also relevant outliers ≥1\.5×/);
});
