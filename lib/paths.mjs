// Central path config. Everything is relative to the project root so the tool is
// fully portable — copy the folder anywhere and it still runs.
//
// DATA_DIR can be overridden with the DATA_DIR env var. On the desktop it points
// at ./data; if you ever move this to Railway, set DATA_DIR=/data to hit the
// persistent volume the spec calls for.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");
const SEED_DATA_DIR = path.join(ROOT, "data");

export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : SEED_DATA_DIR;

function directoryHasFiles(dir) {
  try {
    return fs.readdirSync(dir).some((name) => !name.startsWith("."));
  } catch {
    return false;
  }
}

function seedExternalDataDir() {
  if (!process.env.DATA_DIR) return;
  const tabsDir = path.join(DATA_DIR, "tracker_tabs");
  if (directoryHasFiles(tabsDir)) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.cpSync(SEED_DATA_DIR, DATA_DIR, { recursive: true, force: false, errorOnExist: false });
}

seedExternalDataDir();

export const TABS_DIR = path.join(DATA_DIR, "tracker_tabs");
export const HISTORY_DIR = path.join(DATA_DIR, "history");
export const UPLOADS_PENDING = path.join(DATA_DIR, "uploads", "pending");
export const UPLOADS_PROCESSED = path.join(DATA_DIR, "uploads", "processed");
export const PUBLIC_DIR = path.join(ROOT, "public");
