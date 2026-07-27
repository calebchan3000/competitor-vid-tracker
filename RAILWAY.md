# Railway deployment

This project can run as a separate Railway service from a GitHub repo.

## Required service settings

- Start command: `npm start` (also set in `railway.json`)
- Healthcheck path: `/health`
- Node: 22 (`.node-version` + `package.json` engines)
- Public port: the app already uses `process.env.PORT || 4317`, so Railway's injected `PORT` works.

## Environment variables

Set these in Railway service variables; do not commit values:

- `YOUTUBE_API_KEY` — enables enrichment/track-all.
- `DATA_DIR` — optional but recommended if you attach a Railway volume. Use the volume mount path, e.g. `/data`.

## Persistence note

The tracker stores tabs/history/uploads as local files under `data/` by default. On Railway, writes to the container filesystem are ephemeral across redeploys. For a durable separate service, attach a Railway volume and set `DATA_DIR` to that mount path; otherwise treat the repo's checked-in `data/` as the seed state and expect runtime changes to reset on deploy.

## GitHub flow

1. Push this folder to the GitHub repo/branch you want Railway to deploy.
2. In Railway: New Project → Deploy from GitHub repo → pick this repo.
3. Create it as a separate service for now.
4. Add the environment variables above.
5. After deploy, open `/health`; it should return JSON like `{ "ok": true, "tabs": ..., "youtube": true }`.
