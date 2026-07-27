// Central path config. Everything is relative to the project root so the tool is
// fully portable — copy the folder anywhere and it still runs.
//
// DATA_DIR can be overridden with the DATA_DIR env var. On the desktop it points
// at ./data; if you ever move this to Railway, set DATA_DIR=/data to hit the
// persistent volume the spec calls for.

import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");

export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, "data");

export const TABS_DIR = path.join(DATA_DIR, "tracker_tabs");
export const HISTORY_DIR = path.join(DATA_DIR, "history");
export const UPLOADS_PENDING = path.join(DATA_DIR, "uploads", "pending");
export const UPLOADS_PROCESSED = path.join(DATA_DIR, "uploads", "processed");
export const PUBLIC_DIR = path.join(ROOT, "public");
