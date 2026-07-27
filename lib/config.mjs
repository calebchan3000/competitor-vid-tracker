// Central config, loaded from environment (+ optional .env file). This is the
// only module that reads process.env, so loading the .env here — at import time,
// before anything reads CONFIG — is enough for the whole app.
//
// No cloud LLM / OCR keys: the app runs fully locally. The only optional key is
// the (free) YouTube Data API key, used to enrich competitor channels with real
// avatars, subscriber counts, recent videos, and baseline VPH.

import { ROOT } from "./paths.mjs";
import path from "node:path";

try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  /* no .env file — rely on real environment variables */
}

export const CONFIG = {
  youtubeKey: process.env.YOUTUBE_API_KEY || "",
  // Soft cap on expensive YouTube "search" calls (100 quota units each) per
  // action, so resolving a channel can't drain the daily quota. Cached channels
  // don't count.
  ytSearchBudget: Number(process.env.YT_SEARCH_BUDGET) || 20,
};

export const hasYouTube = () => Boolean(CONFIG.youtubeKey);
