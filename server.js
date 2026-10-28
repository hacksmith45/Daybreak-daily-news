import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
// Minimal .env loader (no dependencies).
try {
  for (const line of (await fs.readFile(path.join(root, '.env'), 'utf8')).split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const PORT = Number(process.env.PORT) || 3000;
const KEY = process.env.GNEWS_API_KEY;
const TTL = 5 * 60_000;

// Sector -> GNews category (when one exists) and keyword fallback for search.
const SECTORS = {
  technology: { category: 'technology', term: 'technology OR tech' },
  finance: { term: 'finance OR markets OR stocks' },
  crypto: { term: 'crypto OR bitcoin OR ethereum' },
  gaming: { term: '"video games" OR gaming' },
  music: { term: 'music' },
  sports: { category: 'sports', term: 'sports' },
  science: { category: 'science', term: 'science' },
  health: { category: 'health', term: 'health' },
  business: { category: 'business', term: 'business' },
  world: { category: 'world', term: 'world' },
};

const cache = new Map();
const hits = new Map();
const limited = (ip) => {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) { hits.set(ip, { n: 1, reset: now + 60_000 }); return false; }
  return ++h.n > 30;
};

const safeUrl = (u, httpsOnly = false) => {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || (!httpsOnly && x.protocol === 'http:') ? x.href : null;
  } catch { return null; }
};
const clip = (s, n) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

function normalize(a, label) {
  const url = safeUrl(a?.url);
  const title = clip(a?.title, 220);
  if (!url || !title) return null;
  return {
    title,
    summary: clip(a.description, 240),
    url,
    image: safeUrl(a.image, true),
    publisher: clip(a.source?.name, 80) || new URL(url).hostname.replace(/^www\./, ''),
    publishedAt: Number.isNaN(Date.parse(a.publishedAt)) ? null : new Date(a.publishedAt).toISOString(),
    sector: label,
  };
}

async function getNews(q, sector) {
  const cfg = SECTORS[sector];
  const params = new URLSearchParams({ lang: 'en', max: '12', apikey: KEY });
  let endpoint = 'top-headlines';
  if (q) {
    endpoint = 'search';
    params.set('q', cfg ? `(${q}) AND (${cfg.term})` : q);
    params.set('sortby', 'publishedAt');
  } else if (cfg?.category) {
    params.set('category', cfg.category);
  } else if (cfg) {
    endpoint = 'search';
    params.set('q', cfg.term);
    params.set('sortby', 'publishedAt');
  } else {
    params.set('category', 'general');
  }
  const res = await fetch(`https://gnews.io/api/v4/${endpoint}?${params}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const data = await res.json();
  const label = sector ? sector[0].toUpperCase() + sector.slice(1) : q ? 'Search' : 'Top stories';
  return (data.articles || []).map((a) => normalize(a, label)).filter(Boolean);
}

const json = (res, code, body, extra = {}) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(body));
};

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };

http.createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src https: data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/news') {
    if (req.method !== 'GET') return json(res, 405, { error: 'method' });
    if (!KEY) return json(res, 503, { error: 'missing_key' });
    if (limited(req.socket.remoteAddress)) return json(res, 429, { error: 'rate_limited' });
    const q = clip(url.searchParams.get('q'), 100).replace(/[^\p{L}\p{N}\s'’.,&-]/gu, '');
    const sector = (url.searchParams.get('sector') || '').toLowerCase();
    if (sector && !SECTORS[sector]) return json(res, 400, { error: 'bad_sector' });
    const k = `${sector}|${q.toLowerCase()}`;
    const hit = cache.get(k);
    if (hit && hit.t > Date.now()) return json(res, 200, { articles: hit.v });
    try {
      const v = await getNews(q, sector);
      if (cache.size > 200) cache.clear();
      cache.set(k, { v, t: Date.now() + TTL });
      return json(res, 200, { articles: v });
    } catch (e) {
      console.error(e.message);
      return json(res, 502, { error: 'upstream' });
    }
  }

  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const full = path.join(root, 'public', file);
  if (!full.startsWith(path.join(root, 'public') + path.sep) || !TYPES[path.extname(full)]) {
    res.writeHead(404); return res.end('Not found');
  }
  try {
    const buf = await fs.readFile(full);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] });
    res.end(buf);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(PORT, () => console.log(`Daybreak running at http://localhost:${PORT}${KEY ? '' : ' (GNEWS_API_KEY missing)'}`));
