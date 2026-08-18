# Farmisarja Live

A compact bilingual live dashboard for a private Fantasy Premier League mini-league.

## Local development

Requirements: Node.js 22 or newer.

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

The current first-season preview uses representative data because 2026/27 Gameweek 1 picks and live player data are not available before the deadline. Set `VITE_FPL_LEAGUE_ID` in `.env.local` when the league ID is known. The local Vite server proxies official FPL API requests through `/fpl-api`.

## Commands

- `npm run dev` — local development server
- `npm run build` — type-check and create the static production bundle
- `npm run preview` — preview the production bundle

## Kit assets

The 20 approved transparent PNG masters are stored in `public/kits/generated`. Run `python scripts/optimize_kits.py` to rebuild the lossless 512 × 512 WebP files used by the dashboard in `public/kits/optimized`. Every shirt uses the same minimalist illustrated style and contains only the club crest and `FARMISARJA` branding.

## Deployment boundary

The official FPL API currently sets a same-origin cross-origin resource policy and does not allow a GitHub Pages frontend to fetch it directly. The future data process will poll FPL, normalize the response, and publish a static `data/dashboard.json` snapshot for Pages. Telegram tokens, SQLite, and scheduler state will remain outside the frontend.

See [docs/fpl-data-map.md](docs/fpl-data-map.md) for the verified endpoint and calculation map.

## FPL backend

The Cloudflare Worker in `worker/index.ts` exposes an allow-listed, cached API for league `200068`. It never stores credentials and accepts browser requests only from the GitHub Pages origin or local development origins.

```powershell
npm run worker:dev
npm run worker:check
```

Production deployment requires an authenticated Cloudflare session (`npx wrangler login`) and then `npx wrangler deploy`.
