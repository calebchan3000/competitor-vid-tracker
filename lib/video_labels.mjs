// Lightweight labels for videos that are useful but should not be treated as a
// channel's core direction. These labels are intentionally informational only:
// they do not change scores, tiers, cadence, or ingestion eligibility.

const FOOD_TERMS = /\b(cooking|cook\b|food\b|recipe|kitchen|restaurant|chef|meal|dish|street food|fast food|snack|eating)\b/i;

const TOPIC_TERMS = {
  "anti-dem": /\b(democrat|democrats|biden|kamala|aoc|newsom|trump|maga|senate|congress|liberal|leftist|election|raskin|kennedy|mamdani|nyc mayor)\b/i,
  canada: /\b(canada|canadian|carney|trudeau|poilievre|ontario|alberta|ottawa|toronto|vancouver|ndp|liberal party|conservative party)\b/i,
  "new-york": /\b(new york|nyc|manhattan|brooklyn|queens|bronx|mamdani|cuomo|hochul|adams|new jersey|nj)\b/i,
  "british-news": /\b(uk|britain|british|england|london|labour|reform uk|starmer|farage|parliament|migrant|commons|bbc)\b/i,
  "china-destroying-the-west-niche": /\b(china|chinese|beijing|xi|tariff|west|america|trade war|economy|manufacturing|factory)\b/i,
  "home-depot-niche": /\b(home depot|diy|tools?|hardware|renovation|contractor|lumber|store|shopping)\b/i,
  "fashion-radar": /\b(fashion|style|luxury|celebrity|outfit|designer|brand|runway|dress|wearing)\b/i,
  "vintage-watches": /\b(watch|watches|rolex|omega|seiko|vintage|timepiece|collector|horology)\b/i,
  "sumerian-niche": /\b(sumerian|sumer|mesopotamia|ancient|civilization|babylon|akkad|tablet|archaeology)\b/i,
  "old-american-grandma-niche": /\b(social security|medicare|retirement|seniors?|elderly|older americans|pension|benefits)\b/i,
  "garden-niche": /\b(garden|gardening|plants?|vegetable|backyard|soil|compost|perennial|flowers?|seeds?)\b/i,
  "collapse-niche": /\b(collapse|prepper|survival|crisis|shortage|economic warning|disaster|societal|grid)\b/i,
};

export function splitLabels(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value || "")
    .split(/[,;]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function joinLabels(labels) {
  return splitLabels(labels).join(", ");
}

export function looksTopical({ slug, niche, title }) {
  const text = `${title || ""} ${niche || ""}`;
  const re = TOPIC_TERMS[slug];
  if (re) return re.test(text);
  const nicheWords = String(niche || slug || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !["niche", "news", "video", "channel"].includes(w));
  const lower = String(title || "").toLowerCase();
  return nicheWords.length ? nicheWords.some((w) => lower.includes(w)) : true;
}

export function labelVideoForDiscovery({ slug, niche, title, sourceWasSeed = false }) {
  const labels = [];
  const add = (label) => { if (label && !labels.includes(label)) labels.push(label); };
  if (FOOD_TERMS.test(title || "")) add("cooking/food one-off");
  // Search seed videos are already the topical reason the channel surfaced. For
  // later channel uploads, keep useful but unrelated experiments and label them
  // instead of silently treating them as the channel's core niche.
  if (!sourceWasSeed && !looksTopical({ slug, niche, title })) add("off-niche one-off");
  return labels;
}
