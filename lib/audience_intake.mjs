import fs from "node:fs";
import path from "node:path";

import { slugify, normalizeHandle } from "./util.mjs";

const IMAGE_EXT_RE = /\.(png|jpe?g|webp)$/i;
const IMAGE_TYPE_RE = /^image\/(png|jpe?g|webp)$/i;

function pad(n) {
  return String(n).padStart(2, "0");
}

function sanitizeStem(name, fallback) {
  const base = path.basename(String(name || fallback));
  const stem = base.replace(/\.(png|jpe?g|webp)$/i, "");
  return (stem || fallback).replace(/[^\w.-]/g, "_").slice(0, 80) || fallback;
}

function extensionForAttachment(attachment) {
  const fileExt = path.extname(String(attachment.filename || "")).toLowerCase();
  if (/^\.(png|webp)$/i.test(fileExt)) return fileExt.slice(1).toLowerCase();
  if (/^\.jpe?g$/i.test(fileExt)) return "jpeg";
  const ct = String(attachment.content_type || attachment.contentType || "").toLowerCase();
  if (ct === "image/png") return "png";
  if (ct === "image/webp") return "webp";
  if (ct === "image/jpeg" || ct === "image/jpg") return "jpeg";
  return "png";
}

function batchId(now = new Date(), randomSuffix = Math.random().toString(36).slice(2, 6)) {
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${stamp}-discord-${randomSuffix}`;
}

export function imageAttachments(attachments = []) {
  return attachments.filter((a) => {
    const type = String(a.content_type || a.contentType || "");
    const filename = String(a.filename || "");
    return IMAGE_TYPE_RE.test(type) || IMAGE_EXT_RE.test(filename);
  });
}

function directive(content, names) {
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const re = new RegExp(`(?:^|\\n)\\s*(?:${escaped})\\s*[:=\\-]\\s*([^\\n]+)`, "i");
  const match = re.exec(String(content || ""));
  return match ? match[1].trim() : "";
}

function stripDiscordMention(value) {
  return String(value || "").replace(/<[@#&!]*([0-9]+)>/g, "$1").trim();
}

export function inferIntakeFields({ message, channelConfig = {} }) {
  const content = String(message?.content || "");
  const authorId = String(message?.author?.id || "");
  const authorUsername = String(message?.author?.username || message?.author?.global_name || "");
  const authorConfig = channelConfig.vaMap?.[authorId] || channelConfig.vaMap?.[authorUsername] || {};

  const rawNiche = directive(content, ["niche", "tab", "slug", "bucket"]);
  let slug = "";
  if (rawNiche) {
    const key = rawNiche.toLowerCase().trim();
    slug = channelConfig.keywordSlugs?.[key] || slugify(rawNiche);
  }
  if (!slug && channelConfig.keywordSlugs) {
    const lower = content.toLowerCase();
    const matches = Object.entries(channelConfig.keywordSlugs)
      .filter(([keyword]) => lower.includes(String(keyword).toLowerCase()))
      .sort((a, b) => String(b[0]).length - String(a[0]).length);
    if (matches.length) slug = matches[0][1];
  }
  if (!slug) slug = authorConfig.defaultSlug || channelConfig.defaultSlug || channelConfig.slug || "";

  const rawSource = directive(content, ["source", "channel", "from", "our channel"]);
  const sourceChannel = rawSource
    ? normalizeHandle(stripDiscordMention(rawSource).split(/\s+/)[0])
    : normalizeHandle(authorConfig.defaultSourceChannel || channelConfig.defaultSourceChannel || channelConfig.sourceChannel || "");

  return {
    slug: slug ? slugify(slug) : "",
    sourceChannel,
    va: authorConfig.name || authorUsername || authorId,
    rawNiche,
    rawSource,
  };
}

async function defaultDownloadAttachment(attachment) {
  const url = attachment.url || attachment.proxy_url || attachment.proxyUrl;
  if (!url) throw new Error(`attachment ${attachment.id || attachment.filename || "?"} has no URL`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed for ${attachment.filename || attachment.id}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function saveDiscordAudienceBatch({
  message,
  uploadsPending,
  channelConfig = {},
  now = new Date(),
  randomSuffix,
  downloadAttachment = defaultDownloadAttachment,
} = {}) {
  if (!message) throw new Error("message required");
  if (!uploadsPending) throw new Error("uploadsPending required");
  const attachments = imageAttachments(message.attachments || []);
  if (!attachments.length) throw new Error("no image attachments");

  const inferred = inferIntakeFields({ message, channelConfig });
  if (!inferred.slug) throw new Error("could not infer niche slug");
  if (!inferred.sourceChannel && channelConfig.requireSourceChannel !== false) throw new Error("could not infer source channel");

  const id = batchId(now, randomSuffix);
  const dir = path.join(uploadsPending, id);
  fs.mkdirSync(dir, { recursive: true });

  const saved = [];
  for (let i = 0; i < attachments.length; i += 1) {
    const attachment = attachments[i];
    const ext = extensionForAttachment(attachment);
    const fname = `${pad(i + 1)}-${sanitizeStem(attachment.filename, `discord-${attachment.id || i + 1}`)}.${ext}`;
    const bytes = await downloadAttachment(attachment);
    fs.writeFileSync(path.join(dir, fname), bytes);
    saved.push(fname);
  }

  const manifest = {
    id,
    slug: inferred.slug,
    sourceChannel: inferred.sourceChannel,
    created: now.toISOString(),
    count: saved.length,
    files: saved,
    status: "saved",
    intake: "discord",
    discord: {
      messageId: String(message.id || ""),
      channelId: String(message.channel_id || message.channelId || ""),
      guildId: String(message.guild_id || message.guildId || ""),
      timestamp: message.timestamp || "",
      authorId: String(message.author?.id || ""),
      authorUsername: String(message.author?.username || message.author?.global_name || inferred.va || ""),
      attachmentIds: attachments.map((a) => String(a.id || "")),
    },
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}
