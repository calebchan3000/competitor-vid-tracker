// Outlier + VPH math — the NexLev fallback framework (SYSTEM PROTOCOL §3, STEP 3).
//
// When the NexLev MCP returns exact VPH / native Outlier Score, we store those
// verbatim (source: "nexlev"). When it is unavailable, we compute estimates with
// the formulas below (source: "fallback"). Either way the dashboard treats the
// numbers identically.

// Thresholds — NexLev performance multiplier bands.
export const TIERS = [
  { min: 5.0, label: "Viral Anomaly", key: "viral" },
  { min: 3.0, label: "Major Outlier", key: "major" },
  { min: 2.0, label: "Minor Outlier", key: "minor" },
  { min: 0.0, label: "Baseline", key: "baseline" },
];

// The dashboard "highlight" threshold — spec §3 STEP 4: cross the >3.0x line.
export const HIGHLIGHT_THRESHOLD = 3.0;

const AGE_UNIT_HOURS = {
  minute: 1 / 60,
  hour: 1,
  day: 24,
  week: 24 * 7,
  month: 24 * 30, // YouTube uses ~30d months for "x months ago"
  year: 24 * 365,
};

/**
 * Parse a YouTube relative age string into total hours.
 * Handles "5 days ago", "3 weeks ago", "1 month ago", "Streamed 2 hours ago",
 * "Premiered 6 days ago", "an hour ago", "yesterday", "just now".
 * Returns null if it cannot be parsed.
 */
export function parseUploadAge(text) {
  if (!text) return null;
  const t = String(text).toLowerCase().trim();
  if (/just now|moments ago/.test(t)) return 0.05;
  if (/yesterday/.test(t)) return 24;
  // "an hour ago" / "a day ago" -> treat leading article as 1
  const normalized = t.replace(/\b(an?|one)\b/g, "1");
  const m = normalized.match(/(\d+(?:\.\d+)?)\s*(minute|hour|day|week|month|year)s?/);
  if (!m) return null;
  const value = parseFloat(m[1]);
  const unit = m[2];
  const factor = AGE_UNIT_HOURS[unit];
  if (!factor) return null;
  return value * factor;
}

/** Convert a relative age ("5 days ago") to a YYYY-MM-DD publish date. */
export function ageToISO(ageText, now = new Date()) {
  const hours = parseUploadAge(ageText);
  if (hours == null) return "";
  const d = new Date(now.getTime() - hours * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Estimated VPH = view count / total hours since upload. */
export function estimateVph(viewCount, ageHours) {
  if (!Number.isFinite(viewCount) || !Number.isFinite(ageHours) || ageHours <= 0) {
    return null;
  }
  return viewCount / ageHours;
}

/** Outlier Score = actual video VPH / channel baseline VPH. */
export function outlierScore(vph, baselineVph) {
  if (!Number.isFinite(vph) || !Number.isFinite(baselineVph) || baselineVph <= 0) {
    return null;
  }
  return vph / baselineVph;
}

/** Map an outlier score to a NexLev tier. */
export function tierForScore(score) {
  if (!Number.isFinite(score)) return { label: "Unscored", key: "unscored", min: null };
  for (const tier of TIERS) {
    if (score >= tier.min) return tier;
  }
  return TIERS[TIERS.length - 1];
}

export function isHighlighted(score) {
  return Number.isFinite(score) && score >= HIGHLIGHT_THRESHOLD;
}

/**
 * Convenience: given a screenshot-extracted video + a baseline, produce the full
 * enriched record via fallback math. `overrides` lets a NexLev result supply
 * exact vph / outlier and mark the source.
 */
export function enrichVideo({ viewCount, ageText, ageHours, baselineVph }, overrides = {}) {
  const hours = Number.isFinite(ageHours) ? ageHours : parseUploadAge(ageText);
  const vph = overrides.vph ?? estimateVph(viewCount, hours);
  const score = overrides.outlier ?? outlierScore(vph, baselineVph);
  const tier = tierForScore(score);
  return {
    viewCount,
    ageHours: hours,
    vph: vph == null ? null : Math.round(vph),
    outlier: score == null ? null : Math.round(score * 100) / 100,
    tier: tier.label,
    tierKey: tier.key,
    source: overrides.source ?? (overrides.vph != null ? "nexlev" : "fallback"),
  };
}
