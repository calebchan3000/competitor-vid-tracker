#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { UPLOADS_PENDING, DATA_DIR } from "../lib/paths.mjs";
import { saveDiscordAudienceBatch, imageAttachments } from "../lib/audience_intake.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const DEFAULT_CONFIG = path.join(root, "data", "discord_audience_intake.example.json");
const STATE_PATH = path.join(DATA_DIR, "discord_audience_intake_state.json");

function usage() {
  console.log(`Usage:
  node scripts/discord-audience-intake.mjs --config data/discord_audience_intake.json [--dry-run] [--limit 50]
  node scripts/discord-audience-intake.mjs --channel CHANNEL_ID --slug anti-dem --source-channel @williamreportsnews [--dry-run]

What it does:
  Downloads image attachments from configured Discord channel(s) and archives each VA message
  as a tracker audience snapshot under data/uploads/pending/<batch>/manifest.json.

VA message format:
  niche: anti-dem
  source: @williamreportsnews
  [attach Audience tab screenshots]

Options:
  --config PATH          JSON config path. Defaults to data/discord_audience_intake.example.json
  --channel ID           One-off channel id if no config is used
  --slug SLUG            Default niche slug for --channel one-off mode
  --source-channel @h    Default source channel for --channel one-off mode
  --token-env-file PATH  Read DISCORD_BOT_TOKEN from this .env file
  --limit N              Discord messages to scan per channel, default 50
  --since-message-id ID  Only process messages newer than this id for one-off mode
  --dry-run              Report what would be imported without downloading/saving
`);
}

function parseArgs(argv) {
  const out = { limit: 50, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      out[key] = argv[i + 1];
      i += 1;
    }
  }
  out.limit = Number(out.limit || 50);
  return out;
}

function readJsonIfExists(file) {
  if (!file || !fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readState() {
  return readJsonIfExists(STATE_PATH) || { channels: {} };
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function parseEnvFile(file) {
  if (!file || !fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^(?:export\s+)?([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return env;
}

function tokenFrom({ config, args }) {
  if (process.env.DISCORD_BOT_TOKEN) return process.env.DISCORD_BOT_TOKEN;
  const envFile = args.tokenEnvFile || config?.tokenEnvFile || path.join(process.env.HOME || "", ".hermes/profiles/yoppa/.env");
  const env = parseEnvFile(envFile);
  if (env.DISCORD_BOT_TOKEN) return env.DISCORD_BOT_TOKEN;
  throw new Error("DISCORD_BOT_TOKEN not found. Set env or tokenEnvFile in config.");
}

async function discordGet(token, apiPath, params = {}) {
  const url = new URL(`https://discord.com/api/v10${apiPath}`);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: `Bot ${token}`, "User-Agent": "HermesAudienceIntake" } });
  if (!res.ok) throw new Error(`Discord GET ${apiPath} failed: HTTP ${res.status} ${await res.text()}`.slice(0, 600));
  return res.json();
}

async function discordMessages(token, channelId, { limit, after }) {
  return discordGet(token, `/channels/${channelId}/messages`, { limit, after });
}

function channelsFrom({ config, args }) {
  if (args.channel) {
    return [{
      id: args.channel,
      name: args.channel,
      defaultSlug: args.slug,
      defaultSourceChannel: args.sourceChannel,
      sinceMessageId: args.sinceMessageId,
      keywordSlugs: config?.keywordSlugs || {},
      vaMap: config?.vaMap || {},
    }];
  }
  return config?.channels || [];
}

function snowflakeNewer(a, b) {
  if (!b) return true;
  try { return BigInt(a) > BigInt(b); } catch { return String(a) > String(b); }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { usage(); return; }
  const configPath = args.config || DEFAULT_CONFIG;
  const config = readJsonIfExists(configPath) || {};
  const channels = channelsFrom({ config, args });
  if (!channels.length) throw new Error("No channels configured. Pass --channel or create data/discord_audience_intake.json.");
  const token = tokenFrom({ config, args });
  const state = readState();
  const imported = [];
  const skipped = [];

  for (const channelConfig of channels) {
    const channelId = String(channelConfig.id || channelConfig.channelId || "");
    if (!channelId) continue;
    const lastSeen = args.sinceMessageId || channelConfig.sinceMessageId || state.channels[channelId]?.lastMessageId || "";
    const messages = await discordMessages(token, channelId, { limit: args.limit, after: lastSeen || undefined });
    const ordered = [...messages].sort((a, b) => snowflakeNewer(a.id, b.id) ? 1 : -1);
    let newest = lastSeen;
    for (const msg of ordered) {
      if (lastSeen && !snowflakeNewer(msg.id, lastSeen)) continue;
      if (snowflakeNewer(msg.id, newest)) newest = msg.id;
      const images = imageAttachments(msg.attachments || []);
      if (!images.length) { skipped.push({ messageId: msg.id, reason: "no images" }); continue; }
      if (args.dryRun) {
        imported.push({ dryRun: true, messageId: msg.id, channelId, images: images.length, author: msg.author?.username || msg.author?.id });
        continue;
      }
      const manifest = await saveDiscordAudienceBatch({ message: msg, uploadsPending: UPLOADS_PENDING, channelConfig });
      imported.push({ batch: manifest.id, slug: manifest.slug, sourceChannel: manifest.sourceChannel, count: manifest.count, messageId: msg.id });
    }
    if (!args.dryRun && newest) state.channels[channelId] = { ...(state.channels[channelId] || {}), lastMessageId: newest, lastCheckedAt: new Date().toISOString() };
  }
  if (!args.dryRun) writeState(state);
  console.log(JSON.stringify({ ok: true, dryRun: args.dryRun, imported, skippedCount: skipped.length }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
