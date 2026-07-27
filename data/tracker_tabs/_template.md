---
slug: _template
niche: TEMPLATE — copy this schema
portfolio: Example Portfolio
created: 2026-07-15
updated: 2026-07-15
---

### TARGET NICHE: TEMPLATE — copy this schema

- **Active Tracking Channels:** @your-channel-a, @your-channel-b
- **Direct Competitors:**
  - @cnbc | 3.2M | 1500
  - @bloombergtv | 5.1M | 2100
- **Rising Competitors:**
  - @newmoney | 85K | 900
- **Ingested Vision Registry:** 2026-07-15 | 4 channels | 2 videos

#### Content Performance Engine

| Video Title | Handle | Publish Date | Views | VPH | Outlier | Tier | Source | First Seen |
|---|---|---|---|---|---|---|---|---|
| How the Fed just broke the bond market | @cnbc | 2026-07-11 | 82000 | 683 | 0.46 | Baseline | fallback | 2026-07-15 |
| The $4T mistake nobody is talking about | @newmoney | 2026-07-13 | 240000 | 4100 | 4.56 | Major Outlier | nexlev | 2026-07-15 |

<!--
  This file starts with "_" so the dashboard ignores it. It documents the schema.
  Fields:
    Handle  | Size | Baseline VPH   (Baseline VPH = the channel's typical VPH;
                                     the denominator for the outlier score)
    Content Performance Engine columns:
      Views    = raw view count at last ingest
      VPH      = views per hour since upload
      Outlier  = VPH / channel Baseline VPH
      Tier     = Baseline / Minor (>2x) / Major (>3x) / Viral Anomaly (>5x)
      Source   = nexlev (exact from MCP) | fallback (computed from screenshot)
  Don't edit this table to add real data — create a real niche on the dashboard,
  or use:  node scripts/tracker.mjs create-tab --niche "..." --portfolio "..."
-->
