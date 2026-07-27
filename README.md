# 📡 Competitor Video Tracker

A web-based, omni-channel YouTube **competitive-intelligence** dashboard. Runs
**fully locally — no cloud LLM.** Drag YouTube Studio *Audience* screenshots in;
they're archived as **dated snapshots** you can scroll back through to see how your
audience, competitors, and demographics change over time. Then **track any
competitor by handle** and the (free) **YouTube Data API** pulls its real avatar,
subs, recent videos (thumbnails, views, dates), and baseline VPH into the engine —
anything **>3×** its baseline is flagged 🔥.

Built for the **Casgains Enterprises** and **Virelox Media** portfolios, but every
niche is just a tab you create.

---

## Setup (one time)

```bash
cd "~/Desktop/Competitor video tracker"
node server.mjs                     # works immediately, no install/build
```

Open **http://localhost:4317** (Node ≥ 22). That's the whole app — screenshots
archive and display right away.

**Optional (recommended): a free YouTube API key** so the app can enrich the
channels you track with real avatars, videos, and baselines. Get one in ~2 min:

1. Go to **[console.cloud.google.com](https://console.cloud.google.com/)** and
   create a project (or pick one).
2. **APIs & Services → Library** → search **"YouTube Data API v3"** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key** → copy it.
4. `cp .env.example .env`, paste it as `YOUTUBE_API_KEY=...`, restart `node server.mjs`.

## How you use it

1. **Create a niche** (e.g. *Anti Dem*, portfolio, plus your own channels).
2. In YouTube Studio → **Audience** tab, screenshot the panels — *videos your
   audience watches*, *channels your audience watches*, and *age & gender
   demographics*. **Drag them in**, pick the niche, and choose which of your channels
   the tab is from. They save instantly as a dated **snapshot**.
3. **Scroll the Audience Snapshots gallery** to reference which competitors/videos
   your audience watches and how it shifts over time (click any image to enlarge).
4. **Track competitors:** on a niche page, paste a competitor's `@handle` or full
   YouTube channel/share link (for example `https://youtube.com/@handle?si=...`)
   into "track a competitor" → the YouTube API resolves the real channel, pulls
   recent long-form videos into the engine, skips Shorts, and stores real
   thumbnails, views, subscribers, and baselines. Toggle **7 / 14 / 30-day**
   horizons; the **Δ7d / Δ30d / Trend** columns fill in as you re-track over time.

### One-off channel add via local API

Use this when adding a channel from chat without opening the UI:

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"handle":"https://youtube.com/@handle?si=..."}' \
  http://127.0.0.1:4317/api/tabs/<slug>/track
```

`/track` is preferred over manually editing markdown because it resolves shared
links, picks Direct vs Rising by subscriber count, enriches metadata, ingests
recent non-Short uploads, dedupes stale aliases, and updates history.

## Discord VA audience-tab intake

VAs can upload YouTube Studio Audience-tab screenshots into a Discord channel and
Hermes can import them into the same dated snapshot archive. This lets you collect
more than one niche without manually downloading/dragging every screenshot.

Ask the VA to post one Discord message per channel/niche in this format:

```text
niche: anti-dem
source: @williamreportsnews

[attach Audience tab screenshots]
```

Examples:

```text
niche: aa anti-dem
source: @your-aa-channel
```

The importer accepts PNG/JPG/WebP attachments, creates a batch under
`data/uploads/pending/<batch>/`, and writes Discord provenance into
`manifest.json` so you can see who uploaded it and from which Discord message.

Setup:

```bash
cp data/discord_audience_intake.example.json data/discord_audience_intake.json
# edit channel id(s), default niche/source, and optional VA mappings
npm run discord:intake -- --config data/discord_audience_intake.json --dry-run
npm run discord:intake -- --config data/discord_audience_intake.json
```

One-off import without config:

```bash
npm run discord:intake -- --channel DISCORD_CHANNEL_ID --slug anti-dem --source-channel @williamreportsnews --dry-run
```

State is stored in `data/discord_audience_intake_state.json`, so repeat runs only
process newer Discord messages. Use `--since-message-id` for manual backfills.

## Hosting it online

Built for a container with a persistent disk (e.g. Railway):
- Set `DATA_DIR=/data` and mount a volume there (markdown DB, snapshots, history).
- Set `YOUTUBE_API_KEY` as an env var.
- Start with `node server.mjs`. `PORT` is respected. No cloud LLM billing — the
  only external call is to the free YouTube Data API.

## What each number means

| Term | Meaning |
|---|---|
| **VPH** | Views per hour since upload — the velocity signal. |
| **Baseline VPH** | A channel's *typical* VPH, stored per competitor. The denominator for outlier scores. |
| **Outlier Score** | `video VPH ÷ channel baseline VPH`. >2× Minor · >3× Major · >5× Viral Anomaly. |
| **Source** | `nexlev` = exact numbers from the MCP · `fallback` = computed from the screenshot. |

## The database (it's just markdown)

Everything lives in `data/tracker_tabs/<niche>.md` — open one in any editor. Schema
follows the SYSTEM PROTOCOL: Active Tracking Channels, Direct/Rising Competitors
(with baselines), Ingested Vision Registry, and the Content Performance Engine
table. Per-video time series for the horizon views lives in `data/history/*.jsonl`.

See **`CLAUDE.md`** for the exact enrichment loop Claude follows.

## Layout

```
server.mjs              zero-dep HTTP server + dashboards
lib/                    outlier math · markdown parse/serialize · history · rendering
scripts/tracker.mjs     CLI Claude uses to write enrichment results
public/                 styles.css · app.js (dropzone, sorting)
data/tracker_tabs/      the markdown file-DB (one file per niche)
data/uploads/           pending → processed screenshot batches
data/history/           per-niche JSONL time series
```

## If you ever move it to Railway

It's desktop-first, but portable: set `DATA_DIR=/data` and mount a persistent
volume there, and the same code writes to the Railway volume the spec describes.
(You'd also need to give the deployed app its own OCR/enrichment path, since the
NexLev MCP is only reachable from Claude Code.)
