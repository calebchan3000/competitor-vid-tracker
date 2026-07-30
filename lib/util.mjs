// Small shared helpers — no dependencies.

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(text) {
  if (text == null) return "";
  return String(text).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export function formatNumber(n) {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + "K";
  return String(Math.round(n));
}

export function formatInt(n) {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

// YYYY-MM-DD for "today" in local time. `now` is injectable for testing/determinism.
export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Whole days between an ISO date (YYYY-MM-DD) and today. Positive = in the past.
export function daysAgo(isoDate, now = new Date()) {
  if (!isoDate) return null;
  const then = new Date(isoDate + "T00:00:00");
  if (Number.isNaN(then.getTime())) return null;
  const ms = now.getTime() - then.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// Parse a YouTube count string into an integer: "924.3K"→924300, "1.2M"→1200000,
// "1,197,659"→1197659, "36.6K subscribers"→36600, "8.69K"→8690.
export function parseCount(text) {
  if (text == null) return null;
  if (typeof text === "number") return Math.round(text);
  const m = String(text).replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || "").toLowerCase()] || 1;
  return Math.round(n * mult);
}

export function videoUrl(id) {
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

export function thumbUrl(id) {
  // hqdefault is more reliable in embedded/table contexts than mqdefault and
  // avoids the tiny dark placeholder look when the browser is slow to paint.
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

// Build a channel URL from a stored URL, a channelId (UC…), or a handle.
export function channelUrl(handleOrId, storedUrl) {
  if (storedUrl) return storedUrl;
  if (!handleOrId) return null;
  const h = String(handleOrId).trim();
  if (/^UC[\w-]{20,}$/.test(h)) return `https://www.youtube.com/channel/${h}`;
  // display-name "handles" with spaces aren't real handles → fall back to search
  const at = h.startsWith("@") ? h : "@" + h;
  if (/\s/.test(at)) return `https://www.youtube.com/results?search_query=${encodeURIComponent(h.replace(/^@/, ""))}`;
  return `https://www.youtube.com/${at}`;
}

export function normalizeHandle(handle) {
  if (!handle) return "";
  let h = String(handle).trim();
  if (!h) return "";
  // Strip a leading YouTube URL if someone pastes a channel link. Accept both
  // full shared URLs and scheme-less mobile/browser copies like
  // `youtube.com/@handle?si=...`.
  h = h.replace(/^(https?:\/\/)?(www\.)?youtube\.com\//i, "");
  // Drop URL noise from shared links (`?si=...`) and normalize channel URLs.
  h = h.split(/[?#]/)[0].replace(/^channel\//i, "channel/");
  if (!h.startsWith("@") && !h.startsWith("UC") && !/^channel\//i.test(h)) h = "@" + h;
  return h;
}
