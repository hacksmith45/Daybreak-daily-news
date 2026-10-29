# Daybreak-daily-news


Search-first news discovery across ten sectors. Zero npm dependencies; needs Node 18+.

## Run
1. Get a free API key at https://gnews.io
2. `cp .env.example .env` and set `GNEWS_API_KEY`
3. `npm start` then open http://localhost:3000

Without a key the site runs and shows a "News source not configured" state (no fake stories).

## How it works
- `server.js` proxies GNews, keeps the key server-side, validates sector and query, caches 5 minutes, rate-limits 30 requests/min/IP, and normalizes articles (http(s)-only links, https-only images).
- `public/` is plain HTML/CSS/ES modules. Articles open in new tabs with `rel="noopener noreferrer"`.
- Sectors without a GNews category (Finance, Crypto, Gaming, Music) use keyword search.

## Limits
GNews free tier: 100 requests/day, delayed articles. Behind a proxy, use the forwarded client IP for rate limiting. Run `npm run check` for syntax checks.
