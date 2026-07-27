# Competitor Video Tracker — operating guide for Claude Code

This is a competitive-intelligence tool. A zero-dependency Node server
(`server.mjs`) serves a drag-and-drop dashboard; the database is a set of
human-readable markdown files under `data/tracker_tabs/`.

## Architecture (reworked 2026-07-15 — NO cloud LLM / OCR)

The tool is **fully local**. There are two data sources, neither of which uses an
LLM:

1. **Audience snapshots (interactive).** Uploaded Studio screenshots are archived
   per niche (`lib/snapshots.mjs`, gallery in `renderSnapshots`). If a batch dir
   has an **`audience.json`**, the gallery renders it as CLICKABLE lists — each
   video links to YouTube, each channel to its page — with the raw screenshots
   tucked into a collapsible. Shape:
   `{ videos:[{title,handle,videoId,views,age}], channels:[{name,handle,subs}], demographicsFile, note }`.
   **To make a new snapshot clickable (Claude Code does this — no cloud OCR):**
   read the batch's PNGs (you have vision), extract each video (title, channel,
   views, age) + channel, then resolve videoIds/handles via the YouTube API —
   `enrichChannel` + `matchUpload(uploads, title, expectedViews)` (pass the
   screenshot's view count so same-channel look-alikes disambiguate by view
   proximity; falls back to `searchVideoId`). Write `audience.json` into the batch
   dir. See the resolver pattern used for the anti-dem / Julian batches.
2. **Content Performance Engine.** Populated by tracking competitors via the
   **YouTube Data API** (`lib/enrich.mjs` → `lib/youtube.mjs`): resolve channel →
   avatar/subs/baseline VPH + recent videos (real videoIds/thumbnails/views), then
   `ingestBatch` (`lib/ingest.mjs`). Endpoint: `POST /api/tabs/<slug>/track`.
   Needs `YOUTUBE_API_KEY` in `.env`; without it, tracking just records the handle.

**You (Claude Code) can still enrich manually** for deep analysis or channels the
YouTube API can't resolve — same write path (`ingestBatch` / the tracker CLI), and
you can still use the NexLev MCP (only reachable from Claude Code; the app never
calls it). The manual steps below remain valid.

### One-off channel adds from chat/shared links

When adding a user-supplied competitor channel like `https://youtube.com/@handle?si=...`, use the local `/track` endpoint instead of hand-editing markdown or only adding a competitor line:

```bash
set -a; . ./.env; set +a
node server.mjs
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"handle":"https://youtube.com/@handle?si=..."}' \
  http://127.0.0.1:4317/api/tabs/<slug>/track
```

This resolves full shared URLs and bare `youtube.com/@handle?si=...` copies, stores the real channel metadata, chooses Direct/Rising by subscriber count, ingests recent non-Short uploads, and updates history. For normal “anti-dem,” add socialist/DSA-adjacent political channels (for example `@usdemsocialists`) to `anti-dem`, not AA anti-dem, unless the user explicitly says AA.

## Architecture in one breath

```
Browser (dropzone + dashboards)  ──uploads──▶  data/uploads/pending/<batch>/*.png
                                                        │
                            you (Claude) OCR + enrich ◀─┘
                                                        │
                    node scripts/tracker.mjs ingest ────▶  data/tracker_tabs/<slug>.md
                                                        │            + data/history/<slug>.jsonl
                                                        ▼
                                            dashboard re-renders on refresh
```

## Run it

```bash
node server.mjs      # → http://localhost:4317   (npm start also works)
```

No install step. Node ≥ 22 only.

## THE ENRICHMENT LOOP (what to do when the user says "process the pending batch")

1. **Find the batch.** List `data/uploads/pending/`. Each subfolder is one batch
   with a `manifest.json` (`slug` = which niche, `files` = the screenshots).
2. **OCR the screenshots.** Read each PNG with the Read tool. These are YouTube
   Studio *Audience* panels ("Other channels your audience watches" / "Videos your
   audience watched"). Extract, per item: **channel handle, video title, view
   count, and upload age** ("5 days ago", "2 weeks ago", …).
3. **Enrich — primary mode: NexLev MCP.** For each channel/video, prefer the
   Nexlev server (`mcp__e3a51df0-…-…`): resolve the handle, pull **channel
   analytics** (baseline) and the **native outlier score / VPH**. Useful tools:
   `channel_resolver`, `youtube_channel_about`, `youtube_channel_outliers`,
   `get_batch_channel_metrics_v2`, `find_outlier_faceless_channels`.
   Set `source: "nexlev"` on those rows.
4. **Enrich — fallback mode (MCP down/timeout/error): manual math.** Use the
   built-in framework (`lib/outlier.mjs`) — it's already wired into the CLI:
   - Estimated VPH = views ÷ hours-since-upload (age parsed from the screenshot)
   - Outlier Score = video VPH ÷ channel **Baseline VPH** (stored per competitor
     in the tab's Direct/Rising lists — set it once via NexLev, reused thereafter)
   - Tiers: >2× Minor · >3× Major · >5× Viral Anomaly. Set `source: "fallback"`.
5. **Write it back.** Build a batch JSON and run the ingest command (preferred —
   it dedupes, computes tiers, updates the registry, and logs history):

   ```bash
   node scripts/tracker.mjs ingest <slug> /tmp/batch.json
   ```

   `batch.json` shape:
   ```json
   {
     "date": "2026-07-15",
     "competitors": {
       "direct": [{ "handle": "@cnbc", "size": "3.2M", "baselineVph": 1500,
                    "channelId": "UC…", "avatar": "https://yt3…=s160…", "url": "https://www.youtube.com/@cnbc" }],
       "rising": [{ "handle": "@newmoney", "size": "85K", "baselineVph": 900 }]
     },
     "videos": [
       { "title": "…", "handle": "@cnbc", "videoId": "dQw4w9WgXcQ", "publishDate": "2026-07-10",
         "views": 82000, "age": "5 days ago", "source": "fallback" },
       { "title": "…", "handle": "@newmoney", "videoId": "…", "publishDate": "2026-07-13",
         "views": 240000, "vph": 4100, "outlier": 4.6, "source": "nexlev" }
     ]
   }
   ```
   Rows with `vph`/`outlier` present are stored verbatim (NexLev); rows without get
   fallback math using the channel's baseline. Always set `publishDate` when known
   so the 7/14/30-day horizon filter works. `age` (e.g. "5 days ago") is enough if
   you don't have the exact date — but a date is better.
   - **`videoId`** (per video) powers the thumbnail + click-through link — grab it
     from `youtube_channel_videos` / `youtube_search` by matching the title. Highly
     recommended; without it the row shows a ▶ placeholder and an unlinked title.
   - **`avatar` / `url` / `channelId`** (per competitor) populate the channel
     profile picture + link. These go to the `data/channels.json` sidecar (keyed by
     handle) via the ingest — the tab .md stays clean. `youtube_channel_about`
     returns the avatar array (use the largest, ~s160) and `channelHandle`.
   - Also set these for the **user's own channels** (the niche's Active list) so
     their avatar shows in the header. Resolve with `youtube_channel_about`.

   Growth columns (**Δ7d / Δ30d / Trend %**) are computed from the history log by
   comparing snapshots, so they read "new / —" on first ingest and fill in as the
   niche is re-ingested over time. Nothing to pass for them.
6. **Close the batch.** `node scripts/tracker.mjs finish-batch <batchId>` moves the
   screenshots to `data/uploads/processed/`.
7. **Report.** Tell the user how many videos/outliers landed and which crossed 3×. For New opportunity / up-and-coming picks, require **at least 10,000 absolute views** before a video shows up; high outlier on tiny view count stays in Other tracked / watchlist, not the main opportunity row.

## Baselines matter

The fallback outlier score is only as good as each channel's **Baseline VPH**.
The first time you enrich a channel, get its baseline from NexLev (typical VPH of
its recent uploads) and store it on the competitor line. After that, fallback math
alone will produce meaningful outlier scores even if the MCP is down.

## Never
- Never call the NexLev MCP "from the app" — it only exists inside Claude Code.
- Never hand-edit the `Content Performance Engine` table for bulk changes; use the
  CLI so tiers/registry/history stay consistent. (Small manual fixes are fine — the
  parser re-reads whatever's there.)
- `data/uploads/` and `data/history/` are managed data — don't delete without asking.
