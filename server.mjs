// Competitor Video Tracker — zero-dependency Node HTTP server. Fully local: no
// cloud LLM. Uploaded Studio screenshots are archived + shown as dated snapshots;
// competitors are enriched via the (free) YouTube Data API.
// Run:  node server.mjs   (Node >= 22)  then open http://localhost:4317

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

import { PUBLIC_DIR, UPLOADS_PENDING } from "./lib/paths.mjs";
import { listTabs, loadTab, createTab, addChannels } from "./lib/tabs.mjs";
import { renderHome, renderTab, layout } from "./lib/render.mjs";
import { upsertChannel } from "./lib/channels.mjs";
import { listSnapshots, snapshotImagePath } from "./lib/snapshots.mjs";
import { trackCompetitor, trackAllCompetitors } from "./lib/enrich.mjs";
import { ingestBatch } from "./lib/ingest.mjs";
import { listInspiration, setInspiration } from "./lib/inspiration.mjs";
import { slugify, normalizeHandle } from "./lib/util.mjs";
import { hasYouTube } from "./lib/config.mjs";

// If the user pastes a full channel URL, remember it so enrichment can resolve
// the avatar / channelId.
function rememberUrl(raw) {
  if (/^https?:\/\//i.test(String(raw || ""))) upsertChannel(raw, { url: String(raw).trim() });
}

const PORT = Number(process.env.PORT) || 4317;
const MAX_BODY = 60 * 1024 * 1024; // 60 MB — screenshots arrive as base64 JSON

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

function send(res, status, type, body, headers = {}) {
  res.writeHead(status, { "Content-Type": type, ...headers });
  res.end(body);
}
const html = (res, body, status = 200) => send(res, status, "text/html; charset=utf-8", body);
const json = (res, obj, status = 200) => send(res, status, "application/json; charset=utf-8", JSON.stringify(obj));

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("payload too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function serveStatic(res, urlPath) {
  const rel = urlPath.replace(/^\/public\//, "");
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) return send(res, 404, "text/plain", "not found");
  const ext = path.extname(filePath).toLowerCase();
  send(res, 200, CONTENT_TYPES[ext] || "application/octet-stream", fs.readFileSync(filePath));
}

// Serve an archived screenshot: /snap/<batchId>/<file>
function serveSnapshot(res, batchId, file) {
  const fp = snapshotImagePath(batchId, file);
  if (!fp) return send(res, 404, "text/plain", "not found");
  const ext = path.extname(fp).toLowerCase();
  send(res, 200, CONTENT_TYPES[ext] || "image/png", fs.readFileSync(fp), { "Cache-Control": "public, max-age=31536000, immutable" });
}

function batchId(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6);
  return `${stamp}-${rand}`;
}

function decodeDataUrl(dataUrl) {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl || "");
  if (!m) return null;
  const ext = m[1].toLowerCase() === "jpg" ? "jpeg" : m[1].toLowerCase();
  return { buffer: Buffer.from(m[2], "base64"), ext };
}

// Archive an uploaded batch of screenshots (no processing — the screenshots ARE
// the reference material).
function handleUpload(payload) {
  const slug = payload.slug ? slugify(payload.slug) : "";
  const sourceChannel = payload.sourceChannel ? normalizeHandle(payload.sourceChannel) : "";
  const images = Array.isArray(payload.images) ? payload.images : [];
  if (!images.length) throw new Error("no images");
  if (slug && sourceChannel) {
    rememberUrl(payload.sourceChannel);
    try { addChannels(slug, [sourceChannel]); } catch {}
  }
  const id = batchId();
  const dir = path.join(UPLOADS_PENDING, id);
  fs.mkdirSync(dir, { recursive: true });
  const saved = [];
  images.forEach((img, i) => {
    const decoded = decodeDataUrl(img.dataUrl);
    if (!decoded) return;
    const safeName = (img.name || `shot-${i + 1}`).replace(/[^\w.-]/g, "_").replace(/\.(png|jpe?g)$/i, "");
    const fname = `${String(i + 1).padStart(2, "0")}-${safeName}.${decoded.ext}`;
    fs.writeFileSync(path.join(dir, fname), decoded.buffer);
    saved.push(fname);
  });
  const manifest = { id, slug, sourceChannel, created: new Date().toISOString(), count: saved.length, files: saved, status: "saved" };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;

    if (req.method === "GET" && p === "/health") return json(res, { ok: true, tabs: listTabs().length, youtube: hasYouTube() });
    if (req.method === "GET" && p.startsWith("/public/")) return serveStatic(res, p);

    const snapMatch = p.match(/^\/snap\/([^/]+)\/(.+)$/);
    if (req.method === "GET" && snapMatch) return serveSnapshot(res, decodeURIComponent(snapMatch[1]), decodeURIComponent(snapMatch[2]));

    // --- API ---------------------------------------------------------------
    if (p === "/api/tabs" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const tab = createTab({ niche: body.niche, portfolio: body.portfolio || "", activeChannels: body.activeChannels || [] });
      return json(res, { ok: true, slug: tab.slug });
    }
    const chanMatch = p.match(/^\/api\/tabs\/([^/]+)\/channels$/);
    if (chanMatch && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const handles = body.channels || (body.handle ? [body.handle] : []);
      handles.forEach(rememberUrl);
      const { tab, added } = addChannels(decodeURIComponent(chanMatch[1]), handles);
      return json(res, { ok: true, added, activeChannels: tab.activeChannels });
    }
    const trackMatch = p.match(/^\/api\/tabs\/([^/]+)\/track$/);
    if (trackMatch && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      if (!body.handle) return json(res, { ok: false, error: "handle required" }, 400);
      const result = await trackCompetitor(decodeURIComponent(trackMatch[1]), body.handle);
      return json(res, { ok: true, ...result });
    }
    // Track every listed competitor in one pass (the "Track all competitors"
    // button). Body is ignored; the competitor list comes from the tab.
    const trackAllMatch = p.match(/^\/api\/tabs\/([^/]+)\/track-all$/);
    if (trackAllMatch && req.method === "POST") {
      const result = await trackAllCompetitors(decodeURIComponent(trackAllMatch[1]));
      return json(res, { ok: true, ...result });
    }
    const ingestMatch = p.match(/^\/api\/tabs\/([^/]+)\/ingest$/);
    if (ingestMatch && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const result = ingestBatch(decodeURIComponent(ingestMatch[1]), body);
      return json(res, { ok: true, ...result });
    }
    const inspirationMatch = p.match(/^\/api\/tabs\/([^/]+)\/inspiration$/);
    if (inspirationMatch && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const result = setInspiration(decodeURIComponent(inspirationMatch[1]), body.video || {}, body.selected !== false);
      return json(res, { ok: true, ...result });
    }
    if (p === "/api/upload" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const manifest = handleUpload(body);
      return json(res, { ok: true, batch: manifest.id, count: manifest.count });
    }

    // --- pages -------------------------------------------------------------
    if (req.method === "GET" && p === "/") {
      return html(res, renderHome({ tabs: listTabs() }));
    }
    const tabMatch = p.match(/^\/tab\/([^/]+)\/?$/);
    if (req.method === "GET" && tabMatch) {
      const slug = decodeURIComponent(tabMatch[1]);
      const tab = loadTab(slug);
      if (!tab) return html(res, layout("Not found", `<div class="panel panel--empty"><p>No niche “${slug}”. <a href="/">Back</a></p></div>`), 404);
      return html(res, renderTab(tab, { horizon: url.searchParams.get("h") || 7, snapshots: listSnapshots(slug), inspiration: listInspiration(slug).items }));
    }

    return html(res, layout("Not found", `<div class="panel panel--empty"><p>404 · <a href="/">Dashboard</a></p></div>`), 404);
  } catch (err) {
    console.error("[error]", err);
    return json(res, { ok: false, error: String(err.message || err) }, err.message === "payload too large" ? 413 : 400);
  }
});

server.listen(PORT, () => {
  console.log(`\n  📡 Competitor Video Tracker running`);
  console.log(`     → http://localhost:${PORT}`);
  console.log(`     mode: fully local  ·  enrichment: ${hasYouTube() ? "YouTube Data API ✓" : "⚠ add YOUTUBE_API_KEY to .env for avatars/videos/baselines"}\n`);
});
